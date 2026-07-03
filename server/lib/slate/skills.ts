import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { db } from '../firebase'
import { getAnthropicClient } from '../anthropic'
import { CLAUDE_MODELS } from '@shared/models'
import { getSlateConfig } from './config'
import { listSlateProjects } from './index'
import { runSlateScan } from './scanner'
import { listIndexEntries, runSlateIngestion, type SlateIndexEntry } from './ingest'
import type { SlateProject, SlateSkill, SlateSkillRun } from '@shared/types'

/**
 * Skills dispatch (spec §4, D6): the canonical Lemon skill set lives in
 * `skills/` at the repo root — SKILL.md as the whole contract. A run =
 * SKILL.md as system context + the project's already-indexed material
 * through the app's Anthropic layer (no Claude Code dependency, D6.4).
 *
 * Fire → land → learn: results land on disk as
 * `coverage/<SLUG>_<skill>_<YYYY-MM-DD>.md` (the scanner/ingester picks
 * them up like any other material, so they enter the slate index
 * automatically), and every run is logged to `slate_runs` so the briefing
 * engine can later learn which skills Billy actually uses per stage.
 *
 * Skills carrying `status: review-pending` in frontmatter (film-finance
 * and chivo, authored new per D6.3) are listed but refuse to fire until
 * Billy flips them live.
 */

const RUNS_COLLECTION = 'slate_runs'

export function skillsDir(): string {
  return path.resolve(process.cwd(), 'skills')
}

export function listSkills(): SlateSkill[] {
  const dir = skillsDir()
  if (!fs.existsSync(dir)) return []
  const skills: SlateSkill[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(dir, entry.name, 'SKILL.md')
    if (!fs.existsSync(skillPath)) continue
    try {
      const parsed = matter(fs.readFileSync(skillPath, 'utf8'))
      skills.push({
        id: entry.name,
        name: typeof parsed.data.name === 'string' ? parsed.data.name : entry.name,
        description: typeof parsed.data.description === 'string' ? parsed.data.description : '',
        status: parsed.data.status === 'review-pending' ? 'review-pending' : 'live',
      })
    } catch (err) {
      console.error(`[slate] Unreadable skill ${entry.name}:`, (err as Error).message)
    }
  }
  return skills.sort((a, b) => a.id.localeCompare(b.id))
}

function readSkillBody(id: string): string {
  const parsed = matter(fs.readFileSync(path.join(skillsDir(), id, 'SKILL.md'), 'utf8'))
  return parsed.content.trim()
}

// ── Material assembly ─────────────────────────────────────────────────────

const MATERIAL_CHAR_CAP = 120_000 // ~30k tokens of material is plenty for one run

interface MaterialFile {
  file: string
  kind: string
  version?: number
  chunks: SlateIndexEntry[]
}

/**
 * The project's material, from the in-memory slate index (already
 * extracted + scene-ordered). Drafts: only the requested version, or the
 * highest indexed one — a skill run reads the current script, not every
 * revision. Coverage from previous runs is included last (context, not
 * subject). Single-project by construction, so the external firewall
 * (spec §7) holds: an internal run can never see external chunks.
 */
export function assembleMaterial(
  project: SlateProject,
  version?: number,
): { text: string; files: string[]; truncated: boolean } {
  const byFile = new Map<string, MaterialFile>()
  for (const e of listIndexEntries()) {
    if (e.meta.project !== project.slug) continue
    let f = byFile.get(e.meta.file)
    if (!f) {
      f = { file: e.meta.file, kind: e.meta.kind, version: e.meta.version, chunks: [] }
      byFile.set(e.meta.file, f)
    }
    f.chunks.push(e)
  }

  const drafts = [...byFile.values()].filter((f) => f.kind === 'draft')
  const wantVersion =
    version ?? (drafts.length > 0 ? Math.max(...drafts.map((f) => f.version ?? 0)) : undefined)

  const KIND_ORDER = ['idea', 'treatment', 'outline', 'draft', 'notes', 'correspondence', 'coverage']
  const files = [...byFile.values()]
    .filter((f) => f.kind !== 'draft' || (f.version ?? 0) === wantVersion)
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.file.localeCompare(b.file),
    )

  const meta = [
    `PROJECT: ${project.title} (${project.slug})`,
    `format: ${project.format} · stage: ${project.stage} · origin: ${project.origin} · status: ${project.status}`,
    project.logline ? `logline: ${project.logline.trim()}` : null,
    project.writers?.length ? `writers: ${project.writers.map((w) => w.name).join(', ')}` : null,
    project.targets?.length ? `targets: ${project.targets.join(', ')}` : null,
    project.notes ? `producer notes: ${project.notes.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  let text = `${meta}\n`
  let truncated = false
  for (const f of files) {
    f.chunks.sort((a, b) => a.meta.seq - b.meta.seq)
    const body = f.chunks
      .map((c) => (c.meta.sceneHeading ? `[${c.meta.sceneHeading}]\n${c.text}` : c.text))
      .join('\n\n')
    const section = `\n═══ ${f.kind.toUpperCase()}: ${f.file} ═══\n${body}\n`
    if (text.length + section.length > MATERIAL_CHAR_CAP) {
      const room = MATERIAL_CHAR_CAP - text.length
      if (room > 2000) text += `${section.slice(0, room)}\n[…truncated]`
      else text += `\n═══ ${f.kind.toUpperCase()}: ${f.file} ═══\n[omitted — material cap reached]`
      truncated = true
      continue
    }
    text += section
  }
  return { text, files: files.map((f) => f.file), truncated }
}

// ── The runner ────────────────────────────────────────────────────────────

const HARNESS_PREAMBLE = `You are running as a skill inside DEVELOPMENT-HELL, Billy Rovzar's development-slate command center at Lemon Studios. The full material of ONE project is provided in the user message — that is everything you have. There is no filesystem, no web search, and no other skills to invoke: where the skill text below references reading other files or searching the web, work from your own knowledge instead and say so briefly. Material may be Spanish, English or both — read it natively, write your deliverable in English unless the skill says otherwise, and quote material in its original language.

Produce ONE complete markdown document — it will be filed into the project's coverage/ folder and indexed, so it must stand alone: start with a # title line naming the project and what this document is. No preamble before the title, no closing questions.

THE SKILL:

`

function coverageFilename(slug: string, skillId: string, now: Date): string {
  return `${slug}_${skillId}_${now.toISOString().slice(0, 10)}.md`
}

const runningKeys = new Set<string>()

export interface FireResult {
  runId: string
}

export class SkillRunError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Fire a skill at a project. Validates everything synchronously (so the
 * route can 4xx), logs the run as `running`, then finishes in the
 * background — the UI polls /api/slate/runs. Same skill × project never
 * runs twice concurrently.
 */
export async function fireSkillRun(skillId: string, projectSlug: string, version?: number): Promise<FireResult> {
  const skill = listSkills().find((s) => s.id === skillId)
  if (!skill) throw new SkillRunError('UNKNOWN_SKILL', `No skill named "${skillId}"`)
  if (skill.status === 'review-pending') {
    throw new SkillRunError(
      'REVIEW_PENDING',
      `${skill.id} is awaiting Billy's review — flip its status to live in skills/${skill.id}/SKILL.md first`,
    )
  }
  const config = await getSlateConfig()
  if (!config) throw new SkillRunError('NOT_ONBOARDED', 'Run the setup wizard first')
  if (!fs.existsSync(config.devFolderPath)) {
    throw new SkillRunError(
      'FOLDER_UNREACHABLE',
      `${config.devFolderPath} is not reachable from this host — results land on disk, so runs need the folder`,
    )
  }
  const project = (await listSlateProjects()).find((p) => p.slug === projectSlug)
  if (!project) throw new SkillRunError('UNKNOWN_PROJECT', `No project "${projectSlug}" on the slate`)
  if (project.status === 'dead') {
    throw new SkillRunError('PROJECT_DEAD', `${projectSlug} is archived — skills fire at live projects`)
  }
  const material = assembleMaterial(project, version)
  if (material.files.length === 0) {
    throw new SkillRunError(
      'NO_MATERIAL',
      `${projectSlug} has no indexed material yet — drop a draft or treatment in first`,
    )
  }
  const key = `${skillId}::${projectSlug}`
  if (runningKeys.has(key)) {
    throw new SkillRunError('ALREADY_RUNNING', `${skillId} is already running on ${projectSlug}`)
  }

  const startedAt = new Date()
  const runDoc: Omit<SlateSkillRun, 'id'> = {
    skill: skillId,
    project: projectSlug,
    ...(version !== undefined ? { version } : {}),
    model: CLAUDE_MODELS.smart,
    status: 'running',
    startedAt: startedAt.toISOString(),
    accepted: null,
  }
  const ref = await db.collection(RUNS_COLLECTION).add(runDoc)

  runningKeys.add(key)
  void executeRun(ref.id, skill.id, project, material, config.devFolderPath, startedAt).finally(() => {
    runningKeys.delete(key)
  })
  return { runId: ref.id }
}

async function executeRun(
  runId: string,
  skillId: string,
  project: SlateProject,
  material: { text: string; files: string[]; truncated: boolean },
  root: string,
  startedAt: Date,
): Promise<void> {
  const ref = db.collection(RUNS_COLLECTION).doc(runId)
  try {
    const system = HARNESS_PREAMBLE + readSkillBody(skillId)
    const anthropic = getAnthropicClient()
    const stream = anthropic.messages.stream({
      model: CLAUDE_MODELS.smart,
      max_tokens: 8000,
      system,
      messages: [
        {
          role: 'user',
          content: `Run this skill on the following project material and produce your deliverable.${material.truncated ? ' (Material was truncated to fit — note that in the document.)' : ''}\n\n${material.text}`,
        },
      ],
    })
    const final = await stream.finalMessage()
    const output = final.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
      .trim()
    if (!output) throw new Error('The model returned no text')

    const base = project.origin === 'external' ? path.join('_external', project.slug) : project.slug
    const coverageDir = path.join(root, base, 'coverage')
    fs.mkdirSync(coverageDir, { recursive: true })
    const filename = coverageFilename(project.slug, skillId, new Date())
    fs.writeFileSync(path.join(coverageDir, filename), `${output}\n`)

    await ref.set(
      {
        status: 'done',
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        outputFile: path.join(base, 'coverage', filename),
        outputChars: output.length,
      },
      { merge: true },
    )
    console.log(`[slate] Skill run done: ${skillId} × ${project.slug} → ${filename}`)

    // Land it: rescan (updates last_touched + files the new doc) and
    // re-ingest (into the slate index) — the watcher would get there too,
    // but a run must land even where the watcher is off.
    await runSlateScan(root)
    void runSlateIngestion(root)
  } catch (err) {
    console.error(`[slate] Skill run failed: ${skillId} × ${project.slug}:`, (err as Error).message)
    await ref
      .set(
        {
          status: 'failed',
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          error: (err as Error).message,
        },
        { merge: true },
      )
      .catch((logErr) => console.error('[slate] Could not record run failure:', logErr.message))
  }
}

export async function listSkillRuns(limit = 20): Promise<SlateSkillRun[]> {
  const snap = await db.collection(RUNS_COLLECTION).orderBy('startedAt', 'desc').limit(limit).get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SlateSkillRun, 'id'>) }))
}
