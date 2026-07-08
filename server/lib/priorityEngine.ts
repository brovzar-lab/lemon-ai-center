import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_MODELS } from '@shared/models'
import type { PriorityItem, PriorityLabel, PriorityUrgency } from '@shared/consolidation-types'

export interface ContextSignal {
  type: 'gmail' | 'calendar' | 'obsidian'
  id: string
  label: string
  snippet: string
}

function buildSignalContext(items: ContextSignal[]): string {
  const lines: string[] = []

  // Group by type
  const gmail = items.filter((i) => i.type === 'gmail')
  const calendar = items.filter((i) => i.type === 'calendar')
  const vault = items.filter((i) => i.type === 'obsidian')

  if (gmail.length) {
    lines.push('OPEN EMAIL THREADS:')
    for (const t of gmail.slice(0, 8)) {
      lines.push(`  ${t.label}`)
      if (t.snippet) lines.push(`    ${t.snippet.slice(0, 200)}`)
    }
  }

  if (calendar.length) {
    lines.push('\nTODAY\'S CALENDAR:')
    for (const e of calendar) {
      lines.push(`  ${e.label}`)
    }
  }

  if (vault.length) {
    lines.push('\nVAULT CONTEXT:')
    for (const v of vault.slice(0, 4)) {
      lines.push(`  ${v.label}: ${v.snippet.slice(0, 150)}`)
    }
  }

  return lines.join('\n')
}

export async function computePriorityStack(items: ContextSignal[]): Promise<PriorityItem[]> {
  const signalContext = buildSignalContext(items)
  if (!signalContext.trim()) return []

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `You are the executive assistant for Billy Rovzar, CEO of Lemon Studios.
Based on the signal context below, identify the TOP 3 priorities for today.

Context:
${signalContext}

Output exactly this JSON array (no markdown, no explanation):
[
  {"rank": 1, "label": "Deals|Production|Development", "title": "one-line description", "rationale": "one sentence why this is #1 today", "urgency": "critical|high|medium"},
  {"rank": 2, ...},
  {"rank": 3, ...}
]

Rules:
- Title is under 12 words, starts with a verb or noun
- Rationale references the specific signal (email, event, deadline) that makes it urgent TODAY
- Label must be one of: Deals, Production, Development
- Urgency: critical = must happen today; high = important this week; medium = important this month
- If fewer than 3 clear priorities exist, return fewer items. NEVER pad.
- ONLY reference information that appears in the Context above.`

  const response = await anthropic.messages.create({
    model: CLAUDE_MODELS.balanced,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
    system: 'You produce concise executive priority lists. Output only valid JSON arrays. No prose.',
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned) as Array<{
      rank: number
      label: string
      title: string
      rationale: string
      urgency: string
    }>

    return parsed.slice(0, 3).map((p) => ({
      rank: p.rank,
      label: (p.label as PriorityLabel) || 'Deals',
      title: p.title || '',
      rationale: p.rationale || '',
      urgency: (p.urgency as PriorityUrgency) || 'medium',
      threadCount: 0,
      threadIds: [],
    }))
  } catch {
    console.warn('[priorityEngine] Failed to parse Claude response')
    return []
  }
}
