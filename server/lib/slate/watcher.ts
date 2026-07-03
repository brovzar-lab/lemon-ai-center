import chokidar, { FSWatcher } from 'chokidar'
import fs from 'fs'
import { getSlateConfig } from './config'
import { runSlateScan } from './scanner'
import { initSlateIndex, runSlateIngestion } from './ingest'

/**
 * Watches the DEVELOPMENT/ folder and rescans on change (D4 local mode —
 * when AI CENTER runs on the Mac the module watches the folder directly;
 * on Railway the path doesn't exist and this quietly stays off until the
 * ingest daemon lands in a later milestone).
 *
 * A change triggers a debounced full rescan: the scan is the single writer
 * of slate state, so there is exactly one code path from disk to Firestore.
 */

let watcher: FSWatcher | null = null
let watchedPath: string | null = null
let debounceTimer: NodeJS.Timeout | null = null
let scanning = false
let scanQueued = false

const DEBOUNCE_MS = 1200

export function isSlateWatcherActive(): boolean {
  return watcher !== null
}

async function scanNow(root: string): Promise<void> {
  if (scanning) {
    scanQueued = true
    return
  }
  scanning = true
  try {
    await runSlateScan(root)
    void runSlateIngestion(root) // background — never blocks the scan loop
  } catch (err) {
    console.error('[slate] Watch-triggered scan failed:', (err as Error).message)
  } finally {
    scanning = false
    if (scanQueued) {
      scanQueued = false
      void scanNow(root)
    }
  }
}

export function startSlateWatcher(root: string): void {
  stopSlateWatcher()
  watchedPath = root
  watcher = chokidar.watch(root, {
    ignored: /(^|[/\\])\./, // hidden files/dirs (.DS_Store, .git)
    persistent: true,
    ignoreInitial: true, // onboarding/boot runs its own initial scan
    awaitWriteFinish: {
      stabilityThreshold: 800, // let exports/copies finish writing
      pollInterval: 100,
    },
  })

  watcher.on('all', () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void scanNow(root), DEBOUNCE_MS)
  })
  watcher.on('error', (err) => {
    console.error('[slate] Watcher error:', (err as Error).message)
  })

  console.log(`[slate] Watching ${root}`)
}

export function stopSlateWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (watcher) {
    void watcher.close()
    watcher = null
    console.log(`[slate] Stopped watching ${watchedPath}`)
  }
  watchedPath = null
}

/**
 * Boot hook: if the module is onboarded and the folder is reachable from
 * this process, scan once (catch up on changes made while the server was
 * down) and start watching.
 */
export async function initSlateWatcher(): Promise<void> {
  try {
    const config = await getSlateConfig()
    if (!config) {
      console.log('[slate] Not onboarded yet — watcher idle')
      return
    }
    // Hydrate the search index regardless of folder reachability — on
    // Railway the folder is absent but the index still serves queries.
    await initSlateIndex()
    if (!fs.existsSync(config.devFolderPath)) {
      console.log(`[slate] DEVELOPMENT folder not reachable from this host (${config.devFolderPath}) — watcher off`)
      return
    }
    await scanNow(config.devFolderPath)
    startSlateWatcher(config.devFolderPath)
  } catch (err) {
    console.error('[slate] Failed to init watcher:', (err as Error).message)
  }
}
