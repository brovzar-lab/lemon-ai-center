import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../../firebase'
import type { InvestorStage, ScriptStage } from '@shared/types'

const SEED_MODEL = 'claude-sonnet-4-6'

/**
 * First-run seeding: extract investors, slate scripts, hard deadlines,
 * and AI ventures from the Obsidian vault wiki. Idempotent — any
 * collection that already has data is left untouched.
 */
export async function runSeedFromVault(uid: string): Promise<void> {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    console.log('[seed] No vault available — skipping')
    return
  }

  const [investorsSnap, scriptsSnap, deadlinesSnap, venturesSnap] = await Promise.all([
    db.collection(`users/${uid}/investors`).limit(1).get(),
    db.collection(`users/${uid}/scripts`).limit(1).get(),
    db.collection(`users/${uid}/deadlines`).limit(1).get(),
    db.collection(`users/${uid}/ventures`).limit(1).get(),
  ])
  const need = {
    investors: investorsSnap.empty,
    scripts: scriptsSnap.empty,
    deadlines: deadlinesSnap.empty,
    ventures: venturesSnap.empty,
  }
  if (!need.investors && !need.scripts && !need.deadlines && !need.ventures) {
    console.log('[seed] All trackers already populated — nothing to do')
    return
  }

  const read = (rel: string, cap = 5000): string => {
    try {
      return fs.readFileSync(path.join(vaultPath, rel), 'utf-8').slice(0, cap)
    } catch {
      return ''
    }
  }
  const listDir = (rel: string): string[] => {
    try {
      return fs.readdirSync(path.join(vaultPath, rel)).filter((f) => f.endsWith('.md'))
    } catch {
      return []
    }
  }

  const projectFiles = listDir('wiki/projects')
  const dealFiles = listDir('wiki/deals')

  const sources: string[] = [
    `=== wiki/deals/lemon-trust-i.md ===\n${read('wiki/deals/lemon-trust-i.md')}`,
    `=== wiki/projects/lemon-trust-i-film-slate.md ===\n${read('wiki/projects/lemon-trust-i-film-slate.md')}`,
    `=== wiki/personal/overview.md ===\n${read('wiki/personal/overview.md', 3000)}`,
    `=== Available project note files (wiki/projects/) ===\n${projectFiles.join('\n')}`,
    ...dealFiles
      .filter((f) => !f.startsWith('_'))
      .slice(0, 12)
      .map((f) => `=== wiki/deals/${f} ===\n${read(`wiki/deals/${f}`, 2500)}`),
  ]

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: SEED_MODEL,
    max_tokens: 4000,
    system: `You are seeding a CEO dashboard from Billy Rovzar's knowledge vault. Extract ONLY facts present in the notes — never invent names, amounts, or dates.

Extract:
1. "fundTargetMXN": the Lemon Trust I target in MXN (number), if stated.
2. "investors": people/orgs in the Lemon Trust I capital raise. stage one of contacted|interested|docs|committed|passed. amountMXN as a number when stated.
3. "scripts": screenplays Billy is PERSONALLY writing for the slate. stage one of idea|outline|draft|polish|delivered (best inference). vaultPath must be chosen from the available project note files list, as "wiki/projects/<file>", or omitted if no match.
4. "deadlines": HARD dated obligations (funding deadlines, delivery dates, option expirations) with ISO dates. severity "hard" for contractual, "soft" otherwise.
5. "ventures": Billy's personal AI tools/ventures (e.g. CARPETIFY, Fractal Story Room, Topsheet AI) with stage and next action if stated.

Respond ONLY with JSON (no fencing):
{
  "fundTargetMXN": 300000000,
  "investors": [{ "name": "...", "org": "...", "stage": "...", "amountMXN": 0, "nextAction": "..." }],
  "scripts": [{ "title": "...", "slatePosition": 1, "stage": "...", "draftNumber": 1, "vaultPath": "wiki/projects/x.md", "targetDate": "2026-12-31" }],
  "deadlines": [{ "title": "...", "date": "2027-12-31", "severity": "hard", "linkedEntity": "..." }],
  "ventures": [{ "name": "...", "stage": "...", "nextAction": "..." }]
}
Omit fields you cannot ground in the notes.`,
    messages: [{ role: 'user', content: sources.join('\n\n') }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  let parsed: any = {}
  try {
    parsed = JSON.parse(
      text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim(),
    )
  } catch {
    throw new Error(`Seed extraction returned unparseable JSON: ${text.slice(0, 150)}`)
  }

  const batch = db.batch()
  const now = FieldValue.serverTimestamp()
  const stats = { investors: 0, scripts: 0, deadlines: 0, ventures: 0 }
  const validInvestorStages: InvestorStage[] = ['contacted', 'interested', 'docs', 'committed', 'passed']
  const validScriptStages: ScriptStage[] = ['idea', 'outline', 'draft', 'polish', 'delivered']

  if (need.investors && Array.isArray(parsed.investors)) {
    for (const i of parsed.investors) {
      if (!i?.name) continue
      const ref = db.collection(`users/${uid}/investors`).doc()
      batch.set(ref, {
        name: String(i.name),
        org: i.org ? String(i.org) : null,
        stage: validInvestorStages.includes(i.stage) ? i.stage : 'contacted',
        amountMXN: typeof i.amountMXN === 'number' && i.amountMXN > 0 ? i.amountMXN : null,
        nextAction: i.nextAction ? String(i.nextAction) : null,
        lastTouch: null,
        source: 'auto',
        created_at: now,
        updated_at: now,
      })
      stats.investors++
    }
  }

  if (need.scripts && Array.isArray(parsed.scripts)) {
    let pos = 1
    for (const s of parsed.scripts) {
      if (!s?.title) continue
      // Resolve lastTouchedAt from the vault note's mtime when we have a path
      let lastTouchedAt: string | null = null
      if (s.vaultPath) {
        try {
          lastTouchedAt = fs.statSync(path.join(vaultPath, s.vaultPath)).mtime.toISOString()
        } catch {
          s.vaultPath = null
        }
      }
      const ref = db.collection(`users/${uid}/scripts`).doc()
      batch.set(ref, {
        title: String(s.title),
        slatePosition: typeof s.slatePosition === 'number' ? s.slatePosition : pos,
        stage: validScriptStages.includes(s.stage) ? s.stage : 'idea',
        draftNumber: typeof s.draftNumber === 'number' ? s.draftNumber : null,
        vaultPath: s.vaultPath ? String(s.vaultPath) : null,
        targetDate: s.targetDate ? String(s.targetDate) : null,
        lastTouchedAt,
        source: 'auto',
        created_at: now,
        updated_at: now,
      })
      stats.scripts++
      pos++
    }
  }

  if (need.deadlines && Array.isArray(parsed.deadlines)) {
    for (const d of parsed.deadlines) {
      if (!d?.title || !d?.date || !/^\d{4}-\d{2}-\d{2}/.test(String(d.date))) continue
      const ref = db.collection(`users/${uid}/deadlines`).doc()
      batch.set(ref, {
        title: String(d.title),
        date: String(d.date).slice(0, 10),
        severity: d.severity === 'hard' ? 'hard' : 'soft',
        linkedEntity: d.linkedEntity ? String(d.linkedEntity) : null,
        source: 'auto',
      })
      stats.deadlines++
    }
  }

  if (need.ventures && Array.isArray(parsed.ventures)) {
    for (const v of parsed.ventures) {
      if (!v?.name) continue
      const ref = db.collection(`users/${uid}/ventures`).doc()
      batch.set(ref, {
        name: String(v.name),
        stage: v.stage ? String(v.stage) : null,
        nextAction: v.nextAction ? String(v.nextAction) : null,
        source: 'auto',
        created_at: now,
        updated_at: now,
      })
      stats.ventures++
    }
  }

  // Fund target singleton
  const fundSnap = await db.doc(`users/${uid}/state/fund`).get()
  if (!fundSnap.exists) {
    batch.set(db.doc(`users/${uid}/state/fund`), {
      targetMXN:
        typeof parsed.fundTargetMXN === 'number' && parsed.fundTargetMXN > 0
          ? parsed.fundTargetMXN
          : 300_000_000,
      updated_at: new Date().toISOString(),
    })
  }

  await batch.commit()
  console.log(
    `[seed] Seeded from vault: ${stats.investors} investors, ${stats.scripts} scripts, ${stats.deadlines} deadlines, ${stats.ventures} ventures`,
  )
}
