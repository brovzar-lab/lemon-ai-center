import { useMemo } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { Mail } from 'lucide-react'

/**
 * InboxDigest — the peace-of-mind inbox view.
 * Shows what your inbox is telling you at a glance:
 * - Total unread
 * - HOT emails needing attention
 * - Deal-related emails
 * - Low-priority safely skippable
 *
 * This is the component that gives Billy "peace in the morning"
 * by making the inbox legible in 10 seconds.
 */
export function InboxDigest() {
  const threads = useInboxStore((s) => s.threads)

  const digest = useMemo(() => {
    const unread = threads.filter((t) => t.unread)
    const hot = threads.filter((t) => t.priority === 'HOT')
    const med = threads.filter((t) => t.priority === 'MED')
    const low = threads.filter((t) => t.priority === 'LOW')
    const dealRelated = threads.filter((t) => t.tag === 'DEAL')
    const info = threads.filter((t) => t.tag === 'INFO' || t.tag === 'NONE')

    return { unread, hot, med, low, dealRelated, info, total: threads.length }
  }, [threads])

  if (digest.total === 0) {
    return null
  }

  return (
    <section aria-label="Inbox digest" className="mb-5">
      <div className="ed-section-label mb-2 flex items-center gap-2">
        <Mail size={12} className="text-text-muted" />
        <span>Inbox</span>
        <span className="ml-auto text-[10px] font-body text-text-muted normal-case tracking-normal">
          {digest.total} threads · {digest.unread.length} unread
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* HOT */}
        <div className={`rounded-lg px-3 py-2.5 ${digest.hot.length > 0 ? 'bg-accent-coral/8 border border-accent-coral/20' : 'bg-bg-surface border border-border-soft'}`}>
          <span className={`font-display text-xl font-semibold leading-none ${digest.hot.length > 0 ? 'text-accent-coral' : 'text-text-muted'}`}>
            {digest.hot.length}
          </span>
          <p className="text-[10px] font-body font-bold uppercase tracking-[0.15em] text-text-muted mt-1">
            Hot
          </p>
        </div>

        {/* MEDIUM */}
        <div className={`rounded-lg px-3 py-2.5 ${digest.med.length > 0 ? 'bg-accent-lemon/8 border border-accent-lemon/20' : 'bg-bg-surface border border-border-soft'}`}>
          <span className={`font-display text-xl font-semibold leading-none ${digest.med.length > 0 ? 'text-accent-lemon' : 'text-text-muted'}`}>
            {digest.med.length}
          </span>
          <p className="text-[10px] font-body font-bold uppercase tracking-[0.15em] text-text-muted mt-1">
            Medium
          </p>
        </div>

        {/* LOW / Info */}
        <div className="rounded-lg px-3 py-2.5 bg-bg-surface border border-border-soft">
          <span className="font-display text-xl font-semibold leading-none text-text-muted">
            {digest.low.length + digest.info.length}
          </span>
          <p className="text-[10px] font-body font-bold uppercase tracking-[0.15em] text-text-muted mt-1">
            Low / Info
          </p>
        </div>
      </div>

      {/* Deal-related highlight */}
      {digest.dealRelated.length > 0 && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-bg-surface border border-border-soft">
          <p className="text-[11px] font-body text-text-secondary">
            <span className="font-semibold text-text-primary">{digest.dealRelated.length}</span>{' '}
            deal-related{' '}
            {digest.dealRelated.length === 1 ? 'email' : 'emails'}
            {digest.dealRelated.length <= 3 && (
              <span className="text-text-muted">
                {' — '}
                {digest.dealRelated.map((t) => t.from).join(', ')}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Quick list of HOT threads */}
      {digest.hot.length > 0 && (
        <ul className="mt-2 space-y-1">
          {digest.hot.slice(0, 5).map((thread) => (
            <li
              key={thread.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-bg-elevated/50 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent-coral flex-shrink-0" />
              <span className="font-body text-[12px] text-text-primary truncate flex-1">
                {thread.from}
              </span>
              <span className="font-body text-[11px] text-text-muted truncate max-w-[50%]">
                {thread.subject}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
