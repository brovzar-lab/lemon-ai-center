import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import { useSlateSkillsStore } from '@/stores/useSlateSkillsStore'
import { useSlateStore } from '@/stores/useSlateStore'
import type { SlateSkillRun } from '@shared/types'

/**
 * The firing surface (spec §4): project × skill → run. Results never live
 * in a chat scroll — they land in the project's coverage/ folder, get
 * indexed, and the run log below is the receipt. Review-pending skills
 * (film-finance, chivo — D6.3) are visible but locked until Billy
 * approves their SKILL.md.
 */
export function SlateSkills() {
  const skills = useSlateSkillsStore((s) => s.skills)
  const runs = useSlateSkillsStore((s) => s.runs)
  const loaded = useSlateSkillsStore((s) => s.loaded)
  const firing = useSlateSkillsStore((s) => s.firing)
  const error = useSlateSkillsStore((s) => s.error)
  const refresh = useSlateSkillsStore((s) => s.refresh)
  const fire = useSlateSkillsStore((s) => s.fire)
  const projects = useSlateStore((s) => s.projects)

  const [skillId, setSkillId] = useState('')
  const [projectSlug, setProjectSlug] = useState('')

  useEffect(() => {
    if (!loaded) void refresh()
  }, [loaded, refresh])

  const live = projects.filter((p) => p.status !== 'dead')
  const selected = skills.find((s) => s.id === skillId)
  const ready = skillId && projectSlug && selected?.status === 'live' && !firing

  if (loaded && skills.length === 0) return null // no skill library on this host

  return (
    <div className="bg-surface rounded-xl shadow-card px-4 py-4">
      <h3 className="text-[11px] font-sans font-bold uppercase tracking-[0.14em] text-ink-2">
        Fire a skill
      </h3>
      <p className="text-[11px] font-sans text-ink-3 mt-1">
        Skill × project. The result lands in the project&apos;s{' '}
        <code className="font-mono text-[10px]">coverage/</code> folder and joins the index —
        never lost in a chat scroll.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={skillId}
          onChange={(e) => setSkillId(e.target.value)}
          className="text-[12px] font-sans bg-bg border border-line rounded-lg px-3 py-2 text-ink outline-none focus:border-accent transition-colors min-w-[180px]"
        >
          <option value="">Pick a skill…</option>
          {skills.map((s) => (
            <option key={s.id} value={s.id} disabled={s.status !== 'live'}>
              {s.id}
              {s.status === 'review-pending' ? ' — awaiting your review' : ''}
            </option>
          ))}
        </select>
        <select
          value={projectSlug}
          onChange={(e) => setProjectSlug(e.target.value)}
          className="text-[12px] font-sans bg-bg border border-line rounded-lg px-3 py-2 text-ink outline-none focus:border-accent transition-colors min-w-[180px]"
        >
          <option value="">Pick a project…</option>
          {live.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title}
              {p.origin === 'external' ? ' (external)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!ready}
          onClick={() => void fire(skillId, projectSlug)}
          className="inline-flex items-center gap-1.5 text-[11px] font-sans font-semibold uppercase tracking-wider bg-accent text-bg px-3.5 py-2 rounded-lg hover:brightness-110 transition-all disabled:opacity-40"
        >
          <Zap size={12} />
          {firing ? 'Firing…' : 'Run'}
        </button>
        {selected?.status === 'review-pending' && (
          <span className="text-[11px] font-sans text-data-coral">
            Locked until you review skills/{selected.id}/SKILL.md
          </span>
        )}
        {error && <span className="text-[11px] font-sans text-data-coral">{error}</span>}
      </div>

      {selected && (
        <p className="mt-2 text-[11px] font-sans text-ink-3 leading-relaxed line-clamp-2">
          {selected.description}
        </p>
      )}

      {runs.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
          {runs.slice(0, 6).map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </ul>
      )}
    </div>
  )
}

const STATUS_STYLE: Record<SlateSkillRun['status'], string> = {
  running: 'bg-data-violet/15 text-data-violet animate-pulse',
  done: 'bg-data-teal/15 text-data-teal',
  failed: 'bg-data-coral/15 text-data-coral',
}

function RunRow({ run }: { run: SlateSkillRun }) {
  const when = run.startedAt.slice(0, 16).replace('T', ' ')
  return (
    <li className="flex items-baseline gap-2 min-w-0">
      <span
        className={`text-[9px] font-sans font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${STATUS_STYLE[run.status]}`}
      >
        {run.status}
      </span>
      <span className="text-[11px] font-sans text-ink flex-shrink-0">
        {run.skill} <span className="text-ink-3">×</span> {run.project}
      </span>
      {run.status === 'done' && run.outputFile && (
        <span className="text-[10px] font-mono text-ink-3 truncate" title={run.outputFile}>
          {run.outputFile}
        </span>
      )}
      {run.status === 'failed' && run.error && (
        <span className="text-[11px] font-sans text-data-coral truncate" title={run.error}>
          {run.error}
        </span>
      )}
      <span className="text-[10px] font-sans text-ink-3 ml-auto flex-shrink-0 tabular-nums hidden sm:inline">
        {when}
      </span>
    </li>
  )
}
