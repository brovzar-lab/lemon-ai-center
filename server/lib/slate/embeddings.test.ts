import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cosineSimilarity, embedQuery, embedTexts, EMBEDDING_DIMS } from './embeddings'

const savedKey = process.env.GEMINI_API_KEY
const fetchMock = vi.fn()

function vectorOf(seed: number): number[] {
  // arbitrary non-normalized vector
  return Array.from({ length: EMBEDDING_DIMS }, (_, i) => Math.sin(seed + i))
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key'
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  process.env.GEMINI_API_KEY = savedKey
  vi.unstubAllGlobals()
})

function okResponse(count: number) {
  return {
    ok: true,
    json: async () => ({
      embeddings: Array.from({ length: count }, (_, i) => ({ values: vectorOf(i + 1) })),
    }),
  }
}

describe('embedTexts', () => {
  test('batches requests at 32 and returns normalized vectors in order', async () => {
    const texts = Array.from({ length: 70 }, (_, i) => `text ${i}`)
    fetchMock
      .mockResolvedValueOnce(okResponse(32))
      .mockResolvedValueOnce(okResponse(32))
      .mockResolvedValueOnce(okResponse(6))

    const vectors = await embedTexts(texts)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(vectors).toHaveLength(70)

    // normalized: |v| == 1
    const norm = Math.sqrt(vectors[0].reduce((s, v) => s + v * v, 0))
    expect(norm).toBeCloseTo(1, 6)

    // task type + dims are in the request body
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.requests[0].taskType).toBe('RETRIEVAL_DOCUMENT')
    expect(body.requests[0].outputDimensionality).toBe(768)
    expect(body.requests).toHaveLength(32)
  })

  test('throws a typed error on HTTP failure', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'quota' })
    await expect(embedTexts(['x'])).rejects.toThrow(/Gemini embeddings 429/)
  })

  test('throws when the vector count does not match', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(1))
    await expect(embedTexts(['a', 'b'])).rejects.toThrow(/returned 1 vectors for 2/)
  })

  test('throws without a configured key', async () => {
    delete process.env.GEMINI_API_KEY
    await expect(embedTexts(['x'])).rejects.toThrow(/GEMINI_API_KEY/)
  })
})

describe('embedQuery', () => {
  test('uses the RETRIEVAL_QUERY task type', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(1))
    const vec = await embedQuery('¿cuál proyecto tiene el segundo acto más débil?')
    expect(vec).toHaveLength(EMBEDDING_DIMS)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.requests[0].taskType).toBe('RETRIEVAL_QUERY')
  })
})

describe('cosineSimilarity', () => {
  test('dot product of normalized vectors, identical → 1', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(1))
    const [a] = await embedTexts(['same'])
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 6)
  })
})
