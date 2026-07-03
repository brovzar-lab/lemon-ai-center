import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// ── Fake Firestore (collections of maps, batch = queued ops) ────────────
const { store, col, fakeDb } = vi.hoisted(() => {
  const store = new Map<string, Map<string, Record<string, unknown>>>()
  const col = (name: string) => {
    if (!store.has(name)) store.set(name, new Map())
    return store.get(name)!
  }
  const fakeDb = {
    collection: (name: string) => ({
      get: async () => ({
        docs: [...col(name).entries()].map(([id, data]) => ({ id, data: () => ({ ...data }) })),
        empty: col(name).size === 0,
      }),
      doc: (id: string) => ({
        __col: name,
        __id: id,
        set: async (data: Record<string, unknown>) => void col(name).set(id, { ...data }),
        delete: async () => void col(name).delete(id),
      }),
    }),
    batch: () => {
      const ops: Array<() => void> = []
      return {
        set: (ref: { __col: string; __id: string }, data: Record<string, unknown>) => {
          ops.push(() => col(ref.__col).set(ref.__id, { ...data }))
        },
        delete: (ref: { __col: string; __id: string }) => {
          ops.push(() => col(ref.__col).delete(ref.__id))
        },
        commit: async () => void ops.forEach((op) => op()),
      }
    },
  }
  return { store, col, fakeDb }
})

vi.mock('../firebase', () => ({ db: fakeDb }))

// ── Deterministic embeddings: vector encodes the text's char sum ────────
const { mockEmbedTexts, mockEmbedQuery } = vi.hoisted(() => {
  const vecFor = (text: string) => {
    const seed = [...text].reduce((s, c) => s + c.charCodeAt(0), 0) % 97
    const raw = Array.from({ length: 768 }, (_, i) => Math.sin(seed + i * 0.1))
    const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0))
    return raw.map((v) => v / norm)
  }
  return {
    mockEmbedTexts: vi.fn(async (texts: string[]) => texts.map(vecFor)),
    mockEmbedQuery: vi.fn(async (q: string) => vecFor(q)),
  }
})

vi.mock('./embeddings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./embeddings')>()
  return { ...actual, embedTexts: mockEmbedTexts, embedQuery: mockEmbedQuery }
})

import {
  collectIngestTargets,
  initSlateIndex,
  runSlateIngestion,
  searchSlate,
  slateIndexSize,
} from './ingest'
import type { SlateProject } from '@shared/types'

let root: string

function write(rel: string, content: string) {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

function project(overrides: Partial<SlateProject>): SlateProject {
  return {
    slug: 'X',
    title: 'x',
    format: 'film',
    stage: 'idea',
    origin: 'internal',
    status: 'active',
    ...overrides,
  }
}

const PROJECTS: SlateProject[] = [
  project({ slug: 'LA-CASA', stage: 'rewrites' }),
  project({ slug: 'SUB-X', origin: 'external' }),
  project({ slug: 'MUERTO', status: 'dead' }),
]

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-ingest-'))
  store.clear()
  mockEmbedTexts.mockClear()
  mockEmbedQuery.mockClear()
  write('LA-CASA/04-drafts/LA-CASA_v01_2026-06-01.fountain', 'INT. COCINA - NOCHE\n\nMaría enciende la estufa. El gas no prende.\n')
  write('LA-CASA/notes/ideas.md', '# Notas\n\nEl acto dos necesita un giro más fuerte.\n')
  write('_external/SUB-X/04-drafts/SUB-X_v02_2026-06-10.fountain', 'INT. OFICINA - DÍA\n\nUn abogado externo revisa contratos.\n')
  write('_archive/MUERTO/04-drafts/MUERTO_v01_2026-01-01.txt', 'Nunca debería indexarse.')
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('collectIngestTargets', () => {
  test('collects material from live projects only, with kind/version metadata', () => {
    const targets = collectIngestTargets(root, PROJECTS)
    const paths = targets.map((t) => t.relPath).sort()
    expect(paths).toEqual([
      'LA-CASA/04-drafts/LA-CASA_v01_2026-06-01.fountain',
      'LA-CASA/notes/ideas.md',
      '_external/SUB-X/04-drafts/SUB-X_v02_2026-06-10.fountain',
    ])
    const draft = targets.find((t) => t.kind === 'draft' && t.project === 'LA-CASA')
    expect(draft?.version).toBe(1)
    const ext = targets.find((t) => t.project === 'SUB-X')
    expect(ext?.origin).toBe('external')
  })
})

describe('runSlateIngestion', () => {
  test('first run embeds everything; chunks land in Firestore and the index', async () => {
    await runSlateIngestion(root, PROJECTS)
    expect(slateIndexSize()).toBeGreaterThanOrEqual(3)
    expect(col('slate_chunks').size).toBe(slateIndexSize())
    expect(col('slate_files').size).toBe(3)
    const chunks = [...col('slate_chunks').values()]
    const casa = chunks.find((c) => c.project === 'LA-CASA' && c.kind === 'draft')
    expect(casa).toMatchObject({ origin: 'internal', version: 1, sceneIndex: 1 })
    expect((casa as { embedding: number[] }).embedding).toHaveLength(768)
    expect(chunks.some((c) => c.project === 'MUERTO')).toBe(false)
  })

  test('unchanged rerun skips the embedding API entirely', async () => {
    await runSlateIngestion(root, PROJECTS)
    mockEmbedTexts.mockClear()
    await runSlateIngestion(root, PROJECTS)
    expect(mockEmbedTexts).not.toHaveBeenCalled()
  })

  test('a changed file re-embeds and replaces its chunks', async () => {
    await runSlateIngestion(root, PROJECTS)
    const before = [...col('slate_chunks').entries()].filter(([, c]) => c.kind === 'notes')
    write('LA-CASA/notes/ideas.md', '# Notas\n\nAhora el acto dos funciona: la madre confiesa.\n')
    await runSlateIngestion(root, PROJECTS)
    const after = [...col('slate_chunks').entries()].filter(([, c]) => c.kind === 'notes')
    expect(after).toHaveLength(before.length)
    expect(after[0][1].text).toContain('confiesa')
  })

  test('a deleted file drops its chunks and ledger entry', async () => {
    await runSlateIngestion(root, PROJECTS)
    const sizeBefore = col('slate_chunks').size
    fs.rmSync(path.join(root, 'LA-CASA/notes/ideas.md'))
    await runSlateIngestion(root, PROJECTS)
    expect(col('slate_files').size).toBe(2)
    expect(col('slate_chunks').size).toBeLessThan(sizeBefore)
    expect([...col('slate_chunks').values()].some((c) => c.kind === 'notes')).toBe(false)
  })
})

describe('searchSlate + firewall', () => {
  test('scope internal excludes external chunks; all includes them', async () => {
    await runSlateIngestion(root, PROJECTS)
    const all = await searchSlate('contratos de abogados', { scope: 'all', limit: 50 })
    expect(all.some((h) => h.origin === 'external')).toBe(true)
    const internal = await searchSlate('contratos de abogados', { scope: 'internal', limit: 50 })
    expect(internal.length).toBeGreaterThan(0)
    expect(internal.every((h) => h.origin !== 'external')).toBe(true)
  })

  test('project filter narrows to one project', async () => {
    await runSlateIngestion(root, PROJECTS)
    const hits = await searchSlate('cualquier cosa', { project: 'LA-CASA', limit: 50 })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((h) => h.project === 'LA-CASA')).toBe(true)
  })
})

describe('initSlateIndex', () => {
  test('rebuilds the in-memory index from Firestore at boot', async () => {
    await runSlateIngestion(root, PROJECTS)
    const size = slateIndexSize()
    // simulate a restart: wipe memory only
    await initSlateIndex()
    expect(slateIndexSize()).toBe(size)
    const hits = await searchSlate('estufa', { limit: 5 })
    expect(hits.length).toBeGreaterThan(0)
  })
})
