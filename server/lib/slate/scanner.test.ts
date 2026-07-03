import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// The scanner's Firestore sync half needs firebase-admin; the pure disk walk
// under test does not — stub the module so importing it never initializes.
vi.mock('../firebase', () => ({ db: {} }))

import { scanDevelopmentFolder } from './scanner'
import { writeSlateVaultNotes } from './vaultNote'
import type { SlateProject } from '@shared/types'

let root: string

function write(rel: string, content = '') {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

function yamlFor(slug: string, overrides: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    title: slug.toLowerCase(),
    slug,
    format: 'film',
    stage: 'idea',
    origin: 'internal',
    status: 'active',
    ...overrides,
  }
  return Object.entries(base)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-scan-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('scanDevelopmentFolder', () => {
  test('a clean project produces no confirm items and derives the current draft', () => {
    write('LA-CASA/project.yaml', yamlFor('LA-CASA', { stage: 'rewrites' }))
    write('LA-CASA/04-drafts/LA-CASA_v01_2026-05-01.fdx')
    write('LA-CASA/04-drafts/LA-CASA_v03_2026-07-01_polish-pass.fdx')
    write('LA-CASA/04-drafts/LA-CASA_v02_2026-06-01.pdf')
    write('LA-CASA/01-idea/anything goes in here.txt')
    write('LA-CASA/notes/free form too.md')

    const { projects, confirmItems } = scanDevelopmentFolder(root)
    expect(confirmItems).toEqual([])
    expect(projects).toHaveLength(1)
    const p = projects[0]
    expect(p.slug).toBe('LA-CASA')
    expect(p.stage).toBe('rewrites')
    expect(p.current_draft).toMatchObject({ version: 3, date: '2026-07-01', label: 'polish-pass' })
    expect(p.last_touched).toBeTruthy()
    expect(p.unfiled_count).toBe(0)
  })

  test('_external placement forces origin external and queues the inconsistency', () => {
    write('_external/SUBMISSION-X/project.yaml', yamlFor('SUBMISSION-X', { origin: 'internal' }))
    const { projects, confirmItems } = scanDevelopmentFolder(root)
    expect(projects[0].origin).toBe('external')
    expect(confirmItems).toHaveLength(1)
    expect(confirmItems[0].reason).toBe('bad-yaml')
    expect(confirmItems[0].detail).toContain('firewall')
  })

  test('a well-formed external submission is clean', () => {
    write('_external/SUBMISSION-Y/project.yaml', yamlFor('SUBMISSION-Y', { origin: 'external' }))
    const { projects, confirmItems } = scanDevelopmentFolder(root)
    expect(projects[0].origin).toBe('external')
    expect(confirmItems).toEqual([])
  })

  test('_archive placement forces status dead', () => {
    write('_archive/OLD-ONE/project.yaml', yamlFor('OLD-ONE', { status: 'active' }))
    const { projects } = scanDevelopmentFolder(root)
    expect(projects[0].status).toBe('dead')
  })

  test('_inbox drops land in the confirm queue', () => {
    write('_inbox/random script from sundance.pdf')
    write('_inbox/voice memo.txt')
    const { projects, confirmItems } = scanDevelopmentFolder(root)
    expect(projects).toEqual([])
    expect(confirmItems).toHaveLength(2)
    expect(confirmItems.every((i) => i.reason === 'unfiled')).toBe(true)
  })

  test('a project folder without project.yaml is queued, not recorded', () => {
    write('NO-YAML/04-drafts/NO-YAML_v01_2026-01-01.pdf')
    const { projects, confirmItems } = scanDevelopmentFolder(root)
    expect(projects).toEqual([])
    expect(confirmItems).toHaveLength(1)
    expect(confirmItems[0].reason).toBe('missing-yaml')
  })

  test('bad draft names and foreign slugs are queued and counted on the project', () => {
    write('DOSIS/project.yaml', yamlFor('DOSIS'))
    write('DOSIS/04-drafts/draft final FINAL v2.fdx') // breaks convention
    write('DOSIS/04-drafts/OTHER-MOVIE_v01_2026-01-01.fdx') // wrong project
    write('DOSIS/04-drafts/DOSIS_v01_2026-01-01.fdx') // fine
    const { projects, confirmItems } = scanDevelopmentFolder(root)
    expect(projects[0].unfiled_count).toBe(2)
    expect(projects[0].current_draft?.version).toBe(1)
    expect(confirmItems).toHaveLength(2)
    expect(confirmItems.every((i) => i.reason === 'bad-name' && i.project === 'DOSIS')).toBe(true)
  })

  test('loose files in the root and unknown project subfolders are flagged', () => {
    write('stray notes.txt')
    write('EL-JUICIO/project.yaml', yamlFor('EL-JUICIO', { format: 'series', stage: 'bible' }))
    write('EL-JUICIO/random-folder/thing.txt')
    write('EL-JUICIO/loose-in-project.txt')
    const { confirmItems } = scanDevelopmentFolder(root)
    const reasons = confirmItems.map((i) => `${i.reason}:${i.path}`).sort()
    expect(reasons).toEqual([
      'bad-name:EL-JUICIO/loose-in-project.txt',
      'bad-name:EL-JUICIO/random-folder',
      'unfiled:stray notes.txt',
    ])
  })

  test('treatment and coverage naming is enforced in their folders', () => {
    write('DOSIS/project.yaml', yamlFor('DOSIS'))
    write('DOSIS/02-treatment/DOSIS_treatment_v01_2026-02-01.docx') // fine
    write('DOSIS/02-treatment/treatment-notes.docx') // bad
    write('DOSIS/coverage/DOSIS_lemon-coverage_2026-03-01.md') // fine
    write('DOSIS/coverage/coverage.md') // bad
    const { confirmItems } = scanDevelopmentFolder(root)
    expect(confirmItems).toHaveLength(2)
    expect(confirmItems.map((i) => i.path).sort()).toEqual([
      'DOSIS/02-treatment/treatment-notes.docx',
      'DOSIS/coverage/coverage.md',
    ])
  })

  test('hidden files are ignored everywhere', () => {
    write('.DS_Store')
    write('DOSIS/project.yaml', yamlFor('DOSIS'))
    write('DOSIS/04-drafts/.DS_Store')
    const { confirmItems } = scanDevelopmentFolder(root)
    expect(confirmItems).toEqual([])
  })

  test('confirm ids are stable across rescans', () => {
    write('_inbox/thing.pdf')
    const a = scanDevelopmentFolder(root)
    const b = scanDevelopmentFolder(root)
    expect(a.confirmItems[0].id).toBe(b.confirmItems[0].id)
  })
})

describe('writeSlateVaultNotes', () => {
  let vault: string
  const savedEnv = process.env.OBSIDIAN_VAULT_PATH

  beforeEach(() => {
    vault = fs.mkdtempSync(path.join(os.tmpdir(), 'slate-vault-'))
    process.env.OBSIDIAN_VAULT_PATH = vault
  })

  afterEach(() => {
    process.env.OBSIDIAN_VAULT_PATH = savedEnv
    fs.rmSync(vault, { recursive: true, force: true })
  })

  const project: SlateProject = {
    slug: 'LA-CASA',
    title: 'La Casa del Fuego',
    format: 'film',
    stage: 'rewrites',
    origin: 'internal',
    status: 'active',
    logline: 'One line.',
    waiting_on: { who: 'María', what: 'draft 4', since: '2026-06-19' },
  }

  test('writes one note per project and is idempotent', () => {
    expect(writeSlateVaultNotes([project]).written).toBe(1)
    const note = fs.readFileSync(path.join(vault, 'slate', 'LA-CASA.md'), 'utf8')
    expect(note).toContain('# La Casa del Fuego')
    expect(note).toContain('Waiting on:')
    expect(note).toContain('source: development-hell')
    // unchanged content → no rewrite
    expect(writeSlateVaultNotes([project]).written).toBe(0)
  })

  test('removes notes for projects gone from the slate — only inside slate/', () => {
    fs.mkdirSync(path.join(vault, 'slate'), { recursive: true })
    fs.writeFileSync(path.join(vault, 'slate', 'GONE.md'), 'stale')
    fs.writeFileSync(path.join(vault, 'unrelated.md'), 'untouched')
    writeSlateVaultNotes([project])
    expect(fs.existsSync(path.join(vault, 'slate', 'GONE.md'))).toBe(false)
    expect(fs.existsSync(path.join(vault, 'unrelated.md'))).toBe(true)
  })

  test('skips silently when no vault is configured', () => {
    delete process.env.OBSIDIAN_VAULT_PATH
    expect(writeSlateVaultNotes([project]).written).toBe(0)
  })
})
