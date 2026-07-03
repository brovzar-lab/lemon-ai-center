import { Router } from 'express'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { requireAuth } from '../middleware/requireAuth'
import { csrfCheck } from '../middleware/csrfCheck'
import { getSlateCounts, listSlateConfirmItems, listSlateProjects } from '../lib/slate'
import { getSlateConfig, saveSlateConfig } from '../lib/slate/config'
import { runSlateScan } from '../lib/slate/scanner'
import { isSlateWatcherActive, startSlateWatcher } from '../lib/slate/watcher'
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
  return {
    onboarded: true,
    devFolderPath: config.devFolderPath,
    folderAccessible: fs.existsSync(config.devFolderPath),
    watcherActive: isSlateWatcherActive(),
    projectCount: counts.projects,
    confirmCount: counts.confirm,
    ...(config.lastScanAt ? { lastScanAt: config.lastScanAt } : {}),
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
    res.json({ data: { status: await buildStatus(), scan } })
  } catch (err) {
    console.error('[slate] Rescan failed:', (err as Error).message)
    res.status(500).json({
      error: { code: 'RESCAN_FAILED', message: (err as Error).message, retryable: true },
    })
  }
})
