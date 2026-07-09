import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Covers the two guarantees unique to wiring Copilot pre-generation into the
 * inbox scan (Phase 4 of runInboxScan) — nothing else in the suite exercises
 * this path:
 *  1. THE SAFETY NET — a throwing pregenerateCopilotDrafts must never fail
 *     the scan; runInboxScan still resolves with the extraction stats.
 *  2. THE MAPPING GLUE — pregenerateCopilotDrafts is called with the right
 *     uid/selfEmail, and candidates are built correctly from the fetched
 *     email (fromEmail parsed out of the From header, threadId/
 *     latestMessageId carried through).
 */

const { mockThreadsList, mockThreadsGet, mockGetProfile, mockAnthropicCreate } = vi.hoisted(() => ({
  mockThreadsList: vi.fn(),
  mockThreadsGet: vi.fn(),
  mockGetProfile: vi.fn(),
  mockAnthropicCreate: vi.fn(),
}))

vi.mock('../../googleAuth', () => ({
  getGmailClient: vi.fn().mockResolvedValue({
    users: {
      threads: { list: mockThreadsList, get: mockThreadsGet },
      getProfile: mockGetProfile,
    },
  }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}))

vi.mock('../../firebase', () => ({
  db: {
    batch: () => ({ set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) }),
    collection: () => ({
      limit: () => ({ get: async () => ({ docs: [] }) }),
      doc: () => ({}),
    }),
  },
}))

vi.mock('../../copilot/pregenerate', () => ({
  pregenerateCopilotDrafts: vi.fn(),
}))

import { runInboxScan } from './inboxScan'
import { pregenerateCopilotDrafts, type DraftCandidate } from '../../copilot/pregenerate'

const RAW_BODY = 'Sending over the cap table for review.'
const ENCODED_BODY = Buffer.from(RAW_BODY).toString('base64url')

function fullThreadResponse() {
  return {
    data: {
      messages: [
        {
          id: 'm1',
          labelIds: ['UNREAD', 'INBOX'],
          payload: {
            headers: [
              { name: 'From', value: 'Ana Lopez <ana@gbm.com>' },
              { name: 'Subject', value: 'Cap table' },
              { name: 'Date', value: new Date().toUTCString() },
            ],
            body: { data: ENCODED_BODY },
          },
        },
      ],
    },
  }
}

beforeEach(() => {
  mockThreadsList.mockReset().mockResolvedValue({ data: { threads: [{ id: 't1' }] } })
  mockThreadsGet.mockReset().mockResolvedValue(fullThreadResponse())
  mockGetProfile.mockReset().mockResolvedValue({ data: { emailAddress: 'billy@lemonfilms.com' } })
  mockAnthropicCreate.mockReset().mockResolvedValue({
    content: [{ type: 'text', text: '{"deals":[],"projects":[],"delegations":[],"memories":[]}' }],
  })
  vi.mocked(pregenerateCopilotDrafts).mockReset()
})

describe('runInboxScan — Copilot pre-generation (Phase 4)', () => {
  test('scan still succeeds and returns stats when Copilot pre-generation throws', async () => {
    vi.mocked(pregenerateCopilotDrafts).mockRejectedValue(new Error('boom'))

    const stats = await runInboxScan('uid1', 40)

    expect(stats).toEqual({ deals: 0, projects: 0, delegations: 0, memories: 0 })
    // did NOT throw; pre-gen was attempted
    expect(pregenerateCopilotDrafts).toHaveBeenCalled()
  })

  test('passes correctly-mapped candidates to pre-generation', async () => {
    vi.mocked(pregenerateCopilotDrafts).mockResolvedValue(1)

    await runInboxScan('uid1', 40)

    const [uid, selfEmail, candidates] = vi.mocked(pregenerateCopilotDrafts).mock.calls[0]
    expect(uid).toBe('uid1')
    expect(selfEmail).toBe('billy@lemonfilms.com')

    const c = candidates.find((x: DraftCandidate) => x.threadId === 't1')
    expect(c).toBeTruthy()
    expect(c?.fromEmail).toBe('ana@gbm.com') // parsed from "Ana Lopez <ana@gbm.com>"
    expect(c?.latestMessageId).toBe('m1')
  })
})
