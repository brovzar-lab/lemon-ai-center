import { useState, useRef, useEffect, useCallback } from 'react'
import { useUIStore } from '@/stores/useUIStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { useBriefStore } from '@/stores/useBriefStore'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

export function BillyDrawer() {
  const { drawerOpen, closeDrawer, activeContext } = useUIStore()
  const threads = useInboxStore((s) => s.threads)
  const overview = useBriefStore((s) => s.overview)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (endRef.current && typeof endRef.current.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Reset chat when context changes
  useEffect(() => {
    setMessages([])
    setInput('')
  }, [activeContext.kind, activeContext.id])

  const activeThread = activeContext.kind === 'thread'
    ? threads.find((t) => t.id === activeContext.id)
    : null

  // Resolve claim context from briefing overview
  const activeClaim = activeContext.kind === 'claim' && activeContext.id
    ? (() => {
        const idx = parseInt(activeContext.id.replace('claim-', ''), 10)
        return overview?.[idx] ?? null
      })()
    : null

  // Build context string for any active context type
  const getContextString = useCallback(() => {
    if (activeThread) {
      return `Thread context:\nSubject: ${activeThread.subject}\nFrom: ${activeThread.from}\n\n${activeThread.snippet}`
    }
    if (activeClaim) {
      return `Briefing item context:\n${activeClaim.text}\n\nSources: ${activeClaim.citations.map(c => `${c.sourceType}: ${c.snippet}`).join('; ')}`
    }
    return undefined
  }, [activeThread, activeClaim])

  // Quick action prompts based on context
  const quickPrompts = activeClaim ? [
    'What should I do about this?',
    'Draft a reply',
    'What are the risks?',
  ] : activeThread ? [
    'Summarize this thread',
    'Draft a reply',
    'What action should I take?',
  ] : []

  if (!drawerOpen) return null

  const send = async (directMessage?: string) => {
    const msgText = directMessage || input.trim()
    if (!msgText || streaming) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: msgText }])
    setStreaming(true)

    let assistantText = ''
    setMessages((m) => [...m, { role: 'assistant', text: '' }])

    const context = getContextString()

    try {
      const response = await fetch('/api/claude/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgText, context }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
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
              assistantText += event.text
              setMessages((m) => {
                const updated = [...m]
                updated[updated.length - 1] = { role: 'assistant', text: assistantText }
                return updated
              })
            } else if (event.type === 'error') {
              assistantText = `Error: ${event.message}`
              setMessages((m) => {
                const updated = [...m]
                updated[updated.length - 1] = { role: 'assistant', text: assistantText }
                return updated
              })
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch {
      setMessages((m) => {
        const updated = [...m]
        updated[updated.length - 1] = { role: 'assistant', text: 'Error: request failed. Check that the server is running.' }
        return updated
      })
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div
      data-testid="billy-drawer"
      role="complementary"
      aria-label="Billy AI assistant"
      className="fixed top-0 right-0 h-full z-50 flex flex-col bg-bg-elevated border-l border-border-medium shadow-2xl w-full md:w-[420px]"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-soft">
        <div className="flex-1 min-w-0">
          <span className="font-body font-semibold text-sm text-text-primary">Billy</span>
          {activeThread && (
            <p className="text-[11px] text-text-muted font-body mt-0.5 truncate max-w-[280px]">{activeThread.subject}</p>
          )}
          {activeClaim && (
            <p className="text-[11px] text-text-muted font-body mt-0.5 truncate max-w-[280px]">{activeClaim.text.replace(/\*\*/g, '')}</p>
          )}
        </div>
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close"
          className="text-text-muted hover:text-text-secondary text-xl leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="mt-6">
            <p className="text-sm font-body text-text-muted text-center mb-4">
              {activeThread ? `Discussing: ${activeThread.subject}` : activeClaim ? 'What do you want to know?' : 'What do you need?'}
            </p>
            {/* Quick action prompts */}
            {quickPrompts.length > 0 && (
              <div className="flex flex-col gap-2 px-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => { send(prompt); }}
                    className="text-left text-[12px] font-body text-text-secondary px-3 py-2.5 border border-border-soft rounded-lg hover:border-accent-coral/40 hover:text-text-primary transition-colors"
                  >
                    {prompt} →
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm font-body leading-relaxed ${
              msg.role === 'user'
                ? 'bg-accent-lemon text-bg-base rounded-br-sm'
                : 'bg-bg-surface text-text-secondary rounded-bl-sm border border-border-soft'
            }`}>
              {msg.text || (streaming && msg.role === 'assistant' ? '▊' : '')}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border-soft p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Message Billy…"
          className="flex-1 text-sm font-body bg-bg-surface border border-border-soft rounded-xl px-3.5 py-2.5 text-text-primary placeholder:text-text-muted outline-none focus:border-border-medium"
        />
        <button
          type="button"
          onClick={() => send()}
          disabled={streaming || !input.trim()}
          className="px-4 py-2.5 bg-accent-lemon text-bg-base text-sm font-body font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity"
          aria-label="Send message"
        >
          →
        </button>
      </div>
    </div>
  )
}
