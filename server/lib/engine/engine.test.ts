import { describe, it, expect } from 'vitest'
import { detectSlips } from './slips'
import { scoreBurnout } from './burnout'
import { rankFronts, committedMXN } from './ranker'
import type { RankerInput } from './ranker'
import type { Investor, Script, Deadline, LemonDeal, LemonDelegation } from '@shared/types'

const NOW = new Date('2026-06-12T12:00:00Z')

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10)

describe('detectSlips', () => {
  it('flags overdue delegations, escalating at 3 days', () => {
    const delegations: LemonDelegation[] = [
      { id: 'a', person: 'Erica', task: 'budget v4', status: 'pending', expected_by: daysAgo(4).slice(0, 10) },
      { id: 'b', person: 'Isaac', task: 'coverage', status: 'pending', expected_by: daysAgo(1).slice(0, 10) },
      { id: 'c', person: 'Patrik', task: 'done thing', status: 'completed', expected_by: daysAgo(9).slice(0, 10) },
      { id: 'd', person: 'Mirna', task: 'future thing', status: 'pending', expected_by: daysAhead(2) },
    ]
    const slips = detectSlips({ delegations, deals: [], scripts: [], deadlines: [] }, NOW)
    expect(slips).toHaveLength(2)
    expect(slips.find((s) => s.refId === 'a')?.severity).toBe('critical')
    expect(slips.find((s) => s.refId === 'b')?.severity).toBe('warn')
  })

  it('flags stalled deals after 7 idle days but ignores closed deals', () => {
    const deals: LemonDeal[] = [
      { id: 'd1', name: 'Spain JV', status: 'active', updated_at: daysAgo(10) },
      { id: 'd2', name: 'Fresh deal', status: 'active', updated_at: daysAgo(2) },
      { id: 'd3', name: 'Old closed', status: 'closed', updated_at: daysAgo(40) },
    ]
    const slips = detectSlips({ delegations: [], deals, scripts: [], deadlines: [] }, NOW)
    expect(slips.map((s) => s.refId)).toEqual(['d1'])
  })

  it('flags stale scripts after 14 days, critical at 28', () => {
    const scripts: Script[] = [
      { id: 's1', title: 'Matadero', stage: 'draft', lastTouchedAt: daysAgo(21) },
      { id: 's2', title: 'Papá en la Luna', stage: 'draft', lastTouchedAt: daysAgo(3) },
      { id: 's3', title: 'Sola', stage: 'draft', lastTouchedAt: daysAgo(30) },
      { id: 's4', title: 'Done', stage: 'delivered', lastTouchedAt: daysAgo(90) },
    ]
    const slips = detectSlips({ delegations: [], deals: [], scripts, deadlines: [] }, NOW)
    expect(slips.find((s) => s.refId === 's1')?.severity).toBe('warn')
    expect(slips.find((s) => s.refId === 's3')?.severity).toBe('critical')
    expect(slips.find((s) => s.refId === 's2')).toBeUndefined()
    expect(slips.find((s) => s.refId === 's4')).toBeUndefined()
  })

  it('flags deadlines within 30d, hard ones critical within 7d, sorted critical-first', () => {
    const deadlines: Deadline[] = [
      { id: 'x1', title: 'Oxido Year-2 funding', date: daysAhead(5), severity: 'hard' },
      { id: 'x2', title: 'Festival entry', date: daysAhead(20), severity: 'soft' },
      { id: 'x3', title: 'Far away', date: daysAhead(200), severity: 'hard' },
    ]
    const slips = detectSlips({ delegations: [], deals: [], scripts: [], deadlines }, NOW)
    expect(slips).toHaveLength(2)
    expect(slips[0].refId).toBe('x1')
    expect(slips[0].severity).toBe('critical')
  })
})

describe('scoreBurnout', () => {
  it('scores a calm day low', () => {
    const day = scoreBurnout({
      date: '2026-06-12', meetingHours: 2, lateNightEmails: 0,
      weekendActive: false, daysSinceBreak: 1, writingMinutesWeek: 120,
    })
    expect(day.score).toBe(14)
  })

  it('scores a brutal stretch high and clamps at 100', () => {
    const day = scoreBurnout({
      date: '2026-06-12', meetingHours: 10, lateNightEmails: 6,
      weekendActive: true, daysSinceBreak: 14, writingMinutesWeek: 0,
    })
    expect(day.score).toBe(100)
  })

  it('adds the no-writing penalty only when the week is empty', () => {
    const base = { date: '2026-06-12', meetingHours: 4, lateNightEmails: 0, weekendActive: false, daysSinceBreak: 2 }
    expect(scoreBurnout({ ...base, writingMinutesWeek: 0 }).score
      - scoreBurnout({ ...base, writingMinutesWeek: 30 }).score).toBe(15)
  })
})

describe('rankFronts', () => {
  const investors: Investor[] = [
    { id: 'i1', name: 'GBM', stage: 'committed', amountMXN: 120_000_000 },
    { id: 'i2', name: 'Cinépolis', stage: 'docs', amountMXN: 60_000_000, lastTouch: daysAgo(8) },
    { id: 'i3', name: 'Passed Fund', stage: 'passed', amountMXN: 50_000_000 },
  ]

  it('sums only committed investors', () => {
    expect(committedMXN(investors)).toBe(120_000_000)
  })

  const base: RankerInput = {
    investors,
    fundState: { targetMXN: 300_000_000 },
    scripts: [],
    deadlines: [],
    slips: [],
    projects: [],
    deals: [],
    burnout: null,
    ventures: [],
  }

  it('returns all five fronts with consecutive ranks', () => {
    const fronts = rankFronts(base, NOW)
    expect(fronts).toHaveLength(5)
    expect(fronts.map((f) => f.rank)).toEqual([1, 2, 3, 4, 5])
    expect(new Set(fronts.map((f) => f.key)).size).toBe(5)
  })

  it('puts the fund first when investors are in docs and stale', () => {
    const fronts = rankFronts(base, NOW)
    expect(fronts[0].key).toBe('fund')
    expect(fronts[0].headline).toContain('40%')
  })

  it('escalates the you front when burnout is high', () => {
    const fronts = rankFronts(
      {
        ...base,
        burnout: {
          date: '2026-06-12', meetingHours: 10, lateNightEmails: 5,
          weekendActive: true, daysSinceBreak: 10, score: 90,
        },
      },
      NOW,
    )
    const you = fronts.find((f) => f.key === 'you')!
    expect(you.status).toBe('critical')
    expect(you.rank).toBeLessThanOrEqual(2)
  })

  it('marks quiet fronts quiet', () => {
    const fronts = rankFronts({ ...base, investors: [], fundState: null }, NOW)
    const shows = fronts.find((f) => f.key === 'shows')!
    expect(shows.status).toBe('quiet')
  })
})
