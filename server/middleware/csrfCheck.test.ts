import { describe, expect, test, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { csrfCheck } from './csrfCheck'

beforeAll(() => {
  process.env.ALLOWED_ORIGIN = 'https://myapp.railway.app'
})

function makeApp() {
  const app = express()
  app.use(csrfCheck)
  app.get('/resource', (_req, res) => res.json({ ok: true }))
  app.post('/resource', (_req, res) => res.json({ ok: true }))
  app.put('/resource', (_req, res) => res.json({ ok: true }))
  app.delete('/resource', (_req, res) => res.json({ ok: true }))
  return app
}

describe('csrfCheck', () => {
  test('allows GET without origin check', async () => {
    const res = await request(makeApp()).get('/resource')
    expect(res.status).toBe(200)
  })

  test('allows POST from correct origin', async () => {
    const res = await request(makeApp()).post('/resource').set('Origin', 'https://myapp.railway.app')
    expect(res.status).toBe(200)
  })

  test('rejects POST from wrong origin with 403 FORBIDDEN', async () => {
    const res = await request(makeApp()).post('/resource').set('Origin', 'https://evil.com')
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  test('rejects DELETE from wrong origin', async () => {
    const res = await request(makeApp()).delete('/resource').set('Origin', 'https://evil.com')
    expect(res.status).toBe(403)
  })

  test('rejects POST with no origin header', async () => {
    const res = await request(makeApp()).post('/resource')
    expect(res.status).toBe(403)
  })

  test('rejects PUT from wrong origin (PUT is a write method)', async () => {
    const res = await request(makeApp()).put('/resource').set('Origin', 'https://evil.com')
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  test('allows PUT from correct origin', async () => {
    const res = await request(makeApp()).put('/resource').set('Origin', 'https://myapp.railway.app')
    expect(res.status).toBe(200)
  })

  test('trusts a trycloudflare quick tunnel outside production', async () => {
    const res = await request(makeApp()).post('/resource').set('Origin', 'https://abc-def.trycloudflare.com')
    expect(res.status).toBe(200)
  })

  test('rejects a trycloudflare origin in production', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const res = await request(makeApp()).post('/resource').set('Origin', 'https://abc-def.trycloudflare.com')
      expect(res.status).toBe(403)
    } finally {
      process.env.NODE_ENV = prev
    }
  })
})
