import { useConnectionStore } from '@/stores/useConnectionStore'

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
    // A dead Google token must raise the app-wide reconnect banner, same as
    // apiClient.apiFetch and startBriefStream — sendReply talks to the
    // server directly (raw fetch, not apiClient) so it has to set this itself.
    if (body?.error?.code === 'REAUTH_REQUIRED') {
      useConnectionStore.getState().setReauthRequired(true)
    }
    throw new Error(body?.error?.message || 'Send failed')
  }
}
