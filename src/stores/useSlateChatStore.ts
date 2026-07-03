import { create } from 'zustand'

/**
 * DEVELOPMENT-HELL query chat. Conversation state lives here (not in the
 * component) so an answer survives switching views; the server keeps no
 * chat state — history rides with each request. SSE consumption mirrors
 * the Billy Drawer: token events append text, tool events surface what
 * the brain searched/read so retrieval is never invisible.
 */

export interface SlateChatToolCall {
  name: string
  label: string
}

export interface SlateChatMessage {
  role: 'user' | 'assistant'
  text: string
  tools?: SlateChatToolCall[]
}

interface SlateChatState {
  messages: SlateChatMessage[]
  streaming: boolean
  send: (message: string) => Promise<void>
  clear: () => void
}

const HISTORY_TURNS = 12 // most recent turns sent back to the server

export const useSlateChatStore = create<SlateChatState>()((set, get) => ({
  messages: [],
  streaming: false,

  clear: () => set({ messages: [] }),

  send: async (message: string) => {
    const text = message.trim()
    if (!text || get().streaming) return

    // History = everything before this exchange, text only, capped.
    const history = get()
      .messages.filter((m) => m.text.length > 0)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text }))

    set({
      streaming: true,
      messages: [...get().messages, { role: 'user', text }, { role: 'assistant', text: '', tools: [] }],
    })

    const patchLast = (patch: (last: SlateChatMessage) => SlateChatMessage) =>
      set((s) => {
        const messages = [...s.messages]
        messages[messages.length - 1] = patch(messages[messages.length - 1])
        return { messages }
      })

    try {
      const response = await fetch('/api/slate/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })

      if (!response.ok) {
        let detail = `HTTP ${response.status}`
        try {
          const body = await response.json()
          if (body?.error?.message) detail = body.error.message
        } catch {
          // non-JSON error body — keep the status line
        }
        patchLast((last) => ({ ...last, text: `Error: ${detail}` }))
        return
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
            if (event.type === 'token' && typeof event.text === 'string') {
              patchLast((last) => ({ ...last, text: last.text + event.text }))
            } else if (event.type === 'tool' && typeof event.label === 'string') {
              patchLast((last) => ({
                ...last,
                tools: [...(last.tools ?? []), { name: String(event.name ?? ''), label: event.label }],
              }))
            } else if (event.type === 'error') {
              patchLast((last) => ({
                ...last,
                text: last.text || `Error: ${event.message ?? 'the slate brain failed'}`,
              }))
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch {
      patchLast((last) => ({
        ...last,
        text: last.text || 'Error: request failed. Check that the server is running.',
      }))
    } finally {
      set({ streaming: false })
    }
  },
}))
