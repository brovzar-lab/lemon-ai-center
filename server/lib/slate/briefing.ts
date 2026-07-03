import { z } from 'zod'
import { db } from '../firebase'
import { getAnthropicClient } from '../anthropic'
import { CLAUDE_MODELS } from '@shared/models'
import { todayISO, daysBetween } from '../engine/constants'
import { assessStaleness } from '@shared/slateStaleness'
import { listSlateProjects } from './index'
import { listSkillRuns } from './skills'
import type {
  SlateBriefing,
  SlateBriefingStatus,
  SlateBriefingDeadline,
  SlateBriefingMovement,
  SlateBriefingNudge,
  SlateBriefingPaused,
  SlateBriefingSnapshotEntry,
  SlateBriefingStale,
  SlateBriefingWaiting,
  SlateProject,
  SlateSkillRun,
} from '@shared/types'

/**
 * The morning briefing (spec §5): the five sections rendered when Billy
 * opens the module — What Moved, Going Stale, Waiting On, Suggested
 * Nudges, Today's Pushes. Generated fresh once per day and cached in
 * Firestore `slate_briefing/<mexico-city-date>`.
 *
 * The deterministic sections (movement diff, staleness, waiting, nudge
 * candidates, deadlines) are pure date/state math — they always stand on
 * their own. The brain (CLAUDE_MODELS.smart) adds only the judgment layer
 * on top: the one-line headline and 1–3 concrete pushes. Generation runs
 * in the background and the UI polls, so the module never blocks on the
 * brain (quality bar). A brain failure degrades to a deterministic
 * headline — the briefing is still delivered.
 */

const COLLECTION = 'slate_briefing'
const PAUSED_RESURFACE_DAYS = 30 // "still paused on purpose?" cadence (spec §5)
const DEADLINE_HORIZON_DAYS = 45 // how far out a deadline is worth surfacing
const GENERATING_STALE_MS = 3 * 60_000 // a generating doc older than this is presumed dead

// ── Deterministic scaffold ────────────────────────────────────────────────

function draftVersionOf(p: SlateProject): number | null {
  return p.current_draft?.version ?? null
}

export function snapshotProjects(projects: SlateProject[]): Record<string, SlateBriefingSnapshotEntry> {
  const snap: Record<string, SlateBriefingSnapshotEntry> = {}
  for (const p of projects) {
    snap[p.slug] = {
      stage: p.stage,
      draftVersion: draftVersionOf(p),
      lastTouched: p.last_touched ?? null,
      status: p.status,
    }
  }
  return snap
}

/** What changed since the prior snapshot. Empty when there's nothing to diff against. */
export function diffMovement(
  projects: SlateProject[],
  prior: Record<string, SlateBriefingSnapshotEntry> | undefined,
  runs: SlateSkillRun[],
  comparedToISO: string | undefined,
): SlateBriefingMovement[] {
  if (!prior) return []
  const moves: SlateBriefingMovement[] = []
  const byline = (p: SlateProject) => ({ project: p.slug, title: p.title })

  for (const p of projects) {
    const before = prior[p.slug]
    if (!before) {
      moves.push({ ...byline(p), kind: 'new-project', detail: `New on the slate at ${p.stage}` })
      continue
    }
    if (before.status !== 'dead' && p.status === 'dead') {
      moves.push({ ...byline(p), kind: 'archived', detail: 'Moved to _archive (dead)' })
      continue
    }
    if (before.stage !== p.stage) {
      moves.push({ ...byline(p), kind: 'stage', detail: `${before.stage} → ${p.stage}` })
    }
    const nowV = draftVersionOf(p)
    if (nowV !== null && (before.draftVersion ?? 0) < nowV) {
      moves.push({
        ...byline(p),
        kind: 'new-draft',
        detail: `Draft v${String(nowV).padStart(2, '0')} landed${before.draftVersion ? ` (was v${String(before.draftVersion).padStart(2, '0')})` : ''}`,
      })
    } else if (
      before.stage === p.stage &&
      p.last_touched &&
      before.lastTouched &&
      new Date(p.last_touched).getTime() > new Date(before.lastTouched).getTime()
    ) {
      moves.push({ ...byline(p), kind: 'touched', detail: `Touched ${p.last_touched.slice(0, 10)}` })
    }
  }

  // Coverage that landed since the last briefing — the skill-run log is the
  // authority (a coverage file also bumps last_touched, so only surface runs
  // not already captured as a plain touch).
  const since = comparedToISO ? new Date(comparedToISO).getTime() : 0
  for (const run of runs) {
    if (run.status !== 'done' || !run.outputFile) continue
    if (new Date(run.startedAt).getTime() <= since) continue
    const p = projects.find((x) => x.slug === run.project)
    if (!p) continue
    // replace a bare 'touched' for this project with the richer coverage line
    const idx = moves.findIndex((m) => m.project === run.project && m.kind === 'touched')
    const move: SlateBriefingMovement = {
      project: run.project,
      title: p.title,
      kind: 'coverage',
      detail: `${run.skill} ran → ${run.outputFile.split('/').pop()}`,
    }
    if (idx >= 0) moves[idx] = move
    else moves.push(move)
  }

  return moves
}

export function collectGoingStale(projects: SlateProject[], now: Date): SlateBriefingStale[] {
  const out: SlateBriefingStale[] = []
  for (const p of projects) {
    const s = assessStaleness(p, now)
    if (s.excluded || s.level === 'fresh') continue
    out.push({
      project: p.slug,
      title: p.title,
      stage: p.stage,
      days: s.days,
      threshold: s.threshold,
      level: s.level,
      clock: s.clock,
    })
  }
  return out.sort((a, b) => b.days / b.threshold - a.days / a.threshold)
}

export function collectWaitingOn(projects: SlateProject[], now: Date): SlateBriefingWaiting[] {
  const out: SlateBriefingWaiting[] = []
  for (const p of projects) {
    if (p.status !== 'active' || !p.waiting_on) continue
    const w = p.waiting_on
    out.push({
      project: p.slug,
      title: p.title,
      who: w.who,
      what: w.what,
      since: w.since,
      days: Math.max(0, daysBetween(w.since, now)),
      isWriter: (p.writers ?? []).some((wr) => wr.name === w.who),
    })
  }
  return out.sort((a, b) => b.days - a.days)
}

/**
 * Nudge candidates: who to poke and why. A waiting-on item is worth a
 * nudge once its staleness clock is aging or over. Contact + language come
 * from the matching writer (only writers carry contact); buyer/platform
 * waits surface without an address (Billy nudges those his own way).
 */
export function collectNudges(projects: SlateProject[], now: Date): SlateBriefingNudge[] {
  const out: SlateBriefingNudge[] = []
  for (const p of projects) {
    if (p.status !== 'active' || !p.waiting_on) continue
    const s = assessStaleness(p, now)
    if (s.level === 'fresh') continue
    const w = p.waiting_on
    const writer = (p.writers ?? []).find((wr) => wr.name === w.who)
    const overdue = s.level === 'stale'
    out.push({
      project: p.slug,
      title: p.title,
      recipient: w.who,
      ...(writer?.contact ? { contact: writer.contact } : {}),
      ...(writer?.language ? { language: writer.language } : {}),
      reason: `${overdue ? 'Overdue' : 'Nearing the line'}: waiting ${s.days}d on ${w.what} (${s.threshold}d window)`,
      days: s.days,
    })
  }
  return out.sort((a, b) => b.days - a.days)
}

export function collectDeadlines(projects: SlateProject[], now: Date): SlateBriefingDeadline[] {
  const out: SlateBriefingDeadline[] = []
  for (const p of projects) {
    if (p.status === 'dead') continue
    for (const d of p.deadlines ?? []) {
      const daysUntil = -daysBetween(d.date, now) // daysBetween(future, now) is negative
      if (daysUntil < 0 || daysUntil > DEADLINE_HORIZON_DAYS) continue
      out.push({ project: p.slug, title: p.title, date: d.date, what: d.what, daysUntil })
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil)
}

export function collectPaused(projects: SlateProject[], now: Date): SlateBriefingPaused[] {
  const out: SlateBriefingPaused[] = []
  for (const p of projects) {
    if (p.status !== 'paused') continue
    // last_touched (file mtime) is the real "how long since worked on"
    // signal — updated_at is just the last scan time (always ~now).
    const since = p.last_touched ?? p.updated_at
    const days = since ? Math.max(0, daysBetween(since, now)) : 0
    if (days >= PAUSED_RESURFACE_DAYS) out.push({ project: p.slug, title: p.title, days })
  }
  return out.sort((a, b) => b.days - a.days)
}

export interface BriefingScaffold {
  whatMoved: SlateBriefingMovement[]
  goingStale: SlateBriefingStale[]
  waitingOn: SlateBriefingWaiting[]
  suggestedNudges: SlateBriefingNudge[]
  upcomingDeadlines: SlateBriefingDeadline[]
  pausedCheck: SlateBriefingPaused[]
}

export function assembleBriefingScaffold(
  projects: SlateProject[],
  runs: SlateSkillRun[],
  prior: Record<string, SlateBriefingSnapshotEntry> | undefined,
  comparedToISO: string | undefined,
  now: Date,
): BriefingScaffold {
  const active = projects.filter((p) => p.status !== 'dead')
  return {
    whatMoved: diffMovement(projects, prior, runs, comparedToISO),
    goingStale: collectGoingStale(active, now),
    waitingOn: collectWaitingOn(active, now),
    suggestedNudges: collectNudges(active, now),
    upcomingDeadlines: collectDeadlines(active, now),
    pausedCheck: collectPaused(projects, now),
  }
}

// ── Brain layer (headline + today's pushes) ─────────────────────────────

const BrainOutSchema = z
  .object({
    headline: z.string().min(1).max(300),
    todaysPushes: z.array(z.string().min(1).max(400)).max(3),
  })
  .strict()

function fallbackHeadline(scaffold: BriefingScaffold, projectCount: number): string {
  if (projectCount === 0) return 'The slate is empty — nothing to brief yet.'
  const stale = scaffold.goingStale.filter((s) => s.level === 'stale').length
  const soon = scaffold.upcomingDeadlines[0]
  if (soon && soon.daysUntil <= 7) return `${soon.title} has a deadline in ${soon.daysUntil}d — ${soon.what}.`
  if (stale > 0) return `${stale} project${stale === 1 ? '' : 's'} past the staleness line — worst first below.`
  if (scaffold.waitingOn.length > 0) {
    const top = scaffold.waitingOn[0]
    return `Waiting ${top.days}d on ${top.who} for ${top.title}.`
  }
  return 'The slate is current — nothing stale, nobody overdue.'
}

function buildBrainPrompt(
  projects: SlateProject[],
  scaffold: BriefingScaffold,
  now: Date,
): string {
  const active = projects.filter((p) => p.status !== 'dead')
  const roster = active
    .map((p) => {
      const bits = [
        `${p.title} (${p.slug})`,
        `${p.format}/${p.stage}`,
        p.priority ? `pri ${p.priority}` : null,
        p.origin === 'external' ? 'EXTERNAL' : null,
      ]
        .filter(Boolean)
        .join(' · ')
      return `- ${bits}${p.logline ? ` — ${p.logline.trim().slice(0, 160)}` : ''}`
    })
    .join('\n')

  return `Today is ${todayISO(now)}. You are writing the development-slate morning briefing for Billy Rovzar (producer, Lemon Studios).

The five sections below are already computed from real slate state — treat them as ground truth. Your ONLY job is the judgment layer:

1. "headline": ONE sentence naming the single most important thing about the slate today. Concrete, specific, no hype.
2. "todaysPushes": 1 to 3 concrete recommendations, each a full sentence naming a specific project and a specific action Billy could take today. Ground every push in the data below — deadlines, staleness, who's waiting, what moved. If there is genuinely nothing to push, return an empty array. Never invent projects, people, dates, or facts not present below.

Return ONLY valid JSON: {"headline": "...", "todaysPushes": ["...", "..."]}. No markdown, no prose around it.

SLATE (${active.length} active project${active.length === 1 ? '' : 's'}):
${roster || '(none)'}

WHAT MOVED (since last briefing): ${scaffold.whatMoved.length === 0 ? 'nothing' : ''}
${scaffold.whatMoved.map((m) => `- ${m.title}: ${m.detail}`).join('\n')}

GOING STALE (worst first): ${scaffold.goingStale.length === 0 ? 'nothing stale' : ''}
${scaffold.goingStale.map((s) => `- ${s.title} (${s.stage}): ${s.days}/${s.threshold}d on the ${s.clock} clock — ${s.level}`).join('\n')}

WAITING ON: ${scaffold.waitingOn.length === 0 ? 'no one' : ''}
${scaffold.waitingOn.map((w) => `- ${w.who} owes "${w.what}" for ${w.title} — ${w.days}d`).join('\n')}

UPCOMING DEADLINES: ${scaffold.upcomingDeadlines.length === 0 ? 'none in the next 45d' : ''}
${scaffold.upcomingDeadlines.map((d) => `- ${d.title}: ${d.what} in ${d.daysUntil}d (${d.date})`).join('\n')}

PAUSED (resurfaced): ${scaffold.pausedCheck.map((p) => `${p.title} (${p.days}d)`).join(', ') || 'none'}`
}

async function brainLayer(
  projects: SlateProject[],
  scaffold: BriefingScaffold,
  projectCount: number,
  now: Date,
): Promise<{ headline: string; todaysPushes: string[] }> {
  const fallback = { headline: fallbackHeadline(scaffold, projectCount), todaysPushes: [] as string[] }
  if (projectCount === 0) return fallback
  try {
    const anthropic = getAnthropicClient()
    const res = await anthropic.messages.create({
      model: CLAUDE_MODELS.smart,
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildBrainPrompt(projects, scaffold, now) }],
    })
    const raw = res.content[0]?.type === 'text' ? res.content[0].text : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    const parsed = BrainOutSchema.parse(JSON.parse(cleaned))
    return { headline: parsed.headline, todaysPushes: parsed.todaysPushes }
  } catch (err) {
    console.warn('[slate] Briefing brain layer degraded:', (err as Error).message)
    return fallback
  }
}

// ── Cache + generation ────────────────────────────────────────────────────

/** Strip the server-only snapshot before returning to the client. */
function forClient(b: SlateBriefing): SlateBriefing {
  const { snapshot: _snapshot, ...rest } = b
  return rest
}

async function loadPrior(
  today: string,
): Promise<{ snapshot?: Record<string, SlateBriefingSnapshotEntry>; date?: string }> {
  const snap = await db.collection(COLLECTION).orderBy('date', 'desc').limit(6).get()
  for (const doc of snap.docs) {
    const data = doc.data() as SlateBriefing
    if (data.date >= today) continue
    if (data.status === 'ready' && data.snapshot) return { snapshot: data.snapshot, date: data.date }
  }
  return {}
}

const generating = new Set<string>()

async function generateNow(date: string, now: Date): Promise<void> {
  try {
    const projects = await listSlateProjects()
    const runs = await listSkillRuns(50)
    const { snapshot: prior, date: comparedTo } = await loadPrior(date)
    const scaffold = assembleBriefingScaffold(projects, runs, prior, comparedTo, now)
    const active = projects.filter((p) => p.status !== 'dead')
    const { headline, todaysPushes } = await brainLayer(projects, scaffold, active.length, now)

    const briefing: SlateBriefing = {
      date,
      status: 'ready',
      headline,
      ...scaffold,
      todaysPushes,
      firstRun: !prior,
      ...(comparedTo ? { comparedTo } : {}),
      projectCount: active.length,
      generatedAt: now.toISOString(),
      model: CLAUDE_MODELS.smart,
      snapshot: snapshotProjects(projects),
    }
    await db.collection(COLLECTION).doc(date).set(briefing)
    console.log(`[slate] Briefing ready for ${date}: ${active.length} projects, ${scaffold.goingStale.length} stale`)
  } catch (err) {
    console.error('[slate] Briefing generation failed:', (err as Error).message)
    await db
      .collection(COLLECTION)
      .doc(date)
      .set({ status: 'failed', error: (err as Error).message, generatedAt: now.toISOString() }, { merge: true })
      .catch(() => {})
  }
}

function isStaleGenerating(b: SlateBriefing, now: Date): boolean {
  if (b.status !== 'generating') return false
  const started = b.generatedAt ? new Date(b.generatedAt).getTime() : 0
  return now.getTime() - started > GENERATING_STALE_MS
}

export interface EnsureBriefingResult {
  status: SlateBriefingStatus
  briefing?: SlateBriefing
}

/**
 * Return today's briefing, or kick off background generation and report
 * `generating`. `force` regenerates even when today's is ready (unless one
 * is already in flight). Never blocks on the brain.
 */
export async function ensureBriefing(force: boolean, now: Date = new Date()): Promise<EnsureBriefingResult> {
  const date = todayISO(now)
  const doc = await db.collection(COLLECTION).doc(date).get()
  const existing = doc.exists ? (doc.data() as SlateBriefing) : null

  if (existing && existing.status === 'ready' && !force) return { status: 'ready', briefing: forClient(existing) }
  if (generating.has(date)) return { status: 'generating' }
  if (existing && existing.status === 'generating' && !isStaleGenerating(existing, now) && !force) {
    return { status: 'generating' }
  }

  generating.add(date)
  await db
    .collection(COLLECTION)
    .doc(date)
    .set(
      {
        date,
        status: 'generating',
        whatMoved: [],
        goingStale: [],
        waitingOn: [],
        suggestedNudges: [],
        upcomingDeadlines: [],
        pausedCheck: [],
        todaysPushes: [],
        firstRun: false,
        projectCount: 0,
        generatedAt: now.toISOString(),
      } satisfies SlateBriefing,
      { merge: true },
    )
  void generateNow(date, now).finally(() => generating.delete(date))
  return { status: 'generating' }
}
