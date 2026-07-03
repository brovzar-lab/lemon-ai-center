/**
 * Embeddings for the slate index (D5): Gemini — the key already lives in
 * this app's env for TTS — via plain REST, no new SDK. 768 dimensions
 * (well under Firestore's vector cap, ~4x cheaper to store than 3072);
 * reduced-dimension embeddings arrive unnormalized, so we normalize here.
 * gemini-embedding-001 is multilingual — Spanish and English land in the
 * same space, which is the whole point for a bilingual slate.
 */

export const EMBEDDING_MODEL = 'gemini-embedding-001'
export const EMBEDDING_DIMS = 768
const BATCH_SIZE = 32
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

function normalize(vec: number[]): number[] {
  let sum = 0
  for (const v of vec) sum += v * v
  const norm = Math.sqrt(sum)
  if (norm === 0) return vec
  return vec.map((v) => v / norm)
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  // vectors are pre-normalized → cosine == dot product
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

interface BatchResponse {
  embeddings?: Array<{ values?: number[] }>
  error?: { message?: string }
}

async function embedBatch(
  texts: string[],
  taskType: EmbedTaskType,
  apiKey: string,
): Promise<number[][]> {
  const url = `${BASE_URL}/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBEDDING_DIMS,
      })),
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini embeddings ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as BatchResponse
  const embeddings = data.embeddings ?? []
  if (embeddings.length !== texts.length) {
    throw new Error(`Gemini embeddings returned ${embeddings.length} vectors for ${texts.length} texts`)
  }
  return embeddings.map((e) => {
    if (!e.values || e.values.length !== EMBEDDING_DIMS) {
      throw new Error(`Gemini embeddings returned a malformed vector (${e.values?.length ?? 0} dims)`)
    }
    return normalize(e.values)
  })
}

/** Embed document chunks (batched). Returns one normalized vector per text. */
export async function embedTexts(
  texts: string[],
  taskType: EmbedTaskType = 'RETRIEVAL_DOCUMENT',
): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE), taskType, apiKey)))
  }
  return out
}

/** Embed a search query. */
export async function embedQuery(query: string): Promise<number[]> {
  const [vec] = await embedTexts([query], 'RETRIEVAL_QUERY')
  return vec
}
