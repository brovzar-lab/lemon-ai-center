import Anthropic from '@anthropic-ai/sdk'
import { db } from './firebase'
import { computePriorityStack } from './priorityEngine'
import { computeEnrichedFlags } from './relationshipContext'
import type { PrecomputePayload } from '@shared/consolidation-types'
import type { ContextSignal } from './priorityEngine'

const PRECOMPUTE_COLLECTION = 'lemon_precompute'
// A-10: Doc key is now per-user to prevent data leakage in multi-user scenarios
function precomputeDocKey(uid?: string): string {
  return uid ? `${uid}_today` : 'today'
}

async function generateNorthStar(
  priorities: { rank: number; label: string; title: string; rationale: string }[],
  eventLabels: string[],
): Promise<string> {
  if (!priorities.length) return ''

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const pLines = priorities.slice(0, 3).map((p) => `  ${p.rank}. [${p.label}] ${p.title} — ${p.rationale}`)
  const eLines = eventLabels.slice(0, 5).map((e) => `  ${e}`)

  const prompt = `Based on today's top priorities and schedule, write ONE sentence (under 20 words) starting with 'Today is about' that captures what TODAY is fundamentally about. No markdown. No semicolons. End with period.

Priorities:
${pLines.join('\n')}

Schedule:
${eLines.length ? eLines.join('\n') : '  (no events today)'}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{ role: 'user', content: prompt }],
      system: 'You write executive north star sentences. One sentence. Direct, action-oriented.',
    })
    return response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  } catch {
    return ''
  }
}

export async function runPrecompute(
  uid: string,
  assembleContextFn: (uid: string) => Promise<{
    items: { type: string; id: string; label: string; snippet: string }[]
    block: string
    threadIds: string[]
  }>,
): Promise<PrecomputePayload> {
  console.log('[precompute] Starting...')

  // Phase 1: Assemble context
  const { items } = await assembleContextFn(uid)
  const contextSignals: ContextSignal[] = items.map((i) => ({
    type: i.type as 'gmail' | 'calendar' | 'obsidian',
    id: i.id,
    label: i.label,
    snippet: i.snippet,
  }))

  // Phase 2: Compute priorities
  const priorities = await computePriorityStack(contextSignals)

  // Phase 3: Compute relationship flags
  const enrichedFlags = await computeEnrichedFlags(contextSignals)

  // Phase 4: Generate north star
  const calendarLabels = items.filter((i) => i.type === 'calendar').map((i) => i.label)
  const northStar = await generateNorthStar(priorities, calendarLabels)

  // Build payload
  const now = new Date()
  const payload: PrecomputePayload = {
    todayIso: now.toISOString().slice(0, 10),
    computedAt: now.toISOString(),
    priorities,
    enrichedFlags,
    northStar,
    threadCount: items.filter((i) => i.type === 'gmail').length,
    eventCount: items.filter((i) => i.type === 'calendar').length,
  }

  // Save to Firestore (namespaced per user)
  await db.collection(PRECOMPUTE_COLLECTION).doc(precomputeDocKey(uid)).set(payload)
  console.log(`[precompute] Saved ${priorities.length} priorities, ${enrichedFlags.length} flags`)

  return payload
}

export async function loadPrecomputed(uid?: string): Promise<PrecomputePayload | null> {
  try {
    const doc = await db.collection(PRECOMPUTE_COLLECTION).doc(precomputeDocKey(uid)).get()
    if (!doc.exists) return null
    return doc.data() as PrecomputePayload
  } catch (err) {
    console.warn('[precompute] Load error:', (err as Error).message)
    return null
  }
}

export function isPrecomputeFresh(payload: PrecomputePayload | null): boolean {
  if (!payload) return false
  const today = new Date().toISOString().slice(0, 10)
  return payload.todayIso === today
}
