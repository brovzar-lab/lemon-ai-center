import path from 'path'
import { scanVault, scanFile } from './scanner'
import { BrainIndex } from './indexer'
import { startVaultWatcher } from './watcher'
import type { BrainDocument, BrainSearchResult, BrainChunk, BrainFolderNode } from './types'

export type { BrainDocument, BrainSearchResult, BrainChunk, BrainFolderNode }

/**
 * The Brain Engine — indexes and searches the Obsidian vault.
 * 
 * Lifecycle:
 *   1. init() — scans all files, builds search index, starts watcher
 *   2. search() / getDoc() / etc. — query the index
 *   3. File watcher auto-updates on changes
 */
export class BrainEngine {
  private vaultRoot: string
  private index: BrainIndex
  private ready = false

  constructor(vaultRoot: string) {
    this.vaultRoot = path.resolve(vaultRoot)
    this.index = new BrainIndex()
  }

  /** Initialize: scan vault, build index, start file watcher */
  async init(): Promise<void> {
    const startMs = Date.now()
    console.log(`[brain] Scanning vault: ${this.vaultRoot}`)

    const docs = scanVault(this.vaultRoot)
    this.index.load(docs)

    const totalChunks = docs.reduce((sum, d) => sum + d.chunks.length, 0)
    const elapsedMs = Date.now() - startMs
    console.log(`[brain] Indexed ${docs.length} docs, ${totalChunks} chunks in ${elapsedMs}ms`)

    // Start file watcher for auto-updates
    startVaultWatcher(this.vaultRoot, this)

    this.ready = true
  }

  /** Whether the engine has finished initial indexing */
  isReady(): boolean {
    return this.ready
  }

  /** Full-text search across the vault */
  search(query: string, limit = 20): BrainSearchResult[] {
    return this.index.search(query, limit)
  }

  /** Get a single document by relative path */
  getDoc(relPath: string): BrainDocument | undefined {
    return this.index.getDoc(relPath)
  }

  /** List all documents in a folder */
  listFolder(folder: string): BrainSearchResult[] {
    const docs = this.index.getDocsByFolder(folder)
    return docs.map((d) => ({
      path: d.path,
      title: d.title,
      folder: d.folder,
      snippet: d.plainText.slice(0, 150) + '…',
      score: 1,
      modifiedAt: d.modifiedAt,
      frontmatter: d.frontmatter,
    }))
  }

  /** Get most recently modified documents */
  getRecent(limit = 10): BrainSearchResult[] {
    return this.index.getRecent(limit)
  }

  /** Get all chunks for a query (for RAG context injection) */
  getRelevantChunks(query: string, maxChunks = 10): BrainChunk[] {
    const results = this.index.search(query, maxChunks)
    const chunks: BrainChunk[] = []

    for (const result of results) {
      const doc = this.index.getDoc(result.path)
      if (!doc) continue
      // Return the most relevant chunks from each doc
      chunks.push(...doc.chunks.slice(0, 3))
      if (chunks.length >= maxChunks) break
    }

    return chunks.slice(0, maxChunks)
  }

  /** Build a folder tree for browsing */
  getFolderTree(): BrainFolderNode[] {
    const allDocs = this.index.getAllDocs()
    const tree: Record<string, BrainFolderNode> = {}

    for (const doc of allDocs) {
      const parts = doc.folder.split('/')
      let currentPath = ''
      for (const part of parts) {
        const parentPath = currentPath
        currentPath = currentPath ? `${currentPath}/${part}` : part
        if (!tree[currentPath]) {
          tree[currentPath] = {
            name: part,
            path: currentPath,
            isDir: true,
            children: [],
            fileCount: 0,
          }
          if (parentPath && tree[parentPath]) {
            const parent = tree[parentPath]
            if (!parent.children!.find((c) => c.path === currentPath)) {
              parent.children!.push(tree[currentPath])
            }
          }
        }
        tree[currentPath].fileCount = (tree[currentPath].fileCount ?? 0) + 1
      }
    }

    // Return top-level folders
    return Object.values(tree).filter((n) => !n.path.includes('/'))
  }

  /** Get total stats */
  getStats(): { docCount: number; chunkCount: number; totalBytes: number } {
    const allDocs = this.index.getAllDocs()
    return {
      docCount: allDocs.length,
      chunkCount: allDocs.reduce((sum, d) => sum + d.chunks.length, 0),
      totalBytes: allDocs.reduce((sum, d) => sum + d.sizeBytes, 0),
    }
  }

  // ── Called by file watcher ──────────────────────────

  /** Re-scan and re-index a single file (add or update) */
  updateDocument(absolutePath: string): void {
    const doc = scanFile(this.vaultRoot, absolutePath)
    if (doc) {
      this.index.addDoc(doc)
    }
  }

  /** Remove a document from the index */
  removeDocument(relPath: string): void {
    this.index.removeDoc(relPath)
  }
}

// ── Singleton ──────────────────────────────────────

let _engine: BrainEngine | null = null

/** Get or create the singleton brain engine */
export function getBrainEngine(): BrainEngine | null {
  return _engine
}

/** Initialize the brain engine with the vault path */
export async function initBrainEngine(vaultPath: string): Promise<BrainEngine> {
  if (_engine) return _engine
  _engine = new BrainEngine(vaultPath)
  await _engine.init()
  return _engine
}
