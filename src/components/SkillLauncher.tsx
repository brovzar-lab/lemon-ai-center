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
        className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-accent-lemon text-bg-base rounded-full shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity font-body font-bold text-lg"
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
          <div className="relative w-full max-w-sm bg-bg-elevated border border-border-medium rounded-2xl p-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-body font-semibold text-text-primary">Skills</h2>
              <button type="button" onClick={closeSkillLauncher} className="text-text-muted hover:text-text-secondary leading-none p-1" aria-label="Close"><X size={18} /></button>
            </div>

            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills…"
              className="w-full text-sm font-body bg-bg-surface border border-border-soft rounded-lg px-3 py-2 text-text-primary placeholder:text-text-muted outline-none focus:border-border-medium mb-3"
            />

            <div className="overflow-y-auto flex-1 grid grid-cols-2 gap-1.5">
              {filtered.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  data-testid="skill-item"
                  onClick={() => launchSkill(skill)}
                  className="text-left p-3 rounded-xl bg-bg-surface hover:bg-bg-base border border-border-soft hover:border-border-medium transition-colors"
                >
                  <p className="text-xs font-body font-medium text-text-primary">{skill.title}</p>
                  <p className="text-[11px] font-body text-text-muted mt-0.5 leading-tight">{skill.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
