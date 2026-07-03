import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { XMLParser } from 'fast-xml-parser'

/**
 * Text extraction for slate material (spec §3): PDF, FDX, Fountain, docx,
 * md, txt — bilingual by construction (no language assumptions anywhere).
 *
 * Screenplay formats (FDX, Fountain) come out as structured blocks with
 * scene boundaries preserved, so the chunker can split scene-aware without
 * re-deriving structure. Prose formats come out as plain paragraphs.
 */

export interface ExtractedBlock {
  text: string
  /** true when this block starts a new scene (screenplay formats) */
  sceneHeading?: boolean
}

export interface ExtractedText {
  blocks: ExtractedBlock[]
  /** true when the source is screenplay-structured (fdx/fountain, or a detected script PDF) */
  screenplay: boolean
}

const FDX_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // <Text> nodes may repeat and carry style runs — keep them as arrays,
  // and keep their inner whitespace (runs join back into one line)
  isArray: (name) => name === 'Paragraph' || name === 'Text',
  trimValues: false,
})

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

function fdxTextOf(node: unknown): string {
  // A <Text> node is a string, a { '#text': string } object, or nested runs
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (typeof o['#text'] === 'string' || typeof o['#text'] === 'number') return String(o['#text'])
    return asArray(o.Text as unknown[])
      .map(fdxTextOf)
      .join('')
  }
  return ''
}

/** Final Draft XML → blocks; Scene Heading paragraphs mark scene starts. */
export function extractFdx(xml: string): ExtractedText {
  const doc = FDX_PARSER.parse(xml)
  const paragraphs = asArray(doc?.FinalDraft?.Content?.Paragraph as unknown[])
  const blocks: ExtractedBlock[] = []
  for (const p of paragraphs) {
    const para = p as Record<string, unknown>
    const type = String(para['@_Type'] ?? '')
    const text = asArray(para.Text as unknown[]).map(fdxTextOf).join('').trim()
    if (!text) continue
    blocks.push({ text, ...(type === 'Scene Heading' ? { sceneHeading: true } : {}) })
  }
  return { blocks, screenplay: true }
}

// Fountain scene headings: INT./EXT./EST./INT-EXT (any case) or a forced
// heading starting with a single dot. https://fountain.io/syntax
const FOUNTAIN_SCENE_RE = /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[. ].*|^\.(?!\.)\S.*/i

/** Fountain plain text → blocks with scene boundaries. */
export function extractFountain(raw: string): ExtractedText {
  // Strip boneyard comments /* ... */ and title-page key: value header
  const noBoneyard = raw.replace(/\/\*[\s\S]*?\*\//g, '')
  const lines = noBoneyard.split(/\r?\n/)
  let body = lines
  const firstBlank = lines.findIndex((l) => l.trim() === '')
  if (firstBlank > 0 && lines.slice(0, firstBlank).every((l) => /^[A-Za-z ]+:/.test(l) || /^\s/.test(l))) {
    body = lines.slice(firstBlank + 1) // skip title page
  }

  const blocks: ExtractedBlock[] = []
  let current: string[] = []
  const flush = () => {
    const text = current.join('\n').trim()
    if (text) blocks.push({ text })
    current = []
  }
  for (const line of body) {
    const trimmed = line.trim()
    if (trimmed === '') {
      flush()
      continue
    }
    if (FOUNTAIN_SCENE_RE.test(trimmed)) {
      flush()
      blocks.push({ text: trimmed.replace(/^\./, '').trim(), sceneHeading: true })
      continue
    }
    current.push(trimmed)
  }
  flush()
  return { blocks, screenplay: true }
}

// A text page "looks like a screenplay" when scene headings keep appearing —
// lets script PDFs (structure lost in extraction) chunk scene-aware anyway.
const SCENE_LINE_RE = /^(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i

export function looksLikeScreenplay(lines: string[]): boolean {
  const sceneLines = lines.filter((l) => SCENE_LINE_RE.test(l.trim())).length
  return sceneLines >= 3
}

/** Plain text (or PDF text layer) → blocks; scene-aware when it reads like a script. */
export function extractPlainText(raw: string): ExtractedText {
  const lines = raw.split(/\r?\n/)
  const screenplay = looksLikeScreenplay(lines)
  const blocks: ExtractedBlock[] = []
  let current: string[] = []
  const flush = () => {
    const text = current.join('\n').trim()
    if (text) blocks.push({ text })
    current = []
  }
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') {
      flush()
      continue
    }
    if (screenplay && SCENE_LINE_RE.test(trimmed)) {
      flush()
      blocks.push({ text: trimmed, sceneHeading: true })
      continue
    }
    current.push(trimmed)
  }
  flush()
  return { blocks, screenplay }
}

/** Markdown → frontmatter stripped, then plain-text extraction. */
export function extractMarkdown(raw: string): ExtractedText {
  const { content } = matter(raw)
  const result = extractPlainText(content)
  return { ...result, screenplay: false }
}

/** Extract a file by extension. Binary formats read from disk. */
export async function extractFile(filePath: string): Promise<ExtractedText> {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.fdx':
      return extractFdx(fs.readFileSync(filePath, 'utf8'))
    case '.fountain':
      return extractFountain(fs.readFileSync(filePath, 'utf8'))
    case '.md':
      return extractMarkdown(fs.readFileSync(filePath, 'utf8'))
    case '.txt':
      return extractPlainText(fs.readFileSync(filePath, 'utf8'))
    case '.pdf': {
      const pdfParse = (await import('pdf-parse')).default
      const { text } = await pdfParse(fs.readFileSync(filePath))
      return extractPlainText(text)
    }
    case '.docx': {
      const mammoth = await import('mammoth')
      const { value } = await mammoth.extractRawText({ path: filePath })
      return extractPlainText(value)
    }
    default:
      throw new Error(`Unsupported extension: ${ext}`)
  }
}
