import { describe, expect, test, vi, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const { mockMessagesSend } = vi.hoisted(() => ({
  mockMessagesSend: vi.fn(),
}))

vi.mock('../lib/googleAuth', () => ({
  getGmailClient: vi.fn().mockResolvedValue({
    users: { messages: { send: mockMessagesSend } },
  }),
}))

vi.mock('../lib/firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn((id?: string) => ({
        id: id ?? 'del1',
        set: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}))

beforeAll(() => {
  process.env.ALLOWED_ORIGIN = 'https://app.example.com'
})

import { delegationsRouter } from './delegations'

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = { uid: 'uid1', email: 'test@test.com', cookie: {} }
    next()
  })
  app.use('/api/delegations', delegationsRouter)
  return app
}

/** Decode the base64url MIME `raw` handed to Gmail and return the header block. */
function sentHeaderBlock(): string {
  const raw = mockMessagesSend.mock.calls[0][0].requestBody.raw as string
  const decoded = Buffer.from(raw, 'base64url').toString('utf8')
  return decoded.split('\r\n\r\n')[0]
}

/** The individual header lines Gmail would parse. Injection = an extra line. */
function sentHeaderLines(): string[] {
  return sentHeaderBlock().split('\r\n')
}

beforeEach(() => {
  mockMessagesSend.mockReset()
  mockMessagesSend.mockResolvedValue({ data: { id: 'gmsg1' } })
})

describe('POST /api/delegations — header injection', () => {
  const origin = 'https://app.example.com'

  test('a CRLF payload in toName cannot inject a Bcc header', async () => {
    const res = await request(makeApp())
      .post('/api/delegations')
      .set('Origin', origin)
      .send({
        to: 'lead@lemonfilms.com',
        toName: 'Evil\r\nBcc: attacker@evil.com',
        taskTitle: 'Send the festival packet',
        context: 'Please handle this.',
      })

    expect(res.status).toBe(200)
    // The payload becomes inert text on the To line; no new header line appears.
    const lines = sentHeaderLines()
    expect(lines.filter((l) => /^(bcc|cc):/i.test(l))).toHaveLength(0)
    expect(lines.filter((l) => /^to:/i.test(l))).toHaveLength(1)
    expect(lines.filter((l) => /^subject:/i.test(l))).toHaveLength(1)
  })

  test('a CRLF payload in taskTitle cannot inject a header via the Subject', async () => {
    const res = await request(makeApp())
      .post('/api/delegations')
      .set('Origin', origin)
      .send({
        to: 'lead@lemonfilms.com',
        toName: 'Lead',
        taskTitle: 'Budget\r\nBcc: attacker@evil.com',
        context: 'Please handle this.',
      })

    expect(res.status).toBe(200)
    const lines = sentHeaderLines()
    expect(lines.filter((l) => /^(bcc|cc):/i.test(l))).toHaveLength(0)
    expect(lines.filter((l) => /^subject:/i.test(l))).toHaveLength(1)
  })

  test('rejects a malformed recipient address with 400', async () => {
    const res = await request(makeApp())
      .post('/api/delegations')
      .set('Origin', origin)
      .send({
        to: 'not-an-email',
        toName: 'Lead',
        taskTitle: 'Send the packet',
        context: 'Please handle this.',
      })

    expect(res.status).toBe(400)
    expect(mockMessagesSend).not.toHaveBeenCalled()
  })

  test('sends a well-formed delegation for valid input', async () => {
    const res = await request(makeApp())
      .post('/api/delegations')
      .set('Origin', origin)
      .send({
        to: 'lead@lemonfilms.com',
        toName: 'Lead',
        taskTitle: 'Send the festival packet',
        context: 'Please handle this by end of week.',
        deadline: '2026-07-15',
      })

    expect(res.status).toBe(200)
    expect(res.body.data.gmailMessageId).toBe('gmsg1')
    const headers = sentHeaderBlock()
    expect(headers).toContain('To: Lead <lead@lemonfilms.com>')
    expect(headers).toContain('Action needed: Send the festival packet')
  })
})
