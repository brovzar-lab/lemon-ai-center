import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { getBrainEngine } from '../lib/brain'

export const brainRouter = Router()
brainRouter.use(requireAuth)

/**
 * GET /api/brain/status
 * Returns engine status and stats
 */
brainRouter.get('/status', (_req, res) => {
  const brain = getBrainEngine()
  if (!brain || !brain.isReady()) {
    return res.json({
      data: { ready: false, docCount: 0, chunkCount: 0, totalBytes: 0 },
    })
  }
  const stats = brain.getStats()
  res.json({ data: { ready: true, ...stats } })
})

/**
 * GET /api/brain/search?q=...&limit=20
 * Full-text search across the vault
 */
brainRouter.get('/search', (req, res) => {
  const brain = getBrainEngine()
  if (!brain || !brain.isReady()) {
    return res.status(503).json({
      error: { code: 'NOT_READY', message: 'Brain is still indexing', retryable: true },
    })
  }

  const query = String(req.query.q || '').trim()
  if (!query) {
    return res.json({ data: { results: [], query: '' } })
  }

  const limit = Math.min(Number(req.query.limit) || 20, 50)
  const results = brain.search(query, limit)
  res.json({ data: { results, query } })
})

/**
 * GET /api/brain/recent?limit=10
 * Most recently modified notes
 */
brainRouter.get('/recent', (req, res) => {
  const brain = getBrainEngine()
  if (!brain || !brain.isReady()) {
    return res.status(503).json({
      error: { code: 'NOT_READY', message: 'Brain is still indexing', retryable: true },
    })
  }

  const limit = Math.min(Number(req.query.limit) || 10, 30)
  const results = brain.getRecent(limit)
  res.json({ data: { results } })
})

/**
 * GET /api/brain/note/:path(*)
 * Read a single note by its vault-relative path
 */
brainRouter.get('/note/*', (req, res) => {
  const brain = getBrainEngine()
  if (!brain || !brain.isReady()) {
    return res.status(503).json({
      error: { code: 'NOT_READY', message: 'Brain is still indexing', retryable: true },
    })
  }

  // Express wildcard: req.params[0] contains the full path after /note/
  const notePath = (req.params as Record<string, string>)[0]
  if (!notePath) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Path is required', retryable: false },
    })
  }

  const doc = brain.getDoc(notePath)
  if (!doc) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Note not found', retryable: false },
    })
  }

  // Return doc without full plainText (client gets markdown content)
  res.json({
    data: {
      path: doc.path,
      title: doc.title,
      folder: doc.folder,
      content: doc.content,
      frontmatter: doc.frontmatter,
      modifiedAt: doc.modifiedAt,
      links: doc.links,
      sizeBytes: doc.sizeBytes,
    },
  })
})

/**
 * GET /api/brain/folder?path=wiki/projects
 * List notes in a folder
 */
brainRouter.get('/folder', (req, res) => {
  const brain = getBrainEngine()
  if (!brain || !brain.isReady()) {
    return res.status(503).json({
      error: { code: 'NOT_READY', message: 'Brain is still indexing', retryable: true },
    })
  }

  const folder = String(req.query.path || '').trim()
  if (!folder) {
    // Return folder tree
    const tree = brain.getFolderTree()
    return res.json({ data: { tree } })
  }

  const results = brain.listFolder(folder)
  res.json({ data: { results, folder } })
})

/**
 * GET /api/brain/context?q=...&maxChunks=10
 * Get relevant chunks for AI context injection (used by Claude brief)
 */
brainRouter.get('/context', (req, res) => {
  const brain = getBrainEngine()
  if (!brain || !brain.isReady()) {
    return res.json({ data: { chunks: [] } })
  }

  const query = String(req.query.q || '').trim()
  if (!query) {
    return res.json({ data: { chunks: [] } })
  }

  const maxChunks = Math.min(Number(req.query.maxChunks) || 10, 20)
  const chunks = brain.getRelevantChunks(query, maxChunks)
  res.json({ data: { chunks } })
})
