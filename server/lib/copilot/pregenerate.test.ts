import { describe, expect, test, vi, beforeEach } from 'vitest'

const setMock = vi.fn()
const getMock = vi.fn(async () => ({ exists: false }))
vi.mock('../firebase', () => ({
  db: { collection: () => ({ doc: () => ({ get: getMock, set: setMock }) }) },
}))
vi.mock('./generateDraft', () => ({ generateDraft: vi.fn().mockResolvedValue('Cached draft.') }))
import { generateDraft } from './generateDraft'
import { pregenerateCopilotDrafts, type DraftCandidate } from './pregenerate'

const cand = (id: string, priority: 'HOT' | 'MED' | 'LOW', latestFrom: string): DraftCandidate => ({
  threadId: id, from: latestFrom, fromEmail: 'a@b.com', subject: 's', snippet: 'x',
  latestMessageId: `m_${id}`, priority, latestFrom,
})

beforeEach(() => { setMock.mockClear(); getMock.mockClear(); vi.clearAllMocks() })

describe('pregenerateCopilotDrafts', () => {
  test('drafts only HOT + reply-owed, writes cache, returns count', async () => {
    const n = await pregenerateCopilotDrafts('uid1', 'billy@lemonfilms.com', [
      cand('1', 'HOT', 'Ana <ana@b.com>'),                 // HOT + owed -> draft
      cand('2', 'MED', 'Bob <bob@b.com>'),                  // not HOT -> skip
      cand('3', 'HOT', 'Billy <billy@lemonfilms.com>'),     // HOT but Billy sent last -> skip
    ])
    expect(n).toBe(1)
    expect(generateDraft).toHaveBeenCalledOnce()
    expect(setMock).toHaveBeenCalledOnce()
    const written = setMock.mock.calls[0][0]
    expect(written).toMatchObject({ threadId: '1', draft: 'Cached draft.', basedOnMessageId: 'm_1' })
  })

  test('respects the cap', async () => {
    const many = Array.from({ length: 12 }, (_, i) => cand(String(i), 'HOT', 'Ana <ana@b.com>'))
    const n = await pregenerateCopilotDrafts('uid1', 'billy@lemonfilms.com', many, 8)
    expect(n).toBe(8)
  })

  test('skips a thread whose cache already matches the latest message', async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ basedOnMessageId: 'm_1' }) })
    const n = await pregenerateCopilotDrafts('uid1', 'billy@lemonfilms.com', [cand('1', 'HOT', 'Ana <ana@b.com>')])
    expect(n).toBe(0)
    expect(generateDraft).not.toHaveBeenCalled()
  })
})
