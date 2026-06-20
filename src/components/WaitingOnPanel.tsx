import { Clock } from 'lucide-react'

export interface WaitingOnItem {
  person: string
  subject: string
  daysWaiting: number
  threadId: string
}

function daysColor(days: number): string {
  if (days >= 6) return 'text-data-coral bg-data-coral/10 border-data-coral/20'
  if (days >= 3) return 'text-accent bg-accent/10 border-accent/20'
  return 'text-data-teal bg-data-teal/10 border-data-teal/20'
}

export function WaitingOnPanel({ items }: { items: WaitingOnItem[] }) {
  if (!items.length) return null

  return (
    <section aria-label="Waiting on replies" className="pb-4">
      <div className="ed-section-label mb-3 flex items-center gap-2">
        <Clock size={14} className="text-ink-3" />
        <span>Waiting On</span>
        <span className="text-[10px] font-sans text-ink-3 ml-auto">
          {items.length} pending
        </span>
      </div>

      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={item.threadId || i}
            className="flex items-start gap-3 -mx-2 px-2 py-1.5 rounded hover:bg-sunken/50 transition-colors"
          >
            {/* Days badge */}
            <span
              className={`flex-shrink-0 inline-flex items-center justify-center w-8 h-5 text-[10px] font-sans font-bold rounded border ${daysColor(item.daysWaiting)}`}
            >
              {item.daysWaiting}d
            </span>

            <div className="flex-1 min-w-0">
              <p className="font-sans text-[12px] font-semibold text-ink truncate">
                {item.person}
              </p>
              <p className="font-sans text-[11px] text-ink-2 truncate mt-0.5">
                {item.subject}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <hr className="ed-rule mt-4" />
    </section>
  )
}
