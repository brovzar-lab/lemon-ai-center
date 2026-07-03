import type { ExtractedText } from './extract'

/**
 * Scene/section-aware chunking (spec §3). Screenplays split on scene
 * boundaries — small scenes merge up to the target, huge scenes split —
 * and every chunk remembers which scenes it covers. Prose packs paragraphs
 * to the target size. Sizes are characters, capped well under the
 * embedding model's input limit.
 */

export interface SlateChunk {
  text: string
  /** order within the file */
  seq: number
  /** 1-based index of the first scene in this chunk (screenplays) */
  sceneIndex?: number
  /** heading text of the first scene in this chunk */
  sceneHeading?: string
}

const TARGET_CHARS = 1600
const MAX_CHARS = 4800 // hard cap ≈ well under the 2048-token embed limit

function splitLong(text: string): string[] {
  if (text.length <= MAX_CHARS) return [text]
  const parts: string[] = []
  const paragraphs = text.split(/\n+/)
  let current = ''
  for (const p of paragraphs) {
    if (current && current.length + p.length + 1 > MAX_CHARS) {
      parts.push(current)
      current = p
    } else {
      current = current ? `${current}\n${p}` : p
    }
    // a single paragraph longer than the cap splits by raw slice
    while (current.length > MAX_CHARS) {
      parts.push(current.slice(0, MAX_CHARS))
      current = current.slice(MAX_CHARS)
    }
  }
  if (current) parts.push(current)
  return parts
}

interface Scene {
  index: number
  heading: string
  text: string
}

function toScenes(extracted: ExtractedText): Scene[] {
  const scenes: Scene[] = []
  let index = 0
  let heading = ''
  let body: string[] = []
  const flush = () => {
    const text = [heading, ...body].filter(Boolean).join('\n').trim()
    if (text) scenes.push({ index: index || 1, heading, text })
    body = []
  }
  for (const block of extracted.blocks) {
    if (block.sceneHeading) {
      flush()
      index += 1
      heading = block.text
    } else {
      body.push(block.text)
    }
  }
  flush()
  return scenes
}

export function chunkExtracted(extracted: ExtractedText): SlateChunk[] {
  const chunks: SlateChunk[] = []

  if (extracted.screenplay) {
    const scenes = toScenes(extracted)
    let bucket: Scene[] = []
    let bucketLen = 0
    const flushBucket = () => {
      if (bucket.length === 0) return
      const first = bucket[0]
      const text = bucket.map((s) => s.text).join('\n\n')
      for (const part of splitLong(text)) {
        chunks.push({
          text: part,
          seq: chunks.length,
          sceneIndex: first.index,
          ...(first.heading ? { sceneHeading: first.heading } : {}),
        })
      }
      bucket = []
      bucketLen = 0
    }
    for (const scene of scenes) {
      if (bucketLen > 0 && bucketLen + scene.text.length > TARGET_CHARS) flushBucket()
      bucket.push(scene)
      bucketLen += scene.text.length
      if (bucketLen >= TARGET_CHARS) flushBucket()
    }
    flushBucket()
    return chunks
  }

  // Prose: pack paragraphs to the target size
  let current: string[] = []
  let currentLen = 0
  const flush = () => {
    const text = current.join('\n\n').trim()
    if (!text) return
    for (const part of splitLong(text)) {
      chunks.push({ text: part, seq: chunks.length })
    }
    current = []
    currentLen = 0
  }
  for (const block of extracted.blocks) {
    if (currentLen > 0 && currentLen + block.text.length > TARGET_CHARS) flush()
    current.push(block.text)
    currentLen += block.text.length
    if (currentLen >= TARGET_CHARS) flush()
  }
  flush()
  return chunks
}
