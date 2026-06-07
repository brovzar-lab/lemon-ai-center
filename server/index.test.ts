import { describe, expect, test, vi } from 'vitest'
import request from 'supertest'
import { EventEmitter } from 'events'

vi.mock('./lib/firebase', () => ({
  db: { collection: vi.fn() },
}))

vi.mock('./lib/session', () => ({
  FirestoreSessionStore: class extends EventEmitter {
    get = vi.fn((_sid: string, cb: any) => cb(null, null))
    set = vi.fn((_sid: string, _session: any, cb?: any) => cb?.())
    destroy = vi.fn((_sid: string, cb?: any) => cb?.())
    touch = vi.fn((_sid: string, _session: any, cb?: any) => cb?.())
  },
}))

import { app } from './index'

describe('Express server', () => {
  test('GET /health returns 200 with ok:true', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true })
  })

  test('GET /api/ready returns 200 with config flags and brain block', async () => {
    const res = await request(app).get('/api/ready')
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      googleOAuthConfigured: expect.any(Boolean),
      allowedOriginConfigured: expect.any(Boolean),
      allowedEmailsConfigured: expect.any(Boolean),
      anthropicConfigured: expect.any(Boolean),
      geminiConfigured: expect.any(Boolean),
      vaultConfigured: expect.any(Boolean),
      brain: {
        ready: expect.any(Boolean),
        docCount: expect.any(Number),
        chunkCount: expect.any(Number),
        totalBytes: expect.any(Number),
      },
    })
  })

  test('GET /unknown returns 404', async () => {
    const res = await request(app).get('/unknown-route-xyz')
    expect(res.status).toBe(404)
  })
})
