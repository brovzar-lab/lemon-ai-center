import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import type { BrainDocument, BrainChunk } from './types'

/** Regex to find [[wiki-links]] in markdown */
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g

/** Strip markdown formatting for plain-text search indexing */
function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`[^`]+`/g, '')         // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[[^\]]*\]\([^)]*\)/g, (m) => m.replace(/\[([^\]]*)\]\([^)]*\)/, '$1')) // links → text
    .replace(/#{1,6}\s+/g, '')       // headings
    .replace(/[*_~]+/g, '')          // bold/italic/strike
    .replace(/>\s+/g, '')            // blockquotes
    .replace(/[-*+]\s+/g, '')        // list markers
    .replace(/\|/g, ' ')             // table pipes
    .replace(/---+/g, '')            // horizontal rules
    .replace(/\n{3,}/g, '\n\n')      // excess newlines
    .trim()
}

/** Extract [[wiki-links]] from content */
function extractLinks(content: string): string[] {
  const links: string[] = []
  let match: RegExpExecArray | null
  while ((match = WIKI_LINK_RE.exec(content)) !== null) {
    // Handle [[path|display]] format
    const link = match[1].split('|')[0].trim()
    if (!links.includes(link)) links.push(link)
  }
  return links
}

/** Chunk a document by heading sections */
function chunkByHeadings(docPath: string, content: string): BrainChunk[] {
  const lines = content.split('\n')
  const chunks: BrainChunk[] = []
  let currentHeading = 'intro'
  let currentLines: string[] = []

  function flushChunk() {
    const text = currentLines.join('\n').trim()
    if (text.length > 20) {
      chunks.push({
        docPath,
        heading: currentHeading,
        text,
        tokenEstimate: Math.ceil(text.length / 4),
        index: chunks.length,
      })
    }
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      flushChunk()
      currentHeading = headingMatch[2].trim()
      currentLines = [line]
    } else {
      currentLines.push(line)
    }
  }
  flushChunk()

  return chunks
}

/** Scan a single markdown file and produce a BrainDocument */
export function scanFile(vaultRoot: string, filePath: string): BrainDocument | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const stat = fs.statSync(filePath)
    const { data: frontmatter, content } = matter(raw)
    const relPath = path.relative(vaultRoot, filePath)
    const title = frontmatter.title || path.basename(filePath, '.md')
    const folder = path.dirname(relPath)
    const plainText = stripMarkdown(content)
    const links = extractLinks(content)
    const chunks = chunkByHeadings(relPath, content)

    return {
      path: relPath,
      title,
      folder,
      frontmatter,
      content,
      plainText,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      links,
      chunks,
    }
  } catch (err) {
    console.warn(`[brain] Failed to scan ${filePath}:`, (err as Error).message)
    return null
  }
}

/** Recursively scan all .md files in the vault */
export function scanVault(vaultRoot: string): BrainDocument[] {
  const docs: BrainDocument[] = []

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      // Skip hidden dirs, .obsidian, .git, node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name.endsWith('.md')) {
        const doc = scanFile(vaultRoot, fullPath)
        if (doc) docs.push(doc)
      }
    }
  }

  walk(vaultRoot)
  return docs
}
