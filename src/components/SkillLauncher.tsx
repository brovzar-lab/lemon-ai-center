import { useState } from 'react'
import { useUIStore } from '@/stores/useUIStore'
import { X } from 'lucide-react'
import { SKILLS } from '@/data/skills'
import type { Skill } from '@shared/types'

export function SkillLauncher() {
  const { skillLauncherOpen, openSkillLauncher, closeSkillLauncher, openModal, setActiveContext, activeContext, setSelectedSkillId } = useUIStore()
  const [search, setSearch] = useState('')

  const filtered = SKILLS.filter(
    (s) =>
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()),
  )

  const launchSkill = (skill: Skill) => {
    setSelectedSkillId(skill.id)
    setActiveContext({ kind: activeContext.kind, id: activeContext.id })
    openModal('skill')
    closeSkillLauncher()
  }

  return (
    <>
      <button
        type="button"
        data-testid="skill-launcher-fab"
        onClick={() => (skillLauncherOpen ? closeSkillLauncher() : openSkillLauncher())}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-accent text-bg rounded-full shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity font-sans font-bold text-lg"
        aria-label="Open skill launcher"
      >
        ✦
      </button>

      {skillLauncherOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4">
          <button
            type="button"
            aria-label="Close skill launcher"
            className="absolute inset-0 bg-black/40 cursor-default"
            onClick={closeSkillLauncher}
          />
          <div className="relative w-full max-w-sm bg-sunken border border-line rounded-2xl p-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-sans font-semibold text-ink">Skills</h2>
              <button type="button" onClick={closeSkillLauncher} className="text-ink-3 hover:text-ink-2 leading-none p-1" aria-label="Close"><X size={18} /></button>
            </div>

            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills…"
              className="w-full text-sm font-sans bg-surface border border-line rounded-lg px-3 py-2 text-ink placeholder:text-ink-3 outline-none focus:border-line mb-3"
            />

            <div className="overflow-y-auto flex-1 grid grid-cols-2 gap-1.5">
              {filtered.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  data-testid="skill-item"
                  onClick={() => launchSkill(skill)}
                  className="text-left p-3 rounded-xl bg-surface hover:bg-bg border border-line hover:border-line transition-colors"
                >
                  <p className="text-xs font-sans font-medium text-ink">{skill.title}</p>
                  <p className="text-[11px] font-sans text-ink-3 mt-0.5 leading-tight">{skill.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
