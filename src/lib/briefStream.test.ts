import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { startBriefStream } from './briefStream'
import { useConnectionStore } from '@/stores/useConnectionStore'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  useConnectionStore.getState().setReauthRequired(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function noopCallbacks() {
  return {
    onCached: vi.fn(),
    onToken: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  }
}

describe('startBriefStream reauth handling', () => {
  test('raises the reconnect flag when the brief route returns REAUTH_REQUIRED', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'REAUTH_REQUIRED', message: 'Reconnect Google' } }),
    })

    await new Promise<void>((resolve) => {
      startBriefStream(false, { ...noopCallbacks(), onError: () => resolve() })
    })

    expect(useConnectionStore.getState().reauthRequired).toBe(true)
  })

  test('a non-reauth failure does NOT raise the reconnect flag', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'UPSTREAM_ERROR', message: 'boom' } }),
    })

    await new Promise<void>((resolve) => {
      startBriefStream(false, { ...noopCallbacks(), onError: () => resolve() })
    })

    expect(useConnectionStore.getState().reauthRequired).toBe(false)
  })
})
