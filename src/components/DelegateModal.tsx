import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { TEAM } from '@shared/constants'
import { useAuthStore } from '@/stores/useAuthStore'
import { useActionLogStore } from '@/stores/useActionLogStore'
import type { TeamMember } from '@shared/constants'

interface DelegateModalProps {
  open: boolean
  onClose: () => void
  taskTitle?: string
  context?: string
}

export function DelegateModal({ open, onClose, taskTitle = '', context = '' }: DelegateModalProps) {
  const user = useAuthStore((s) => s.user)
  const addAction = useActionLogStore((s) => s.addAction)
  const [to, setTo] = useState<TeamMember>(TEAM[0])
  const [title, setTitle] = useState(taskTitle)
  const [body, setBody] = useState(context)
  const [deadline, setDeadline] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  if (!open) return null

  const previewEmail = `To: ${to.name} <${to.email}>
Subject: Action needed: ${title}

Hi ${to.name},

${body}

${deadline ? `Deadline: ${deadline}` : ''}

Thanks,
Billy`

  const handleSend = async () => {
    if (!user || !title.trim()) return
    setSending(true)
    try {
      const response = await fetch('/api/delegations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.email,
          toName: to.name,
          taskTitle: title,
          context: body,
          deadline: deadline || undefined,
        }),
      })

      if (response.ok) {
        // Log the delegation action
        addAction(user.uid, {
          type: 'delegate',
          target: { kind: 'task', id: crypto.randomUUID(), label: title },
          confidence: 'high',
          initiator: 'ai',
          reversible: true,
          undone: false,
        })
        setSent(true)
        setTimeout(() => {
          onClose()
          setSent(false)
          setPreviewing(false)
          setTitle('')
          setBody('')
          setDeadline('')
        }, 1500)
      }
    } catch {
      // Silently fail — toast would be better
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bg-base/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-bg-surface border border-border-soft rounded-xl shadow-2xl p-6">
        <h2 className="text-[11px] font-body font-semibold text-text-muted tracking-widest uppercase mb-4">
          Delegate Task
        </h2>

        {sent ? (
          <div className="text-center py-8">
            <p className="font-display text-xl text-text-primary mb-1">Sent ✓</p>
            <p className="font-body text-sm text-text-tertiary">Delegation email sent to {to.name}.</p>
          </div>
        ) : previewing ? (
          <>
            {/* Preview mode */}
            <pre className="font-body text-sm text-text-secondary whitespace-pre-wrap bg-bg-base border border-border-soft rounded-lg p-4 mb-4 max-h-[300px] overflow-y-auto">
              {previewEmail}
            </pre>
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setPreviewing(false)}
                className="text-[11px] font-body font-semibold uppercase tracking-wider px-4 py-2 text-text-muted hover:text-text-secondary transition-colors"
              >
                ← Edit
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="text-[11px] font-body font-semibold uppercase tracking-wider px-5 py-2 rounded-lg bg-accent-coral text-white hover:bg-accent-coral/90 transition-colors disabled:opacity-40"
              >
                {sending ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Edit mode */}
            <div className="space-y-3 mb-5">
              <div>
                <label className="text-[11px] font-body font-semibold uppercase tracking-wider text-text-muted block mb-1">To</label>
                <select
                  value={to.id}
                  onChange={(e) => setTo(TEAM.find((m) => m.id === e.target.value) ?? TEAM[0])}
                  className="w-full bg-bg-base border border-border-soft rounded-lg px-3 py-2 font-body text-sm text-text-primary focus:outline-none focus:border-border-medium"
                >
                  {TEAM.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} — {member.role}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-body font-semibold uppercase tracking-wider text-text-muted block mb-1">Task</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-bg-base border border-border-soft rounded-lg px-3 py-2 font-body text-sm text-text-primary focus:outline-none focus:border-border-medium"
                  placeholder="What needs to be done"
                />
              </div>
              <div>
                <label className="text-[11px] font-body font-semibold uppercase tracking-wider text-text-muted block mb-1">Context</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={3}
                  className="w-full bg-bg-base border border-border-soft rounded-lg px-3 py-2 font-body text-sm text-text-primary focus:outline-none focus:border-border-medium resize-none"
                  placeholder="Any additional context"
                />
              </div>
              <div>
                <label className="text-[11px] font-body font-semibold uppercase tracking-wider text-text-muted block mb-1">Deadline (optional)</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full bg-bg-base border border-border-soft rounded-lg px-3 py-2 font-body text-sm text-text-primary focus:outline-none focus:border-border-medium"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="text-[11px] font-body font-semibold uppercase tracking-wider px-4 py-2 text-text-muted hover:text-text-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setPreviewing(true)}
                disabled={!title.trim()}
                className="text-[11px] font-body font-semibold uppercase tracking-wider px-5 py-2 rounded-lg border border-border-soft text-text-secondary hover:border-border-medium transition-colors disabled:opacity-40"
              >
                Preview Email <ArrowRight size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
