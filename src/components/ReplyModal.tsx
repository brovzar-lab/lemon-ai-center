import React, { useState, useEffect } from 'react'
import { TONE_TIERS } from '../lib/voiceProfile'
import { X } from 'lucide-react'
import type { ToneTier } from '../lib/voiceProfile'

interface EmailContext {
  threadId?: string
  from: string
  fromEmail: string
  subject: string
  snippet: string
  toneTier?: string
}

interface Props {
  email: EmailContext | null
  onClose: () => void
}

export default function ReplyModal({ email, onClose }: Props) {
  const [tier, setTier] = useState<ToneTier>('peer')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    if (!email) return
    setTier((email.toneTier as ToneTier) ?? 'peer')
    setSent(false)
    setSendError(null)
  }, [email])

  useEffect(() => {
    if (!email) return
    generate((email.toneTier as ToneTier) ?? 'peer')
  }, [email])

  async function generate(useTier: ToneTier) {
    if (!email) return
    setLoading(true)
    setDraft('')
    setSent(false)
    setSendError(null)

    try {
      // CSRF is enforced by the sameSite cookie + Origin allowlist; no token needed.
      const res = await fetch('/api/claude/draft-reply', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: {
            from: email.from,
            fromEmail: email.fromEmail,
            subject: email.subject,
            snippet: email.snippet,
          },
          toneTier: useTier,
        }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const parsed = JSON.parse(line.slice(6))
              if (parsed.type === 'token') {
                accumulated += parsed.text
                setDraft(accumulated)
              } else if (parsed.type === 'done') {
                accumulated = parsed.draft || accumulated
                setDraft(accumulated)
              } else if (parsed.type === 'error') {
                accumulated = ''
                setDraft('Could not draft reply. Please try again.')
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setDraft('Could not draft reply. Please try again.')
    }
    setLoading(false)
  }

  function handleTierChange(t: ToneTier) {
    setTier(t)
    generate(t)
  }

  function copy() {
    navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function send() {
    if (!email || !draft) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: email.threadId || '',
          to: email.fromEmail,
          subject: `Re: ${email.subject}`,
          body: draft,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message || 'Send failed')
      }
      setSent(true)
      setTimeout(() => {
        onClose()
        setSent(false)
      }, 1500)
    } catch (err: any) {
      setSendError(err.message || 'Send failed')
    }
    setSending(false)
  }

  if (!email) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content reply-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">Reply to {email.from}</span>
          <button onClick={onClose} className="modal-close" aria-label="Close"><X size={16} /></button>
        </div>

        {/* Email summary */}
        <div className="reply-context">
          <div className="reply-subject">Re: {email.subject}</div>
          <div className="reply-snippet">{email.snippet}</div>
        </div>

        {/* Tone tier switcher */}
        <div className="tone-switcher">
          <span className="tone-label">Tone:</span>
          {(Object.entries(TONE_TIERS) as [ToneTier, typeof TONE_TIERS[ToneTier]][]).map(([k, v]) => (
            <button
              key={k}
              onClick={() => handleTierChange(k)}
              title={v.desc}
              className={`tone-btn ${tier === k ? 'active' : ''}`}
              style={tier === k ? { background: v.color, color: '#fff' } : {}}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Draft area */}
        <div className="reply-draft-area">
          {loading ? (
            <div className="reply-loading">
              <div className="spinner" />
              Drafting in your voice...
            </div>
          ) : (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={8}
              className="reply-textarea"
              placeholder="Draft will appear here..."
            />
          )}
        </div>

        {/* Send error */}
        {sendError && (
          <div className="settings-error" style={{ margin: '0 20px 12px' }}>{sendError}</div>
        )}

        {/* Actions */}
        <div className="modal-actions">
          <button onClick={() => generate(tier)} disabled={loading || sending} className="reply-redraft-btn">
            Re-draft
          </button>
          <div className="modal-actions-right">
            <button onClick={copy} disabled={loading || !draft} className="btn-secondary">
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button
              onClick={send}
              disabled={loading || sending || !draft || sent}
              className="btn-primary"
              style={sent ? { background: '#059669' } : {}}
            >
              {sent ? '✓ Sent!' : sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
