import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { SlateProject, SlateSkillRun, SlateBriefingSnapshotEntry } from '@shared/types'

// ── Mocks ─────────────────────────────────────────────────────────────────
const { mockCreate, mockListSlateProjects, mockListSkillRuns, firestore } = vi.hoisted(() => {
  const store = new Map<string, any>()
  const docs: Array<{ id: string; data: any }> = []
  return {
    mockCreate: vi.fn(),
    mockListSlateProjects: vi.fn(),
    mockListSkillRuns: vi.fn(),
    firestore: { store, docs },
  }
})

vi.mock('../firebase', () => ({
  db: {
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: firestore.store.has(id),
          data: () => firestore.store.get(id),
        }),
        set: async (data: any, opts?: { merge?: boolean }) => {
          const prev = opts?.merge ? firestore.store.get(id) ?? {} : {}
          firestore.store.set(id, { ...prev, ...data })
        },
      }),
      orderBy: () => ({
        limit: () => ({
          get: async () => ({
            docs: firestore.docs.map((d) => ({ id: d.id, data: () => d.data })),
          }),
        }),
      }),
    }),
  },
}))
vi.mock('../anthropic', () => ({ getAnthropicClient: () => ({ messages: { create: mockCreate } }) }))
vi.mock('./index', () => ({ listSlateProjects: mockListSlateProjects }))
vi.mock('./skills', () => ({ listSkillRuns: mockListSkillRuns }))

import {
  assembleBriefingScaffold,
  collectGoingStale,
  collectNudges,
  collectWaitingOn,
  collectDeadlines,
  diffMovement,
  ensureBriefing,
  snapshotProjects,
} from './briefing'

// Fixed "now" so every day-count is deterministic.
const NOW = new Date('2026-07-03T18:00:00Z')

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

function brainReturns(headline: string, pushes: string[]) {
  mockCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ headline, todaysPushes: pushes }) }],
  })
}

beforeEach(() => {
  firestore.store.clear()
  firestore.docs.length = 0
  mockCreate.mockReset()
  mockListSlateProjects.mockReset().mockResolvedValue([])
  mockListSkillRuns.mockReset().mockResolvedValue([])
})

// ── What Moved (the snapshot diff) ────────────────────────────────────────

describe('diffMovement', () => {
  test('no prior snapshot → empty (first run)', () => {
    expect(diffMovement([project()], undefined, [], undefined)).toEqual([])
  })

  test('detects new project, stage change, new draft, archive', () => {
    const prior: Record<string, SlateBriefingSnapshotEntry> = {
      'LA-CASA': { stage: 'treatment', draftVersion: null, lastTouched: '2026-06-01T00:00:00Z', status: 'active' },
      OLD: { stage: 'draft1', draftVersion: 2, lastTouched: '2026-05-01T00:00:00Z', status: 'active' },
    }
    const projects = [
      project({ stage: 'draft1', current_draft: { version: 1, file: 'x', date: '2026-07-01' } }),
      project({ slug: 'NUEVA', title: 'Nueva', stage: 'idea' }),
      project({ slug: 'OLD', title: 'Old', status: 'dead', stage: 'draft1' }),
    ]
    const moves = diffMovement(projects, prior, [], '2026-07-02')
    const kindsFor = (slug: string) => moves.filter((m) => m.project === slug).map((m) => m.kind)
    // stage change and the new draft are both real movements — report both
    expect(kindsFor('LA-CASA').sort()).toEqual(['new-draft', 'stage'])
    expect(kindsFor('NUEVA')).toEqual(['new-project'])
    expect(kindsFor('OLD')).toEqual(['archived'])
  })

  test('a landed coverage run outranks a bare touch for that project', () => {
    const prior: Record<string, SlateBriefingSnapshotEntry> = {
      'LA-CASA': { stage: 'rewrites', draftVersion: 2, lastTouched: '2026-07-01T00:00:00Z', status: 'active' },
    }
    const projects = [project({ last_touched: '2026-07-03T10:00:00Z', current_draft: { version: 2, file: 'x' } })]
    const runs: SlateSkillRun[] = [
      {
        id: 'r1',
        skill: 'lemon-coverage',
        project: 'LA-CASA',
        model: 'm',
        status: 'done',
        startedAt: '2026-07-03T09:00:00Z',
        outputFile: 'LA-CASA/coverage/LA-CASA_lemon-coverage_2026-07-03.md',
        accepted: null,
      },
    ]
    const moves = diffMovement(projects, prior, runs, '2026-07-02')
    const laCasa = moves.filter((m) => m.project === 'LA-CASA')
    expect(laCasa).toHaveLength(1)
    expect(laCasa[0].kind).toBe('coverage')
    expect(laCasa[0].detail).toContain('lemon-coverage')
  })

  test('ignores coverage runs from before the compare point', () => {
    const prior: Record<string, SlateBriefingSnapshotEntry> = {
      'LA-CASA': { stage: 'rewrites', draftVersion: null, lastTouched: null, status: 'active' },
    }
    const runs: SlateSkillRun[] = [
      { id: 'r1', skill: 'dev-exec', project: 'LA-CASA', model: 'm', status: 'done', startedAt: '2026-06-01T00:00:00Z', outputFile: 'f.md', accepted: null },
    ]
    expect(diffMovement([project()], prior, runs, '2026-07-02')).toEqual([])
  })
})

// ── Going Stale ────────────────────────────────────────────────────────────

describe('collectGoingStale', () => {
  test('excludes fresh, keeps aging/stale, sorts worst-first', () => {
    const projects = [
      project({ slug: 'FRESH', last_touched: '2026-07-02T00:00:00Z' }), // 1d / 7 → fresh
      project({ slug: 'AGING', last_touched: '2026-06-27T00:00:00Z' }), // ~6d / 7 → aging
      project({ slug: 'STALE', last_touched: '2026-06-01T00:00:00Z' }), // ~32d / 7 → stale
    ]
    const out = collectGoingStale(projects, NOW)
    expect(out.map((s) => s.project)).toEqual(['STALE', 'AGING'])
    expect(out[0].level).toBe('stale')
    expect(out[1].level).toBe('aging')
  })

  test('paused/dead never appear', () => {
    const projects = [
      project({ slug: 'PAUSED', status: 'paused', last_touched: '2026-01-01T00:00:00Z' }),
      project({ slug: 'DEAD', status: 'dead', last_touched: '2026-01-01T00:00:00Z' }),
    ]
    expect(collectGoingStale(projects, NOW)).toEqual([])
  })
})

// ── Waiting On ──────────────────────────────────────────────────────────────

describe('collectWaitingOn', () => {
  test('lists waits with day counts, writer flag, newest-wait last', () => {
    const projects = [
      project({
        slug: 'A',
        writers: [{ name: 'María' }],
        waiting_on: { who: 'María', what: 'draft 4', since: '2026-06-19' },
      }),
      project({
        slug: 'B',
        waiting_on: { who: 'Apple', what: 'greenlight', since: '2026-07-01' },
      }),
    ]
    const out = collectWaitingOn(projects, NOW)
    expect(out.map((w) => w.project)).toEqual(['A', 'B']) // 14d before 2d
    expect(out[0].isWriter).toBe(true)
    expect(out[1].isWriter).toBe(false)
    expect(out[0].days).toBe(14)
  })
})

// ── Suggested Nudges ─────────────────────────────────────────────────────────

describe('collectNudges', () => {
  test('only surfaces waits whose clock is aging/stale, with writer contact', () => {
    const projects = [
      project({
        slug: 'HOT',
        writers: [{ name: 'María', contact: 'maria@x.com', language: 'es' }],
        waiting_on: { who: 'María', what: 'draft 4', since: '2026-06-01' }, // 32d, writer window 14 → stale
      }),
      project({
        slug: 'FINE',
        writers: [{ name: 'Dan' }],
        waiting_on: { who: 'Dan', what: 'pages', since: '2026-07-01' }, // 2d → fresh, no nudge
      }),
    ]
    const out = collectNudges(projects, NOW)
    expect(out.map((n) => n.project)).toEqual(['HOT'])
    expect(out[0].contact).toBe('maria@x.com')
    expect(out[0].language).toBe('es')
    expect(out[0].reason).toContain('Overdue')
  })

  test('buyer/platform waits nudge without a contact', () => {
    const projects = [
      project({ slug: 'B', waiting_on: { who: 'Netflix', what: 'a yes', since: '2026-06-10' } }),
    ]
    const out = collectNudges(projects, NOW)
    expect(out).toHaveLength(1)
    expect(out[0].contact).toBeUndefined()
  })
})

// ── Deadlines ────────────────────────────────────────────────────────────────

describe('collectDeadlines', () => {
  test('keeps future deadlines within the horizon, soonest first', () => {
    const projects = [
      project({ slug: 'SOON', deadlines: [{ date: '2026-07-08', what: 'lab' }] }), // 5d
      project({ slug: 'FAR', deadlines: [{ date: '2026-12-01', what: 'festival' }] }), // >45d, dropped
      project({ slug: 'PAST', deadlines: [{ date: '2026-06-01', what: 'gone' }] }), // past, dropped
      project({ slug: 'MID', deadlines: [{ date: '2026-07-30', what: 'draft' }] }), // 27d
    ]
    const out = collectDeadlines(projects, NOW)
    expect(out.map((d) => d.project)).toEqual(['SOON', 'MID'])
    expect(out[0].daysUntil).toBe(5)
  })
})

// ── ensureBriefing (cache + background + brain) ──────────────────────────────

describe('ensureBriefing', () => {
  test('first call generates in the background and reports generating', async () => {
    mockListSlateProjects.mockResolvedValue([project({ last_touched: '2026-06-01T00:00:00Z' })])
    brainReturns('One project is stale.', ['Push La Casa forward.'])

    const first = await ensureBriefing(false, NOW)
    expect(first.status).toBe('generating')

    // background generateNow resolves on the next tick
    await vi.waitFor(async () => {
      const res = await ensureBriefing(false, NOW)
      expect(res.status).toBe('ready')
    })
    const ready = await ensureBriefing(false, NOW)
    expect(ready.briefing?.headline).toBe('One project is stale.')
    expect(ready.briefing?.todaysPushes).toEqual(['Push La Casa forward.'])
    expect(ready.briefing?.goingStale[0].project).toBe('LA-CASA')
    // snapshot is server-only — never leaks to the client payload
    expect((ready.briefing as any).snapshot).toBeUndefined()
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  test('a ready briefing is served from cache without re-hitting the brain', async () => {
    mockListSlateProjects.mockResolvedValue([project()])
    brainReturns('Steady.', [])
    await ensureBriefing(false, NOW)
    await vi.waitFor(async () => expect((await ensureBriefing(false, NOW)).status).toBe('ready'))
    mockCreate.mockClear()
    const again = await ensureBriefing(false, NOW)
    expect(again.status).toBe('ready')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('a degraded brain call still yields a ready briefing with a fallback headline', async () => {
    mockListSlateProjects.mockResolvedValue([project({ last_touched: '2026-05-01T00:00:00Z' })])
    mockCreate.mockRejectedValue(new Error('529 overloaded'))
    await ensureBriefing(false, NOW)
    await vi.waitFor(async () => expect((await ensureBriefing(false, NOW)).status).toBe('ready'))
    const ready = await ensureBriefing(false, NOW)
    expect(ready.briefing?.headline).toBeTruthy()
    expect(ready.briefing?.todaysPushes).toEqual([])
  })

  test('empty slate briefs without calling the brain', async () => {
    mockListSlateProjects.mockResolvedValue([])
    await ensureBriefing(false, NOW)
    await vi.waitFor(async () => expect((await ensureBriefing(false, NOW)).status).toBe('ready'))
    const ready = await ensureBriefing(false, NOW)
    expect(ready.briefing?.projectCount).toBe(0)
    expect(ready.briefing?.headline).toContain('empty')
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

// ── snapshot / scaffold plumbing ─────────────────────────────────────────────

describe('assembleBriefingScaffold', () => {
  test('excludes dead projects from the live sections but keeps them out of stale', () => {
    const projects = [
      project({ slug: 'LIVE', last_touched: '2026-06-01T00:00:00Z' }),
      project({ slug: 'DEAD', status: 'dead', last_touched: '2026-01-01T00:00:00Z' }),
    ]
    const s = assembleBriefingScaffold(projects, [], undefined, undefined, NOW)
    expect(s.goingStale.every((x) => x.project !== 'DEAD')).toBe(true)
  })

  test('snapshotProjects captures stage/version/touch/status per slug', () => {
    const snap = snapshotProjects([project({ current_draft: { version: 3, file: 'x' } })])
    expect(snap['LA-CASA']).toEqual({
      stage: 'rewrites',
      draftVersion: 3,
      lastTouched: null,
      status: 'active',
    })
  })
})
