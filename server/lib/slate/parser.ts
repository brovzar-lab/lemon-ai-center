import yaml from 'js-yaml'
import {
  SLATE_FILM_STAGES,
  SLATE_SERIES_STAGES,
} from '@shared/types'
import type {
  SlateDeadline,
  SlateFormat,
  SlateLanguage,
  SlateOrigin,
  SlatePriority,
  SlateProject,
  SlateStage,
  SlateStatus,
  SlateWaitingOn,
  SlateWriter,
} from '@shared/types'

/**
 * Deterministic parsing for the DEVELOPMENT/ folder — the scanner only
 * guesses when a file breaks these conventions, and then it asks instead of
 * silently filing (spec: FOLDER-STRUCTURE.md). Everything here is pure and
 * synchronous so it can be unit-tested against the naming spec verbatim.
 */

export const SLATE_MATERIAL_EXTENSIONS = ['fdx', 'fountain', 'pdf', 'docx', 'md', 'txt'] as const
const EXT_GROUP = SLATE_MATERIAL_EXTENSIONS.join('|')

/** CAPS-KEBAB, per the structure doc: LA-CASA-DEL-FUEGO */
export const SLUG_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/

// <SLUG>_v<NN>[_ep<NN>]_<YYYY-MM-DD>[_<label>].<ext>
const DRAFT_RE = new RegExp(
  `^([A-Z0-9-]+)_v(\\d{1,4})(?:_ep(\\d{1,4}))?_(\\d{4}-\\d{2}-\\d{2})(?:_([A-Za-z0-9][A-Za-z0-9-]*))?\\.(${EXT_GROUP})$`,
)

// <SLUG>_<treatment|synopsis|outline|bible>_v<NN>_<YYYY-MM-DD>.<ext>
const DOC_RE = new RegExp(
  `^([A-Z0-9-]+)_(treatment|synopsis|outline|bible)_v(\\d{1,4})_(\\d{4}-\\d{2}-\\d{2})\\.(${EXT_GROUP})$`,
)

// <SLUG>_<skill>_<YYYY-MM-DD>.md — written by the module itself
const COVERAGE_RE = /^([A-Z0-9-]+)_([a-z0-9][a-z0-9-]*)_(\d{4}-\d{2}-\d{2})\.md$/

export interface ParsedDraftName {
  slug: string
  version: number
  ep?: number
  date: string
  label?: string
  ext: string
}

export function parseDraftFilename(filename: string): ParsedDraftName | null {
  const m = DRAFT_RE.exec(filename)
  if (!m) return null
  return {
    slug: m[1],
    version: Number(m[2]),
    ...(m[3] ? { ep: Number(m[3]) } : {}),
    date: m[4],
    ...(m[5] ? { label: m[5] } : {}),
    ext: m[6],
  }
}

export type SlateDocKind = 'treatment' | 'synopsis' | 'outline' | 'bible'

export interface ParsedDocName {
  slug: string
  kind: SlateDocKind
  version: number
  date: string
  ext: string
}

export function parseDocFilename(filename: string): ParsedDocName | null {
  const m = DOC_RE.exec(filename)
  if (!m) return null
  return { slug: m[1], kind: m[2] as SlateDocKind, version: Number(m[3]), date: m[4], ext: m[5] }
}

export interface ParsedCoverageName {
  slug: string
  skill: string
  date: string
}

export function parseCoverageFilename(filename: string): ParsedCoverageName | null {
  const m = COVERAGE_RE.exec(filename)
  if (!m) return null
  return { slug: m[1], skill: m[2], date: m[3] }
}

// ── project.yaml ─────────────────────────────────────────────────────────

const FORMATS: SlateFormat[] = ['film', 'series']
const ORIGINS: SlateOrigin[] = ['internal', 'external']
const STATUSES: SlateStatus[] = ['active', 'paused', 'dead']
const PRIORITIES: SlatePriority[] = ['A', 'B', 'C']
const LANGUAGES: SlateLanguage[] = ['es', 'en', 'both']

export interface ParsedProjectYaml {
  /** Best-effort normalized project — usable even when problems exist. */
  project: SlateProject
  /** Human-readable validation problems; non-empty means "ask Billy". */
  problems: string[]
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

function isoDate(v: unknown): string | undefined {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = str(v)
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined
}

/**
 * Parse + validate a project.yaml against the FOLDER-STRUCTURE.md schema.
 * Throws only on unreadable YAML; shape problems come back in `problems`
 * with a best-effort project so the slate stays populated while Billy fixes
 * the file. The folder name is canonical for the slug (rule 1).
 */
export function parseProjectYaml(raw: string, folderName: string): ParsedProjectYaml {
  const problems: string[] = []
  const data = yaml.load(raw)
  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('project.yaml is not a YAML mapping')
  }
  const y = data as Record<string, unknown>

  const title = str(y.title)
  if (!title) problems.push('missing required field: title')

  const yamlSlug = str(y.slug)
  if (!yamlSlug) problems.push('missing required field: slug')
  else if (yamlSlug !== folderName) {
    problems.push(`slug "${yamlSlug}" does not match folder name "${folderName}" — folder name wins`)
  }
  if (!SLUG_RE.test(folderName)) {
    problems.push(`folder name "${folderName}" is not CAPS-KEBAB`)
  }

  const format = str(y.format) as SlateFormat | undefined
  if (!format || !FORMATS.includes(format)) {
    problems.push(`format must be one of ${FORMATS.join('|')} (got "${y.format ?? ''}")`)
  }

  const stage = str(y.stage) as SlateStage | undefined
  const validStages: readonly string[] =
    format === 'series' ? SLATE_SERIES_STAGES : SLATE_FILM_STAGES
  if (!stage) {
    problems.push('missing required field: stage')
  } else if (format && FORMATS.includes(format) && !validStages.includes(stage)) {
    problems.push(`stage "${stage}" is not a ${format} stage (${validStages.join(' → ')})`)
  }

  const origin = str(y.origin) as SlateOrigin | undefined
  if (!origin || !ORIGINS.includes(origin)) {
    problems.push(`origin must be one of ${ORIGINS.join('|')} (got "${y.origin ?? ''}")`)
  }

  const status = str(y.status) as SlateStatus | undefined
  if (!status || !STATUSES.includes(status)) {
    problems.push(`status must be one of ${STATUSES.join('|')} (got "${y.status ?? ''}")`)
  }

  const priority = str(y.priority) as SlatePriority | undefined
  if (priority && !PRIORITIES.includes(priority)) {
    problems.push(`priority must be one of ${PRIORITIES.join('|')} (got "${priority}")`)
  }

  const language = str(y.language) as SlateLanguage | undefined
  if (language && !LANGUAGES.includes(language)) {
    problems.push(`language must be one of ${LANGUAGES.join('|')} (got "${language}")`)
  }

  const writers: SlateWriter[] = []
  if (Array.isArray(y.writers)) {
    for (const w of y.writers) {
      if (typeof w === 'object' && w !== null) {
        const name = str((w as Record<string, unknown>).name)
        if (name) {
          const contact = str((w as Record<string, unknown>).contact)
          const wLang = str((w as Record<string, unknown>).language) as SlateLanguage | undefined
          const writer: SlateWriter = { name }
          if (contact) writer.contact = contact
          if (wLang && LANGUAGES.includes(wLang)) writer.language = wLang
          writers.push(writer)
        } else {
          problems.push('a writers[] entry is missing name')
        }
      }
    }
  } else if (y.writers !== undefined) {
    problems.push('writers must be a list')
  }

  let waiting_on: SlateWaitingOn | null = null
  if (typeof y.waiting_on === 'object' && y.waiting_on !== null) {
    const w = y.waiting_on as Record<string, unknown>
    const who = str(w.who)
    const what = str(w.what)
    const since = isoDate(w.since)
    if (who && what && since) waiting_on = { who, what, since }
    else problems.push('waiting_on needs who, what and since (YYYY-MM-DD)')
  } else if (y.waiting_on !== undefined) {
    problems.push('waiting_on must be a mapping with who/what/since')
  }

  const targets = Array.isArray(y.targets)
    ? (y.targets.map(str).filter(Boolean) as string[])
    : undefined

  const deadlines: SlateDeadline[] = []
  if (Array.isArray(y.deadlines)) {
    for (const d of y.deadlines) {
      if (typeof d === 'object' && d !== null) {
        const date = isoDate((d as Record<string, unknown>).date)
        const what = str((d as Record<string, unknown>).what)
        if (date && what) deadlines.push({ date, what })
        else problems.push('a deadlines[] entry needs date (YYYY-MM-DD) and what')
      }
    }
  }

  let staleness_days: number | undefined
  if (y.staleness_days !== undefined) {
    const n = Number(y.staleness_days)
    if (Number.isInteger(n) && n > 0) staleness_days = n
    else problems.push(`staleness_days must be a positive integer (got "${y.staleness_days}")`)
  }

  const project: SlateProject = {
    slug: folderName,
    title: title ?? folderName,
    format: format && FORMATS.includes(format) ? format : 'film',
    stage: (stage ?? 'idea') as SlateStage,
    origin: origin && ORIGINS.includes(origin) ? origin : 'internal',
    status: status && STATUSES.includes(status) ? status : 'active',
    ...(priority && PRIORITIES.includes(priority) ? { priority } : {}),
    ...(language && LANGUAGES.includes(language) ? { language } : {}),
    ...(str(y.logline) ? { logline: str(y.logline) } : {}),
    ...(writers.length ? { writers } : {}),
    waiting_on,
    ...(targets && targets.length ? { targets } : {}),
    ...(deadlines.length ? { deadlines } : {}),
    ...(staleness_days ? { staleness_days } : {}),
    ...(str(y.notes) ? { notes: str(y.notes) } : {}),
  }

  return { project, problems }
}
