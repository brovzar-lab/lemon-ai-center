import { describe, expect, test, vi, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../lib/firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn().mockResolvedValue(undefined),
      })),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    })),
  },
}))

vi.mock('../lib/googleAuth', () => ({
  getGmailClient: vi.fn().mockResolvedValue({
    users: {
      threads: {
        list: vi.fn().mockResolvedValue({ data: { threads: [{ id: 'th1' }, { id: 'th2' }] } }),
      },
    },
  }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      // SDK 0.110 MessageStream shape: on('text') callbacks + finalMessage().
      // (The old mock faked the removed 0.27-era `textStream` property.)
      stream: vi.fn(() => {
        const stream: any = {
          on(event: string, cb: (text: string) => void) {
            if (event === 'text') cb('hello world')
            return stream
          },
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'hello world' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        }
        return stream
      }),
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'A thought-provoking question.' }],
      }),
    },
  })),
}))

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.ALLOWED_ORIGIN = 'https://app.example.com'
})

import { claudeRouter } from './claude'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = { uid: 'uid1', email: 'billy@lemonfilms.com', cookie: {} }
    req.sessionID = 'test-sid'
    next()
  })
  app.use('/api/claude', claudeRouter)
  return app
}

describe('POST /api/claude/spark', () => {
  test('returns spark text', async () => {
    const res = await request(makeApp()).post('/api/claude/spark').set('Origin', 'https://app.example.com')
    expect(res.status).toBe(200)
    expect(res.body.data.text).toBeDefined()
    expect(typeof res.body.data.text).toBe('string')
  })
})

describe('POST /api/claude/brief', () => {
  test('returns SSE stream headers when no cache', async () => {
    const res = await request(makeApp())
      .post('/api/claude/brief')
      .set('Origin', 'https://app.example.com')
      .buffer(false)
    expect(res.headers['content-type']).toContain('text/event-stream')
  })
})
