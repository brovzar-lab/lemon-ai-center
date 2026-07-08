import { describe, expect, test, vi } from 'vitest'

// A dead Google token must PROPAGATE out of assembleContext (not be swallowed
// by its per-source catch), so the /brief route can return REAUTH_REQUIRED.
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/brain', () => ({ getBrainEngine: () => null }))
vi.mock('../lib/googleAuth', () => ({
  getGmailClient: vi.fn().mockRejectedValue(Object.assign(new Error('reconnect'), { code: 'REAUTH_REQUIRED' })),
  getCalendarClient: vi.fn().mockRejectedValue(Object.assign(new Error('reconnect'), { code: 'REAUTH_REQUIRED' })),
}))

import { assembleContext } from './brief'

describe('assembleContext reauth propagation', () => {
  test('rethrows a dead-token error instead of swallowing it', async () => {
    await expect(assembleContext('uid1')).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' })
  })
})
