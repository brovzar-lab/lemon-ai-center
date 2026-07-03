import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SlateBoard } from '@/components/workspace/SlateBoard'
import type { SlateProject } from '@shared/types'

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

function project(overrides: Partial<SlateProject>): SlateProject {
  return {
    slug: 'X',
    title: 'x',
    format: 'film',
    stage: 'idea',
    origin: 'internal',
    status: 'active',
    ...overrides,
  }
}

const FIXTURE: SlateProject[] = [
  project({
    slug: 'LA-CASA',
    title: 'La Casa del Fuego',
    stage: 'rewrites',
    priority: 'A',
    last_touched: daysAgo(1),
    current_draft: { version: 3, date: '2026-07-01', file: '04-drafts/x.fdx' },
    writers: [{ name: 'María González' }],
    waiting_on: { who: 'María González', what: 'draft 4', since: daysAgo(13) },
  }),
  project({
    slug: 'DOSIS',
    title: 'Dosis',
    stage: 'idea',
    last_touched: daysAgo(45), // stale (30-day idea clock)
  }),
  project({
    slug: 'EL-JUICIO',
    title: 'El Juicio',
    format: 'series',
    stage: 'pilot-draft',
    last_touched: daysAgo(1),
  }),
  project({
    slug: 'LA-SUBMISSION',
    title: 'La Submission',
    stage: 'draft1',
    origin: 'external',
    last_touched: daysAgo(1),
  }),
  project({
    slug: 'EN-PAUSA',
    title: 'En Pausa',
    stage: 'treatment',
    status: 'paused',
    last_touched: daysAgo(200),
  }),
  project({
    slug: 'MUERTO',
    title: 'Proyecto Muerto',
    stage: 'polish',
    status: 'dead',
  }),
]

describe('SlateBoard', () => {
  test('renders film and series lanes with their stage columns', () => {
    render(<SlateBoard projects={FIXTURE} />)
    expect(screen.getByLabelText('Film lane')).toBeInTheDocument()
    expect(screen.getByLabelText('Series lane')).toBeInTheDocument()
    // film-only and series-only stages present; shared stages once per lane
    expect(screen.getByText('Polish')).toBeInTheDocument()
    expect(screen.getByText('Season Arc')).toBeInTheDocument()
    expect(screen.getAllByText('Market-Ready')).toHaveLength(2)
  })

  test('cards carry priority, draft version and waiting-on', () => {
    render(<SlateBoard projects={FIXTURE} />)
    const casa = screen.getByLabelText('La Casa del Fuego')
    expect(casa).toHaveTextContent('A')
    expect(casa).toHaveTextContent('v03')
    expect(casa).toHaveTextContent(/Waiting on María González · 13d/)
  })

  test('stale projects get the coral heat chip', () => {
    render(<SlateBoard projects={FIXTURE} />)
    const dosis = screen.getByLabelText('Dosis')
    expect(dosis).toHaveTextContent('stale · 45d')
  })

  test('external material is badged', () => {
    render(<SlateBoard projects={FIXTURE} />)
    expect(screen.getByLabelText('La Submission')).toHaveTextContent('Ext')
  })

  test('paused projects show the chip and no heat', () => {
    render(<SlateBoard projects={FIXTURE} />)
    const paused = screen.getByLabelText('En Pausa')
    expect(paused).toHaveTextContent('Paused')
    expect(paused).not.toHaveTextContent('stale')
    expect(paused).not.toHaveTextContent('200d')
  })

  test('dead projects never reach the board', () => {
    render(<SlateBoard projects={FIXTURE} />)
    expect(screen.queryByLabelText('Proyecto Muerto')).not.toBeInTheDocument()
  })

  test('a lane without projects does not render', () => {
    render(<SlateBoard projects={[FIXTURE[1]]} />) // one film project only
    expect(screen.getByLabelText('Film lane')).toBeInTheDocument()
    expect(screen.queryByLabelText('Series lane')).not.toBeInTheDocument()
  })
})
