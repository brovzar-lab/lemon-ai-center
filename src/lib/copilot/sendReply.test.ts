import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { sendReply } from './sendReply'
import { useConnectionStore } from '@/stores/useConnectionStore'

beforeEach(() => {
  useConnectionStore.getState().setReauthRequired(false)
})

afterEach(() => {
  vi.restoreAllMocks()
  useConnectionStore.getState().setReauthRequired(false)
})

describe('sendReply', () => {
  test('POSTs the reply and resolves on ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ data: { sent: true } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(sendReply({ threadId: 't1', to: 'a@b.com', subject: 'Re: Hi', body: 'Hello' }))
      .resolves.toBeUndefined()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/gmail/send')
    expect(JSON.parse(opts.body)).toEqual({ threadId: 't1', to: 'a@b.com', subject: 'Re: Hi', body: 'Hello' })
    expect(opts.credentials).toBe('include')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
  })

  test('throws the server error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ error: { message: 'Gmail quota exceeded' } }),
    }))
    await expect(sendReply({ threadId: 't1', to: 'a@b.com', subject: 'Re', body: 'x' }))
      .rejects.toThrow('Gmail quota exceeded')
  })

  test('a REAUTH_REQUIRED failure raises the reconnect flag AND still throws the message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'REAUTH_REQUIRED', message: 'Google connection expired' } }),
    }))
    await expect(sendReply({ threadId: 't1', to: 'a@b.com', subject: 'Re', body: 'x' }))
      .rejects.toThrow('Google connection expired')
    expect(useConnectionStore.getState().reauthRequired).toBe(true)
  })
})
