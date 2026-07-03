import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { db } from '../firebase'
import { listSlateProjects } from './index'
import { extractFile } from './extract'
import { chunkExtracted } from './chunk'
import { cosineSimilarity, embedQuery, embedTexts } from './embeddings'
import { parseDocFilename, parseDraftFilename, SLATE_MATERIAL_EXTENSIONS } from './parser'
import type { SlateOrigin, SlateProject } from '@shared/types'

/**
 * The slate index (spec §3, D5): every piece of material extracted,
 * scene-aware chunked, embedded and stored — vectors in Firestore
 * (`slate_chunks`, plain arrays per D5's sanctioned fallback; the schema
 * upgrades to native KNN by adding a vector index later), mirrored in an
 * in-memory Float32 index for search, exactly like the FlexSearch brain
 * keeps the vault in RAM.
 *
 * The `slate_files` ledger (mtime/size/sha1) makes re-ingestion
 * incremental: only new or changed files hit the embedding API. Prior
 * draft versions are separate files on disk, so history stays queryable
 * for free. Everything runs in the background — scans never wait on it.
 */

const CHUNKS_COLLECTION = 'slate_chunks'
const LEDGER_COLLECTION = 'slate_files'

const INGEST_FOLDERS: Record<string, SlateChunkKind> = {
  '01-idea': 'idea',
  '02-treatment': 'treatment',
  '03-outline': 'outline',
  '04-drafts': 'draft',
  coverage: 'coverage',
  notes: 'notes',
  correspondence: 'correspondence',
}

export type SlateChunkKind =
  | 'idea'
  | 'treatment'
  | 'outline'
  | 'draft'
  | 'coverage'
  | 'notes'
  | 'correspondence'

export interface SlateChunkMeta {
  project: string
  origin: SlateOrigin
  file: string // DEVELOPMENT-relative path
  kind: SlateChunkKind
  version?: number
  ep?: number
  seq: number
  sceneIndex?: number
  sceneHeading?: string
}

export interface SlateChunkDoc extends SlateChunkMeta {
  id: string
  text: string
  embedding: number[]
  embeddedAt: string
}

interface LedgerDoc {
  path: string
  project: string
  mtimeMs: number
  size: number
  sha1: string
  chunkCount: number
  ingestedAt: string
}

export interface IngestStatus {
  running: boolean
  lastRunAt?: string
  lastError?: string
  filesIngested: number
  filesSkipped: number
  filesRemoved: number
  chunksWritten: number
}

// ── In-memory index ──────────────────────────────────────────────────────

export interface SlateIndexEntry {
  meta: SlateChunkMeta
  text: string
  vector: Float32Array
}

const memoryIndex = new Map<string, SlateIndexEntry>()
let indexLoaded = false

export function slateIndexSize(): number {
  return memoryIndex.size
}

/** Read access to the in-memory index for the query chat's tools. */
export function listIndexEntries(): SlateIndexEntry[] {
  return [...memoryIndex.values()]
}

export function isSlateIndexLoaded(): boolean {
  return indexLoaded
}

/** Boot: hydrate the in-memory index from Firestore. */
export async function initSlateIndex(): Promise<void> {
  const snap = await db.collection(CHUNKS_COLLECTION).get()
  memoryIndex.clear()
  for (const doc of snap.docs) {
    const data = doc.data() as SlateChunkDoc
    if (!Array.isArray(data.embedding)) continue
    const { embedding, text, id: _id, embeddedAt: _e, ...meta } = data
    memoryIndex.set(doc.id, { meta, text, vector: Float32Array.from(embedding) })
  }
  indexLoaded = true
  console.log(`[slate] Index loaded: ${memoryIndex.size} chunks in memory`)
}

export interface SlateSearchHit {
  score: number
  text: string
  project: string
  origin: SlateOrigin
  file: string
  kind: SlateChunkKind
  version?: number
  ep?: number
  sceneIndex?: number
  sceneHeading?: string
}

export interface SlateSearchOptions {
  /** 'internal' excludes external material — the firewall (spec §7) */
  scope?: 'all' | 'internal'
  project?: string
  limit?: number
}

export function searchSlateVectors(
  queryVector: ArrayLike<number>,
  opts: SlateSearchOptions = {},
): SlateSearchHit[] {
  const { scope = 'all', project, limit = 12 } = opts
  const hits: SlateSearchHit[] = []
  for (const entry of memoryIndex.values()) {
    if (scope === 'internal' && entry.meta.origin === 'external') continue
    if (project && entry.meta.project !== project) continue
    hits.push({ score: cosineSimilarity(queryVector, entry.vector), text: entry.text, ...entry.meta })
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}

/** Embed the query, scan the index. */
export async function searchSlate(query: string, opts: SlateSearchOptions = {}): Promise<SlateSearchHit[]> {
  const vec = await embedQuery(query)
  return searchSlateVectors(vec, opts)
}

// ── Ingestion ────────────────────────────────────────────────────────────

interface FileTarget {
  relPath: string // DEVELOPMENT-relative
  absPath: string
  project: string
  origin: SlateOrigin
  kind: SlateChunkKind
  version?: number
  ep?: number
}

function chunkId(relPath: string, seq: number): string {
  return crypto.createHash('sha1').update(`${relPath}#${seq}`).digest('hex').slice(0, 24)
}

function ledgerId(relPath: string): string {
  return crypto.createHash('sha1').update(relPath).digest('hex').slice(0, 24)
}

const EXT_SET = new Set(SLATE_MATERIAL_EXTENSIONS.map((e) => `.${e}`))

/** Which files get indexed: material files inside live projects' canonical folders. */
export function collectIngestTargets(root: string, projects: SlateProject[]): FileTarget[] {
  const targets: FileTarget[] = []
  for (const project of projects) {
    if (project.status === 'dead') continue // archived material stays out of the index
    const base = project.origin === 'external' ? path.join('_external', project.slug) : project.slug
    const projectDir = path.join(root, base)
    if (!fs.existsSync(projectDir)) continue
    for (const [folder, kind] of Object.entries(INGEST_FOLDERS)) {
      const dir = path.join(projectDir, folder)
      if (!fs.existsSync(dir)) continue
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.startsWith('.')) continue
        if (!EXT_SET.has(path.extname(entry.name).toLowerCase())) continue
        const target: FileTarget = {
          relPath: path.join(base, folder, entry.name),
          absPath: path.join(dir, entry.name),
          project: project.slug,
          origin: project.origin,
          kind,
        }
        if (kind === 'draft') {
          const parsed = parseDraftFilename(entry.name)
          if (parsed) {
            target.version = parsed.version
            if (parsed.ep !== undefined) target.ep = parsed.ep
          }
        } else if (kind === 'treatment' || kind === 'outline') {
          const parsed = parseDocFilename(entry.name)
          if (parsed) target.version = parsed.version
        }
        targets.push(target)
      }
    }
  }
  return targets.sort((a, b) => a.relPath.localeCompare(b.relPath))
}

const status: IngestStatus = {
  running: false,
  filesIngested: 0,
  filesSkipped: 0,
  filesRemoved: 0,
  chunksWritten: 0,
}

export function getIngestStatus(): IngestStatus {
  return { ...status }
}

let queued = false

async function commitOps(ops: Array<(b: FirebaseFirestore.WriteBatch) => void>): Promise<void> {
  for (let i = 0; i < ops.length; i += 300) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + 300)) op(batch)
    await batch.commit()
  }
}

async function ingestOnce(root: string, projectsIn?: SlateProject[]): Promise<void> {
  const startedAt = new Date().toISOString()
  status.lastError = undefined
  const projects = projectsIn ?? (await listSlateProjects())
  const targets = collectIngestTargets(root, projects)

  const ledgerSnap = await db.collection(LEDGER_COLLECTION).get()
  const ledger = new Map<string, { docId: string; data: LedgerDoc }>()
  for (const doc of ledgerSnap.docs) {
    const data = doc.data() as LedgerDoc
    ledger.set(data.path, { docId: doc.id, data })
  }

  let filesIngested = 0
  let filesSkipped = 0
  let chunksWritten = 0

  for (const target of targets) {
    const stat = fs.statSync(target.absPath)
    const prior = ledger.get(target.relPath)
    if (prior && prior.data.mtimeMs === stat.mtimeMs && prior.data.size === stat.size) {
      filesSkipped++
      continue
    }
    const bytes = fs.readFileSync(target.absPath)
    const sha1 = crypto.createHash('sha1').update(bytes).digest('hex')
    if (prior && prior.data.sha1 === sha1) {
      // touched but unchanged — refresh the ledger, keep the chunks
      await db.collection(LEDGER_COLLECTION).doc(prior.docId).set(
        { ...prior.data, mtimeMs: stat.mtimeMs, size: stat.size },
      )
      filesSkipped++
      continue
    }

    try {
      const extracted = await extractFile(target.absPath)
      const chunks = chunkExtracted(extracted).filter((c) => c.text.trim().length > 0)
      const vectors = chunks.length > 0 ? await embedTexts(chunks.map((c) => c.text)) : []
      const embeddedAt = new Date().toISOString()

      const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = []
      // stale chunks beyond the new count (or all, when replacing)
      const priorCount = prior?.data.chunkCount ?? 0
      for (let seq = chunks.length; seq < priorCount; seq++) {
        const id = chunkId(target.relPath, seq)
        ops.push((b) => b.delete(db.collection(CHUNKS_COLLECTION).doc(id)))
        memoryIndex.delete(id)
      }
      chunks.forEach((chunk, i) => {
        const id = chunkId(target.relPath, chunk.seq)
        const meta: SlateChunkMeta = {
          project: target.project,
          origin: target.origin,
          file: target.relPath,
          kind: target.kind,
          ...(target.version !== undefined ? { version: target.version } : {}),
          ...(target.ep !== undefined ? { ep: target.ep } : {}),
          seq: chunk.seq,
          ...(chunk.sceneIndex !== undefined ? { sceneIndex: chunk.sceneIndex } : {}),
          ...(chunk.sceneHeading ? { sceneHeading: chunk.sceneHeading } : {}),
        }
        const doc: SlateChunkDoc = { id, ...meta, text: chunk.text, embedding: vectors[i], embeddedAt }
        ops.push((b) => b.set(db.collection(CHUNKS_COLLECTION).doc(id), doc))
        memoryIndex.set(id, { meta, text: chunk.text, vector: Float32Array.from(vectors[i]) })
      })
      const ledgerDoc: LedgerDoc = {
        path: target.relPath,
        project: target.project,
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        sha1,
        chunkCount: chunks.length,
        ingestedAt: embeddedAt,
      }
      ops.push((b) => b.set(db.collection(LEDGER_COLLECTION).doc(ledgerId(target.relPath)), ledgerDoc))
      await commitOps(ops)
      filesIngested++
      chunksWritten += chunks.length
    } catch (err) {
      console.error(`[slate] Ingest failed for ${target.relPath}:`, (err as Error).message)
      status.lastError = `${target.relPath}: ${(err as Error).message}`
    }
  }

  // Files gone from disk (or from live projects): drop their chunks + ledger
  const targetPaths = new Set(targets.map((t) => t.relPath))
  let filesRemoved = 0
  const removalOps: Array<(b: FirebaseFirestore.WriteBatch) => void> = []
  for (const [relPath, entry] of ledger) {
    if (targetPaths.has(relPath)) continue
    for (let seq = 0; seq < entry.data.chunkCount; seq++) {
      const id = chunkId(relPath, seq)
      removalOps.push((b) => b.delete(db.collection(CHUNKS_COLLECTION).doc(id)))
      memoryIndex.delete(id)
    }
    removalOps.push((b) => b.delete(db.collection(LEDGER_COLLECTION).doc(entry.docId)))
    filesRemoved++
  }
  await commitOps(removalOps)

  status.lastRunAt = startedAt
  status.filesIngested = filesIngested
  status.filesSkipped = filesSkipped
  status.filesRemoved = filesRemoved
  status.chunksWritten = chunksWritten
  console.log(
    `[slate] Ingested ${filesIngested} file(s) (${chunksWritten} chunks), skipped ${filesSkipped}, removed ${filesRemoved} — ${memoryIndex.size} chunks in the index`,
  )
}

/**
 * Background ingestion — single-flight with one queued rerun, mirroring the
 * watcher's scan guard. Callers fire-and-forget; the UI never waits.
 */
export async function runSlateIngestion(root: string, projects?: SlateProject[]): Promise<void> {
  if (status.running) {
    queued = true
    return
  }
  status.running = true
  try {
    await ingestOnce(root, projects)
  } catch (err) {
    status.lastError = (err as Error).message
    console.error('[slate] Ingestion run failed:', (err as Error).message)
  } finally {
    status.running = false
    if (queued) {
      queued = false
      void runSlateIngestion(root)
    }
  }
}
