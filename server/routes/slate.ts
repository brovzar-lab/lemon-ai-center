import { Router } from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { chatLimit } from '../middleware/rateLimit'
import { getSlateCounts, listSlateConfirmItems, listSlateProjects } from '../lib/slate'
import { runSlateChat, type SlateChatTurn } from '../lib/slate/chat'
import { getSlateConfig, saveSlateConfig } from '../lib/slate/config'
import { runSlateScan } from '../lib/slate/scanner'
import { isSlateWatcherActive, startSlateWatcher } from '../lib/slate/watcher'
import { getIngestStatus, runSlateIngestion, searchSlate, slateIndexSize } from '../lib/slate/ingest'
import { fireSkillRun, listSkillRuns, listSkills, SkillRunError } from '../lib/slate/skills'
import type { SlateStatusPayload } from '@shared/types'

/**
 * DEVELOPMENT-HELL — the development slate surface.
 * Reads are plain GETs; the two writes (onboard, rescan) carry csrfCheck
 * per the house convention.
 */
export const slateRouter = Router()
slateRouter.use(requireAuth)

const SKELETON = ['_external', '_archive', '_inbox']

function expandTilde(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

async function buildStatus(): Promise<SlateStatusPayload> {
  const config = await getSlateConfig()
  if (!config) {
    return { onboarded: false, watcherActive: false, projectCount: 0, confirmCount: 0 }
  }
  const counts = await getSlateCounts()
  const ingest = getIngestStatus()
  return {
    onboarded: true,
    devFolderPath: config.devFolderPath,
    folderAccessible: fs.existsSync(config.devFolderPath),
    watcherActive: isSlateWatcherActive(),
    projectCount: counts.projects,
    confirmCount: counts.confirm,
    ...(config.lastScanAt ? { lastScanAt: config.lastScanAt } : {}),
    chunkCount: slateIndexSize(),
    ingestRunning: ingest.running,
    ...(ingest.lastRunAt ? { lastIngestAt: ingest.lastRunAt } : {}),
    ...(ingest.lastError ? { ingestError: ingest.lastError } : {}),
  }
}

/**
 * GET /api/slate/status
 * Module state: onboarded?, folder, watcher, counts, last scan.
 */
slateRouter.get('/status', async (_req, res) => {
  try {
    res.json({ data: await buildStatus() })
  } catch (err) {
    console.error('[slate] Status failed:', (err as Error).message)
    res.status(500).json({
      error: { code: 'SLATE_STATUS_FAILED', message: 'Could not read slate status', retryable: true },
    })
  }
})

/**
 * GET /api/slate/projects
 * Every project on the slate, ordered by slug.
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

/**
 * GET /api/slate/confirm
 * Files the scanner could not file deterministically — the confirm queue.
 */
slateRouter.get('/confirm', async (_req, res) => {
  try {
    const items = await listSlateConfirmItems()
    res.json({ data: { items } })
  } catch (err) {
    console.error('[slate] Failed to list confirm queue:', (err as Error).message)
    res.status(500).json({
      error: { code: 'SLATE_CONFIRM_FAILED', message: 'Could not load the confirm queue', retryable: true },
    })
  }
})

/**
 * GET /api/slate/search?q=…&scope=all|internal&project=…&limit=…
 * Semantic search over the slate index. scope=internal is the external-
 * material firewall (spec §7): external chunks never surface for
 * internal creative work. Results always carry their origin.
 */
slateRouter.get('/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (!q) {
    res.json({ data: { query: '', results: [] } })
    return
  }
  const scope = req.query.scope === 'internal' ? 'internal' : 'all'
  const project = typeof req.query.project === 'string' && req.query.project ? req.query.project : undefined
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50)
  try {
    const hits = await searchSlate(q, { scope, project, limit })
    res.json({
      data: {
        query: q,
        scope,
        results: hits.map((h) => ({ ...h, text: h.text.slice(0, 600) })),
      },
    })
  } catch (err) {
    console.error('[slate] Search failed:', (err as Error).message)
    res.status(500).json({
      error: { code: 'SEARCH_FAILED', message: (err as Error).message, retryable: true },
    })
  }
})

/**
 * GET /api/slate/skills
 * The canonical Lemon skill set (skills/ at the repo root, D6).
 * review-pending skills are listed — the UI shows them awaiting review —
 * but the runner refuses to fire them.
 */
slateRouter.get('/skills', (_req, res) => {
  try {
    res.json({ data: { skills: listSkills() } })
  } catch (err) {
    console.error('[slate] Failed to list skills:', (err as Error).message)
    res.status(500).json({
      error: { code: 'SKILLS_FAILED', message: 'Could not read the skill library', retryable: true },
    })
  }
})

/**
 * POST /api/slate/skills/run
 * Body: { skill: string, project: string, version?: number }
 * Fires a skill at a project (spec §4). Validates synchronously, then the
 * run finishes in the background — poll GET /api/slate/runs. The result
 * lands in the project's coverage/ folder and is scanned + indexed.
 */
slateRouter.post('/skills/run', csrfCheck, async (req, res) => {
  const { skill, project, version } = req.body ?? {}
  if (typeof skill !== 'string' || !skill || typeof project !== 'string' || !project) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'skill and project are required', retryable: false },
    })
    return
  }
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'version must be a positive integer', retryable: false },
    })
    return
  }
  try {
    const { runId } = await fireSkillRun(skill, project, version)
    res.json({ data: { runId } })
  } catch (err) {
    if (err instanceof SkillRunError) {
      const status =
        err.code === 'UNKNOWN_SKILL' || err.code === 'UNKNOWN_PROJECT' ? 404
        : err.code === 'ALREADY_RUNNING' ? 409
        : err.code === 'REVIEW_PENDING' || err.code === 'PROJECT_DEAD' || err.code === 'NO_MATERIAL' ? 422
        : 409
      res.status(status).json({ error: { code: err.code, message: err.message, retryable: false } })
      return
    }
    console.error('[slate] Skill fire failed:', (err as Error).message)
    res.status(500).json({
      error: { code: 'RUN_FAILED', message: 'Could not start the skill run', retryable: true },
    })
  }
})

/**
 * GET /api/slate/runs?limit=…
 * Recent skill runs, newest first — the "Learn" log (spec §4).
 */
slateRouter.get('/runs', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
  try {
    res.json({ data: { runs: await listSkillRuns(limit) } })
  } catch (err) {
    console.error('[slate] Failed to list runs:', (err as Error).message)
    res.status(500).json({
      error: { code: 'RUNS_FAILED', message: 'Could not load the run log', retryable: true },
    })
  }
})

/**
 * POST /api/slate/chat
 * Body: { message: string, history?: [{ role: 'user'|'assistant', text }] }
 * The query chat (spec §3): SSE stream of token / tool / done events from
 * the brain over hybrid retrieval. History rides with the request — the
 * server keeps no conversation state, same as the Billy Drawer chat.
 */
slateRouter.post('/chat', csrfCheck, chatLimit, async (req, res) => {
  const { message, history } = req.body as { message?: unknown; history?: unknown }

  if (typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'message must be a non-empty string', retryable: false },
    })
    return
  }
  if (message.length > 10_000) {
    res.status(400).json({
      error: { code: 'INPUT_TOO_LONG', message: 'message must not exceed 10,000 characters', retryable: false },
    })
    return
  }
  const turns: SlateChatTurn[] = []
  if (history !== undefined) {
    if (!Array.isArray(history) || history.length > 20) {
      res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'history must be an array of at most 20 turns', retryable: false },
      })
      return
    }
    for (const turn of history) {
      const role = (turn as SlateChatTurn)?.role
      const text = (turn as SlateChatTurn)?.text
      if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string' || text.length > 12_000) {
        res.status(400).json({
          error: { code: 'INVALID_INPUT', message: 'history turns must be {role, text} with text ≤ 12,000 characters', retryable: false },
        })
        return
      }
      if (text.trim().length > 0) turns.push({ role, text })
    }
  }

  if (!(await getSlateConfig())) {
    res.status(409).json({
      error: { code: 'NOT_ONBOARDED', message: 'Run the setup wizard first', retryable: false },
    })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    await runSlateChat(message, turns, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    })
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
  } catch (err: any) {
    console.error('[slate] Chat error:', err?.status, err?.message ?? err)
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'The slate brain hit an internal error' })}\n\n`)
  }
  res.end()
})

/**
 * POST /api/slate/onboard
 * Body: { path?: string } — defaults to ~/DEVELOPMENT.
 * Creates the canonical folder skeleton (idempotent — existing material is
 * scanned, never touched), saves the location (the KNOWN_FACTS replacement,
 * D2), runs the first scan and starts the watcher.
 */
slateRouter.post('/onboard', csrfCheck, async (req, res) => {
  const raw = typeof req.body?.path === 'string' && req.body.path.trim() ? req.body.path.trim() : '~/DEVELOPMENT'
  const resolved = path.resolve(expandTilde(raw))

  // Guard against filesystem roots and near-roots ("/", "/Users") — the
  // folder lives somewhere in Billy's space, not at the top of the disk.
  if (resolved.split(path.sep).filter(Boolean).length < 2) {
    res.status(400).json({
      error: { code: 'BAD_PATH', message: `"${raw}" is too close to the filesystem root`, retryable: false },
    })
    return
  }
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
    res.status(400).json({
      error: { code: 'BAD_PATH', message: `${resolved} exists and is not a folder`, retryable: false },
    })
    return
  }

  try {
    fs.mkdirSync(resolved, { recursive: true })
    for (const sub of SKELETON) fs.mkdirSync(path.join(resolved, sub), { recursive: true })

    await saveSlateConfig({ devFolderPath: resolved, onboardedAt: new Date().toISOString() })
    const scan = await runSlateScan(resolved)
    startSlateWatcher(resolved)
    void runSlateIngestion(resolved) // background — the response never waits on embeds

    res.json({ data: { status: await buildStatus(), scan } })
  } catch (err) {
    console.error('[slate] Onboarding failed:', (err as Error).message)
    res.status(500).json({
      error: { code: 'ONBOARD_FAILED', message: (err as Error).message, retryable: true },
    })
  }
})

/**
 * POST /api/slate/rescan
 * Manual full rescan of the configured folder.
 */
slateRouter.post('/rescan', csrfCheck, async (_req, res) => {
  try {
    const config = await getSlateConfig()
    if (!config) {
      res.status(409).json({
        error: { code: 'NOT_ONBOARDED', message: 'Run the setup wizard first', retryable: false },
      })
      return
    }
    if (!fs.existsSync(config.devFolderPath)) {
      res.status(409).json({
        error: {
          code: 'FOLDER_UNREACHABLE',
          message: `${config.devFolderPath} is not reachable from this host`,
          retryable: false,
        },
      })
      return
    }
    const scan = await runSlateScan(config.devFolderPath)
    if (!isSlateWatcherActive()) startSlateWatcher(config.devFolderPath)
    void runSlateIngestion(config.devFolderPath) // background
    res.json({ data: { status: await buildStatus(), scan } })
  } catch (err) {
    console.error('[slate] Rescan failed:', (err as Error).message)
    res.status(500).json({
      error: { code: 'RESCAN_FAILED', message: (err as Error).message, retryable: true },
    })
  }
})
