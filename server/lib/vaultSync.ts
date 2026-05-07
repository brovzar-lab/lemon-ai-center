import { execSync, exec } from 'child_process'
import path from 'path'
import fs from 'fs'

const VAULT_DIR = path.join(process.cwd(), 'vault')
const SYNC_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Clone the Obsidian vault from GitHub at server startup.
 * Runs `git pull` every 30 minutes to stay current.
 * Only activates when OBSIDIAN_VAULT_GIT_URL is set (i.e. on Railway, not local).
 */
export function initVaultSync(): string | null {
  const gitUrl = process.env.OBSIDIAN_VAULT_GIT_URL
  if (!gitUrl) {
    // Local dev — vault is already on disk
    return process.env.OBSIDIAN_VAULT_PATH || null
  }

  try {
    if (fs.existsSync(path.join(VAULT_DIR, '.git'))) {
      console.log('[vault-sync] Vault already cloned, pulling latest...')
      execSync('git pull --rebase --quiet', { cwd: VAULT_DIR, timeout: 60_000 })
    } else {
      console.log('[vault-sync] Cloning vault from GitHub (shallow)...')
      fs.mkdirSync(VAULT_DIR, { recursive: true })
      execSync(`git clone --depth 1 "${gitUrl}" "${VAULT_DIR}"`, { timeout: 120_000 })
    }
    console.log(`[vault-sync] Vault ready at ${VAULT_DIR}`)
  } catch (err) {
    console.error('[vault-sync] Failed to clone/pull vault:', err)
    return null
  }

  // Schedule periodic pulls
  setInterval(() => {
    exec('git pull --rebase --quiet', { cwd: VAULT_DIR, timeout: 60_000 }, (err) => {
      if (err) {
        console.warn('[vault-sync] Pull failed:', err.message)
      } else {
        console.log('[vault-sync] Pulled latest vault changes')
      }
    })
  }, SYNC_INTERVAL_MS)

  // Override the env var so the rest of the app uses the cloned vault
  process.env.OBSIDIAN_VAULT_PATH = VAULT_DIR
  return VAULT_DIR
}
