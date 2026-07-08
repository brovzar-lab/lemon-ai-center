import { describe, expect, test, vi, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'

const { mockThreadsList, mockThreadsGet, mockMessagesSend, mockLabelsModify } = vi.hoisted(() => ({
  mockThreadsList: vi.fn(),
  mockThreadsGet: vi.fn(),
  mockMessagesSend: vi.fn(),
  mockLabelsModify: vi.fn(),
}))

vi.mock('../lib/googleAuth', () => ({
  getGmailClient: vi.fn().mockResolvedValue({
    users: {
      threads: { list: mockThreadsList, get: mockThreadsGet },
      messages: { send: mockMessagesSend, modify: mockLabelsModify },
    },
  }),
}))

vi.mock('../lib/firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ patterns: {} }) }),
      })),
    })),
  },
}))

vi.mock('../lib/auditLog', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

beforeAll(() => {
  process.env.ALLOWED_ORIGIN = 'https://app.example.com'
})

import { gmailRouter } from './gmail'
import { getGmailClient } from '../lib/googleAuth'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = { uid: 'uid1', email: 'test@test.com', cookie: {} }
    next()
  })
  app.use('/api/gmail', gmailRouter)
  return app
}

describe('GET /api/gmail/threads', () => {
  test('returns threads array', async () => {
    mockThreadsList.mockResolvedValue({ data: { threads: [{ id: 'th1', snippet: 'snippet 1' }] } })
    mockThreadsGet.mockResolvedValue({
      data: {
        id: 'th1',
        messages: [{
          id: 'msg1',
          labelIds: ['INBOX', 'UNREAD'],
          payload: {
            headers: [
              { name: 'From', value: 'Mirna Alvarado <mirna@creel.mx>' },
              { name: 'Subject', value: 'Deal update' },
              { name: 'Date', value: new Date().toUTCString() },
            ],
          },
          snippet: 'snippet 1',
        }],
      },
    })
    const res = await request(makeApp()).get('/api/gmail/threads')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

describe('GET /api/gmail/threads/:id', () => {
  test('returns full thread', async () => {
    mockThreadsGet.mockResolvedValue({ data: { id: 'th1', messages: [{ id: 'msg1', payload: { headers: [], parts: [] }, snippet: 'body' }] } })
    const res = await request(makeApp()).get('/api/gmail/threads/th1')
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe('th1')
  })
})

describe('reauth surfacing', () => {
  test('a dead Google token returns 409 REAUTH_REQUIRED, not a retryable 500', async () => {
    vi.mocked(getGmailClient).mockRejectedValueOnce(
      Object.assign(new Error('reconnect'), { code: 'REAUTH_REQUIRED' }),
    )
    const res = await request(makeApp()).get('/api/gmail/threads')
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('REAUTH_REQUIRED')
    expect(res.body.error.retryable).toBe(false)
  })
})
