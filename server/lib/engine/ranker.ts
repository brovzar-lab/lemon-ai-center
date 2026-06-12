import type {
  Front,
  FrontItem,
  FrontKey,
  FrontStatus,
  Investor,
  FundStateDoc,
  Script,
  Deadline,
  EngineSlip,
  LemonProject,
  LemonDeal,
  BurnoutDay,
  AIVenture,
} from '@shared/types'
import { BURNOUT, daysBetween } from './constants'

export interface RankerInput {
  investors: Investor[]
  fundState: FundStateDoc | null
  scripts: Script[]
  deadlines: Deadline[]
  slips: EngineSlip[]
  projects: LemonProject[]
  deals: LemonDeal[]
  burnout: BurnoutDay | null
  ventures: AIVenture[]
}

export function committedMXN(investors: Investor[]): number {
  return investors
    .filter((i) => i.stage === 'committed')
    .reduce((sum, i) => sum + (i.amountMXN ?? 0), 0)
}

function statusFor(score: number): FrontStatus {
  if (score >= 70) return 'critical'
  if (score >= 45) return 'attention'
  return 'quiet'
}

const fmtMXN = (n: number) =>
  n >= 1_000_000 ? `$${Math.round(n / 1_000_000)}M` : `$${Math.round(n / 1000)}k`

/**
 * Deterministic daily ranking of the five fronts. No LLM — testable,
 * cheap, explainable. The Advisor narrates on top of this.
 */
export function rankFronts(input: RankerInput, now: Date = new Date()): Front[] {
  const slipsBy = (kind: EngineSlip['kind']) => input.slips.filter((s) => s.kind === kind)

  // ── Fund ──
  const target = input.fundState?.targetMXN ?? 300_000_000
  const committed = committedMXN(input.investors)
  const pct = target > 0 ? Math.round((committed / target) * 100) : 0
  const inDocs = input.investors.filter((i) => i.stage === 'docs')
  const staleTouch = input.investors.filter(
    (i) =>
      (i.stage === 'docs' || i.stage === 'interested') &&
      i.lastTouch &&
      daysBetween(i.lastTouch, now) > 5,
  )
  const fundDeadlines = slipsBy('deadline').filter((s) =>
    /fund|trust|oxido|óxido/i.test(s.summary),
  )
  let fundScore = 45
  fundScore += inDocs.length ? 20 : 0
  fundScore += Math.min(staleTouch.length * 8, 16)
  fundScore += fundDeadlines.some((s) => s.severity === 'critical') ? 25 : 0
  const fundItems: FrontItem[] = [
    {
      text: `${fmtMXN(committed)} / ${fmtMXN(target)} MXN committed (${pct}%)`,
      severity: 'info',
    },
    ...inDocs.slice(0, 3).map<FrontItem>((i) => ({
      text: `${i.name}${i.org ? ` (${i.org})` : ''} — in docs`,
      detail: i.nextAction,
      refKind: 'investor',
      refId: i.id,
      severity: 'warn',
    })),
    ...staleTouch.slice(0, 2).map<FrontItem>((i) => ({
      text: `${i.name} untouched ${daysBetween(i.lastTouch!, now)}d`,
      refKind: 'investor',
      refId: i.id,
      severity: 'warn',
    })),
  ]

  // ── Writing ──
  const scriptSlips = slipsBy('script')
  const activeScripts = input.scripts.filter((s) => s.stage !== 'delivered')
  let writingScore = 30 + Math.min(scriptSlips.length * 12, 48)
  writingScore += scriptSlips.some((s) => s.severity === 'critical') ? 15 : 0
  const writingItems: FrontItem[] = [
    {
      text: `${activeScripts.length} scripts in motion, ${scriptSlips.length} gone stale`,
      severity: scriptSlips.length ? 'warn' : 'info',
    },
    ...scriptSlips.slice(0, 3).map<FrontItem>((s) => ({
      text: s.summary,
      detail: s.detail,
      refKind: 'script',
      refId: s.refId,
      severity: s.severity,
    })),
  ]

  // ── Shows ──
  const inProduction = input.projects.filter(
    (p) => p.category === 'production' || p.category === 'post_production',
  )
  const showsItems: FrontItem[] = inProduction.slice(0, 4).map<FrontItem>((p) => ({
    text: `${p.title} — ${p.category.replace('_', '-')}`,
    detail: p.next_action ?? p.status_detail,
    refKind: 'project',
    refId: p.id,
    severity: 'info',
  }))
  const showsScore = 25 + Math.min(inProduction.length * 4, 16)

  // ── Deals ──
  const dealSlips = slipsBy('deal')
  const openDeals = input.deals.filter((d) => d.status !== 'closed')
  let dealsScore = 25 + Math.min(dealSlips.length * 10, 40)
  dealsScore += dealSlips.some((s) => s.severity === 'critical') ? 15 : 0
  const dealsItems: FrontItem[] = [
    {
      text: `${openDeals.length} open deals, ${dealSlips.length} stalled`,
      severity: dealSlips.length ? 'warn' : 'info',
    },
    ...dealSlips.slice(0, 3).map<FrontItem>((s) => ({
      text: s.summary,
      detail: s.detail,
      refKind: 'deal',
      refId: s.refId,
      severity: s.severity,
    })),
  ]

  // ── You ──
  const burnoutScore = input.burnout?.score ?? 0
  const youScore = Math.round(burnoutScore * 0.9)
  const youItems: FrontItem[] = []
  if (input.burnout) {
    youItems.push({
      text: `Burnout ${input.burnout.score}/100`,
      detail: `${input.burnout.meetingHours}h meetings · ${input.burnout.lateNightEmails} late-night emails · ${input.burnout.daysSinceBreak}d since a break`,
      refKind: 'burnout',
      severity:
        burnoutScore >= BURNOUT.ALERT_SCORE ? 'critical' : burnoutScore >= 45 ? 'warn' : 'info',
    })
  }
  youItems.push(
    ...input.ventures.slice(0, 2).map<FrontItem>((v) => ({
      text: `${v.name}${v.stage ? ` — ${v.stage}` : ''}`,
      detail: v.nextAction,
      refKind: 'venture',
      refId: v.id,
      severity: 'info',
    })),
  )

  const headlines: Record<FrontKey, string> = {
    fund:
      `Lemon Trust I at ${pct}%` +
      (inDocs.length ? ` — ${inDocs.length} investor${inDocs.length > 1 ? 's' : ''} in docs` : ''),
    writing: scriptSlips.length
      ? `${scriptSlips.length} script${scriptSlips.length > 1 ? 's' : ''} going cold`
      : `${activeScripts.length} scripts moving`,
    shows: inProduction.length
      ? `${inProduction.length} in production/post`
      : 'Nothing shooting right now',
    deals: dealSlips.length
      ? `${dealSlips.length} deal${dealSlips.length > 1 ? 's' : ''} stalled`
      : `${openDeals.length} open, all moving`,
    you:
      burnoutScore >= BURNOUT.ALERT_SCORE
        ? `Burnout ${burnoutScore} — pull back`
        : burnoutScore >= 45
          ? `Burnout ${burnoutScore} and rising`
          : 'Steady',
  }

  const raw: Array<{ key: FrontKey; score: number; items: FrontItem[] }> = [
    { key: 'fund', score: fundScore, items: fundItems },
    { key: 'writing', score: writingScore, items: writingItems },
    { key: 'shows', score: showsScore, items: showsItems },
    { key: 'deals', score: dealsScore, items: dealsItems },
    { key: 'you', score: youScore, items: youItems },
  ]

  return raw
    .sort((a, b) => b.score - a.score)
    .map((f, idx) => ({
      key: f.key,
      rank: idx + 1,
      headline: headlines[f.key],
      status: statusFor(f.score),
      items: f.items,
    }))
}
