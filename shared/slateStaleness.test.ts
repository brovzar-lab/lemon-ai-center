import { describe, expect, test } from 'vitest'
import { assessStaleness } from './slateStaleness'
import type { SlateProject } from './types'

const NOW = new Date('2026-07-02T12:00:00Z')

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString()
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

describe('assessStaleness — stage thresholds (spec §5)', () => {
  test.each([
    ['idea', 30],
    ['concept', 30],
    ['treatment', 21],
    ['outline', 21],
    ['draft1', 7],
    ['rewrites', 7],
    ['polish', 7],
    ['market-ready', 10],
  ] as const)('%s → %d days', (stage, threshold) => {
    const a = assessStaleness(project({ stage, last_touched: daysAgo(1) }), NOW)
    expect(a.threshold).toBe(threshold)
    expect(a.clock).toBe('touch')
  })

  test.each([
    ['bible', 21],
    ['pilot-outline', 21],
    ['pilot-draft', 7],
    ['season-arc', 7],
  ] as const)('series %s → %d days', (stage, threshold) => {
    const a = assessStaleness(
      project({ format: 'series', stage, last_touched: daysAgo(1) }),
      NOW,
    )
    expect(a.threshold).toBe(threshold)
  })
})

describe('assessStaleness — levels', () => {
  test('fresh under 70% of threshold', () => {
    const a = assessStaleness(project({ stage: 'idea', last_touched: daysAgo(20) }), NOW)
    expect(a.level).toBe('fresh')
    expect(a.days).toBe(20)
  })

  test('aging at 70%+', () => {
    const a = assessStaleness(project({ stage: 'idea', last_touched: daysAgo(21) }), NOW)
    expect(a.level).toBe('aging')
  })

  test('stale at threshold and beyond', () => {
    const a = assessStaleness(project({ stage: 'rewrites', last_touched: daysAgo(7) }), NOW)
    expect(a.level).toBe('stale')
    expect(a.ratio).toBeGreaterThanOrEqual(1)
  })
})

describe('assessStaleness — waiting_on state', () => {
  test('out to a writer → 14 days, clocked from since', () => {
    const a = assessStaleness(
      project({
        stage: 'rewrites',
        last_touched: daysAgo(0),
        writers: [{ name: 'María González' }],
        waiting_on: { who: 'María González', what: 'draft 4', since: daysAgo(13) },
      }),
      NOW,
    )
    expect(a.clock).toBe('waiting')
    expect(a.threshold).toBe(14)
    expect(a.days).toBe(13)
    expect(a.level).toBe('aging')
  })

  test('out to anyone else (buyer/platform) → 10 days', () => {
    const a = assessStaleness(
      project({
        stage: 'market-ready',
        writers: [{ name: 'María González' }],
        waiting_on: { who: 'Apple TV+', what: 'pass/buy decision', since: daysAgo(11) },
      }),
      NOW,
    )
    expect(a.threshold).toBe(10)
    expect(a.level).toBe('stale')
  })

  test('future since clamps to 0 days', () => {
    const a = assessStaleness(
      project({ waiting_on: { who: 'A', what: 'b', since: daysAgo(-3) } }),
      NOW,
    )
    expect(a.days).toBe(0)
  })
})

describe('assessStaleness — overrides and exclusions', () => {
  test('staleness_days beats the stage default', () => {
    const a = assessStaleness(
      project({ stage: 'idea', staleness_days: 5, last_touched: daysAgo(6) }),
      NOW,
    )
    expect(a.threshold).toBe(5)
    expect(a.level).toBe('stale')
  })

  test('staleness_days beats the waiting_on threshold, clock stays waiting', () => {
    const a = assessStaleness(
      project({
        staleness_days: 3,
        waiting_on: { who: 'A', what: 'b', since: daysAgo(4) },
      }),
      NOW,
    )
    expect(a.threshold).toBe(3)
    expect(a.clock).toBe('waiting')
    expect(a.level).toBe('stale')
  })

  test('paused projects are excluded', () => {
    const a = assessStaleness(project({ status: 'paused', last_touched: daysAgo(90) }), NOW)
    expect(a.excluded).toBe(true)
    expect(a.level).toBe('fresh')
  })

  test('dead projects are excluded', () => {
    expect(assessStaleness(project({ status: 'dead' }), NOW).excluded).toBe(true)
  })

  test('no last_touched falls back to updated_at, then to 0 days', () => {
    const a = assessStaleness(project({ updated_at: daysAgo(8), stage: 'rewrites' }), NOW)
    expect(a.days).toBe(8)
    const b = assessStaleness(project({ stage: 'rewrites' }), NOW)
    expect(b.days).toBe(0)
  })
})
