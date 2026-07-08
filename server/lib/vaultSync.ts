import { execSync, exec } from 'child_process'
import path from 'path'
import fs from 'fs'

const VAULT_DIR = path.join(process.cwd(), 'vault')
const SYNC_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

// OBSIDIAN_VAULT_GIT_URL embeds a PAT (x-access-token:<token>@...) and child_process
// errors echo the full command + stderr, so anything from git must be redacted
// before it reaches the logs (CLAUDE.md: never log access tokens).
const URL_USERINFO = /\/\/[^@/\s]+@/g
const GITHUB_PAT = /github_pat_[A-Za-z0-9_]+/g

function redactSecrets(text: string): string {
  return text.replace(URL_USERINFO, '//***@').replace(GITHUB_PAT, 'github_pat_***')
}

function describeGitError(err: unknown): string {
  const e = err as { message?: string; stderr?: unknown } | null
  const message = e?.message ?? String(err)
  const stderr = e?.stderr == null ? '' : String(e.stderr)
  return redactSecrets([message, stderr].filter(Boolean).join('\n'))
}

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
    console.error('[vault-sync] Failed to clone/pull vault:', describeGitError(err))
    return null
  }

  // Schedule periodic pulls
  setInterval(() => {
    exec('git pull --rebase --quiet', { cwd: VAULT_DIR, timeout: 60_000 }, (err) => {
      if (err) {
        console.warn('[vault-sync] Pull failed:', describeGitError(err))
      } else {
        console.log('[vault-sync] Pulled latest vault changes')
      }
    })
  }, SYNC_INTERVAL_MS)

  // Override the env var so the rest of the app uses the cloned vault
  process.env.OBSIDIAN_VAULT_PATH = VAULT_DIR
  return VAULT_DIR
}
