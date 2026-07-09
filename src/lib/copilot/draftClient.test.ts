import { describe, expect, test, vi, afterEach } from 'vitest'
import { generateDraftForThread } from './draftClient'
import type { InboxThread } from '@shared/types'

const thread: InboxThread = {
  id: 't1', subject: 'Cap table', from: 'Ana <ana@gbm.com>', fromDomain: 'gbm.com',
  snippet: 'Can you send it?', unread: true, receivedAt: '2026-07-08T00:00:00Z',
  tag: 'DEAL', priority: 'HOT',
}

function sseBodyFromChunks(chunks: string[]) {
  const encoded = chunks.map((c) => new TextEncoder().encode(c))
  return { getReader: () => { let i = 0; return { read: async () =>
    i < encoded.length ? { done: false, value: encoded[i++] } : { done: true, value: undefined } } } }
}

function sseBody(events: object[]) {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
  return sseBodyFromChunks([text])
}

afterEach(() => vi.restoreAllMocks())

describe('generateDraftForThread', () => {
  test('accumulates tokens and resolves the full draft', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, body: sseBody([
        { type: 'token', text: 'Adjunto ' }, { type: 'token', text: 'la tabla.' },
        { type: 'done', draft: 'Adjunto la tabla.' },
      ]),
    })
    vi.stubGlobal('fetch', fetchMock)
    const tokens: string[] = []
    const draft = await generateDraftForThread(thread, 'peer', (t) => tokens.push(t))
    expect(draft).toBe('Adjunto la tabla.')
    expect(tokens).toEqual(['Adjunto ', 'la tabla.'])

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/claude/draft-reply')
    expect(opts.method).toBe('POST')
    expect(opts.credentials).toBe('include')
    const body = JSON.parse(opts.body)
    expect(body.email.fromEmail).toBe('ana@gbm.com')
    expect(body.toneTier).toBe('peer')
  })

  test('throws when the stream emits an error event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, body: sseBody([{ type: 'error', message: 'Model overloaded' }]),
    }))
    await expect(generateDraftForThread(thread)).rejects.toThrow('Model overloaded')
  })

  test('accumulates across a data line split over two chunks', async () => {
    const doneEvent = `data: ${JSON.stringify({ type: 'done', draft: 'Adjunto la tabla.' })}\n\n`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, body: sseBodyFromChunks([
        'data: {"type":"to',
        `ken","text":"la tabla."}\n\n${doneEvent}`,
      ]),
    }))
    const draft = await generateDraftForThread(thread)
    expect(draft).toBe('Adjunto la tabla.')
  })

  test('throws when the stream ends without a terminal event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, body: sseBody([{ type: 'token', text: 'Adjunto ' }]),
    }))
    await expect(generateDraftForThread(thread)).rejects.toThrow('Draft stream ended before completion')
  })
})
