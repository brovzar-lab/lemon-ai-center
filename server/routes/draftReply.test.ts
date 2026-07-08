import { describe, expect, test, vi, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../lib/firebase', () => {
  const docRef: any = {
    get: vi.fn().mockResolvedValue({ exists: false }),
    set: vi.fn().mockResolvedValue(undefined),
  }
  docRef.collection = vi.fn(() => ({ doc: vi.fn(() => docRef) }))
  return {
    db: { collection: vi.fn(() => ({ doc: vi.fn(() => docRef) })) },
  }
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      // SDK 0.110 MessageStream shape: on('text') callbacks + finalMessage().
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
    },
  })),
}))

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.ALLOWED_ORIGIN = 'https://app.example.com'
})

import { draftReplyRouter } from './draftReply'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = { uid: 'uid1', email: 'billy@lemonfilms.com', cookie: {} }
    req.sessionID = 'test-sid'
    next()
  })
  app.use('/api/claude/draft-reply', draftReplyRouter)
  return app
}

describe('POST /api/claude/draft-reply', () => {
  test('streams token events and a done event with the full draft', async () => {
    const res = await request(makeApp())
      .post('/api/claude/draft-reply')
      .set('Origin', 'https://app.example.com')
      .send({
        email: {
          from: 'Ana',
          fromEmail: 'ana@example.com',
          subject: 'Llamada',
          snippet: 'Podemos hablar manana?',
        },
        toneTier: 'peer',
      })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.text).toContain('"type":"token"')
    expect(res.text).toContain('hello world')
    expect(res.text).toContain('"type":"done"')
    expect(res.text).not.toContain('"type":"error"')
  })

  test('returns 400 when email context is missing', async () => {
    const res = await request(makeApp())
      .post('/api/claude/draft-reply')
      .set('Origin', 'https://app.example.com')
      .send({ toneTier: 'peer' })
    expect(res.status).toBe(400)
  })
})
