import { describe, expect, test, vi, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'

const docs = [
  { id: 't1', data: () => ({ threadId: 't1', draft: 'A', generatedAt: '2026-07-08T00:00:00Z', basedOnMessageId: 'm1', tone: 'peer' }) },
  { id: 't2', data: () => ({ threadId: 't2', draft: 'B', generatedAt: '2026-07-08T00:00:00Z', basedOnMessageId: 'm2', tone: 'peer' }) },
]
vi.mock('../lib/firebase', () => ({
  db: { collection: () => ({ get: async () => ({ docs }) }) },
}))

beforeAll(() => { process.env.ALLOWED_ORIGIN = 'https://app.example.com' })

import { copilotRouter } from './copilot'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => { req.session = { uid: 'uid1' }; next() })
  app.use('/api/copilot', copilotRouter)
  return app
}

describe('GET /api/copilot/drafts', () => {
  test('returns cached drafts keyed by threadId', async () => {
    const res = await request(makeApp()).get('/api/copilot/drafts')
    expect(res.status).toBe(200)
    expect(res.body.data.t1.draft).toBe('A')
    expect(res.body.data.t2.basedOnMessageId).toBe('m2')
  })
})
