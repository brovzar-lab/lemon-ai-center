import type { Claim } from '@shared/types'
import { useConnectionStore } from '@/stores/useConnectionStore'

export type BriefSseEvent =
  | { type: 'cached'; jarvis: string; billy: string; generatedAt?: string; isStale: boolean; isDemo?: boolean; overview?: Claim[]; oneThing?: Claim & { why: string }; longBrief?: string; decisionOptions?: import('@shared/types').DecisionOption[]; soulNote?: string }
  | { type: 'overview'; overview: Claim[] }
  | { type: 'oneThing'; oneThing: Claim & { why: string } }
  | { type: 'decisionOptions'; decisionOptions: import('@shared/types').DecisionOption[] }
  | { type: 'soulNote'; soulNote: string }
  | { type: 'degraded'; reason: string }
  | { type: 'token'; voice: 'jarvis' | 'billy'; text: string }
  | { type: 'replaceProse'; text: string }
  | { type: 'done'; jarvis: string; billy: string; generatedAt: string; briefId: string; overview?: Claim[]; oneThing?: Claim & { why: string }; longBrief?: string; decisionOptions?: import('@shared/types').DecisionOption[]; soulNote?: string; degraded?: boolean }
  | { type: 'error'; message: string }

export function parseSseEvent(line: string): BriefSseEvent | null {
  if (!line.startsWith('data: ')) return null
  try {
    return JSON.parse(line.slice(6)) as BriefSseEvent
  } catch {
    return null
  }
}

export interface BriefStreamCallbacks {
  onCached: (event: Extract<BriefSseEvent, { type: 'cached' }>) => void
  onOverview?: (overview: Claim[]) => void
  onOneThing?: (oneThing: Claim & { why: string }) => void
  onDecisionOptions?: (options: import('@shared/types').DecisionOption[]) => void
  onSoulNote?: (note: string) => void
  onDegraded?: (reason: string) => void
  onToken: (voice: 'jarvis' | 'billy', text: string) => void
  onReplaceProse?: (text: string) => void
  onDone: (event: Extract<BriefSseEvent, { type: 'done' }>) => void
  onError: (message: string) => void
}

export function startBriefStream(
  forceRefresh: boolean,
  callbacks: BriefStreamCallbacks,
): () => void {
  const controller = new AbortController()

  ;(async () => {
    try {
      const response = await fetch('/api/claude/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRefresh }),
        signal: controller.signal,
      })

      if (!response.ok) {
        // Read the error body so a dead Google token (REAUTH_REQUIRED) raises
        // the app-wide reconnect banner — the brief is the default, polled view,
        // so this is the most likely place to hit it. Without this it failed
        // completely silently (no body read, no banner).
        let message = 'Brief request failed'
        try {
          const body = await response.json()
          if (body?.error?.code === 'REAUTH_REQUIRED') {
            useConnectionStore.getState().setReauthRequired(true)
          }
          message = body?.error?.message ?? message
        } catch {
          /* non-JSON error body */
        }
        callbacks.onError(message)
        return
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/event-stream')) {
        // Cached JSON response
        const json = await response.json()
        if (json.data) {
          callbacks.onCached({ type: 'cached', ...json.data, isStale: false })
          // Surface overview/oneThing from cached data if present
          if (json.data.overview) callbacks.onOverview?.(json.data.overview)
          if (json.data.oneThing) callbacks.onOneThing?.(json.data.oneThing)
          callbacks.onDone({ type: 'done', ...json.data, briefId: '', generatedAt: json.data.generatedAt ?? '' })
        }
        return
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sawDone = false

      const dispatch = (event: BriefSseEvent) => {
        if (event.type === 'cached') callbacks.onCached(event)
        else if (event.type === 'overview') callbacks.onOverview?.(event.overview)
        else if (event.type === 'oneThing') callbacks.onOneThing?.(event.oneThing)
        else if (event.type === 'decisionOptions') callbacks.onDecisionOptions?.(event.decisionOptions)
        else if (event.type === 'soulNote') callbacks.onSoulNote?.(event.soulNote)
        else if (event.type === 'degraded') callbacks.onDegraded?.(event.reason)
        else if (event.type === 'token') callbacks.onToken(event.voice, event.text)
        else if (event.type === 'replaceProse') callbacks.onReplaceProse?.(event.text)
        else if (event.type === 'done') {
          sawDone = true
          callbacks.onDone(event)
        } else if (event.type === 'error') callbacks.onError(event.message)
      }

      const consumeLines = (lines: string[]) => {
        for (const line of lines) {
          const event = parseSseEvent(line.trim())
          if (!event) continue
          dispatch(event)
        }
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          consumeLines(buffer.split('\n'))
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        consumeLines(lines)
      }

      if (!sawDone) {
        callbacks.onError('Brief stream ended before completion')
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        callbacks.onError('Stream error')
      }
    }
  })()

  return () => controller.abort()
}
