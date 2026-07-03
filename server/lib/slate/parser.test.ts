import { describe, expect, test } from 'vitest'
import {
  parseCoverageFilename,
  parseDocFilename,
  parseDraftFilename,
  parseProjectYaml,
} from './parser'

describe('parseDraftFilename', () => {
  test('parses the canonical example from the structure doc', () => {
    expect(parseDraftFilename('LA-CASA-DEL-FUEGO_v03_2026-07-01_polish-pass.fdx')).toEqual({
      slug: 'LA-CASA-DEL-FUEGO',
      version: 3,
      date: '2026-07-01',
      label: 'polish-pass',
      ext: 'fdx',
    })
  })

  test('same version may exist in multiple formats', () => {
    for (const ext of ['fdx', 'pdf', 'fountain', 'docx', 'md', 'txt']) {
      expect(parseDraftFilename(`LA-CASA-DEL-FUEGO_v03_2026-07-01.${ext}`)?.ext).toBe(ext)
    }
  })

  test('label is optional', () => {
    expect(parseDraftFilename('DOSIS_v01_2026-01-15.pdf')).toEqual({
      slug: 'DOSIS',
      version: 1,
      date: '2026-01-15',
      ext: 'pdf',
    })
  })

  test('TV episodes add _ep<NN> after the version', () => {
    expect(parseDraftFilename('EL-JUICIO_v02_ep03_2026-05-10.fdx')).toEqual({
      slug: 'EL-JUICIO',
      version: 2,
      ep: 3,
      date: '2026-05-10',
      ext: 'fdx',
    })
  })

  test('rejects files that break the convention', () => {
    expect(parseDraftFilename('la-casa_v03_2026-07-01.fdx')).toBeNull() // lowercase slug
    expect(parseDraftFilename('LA-CASA_draft3.fdx')).toBeNull() // no version scheme
    expect(parseDraftFilename('LA-CASA_v03_2026-07-01.final')).toBeNull() // bad extension
    expect(parseDraftFilename('LA-CASA_v03_07-01-2026.fdx')).toBeNull() // wrong date order
    expect(parseDraftFilename('notes.txt')).toBeNull()
  })
})

describe('parseDocFilename', () => {
  test('parses treatments, synopses, outlines, bibles', () => {
    expect(parseDocFilename('DOSIS_treatment_v02_2026-03-01.docx')).toEqual({
      slug: 'DOSIS',
      kind: 'treatment',
      version: 2,
      date: '2026-03-01',
      ext: 'docx',
    })
    expect(parseDocFilename('EL-JUICIO_bible_v01_2026-02-11.pdf')?.kind).toBe('bible')
  })

  test('rejects unknown kinds and draft-style names', () => {
    expect(parseDocFilename('DOSIS_beatsheet_v02_2026-03-01.docx')).toBeNull()
    expect(parseDocFilename('DOSIS_v02_2026-03-01.docx')).toBeNull()
  })
})

describe('parseCoverageFilename', () => {
  test('parses the module-written coverage name', () => {
    expect(parseCoverageFilename('LA-CASA-DEL-FUEGO_lemon-coverage_2026-07-03.md')).toEqual({
      slug: 'LA-CASA-DEL-FUEGO',
      skill: 'lemon-coverage',
      date: '2026-07-03',
    })
  })

  test('coverage is markdown only', () => {
    expect(parseCoverageFilename('LA-CASA_lemon-coverage_2026-07-03.pdf')).toBeNull()
  })
})

const GOOD_YAML = `
title: La Casa del Fuego
slug: LA-CASA-DEL-FUEGO
format: film
stage: rewrites
origin: internal
status: active
priority: A
language: es
logline: >
  One line the scanner surfaces everywhere.
writers:
  - name: María González
    contact: maria@example.com
    language: es
waiting_on:
  who: María González
  what: draft 4 with act-two notes addressed
  since: 2026-06-19
targets:
  - Apple TV+
  - Netflix LatAm
deadlines:
  - date: 2026-08-15
    what: submission window for Morelia lab
staleness_days: 10
notes: >
  Free text the brain reads for context.
`

describe('parseProjectYaml', () => {
  test('parses the full schema example without problems', () => {
    const { project, problems } = parseProjectYaml(GOOD_YAML, 'LA-CASA-DEL-FUEGO')
    expect(problems).toEqual([])
    expect(project.slug).toBe('LA-CASA-DEL-FUEGO')
    expect(project.title).toBe('La Casa del Fuego')
    expect(project.format).toBe('film')
    expect(project.stage).toBe('rewrites')
    expect(project.priority).toBe('A')
    expect(project.writers).toEqual([
      { name: 'María González', contact: 'maria@example.com', language: 'es' },
    ])
    expect(project.waiting_on).toEqual({
      who: 'María González',
      what: 'draft 4 with act-two notes addressed',
      since: '2026-06-19',
    })
    expect(project.targets).toEqual(['Apple TV+', 'Netflix LatAm'])
    expect(project.deadlines).toEqual([{ date: '2026-08-15', what: 'submission window for Morelia lab' }])
    expect(project.staleness_days).toBe(10)
  })

  test('only six fields are required', () => {
    const { problems } = parseProjectYaml(
      'title: Dosis\nslug: DOSIS\nformat: film\nstage: idea\norigin: internal\nstatus: active\n',
      'DOSIS',
    )
    expect(problems).toEqual([])
  })

  test('flags a slug/folder mismatch — folder name wins', () => {
    const { project, problems } = parseProjectYaml(
      'title: X\nslug: OTHER-NAME\nformat: film\nstage: idea\norigin: internal\nstatus: active\n',
      'REAL-NAME',
    )
    expect(project.slug).toBe('REAL-NAME')
    expect(problems.some((p) => p.includes('does not match folder name'))).toBe(true)
  })

  test('flags a series stage on a film project', () => {
    const { problems } = parseProjectYaml(
      'title: X\nslug: X\nformat: film\nstage: pilot-draft\norigin: internal\nstatus: active\n',
      'X',
    )
    expect(problems.some((p) => p.includes('not a film stage'))).toBe(true)
  })

  test('accepts series stages on series projects', () => {
    const { problems } = parseProjectYaml(
      'title: X\nslug: X\nformat: series\nstage: pilot-draft\norigin: internal\nstatus: active\n',
      'X',
    )
    expect(problems).toEqual([])
  })

  test('collects missing required fields as problems, still returns a usable project', () => {
    const { project, problems } = parseProjectYaml('title: Just a title\n', 'SOME-PROJECT')
    expect(problems.length).toBeGreaterThanOrEqual(4) // slug, format, stage-ish, origin, status
    expect(project.slug).toBe('SOME-PROJECT')
    expect(project.status).toBe('active')
  })

  test('throws on YAML that is not a mapping', () => {
    expect(() => parseProjectYaml('- just\n- a\n- list\n', 'X')).toThrow()
  })

  test('yaml date values normalize to YYYY-MM-DD', () => {
    const { project, problems } = parseProjectYaml(
      'title: X\nslug: X\nformat: film\nstage: idea\norigin: internal\nstatus: active\nwaiting_on:\n  who: A\n  what: B\n  since: 2026-06-19\n',
      'X',
    )
    expect(problems).toEqual([])
    expect(project.waiting_on?.since).toBe('2026-06-19')
  })
})
