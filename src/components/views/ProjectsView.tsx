import { useEffect, useMemo, useState } from 'react'
import { useProjectsStore } from '@/stores/lemon/useProjectsStore'
import { useTaskStore } from '@/stores/useTaskStore'
import { BoardKanban, type BoardColumnDef } from '@/components/workspace/BoardKanban'
import { EmptyState } from '@/components/workspace/EmptyState'
import { ScanInboxButton } from '@/components/ScanInboxButton'
import type { LemonProject, ProjectCategory, ProjectFormat } from '@shared/types'

const COLUMNS: BoardColumnDef<ProjectCategory>[] = [
  { key: 'development', label: 'Development', accent: 'var(--data-blue)', subtitle: 'Story → green-light' },
  { key: 'pre_production', label: 'Pre-Production', accent: 'var(--accent)', subtitle: 'Crewing & prep' },
  { key: 'production', label: 'Production', accent: 'var(--data-coral)', subtitle: 'On the floor' },
  { key: 'post_production', label: 'Post', accent: 'var(--data-teal)', subtitle: 'Cut & finish' },
  { key: 'deals_business', label: 'Deals & Biz', accent: 'var(--error)', subtitle: 'Comm. side' },
]

const FORMAT_LABELS: Record<ProjectFormat, string> = {
  film: 'Film',
  series: 'Series',
  deal: 'Deal',
}

interface NewProjectForm {
  title: string
  format: ProjectFormat
  platform: string
  category: ProjectCategory
  status_detail: string
  next_action: string
}

const EMPTY_FORM: NewProjectForm = {
  title: '',
  format: 'film',
  platform: '',
  category: 'development',
  status_detail: '',
  next_action: '',
}

export function ProjectsView() {
  const projects = useProjectsStore((s) => s.projects)
  const subscribe = useProjectsStore((s) => s.subscribe)
  const create = useProjectsStore((s) => s.create)
  const updateCategory = useProjectsStore((s) => s.updateCategory)
  const update = useProjectsStore((s) => s.update)
  const remove = useProjectsStore((s) => s.remove)
  const loading = useProjectsStore((s) => s.loading)
  const tasks = useTaskStore((s) => s.tasks)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewProjectForm>(EMPTY_FORM)
  const [activeProject, setActiveProject] = useState<LemonProject | null>(null)

  useEffect(() => subscribe(), [subscribe])

  const taskByProject = useMemo(() => {
    // Heuristic linkage — match a task's notes/title against project title.
    // This is a temporary bridge until tasks gain a real `projectId` field.
    const map = new Map<string, number>()
    const lowered = projects.map((p) => ({ id: p.id, title: p.title.toLowerCase() }))
    for (const task of tasks) {
      if (task.done) continue
      const hay = `${task.title.toLowerCase()} ${(task.notes ?? '').toLowerCase()}`
      for (const proj of lowered) {
        if (proj.title.length >= 4 && hay.includes(proj.title)) {
          map.set(proj.id, (map.get(proj.id) ?? 0) + 1)
        }
      }
    }
    return map
  }, [projects, tasks])

  function reset() {
    setForm(EMPTY_FORM)
    setShowForm(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    await create({
      title: form.title.trim(),
      format: form.format,
      platform: form.platform.trim() || undefined,
      category: form.category,
      status_detail: form.status_detail.trim() || undefined,
      next_action: form.next_action.trim() || undefined,
    })
    reset()
  }

  return (
    <section className="space-y-4 animate-in">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink leading-tight">
            Projects
          </h2>
          <p className="text-xs font-sans text-ink-3 mt-1">
            {projects.length} total · drag between stages · linked tasks pulled from your task list by title match
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="text-[11px] font-sans font-medium uppercase tracking-wider px-3 py-1.5 rounded-md border border-line hover:border-line text-ink-2 hover:text-ink transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Project'}
        </button>
      </header>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-surface border border-line rounded-xl p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Title" required>
              <input
                autoFocus
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="The Quiet Year"
                className="form-input"
                required
              />
            </Field>
            <Field label="Platform">
              <input
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                placeholder="Netflix · A24 · TBD"
                className="form-input"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Format">
              <select
                value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value as ProjectFormat })}
                className="form-input"
              >
                {(Object.keys(FORMAT_LABELS) as ProjectFormat[]).map((f) => (
                  <option key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Stage">
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as ProjectCategory })
                }
                className="form-input"
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status detail">
              <input
                value={form.status_detail}
                onChange={(e) => setForm({ ...form, status_detail: e.target.value })}
                placeholder="2nd draft with director"
                className="form-input"
              />
            </Field>
          </div>
          <Field label="Next action">
            <input
              value={form.next_action}
              onChange={(e) => setForm({ ...form, next_action: e.target.value })}
              placeholder="Send to financier"
              className="form-input"
            />
          </Field>
          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={reset}
              className="text-[11px] font-sans text-ink-3 hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-accent text-bg px-4 py-1.5 rounded-md hover:brightness-110 transition-all"
            >
              Save project
            </button>
          </div>
        </form>
      )}

      {loading && projects.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-10 text-center">
          <div className="w-4 h-4 mx-auto rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <>
        <EmptyState
          title="No projects yet"
          body="Add your first project or scan your inbox to auto-populate."
          cta={{ label: 'Add a project', onClick: () => setShowForm(true) }}
        />
        <div className="mt-4">
          <ScanInboxButton />
        </div>
        </>
      ) : (
        <BoardKanban
          columns={COLUMNS}
          items={projects}
          getColumn={(p) => p.category}
          onMove={(id, target) => updateCategory(id, target)}
          onCardClick={(p) => setActiveProject(p)}
          renderCard={(project) => (
            <ProjectCard
              project={project}
              linkedTaskCount={taskByProject.get(project.id) ?? 0}
            />
          )}
        />
      )}

      {activeProject && (
        <ProjectDetail
          project={activeProject}
          onClose={() => setActiveProject(null)}
          onUpdate={async (patch) => {
            await update(activeProject.id, patch)
            setActiveProject({ ...activeProject, ...patch })
          }}
          onDelete={async () => {
            await remove(activeProject.id)
            setActiveProject(null)
          }}
          linkedTaskCount={taskByProject.get(activeProject.id) ?? 0}
        />
      )}

      <style>{`
        .form-input {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--line);
          color: var(--ink);
          font-size: 12px;
          font-family: var(--font-body);
          padding: 8px 10px;
          border-radius: 8px;
          outline: none;
          transition: border-color 150ms;
        }
        .form-input:focus {
          border-color: var(--accent);
        }
      `}</style>
    </section>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 mb-1">
        {label}
        {required && <span className="ml-1 text-data-coral">*</span>}
      </span>
      {children}
    </label>
  )
}

function ProjectCard({
  project,
  linkedTaskCount,
}: {
  project: LemonProject
  linkedTaskCount: number
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[12px] font-sans font-semibold leading-snug text-ink flex-1 min-w-0">
          {project.title}
        </h4>
        {project.format && (
          <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-sunken text-ink-3 flex-shrink-0">
            {FORMAT_LABELS[project.format]}
          </span>
        )}
      </div>
      {project.platform && (
        <p className="text-[10px] font-sans italic text-ink-3 mt-1">
          {project.platform}
        </p>
      )}
      {project.status_detail && (
        <p className="text-[11px] font-sans text-ink-3 mt-1 line-clamp-2 leading-snug">
          {project.status_detail}
        </p>
      )}
      {project.next_action && (
        <p className="text-[11px] font-sans italic mt-1.5 truncate text-ink-3">
          → {project.next_action}
        </p>
      )}
      {linkedTaskCount > 0 && (
        <p className="text-[10px] font-sans text-accent mt-1.5">
          {linkedTaskCount} task{linkedTaskCount === 1 ? '' : 's'} linked
        </p>
      )}
    </>
  )
}

interface ProjectDetailProps {
  project: LemonProject
  onClose: () => void
  onUpdate: (patch: Partial<LemonProject>) => Promise<void>
  onDelete: () => Promise<void>
  linkedTaskCount: number
}

function ProjectDetail({
  project,
  onClose,
  onUpdate,
  onDelete,
  linkedTaskCount,
}: ProjectDetailProps) {
  const [editingNextAction, setEditingNextAction] = useState(project.next_action ?? '')
  const [editingStatus, setEditingStatus] = useState(project.status_detail ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Project — ${project.title}`}
      className="modal-backdrop"
      onClick={onClose}
    >
      <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="min-w-0">
            <h3 className="modal-title truncate">{project.title}</h3>
            <p className="text-[11px] font-sans text-ink-3">
              {COLUMNS.find((c) => c.key === project.category)?.label} · {project.format ? FORMAT_LABELS[project.format] : '—'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Close">
            ×
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Row label="Platform" value={project.platform ?? '—'} />
          <Row label="Format" value={project.format ? FORMAT_LABELS[project.format] : '—'} />
          <Row
            label="Linked tasks"
            value={linkedTaskCount === 0 ? 'None' : `${linkedTaskCount}`}
          />
          <div>
            <span className="block text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 mb-1">
              Status detail
            </span>
            <textarea
              value={editingStatus}
              onChange={(e) => setEditingStatus(e.target.value)}
              onBlur={() => {
                if (editingStatus !== (project.status_detail ?? '')) {
                  onUpdate({ status_detail: editingStatus })
                }
              }}
              rows={2}
              className="form-input w-full"
              placeholder="Where things stand"
            />
          </div>
          <div>
            <span className="block text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 mb-1">
              Next action
            </span>
            <textarea
              value={editingNextAction}
              onChange={(e) => setEditingNextAction(e.target.value)}
              onBlur={() => {
                if (editingNextAction !== (project.next_action ?? '')) {
                  onUpdate({ next_action: editingNextAction })
                }
              }}
              rows={2}
              className="form-input w-full"
              placeholder="What needs to happen next?"
            />
          </div>
        </div>
        <div className="modal-actions">
          {confirmDelete ? (
            <>
              <span className="text-[11px] font-sans text-data-coral">Delete this project?</span>
              <div className="modal-actions-right">
                <button
                  type="button"
                  className="text-[11px] font-sans text-ink-3 hover:text-ink"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-error text-white px-3 py-1.5 rounded-md hover:brightness-110"
                  onClick={onDelete}
                >
                  Delete
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="text-[11px] font-sans text-ink-3 hover:text-data-coral transition-colors"
                onClick={() => setConfirmDelete(true)}
              >
                Delete project
              </button>
              <div className="modal-actions-right">
                <button type="button" onClick={onClose} className="btn-secondary">
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 whitespace-nowrap">
        {label}
      </span>
      <span className="text-[12px] font-sans text-ink text-right truncate">
        {value}
      </span>
    </div>
  )
}
