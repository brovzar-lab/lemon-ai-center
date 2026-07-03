import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { listSlateProjects } from '../lib/slate'

/**
 * DEVELOPMENT-HELL — the development slate surface.
 * Read-only for now; writes arrive with the onboarding wizard and will
 * add csrfCheck per the house convention.
 */
export const slateRouter = Router()
slateRouter.use(requireAuth)

/**
 * GET /api/slate/projects
 * Every project on the slate, ordered by slug.
 * Returns: { data: { projects: SlateProject[] } }
 */
slateRouter.get('/projects', async (_req, res) => {
  try {
    const projects = await listSlateProjects()
    res.json({ data: { projects } })
  } catch (err) {
    console.error('[slate] Failed to list projects:', (err as Error).message)
    res.status(500).json({
      error: { code: 'SLATE_LIST_FAILED', message: 'Could not load the slate', retryable: true },
    })
  }
})
