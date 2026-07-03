import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { useSlateChatStore } from '@/stores/useSlateChatStore'

/**
 * The query chat (spec §3) — the slate's unfair advantage. One surface
 * that answers across material + metadata, both languages, with every
 * retrieval step surfaced. The spec's four acceptance queries double as
 * the designed empty state.
 */

const SUGGESTED_QUERIES = [
  'Which of my projects has the weakest second act?',
  'Find me something with a female lead in her 40s I can send to Apple.',
  'What have I not touched in 60 days that has a finished draft?',
  'Which two projects are secretly the same movie?',
]

export function SlateChat() {
  const messages = useSlateChatStore((s) => s.messages)
  const streaming = useSlateChatStore((s) => s.streaming)
  const send = useSlateChatStore((s) => s.send)
  const clear = useSlateChatStore((s) => s.clear)
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (endRef.current && typeof endRef.current.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [messages])

  const submit = (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || streaming) return
    setInput('')
    void send(msg)
  }

  return (
    <div className="bg-surface rounded-xl shadow-card">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
        <div>
          <h3 className="text-[11px] font-sans font-bold uppercase tracking-[0.14em] text-ink-2">
            Ask the slate
          </h3>
          <p className="text-[11px] font-sans text-ink-3 mt-1">
            Material and metadata, Spanish and English, one question away. External submissions
            stay firewalled out of creative answers.
          </p>
        </div>
        {messages.length > 0 && !streaming && (
          <button
            type="button"
            onClick={clear}
            className="text-[10px] font-sans font-medium uppercase tracking-wider text-ink-3 hover:text-ink-2 transition-colors flex-shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      <div className="px-4 py-4 space-y-3 max-h-[440px] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="grid sm:grid-cols-2 gap-2">
            {SUGGESTED_QUERIES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => submit(q)}
                className="text-left text-[12px] font-sans text-ink-2 px-3 py-2.5 rounded-lg bg-sunken hover:bg-accent/10 hover:text-ink transition-colors flex items-start gap-2"
              >
                <Search size={12} className="mt-0.5 flex-shrink-0 text-ink-3" />
                {q}
              </button>
            ))}
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[92%] sm:max-w-[85%] min-w-0">
                {msg.role === 'assistant' && (msg.tools?.length ?? 0) > 0 && (
                  <ul className="mb-1.5 space-y-0.5">
                    {msg.tools!.map((tool, j) => (
                      <li
                        key={j}
                        className="text-[10px] font-mono text-data-violet flex items-baseline gap-1.5 min-w-0"
                      >
                        <span className="flex-shrink-0">⚡</span>
                        <span className="truncate" title={tool.label}>
                          {tool.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-[13px] font-sans leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-accent text-bg rounded-br-sm'
                      : 'bg-sunken text-ink-2 rounded-bl-sm'
                  }`}
                >
                  {msg.text || (streaming && msg.role === 'assistant' ? '▊' : '')}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="px-4 pb-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Ask across every draft, treatment and note…"
          className="flex-1 text-[13px] font-sans bg-bg border border-line rounded-lg px-3.5 py-2.5 text-ink placeholder:text-ink-3 outline-none focus:border-accent transition-colors"
        />
        <button
          type="button"
          onClick={() => submit()}
          disabled={streaming || !input.trim()}
          aria-label="Ask"
          className="px-4 py-2.5 bg-accent text-bg rounded-lg hover:brightness-110 disabled:opacity-40 transition-all flex items-center"
        >
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  )
}
