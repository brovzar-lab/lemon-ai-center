import type {
  InboxThread,
  LemonDeal,
  LemonDelegation,
  LemonProject,
  InboxSlip,
} from '@shared/types'

const HOUR_MS = 1000 * 60 * 60
const DAY_MS = HOUR_MS * 24

const MIN_TOKEN_LENGTH = 4

/**
 * Escape a string for use inside a regex.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Word-boundary match: returns true only if `needle` appears as its own
 * word inside `haystack`. Substring matches across word boundaries are
 * rejected. Both inputs assumed lowercased.
 *
 * Examples:
 *   wordContains("place", "ace")       -> false  (substring only)
 *   wordContains("the ace deal", "ace") -> true
 *   wordContains("Ace.", "ace")        -> true
 */
function wordContains(haystack: string, needle: string): boolean {
  if (!needle || needle.length < MIN_TOKEN_LENGTH) return false
  const re = new RegExp(`\\b${escapeRegex(needle)}\\b`)
  return re.test(haystack)
}

/**
 * Domain match: returns true only when `domain` equals counter or is a
 * subdomain of counter. Substring inclusion is too loose ("amazon"
 * counter would match "amazonaws.com" — wrong).
 */
function domainMatches(domain: string, counter: string): boolean {
  if (!domain || !counter || counter.length < MIN_TOKEN_LENGTH) return false
  return domain === counter || domain.endsWith(`.${counter}`)
}

/**
 * Heuristic to surface threads "slipping through Billy's fingers"
 * without a server roundtrip. Conservative thresholds — better to miss
 * a slip than to falsely accuse Billy of letting something slip.
 *
 * Rules (any one of these makes a thread "slipping"):
 * - HOT thread older than 48h (was 24h — too noisy)
 * - MED thread older than 7d (was 72h — too noisy)
 * - Subject contains an active deal name as a whole word (≥4 chars)
 * - Subject contains an active deal counterparty as a whole word
 * - Sender domain equals or is a subdomain of a deal counterparty
 * - Subject contains an active project title as a whole word
 */
export function detectSlippingThreads(
  threads: InboxThread[],
  deals: LemonDeal[],
  projects: LemonProject[],
  now: Date = new Date(),
): InboxSlip[] {
  const result: InboxSlip[] = []

  const activeDeals = deals.filter((d) => d.status !== 'closed')
  const activeProjects = projects.filter((p) => p.category !== 'deals_business')

  for (const thread of threads) {
    const received = new Date(thread.receivedAt)
    const ageHours = Math.max(0, (now.getTime() - received.getTime()) / HOUR_MS)

    let reason: InboxSlip['reason'] | null = null
    let linkedDealId: string | undefined
    let linkedProjectId: string | undefined

    // Age-based — conservative: HOT > 48h or MED > 7d
    if (thread.priority === 'HOT' && ageHours > 48) {
      reason = 'awaiting_reply'
    } else if (thread.priority === 'MED' && ageHours > 24 * 7) {
      reason = 'awaiting_reply'
    }

    // Linkage-based — favored over plain age because it's more specific
    const subject = thread.subject.toLowerCase()
    const fromDomain = (thread.fromDomain ?? '').toLowerCase()

    const matchedDeal = activeDeals.find((d) => {
      const name = d.name?.toLowerCase() ?? ''
      const counter = d.counterparty?.toLowerCase() ?? ''
      return (
        wordContains(subject, name) ||
        wordContains(subject, counter) ||
        domainMatches(fromDomain, counter)
      )
    })

    if (matchedDeal) {
      reason = 'tied_to_active_deal'
      linkedDealId = matchedDeal.id
    } else {
      const matchedProject = activeProjects.find((p) => {
        const title = p.title?.toLowerCase() ?? ''
        return wordContains(subject, title)
      })
      if (matchedProject) {
        reason = 'tied_to_active_project'
        linkedProjectId = matchedProject.id
      }
    }

    if (reason) {
      result.push({
        threadId: thread.id,
        subject: thread.subject,
        from: thread.from,
        ageHours,
        priority: thread.priority,
        reason,
        linkedDealId,
        linkedProjectId,
      })
    }
  }

  // Oldest first so the most-likely-to-slip surfaces at top
  result.sort((a, b) => b.ageHours - a.ageHours)
  return result
}

/** Open delegations whose `expected_by` date has passed (or is missing for >7d). */
export function detectOverdueDelegations(
  delegations: LemonDelegation[],
  now: Date = new Date(),
): LemonDelegation[] {
  const todayMs = now.getTime()
  return delegations.filter((d) => {
    if (d.status !== 'pending') return false
    if (d.expected_by) {
      const expectedMs = new Date(d.expected_by).getTime()
      return Number.isFinite(expectedMs) && expectedMs < todayMs
    }
    if (d.created_at) {
      const createdMs = new Date(d.created_at).getTime()
      if (Number.isFinite(createdMs)) {
        return todayMs - createdMs > 7 * DAY_MS
      }
    }
    return false
  })
}

/** Active deals with no `next_action` set or whose `updated_at` is stale (>7d). */
export function detectStallingDeals(
  deals: LemonDeal[],
  now: Date = new Date(),
): LemonDeal[] {
  const todayMs = now.getTime()
  return deals.filter((d) => {
    if (d.status === 'closed') return false
    if (!d.next_action || d.next_action.trim().length === 0) return true
    if (d.updated_at) {
      const updatedMs = new Date(d.updated_at).getTime()
      if (Number.isFinite(updatedMs)) {
        return todayMs - updatedMs > 7 * DAY_MS
      }
    }
    return false
  })
}
