import type Anthropic from '@anthropic-ai/sdk'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../firebase'
import { readTrackers, readSlips } from './data'
import { committedMXN } from './ranker'
import { daysBetween } from './constants'

/**
 * Tools the Billy Drawer chat can call to ACT on the trackers.
 * Autonomy boundary (spec §2): internal reorganization is allowed
 * directly; outward-facing actions (email, calendar) are NOT tools here —
 * they queue as AIActions elsewhere.
 */

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_investor',
    description:
      'Update (or create) an investor in the Lemon Trust I pipeline. Match by name, case-insensitive. Only pass fields that change.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Investor or org name' },
        stage: { type: 'string', enum: ['contacted', 'interested', 'docs', 'committed', 'passed'] },
        amountMXN: { type: 'number', description: 'Amount in Mexican pesos, e.g. 50000000 for 50M' },
        nextAction: { type: 'string' },
        touchedToday: { type: 'boolean', description: 'Set true to mark last contact as today' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_script',
    description:
      "Update one of Billy's slate screenplays (or add a new one). Match by title, case-insensitive.",
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        stage: { type: 'string', enum: ['idea', 'outline', 'draft', 'polish', 'delivered'] },
        draftNumber: { type: 'number' },
        targetDate: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        touchedToday: { type: 'boolean', description: 'Set true if Billy worked on it today' },
        notes: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'add_deadline',
    description: 'Add a hard or soft deadline to the radar.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        severity: { type: 'string', enum: ['hard', 'soft'] },
        linkedEntity: { type: 'string' },
      },
      required: ['title', 'date', 'severity'],
    },
  },
  {
    name: 'update_deal',
    description: 'Update an existing deal (match by name, case-insensitive) — status, next action, or value.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        status: { type: 'string', enum: ['active', 'pending_signature', 'in_review', 'closed'] },
        next_action: { type: 'string' },
        value: { type: 'string', description: 'Human-formatted, e.g. "$7.5M"' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_delegation',
    description: 'Record that Billy delegated a task to someone.',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string' },
        task: { type: 'string' },
        expected_by: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        context: { type: 'string' },
      },
      required: ['person', 'task'],
    },
  },
  {
    name: 'complete_delegation',
    description: 'Mark a pending delegation completed. Match by person and/or task keywords.',
    input_schema: {
      type: 'object',
      properties: {
        person: { type: 'string' },
        task: { type: 'string', description: 'Keywords from the task' },
      },
      required: ['task'],
    },
  },
  {
    name: 'update_venture',
    description: "Update (or add) one of Billy's personal AI ventures (CARPETIFY, Fractal Story Room, Topsheet AI, …).",
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        stage: { type: 'string' },
        nextAction: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_watchlist',
    description: "Add or remove a ticker on Billy's personal stock watchlist.",
    input_schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        action: { type: 'string', enum: ['add', 'remove'] },
        shares: { type: 'number' },
        costBasisUSD: { type: 'number' },
      },
      required: ['ticker', 'action'],
    },
  },
  {
    name: 'add_memory',
    description: 'Save a persistent fact the AI should remember about how Billy works or his world.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
]

type ToolInput = Record<string, any>

async function findByField(
  uid: string,
  collectionName: string,
  field: string,
  needle: string,
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const snap = await db.collection(`users/${uid}/${collectionName}`).get()
  const lower = needle.toLowerCase()
  // Exact match first, then contains
  const exact = snap.docs.find((d) => String(d.data()[field] ?? '').toLowerCase() === lower)
  if (exact) return exact
  return (
    snap.docs.find((d) => String(d.data()[field] ?? '').toLowerCase().includes(lower)) ??
    snap.docs.find((d) => lower.includes(String(d.data()[field] ?? '').toLowerCase()) && String(d.data()[field] ?? '').length > 3) ??
    null
  )
}

/** Execute one tool call; returns a short human-readable result for the model. */
export async function executeChatTool(
  uid: string,
  name: string,
  input: ToolInput,
): Promise<string> {
  const now = FieldValue.serverTimestamp()
  const today = new Date().toISOString()

  switch (name) {
    case 'update_investor': {
      const doc = await findByField(uid, 'investors', 'name', input.name)
      const patch: Record<string, unknown> = { updated_at: now }
      if (input.stage) patch.stage = input.stage
      if (typeof input.amountMXN === 'number') patch.amountMXN = input.amountMXN
      if (input.nextAction) patch.nextAction = input.nextAction
      if (input.touchedToday) patch.lastTouch = today
      if (doc) {
        await doc.ref.update(patch)
        return `Updated investor "${doc.data().name}": ${JSON.stringify({ ...input, name: undefined })}`
      }
      await db.collection(`users/${uid}/investors`).add({
        name: input.name,
        stage: input.stage ?? 'contacted',
        amountMXN: input.amountMXN ?? null,
        nextAction: input.nextAction ?? null,
        lastTouch: input.touchedToday ? today : null,
        source: 'auto',
        created_at: now,
        updated_at: now,
      })
      return `Created investor "${input.name}" (stage ${input.stage ?? 'contacted'})`
    }

    case 'update_script': {
      const doc = await findByField(uid, 'scripts', 'title', input.title)
      const patch: Record<string, unknown> = { updated_at: now }
      if (input.stage) patch.stage = input.stage
      if (typeof input.draftNumber === 'number') patch.draftNumber = input.draftNumber
      if (input.targetDate) patch.targetDate = input.targetDate
      if (input.notes) patch.notes = input.notes
      if (input.touchedToday) patch.lastTouchedAt = today
      if (doc) {
        await doc.ref.update(patch)
        return `Updated script "${doc.data().title}"`
      }
      await db.collection(`users/${uid}/scripts`).add({
        title: input.title,
        stage: input.stage ?? 'idea',
        draftNumber: input.draftNumber ?? null,
        targetDate: input.targetDate ?? null,
        lastTouchedAt: input.touchedToday ? today : null,
        notes: input.notes ?? null,
        source: 'auto',
        created_at: now,
        updated_at: now,
      })
      return `Added script "${input.title}"`
    }

    case 'add_deadline': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))) {
        return `Rejected: date must be YYYY-MM-DD, got "${input.date}"`
      }
      await db.collection(`users/${uid}/deadlines`).add({
        title: input.title,
        date: input.date,
        severity: input.severity === 'hard' ? 'hard' : 'soft',
        linkedEntity: input.linkedEntity ?? null,
        source: 'auto',
      })
      return `Deadline added: ${input.title} on ${input.date} (${input.severity})`
    }

    case 'update_deal': {
      const doc = await findByField(uid, 'deals', 'name', input.name)
      if (!doc) return `No deal found matching "${input.name}". Nothing changed.`
      const patch: Record<string, unknown> = { updated_at: now }
      if (input.status) patch.status = input.status
      if (input.next_action) patch.next_action = input.next_action
      if (input.value) patch.value = input.value
      await doc.ref.update(patch)
      return `Updated deal "${doc.data().name}"`
    }

    case 'add_delegation': {
      await db.collection(`users/${uid}/delegations`).add({
        person: input.person,
        task: input.task,
        context: input.context ?? null,
        expected_by: input.expected_by ?? null,
        status: 'pending',
        source: 'auto',
        created_at: now,
      })
      return `Delegation recorded: ${input.person} — ${input.task}`
    }

    case 'complete_delegation': {
      const snap = await db
        .collection(`users/${uid}/delegations`)
        .where('status', '==', 'pending')
        .get()
      const taskLower = String(input.task).toLowerCase()
      const personLower = input.person ? String(input.person).toLowerCase() : null
      const match = snap.docs.find((d) => {
        const data = d.data()
        const taskHit = String(data.task ?? '').toLowerCase().includes(taskLower)
        const personHit = !personLower || String(data.person ?? '').toLowerCase().includes(personLower)
        return taskHit && personHit
      })
      if (!match) return `No pending delegation matched "${input.task}". Nothing changed.`
      await match.ref.update({ status: 'completed', completed_date: today })
      return `Marked completed: ${match.data().person} — ${match.data().task}`
    }

    case 'update_venture': {
      const doc = await findByField(uid, 'ventures', 'name', input.name)
      const patch: Record<string, unknown> = { updated_at: now, lastTouch: today }
      if (input.stage) patch.stage = input.stage
      if (input.nextAction) patch.nextAction = input.nextAction
      if (input.notes) patch.notes = input.notes
      if (doc) {
        await doc.ref.update(patch)
        return `Updated venture "${doc.data().name}"`
      }
      await db.collection(`users/${uid}/ventures`).add({
        name: input.name,
        stage: input.stage ?? null,
        nextAction: input.nextAction ?? null,
        notes: input.notes ?? null,
        source: 'auto',
        created_at: now,
        updated_at: now,
      })
      return `Added venture "${input.name}"`
    }

    case 'update_watchlist': {
      const id = String(input.ticker).toLowerCase()
      const ref = db.doc(`users/${uid}/watchlist/${id}`)
      if (input.action === 'remove') {
        await ref.delete()
        return `Removed ${String(input.ticker).toUpperCase()} from watchlist`
      }
      await ref.set(
        {
          ticker: String(input.ticker).toUpperCase(),
          shares: typeof input.shares === 'number' ? input.shares : null,
          costBasisUSD: typeof input.costBasisUSD === 'number' ? input.costBasisUSD : null,
        },
        { merge: true },
      )
      return `Added ${String(input.ticker).toUpperCase()} to watchlist`
    }

    case 'add_memory': {
      await db.collection(`users/${uid}/memories`).add({
        text: input.text,
        source: 'auto',
        active: true,
        learned_at: now,
      })
      return `Memory saved: "${input.text}"`
    }

    default:
      return `Unknown tool: ${name}`
  }
}

/**
 * Compact live-state block injected into the chat system prompt so the
 * drawer already knows everything without being told.
 */
export async function buildChatStateBlock(uid: string): Promise<string> {
  try {
    const [t, slips] = await Promise.all([readTrackers(uid), readSlips(uid)])
    const now = new Date()
    const target = t.fundState?.targetMXN ?? 300_000_000
    const committed = committedMXN(t.investors)
    const lines: string[] = [
      `FUND: ${Math.round(committed / 1e6)}M/${Math.round(target / 1e6)}M MXN (${target ? Math.round((committed / target) * 100) : 0}%)`,
      ...t.investors
        .filter((i) => i.stage !== 'passed')
        .slice(0, 10)
        .map((i) => `INVESTOR: ${i.name} — ${i.stage}${i.amountMXN ? ` ${Math.round(i.amountMXN / 1e6)}M` : ''}${i.lastTouch ? ` (touch ${daysBetween(i.lastTouch, now)}d ago)` : ''}`),
      ...t.scripts
        .slice(0, 10)
        .map((s) => `SCRIPT: ${s.title} — ${s.stage}${s.draftNumber ? ` ${s.draftNumber}` : ''}${s.lastTouchedAt ? ` (touched ${daysBetween(s.lastTouchedAt, now)}d ago)` : ''}`),
      ...t.deadlines
        .slice(0, 6)
        .map((d) => `DEADLINE: ${d.title} — ${d.date} [${d.severity}]`),
      ...slips.slice(0, 8).map((s) => `SLIP[${s.severity}]: ${s.summary}`),
      ...t.delegations
        .filter((d) => d.status === 'pending')
        .slice(0, 8)
        .map((d) => `WAITING ON: ${d.person} — ${d.task}${d.expected_by ? ` (by ${d.expected_by})` : ''}`),
      t.burnout ? `BURNOUT: ${t.burnout.score}/100` : '',
      ...t.ventures.slice(0, 5).map((v) => `VENTURE: ${v.name}${v.stage ? ` — ${v.stage}` : ''}`),
    ]
    return lines.filter(Boolean).join('\n')
  } catch (err) {
    console.warn('[chat] State block failed:', (err as Error).message)
    return '(live state unavailable)'
  }
}
