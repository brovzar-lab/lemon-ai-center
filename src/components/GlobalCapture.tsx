import { useState, useEffect, useCallback } from 'react'
import { useCaptureStore } from '@/stores/useCaptureStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { detectCaptureKind } from '@shared/constants'
import type { Capture } from '@shared/types'

const KIND_BADGE: Record<Capture['kind'], { label: string; class: string }> = {
  todo: { label: 'TODO', class: 'bg-accent-coral/15 text-accent-coral' },
  idea: { label: 'IDEA', class: 'bg-accent-lemon/15 text-accent-lemon' },
  delegate: { label: 'DELEGATE', class: 'bg-accent-sage/15 text-accent-sage' },
}

export function GlobalCapture() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<Capture['kind']>('todo')
  const user = useAuthStore((s) => s.user)
  const createCapture = useCaptureStore((s) => s.create)

  // Auto-detect kind as user types
  useEffect(() => {
    if (text.length > 2) setKind(detectCaptureKind(text))
  }, [text])

  // Global hotkey: Space or ; when no input is focused
  const handleGlobalKey = useCallback(
    (e: KeyboardEvent) => {
      if (open) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement).isContentEditable) return
      if (e.key === ' ' || e.key === ';') {
        e.preventDefault()
        setOpen(true)
      }
    },
    [open],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKey)
    return () => document.removeEventListener('keydown', handleGlobalKey)
  }, [handleGlobalKey])

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setText('')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const handleSubmit = () => {
    if (!text.trim() || !user) return
    createCapture(user.uid, { text: text.trim(), kind })
    setText('')
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-bg-base/60 backdrop-blur-sm"
        onClick={() => { setOpen(false); setText('') }}
      />
      {/* Capture modal */}
      <div className="relative w-full max-w-lg mx-4 bg-bg-surface border border-border-soft rounded-xl shadow-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[9px] font-body font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${KIND_BADGE[kind].class}`}>
            {KIND_BADGE[kind].label}
          </span>
          <span className="text-[10px] font-body text-text-muted">
            auto-detected
          </span>
        </div>
        <input
          type="text"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder="Capture a thought…"
          className="w-full bg-transparent font-body text-lg text-text-primary placeholder-text-muted focus:outline-none"
        />
        <div className="flex items-center justify-between mt-4">
          {/* Kind override pills */}
          <div className="flex gap-1">
            {(['todo', 'idea', 'delegate'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={[
                  'text-[9px] font-body font-semibold uppercase tracking-wider px-2 py-1 rounded-full border transition-colors',
                  kind === k
                    ? KIND_BADGE[k].class + ' border-transparent'
                    : 'text-text-muted border-border-soft hover:border-border-medium',
                ].join(' ')}
              >
                {k}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="text-[11px] font-body font-semibold uppercase tracking-wider px-4 py-2 rounded-lg bg-accent-coral text-white hover:bg-accent-coral/90 transition-colors disabled:opacity-40"
          >
            Capture ↵
          </button>
        </div>
      </div>
    </div>
  )
}
