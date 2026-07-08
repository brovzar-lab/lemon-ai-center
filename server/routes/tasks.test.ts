import { describe, expect, test, vi, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const { mockGmail, mockCalendar } = vi.hoisted(() => ({
  mockGmail: vi.fn(),
  mockCalendar: vi.fn(),
}))

vi.mock('../lib/googleAuth', () => ({
  getGmailClient: mockGmail,
  getCalendarClient: mockCalendar,
}))

beforeAll(() => {
  process.env.ALLOWED_ORIGIN = 'https://app.example.com'
})

import { tasksRouter } from './tasks'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = { uid: 'uid1', email: 'test@test.com', cookie: {} }
    next()
  })
  app.use('/api/tasks', tasksRouter)
  return app
}

beforeEach(() => {
  mockGmail.mockReset()
  mockCalendar.mockReset()
})

describe('POST /api/tasks/generate — reauth', () => {
  test('a dead Google token returns 409 REAUTH_REQUIRED, not empty "no items"', async () => {
    const reauth = Object.assign(new Error('reconnect'), { code: 'REAUTH_REQUIRED' })
    mockGmail.mockRejectedValue(reauth)
    mockCalendar.mockRejectedValue(reauth)

    const res = await request(makeApp())
      .post('/api/tasks/generate')
      .set('Origin', 'https://app.example.com')
      .send({ fromDays: 14, toDays: 0 })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('REAUTH_REQUIRED')
    expect(res.body.data).toBeUndefined()
  })
})
