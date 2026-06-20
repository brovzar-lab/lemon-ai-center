import { useState, useCallback } from 'react'
import { useBriefStore } from '@/stores/useBriefStore'
import { ArrowRight } from 'lucide-react'
import type { DecisionOption } from '@shared/types'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function DecisionCoach() {
  const oneThing = useBriefStore((s) => s.oneThing)
  const aiOptions = useBriefStore((s) => s.decisionOptions)
  const isStreaming = useBriefStore((s) => s.isStreaming)
  const [chosen, setChosen] = useState<DecisionOption | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const options = aiOptions && aiOptions.length > 0 ? aiOptions : null

  const headline = oneThing?.text
    ? `${oneThing.text.split(',')[0]}. Pick one:`
    : null

  // Save the chosen decision to Obsidian via the corrections/captures API
  const handleChoose = useCallback(async (opt: DecisionOption) => {
    setChosen(opt)
    setSaveState('saving')

    try {
      await fetch('/api/captures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type: 'decision',
          context: oneThing?.text ?? '',
          choice: `${opt.label}: ${opt.text}`,
          detail: opt.detail,
          timestamp: new Date().toISOString(),
        }),
      })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }, [oneThing])

  // Keyboard navigation — arrow keys between options
  const handleKeyDown = useCallback((e: React.KeyboardEvent, index: number, total: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      const next = e.currentTarget.parentElement?.children[Math.min(index + 1, total - 1)] as HTMLElement
      next?.focus()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = e.currentTarget.parentElement?.children[Math.max(index - 1, 0)] as HTMLElement
      prev?.focus()
    }
  }, [])

  if (!headline && !isStreaming) return null

  return (
    <section className="py-4" aria-label="Decision coach">
      <p className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3 mb-2">
        Decision Coach
      </p>

      {headline ? (
        <p className="text-[13px] font-sans font-semibold text-ink leading-snug mb-3">
          {headline}
        </p>
      ) : (
        <p className="text-[11px] font-sans text-ink-3 italic mb-3">
          Waiting for AI briefing…
        </p>
      )}

      {chosen && options ? (
        /* Confirmation state after choosing */
        <div className="p-3 rounded-lg bg-data-teal/8 transition-all">
          <p className="text-[12px] font-sans font-semibold text-ink mb-1">
            ✓ {chosen.label}: {chosen.text}
          </p>
          <p className="text-[10px] font-sans italic text-ink-3">
            {saveState === 'saving' && 'Saving to your Obsidian vault…'}
            {saveState === 'saved' && 'Written to decisions log in your vault.'}
            {saveState === 'error' && 'Could not save — check vault connection.'}
            {saveState === 'idle' && 'Logged.'}
          </p>
          <button
            type="button"
            onClick={() => { setChosen(null); setSaveState('idle') }}
            className="text-[10px] font-sans font-semibold text-data-coral hover:underline mt-2 uppercase tracking-[0.15em]"
            aria-label="Change your decision"
          >
            Change <ArrowRight size={12} className="inline" />
          </button>
        </div>
      ) : options ? (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Decision options">
          {options.map((opt, index) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => handleChoose(opt)}
              onKeyDown={(e) => handleKeyDown(e, index, options.length)}
              className="flex items-start gap-2.5 text-left p-2.5 rounded-lg bg-surface shadow-card hover:shadow-hover transition-shadow group min-h-[44px]"
              role="radio"
              aria-checked={false}
              aria-label={`Option ${opt.label}: ${opt.text}. ${opt.detail}`}
            >
              <span className="flex-shrink-0 font-sans text-lg font-bold text-data-coral leading-none mt-0.5 num">
                {opt.label}
              </span>
              <div>
                <p className="text-[12px] font-sans font-medium text-ink leading-snug">
                  {opt.text}
                </p>
                <p className="text-[10px] font-sans italic text-ink-3 mt-0.5">
                  {opt.detail}
                </p>
              </div>
            </button>
          ))}
        </div>
      ) : isStreaming ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface shadow-card">
              <div className="skeleton w-6 h-6 flex-shrink-0 rounded" />
              <div className="flex-1">
                <div className="skeleton skeleton-line w-3/4" />
                <div className="skeleton skeleton-line skeleton-line-short" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <hr className="ed-rule mt-4" />
    </section>
  )
}
