import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { notifyJobFailure } from './alert'

const fetchMock = vi.fn()
const savedUrl = process.env.ALERT_WEBHOOK_URL

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true })
})

afterEach(() => {
  process.env.ALERT_WEBHOOK_URL = savedUrl
  vi.unstubAllGlobals()
})

describe('notifyJobFailure', () => {
  test('posts a failure notice to the configured webhook', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/abc'
    await notifyJobFailure('morning_assembly', 'Anthropic 529 overloaded')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://hooks.example.com/abc')
    const body = JSON.parse(opts.body)
    // Sends both Slack (text) and Discord (content) keys.
    expect(body.text).toContain('morning_assembly')
    expect(body.text).toContain('Anthropic 529 overloaded')
    expect(body.content).toBe(body.text)
  })

  test('is a no-op when no webhook is configured', async () => {
    delete process.env.ALERT_WEBHOOK_URL
    await notifyJobFailure('inbox_scan', 'boom')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('never throws when the webhook request fails', async () => {
    process.env.ALERT_WEBHOOK_URL = 'https://hooks.example.com/abc'
    fetchMock.mockRejectedValue(new Error('network down'))
    await expect(notifyJobFailure('nightly', 'boom')).resolves.toBeUndefined()
  })
})
