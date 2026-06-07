import { describe, expect, test, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// ── Mock brain engine ──────────────────────────────────────────────────────
const { mockGetBrainEngine } = vi.hoisted(() => ({
  mockGetBrainEngine: vi.fn(),
}))

vi.mock('../lib/brain', () => ({
  getBrainEngine: mockGetBrainEngine,
}))

import { brainRouter } from './brain'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = { uid: 'uid1', cookie: {} }
    next()
  })
  app.use('/api/brain', brainRouter)
  return app
}

function makeMockEngine(overrides: Partial<{
  isReady: () => boolean
  getStats: () => object
  search: (q: string, limit: number) => object[]
  getRecent: (limit: number) => object[]
  getRelevantChunks: (q: string, max: number) => object[]
  getFolderTree: () => object[]
  listFolder: (f: string) => object[]
  getDoc: (p: string) => object | undefined
}> = {}) {
  return {
    isReady: vi.fn().mockReturnValue(true),
    getStats: vi.fn().mockReturnValue({ docCount: 42, chunkCount: 100, totalBytes: 5000 }),
    search: vi.fn().mockReturnValue([{ path: 'notes/a.md', title: 'Alpha', snippet: '…', score: 0.9 }]),
    getRecent: vi.fn().mockReturnValue([{ path: 'notes/b.md', title: 'Beta', snippet: '…', score: 1 }]),
    getRelevantChunks: vi.fn().mockReturnValue([{ text: 'chunk text', path: 'notes/a.md' }]),
    getFolderTree: vi.fn().mockReturnValue([{ name: 'notes', path: 'notes', isDir: true, fileCount: 3, children: [] }]),
    listFolder: vi.fn().mockReturnValue([{ path: 'notes/a.md', title: 'Alpha', snippet: '…', score: 1 }]),
    getDoc: vi.fn().mockReturnValue({
      path: 'notes/a.md',
      title: 'Alpha',
      folder: 'notes',
      content: '# Alpha\nHello',
      frontmatter: {},
      modifiedAt: new Date().toISOString(),
      links: [],
      sizeBytes: 200,
    }),
    ...overrides,
  }
}

beforeEach(() => {
  mockGetBrainEngine.mockReset()
})

// ── /status ────────────────────────────────────────────────────────────────

describe('GET /api/brain/status', () => {
  test('returns ready:false when engine is null', async () => {
    mockGetBrainEngine.mockReturnValue(null)
    const res = await request(makeApp()).get('/api/brain/status')
    expect(res.status).toBe(200)
    expect(res.body.data.ready).toBe(false)
    expect(res.body.data.docCount).toBe(0)
  })

  test('returns ready:false when engine not yet initialized', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine({ isReady: vi.fn().mockReturnValue(false) }))
    const res = await request(makeApp()).get('/api/brain/status')
    expect(res.status).toBe(200)
    expect(res.body.data.ready).toBe(false)
  })

  test('returns stats when engine is ready', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine())
    const res = await request(makeApp()).get('/api/brain/status')
    expect(res.status).toBe(200)
    expect(res.body.data.ready).toBe(true)
    expect(res.body.data.docCount).toBe(42)
    expect(res.body.data.chunkCount).toBe(100)
  })
})

// ── /search ────────────────────────────────────────────────────────────────

describe('GET /api/brain/search', () => {
  test('returns 503 when engine not ready', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine({ isReady: vi.fn().mockReturnValue(false) }))
    const res = await request(makeApp()).get('/api/brain/search?q=test')
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('NOT_READY')
    expect(res.body.error.retryable).toBe(true)
  })

  test('returns empty results for blank query', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine())
    const res = await request(makeApp()).get('/api/brain/search?q=')
    expect(res.status).toBe(200)
    expect(res.body.data.results).toEqual([])
    expect(res.body.data.query).toBe('')
  })

  test('returns search results for valid query', async () => {
    const engine = makeMockEngine()
    mockGetBrainEngine.mockReturnValue(engine)
    const res = await request(makeApp()).get('/api/brain/search?q=alpha&limit=5')
    expect(res.status).toBe(200)
    expect(res.body.data.results).toHaveLength(1)
    expect(res.body.data.query).toBe('alpha')
    expect(engine.search).toHaveBeenCalledWith('alpha', 5)
  })

  test('caps limit at 50', async () => {
    const engine = makeMockEngine()
    mockGetBrainEngine.mockReturnValue(engine)
    await request(makeApp()).get('/api/brain/search?q=test&limit=999')
    expect(engine.search).toHaveBeenCalledWith('test', 50)
  })
})

// ── /recent ────────────────────────────────────────────────────────────────

describe('GET /api/brain/recent', () => {
  test('returns 503 when engine not ready', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine({ isReady: vi.fn().mockReturnValue(false) }))
    const res = await request(makeApp()).get('/api/brain/recent')
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('NOT_READY')
  })

  test('returns recent docs', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine())
    const res = await request(makeApp()).get('/api/brain/recent?limit=3')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.results)).toBe(true)
    expect(res.body.data.results[0].title).toBe('Beta')
  })
})

// ── /context ───────────────────────────────────────────────────────────────

describe('GET /api/brain/context', () => {
  test('returns empty chunks when engine null', async () => {
    mockGetBrainEngine.mockReturnValue(null)
    const res = await request(makeApp()).get('/api/brain/context?q=quarterly')
    expect(res.status).toBe(200)
    expect(res.body.data.chunks).toEqual([])
  })

  test('returns empty chunks for blank query', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine())
    const res = await request(makeApp()).get('/api/brain/context?q=')
    expect(res.status).toBe(200)
    expect(res.body.data.chunks).toEqual([])
  })

  test('returns chunks for valid query', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine())
    const res = await request(makeApp()).get('/api/brain/context?q=quarterly&maxChunks=5')
    expect(res.status).toBe(200)
    expect(res.body.data.chunks).toHaveLength(1)
  })
})

// ── /folder ────────────────────────────────────────────────────────────────

describe('GET /api/brain/folder', () => {
  test('returns 503 when engine not ready', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine({ isReady: vi.fn().mockReturnValue(false) }))
    const res = await request(makeApp()).get('/api/brain/folder')
    expect(res.status).toBe(503)
  })

  test('returns folder tree when no path provided', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine())
    const res = await request(makeApp()).get('/api/brain/folder')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.tree)).toBe(true)
    expect(res.body.data.tree[0].name).toBe('notes')
  })

  test('returns folder contents when path provided', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine())
    const res = await request(makeApp()).get('/api/brain/folder?path=notes')
    expect(res.status).toBe(200)
    expect(res.body.data.folder).toBe('notes')
    expect(Array.isArray(res.body.data.results)).toBe(true)
  })
})

// ── /note/:path ────────────────────────────────────────────────────────────

describe('GET /api/brain/note/:path', () => {
  test('returns 503 when engine not ready', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine({ isReady: vi.fn().mockReturnValue(false) }))
    const res = await request(makeApp()).get('/api/brain/note/notes/a.md')
    expect(res.status).toBe(503)
  })

  test('returns 404 when note not found', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine({ getDoc: vi.fn().mockReturnValue(undefined) }))
    const res = await request(makeApp()).get('/api/brain/note/notes/missing.md')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  test('returns note data when found', async () => {
    mockGetBrainEngine.mockReturnValue(makeMockEngine())
    const res = await request(makeApp()).get('/api/brain/note/notes/a.md')
    expect(res.status).toBe(200)
    expect(res.body.data.title).toBe('Alpha')
    expect(res.body.data.path).toBe('notes/a.md')
    expect(res.body.data.content).toContain('Hello')
  })
})
