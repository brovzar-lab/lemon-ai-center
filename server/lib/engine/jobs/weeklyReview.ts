import Anthropic from '@anthropic-ai/sdk'
import { db } from '../../firebase'
import { getCalendarClient } from '../../googleAuth'
import { readTrackers, readSlips, readAdvisorTone } from '../data'
import { committedMXN } from '../ranker'
import { todayISO, ENGINE_TZ } from '../constants'
import type { FrontKey, WeeklyReview } from '@shared/types'
import { CLAUDE_MODELS } from '@shared/models'

const REVIEW_MODEL = CLAUDE_MODELS.balanced

/** Monday of the current week (engine TZ) as YYYY-MM-DD. */
export function mondayOf(now: Date = new Date()): string {
  const today = new Date(now.toLocaleString('en-US', { timeZone: ENGINE_TZ }))
  const day = today.getDay() // 0 = Sun
  const diff = day === 0 ? 6 : day - 1
  today.setDate(today.getDate() - diff)
  return today.toLocaleDateString('en-CA')
}

interface ClassifiedEvent {
  title: string
  hours: number
  front: FrontKey | 'other'
}

/**
 * Sunday 17:00 — the weekly CEO review: where attention actually went
 * vs what Billy says matters, stalls, risks, ONE recommendation.
 */
export async function runWeeklyReview(uid: string): Promise<void> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const weekOf = mondayOf()

  // ── Pull the week's calendar ──
  const rawEvents: Array<{ title: string; hours: number }> = []
  try {
    const calendar = await getCalendarClient(uid)
    const start = new Date()
    start.setDate(start.getDate() - 7)
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: start.toISOString(),
      timeMax: new Date().toISOString(),
      singleEvents: true,
      maxResults: 100,
    })
    for (const e of events.data.items ?? []) {
      if (!e.start?.dateTime || !e.end?.dateTime) continue
      const hours =
        (new Date(e.end.dateTime).getTime() - new Date(e.start.dateTime).getTime()) / 3_600_000
      if (hours > 0 && hours < 12) rawEvents.push({ title: e.summary ?? 'Untitled', hours })
    }
  } catch (err) {
    console.warn('[weekly-review] Calendar read failed:', (err as Error).message)
  }

  // ── Classify events into fronts (one cheap Haiku call) ──
  let classified: ClassifiedEvent[] = rawEvents.map((e) => ({ ...e, front: 'other' as const }))
  if (rawEvents.length) {
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODELS.fast,
        max_tokens: 1500,
        system: `Classify each calendar event title into exactly one bucket for a film studio CEO:
- "fund": investor meetings, fund raise, GBM, Cinépolis, trust, capital
- "writing": writing blocks, script work, drafts
- "shows": production, post, mix, edit, episodes, series, delivery
- "deals": negotiations, contracts, partnerships, legal
- "you": personal, family, doctor, gym, kids
- "other": anything else
Respond ONLY with a JSON array of bucket strings, one per event, same order.`,
        messages: [
          { role: 'user', content: rawEvents.map((e, i) => `${i + 1}. ${e.title}`).join('\n') },
        ],
      })
      const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
      const buckets = JSON.parse(cleaned) as string[]
      const valid = new Set(['fund', 'writing', 'shows', 'deals', 'you', 'other'])
      classified = rawEvents.map((e, i) => ({
        ...e,
        front: (valid.has(buckets[i]) ? buckets[i] : 'other') as ClassifiedEvent['front'],
      }))
    } catch (err) {
      console.warn('[weekly-review] Classification failed:', (err as Error).message)
    }
  }

  const attentionByFront: Partial<Record<FrontKey, number>> = {}
  for (const e of classified) {
    if (e.front === 'other') continue
    attentionByFront[e.front] = Math.round(((attentionByFront[e.front] ?? 0) + e.hours) * 10) / 10
  }

  // ── Narrative review ──
  const [trackers, slips, tone] = await Promise.all([
    readTrackers(uid),
    readSlips(uid),
    readAdvisorTone(uid),
  ])
  const target = trackers.fundState?.targetMXN ?? 300_000_000
  const committed = committedMXN(trackers.investors)

  const facts = [
    `WEEK OF: ${weekOf} (review generated ${todayISO()})`,
    `ATTENTION (calendar hours): ${
      Object.entries(attentionByFront)
        .map(([k, v]) => `${k}=${v}h`)
        .join(', ') || 'no classified events'
    }`,
    `FUND: ${Math.round(committed / 1e6)}M / ${Math.round(target / 1e6)}M MXN committed`,
    ...slips.slice(0, 12).map((s) => `SLIP[${s.severity}]: ${s.summary}`),
    ...trackers.scripts.map(
      (s) => `SCRIPT: ${s.title} — ${s.stage}${s.lastTouchedAt ? `, touched ${s.lastTouchedAt.slice(0, 10)}` : ''}`,
    ),
    trackers.burnout ? `BURNOUT: ${trackers.burnout.score}/100` : '',
  ].filter(Boolean)

  let summary = 'Weekly review generation failed.'
  let stalls: string[] = []
  let risks: string[] = []
  let recommendation = 'Check the engine log and rerun the weekly review.'

  try {
    const response = await anthropic.messages.create({
      model: REVIEW_MODEL,
      thinking: { type: 'disabled' }, // Sonnet 5 defaults to adaptive thinking; keep it off.
      max_tokens: 1200,
      system: `You are the Advisor writing the weekly CEO review for Billy Rovzar (Lemon Studios). ${
        tone === 'brutal'
          ? 'Be brutally honest. Name the avoidance. No hedging.'
          : 'Be direct about facts, warm in delivery.'
      }

Compare where his attention went (calendar hours by front) against what he says matters: the fund raise first, his slate scripts second. Use ONLY the FACTS.

Respond ONLY with JSON (no fencing):
{
  "summary": "120-200 words on the week — attention vs priorities, what moved, what didn't",
  "stalls": ["specific stalled item", ...],
  "risks": ["specific risk", ...],
  "recommendation": "EXACTLY ONE strategic recommendation for next week, max 40 words"
}`,
      messages: [{ role: 'user', content: `FACTS:\n${facts.join('\n')}` }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (parsed.summary) summary = String(parsed.summary)
    if (Array.isArray(parsed.stalls)) stalls = parsed.stalls.map(String)
    if (Array.isArray(parsed.risks)) risks = parsed.risks.map(String)
    if (parsed.recommendation) recommendation = String(parsed.recommendation)
  } catch (err) {
    console.error('[weekly-review] Generation failed:', (err as Error).message)
  }

  const review: WeeklyReview = {
    weekOf,
    attentionByFront,
    summary,
    stalls,
    risks,
    recommendation,
    generatedAt: new Date().toISOString(),
  }
  await db.doc(`users/${uid}/advisor_weekly/${weekOf}`).set(review)
}
