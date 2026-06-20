import { Flame, Feather } from 'lucide-react'
import { useMissionStore } from '@/stores/useMissionStore'

/**
 * The Advisor speaks first — top of the Spine. Daily note generated
 * at 05:30 by the engine; brutal by default, consigliere by toggle.
 */
export function AdvisorCard() {
  const note = useMissionStore((s) => s.advisorNote)
  const runJob = useMissionStore((s) => s.runJob)

  if (!note) {
    return (
      <section
        aria-label="Advisor"
        className="bg-accent-soft rounded-lg px-5 py-4 mb-5"
      >
        <div className="ed-section-label mb-1">Advisor</div>
        <p className="font-sans text-[13px] text-ink-2">
          The Advisor writes your daily note at 05:30 — what you're avoiding, what's at
          risk, what deserves you today.
        </p>
        <button
          type="button"
          onClick={() => void runJob('morning_assembly')}
          className="mt-2 text-[11px] font-sans uppercase tracking-[0.12em] text-accent hover:underline"
        >
          Generate now
        </button>
      </section>
    )
  }

  const isToday = note.date === new Date().toLocaleDateString('en-CA')

  return (
    <section
      aria-label="Advisor daily note"
      className="bg-accent-soft rounded-lg px-5 py-4 mb-5 shadow-card hover:shadow-hover transition-shadow"
    >
      <div className="ed-section-label mb-2 flex items-center gap-2">
        {note.tone === 'brutal' ? (
          <Flame size={13} className="text-data-coral" />
        ) : (
          <Feather size={13} className="text-data-teal" />
        )}
        <span>Advisor</span>
        <span className="ml-auto text-[10px] font-sans text-ink-3 normal-case tracking-normal">
          {note.date}
          {!isToday && <span className="text-data-coral ml-1">(stale)</span>}
          {note.degraded && <span className="text-data-coral ml-1">(degraded)</span>}
        </span>
      </div>

      <h2 className="font-display text-[19px] leading-snug text-ink mb-2">
        {note.headline}
      </h2>
      <p className="font-sans text-[13px] leading-relaxed text-ink-2 mb-3">
        {note.body}
      </p>

      {note.callouts.length > 0 && (
        <ul className="space-y-1.5">
          {note.callouts.map((c, i) => (
            <li key={i} className="flex items-start gap-2 font-sans text-[12px] text-ink">
              <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
