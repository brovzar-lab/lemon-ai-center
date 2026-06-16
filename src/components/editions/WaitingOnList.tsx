import { useMemo } from 'react'
import { useLemonDelegationsStore } from '@/stores/lemon/useLemonDelegationsStore'
import { Users } from 'lucide-react'

/**
 * WaitingOnList — what others owe you, sorted by urgency.
 * Merged view of overdue delegations.
 * Slate receded styling consistent with the Editor's Page.
 */
export function WaitingOnList({ max = 5 }: { max?: number }) {
  const delegations = useLemonDelegationsStore((s) => s.delegations)

  const items = useMemo(() => {
    const now = new Date()
    return delegations
      .filter((d) => d.status === 'pending')
      .map((d) => {
        const expectedMs = d.expected_by ? new Date(d.expected_by).getTime() : null
        const daysOverdue = expectedMs
          ? Math.floor((now.getTime() - expectedMs) / 86_400_000)
          : null
        const createdDays = d.created_at
          ? Math.floor((now.getTime() - new Date(d.created_at).getTime()) / 86_400_000)
          : 0
        return { ...d, daysOverdue, createdDays }
      })
      .sort((a, b) => {
        // Overdue first (most overdue at top), then by age
        if (a.daysOverdue !== null && b.daysOverdue !== null) return b.daysOverdue - a.daysOverdue
        if (a.daysOverdue !== null) return -1
        if (b.daysOverdue !== null) return 1
        return b.createdDays - a.createdDays
      })
      .slice(0, max)
  }, [delegations, max])

  if (items.length === 0) return null

  return (
    <section aria-label="Waiting on others" className="mb-5">
      <div className="ed-section-label mb-2 flex items-center gap-2">
        <Users size={12} className="text-text-muted" />
        <span>Waiting On</span>
        <span className="ml-auto text-[10px] font-body text-text-muted normal-case tracking-normal">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      <ul className="space-y-0.5">
        {items.map((item) => {
          const isOverdue = item.daysOverdue !== null && item.daysOverdue > 0

          return (
            <li
              key={item.id}
              className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-bg-elevated/50 transition-colors"
            >
              {/* Status dot */}
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isOverdue ? 'bg-accent-coral' : 'bg-text-muted/40'
                }`}
              />

              {/* Person */}
              <span className="font-body text-[12px] text-text-muted group-hover:text-text-primary transition-colors w-28 truncate flex-shrink-0">
                {item.person}
              </span>

              {/* Task */}
              <span className="font-body text-[11px] text-text-muted group-hover:text-text-secondary transition-colors truncate flex-1 min-w-0">
                {item.task}
              </span>

              {/* Status */}
              <span
                className={`text-[10px] font-body font-bold uppercase tracking-[0.1em] flex-shrink-0 ${
                  isOverdue ? 'text-accent-coral' : 'text-text-muted'
                }`}
              >
                {isOverdue
                  ? `${item.daysOverdue}d over`
                  : item.daysOverdue !== null && item.daysOverdue <= 0
                    ? `${Math.abs(item.daysOverdue)}d left`
                    : `${item.createdDays}d ago`}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
