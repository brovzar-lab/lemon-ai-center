import FlexSearch from 'flexsearch'
import type { BrainDocument, BrainSearchResult } from './types'

/**
 * Full-text search index backed by FlexSearch.
 * Indexes document titles, plain text, and folder paths.
 */
export class BrainIndex {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private index: any
  private docs: Map<string, BrainDocument> = new Map()

  constructor() {
    this.index = new FlexSearch.Index({
      tokenize: 'forward',
      resolution: 9,
      cache: true,
    })
  }

  /** Number of indexed documents */
  get size(): number {
    return this.docs.size
  }

  /** Bulk-load documents into the index */
  load(documents: BrainDocument[]): void {
    this.docs.clear()
    for (const doc of documents) {
      this.addDoc(doc)
    }
  }

  /** Add or update a single document */
  addDoc(doc: BrainDocument): void {
    const id = this.pathToId(doc.path)
    // Remove old entry if updating
    if (this.docs.has(doc.path)) {
      this.index.remove(id)
    }
    this.docs.set(doc.path, doc)
    // Index a combined text of title + folder + plain text
    const indexText = `${doc.title} ${doc.folder.replace(/\//g, ' ')} ${doc.plainText}`
    this.index.add(id, indexText)
  }

  /** Remove a document from the index */
  removeDoc(docPath: string): void {
    const id = this.pathToId(docPath)
    this.docs.delete(docPath)
    this.index.remove(id)
  }

  /** Get a document by path */
  getDoc(docPath: string): BrainDocument | undefined {
    return this.docs.get(docPath)
  }

  /** Get all documents */
  getAllDocs(): BrainDocument[] {
    return Array.from(this.docs.values())
  }

  /** Get documents by folder */
  getDocsByFolder(folder: string): BrainDocument[] {
    return Array.from(this.docs.values()).filter((d) =>
      d.folder === folder || d.folder.startsWith(folder + '/')
    )
  }

  /** Full-text search */
  search(query: string, limit = 20): BrainSearchResult[] {
    if (!query.trim()) return []

    const ids = this.index.search(query, limit) as number[]
    const results: BrainSearchResult[] = []

    for (const id of ids) {
      const doc = this.idToDoc(id)
      if (!doc) continue

      // Build a snippet around the query match
      const snippet = this.buildSnippet(doc, query)
      results.push({
        path: doc.path,
        title: doc.title,
        folder: doc.folder,
        snippet,
        score: 1 - (results.length / ids.length), // simple rank score
        modifiedAt: doc.modifiedAt,
        frontmatter: doc.frontmatter,
      })
    }

    return results
  }

  /** Get top-k documents by recency */
  getRecent(limit = 10): BrainSearchResult[] {
    const sorted = Array.from(this.docs.values())
      .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
      .slice(0, limit)

    return sorted.map((doc) => ({
      path: doc.path,
      title: doc.title,
      folder: doc.folder,
      snippet: doc.plainText.slice(0, 150) + '…',
      score: 1,
      modifiedAt: doc.modifiedAt,
      frontmatter: doc.frontmatter,
    }))
  }

  // ── Internals ──────────────────────────────────

  private pathToId(path: string): number {
    // Simple hash: sum of char codes
    let hash = 0
    for (let i = 0; i < path.length; i++) {
      hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0
    }
    return Math.abs(hash)
  }

  private idToDoc(id: number): BrainDocument | undefined {
    // Reverse lookup — FlexSearch returns IDs, we need to match back
    for (const doc of this.docs.values()) {
      if (this.pathToId(doc.path) === id) return doc
    }
    return undefined
  }

  private buildSnippet(doc: BrainDocument, query: string): string {
    const text = doc.plainText
    const lowerText = text.toLowerCase()
    const lowerQuery = query.toLowerCase()
    const idx = lowerText.indexOf(lowerQuery)

    if (idx === -1) {
      // Return first 150 chars if no direct match
      return text.slice(0, 150) + (text.length > 150 ? '…' : '')
    }

    // Window around the match
    const start = Math.max(0, idx - 60)
    const end = Math.min(text.length, idx + query.length + 90)
    const prefix = start > 0 ? '…' : ''
    const suffix = end < text.length ? '…' : ''
    return prefix + text.slice(start, end).trim() + suffix
  }
}
