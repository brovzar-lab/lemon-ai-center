import { describe, expect, test, vi, afterEach } from 'vitest'
import { sendReply } from './sendReply'

afterEach(() => vi.restoreAllMocks())

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
  })

  test('throws the server error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ error: { message: 'Send failed' } }),
    }))
    await expect(sendReply({ threadId: 't1', to: 'a@b.com', subject: 'Re', body: 'x' }))
      .rejects.toThrow('Send failed')
  })
})
