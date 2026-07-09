import type { InboxThread } from '@shared/types'
import { extractEmail } from '@/lib/inbox/extractEmail'

export async function generateDraftForThread(
  thread: InboxThread,
  toneTier = 'peer',
  onToken?: (text: string) => void,
): Promise<string> {
  const res = await fetch('/api/claude/draft-reply', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: {
        from: thread.from,
        fromEmail: extractEmail(thread.from, thread.fromDomain),
        subject: thread.subject,
        snippet: thread.snippet,
      },
      toneTier,
    }),
  })
  if (!res.ok || !res.body) throw new Error('Draft generation failed')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let accumulated = ''
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      let parsed: any
      try { parsed = JSON.parse(line.slice(6)) } catch { continue }
      if (parsed.type === 'token') {
        accumulated += parsed.text
        onToken?.(parsed.text)
      } else if (parsed.type === 'done') {
        accumulated = parsed.draft || accumulated
      } else if (parsed.type === 'error') {
        throw new Error(parsed.message || 'Draft generation failed')
      }
    }
  }
  return accumulated
}
