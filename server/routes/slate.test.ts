import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'

// ── Mock the slate libs ─────────────────────────────────────────────────
const {
  mockListSlateProjects,
  mockListSlateConfirmItems,
  mockGetSlateCounts,
  mockGetSlateConfig,
  mockSaveSlateConfig,
  mockRunSlateScan,
  mockIsWatcherActive,
  mockStartWatcher,
} = vi.hoisted(() => ({
  mockListSlateProjects: vi.fn(),
  mockListSlateConfirmItems: vi.fn(),
  mockGetSlateCounts: vi.fn(),
  mockGetSlateConfig: vi.fn(),
  mockSaveSlateConfig: vi.fn(),
  mockRunSlateScan: vi.fn(),
  mockIsWatcherActive: vi.fn(),
  mockStartWatcher: vi.fn(),
}))

vi.mock('../lib/slate', () => ({
  listSlateProjects: mockListSlateProjects,
  listSlateConfirmItems: mockListSlateConfirmItems,
  getSlateCounts: mockGetSlateCounts,
}))
vi.mock('../lib/slate/config', () => ({
  getSlateConfig: mockGetSlateConfig,
  saveSlateConfig: mockSaveSlateConfig,
}))
vi.mock('../lib/slate/scanner', () => ({
  runSlateScan: mockRunSlateScan,
}))
vi.mock('../lib/slate/watcher', () => ({
  isSlateWatcherActive: mockIsWatcherActive,
  startSlateWatcher: mockStartWatcher,
}))

import { slateRouter } from './slate'

const OK_ORIGIN = 'http://localhost:5175'

function makeApp({ authenticated = true } = {}) {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = authenticated ? { uid: 'uid1', cookie: {} } : { cookie: {} }
    next()
  })
  app.use('/api/slate', slateRouter)
  return app
}

const SCAN_SUMMARY = { projects: 2, confirmItems: 1, vaultNotesWritten: 2, scannedAt: '2026-07-02T10:00:00Z' }

beforeEach(() => {
  mockListSlateProjects.mockReset().mockResolvedValue([])
  mockListSlateConfirmItems.mockReset().mockResolvedValue([])
  mockGetSlateCounts.mockReset().mockResolvedValue({ projects: 0, confirm: 0 })
  mockGetSlateConfig.mockReset().mockResolvedValue(null)
  mockSaveSlateConfig.mockReset().mockResolvedValue(undefined)
  mockRunSlateScan.mockReset().mockResolvedValue(SCAN_SUMMARY)
  mockIsWatcherActive.mockReset().mockReturnValue(false)
  mockStartWatcher.mockReset()
})

describe('auth', () => {
  test('every slate route requires a session', async () => {
    const app = makeApp({ authenticated: false })
    for (const url of ['/api/slate/projects', '/api/slate/status', '/api/slate/confirm']) {
      const res = await request(app).get(url)
      expect(res.status).toBe(401)
    }
    const res = await request(app).post('/api/slate/onboard').set('Origin', OK_ORIGIN).send({})
    expect(res.status).toBe(401)
  })
})

describe('GET /api/slate/status', () => {
  test('reports not-onboarded before the wizard runs', async () => {
    const res = await request(makeApp()).get('/api/slate/status')
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      onboarded: false,
      watcherActive: false,
      projectCount: 0,
      confirmCount: 0,
    })
  })

  test('reports folder, watcher and counts once onboarded', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-status-'))
    mockGetSlateConfig.mockResolvedValue({
      devFolderPath: dir,
      onboardedAt: '2026-07-01T00:00:00Z',
      lastScanAt: '2026-07-02T09:00:00Z',
    })
    mockGetSlateCounts.mockResolvedValue({ projects: 3, confirm: 2 })
    mockIsWatcherActive.mockReturnValue(true)

    const res = await request(makeApp()).get('/api/slate/status')
    expect(res.body.data).toMatchObject({
      onboarded: true,
      devFolderPath: dir,
      folderAccessible: true,
      watcherActive: true,
      projectCount: 3,
      confirmCount: 2,
      lastScanAt: '2026-07-02T09:00:00Z',
    })
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('GET /api/slate/projects', () => {
  test('returns projects', async () => {
    mockListSlateProjects.mockResolvedValue([
      { slug: 'LA-CASA', title: 'La Casa', format: 'film', stage: 'rewrites', origin: 'internal', status: 'active' },
    ])
    const res = await request(makeApp()).get('/api/slate/projects')
    expect(res.status).toBe(200)
    expect(res.body.data.projects).toHaveLength(1)
  })

  test('wraps failures in the error envelope', async () => {
    mockListSlateProjects.mockRejectedValue(new Error('firestore down'))
    const res = await request(makeApp()).get('/api/slate/projects')
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('SLATE_LIST_FAILED')
  })
})

describe('GET /api/slate/confirm', () => {
  test('returns the confirm queue', async () => {
    mockListSlateConfirmItems.mockResolvedValue([
      { id: 'abc', path: '_inbox/thing.pdf', reason: 'unfiled', detail: 'Dropped in _inbox', seenAt: 'now' },
    ])
    const res = await request(makeApp()).get('/api/slate/confirm')
    expect(res.body.data.items).toHaveLength(1)
  })
})

describe('POST /api/slate/onboard', () => {
  let dir: string

  beforeEach(() => {
    dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'slate-onboard-')), 'DEVELOPMENT')
  })

  afterEach(() => {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true })
  })

  test('rejects cross-origin writes (csrf)', async () => {
    const res = await request(makeApp()).post('/api/slate/onboard').set('Origin', 'https://evil.example').send({ path: dir })
    expect(res.status).toBe(403)
  })

  test('rejects near-root paths', async () => {
    const res = await request(makeApp()).post('/api/slate/onboard').set('Origin', OK_ORIGIN).send({ path: '/' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('BAD_PATH')
  })

  test('creates the skeleton, saves config, scans and starts the watcher', async () => {
    const res = await request(makeApp()).post('/api/slate/onboard').set('Origin', OK_ORIGIN).send({ path: dir })
    expect(res.status).toBe(200)
    for (const sub of ['_external', '_archive', '_inbox']) {
      expect(fs.existsSync(path.join(dir, sub))).toBe(true)
    }
    expect(mockSaveSlateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ devFolderPath: dir }),
    )
    expect(mockRunSlateScan).toHaveBeenCalledWith(dir)
    expect(mockStartWatcher).toHaveBeenCalledWith(dir)
    expect(res.body.data.scan).toEqual(SCAN_SUMMARY)
  })

  test('is idempotent over an existing folder with material', async () => {
    fs.mkdirSync(path.join(dir, 'LA-CASA'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'LA-CASA', 'project.yaml'), 'title: x')
    const res = await request(makeApp()).post('/api/slate/onboard').set('Origin', OK_ORIGIN).send({ path: dir })
    expect(res.status).toBe(200)
    expect(fs.existsSync(path.join(dir, 'LA-CASA', 'project.yaml'))).toBe(true)
  })
})

describe('POST /api/slate/rescan', () => {
  test('409s before onboarding', async () => {
    const res = await request(makeApp()).post('/api/slate/rescan').set('Origin', OK_ORIGIN).send()
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NOT_ONBOARDED')
  })

  test('409s when the folder is unreachable from this host', async () => {
    mockGetSlateConfig.mockResolvedValue({ devFolderPath: '/nope/never/here', onboardedAt: 'x' })
    const res = await request(makeApp()).post('/api/slate/rescan').set('Origin', OK_ORIGIN).send()
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('FOLDER_UNREACHABLE')
  })

  test('rescans and restarts the watcher when needed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-rescan-'))
    mockGetSlateConfig.mockResolvedValue({ devFolderPath: dir, onboardedAt: 'x' })
    const res = await request(makeApp()).post('/api/slate/rescan').set('Origin', OK_ORIGIN).send()
    expect(res.status).toBe(200)
    expect(mockRunSlateScan).toHaveBeenCalledWith(dir)
    expect(mockStartWatcher).toHaveBeenCalledWith(dir)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
