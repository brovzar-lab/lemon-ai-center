import { beforeEach, describe, expect, test, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { SlateProject } from '@shared/types'

// ── Mocks: firestore, anthropic, sibling slate libs ──────────────────────
const {
  mockAdd,
  mockSet,
  mockGetSlateConfig,
  mockListSlateProjects,
  mockListIndexEntries,
  mockRunSlateScan,
  mockRunSlateIngestion,
  mockStream,
} = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockSet: vi.fn(),
  mockGetSlateConfig: vi.fn(),
  mockListSlateProjects: vi.fn(),
  mockListIndexEntries: vi.fn(),
  mockRunSlateScan: vi.fn(),
  mockRunSlateIngestion: vi.fn(),
  mockStream: vi.fn(),
}))

vi.mock('../firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      add: mockAdd,
      doc: vi.fn(() => ({ set: mockSet })),
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(async () => ({
            docs: [
              { id: 'r2', data: () => ({ skill: 'dev-exec', project: 'B', status: 'done' }) },
              { id: 'r1', data: () => ({ skill: 'co-writer', project: 'A', status: 'failed' }) },
            ],
          })),
        })),
      })),
    })),
  },
}))
vi.mock('../anthropic', () => ({
  getAnthropicClient: () => ({ messages: { stream: mockStream } }),
}))
vi.mock('./config', () => ({ getSlateConfig: mockGetSlateConfig }))
vi.mock('./index', () => ({ listSlateProjects: mockListSlateProjects }))
vi.mock('./scanner', () => ({ runSlateScan: mockRunSlateScan }))
vi.mock('./ingest', () => ({
  listIndexEntries: mockListIndexEntries,
  runSlateIngestion: mockRunSlateIngestion,
}))

import { assembleMaterial, fireSkillRun, listSkillRuns, listSkills } from './skills'

function project(overrides: Partial<SlateProject> = {}): SlateProject {
  return {
    slug: 'LA-CASA',
    title: 'La Casa',
    format: 'film',
    stage: 'rewrites',
    origin: 'internal',
    status: 'active',
    ...overrides,
  }
}

function entry(projectSlug: string, kind: string, file: string, seq: number, extras: Record<string, unknown> = {}) {
  return {
    meta: { project: projectSlug, origin: 'internal', file, kind, seq, ...extras },
    text: `text:${file}#${seq}`,
    vector: Float32Array.from([1, 0]),
  }
}

function finalMessageWith(text: string) {
  return { finalMessage: async () => ({ content: [{ type: 'text', text }] }) }
}

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-skills-'))
  mockAdd.mockReset().mockResolvedValue({ id: 'run-1' })
  mockSet.mockReset().mockResolvedValue(undefined)
  mockGetSlateConfig.mockReset().mockResolvedValue({ devFolderPath: tmpRoot, onboardedAt: 'x' })
  mockListSlateProjects.mockReset().mockResolvedValue([project()])
  mockListIndexEntries
    .mockReset()
    .mockReturnValue([entry('LA-CASA', 'draft', 'LA-CASA/04-drafts/LA-CASA_v02_2026-06-28.fountain', 0, { version: 2 })])
  mockRunSlateScan.mockReset().mockResolvedValue({})
  mockRunSlateIngestion.mockReset().mockResolvedValue(undefined)
  mockStream.mockReset().mockReturnValue(finalMessageWith('# Coverage\n\nSolid.'))
})

// ── The consolidated library (D6) — reads the real skills/ folder ────────

describe('listSkills (the canonical set)', () => {
  test('all six consolidated skills are present', () => {
    const ids = listSkills().map((s) => s.id)
    for (const expected of ['chivo', 'co-writer', 'dev-exec', 'film-finance', 'lemon-coverage', 'story-ninja']) {
      expect(ids).toContain(expected)
    }
  })

  test('the four copied skills are live; the two authored ones await review', () => {
    const byId = new Map(listSkills().map((s) => [s.id, s]))
    for (const liveId of ['co-writer', 'dev-exec', 'lemon-coverage', 'story-ninja']) {
      expect(byId.get(liveId)?.status).toBe('live')
    }
    expect(byId.get('film-finance')?.status).toBe('review-pending')
    expect(byId.get('chivo')?.status).toBe('review-pending')
  })

  test('every skill carries a real description from its frontmatter', () => {
    for (const s of listSkills()) expect(s.description.length).toBeGreaterThan(40)
  })
})

// ── Material assembly ─────────────────────────────────────────────────────

describe('assembleMaterial', () => {
  test('orders kinds, keeps only the current draft version, stays single-project', () => {
    mockListIndexEntries.mockReturnValue([
      entry('LA-CASA', 'draft', 'LA-CASA/04-drafts/v1.fountain', 0, { version: 1 }),
      entry('LA-CASA', 'draft', 'LA-CASA/04-drafts/v2.fountain', 0, { version: 2 }),
      entry('LA-CASA', 'draft', 'LA-CASA/04-drafts/v2.fountain', 1, { version: 2 }),
      entry('LA-CASA', 'idea', 'LA-CASA/01-idea/pitch.md', 0),
      entry('OTRA', 'draft', 'OTRA/04-drafts/o1.fountain', 0, { version: 9 }),
    ])
    const { text, files } = assembleMaterial(project())
    expect(files).toEqual(['LA-CASA/01-idea/pitch.md', 'LA-CASA/04-drafts/v2.fountain'])
    expect(text).not.toContain('v1.fountain')
    expect(text).not.toContain('OTRA')
    expect(text.indexOf('01-idea')).toBeLessThan(text.indexOf('04-drafts'))
    expect(text).toContain('PROJECT: La Casa (LA-CASA)')
  })

  test('an explicit version wins over the highest', () => {
    mockListIndexEntries.mockReturnValue([
      entry('LA-CASA', 'draft', 'LA-CASA/04-drafts/v1.fountain', 0, { version: 1 }),
      entry('LA-CASA', 'draft', 'LA-CASA/04-drafts/v2.fountain', 0, { version: 2 }),
    ])
    const { files } = assembleMaterial(project(), 1)
    expect(files).toEqual(['LA-CASA/04-drafts/v1.fountain'])
  })

  test('caps runaway material and says so', () => {
    mockListIndexEntries.mockReturnValue(
      Array.from({ length: 100 }, (_, i) => ({
        ...entry('LA-CASA', 'draft', 'LA-CASA/04-drafts/v1.fountain', i, { version: 1 }),
        text: 'x'.repeat(2000),
      })),
    )
    const { text, truncated } = assembleMaterial(project())
    expect(truncated).toBe(true)
    expect(text.length).toBeLessThanOrEqual(125_000)
  })
})

// ── Firing ────────────────────────────────────────────────────────────────

describe('fireSkillRun', () => {
  test('review-pending skills refuse to fire (D6.3)', async () => {
    await expect(fireSkillRun('film-finance', 'LA-CASA')).rejects.toMatchObject({ code: 'REVIEW_PENDING' })
    await expect(fireSkillRun('chivo', 'LA-CASA')).rejects.toMatchObject({ code: 'REVIEW_PENDING' })
    expect(mockAdd).not.toHaveBeenCalled()
  })

  test('unknown skill / unknown project / dead project / no material are named errors', async () => {
    await expect(fireSkillRun('nope', 'LA-CASA')).rejects.toMatchObject({ code: 'UNKNOWN_SKILL' })
    await expect(fireSkillRun('dev-exec', 'GHOST')).rejects.toMatchObject({ code: 'UNKNOWN_PROJECT' })
    mockListSlateProjects.mockResolvedValue([project({ status: 'dead' })])
    await expect(fireSkillRun('dev-exec', 'LA-CASA')).rejects.toMatchObject({ code: 'PROJECT_DEAD' })
    mockListSlateProjects.mockResolvedValue([project()])
    mockListIndexEntries.mockReturnValue([])
    await expect(fireSkillRun('dev-exec', 'LA-CASA')).rejects.toMatchObject({ code: 'NO_MATERIAL' })
  })

  test('refuses when the folder is unreachable — results must land on disk', async () => {
    mockGetSlateConfig.mockResolvedValue({ devFolderPath: '/nope/never', onboardedAt: 'x' })
    await expect(fireSkillRun('dev-exec', 'LA-CASA')).rejects.toMatchObject({ code: 'FOLDER_UNREACHABLE' })
  })

  test('happy path: logs the run, writes convention-named coverage, rescans + reingests', async () => {
    const { runId } = await fireSkillRun('lemon-coverage', 'LA-CASA')
    expect(runId).toBe('run-1')
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ skill: 'lemon-coverage', project: 'LA-CASA', status: 'running', accepted: null }),
    )

    await vi.waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }), { merge: true })
    })
    const done = mockSet.mock.calls.find((c) => c[0].status === 'done')![0]
    const expectedName = `LA-CASA_lemon-coverage_${new Date().toISOString().slice(0, 10)}.md`
    expect(done.outputFile).toBe(path.join('LA-CASA', 'coverage', expectedName))
    const onDisk = fs.readFileSync(path.join(tmpRoot, 'LA-CASA', 'coverage', expectedName), 'utf8')
    expect(onDisk).toContain('# Coverage')
    await vi.waitFor(() => {
      expect(mockRunSlateScan).toHaveBeenCalledWith(tmpRoot)
      expect(mockRunSlateIngestion).toHaveBeenCalledWith(tmpRoot)
    })

    // the skill body + harness made it into the system prompt; material into the user turn
    const call = mockStream.mock.calls[0][0]
    expect(call.system).toContain('running as a skill inside DEVELOPMENT-HELL')
    expect(call.system).toContain('Lemon Coverage')
    expect(call.messages[0].content).toContain('PROJECT: La Casa (LA-CASA)')
  })

  test('external projects land coverage under _external/', async () => {
    mockListSlateProjects.mockResolvedValue([project({ origin: 'external' })])
    mockListIndexEntries.mockReturnValue([
      { ...entry('LA-CASA', 'draft', '_external/LA-CASA/04-drafts/v1.pdf', 0, { version: 1 }), meta: { project: 'LA-CASA', origin: 'external', file: '_external/LA-CASA/04-drafts/v1.pdf', kind: 'draft', seq: 0, version: 1 } },
    ])
    await fireSkillRun('dev-exec', 'LA-CASA')
    await vi.waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }), { merge: true })
    })
    const done = mockSet.mock.calls.find((c) => c[0].status === 'done')![0]
    expect(done.outputFile.startsWith(path.join('_external', 'LA-CASA', 'coverage'))).toBe(true)
  })

  test('same skill × project cannot run twice concurrently', async () => {
    let release!: (v: { content: Array<{ type: string; text: string }> }) => void
    mockStream.mockReturnValue({
      finalMessage: () => new Promise((resolve) => (release = resolve)),
    })
    await fireSkillRun('story-ninja', 'LA-CASA')
    await expect(fireSkillRun('story-ninja', 'LA-CASA')).rejects.toMatchObject({ code: 'ALREADY_RUNNING' })
    release({ content: [{ type: 'text', text: 'ok' }] })
    await vi.waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }), { merge: true })
    })
  })

  test('a failed model call is recorded, not thrown into the void', async () => {
    mockStream.mockReturnValue({ finalMessage: async () => Promise.reject(new Error('rate limited')) })
    await fireSkillRun('co-writer', 'LA-CASA')
    await vi.waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', error: 'rate limited' }),
        { merge: true },
      )
    })
  })
})

describe('listSkillRuns', () => {
  test('returns the log newest first with ids attached', async () => {
    const runs = await listSkillRuns(2)
    expect(runs.map((r) => r.id)).toEqual(['r2', 'r1'])
    expect(runs[0].skill).toBe('dev-exec')
  })
})
