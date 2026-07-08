import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }))
vi.mock('@/lib/apiClient', () => ({ apiFetch: apiFetchMock }))

import { useInboxStore } from './useInboxStore'

beforeEach(() => {
  apiFetchMock.mockReset()
  useInboxStore.setState({ threads: [], loading: false, error: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useInboxStore.fetch error handling', () => {
  test('records an error instead of silently leaving threads empty on failure', async () => {
    apiFetchMock.mockRejectedValue(new Error('Gmail unavailable'))
    await useInboxStore.getState().fetch()
    const s = useInboxStore.getState()
    expect(s.error).toBe('Gmail unavailable')
    expect(s.loading).toBe(false)
  })

  test('a successful retry clears the error', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('blip'))
    await useInboxStore.getState().fetch()
    expect(useInboxStore.getState().error).toBe('blip')

    apiFetchMock.mockResolvedValueOnce([{ id: 't1' }])
    await useInboxStore.getState().fetch()
    const s = useInboxStore.getState()
    expect(s.error).toBeNull()
    expect(s.threads).toHaveLength(1)
  })
})
