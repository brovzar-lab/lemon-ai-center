import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { db } from '../firebase'
import { touchLastScan } from './config'
import { writeSlateVaultNotes } from './vaultNote'
import {
  parseCoverageFilename,
  parseDocFilename,
  parseDraftFilename,
  parseProjectYaml,
} from './parser'
import type {
  SlateConfirmItem,
  SlateConfirmReason,
  SlateCurrentDraft,
  SlateProject,
  SlateScanSummary,
} from '@shared/types'

/**
 * The deterministic scanner: DEVELOPMENT/ on disk → slate/* in Firestore.
 * Disk is the source of truth; every scan replaces the collection state.
 * Anything that breaks convention lands in the confirm queue instead of
 * being silently filed (spec §2). Pure disk walk is separated from the
 * Firestore sync so it can be tested against fixture folders.
 */

const PROJECT_SUBFOLDERS = new Set([
  '01-idea',
  '02-treatment',
  '03-outline',
  '04-drafts',
  'coverage',
  'notes',
  'correspondence',
])

// Folders whose contents follow a naming convention the scanner enforces.
const NAMED_SUBFOLDERS = new Set(['02-treatment', '03-outline', '04-drafts', 'coverage'])

export interface SlateScanResult {
  projects: SlateProject[]
  confirmItems: SlateConfirmItem[]
  scannedAt: string
}

function confirmId(relPath: string): string {
  return crypto.createHash('sha1').update(relPath).digest('hex').slice(0, 20)
}

function isHidden(name: string): boolean {
  return name.startsWith('.')
}

function listEntries(dir: string): fs.Dirent[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => !isHidden(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Max mtime (ISO) of any file under dir, recursively. */
function lastTouchedISO(dir: string): string | undefined {
  let max = 0
  const walk = (d: string) => {
    for (const entry of listEntries(d)) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        const mtime = fs.statSync(full).mtimeMs
        if (mtime > max) max = mtime
      }
    }
  }
  walk(dir)
  return max > 0 ? new Date(max).toISOString() : undefined
}

interface ProjectScan {
  project: SlateProject | null
  confirmItems: SlateConfirmItem[]
}

function makeItem(
  relPath: string,
  reason: SlateConfirmReason,
  detail: string,
  seenAt: string,
  project?: string,
): SlateConfirmItem {
  return {
    id: confirmId(relPath),
    path: relPath,
    ...(project ? { project } : {}),
    reason,
    detail,
    seenAt,
  }
}

function scanProjectFolder(
  root: string,
  relBase: string, // '' or '_external' or '_archive'
  slug: string,
  seenAt: string,
): ProjectScan {
  const dir = path.join(root, relBase, slug)
  const rel = (p: string) => path.join(relBase, slug, p)
  const confirmItems: SlateConfirmItem[] = []
  const inExternal = relBase === '_external'
  const inArchive = relBase === '_archive'

  const yamlPath = path.join(dir, 'project.yaml')
  if (!fs.existsSync(yamlPath)) {
    confirmItems.push(
      makeItem(rel('project.yaml'), 'missing-yaml', 'Project folder has no project.yaml', seenAt, slug),
    )
    return { project: null, confirmItems }
  }

  let project: SlateProject
  const problems: string[] = []
  try {
    const parsed = parseProjectYaml(fs.readFileSync(yamlPath, 'utf8'), slug)
    project = parsed.project
    problems.push(...parsed.problems)
  } catch (err) {
    confirmItems.push(
      makeItem(rel('project.yaml'), 'bad-yaml', `project.yaml unreadable: ${(err as Error).message}`, seenAt, slug),
    )
    return { project: null, confirmItems }
  }

  // External firewall (structure doc rule 2): placement in _external/ wins,
  // and origin: external is honored wherever it appears — never the reverse.
  if (inExternal && project.origin !== 'external') {
    problems.push(`lives in _external/ but origin is "${project.origin}" — treated as external (firewall)`)
    project.origin = 'external'
  }
  // Archive placement implies dead (rule 3).
  if (inArchive && project.status !== 'dead') {
    project.status = 'dead'
  }

  if (problems.length > 0) {
    confirmItems.push(makeItem(rel('project.yaml'), 'bad-yaml', problems.join('; '), seenAt, slug))
  }

  // Walk material folders
  const drafts: Array<SlateCurrentDraft> = []
  for (const entry of listEntries(dir)) {
    const full = path.join(dir, entry.name)
    if (entry.isFile()) {
      if (entry.name !== 'project.yaml') {
        confirmItems.push(
          makeItem(rel(entry.name), 'bad-name', 'Loose file in the project root — file it into a subfolder', seenAt, slug),
        )
      }
      continue
    }
    if (!PROJECT_SUBFOLDERS.has(entry.name)) {
      confirmItems.push(
        makeItem(rel(entry.name), 'bad-name', `"${entry.name}" is not a canonical project subfolder`, seenAt, slug),
      )
      continue
    }
    if (!NAMED_SUBFOLDERS.has(entry.name)) continue // 01-idea, notes, correspondence: free-form

    for (const file of listEntries(full)) {
      if (!file.isFile()) continue
      const relFile = rel(path.join(entry.name, file.name))
      if (entry.name === '04-drafts') {
        const parsed = parseDraftFilename(file.name)
        if (!parsed) {
          confirmItems.push(
            makeItem(relFile, 'bad-name', 'Does not match <SLUG>_v<NN>_<YYYY-MM-DD>[_label].<ext>', seenAt, slug),
          )
        } else if (parsed.slug !== slug) {
          confirmItems.push(
            makeItem(relFile, 'bad-name', `Filename slug "${parsed.slug}" belongs to another project`, seenAt, slug),
          )
        } else {
          drafts.push({
            version: parsed.version,
            date: parsed.date,
            ...(parsed.label ? { label: parsed.label } : {}),
            ...(parsed.ep !== undefined ? { ep: parsed.ep } : {}),
            file: path.join(entry.name, file.name),
          })
        }
      } else if (entry.name === 'coverage') {
        const parsed = parseCoverageFilename(file.name)
        if (!parsed || parsed.slug !== slug) {
          confirmItems.push(
            makeItem(relFile, 'bad-name', 'Does not match <SLUG>_<skill>_<YYYY-MM-DD>.md', seenAt, slug),
          )
        }
      } else {
        const parsed = parseDocFilename(file.name)
        if (!parsed || parsed.slug !== slug) {
          confirmItems.push(
            makeItem(relFile, 'bad-name', 'Does not match <SLUG>_<treatment|synopsis|outline|bible>_v<NN>_<YYYY-MM-DD>.<ext>', seenAt, slug),
          )
        }
      }
    }
  }

  // Highest version wins; ties broken by date (spec: strictly increasing)
  drafts.sort((a, b) => b.version - a.version || (b.date ?? '').localeCompare(a.date ?? ''))
  project.current_draft = drafts[0] ?? null
  project.unfiled_count = confirmItems.length
  const touched = lastTouchedISO(dir)
  if (touched) project.last_touched = touched
  project.updated_at = seenAt

  return { project, confirmItems }
}

/** Pure disk walk — no Firestore. */
export function scanDevelopmentFolder(root: string): SlateScanResult {
  const scannedAt = new Date().toISOString()
  const projects: SlateProject[] = []
  const confirmItems: SlateConfirmItem[] = []

  for (const entry of listEntries(root)) {
    if (entry.isFile()) {
      confirmItems.push(
        makeItem(entry.name, 'unfiled', 'Loose file in the DEVELOPMENT root — needs filing', scannedAt),
      )
      continue
    }
    if (entry.name === '_inbox') {
      for (const drop of listEntries(path.join(root, entry.name))) {
        confirmItems.push(
          makeItem(path.join('_inbox', drop.name), 'unfiled', 'Dropped in _inbox — needs filing', scannedAt),
        )
      }
      continue
    }
    if (entry.name === '_external' || entry.name === '_archive') {
      const base = path.join(root, entry.name)
      for (const sub of listEntries(base)) {
        if (!sub.isDirectory()) {
          confirmItems.push(
            makeItem(path.join(entry.name, sub.name), 'unfiled', `Loose file in ${entry.name} — needs filing`, scannedAt),
          )
          continue
        }
        const scan = scanProjectFolder(root, entry.name, sub.name, scannedAt)
        if (scan.project) projects.push(scan.project)
        confirmItems.push(...scan.confirmItems)
      }
      continue
    }
    if (entry.name.startsWith('_')) continue // unknown underscore folder — module-agnostic, skip
    const scan = scanProjectFolder(root, '', entry.name, scannedAt)
    if (scan.project) projects.push(scan.project)
    confirmItems.push(...scan.confirmItems)
  }

  projects.sort((a, b) => a.slug.localeCompare(b.slug))
  return { projects, confirmItems, scannedAt }
}

/** Replace Firestore collection state with the scan result (disk wins). */
export async function syncScanToFirestore(result: SlateScanResult): Promise<void> {
  const [projectsSnap, confirmSnap] = await Promise.all([
    db.collection('slate').select().get(),
    db.collection('slate_confirm').select().get(),
  ])

  const batchOps: Array<(b: FirebaseFirestore.WriteBatch) => void> = []

  const wantProjects = new Map(result.projects.map((p) => [p.slug, p]))
  for (const doc of projectsSnap.docs) {
    if (!wantProjects.has(doc.id)) batchOps.push((b) => b.delete(doc.ref))
  }
  for (const [slug, project] of wantProjects) {
    batchOps.push((b) => b.set(db.collection('slate').doc(slug), project))
  }

  const wantConfirm = new Map(result.confirmItems.map((i) => [i.id, i]))
  for (const doc of confirmSnap.docs) {
    if (!wantConfirm.has(doc.id)) batchOps.push((b) => b.delete(doc.ref))
  }
  for (const [id, item] of wantConfirm) {
    batchOps.push((b) => b.set(db.collection('slate_confirm').doc(id), item))
  }

  // Firestore caps batches at 500 ops — chunk defensively.
  for (let i = 0; i < batchOps.length; i += 400) {
    const batch = db.batch()
    for (const op of batchOps.slice(i, i + 400)) op(batch)
    await batch.commit()
  }
}

/** Full scan: disk → Firestore + vault notes + lastScanAt. */
export async function runSlateScan(root: string): Promise<SlateScanSummary> {
  const result = scanDevelopmentFolder(root)
  await syncScanToFirestore(result)
  const vault = writeSlateVaultNotes(result.projects)
  await touchLastScan(result.scannedAt)
  console.log(
    `[slate] Scanned ${root}: ${result.projects.length} projects, ${result.confirmItems.length} to confirm, ${vault.written} vault notes updated`,
  )
  return {
    projects: result.projects.length,
    confirmItems: result.confirmItems.length,
    vaultNotesWritten: vault.written,
    scannedAt: result.scannedAt,
  }
}
