import chokidar, { FSWatcher } from 'chokidar'
import path from 'path'
import type { BrainEngine } from './index'

/**
 * Watches the Obsidian vault for file changes and updates the brain index.
 * Uses chokidar for cross-platform reliability.
 */
export function startVaultWatcher(vaultRoot: string, brain: BrainEngine): FSWatcher {
  const watcher = chokidar.watch(vaultRoot, {
    ignored: [
      /(^|[/\\])\./,          // hidden files/dirs (.obsidian, .git)
      '**/node_modules/**',
    ],
    persistent: true,
    ignoreInitial: true,       // we already scanned on startup
    awaitWriteFinish: {
      stabilityThreshold: 300, // wait for write to finish
      pollInterval: 100,
    },
  })

  let debounceTimer: NodeJS.Timeout | null = null
  const pending = new Map<string, 'add' | 'change' | 'unlink'>()

  // Debounce: batch rapid changes (e.g. git pull) into a single update
  function scheduleFlush() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      for (const [filePath, action] of pending) {
        if (!filePath.endsWith('.md')) continue
        const relPath = path.relative(vaultRoot, filePath)
        if (action === 'unlink') {
          brain.removeDocument(relPath)
          console.log(`[brain] Removed: ${relPath}`)
        } else {
          brain.updateDocument(filePath)
          console.log(`[brain] ${action === 'add' ? 'Added' : 'Updated'}: ${relPath}`)
        }
      }
      pending.clear()
    }, 500)
  }

  watcher
    .on('add', (filePath) => {
      if (!filePath.endsWith('.md')) return
      pending.set(filePath, 'add')
      scheduleFlush()
    })
    .on('change', (filePath) => {
      if (!filePath.endsWith('.md')) return
      pending.set(filePath, 'change')
      scheduleFlush()
    })
    .on('unlink', (filePath) => {
      if (!filePath.endsWith('.md')) return
      pending.set(filePath, 'unlink')
      scheduleFlush()
    })
    .on('error', (err) => {
      console.error('[brain] Watcher error:', err)
    })

  console.log(`[brain] Watching vault: ${vaultRoot}`)
  return watcher
}
