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

  test('applies the cap AFTER filtering (filter-then-cap, not cap-then-filter)', async () => {
    const ineligible = [
      cand('m1', 'MED', 'Ana <ana@x.com>'),
      cand('m2', 'MED', 'Bob <bob@x.com>'),
      cand('s1', 'HOT', 'Billy <billy@lemonfilms.com>'),   // HOT but self-sent -> not owed
      cand('s2', 'HOT', 'Billy <billy@lemonfilms.com>'),
    ]
    const eligible = Array.from({ length: 10 }, (_, i) => cand(`h${i}`, 'HOT', 'Ana <ana@x.com>'))
    const n = await pregenerateCopilotDrafts('uid1', 'billy@lemonfilms.com', [...ineligible, ...eligible], 8)
    expect(n).toBe(8) // filter-then-cap => 8; a cap-then-filter bug would yield 4
  })

  test('skips a thread whose cache already matches the latest message', async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ basedOnMessageId: 'm_1' }) })
    const n = await pregenerateCopilotDrafts('uid1', 'billy@lemonfilms.com', [cand('1', 'HOT', 'Ana <ana@b.com>')])
    expect(n).toBe(0)
    expect(generateDraft).not.toHaveBeenCalled()
  })

  test('a generateDraft failure for one candidate does not abort the rest', async () => {
    ;(generateDraft as any).mockRejectedValueOnce(new Error('boom')) // first eligible fails
    const n = await pregenerateCopilotDrafts('uid1', 'billy@lemonfilms.com', [
      cand('a', 'HOT', 'Ana <ana@x.com>'),
      cand('b', 'HOT', 'Ana <ana@x.com>'),
    ], 8)
    expect(n).toBe(1)                 // only the second was written
    expect(setMock).toHaveBeenCalledTimes(1)
  })

  test('does not cache an empty or whitespace-only draft', async () => {
    ;(generateDraft as any).mockResolvedValueOnce('   ')
    const n = await pregenerateCopilotDrafts('uid1', 'billy@lemonfilms.com', [
      cand('a', 'HOT', 'Ana <ana@x.com>'),
    ], 8)
    expect(n).toBe(0)
    expect(setMock).not.toHaveBeenCalled()
  })
})
