import { describe, expect, test, vi, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?state=TEST_STATE'),
        getToken: vi.fn().mockResolvedValue({
          tokens: {
            access_token: 'at123',
            refresh_token: 'rt123',
            expiry_date: Date.now() + 3_600_000,
            scope: 'email profile',
          },
        }),
        setCredentials: vi.fn(),
      })),
    },
    oauth2: vi.fn(() => ({
      userinfo: {
        get: vi.fn().mockResolvedValue({
          data: { id: 'uid123', email: 'billy@lemonfilms.com', name: 'Billy', picture: '' },
        }),
      },
    })),
  },
}))

vi.mock('../lib/firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: vi.fn(() => new Date()) },
}))

vi.mock('../lib/encryption', () => ({
  encrypt: vi.fn().mockReturnValue({ ciphertext: 'c', iv: 'i', tag: 't' }),
}))

vi.mock('../lib/tokenCache', () => ({
  setAccessToken: vi.fn(),
}))

vi.mock('../lib/auditLog', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = 'client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/auth/google/callback'
  process.env.ALLOWED_EMAILS = 'billy@lemonfilms.com'
})

import { authRouter } from './auth'

// Captures the session object handed to the most recent request, so tests can
// assert on server-side session state (e.g. the OAuth state token).
let lastSession: any
function makeApp() {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.session = lastSession = { uid: undefined, email: undefined, cookie: {}, save: (cb: any) => cb?.(), destroy: (cb: any) => cb?.() }
    req.sessionID = 'test-sid'
    req.cookies = {}
    next()
  })
  app.use('/auth', authRouter)
  return app
}

describe('GET /auth/google/start', () => {
  test('redirects to Google consent URL', async () => {
    const res = await request(makeApp()).get('/auth/google/start')
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('accounts.google.com')
  })

  test('stores oauth state server-side in the session', async () => {
    // State is persisted in the Firestore-backed session (not a client cookie),
    // then validated against the callback's state param to prevent CSRF.
    await request(makeApp()).get('/auth/google/start')
    expect(typeof lastSession.oauthState).toBe('string')
    expect(lastSession.oauthState.length).toBeGreaterThan(0)
  })
})

describe('GET /auth/google/callback', () => {
  test('rejects when state does not match cookie', async () => {
    const res = await request(makeApp())
      .get('/auth/google/callback?code=abc&state=WRONG_STATE')
    expect(res.status).toBe(403)
  })
})

describe('GET /auth/google/logout', () => {
  test('redirects to / after logout', async () => {
    const res = await request(makeApp()).get('/auth/google/logout')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('/')
  })
})
