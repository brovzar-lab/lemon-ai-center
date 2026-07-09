import { describe, expect, test, vi, afterEach } from 'vitest'
import { generateDraftForThread } from './draftClient'
import type { InboxThread } from '@shared/types'

const thread: InboxThread = {
  id: 't1', subject: 'Cap table', from: 'Ana <ana@gbm.com>', fromDomain: 'gbm.com',
  snippet: 'Can you send it?', unread: true, receivedAt: '2026-07-08T00:00:00Z',
  tag: 'DEAL', priority: 'HOT',
}

function sseBody(events: object[]) {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
  const chunks = [new TextEncoder().encode(text)]
  return { getReader: () => { let i = 0; return { read: async () =>
    i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined } } } }
}

afterEach(() => vi.restoreAllMocks())

describe('generateDraftForThread', () => {
  test('accumulates tokens and resolves the full draft', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, body: sseBody([
        { type: 'token', text: 'Adjunto ' }, { type: 'token', text: 'la tabla.' },
        { type: 'done', draft: 'Adjunto la tabla.' },
      ]),
    }))
    const tokens: string[] = []
    const draft = await generateDraftForThread(thread, 'peer', (t) => tokens.push(t))
    expect(draft).toBe('Adjunto la tabla.')
    expect(tokens).toEqual(['Adjunto ', 'la tabla.'])
  })

  test('throws when the stream emits an error event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, body: sseBody([{ type: 'error', message: 'Draft generation failed' }]),
    }))
    await expect(generateDraftForThread(thread)).rejects.toThrow('Draft generation failed')
  })
})
