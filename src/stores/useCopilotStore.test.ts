import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/copilot/draftClient', () => ({
  generateDraftForThread: vi.fn().mockResolvedValue('Drafted reply.'),
}))

vi.mock('@/lib/copilot/sendReply', () => ({ sendReply: vi.fn().mockResolvedValue(undefined) }))

import { generateDraftForThread } from '@/lib/copilot/draftClient'
import { sendReply } from '@/lib/copilot/sendReply'
import { useCopilotStore, UNSEND_MS } from './useCopilotStore'
import type { InboxThread } from '@shared/types'

const thread = (id: string): InboxThread => ({
  id, subject: 's', from: 'A <a@b.com>', fromDomain: 'b.com', snippet: 'x',
  unread: true, receivedAt: '2026-07-08T00:00:00Z', tag: 'DEAL', priority: 'HOT',
})

beforeEach(() => {
  useCopilotStore.setState({ isOpen: false, index: 0, drafts: {} })
  vi.clearAllMocks()
  ;(generateDraftForThread as any).mockResolvedValue('Drafted reply.')
})
afterEach(() => { vi.restoreAllMocks() })

describe('useCopilotStore navigation', () => {
  test('open resets to first card; next/prev clamp', () => {
    const s = useCopilotStore.getState()
    useCopilotStore.setState({ index: 3 })
    s.open()
    expect(useCopilotStore.getState().isOpen).toBe(true)
    expect(useCopilotStore.getState().index).toBe(0)
    s.next(2); s.next(2); s.next(2) // clamp at count-1 = 1
    expect(useCopilotStore.getState().index).toBe(1)
    s.prev(); s.prev()
    expect(useCopilotStore.getState().index).toBe(0)
  })

  test('requestDraft sets loading then ready with text', async () => {
    await useCopilotStore.getState().requestDraft(thread('t1'))
    expect(generateDraftForThread).toHaveBeenCalledOnce()
    expect(useCopilotStore.getState().drafts['t1']).toEqual({
      text: 'Drafted reply.', status: 'ready', edited: false,
    })
  })

  test('requestDraft is a no-op if a draft is already ready', async () => {
    useCopilotStore.setState({ drafts: { t1: { text: 'x', status: 'ready', edited: false } } })
    await useCopilotStore.getState().requestDraft(thread('t1'))
    expect(generateDraftForThread).not.toHaveBeenCalled()
    expect(useCopilotStore.getState().drafts['t1']).toEqual({ text: 'x', status: 'ready', edited: false })
  })

  test('requestDraft sets error status when drafting throws', async () => {
    ;(generateDraftForThread as any).mockRejectedValueOnce(new Error('boom'))
    await useCopilotStore.getState().requestDraft(thread('t2'))
    expect(useCopilotStore.getState().drafts['t2'].status).toBe('error')
  })

  test('setDraftText marks the draft edited', () => {
    useCopilotStore.getState().setDraftText('t1', 'my words')
    expect(useCopilotStore.getState().drafts['t1']).toEqual({
      text: 'my words', status: 'ready', edited: true,
    })
  })

  test('a mid-flight edit survives a subsequent draft error', async () => {
    let rejectFn: (e: Error) => void = () => {}
    ;(generateDraftForThread as any).mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectFn = reject }),
    )
    const p = useCopilotStore.getState().requestDraft(thread('t1'))
    useCopilotStore.getState().setDraftText('t1', 'my words') // user edits while loading
    rejectFn(new Error('boom'))
    await p
    const d = useCopilotStore.getState().drafts['t1']
    expect(d.text).toBe('my words')
    expect(d.edited).toBe(true)
  })
})

describe('useCopilotStore unsend queue', () => {
  beforeEach(() => {
    useCopilotStore.setState({ pending: [] })
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => { vi.useRealTimers() })

  const args = { threadId: 't1', to: 'a@b.com', subject: 'Re: s', body: 'Hello' }

  test('queueSend holds for 5s then sends', async () => {
    const id = useCopilotStore.getState().queueSend(args)
    expect(useCopilotStore.getState().pending).toHaveLength(1)
    expect(sendReply).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(UNSEND_MS)
    expect(sendReply).toHaveBeenCalledWith(args)
    expect(useCopilotStore.getState().pending.find((p) => p.id === id)).toBeUndefined()
  })

  test('undoSend within the window cancels the send', async () => {
    const id = useCopilotStore.getState().queueSend(args)
    useCopilotStore.getState().undoSend(id)
    await vi.advanceTimersByTimeAsync(UNSEND_MS)
    expect(sendReply).not.toHaveBeenCalled()
    expect(useCopilotStore.getState().pending).toHaveLength(0)
  })

  test('a failed send is marked error and kept for retry', async () => {
    ;(sendReply as any).mockRejectedValueOnce(new Error('nope'))
    const id = useCopilotStore.getState().queueSend(args)
    await vi.advanceTimersByTimeAsync(UNSEND_MS)
    expect(useCopilotStore.getState().pending.find((p) => p.id === id)?.status).toBe('error')
  })

  test('undoSend after the timer fires is a no-op — the send is already committed', async () => {
    let resolveSend: () => void = () => {}
    ;(sendReply as any).mockImplementationOnce(() => new Promise<void>((res) => { resolveSend = res }))
    const id = useCopilotStore.getState().queueSend(args)
    await vi.advanceTimersByTimeAsync(UNSEND_MS) // fire() runs: status -> 'sending', awaiting sendReply
    expect(useCopilotStore.getState().pending.find((p) => p.id === id)?.status).toBe('sending')
    useCopilotStore.getState().undoSend(id) // too late to undo
    expect(useCopilotStore.getState().pending.find((p) => p.id === id)?.status).toBe('sending')
    expect(sendReply).toHaveBeenCalledTimes(1)
    resolveSend()
  })

  test('retrySend re-queues a failed send', async () => {
    ;(sendReply as any).mockRejectedValueOnce(new Error('nope'))
    const id = useCopilotStore.getState().queueSend(args)
    await vi.advanceTimersByTimeAsync(UNSEND_MS)
    expect(useCopilotStore.getState().pending.find((p) => p.id === id)?.status).toBe('error')
    ;(sendReply as any).mockResolvedValueOnce(undefined)
    useCopilotStore.getState().retrySend(id)
    expect(useCopilotStore.getState().pending.find((p) => p.id === id)).toBeUndefined()
    expect(useCopilotStore.getState().pending.some((p) => p.status === 'counting')).toBe(true)
    await vi.advanceTimersByTimeAsync(UNSEND_MS)
    expect(sendReply).toHaveBeenCalledTimes(2)
  })
})
