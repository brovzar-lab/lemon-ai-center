import { Moon } from 'lucide-react'
import { useMissionStore } from '@/stores/useMissionStore'

/** Evening mode — the 18:00 wrap: how today went, what tomorrow holds. */
export function EveningWrapCard() {
  const wrap = useMissionStore((s) => s.eveningWrap)
  if (!wrap) return null

  const isToday = wrap.date === new Date().toLocaleDateString('en-CA')
  if (!isToday) return null

  return (
    <section
      aria-label="Evening wrap"
      className="border border-line rounded-lg bg-surface px-5 py-4 mb-5"
    >
      <div className="ed-section-label mb-2 flex items-center gap-2">
        <Moon size={13} className="text-accent" />
        <span>Evening Wrap</span>
      </div>
      <p className="font-sans text-[13px] leading-relaxed text-ink-2 mb-3">
        {wrap.summary}
      </p>
      {wrap.tomorrow.length > 0 && (
        <>
          <div className="text-[10px] font-sans uppercase tracking-[0.14em] text-ink-3 mb-1.5">
            Tomorrow
          </div>
          <ul className="space-y-1">
            {wrap.tomorrow.map((line, i) => (
              <li key={i} className="font-sans text-[12px] text-ink">
                {line}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
