import { useCaptureStore } from '@/stores/useCaptureStore'
import type { Capture } from '@shared/types'

type CaptureKind = Capture['kind']

const KIND_LABEL: Record<CaptureKind, { text: string; class: string }> = {
  todo: { text: 'TODO', class: 'text-accent-coral border-accent-coral/30' },
  idea: { text: 'IDEA', class: 'text-accent-blue border-accent-blue/30' },
  delegate: { text: 'DELEGATE', class: 'text-accent-lemon border-accent-lemon/30' },
}

export function CaptureReview() {
  const captures = useCaptureStore((s) => s.captures)

  // Show only today's captures
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCaptures = captures.filter((c) => new Date(c.createdAt).getTime() >= todayStart.getTime())

  return (
    <section className="py-4" aria-label="Capture review">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[10px] font-body font-bold uppercase tracking-[0.2em] text-text-muted">
          Capture Review
        </p>
      </div>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] font-body font-bold uppercase tracking-[0.2em] text-text-muted">
          Captured Today
        </p>
        {/* C3: Changed misleading "press space" hint to contextual instruction */}
        <span className="text-[10px] font-body text-text-muted italic">
          use ⌘K to quick-capture
        </span>
      </div>

      {todayCaptures.length > 0 ? (
        <>
          <div className="flex flex-col gap-1.5" role="list" aria-label="Today's captures">
            {todayCaptures.map((cap) => {
              const kind = KIND_LABEL[cap.kind]
              return (
                <div key={cap.id} className="flex items-start gap-2" role="listitem">
                  <span className={`text-[10px] font-body font-bold uppercase tracking-widest px-1 py-0.5 border flex-shrink-0 mt-0.5 ${kind.class}`}>
                    {kind.text}
                  </span>
                  <p className="text-[12px] font-body text-text-primary leading-snug">
                    {cap.text}
                  </p>
                </div>
              )
            })}
          </div>
          <button
            type="button"
            className="mt-3 text-[11px] font-body font-semibold text-accent-coral hover:underline uppercase tracking-[0.15em] min-h-[36px]"
            aria-label={`Triage all ${todayCaptures.length} captures`}
          >
            Triage All {todayCaptures.length} →
          </button>
        </>
      ) : (
        <p className="text-[11px] font-body text-text-muted italic">
          No captures today. Use ⌘K to quick-capture.
        </p>
      )}

      <hr className="ed-rule mt-4" />
    </section>
  )
}
