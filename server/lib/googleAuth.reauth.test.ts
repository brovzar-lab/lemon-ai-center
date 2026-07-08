import { describe, expect, test, vi, beforeAll, beforeEach } from 'vitest'

// Use the REAL tokenCache here (do not mock it) so we exercise the refresh path.
const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }))

vi.mock('./firebase', () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ refreshToken: { ciphertext: 'c', iv: 'i', tag: 't' } }),
        }),
        update: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}))

vi.mock('./encryption', () => ({
  decrypt: vi.fn().mockReturnValue('decrypted-refresh-token'),
  encrypt: vi.fn().mockReturnValue({ ciphertext: 'c2', iv: 'i2', tag: 't2' }),
}))

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
        refreshAccessToken: mockRefresh,
      })),
    },
    gmail: vi.fn().mockReturnValue({ users: {} }),
    calendar: vi.fn().mockReturnValue({ events: {} }),
  },
}))

beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = 'cid'
  process.env.GOOGLE_CLIENT_SECRET = 'csec'
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost/callback'
})

import { getGmailClient, ReauthRequiredError } from './googleAuth'

function invalidGrantError() {
  return Object.assign(new Error('invalid_grant'), {
    response: { data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } },
  })
}

beforeEach(() => {
  mockRefresh.mockReset()
})

describe('googleAuth reauth handling', () => {
  test('a revoked refresh token surfaces as ReauthRequiredError (code REAUTH_REQUIRED)', async () => {
    mockRefresh.mockRejectedValue(invalidGrantError())
    await expect(getGmailClient('reauth-uid-1')).rejects.toMatchObject({ code: 'REAUTH_REQUIRED' })
  })

  test('the thrown error is a ReauthRequiredError instance', async () => {
    mockRefresh.mockRejectedValue(invalidGrantError())
    await expect(getGmailClient('reauth-uid-2')).rejects.toBeInstanceOf(ReauthRequiredError)
  })

  test('a non-auth refresh failure rethrows unchanged (not converted to reauth)', async () => {
    mockRefresh.mockRejectedValue(new Error('network ETIMEDOUT'))
    await expect(getGmailClient('reauth-uid-4')).rejects.toThrow(/ETIMEDOUT/)
    await expect(getGmailClient('reauth-uid-5')).rejects.not.toBeInstanceOf(ReauthRequiredError)
  })
})
