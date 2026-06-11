import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '@/stores/useUIStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { useTaskStore } from '@/stores/useTaskStore'
import { SKILLS } from '@/data/skills'
import { SKILL_PROMPTS } from '@/data/skillPrompts'

export function SkillModal() {
  const { activeModal, closeModal, activeContext, selectedSkillId } = useUIStore()
  const threads = useInboxStore((s) => s.threads)
  const tasks = useTaskStore((s) => s.tasks)
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  const skill = SKILLS.find((s) => s.id === selectedSkillId) || null

  // Auto-populate input from context when modal opens
  useEffect(() => {
    if (activeModal !== 'skill') { setInput(''); setOutput(''); return }

    const contextParts: string[] = []

    // Thread context
    if (activeContext.kind === 'thread') {
      const thread = threads.find((t) => t.id === activeContext.id)
      if (thread) {
        contextParts.push(`Email Thread:\nSubject: ${thread.subject}\nFrom: ${thread.from}\nPriority: ${thread.priority}\n\n${thread.snippet}`)
      }
    }

    // Task context (top 5 Now tasks)
    const nowTasks = tasks.filter((t) => t.bucket === 'now' && !t.done).slice(0, 5)
    if (nowTasks.length > 0) {
      contextParts.push(`Active Tasks:\n${nowTasks.map((t) => `- ${t.title}`).join('\n')}`)
    }

    setInput(contextParts.join('\n\n---\n\n') || '')
  }, [activeModal, activeContext, selectedSkillId])

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  if (activeModal !== 'skill') return null

  const run = async () => {
    if (!input.trim()) return
    setLoading(true)
    setOutput('')

    const systemPrompt = skill ? (SKILL_PROMPTS[skill.id] || `You are running the "${skill.title}" skill. ${skill.description}. Respond to the user's input with actionable, high-quality output.`) : ''
    const fullMessage = systemPrompt
      ? `[SKILL: ${skill?.title}]\n\n${systemPrompt}\n\n---\nUser Input:\n${input}`
      : input

    try {
      const res = await fetch('/api/claude/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullMessage }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const parsed = JSON.parse(line.slice(6))
              if (parsed.type === 'token') {
                accumulated += parsed.text
                setOutput(accumulated)
              }
            } catch {}
          }
        }
      }

      if (!accumulated) setOutput('No response received.')
    } catch {
      setOutput('Error: request failed')
    } finally {
      setLoading(false)
    }
  }

  const copyOutput = () => {
    navigator.clipboard.writeText(output)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close skill modal" className="absolute inset-0 bg-black/60 cursor-default" onClick={closeModal} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-modal-title"
        className="relative w-full max-w-lg bg-bg-elevated border border-border-medium rounded-2xl p-5 shadow-2xl flex flex-col gap-4 max-h-[80vh]"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 id="skill-modal-title" className="text-sm font-body font-semibold text-text-primary">
              {skill?.title || 'Skill'}
            </h2>
            {skill && (
              <p className="text-[11px] font-body text-text-muted mt-0.5">{skill.description}</p>
            )}
          </div>
          <button type="button" aria-label="Close" onClick={closeModal} className="text-text-muted hover:text-text-secondary leading-none p-1"><X size={18} /></button>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          className="w-full text-sm font-body bg-bg-surface border border-border-soft rounded-lg px-3 py-2.5 text-text-primary outline-none focus:border-border-medium resize-none"
          placeholder={skill ? `Provide context for ${skill.title}…` : 'Paste context or describe what you need…'}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={run}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-accent-lemon text-bg-base text-sm font-body font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? 'Running…' : `Run ${skill?.title || 'Skill'}`}
          </button>
          {output && (
            <button
              type="button"
              onClick={copyOutput}
              className="px-3 py-2 text-xs font-body text-text-muted hover:text-text-secondary border border-border-soft rounded-lg transition-colors"
            >
              Copy
            </button>
          )}
        </div>

        {output && (
          <div ref={outputRef} className="flex-1 overflow-y-auto p-3 bg-bg-surface rounded-lg border border-border-soft">
            <p className="text-sm font-body text-text-secondary leading-relaxed whitespace-pre-wrap">{output}</p>
          </div>
        )}
      </div>
    </div>
  )
}
