/** A single indexed document from the Obsidian vault */
export interface BrainDocument {
  /** Relative path from vault root (e.g. "wiki/projects/las-azules-s2.md") */
  path: string
  /** File name without extension */
  title: string
  /** Folder category (e.g. "wiki/projects", "raw/meetings") */
  folder: string
  /** Parsed YAML frontmatter */
  frontmatter: Record<string, unknown>
  /** Raw markdown content (without frontmatter) */
  content: string
  /** Plain text with markdown stripped, for search indexing */
  plainText: string
  /** File size in bytes */
  sizeBytes: number
  /** Last modified time (ISO string) */
  modifiedAt: string
  /** Obsidian-style [[wiki-links]] found in the content */
  links: string[]
  /** Content chunks for embedding/retrieval */
  chunks: BrainChunk[]
}

/** A passage of a document, chunked by heading sections */
export interface BrainChunk {
  /** Parent document path */
  docPath: string
  /** Section heading (or "intro" for content before first heading) */
  heading: string
  /** The text content of this chunk */
  text: string
  /** Approximate token count */
  tokenEstimate: number
  /** Index within the document's chunks */
  index: number
}

/** Search result returned to the client */
export interface BrainSearchResult {
  path: string
  title: string
  folder: string
  /** Matching snippet */
  snippet: string
  /** Relevance score (0-1) */
  score: number
  modifiedAt: string
  frontmatter: Record<string, unknown>
}

/** Folder tree node for browsing */
export interface BrainFolderNode {
  name: string
  path: string
  isDir: boolean
  children?: BrainFolderNode[]
  fileCount?: number
}
