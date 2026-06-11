import { useState, useRef, useCallback } from 'react'
import { X } from 'lucide-react'

type CorrectionState = 'idle' | 'submitting' | 'success' | 'error'

interface CorrectionResult {
  rule: string
  category: string
  summary: string
  action: string
  savedTo: string
}

/**
 * A floating feedback input that lets the CEO correct the dashboard.
 * Type a correction → AI extracts a rule → saves to Obsidian Brain → future briefings learn.
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
          <span className="correction-title">Teach the AI</span>
          <p className="text-[10px] font-body text-text-muted mt-0.5">
            Your note becomes a rule in <code>briefing-rules.md</code> — applied to every future briefing.
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
          <p className="correction-success-title">✓ Rule saved</p>
          <p className="correction-success-rule">{result.rule}</p>
          <p className="correction-success-meta">
            Saved to <code>{result.savedTo}</code> · Category: {result.category}
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
                'Save Rule'
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
