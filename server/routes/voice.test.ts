import { describe, expect, test, vi, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const {
  mockFirestoreGet,
  mockFirestoreSet,
  mockGmailMessagesList,
  mockGmailMessagesGet,
  mockAnthropicCreate,
} = vi.hoisted(() => ({
  mockFirestoreGet: vi.fn(),
  mockFirestoreSet: vi.fn().mockResolvedValue(undefined),
  mockGmailMessagesList: vi.fn(),
  mockGmailMessagesGet: vi.fn(),
  mockAnthropicCreate: vi.fn(),
}))

vi.mock('../lib/firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({
            get: mockFirestoreGet,
            set: mockFirestoreSet,
          })),
        })),
      })),
    })),
  },
}))

vi.mock('../lib/googleAuth', () => ({
  getGmailClient: vi.fn().mockResolvedValue({
    users: {
      messages: {
        list: mockGmailMessagesList,
        get: mockGmailMessagesGet,
      },
    },
  }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}))

beforeAll(() => {
  process.env.ALLOWED_ORIGIN = 'https://app.example.com'
})

import { voiceRouter } from './voice'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = { uid: 'uid1', email: 'billy@lemon.com', cookie: {} }
    next()
  })
  app.use('/api/voice-profile', voiceRouter)
  return app
}

// ── GET /api/voice-profile ────────────────────────────────────────────────

describe('GET /api/voice-profile', () => {
  test('returns saved profile when Firestore doc exists', async () => {
    mockFirestoreGet.mockResolvedValue({
      exists: true,
      data: () => ({
        trained: true,
        emailsAnalyzed: 30,
        summary: 'Direct and concise',
        patterns: { openings: ['Quick one:'], closings: ['Billy'], avoid: [], signature: 'Billy' },
        tones: { inner: 'casual', peer: 'warm', exec: 'crisp', legal: 'precise', talent: 'generous' },
      }),
    })
    const res = await request(makeApp()).get('/api/voice-profile')
    expect(res.status).toBe(200)
    expect(res.body.data.trained).toBe(true)
    expect(res.body.data.emailsAnalyzed).toBe(30)
  })

  test('returns default profile when no Firestore doc exists', async () => {
    mockFirestoreGet.mockResolvedValue({ exists: false })
    const res = await request(makeApp()).get('/api/voice-profile')
    expect(res.status).toBe(200)
    expect(res.body.data.trained).toBe(false)
    expect(res.body.data.patterns.signature).toBe('Billy')
    expect(typeof res.body.data.summary).toBe('string')
  })

  test('returns default profile when Firestore throws', async () => {
    mockFirestoreGet.mockRejectedValue(new Error('Firestore unavailable'))
    const res = await request(makeApp()).get('/api/voice-profile')
    expect(res.status).toBe(200)
    expect(res.body.data.trained).toBe(false)
  })
})

// ── PUT /api/voice-profile ────────────────────────────────────────────────

describe('PUT /api/voice-profile', () => {
  test('saves profile and returns ok', async () => {
    mockFirestoreSet.mockResolvedValue(undefined)
    const profile = {
      trained: true,
      emailsAnalyzed: 20,
      summary: 'Terse and bilingual',
      patterns: { openings: [], closings: ['B.'], avoid: ['em dashes'], signature: 'B.' },
      tones: { inner: 'casual', peer: 'warm', exec: 'crisp', legal: 'precise', talent: 'generous' },
    }
    const res = await request(makeApp())
      .put('/api/voice-profile')
      .set('Origin', 'https://app.example.com')
      .send(profile)
    expect(res.status).toBe(200)
    expect(res.body.data.ok).toBe(true)
    expect(mockFirestoreSet).toHaveBeenCalledWith(profile)
  })

  test('returns 500 when Firestore set fails', async () => {
    mockFirestoreSet.mockRejectedValue(new Error('write failed'))
    const res = await request(makeApp())
      .put('/api/voice-profile')
      .set('Origin', 'https://app.example.com')
      .send({ trained: false })
    expect(res.status).toBe(500)
    expect(res.body.error.message).toMatch(/failed/i)
  })
})

// ── POST /api/voice-profile/train ─────────────────────────────────────────

describe('POST /api/voice-profile/train', () => {
  test('returns 400 when Gmail throws (token expired)', async () => {
    const { getGmailClient } = await import('../lib/googleAuth')
    vi.mocked(getGmailClient).mockRejectedValueOnce(new Error('Token expired'))
    const res = await request(makeApp())
      .post('/api/voice-profile/train')
      .set('Origin', 'https://app.example.com')
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/re-authenticate/i)
  })

  test('returns 400 when no sent emails found', async () => {
    mockGmailMessagesList.mockResolvedValue({ data: { messages: [] } })
    const res = await request(makeApp())
      .post('/api/voice-profile/train')
      .set('Origin', 'https://app.example.com')
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/no sent emails/i)
  })

  test('returns proposed profile on successful Claude analysis', async () => {
    mockGmailMessagesList.mockResolvedValue({
      data: { messages: [{ id: 'm1' }, { id: 'm2' }] },
    })
    mockGmailMessagesGet.mockResolvedValue({
      data: {
        snippet: 'Quick update on the deal',
        payload: {
          headers: [
            { name: 'Subject', value: 'Deal update' },
            { name: 'To', value: 'mirna@creel.mx' },
          ],
        },
      },
    })
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            summary: 'Direct, bilingual, short sentences.',
            patterns: {
              openings: ['Quick one:'],
              closings: ['Billy'],
              avoid: ['em dashes'],
              signature: 'Billy',
            },
            tones: {
              inner: 'casual',
              peer: 'warm',
              exec: 'crisp',
              legal: 'precise',
              talent: 'generous',
            },
          }),
        },
      ],
    })

    const res = await request(makeApp())
      .post('/api/voice-profile/train')
      .set('Origin', 'https://app.example.com')
    expect(res.status).toBe(200)
    expect(res.body.data.proposed.trained).toBe(true)
    expect(res.body.data.proposed.summary).toBe('Direct, bilingual, short sentences.')
    expect(res.body.data.proposed.patterns.signature).toBe('Billy')
    expect(res.body.data.emailsAnalyzed).toBeGreaterThan(0)
  })

  test('returns 500 when Claude returns unparseable JSON', async () => {
    mockGmailMessagesList.mockResolvedValue({
      data: { messages: [{ id: 'm1' }] },
    })
    mockGmailMessagesGet.mockResolvedValue({
      data: {
        snippet: 'Hi',
        payload: { headers: [{ name: 'Subject', value: 'Hi' }, { name: 'To', value: 'x@x.com' }] },
      },
    })
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry I cannot help with that.' }],
    })
    const res = await request(makeApp())
      .post('/api/voice-profile/train')
      .set('Origin', 'https://app.example.com')
    expect(res.status).toBe(500)
    expect(res.body.error.message).toMatch(/parse/i)
  })
})
