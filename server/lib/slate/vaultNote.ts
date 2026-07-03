import fs from 'fs'
import path from 'path'
import type { SlateProject } from '@shared/types'

/**
 * The vault half of the KNOWN_FACTS replacement (D2): one markdown status
 * note per project, written into the OBSIDIAN BRAIN vault under slate/.
 * The existing FlexSearch brain and the seedFromVault engine job pick these
 * up natively — slate facts become brain facts with zero extra plumbing.
 *
 * Writes are content-diffed so unchanged scans do not churn the vault (it
 * is a git repo Billy syncs). Notes for projects gone from disk are removed
 * — but only inside our own slate/ folder; the module never touches
 * anything else in the vault.
 */

function renderNote(p: SlateProject): string {
  const lines: string[] = [
    '---',
    `slug: ${p.slug}`,
    `format: ${p.format}`,
    `stage: ${p.stage}`,
    `status: ${p.status}`,
    `origin: ${p.origin}`,
    ...(p.priority ? [`priority: ${p.priority}`] : []),
    ...(p.last_touched ? [`last_touched: ${p.last_touched.slice(0, 10)}`] : []),
    'source: development-hell',
    '---',
    '',
    `# ${p.title}`,
    '',
  ]
  if (p.logline) lines.push(p.logline.trim(), '')
  const facts: string[] = [
    `- **Stage:** ${p.stage} (${p.format})${p.status !== 'active' ? ` — ${p.status}` : ''}`,
  ]
  if (p.current_draft) {
    facts.push(
      `- **Current draft:** v${String(p.current_draft.version).padStart(2, '0')}${
        p.current_draft.ep ? ` ep${p.current_draft.ep}` : ''
      }${p.current_draft.date ? ` (${p.current_draft.date})` : ''}`,
    )
  }
  if (p.writers?.length) facts.push(`- **Writers:** ${p.writers.map((w) => w.name).join(', ')}`)
  if (p.waiting_on) {
    facts.push(`- **Waiting on:** ${p.waiting_on.who} — ${p.waiting_on.what} (since ${p.waiting_on.since})`)
  }
  if (p.targets?.length) facts.push(`- **Targets:** ${p.targets.join(', ')}`)
  if (p.deadlines?.length) {
    facts.push(`- **Deadlines:** ${p.deadlines.map((d) => `${d.what} (${d.date})`).join('; ')}`)
  }
  if (p.origin === 'external') facts.push('- **External material** — firewalled from internal creative work')
  if (p.unfiled_count) facts.push(`- **Unfiled material:** ${p.unfiled_count} item(s) awaiting confirmation`)
  lines.push(...facts, '')
  if (p.notes) lines.push(p.notes.trim(), '')
  return lines.join('\n')
}

export function writeSlateVaultNotes(projects: SlateProject[]): { written: number } {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH
  if (!vaultPath || !fs.existsSync(vaultPath)) return { written: 0 }

  const dir = path.join(vaultPath, 'slate')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    console.warn('[slate] Vault not writable, skipping status notes:', (err as Error).message)
    return { written: 0 }
  }

  let written = 0
  const want = new Set(projects.map((p) => `${p.slug}.md`))

  for (const p of projects) {
    const file = path.join(dir, `${p.slug}.md`)
    const next = renderNote(p)
    let current: string | null = null
    try {
      current = fs.readFileSync(file, 'utf8')
    } catch {
      /* new note */
    }
    if (current !== next) {
      fs.writeFileSync(file, next)
      written++
    }
  }

  // Tidy our own folder: drop notes for projects no longer on the slate.
  for (const existing of fs.readdirSync(dir)) {
    if (existing.endsWith('.md') && !want.has(existing)) {
      fs.unlinkSync(path.join(dir, existing))
    }
  }

  return { written }
}
