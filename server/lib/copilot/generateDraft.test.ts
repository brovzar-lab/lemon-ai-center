import { describe, expect, test, vi, beforeAll } from 'vitest'

vi.mock('../firebase', () => ({
  db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({
    get: async () => ({ exists: false }),
  }) }) }) }) },
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Adjunto la tabla.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    },
  })),
}))

beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'test-key' })

import { buildDraftRequest, getDefaultProfile, generateDraft } from './generateDraft'

describe('generateDraft helpers', () => {
  test('buildDraftRequest embeds voice + the incoming email', () => {
    const req = buildDraftRequest(getDefaultProfile(), {
      from: 'Ana <ana@gbm.com>', fromEmail: 'ana@gbm.com', subject: 'Cap table', snippet: 'send it?',
    }, 'peer')
    expect(req.system).toContain('Billy Rovzar')
    expect(req.system).toContain('NEVER use em dashes')
    expect(req.messages[0].content).toContain('Cap table')
  })

  test('generateDraft returns the model text', async () => {
    const text = await generateDraft('uid1', {
      from: 'Ana <ana@gbm.com>', fromEmail: 'ana@gbm.com', subject: 'Cap table', snippet: 'send it?',
    })
    expect(text).toBe('Adjunto la tabla.')
  })
})
