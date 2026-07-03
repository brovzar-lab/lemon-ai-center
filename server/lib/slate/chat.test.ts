import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { SlateProject } from '@shared/types'

// ── Mocks: keep firebase / flexsearch / the network out ─────────────────
const { mockSearchSlate, mockListIndexEntries, mockGetBrainEngine, mockListSlateProjects } =
  vi.hoisted(() => ({
    mockSearchSlate: vi.fn(),
    mockListIndexEntries: vi.fn(),
    mockGetBrainEngine: vi.fn(),
    mockListSlateProjects: vi.fn(),
  }))

vi.mock('./ingest', () => ({
  searchSlate: mockSearchSlate,
  listIndexEntries: mockListIndexEntries,
}))
vi.mock('../brain', () => ({
  getBrainEngine: mockGetBrainEngine,
}))
vi.mock('./index', () => ({
  listSlateProjects: mockListSlateProjects,
}))

import { buildSlateStateBlock, buildSlateChatSystem, executeSlateChatTool } from './chat'

const NOW = new Date('2026-07-03T12:00:00Z')

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

interface FakeEntry {
  meta: Record<string, unknown>
  text: string
  vector: Float32Array
}

function entry(
  projectSlug: string,
  kind: string,
  file: string,
  seq: number,
  vector: number[],
  extras: Record<string, unknown> = {},
): FakeEntry {
  return {
    meta: { project: projectSlug, origin: 'internal', file, kind, seq, ...extras },
    text: `text of ${file}#${seq}`,
    vector: Float32Array.from(vector),
  }
}

beforeEach(() => {
  mockSearchSlate.mockReset().mockResolvedValue([])
  mockListIndexEntries.mockReset().mockReturnValue([])
  mockGetBrainEngine.mockReset().mockReturnValue(null)
  mockListSlateProjects.mockReset().mockResolvedValue([])
})

// ── State block ──────────────────────────────────────────────────────────

describe('buildSlateStateBlock', () => {
  test('empty slate says so instead of inventing', () => {
    expect(buildSlateStateBlock([], NOW)).toContain('The slate is empty')
  })

  test('does the staleness math and lists drafts', () => {
    const block = buildSlateStateBlock(
      [
        project({
          last_touched: '2026-04-28T00:00:00Z', // 66 days before NOW
          current_draft: { version: 2, date: '2026-04-28', file: '04-drafts/LA-CASA_v02_2026-04-28.fdx' },
          targets: ['Apple TV+'],
        }),
      ],
      NOW,
    )
    expect(block).toContain('66d ago')
    expect(block).toContain('66/7d')
    expect(block).toContain('STALE')
    expect(block).toContain('current draft: v02')
    expect(block).toContain('targets: Apple TV+')
  })

  test('marks external loudly and lists dead as archived', () => {
    const block = buildSlateStateBlock(
      [
        project(),
        project({ slug: 'SUBMISSION-X', title: 'Someone Elses Movie', origin: 'external' }),
        project({ slug: 'OLD-ONE', title: 'Old One', status: 'dead' }),
      ],
      NOW,
    )
    expect(block).toContain('SUBMISSION-X — "Someone Elses Movie"')
    expect(block).toContain('EXTERNAL (firewalled submission)')
    expect(block).toMatch(/Archived \(dead.*OLD-ONE/)
    expect(block).toContain('2 project(s) on the slate (1 external), 1 archived')
  })
})

describe('buildSlateChatSystem', () => {
  test('carries the firewall rule and today’s date', () => {
    const system = buildSlateChatSystem([project()], NOW)
    expect(system).toContain('EXTERNAL FIREWALL')
    expect(system).toContain('2026-07-03')
    expect(system).toContain('SLATE STATE')
  })
})

// ── search_slate: the firewall lives in retrieval ────────────────────────

describe('search_slate tool', () => {
  test('creative purpose forces internal scope (the firewall)', async () => {
    await executeSlateChatTool('search_slate', { query: 'nuns in space', purpose: 'creative' })
    expect(mockSearchSlate).toHaveBeenCalledWith('nuns in space', {
      scope: 'internal',
      project: undefined,
      limit: 8,
    })
  })

  test('status purpose searches everything', async () => {
    await executeSlateChatTool('search_slate', { query: 'x', purpose: 'status' })
    expect(mockSearchSlate).toHaveBeenCalledWith('x', expect.objectContaining({ scope: 'all' }))
  })

  test('include_external opens creative scope only when set explicitly', async () => {
    await executeSlateChatTool('search_slate', {
      query: 'x',
      purpose: 'creative',
      include_external: true,
    })
    expect(mockSearchSlate).toHaveBeenCalledWith('x', expect.objectContaining({ scope: 'all' }))
  })

  test('unknown keys are rejected (strict schema)', async () => {
    await expect(
      executeSlateChatTool('search_slate', { query: 'x', purpose: 'status', uid: 'evil' }),
    ).rejects.toThrow()
  })

  test('hits are capped to 700 chars and labeled with scope', async () => {
    mockSearchSlate.mockResolvedValue([
      {
        score: 0.51234,
        text: 'y'.repeat(900),
        project: 'LA-CASA',
        origin: 'internal',
        file: '04-drafts/f.fdx',
        kind: 'draft',
        version: 2,
      },
    ])
    const out = await executeSlateChatTool('search_slate', { query: 'q', purpose: 'creative' })
    const payload = JSON.parse(out.content)
    expect(payload.scope).toContain('firewall active')
    expect(payload.hits[0].text).toHaveLength(700)
    expect(payload.hits[0].score).toBe(0.512)
    expect(out.label).toContain('internal only')
  })
})

// ── read_material: paged sequential reading ──────────────────────────────

describe('read_material tool', () => {
  test('pages through a file in seq order and says how to continue', async () => {
    const file = 'LA-CASA/04-drafts/LA-CASA_v02_2026-04-28.fdx'
    mockListIndexEntries.mockReturnValue(
      [7, 3, 0, 1, 2, 4, 5, 6].map((seq) =>
        entry('LA-CASA', 'draft', file, seq, [1, 0], { sceneIndex: seq, sceneHeading: `INT. SCENE ${seq}` }),
      ),
    )
    const out = await executeSlateChatTool('read_material', { file, from_seq: 3, max_chunks: 2 })
    expect(out.content).toContain('showing seq 3–4')
    expect(out.content).toContain('8 chunks total')
    expect(out.content).toContain('--- chunk 3 ---')
    expect(out.content).toContain('INT. SCENE 4')
    expect(out.content).not.toContain('--- chunk 5 ---')
    expect(out.content).toContain('continue with from_seq=5')
  })

  test('unknown file returns guidance, not a throw', async () => {
    const out = await executeSlateChatTool('read_material', { file: 'nope.pdf' })
    expect(out.content).toContain('No indexed file')
  })

  test('external files carry the firewall banner', async () => {
    const file = '_external/SUB-X/04-drafts/SUB-X_v01_2026-06-01.pdf'
    mockListIndexEntries.mockReturnValue([
      { ...entry('SUB-X', 'draft', file, 0, [1, 0]), meta: { project: 'SUB-X', origin: 'external', file, kind: 'draft', seq: 0 } },
    ])
    const out = await executeSlateChatTool('read_material', { file })
    expect(out.content).toContain('[EXTERNAL — firewalled submission]')
  })
})

// ── draft_structure ──────────────────────────────────────────────────────

describe('draft_structure tool', () => {
  const fdx = 'LA-CASA/04-drafts/LA-CASA_v03_2026-06-01.fdx'
  const pdf = 'LA-CASA/04-drafts/LA-CASA_v03_2026-06-01.pdf'
  const old = 'LA-CASA/04-drafts/LA-CASA_v01_2026-01-01.docx'

  beforeEach(() => {
    mockListIndexEntries.mockReturnValue([
      // v1: prose, no scenes
      entry('LA-CASA', 'draft', old, 0, [1, 0], { version: 1 }),
      entry('LA-CASA', 'draft', old, 1, [1, 0], { version: 1 }),
      // v3 twin files: fdx has the scene map, pdf does not
      entry('LA-CASA', 'draft', fdx, 0, [1, 0], { version: 3, sceneIndex: 0, sceneHeading: 'INT. COCINA — NOCHE' }),
      entry('LA-CASA', 'draft', fdx, 1, [1, 0], { version: 3, sceneIndex: 0, sceneHeading: 'INT. COCINA — NOCHE' }),
      entry('LA-CASA', 'draft', fdx, 2, [1, 0], { version: 3, sceneIndex: 1, sceneHeading: 'EXT. AZOTEA — DÍA' }),
      entry('LA-CASA', 'draft', pdf, 0, [1, 0], { version: 3 }),
      entry('LA-CASA', 'draft', pdf, 1, [1, 0], { version: 3 }),
      // another project — must not leak in
      entry('OTRA', 'draft', 'OTRA/04-drafts/OTRA_v09_2026-06-01.fdx', 0, [1, 0], { version: 9 }),
    ])
  })

  test('maps the highest indexed version, preferring the scene-bearing file', async () => {
    const out = await executeSlateChatTool('draft_structure', { project: 'LA-CASA' })
    const payload = JSON.parse(out.content)
    expect(payload.version).toBe(3)
    expect(payload.file).toBe(fdx)
    expect(payload.scenes).toEqual([
      { scene: 0, heading: 'INT. COCINA — NOCHE', chunks: '0–1' },
      { scene: 1, heading: 'EXT. AZOTEA — DÍA', chunks: '2–2' },
    ])
  })

  test('explicit version without scene headings falls back honestly', async () => {
    const out = await executeSlateChatTool('draft_structure', { project: 'LA-CASA', version: 1 })
    const payload = JSON.parse(out.content)
    expect(payload.file).toBe(old)
    expect(payload.note).toContain('No scene headings')
  })

  test('missing version lists what exists', async () => {
    const out = await executeSlateChatTool('draft_structure', { project: 'LA-CASA', version: 7 })
    expect(out.content).toContain('no indexed draft v7')
    expect(out.content).toContain('1, 3')
  })

  test('no drafts at all is a plain answer', async () => {
    mockListIndexEntries.mockReturnValue([])
    const out = await executeSlateChatTool('draft_structure', { project: 'LA-CASA' })
    expect(out.content).toContain('No indexed draft material')
  })
})

// ── compare_projects: centroid similarity + firewall ─────────────────────

describe('compare_projects tool', () => {
  beforeEach(() => {
    const entries = [
      // A and B are secretly the same movie
      ...[0, 1, 2].map((s) => entry('AAA', 'draft', 'AAA/04-drafts/a.fdx', s, [1, 0, 0, 0])),
      ...[0, 1, 2].map((s) => entry('BBB', 'treatment', 'BBB/02-treatment/b.pdf', s, [0.95, 0.05, 0, 0])),
      // C is something else entirely
      ...[0, 1, 2].map((s) => entry('CCC', 'outline', 'CCC/03-outline/c.md', s, [0, 0, 1, 0])),
      // EXT is external and identical to A — firewalled out of creative runs
      ...[0, 1, 2].map((s) => ({
        ...entry('EXT', 'draft', '_external/EXT/04-drafts/e.pdf', s, [1, 0, 0, 0]),
        meta: { project: 'EXT', origin: 'external', file: '_external/EXT/04-drafts/e.pdf', kind: 'draft', seq: s },
      })),
      // notes never count as creative identity
      entry('CCC', 'notes', 'CCC/notes/n.md', 0, [1, 0, 0, 0]),
      // too little material to have an identity
      entry('TINY', 'idea', 'TINY/01-idea/i.md', 0, [0, 1, 0, 0]),
    ]
    mockListIndexEntries.mockReturnValue(entries)
  })

  test('creative purpose excludes external; the twin pair wins', async () => {
    const out = await executeSlateChatTool('compare_projects', { purpose: 'creative' })
    const payload = JSON.parse(out.content)
    expect(payload.projects.map((p: any) => p.project).sort()).toEqual(['AAA', 'BBB', 'CCC'])
    expect(payload.pairs[0].a).toBe('AAA')
    expect(payload.pairs[0].b).toBe('BBB')
    expect(payload.pairs[0].similarity).toBeGreaterThan(0.99)
    expect(payload.skippedTooLittleMaterial).toEqual(['TINY (1 chunks)'])
    expect(out.label).toContain('internal only')
  })

  test('status purpose sees external, marked', async () => {
    const out = await executeSlateChatTool('compare_projects', { purpose: 'status' })
    const payload = JSON.parse(out.content)
    const ext = payload.projects.find((p: any) => p.project === 'EXT')
    expect(ext.origin).toBe('external')
    expect(payload.pairs[0].similarity).toBeGreaterThan(0.999) // AAA–EXT are identical
  })

  test('fewer than two comparable projects is a plain answer', async () => {
    mockListIndexEntries.mockReturnValue([entry('AAA', 'draft', 'a.fdx', 0, [1, 0])])
    const out = await executeSlateChatTool('compare_projects', { purpose: 'creative' })
    expect(out.content).toContain('Not enough indexed creative material')
  })
})

// ── search_vault ─────────────────────────────────────────────────────────

describe('search_vault tool', () => {
  test('degrades plainly when the brain is not up', async () => {
    const out = await executeSlateChatTool('search_vault', { query: 'x' })
    expect(out.content).toContain('not available')
  })

  test('returns vault notes when the brain is ready', async () => {
    mockGetBrainEngine.mockReturnValue({
      isReady: () => true,
      search: vi.fn().mockReturnValue([
        {
          path: 'slate/LA-CASA.md',
          title: 'LA-CASA',
          folder: 'slate',
          snippet: 'stage: rewrites…',
          score: 2,
          modifiedAt: '2026-07-01T00:00:00Z',
        },
      ]),
    })
    const out = await executeSlateChatTool('search_vault', { query: 'la casa status' })
    const payload = JSON.parse(out.content)
    expect(payload[0].path).toBe('slate/LA-CASA.md')
    expect(out.label).toContain('1 note(s)')
  })
})

describe('unknown tool', () => {
  test('answers instead of throwing', async () => {
    const out = await executeSlateChatTool('rm_rf', {})
    expect(out.content).toContain('Unknown tool')
  })
})
