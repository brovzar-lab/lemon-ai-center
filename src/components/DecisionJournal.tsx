import { useState } from 'react'
import { useDecisionStore } from '@/stores/useDecisionStore'
import { useAuthStore } from '@/stores/useAuthStore'

export function DecisionJournal() {
  const { decisions, searchQuery, filteredDecisions, add, setSearch, exportMd } = useDecisionStore()
  const user = useAuthStore((s) => s.user)
  const [draft, setDraft] = useState('')

  const submit = () => {
    if (!draft.trim() || !user) return
    add(user.uid, draft.trim())
    setDraft('')
  }

  const handleExport = () => {
    const md = exportMd()
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `decisions-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-sans font-semibold text-ink-3 tracking-widest uppercase">Decisions</h2>
        <button type="button" onClick={handleExport} className="text-[11px] font-sans text-ink-3 hover:text-ink-2 transition-colors">
          Export
        </button>
      </div>

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder="Log a decision…"
        className="w-full text-sm font-sans bg-sunken border border-line rounded-lg px-3 py-2 text-ink placeholder:text-ink-3 outline-none focus:border-line transition-colors"
      />

      <input
        value={searchQuery}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search decisions…"
        className="w-full text-xs font-sans bg-transparent border border-line rounded-lg px-3 py-1.5 text-ink-2 placeholder:text-ink-3 outline-none focus:border-line transition-colors"
      />

      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        {filteredDecisions.map((d) => (
          <div key={d.id} className="p-2.5 rounded-lg hover:bg-sunken transition-colors">
            <p className="text-sm font-sans text-ink-2 leading-relaxed">{d.text}</p>
            <p className="text-[10px] text-ink-3 font-sans mt-1">{d.ts.slice(0, 10)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
