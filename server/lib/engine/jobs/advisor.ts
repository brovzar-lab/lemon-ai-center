import Anthropic from '@anthropic-ai/sdk'
import { db } from '../../firebase'
import { readTrackers, readSlips, readAdvisorTone } from '../data'
import { committedMXN } from '../ranker'
import { todayISO, daysBetween, BURNOUT } from '../constants'
import type { AdvisorNote, AdvisorTone } from '@shared/types'
import { CLAUDE_MODELS } from '@shared/models'

const ADVISOR_MODEL = CLAUDE_MODELS.balanced

function toneInstructions(tone: AdvisorTone): string {
  if (tone === 'consigliere') {
    return `TONE: Trusted consigliere. Direct about facts, warm in delivery. Encourage without sugarcoating. You respect Billy and want him to win.`
  }
  return `TONE: Brutally honest chief of staff. Call out avoidance by name. No flattery, no hedging, no "consider maybe". Short declarative sentences. You challenge Billy because mediocrity is the enemy. Never cruel — but never soft.`
}

/**
 * Generate the Advisor's daily note from real tracker state.
 * Zero-hallucination discipline: the model only gets verified facts
 * and is instructed to reference nothing outside them.
 */
export async function generateAdvisorNote(uid: string): Promise<AdvisorNote> {
  const [trackers, slips, tone] = await Promise.all([
    readTrackers(uid),
    readSlips(uid),
    readAdvisorTone(uid),
  ])

  const date = todayISO()
  const now = new Date()
  const target = trackers.fundState?.targetMXN ?? 300_000_000
  const committed = committedMXN(trackers.investors)
  const pct = target ? Math.round((committed / target) * 100) : 0

  const facts: string[] = []
  facts.push(
    `FUND: Lemon Trust I — ${Math.round(committed / 1e6)}M of ${Math.round(target / 1e6)}M MXN committed (${pct}%).`,
  )
  for (const i of trackers.investors) {
    if (i.stage === 'passed') continue
    facts.push(
      `INVESTOR: ${i.name}${i.org ? ` (${i.org})` : ''} — stage ${i.stage}${i.amountMXN ? `, ${Math.round(i.amountMXN / 1e6)}M MXN` : ''}${i.lastTouch ? `, last touch ${daysBetween(i.lastTouch, now)}d ago` : ''}${i.nextAction ? `, next: ${i.nextAction}` : ''}`,
    )
  }
  for (const s of trackers.scripts) {
    facts.push(
      `SCRIPT: ${s.title} — ${s.stage}${s.draftNumber ? ` ${s.draftNumber}` : ''}${s.lastTouchedAt ? `, last touched ${daysBetween(s.lastTouchedAt, now)}d ago` : ''}${s.targetDate ? `, target ${s.targetDate}` : ''}`,
    )
  }
  for (const sl of slips.slice(0, 12)) {
    facts.push(`SLIP[${sl.severity}]: ${sl.summary}${sl.detail ? ` — ${sl.detail}` : ''}`)
  }
  for (const dl of trackers.deadlines) {
    const daysOut = -daysBetween(dl.date, now)
    if (daysOut >= 0 && daysOut <= 365) {
      facts.push(`DEADLINE[${dl.severity}]: ${dl.title} — ${dl.date} (${daysOut}d away)`)
    }
  }
  if (trackers.burnout) {
    const b = trackers.burnout
    facts.push(
      `BURNOUT: ${b.score}/100 (${b.meetingHours}h meetings, ${b.lateNightEmails} late-night emails, ${b.daysSinceBreak}d since a break)${b.score >= BURNOUT.ALERT_SCORE ? ' — ABOVE ALERT THRESHOLD' : ''}`,
    )
  }
  for (const m of trackers.memories.filter((m) => m.active).slice(0, 15)) {
    facts.push(`MEMORY: ${m.text}`)
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const system = `You are the Advisor inside Billy Rovzar's CEO command center. Billy runs Lemon Studios (Mexican film/TV), is raising the Lemon Trust I film fund, personally writes slate screenplays, and has a wife and five kids who matter more than any deal.

${toneInstructions(tone)}

ZERO HALLUCINATION RULES:
- Use ONLY the FACTS block. Never invent names, amounts, dates, or events.
- If the facts are thin, say less. A two-sentence honest note beats a padded one.

Write today's note: what Billy is avoiding, what's at risk, what deserves him today. Prioritize: hard deadlines → fund momentum → stale scripts → stalled deals → burnout.

Respond with ONLY JSON (no fencing):
{
  "headline": "One sharp sentence, max 15 words",
  "body": "60-120 words. Second person. Specific.",
  "callouts": [{ "text": "one specific action or risk, max 20 words" }]
}
2-4 callouts.`

  let headline = 'Advisor unavailable today.'
  let body = 'Daily note generation failed — showing last known state. Check the engine log.'
  let callouts: Array<{ text: string }> = []
  let degraded = false

  try {
    const response = await anthropic.messages.create({
      model: ADVISOR_MODEL,
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: `FACTS (${date}):\n${facts.join('\n')}` }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (parsed.headline && parsed.body) {
      headline = String(parsed.headline)
      body = String(parsed.body)
      callouts = Array.isArray(parsed.callouts)
        ? parsed.callouts.filter((c: any) => c?.text).map((c: any) => ({ text: String(c.text) }))
        : []
    } else {
      degraded = true
    }
  } catch (err) {
    console.error('[advisor] Generation failed:', (err as Error).message)
    degraded = true
  }

  const note: AdvisorNote = {
    date,
    headline,
    body,
    callouts,
    tone,
    generatedAt: new Date().toISOString(),
    ...(degraded ? { degraded: true } : {}),
  }

  await db.doc(`users/${uid}/advisor/${date}`).set(note)
  return note
}
