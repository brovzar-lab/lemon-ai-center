export async function sendReply(args: {
  threadId: string
  to: string
  subject: string
  body: string
}): Promise<void> {
  const res = await fetch('/api/gmail/send', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || 'Send failed')
  }
}
