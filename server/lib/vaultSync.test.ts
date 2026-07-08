import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { inspect } from 'util'
import { initVaultSync } from './vaultSync'

const execSyncMock = vi.fn()
const execMock = vi.fn()
vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => execSyncMock(...args),
  exec: (...args: unknown[]) => execMock(...args),
}))

const existsSyncMock = vi.fn()
vi.mock('fs', () => ({
  default: {
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
    mkdirSync: vi.fn(),
  },
}))

const TOKEN = 'github_pat_TESTSECRET1234567890abcdefFAKE'
const GIT_URL = `https://x-access-token:${TOKEN}@github.com/brovzar-lab/obsidian-brain.git`

const savedGitUrl = process.env.OBSIDIAN_VAULT_GIT_URL
const savedVaultPath = process.env.OBSIDIAN_VAULT_PATH

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  process.env.OBSIDIAN_VAULT_GIT_URL = GIT_URL
  execSyncMock.mockReset()
  execMock.mockReset()
  existsSyncMock.mockReset()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  process.env.OBSIDIAN_VAULT_GIT_URL = savedGitUrl
  process.env.OBSIDIAN_VAULT_PATH = savedVaultPath
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Everything a console call would print, formatted the way console formats it. */
function loggedText(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls
    .flat()
    .map((arg) => (typeof arg === 'string' ? arg : inspect(arg)))
    .join('\n')
}

/** Error shaped like a child_process execSync/exec failure: command in message, git output in stderr. */
function gitError(cmd: string, stderrText: string): Error {
  const err = new Error(`Command failed: ${cmd}\n${stderrText}`) as Error & {
    cmd: string
    stderr: Buffer
    status: number
  }
  err.cmd = cmd
  err.stderr = Buffer.from(stderrText)
  err.status = 128
  return err
}

test('failed clone logs no credentials but keeps the repo host visible', () => {
  existsSyncMock.mockReturnValue(false) // no vault/.git -> clone path
  execSyncMock.mockImplementation(() => {
    throw gitError(
      `git clone --depth 1 "${GIT_URL}" "/app/vault"`,
      `fatal: could not read Password for 'https://x-access-token:${TOKEN}@github.com'`
    )
  })

  expect(initVaultSync()).toBeNull()

  const logged = loggedText(errorSpy)
  expect(logged).toContain('[vault-sync] Failed')
  expect(logged).toContain('github.com/brovzar-lab/obsidian-brain.git')
  expect(logged).not.toContain(TOKEN)
  expect(logged).not.toContain('github_pat_TESTSECRET')
  expect(logged).not.toContain('x-access-token:g')
})

test('failed boot-time pull logs no credentials', () => {
  existsSyncMock.mockReturnValue(true) // vault/.git present -> pull path
  execSyncMock.mockImplementation(() => {
    throw gitError(
      'git pull --rebase --quiet',
      `fatal: unable to access '${GIT_URL}/': The requested URL returned error: 403`
    )
  })

  expect(initVaultSync()).toBeNull()

  const logged = loggedText(errorSpy)
  expect(logged).toContain('[vault-sync] Failed')
  expect(logged).not.toContain(TOKEN)
})

test('failed periodic pull logs no credentials', () => {
  vi.useFakeTimers()
  existsSyncMock.mockReturnValue(true)
  execSyncMock.mockReturnValue(Buffer.from('')) // boot pull succeeds
  execMock.mockImplementation((_cmd: string, _opts: unknown, cb: (err: Error | null) => void) => {
    cb(
      gitError(
        'git pull --rebase --quiet',
        `fatal: unable to access '${GIT_URL}/': The requested URL returned error: 403`
      )
    )
  })

  expect(initVaultSync()).not.toBeNull()
  vi.advanceTimersByTime(30 * 60 * 1000)

  expect(execMock).toHaveBeenCalledTimes(1)
  const logged = loggedText(warnSpy)
  expect(logged).toContain('[vault-sync] Pull failed')
  expect(logged).not.toContain(TOKEN)
})
