import { useState } from 'react'
import { CalendarPlus, Check, X } from 'lucide-react'
import { useMissionStore } from '@/stores/useMissionStore'

/**
 * The autonomy boundary, visible: outward-facing actions the engine
 * proposed (calendar blocks, etc.) wait here for one tap.
 */
export function ApprovalsStrip() {
  const pending = useMissionStore((s) => s.pendingApprovals)
  const approve = useMissionStore((s) => s.approveAction)
  const dismiss = useMissionStore((s) => s.dismissAction)
  const [busy, setBusy] = useState<string | null>(null)

  if (!pending.length) return null

  return (
    <section aria-label="Pending approvals" className="mb-5 space-y-2">
      {pending.map((action) => {
        const p = (action.payload ?? {}) as {
          title?: string
          date?: string
          startHour?: number
          endHour?: number
          reason?: string
        }
        return (
          <div
            key={action.id}
            className="flex items-center gap-3 border border-accent/30 bg-accent/5 rounded-lg px-4 py-2.5"
          >
            <CalendarPlus size={15} className="text-accent flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-sans text-[12px] font-semibold text-ink truncate">
                {p.title ?? action.target.label}
                {p.date && (
                  <span className="font-normal text-ink-2">
                    {' '}
                    — {p.date}, {p.startHour}:00–{p.endHour}:00
                  </span>
                )}
              </p>
              {p.reason && (
                <p className="font-sans text-[11px] text-ink-3 truncate">{p.reason}</p>
              )}
            </div>
            <button
              type="button"
              disabled={busy === action.id}
              onClick={() => {
                setBusy(action.id)
                void approve(action.id).finally(() => setBusy(null))
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent/15 text-accent text-[11px] font-sans font-semibold uppercase tracking-[0.1em] hover:bg-accent/25 transition-colors disabled:opacity-50"
            >
              <Check size={12} /> Approve
            </button>
            <button
              type="button"
              disabled={busy === action.id}
              onClick={() => {
                setBusy(action.id)
                void dismiss(action.id).finally(() => setBusy(null))
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-ink-3 text-[11px] font-sans uppercase tracking-[0.1em] hover:text-ink-2 transition-colors disabled:opacity-50"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </section>
  )
}
