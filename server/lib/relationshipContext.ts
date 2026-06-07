import Anthropic from '@anthropic-ai/sdk'
import type { EnrichedRelationshipFlag } from '@shared/consolidation-types'
import type { ContextSignal } from './priorityEngine'

const MAX_FLAGS = 5

export async function computeEnrichedFlags(items: ContextSignal[]): Promise<EnrichedRelationshipFlag[]> {
  // Extract unique senders from gmail items
  const senderMap = new Map<string, { name: string; lastSeen: string; subjects: string[] }>()

  for (const item of items.filter((i) => i.type === 'gmail')) {
    // Parse "Name <email>: Subject" from label
    const fromMatch = item.label.match(/^([^<:]+)/)
    const name = fromMatch ? fromMatch[1].trim() : 'Unknown'
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')

    if (!senderMap.has(slug)) {
      senderMap.set(slug, { name, lastSeen: '', subjects: [] })
    }
    const entry = senderMap.get(slug)!
    entry.subjects.push(item.label)
  }

  if (senderMap.size === 0) return []

  // Build brief for Claude to generate context lines
  const briefs: string[] = []
  const slugs: string[] = []
  let idx = 1
  for (const [slug, data] of senderMap) {
    if (idx > MAX_FLAGS) break
    briefs.push(`[${idx}] ${data.name}: recent email subjects: ${data.subjects.slice(0, 2).join('; ')}`)
    slugs.push(slug)
    idx++
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const prompt = `For each numbered contact below, write ONE sentence (under 20 words) explaining why this person matters to surface today. Mention the specific context from their emails.
Format: "[N] <sentence>" — one line per contact, in order. No markdown.

${briefs.join('\n')}`

  const contexts: string[] = Array(slugs.length).fill('Recent email activity')

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100 * slugs.length,
      messages: [{ role: 'user', content: prompt }],
      system: 'You write one-line relationship context for an executive daily briefing. Tight, factual, action-oriented.',
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    for (const line of text.split('\n')) {
      const m = line.trim().match(/^\[(\d+)\]\s*(.+)/)
      if (!m) continue
      const i = parseInt(m[1]) - 1
      if (i >= 0 && i < contexts.length) {
        contexts[i] = m[2].trim().replace(/\.$/, '')
      }
    }
  } catch {
    // Keep defaults
  }

  return slugs.map((slug, i) => {
    const data = senderMap.get(slug)!
    return {
      personName: data.name,
      personSlug: slug,
      daysSince: 0, // Would need Firestore last-contact data for real values
      lastContactLabel: 'Today',
      flagType: 'stale' as const,
      rankScore: MAX_FLAGS - i,
      contextLine: contexts[i],
    }
  })
}
