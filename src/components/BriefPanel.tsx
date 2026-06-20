import { useState } from 'react'
import { useBriefStore } from '@/stores/useBriefStore'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'

export function BriefPanel() {
  const { jarvis, billy, isStale, isStreaming, longBrief } = useBriefStore()
  const { newDashboard } = useFeatureFlags()
  const [expanded, setExpanded] = useState(false)

  if (newDashboard) {
    // Editorial style: collapsible "Read the longer version" section
    return (
      <section className="py-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[9px] font-sans font-bold uppercase tracking-[0.3em] text-ink-3 hover:text-ink-2 transition-colors"
        >
          {expanded ? 'Collapse ↑' : 'Read the Longer Version (2m) ↓'}
        </button>

        {expanded && (
          <div className="mt-3">
            {isStale && (
              <span className="text-[9px] font-sans text-ink-3 mb-2 block">updating…</span>
            )}
            <div
              data-testid="brief-jarvis"
              className="font-display text-[15px] leading-[1.7] text-ink whitespace-pre-line"
              style={{ opacity: isStreaming ? 0.7 : 1, transition: 'opacity 200ms' }}
            >
              {longBrief || jarvis}
            </div>
            {billy && !longBrief && (
              <div className="border-t border-line pt-3 mt-3">
                <p
                  data-testid="brief-billy"
                  className="font-sans text-[14px] leading-relaxed text-ink-2"
                >
                  {billy}
                </p>
              </div>
            )}
          </div>
        )}
        <hr className="ed-rule mt-4" />
      </section>
    )
  }

  // Legacy layout
  return (
    <section
      aria-label="Executive Briefing"
      className="mt-4 p-5 bg-surface rounded-xl shadow-card hover:shadow-hover transition-shadow"
      style={{ transition: 'opacity 200ms ease-in-out', opacity: isStreaming ? 0.8 : 1 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-sans text-[11px] font-semibold text-ink-3 uppercase tracking-widest">
          Executive Briefing
        </h2>
        <div className="flex items-center gap-2">
          {isStale && (
            <span
              data-testid="brief-stale-badge"
              className="text-xs text-ink-3 font-sans px-2 py-0.5 rounded-full border border-line"
            >
              updating…
            </span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <p
          data-testid="brief-jarvis"
          className="font-sans text-[19px] font-semibold leading-relaxed text-ink"
        >
          {jarvis}
        </p>
        <div className="border-t border-line pt-4">
          <p
            data-testid="brief-billy"
            className="font-sans text-[15px] leading-relaxed text-ink-2"
          >
            {billy}
          </p>
        </div>
      </div>
    </section>
  )
}
