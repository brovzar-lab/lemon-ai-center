import { describe, expect, test, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// ── Mock the slate lib ──────────────────────────────────────────────────
const { mockListSlateProjects } = vi.hoisted(() => ({
  mockListSlateProjects: vi.fn(),
}))

vi.mock('../lib/slate', () => ({
  listSlateProjects: mockListSlateProjects,
}))

import { slateRouter } from './slate'

function makeApp({ authenticated = true } = {}) {
  const app = express()
  app.use(express.json())
  if (authenticated) {
    app.use((req: any, _res, next) => {
      req.session = { uid: 'uid1', cookie: {} }
      next()
    })
  } else {
    app.use((req: any, _res, next) => {
      req.session = { cookie: {} }
      next()
    })
  }
  app.use('/api/slate', slateRouter)
  return app
}

beforeEach(() => {
  mockListSlateProjects.mockReset()
})

describe('GET /api/slate/projects', () => {
  test('requires auth', async () => {
    const res = await request(makeApp({ authenticated: false })).get('/api/slate/projects')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  test('returns an empty slate', async () => {
    mockListSlateProjects.mockResolvedValue([])
    const res = await request(makeApp()).get('/api/slate/projects')
    expect(res.status).toBe(200)
    expect(res.body.data.projects).toEqual([])
  })

  test('returns projects', async () => {
    mockListSlateProjects.mockResolvedValue([
      {
        slug: 'LA-CASA-DEL-FUEGO',
        title: 'La Casa del Fuego',
        format: 'film',
        stage: 'rewrites',
        origin: 'internal',
        status: 'active',
      },
    ])
    const res = await request(makeApp()).get('/api/slate/projects')
    expect(res.status).toBe(200)
    expect(res.body.data.projects).toHaveLength(1)
    expect(res.body.data.projects[0].slug).toBe('LA-CASA-DEL-FUEGO')
  })

  test('wraps Firestore failures in the error envelope', async () => {
    mockListSlateProjects.mockRejectedValue(new Error('firestore down'))
    const res = await request(makeApp()).get('/api/slate/projects')
    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('SLATE_LIST_FAILED')
    expect(res.body.error.retryable).toBe(true)
  })
})
