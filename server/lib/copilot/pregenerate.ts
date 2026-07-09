import { db } from '../firebase'
import { generateDraft } from './generateDraft'
import { threadOwesReply } from './replyOwed'

export interface DraftCandidate {
  threadId: string
  from: string
  fromEmail: string
  subject: string
  snippet: string
  latestMessageId: string
  priority: 'HOT' | 'MED' | 'LOW'
  latestFrom: string
}

export async function pregenerateCopilotDrafts(
  uid: string,
  selfEmail: string,
  candidates: DraftCandidate[],
  cap = 8,
): Promise<number> {
  const eligible = candidates
    .filter((c) => c.priority === 'HOT' && threadOwesReply(c.latestFrom, selfEmail))
    .slice(0, cap)

  let written = 0
  for (const c of eligible) {
    const ref = db.collection(`users/${uid}/copilotDrafts`).doc(c.threadId)
    const existing = await ref.get()
    if (existing.exists && (existing.data() as any)?.basedOnMessageId === c.latestMessageId) continue

    let draft: string
    try {
      draft = await generateDraft(uid, {
        from: c.from, fromEmail: c.fromEmail, subject: c.subject, snippet: c.snippet,
      })
    } catch {
      continue // never let one bad draft fail the scan
    }
    if (!draft.trim()) continue

    await ref.set({
      threadId: c.threadId,
      draft,
      generatedAt: new Date().toISOString(),
      basedOnMessageId: c.latestMessageId,
      tone: 'peer',
    })
    written++
  }
  return written
}
