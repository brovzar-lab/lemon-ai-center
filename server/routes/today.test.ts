import { describe, expect, test, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('../lib/firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      get: mockGet,
      where: vi.fn(() => ({ get: mockGet })),
      doc: vi.fn(() => ({ get: mockGet, set: vi.fn().mockResolvedValue(undefined) })),
    })),
  },
}))

vi.mock('../lib/precompute', () => ({
  loadPrecomputed: vi.fn().mockResolvedValue(null),
  isPrecomputeFresh: vi.fn().mockReturnValue(true),
  runPrecompute: vi.fn().mockResolvedValue(undefined),
}))

import { todayRouter } from './today'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = { uid: 'uid1', email: 'test@test.com', cookie: {} }
    next()
  })
  app.use('/api', todayRouter)
  return app
}

const todayIso = new Date().toISOString().slice(0, 10)

beforeEach(() => {
  mockGet.mockReset()
})

describe('GET /api/today-progress', () => {
  test('counts completed-today and created-today in one pass', async () => {
    mockGet.mockResolvedValue({
      docs: [
        { data: () => ({ done: true, doneAt: `${todayIso}T09:00:00Z` }) },
        { data: () => ({ done: true, doneAt: '2020-01-01T00:00:00Z' }) }, // old, not today
        { data: () => ({ done: false, createdAt: `${todayIso}T08:00:00Z` }) },
        { data: () => ({ done: false, createdAt: '2020-01-01T00:00:00Z' }) }, // old
      ],
    })
    const res = await request(makeApp()).get('/api/today-progress')
    expect(res.status).toBe(200)
    expect(res.body.data.done).toBe(1)
    expect(res.body.data.queued).toBe(1)
  })

  test('surfaces a Firestore failure as 500 instead of fabricating zeros', async () => {
    mockGet.mockRejectedValue(new Error('Firestore unavailable'))
    const res = await request(makeApp()).get('/api/today-progress')
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('UPSTREAM_ERROR')
    expect(res.body.data).toBeUndefined()
  })
})
