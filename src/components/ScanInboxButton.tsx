import { useState, useCallback } from 'react'
import { Scan, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

interface ScanStats {
  deals: number
  projects: number
  delegations: number
  memories: number
}

type ScanPhase = 'idle' | 'fetching' | 'analyzing' | 'saving' | 'done' | 'error'

export function useScanInbox() {
  const [phase, setPhase] = useState<ScanPhase>('idle')
  const [message, setMessage] = useState('')
  const [stats, setStats] = useState<ScanStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startScan = useCallback(async (maxThreads = 40) => {
    setPhase('fetching')
    setMessage('Starting scan…')
    setStats(null)
    setError(null)

    try {
      // Get CSRF token (resilient to failures)
      let token = ''
      try {
        const csrfRes = await fetch('/api/csrf')
        if (csrfRes.ok) {
          const csrfData = await csrfRes.json()
          token = csrfData.data?.token || ''
        }
      } catch {
        // proceed without CSRF token
      }

      const response = await fetch('/api/scan/inbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify({ maxThreads }),
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: { message: 'Scan failed' } }))
        throw new Error(errBody.error?.message || `HTTP ${response.status}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          try {
            const event = JSON.parse(trimmed.slice(6))
            if (event.type === 'progress') {
              setPhase(event.phase || 'fetching')
              setMessage(event.message || '')
            } else if (event.type === 'done') {
              setPhase('done')
              setMessage(event.message || 'Scan complete!')
              setStats(event.stats || null)
            } else if (event.type === 'error') {
              setPhase('error')
              setError(event.message || 'Scan failed')
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err: any) {
      setPhase('error')
      setError(err.message || 'Scan failed')
    }
  }, [])

  return { phase, message, stats, error, startScan }
}

/**
 * Inline scan button — can be placed in headers, empty states, etc.
 */
export function ScanInboxButton({ compact }: { compact?: boolean }) {
  const { phase, message, stats, error, startScan } = useScanInbox()

  const isRunning = phase === 'fetching' || phase === 'analyzing' || phase === 'saving'

  if (phase === 'done' && stats) {
    return (
      <div className="flex items-center gap-2 text-[11px] font-sans text-data-teal min-w-0">
        <CheckCircle2 size={14} className="flex-shrink-0" />
        <span className="truncate max-w-[44vw] sm:max-w-none">
          Found {stats.deals} deals, {stats.projects} projects, {stats.delegations} delegations, {stats.memories} memories
        </span>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex items-center gap-2 text-[11px] font-sans text-data-coral">
        <AlertTriangle size={14} />
        <span>{error}</span>
        <button
          type="button"
          onClick={() => startScan(40)}
          className="underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    )
  }

  if (isRunning) {
    return (
      <div className="flex items-center gap-2 text-[11px] font-sans text-ink-2 min-w-0">
        <Loader2 size={14} className="animate-spin flex-shrink-0" />
        <span className="truncate max-w-[44vw] sm:max-w-none">{message}</span>
      </div>
    )
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => startScan(40)}
        className="text-[11px] font-sans font-semibold uppercase tracking-wider text-data-coral hover:text-data-coral/80 transition-colors flex items-center gap-1.5 min-h-[36px] flex-shrink-0"
        aria-label="Scan inbox for deals, projects, and delegations"
      >
        <Scan size={14} />
        <span className="hidden sm:inline">Scan Inbox</span>
      </button>
    )
  }

  return (
    <div className="bg-surface border border-line rounded-xl p-6 text-center space-y-3">
      <div className="flex justify-center">
        <Scan size={24} className="text-data-coral" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink">
        Auto-populate from your inbox
      </h3>
      <p className="text-[12px] font-sans text-ink-3 max-w-md mx-auto leading-relaxed">
        AI will scan your last 40 emails and automatically extract deals, projects,
        delegations, and important facts into your dashboard.
      </p>
      <button
        type="button"
        onClick={() => startScan(40)}
        className="text-[11px] font-sans font-bold uppercase tracking-[0.15em] px-5 py-2.5 bg-data-coral text-white hover:bg-data-coral/90 transition-colors rounded-md min-h-[40px]"
      >
        Scan 40 Emails Now
      </button>
    </div>
  )
}
