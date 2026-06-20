import { describe, expect, test, vi } from 'vitest'
import request from 'supertest'
import express from 'express'

const { mockEventsList, mockEventsGet } = vi.hoisted(() => ({
  mockEventsList: vi.fn(),
  mockEventsGet: vi.fn(),
}))

vi.mock('../lib/googleAuth', () => ({
  getCalendarClient: vi.fn().mockResolvedValue({
    events: { list: mockEventsList, get: mockEventsGet },
  }),
}))

import { calendarRouter } from './calendar'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = { uid: 'uid1', cookie: {} }
    next()
  })
  app.use('/api/calendar', calendarRouter)
  return app
}

describe('GET /api/calendar/events', () => {
  test('returns events array', async () => {
    const now = new Date()
    mockEventsList.mockResolvedValue({
      data: {
        items: [{
          id: 'ev1',
          summary: 'BR Strategy Sync',
          start: { dateTime: now.toISOString() },
          end: { dateTime: new Date(now.getTime() + 3600000).toISOString() },
          attendees: [{ email: 'billy@lemonfilms.com', responseStatus: 'accepted', self: true }],
        }],
      },
    })
    const res = await request(makeApp()).get('/api/calendar/events')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data[0].id).toBe('ev1')
  })
})

describe('GET /api/calendar/events/:id', () => {
  test('returns single event', async () => {
    mockEventsGet.mockResolvedValue({ data: { id: 'ev1', summary: 'Meeting', start: {}, end: {} } })
    const res = await request(makeApp()).get('/api/calendar/events/ev1')
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe('ev1')
  })
})
