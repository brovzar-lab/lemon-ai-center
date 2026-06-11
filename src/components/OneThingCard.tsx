import { useBriefStore } from '@/stores/useBriefStore'
import { useFocusModeStore } from '@/stores/useFocusModeStore'
import { useUIStore } from '@/stores/useUIStore'
import { Cite } from './Cite'
import { ArrowRight } from 'lucide-react'
import type { Citation } from '@shared/types'

export function OneThingCard() {
  const oneThing = useBriefStore((s) => s.oneThing)
  const isStreaming = useBriefStore((s) => s.isStreaming)
  const focusToggle = useFocusModeStore((s) => s.toggle)
  const setActiveContext = useUIStore((s) => s.setActiveContext)
  const openDrawer = useUIStore((s) => s.openDrawer)

  if (!oneThing && !isStreaming) return null

  const handleSwap = () => {
    setActiveContext({ kind: 'claim', id: 'claim-0' })
    openDrawer()
    // The drawer will auto-send context; user can ask AI to pick a different priority
  }

  const handleDelegate = () => {
    setActiveContext({ kind: 'claim', id: 'claim-0' })
    openDrawer()
    // Pre-populated context lets user ask AI to draft a delegation message
  }

  const handleStartNow = () => {
    focusToggle()
  }

  return (
    <section
      className="border-l-4 border-l-accent-coral border-t border-border-medium border-b border-b-border-medium py-6 px-4 bg-gradient-to-br from-bg-surface to-bg-elevated shadow-lg shadow-black/5 rounded-r-md"
      data-focus-keep="true"
    >
      {/* Section label */}
      <p className="text-[11px] font-body font-bold uppercase tracking-[0.3em] text-accent-coral mb-3">
        The One Thing Right Now
      </p>

      {oneThing ? (
        <>
          {/* Main task headline */}
          <h2 className="font-display text-2xl sm:text-[28px] font-semibold text-text-primary leading-snug mb-3">
            {oneThing.text}
            {oneThing.citations.map((cite: Citation, j: number) => (
              <Cite key={j} source={cite}>
                <sup className="text-[11px] font-body font-semibold text-accent-coral ml-1">{j + 1}</sup>
              </Cite>
            ))}
          </h2>

          {/* Context paragraph */}
          <p className="font-display text-[15px] italic text-text-secondary leading-relaxed mb-4">
            {oneThing.why}
          </p>

          {/* Source + duration */}
          <p className="text-[11px] font-body text-text-muted mb-5">
            ~30m · {oneThing.citations[0]?.sourceType === 'gmail' ? 'Gmail' : oneThing.citations[0]?.sourceType === 'notion' ? 'Notion' : 'Inbox'} · {oneThing.citations[0]?.snippet || ''}
          </p>

          {/* Action buttons — editorial style */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleStartNow}
              className="text-[11px] font-body font-bold uppercase tracking-[0.15em] px-5 py-2.5 bg-accent-coral text-white hover:bg-accent-coral/90 transition-colors min-h-[40px] flex items-center gap-1.5 animate-[breathe_3s_ease-in-out_infinite]"
              aria-label="Start working on this task now"
            >
              Start Now <ArrowRight size={14} />
            </button>
            <button
              type="button"
              onClick={handleSwap}
              className="text-[11px] font-body font-bold uppercase tracking-[0.15em] px-4 py-2.5 border border-border-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors min-h-[40px]"
              aria-label="Ask AI to suggest a different priority"
            >
              Swap
            </button>
            <button
              type="button"
              onClick={handleDelegate}
              className="text-[11px] font-body font-bold uppercase tracking-[0.15em] px-4 py-2.5 border border-border-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors min-h-[40px] flex items-center gap-1.5"
              aria-label="Open AI assistant to delegate this task"
            >
              Delegate <ArrowRight size={14} />
            </button>
          </div>
        </>
      ) : isStreaming ? (
        <div className="flex items-center gap-2 text-[11px] font-body text-text-muted">
          <div className="spinner" />
          Identifying top priority…
        </div>
      ) : null}
    </section>
  )
}
