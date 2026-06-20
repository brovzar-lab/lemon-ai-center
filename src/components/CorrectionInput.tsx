import { useState, useRef, useCallback } from 'react'
import { X } from 'lucide-react'

type CorrectionState = 'idle' | 'submitting' | 'success' | 'error'

interface CorrectionResult {
  memory: string
  summary: string
  savedTo: string
}

/**
 * A floating feedback input that lets the CEO correct the dashboard.
 * Type a correction → AI distills it into a memory statement → saved to the
 * CEO's Memory (Firestore) → injected into every future briefing.
 */
export function CorrectionInput() {
  const [text, setText] = useState('')
  const [state, setState] = useState<CorrectionState>('idle')
  const [result, setResult] = useState<CorrectionResult | null>(null)
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const submit = useCallback(async () => {
    if (!text.trim() || state === 'submitting') return
    setState('submitting')
    setResult(null)

    try {
      const res = await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ correction: text }),
      })

      if (!res.ok) throw new Error('Failed to save correction')
      const { data } = await res.json()
      setResult(data)
      setState('success')
      setText('')

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setState('idle')
        setResult(null)
        setExpanded(false)
      }, 5000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }, [text, state])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') {
      setExpanded(false)
      setText('')
    }
  }

  // Collapsed: just a small trigger button
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true)
          setTimeout(() => inputRef.current?.focus(), 100)
        }}
        className="correction-trigger"
        aria-label="Correct the dashboard"
        title="Teach the AI — correct something on this dashboard"
      >
        <span className="correction-trigger-icon">✏️</span>
        <span className="correction-trigger-label">Correct</span>
      </button>
    )
  }

  return (
    <div className="correction-panel" role="dialog" aria-label="Dashboard correction">
      {/* Header */}
      <div className="correction-header">
        <div>
          <span className="correction-title">Save a correction</span>
          <p className="text-[10px] font-sans text-ink-3 mt-0.5">
            Saved to your <strong>Memory</strong> — remembered by the assistant and applied to every future briefing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setExpanded(false); setText(''); setState('idle'); setResult(null) }}
          className="correction-close"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Success state */}
      {state === 'success' && result && (
        <div className="correction-success">
          <p className="correction-success-title">✓ Saved to Memory</p>
          <p className="correction-success-rule">{result.memory}</p>
          <p className="correction-success-meta">
            Remembered by the assistant · shapes future briefings
          </p>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <p className="correction-error">Failed to save. Try again.</p>
      )}

      {/* Input area */}
      {state !== 'success' && (
        <>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='e.g. "Pound Sand has nothing to do with Crisanto — remove that connection" or "Script Magazine is a newsletter, never show as HOT"'
            className="correction-textarea"
            rows={3}
            disabled={state === 'submitting'}
            aria-label="Type your correction"
          />
          <div className="correction-footer">
            <span className="correction-hint">⌘ Enter to submit</span>
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() || state === 'submitting'}
              className="correction-submit"
            >
              {state === 'submitting' ? (
                <span className="correction-spinner" />
              ) : (
                'Save to Memory'
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
