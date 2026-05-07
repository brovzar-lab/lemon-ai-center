import type { ThreadTag, ThreadPriority, TagPatterns } from '@shared/types'

export type { TagPatterns } from '@shared/types'
export { DEFAULT_TAG_PATTERNS } from '@shared/tagPatterns'

const MED_ACTION_VERBS = ['review', 'approve', 'decide', 'needs', 'deadline']
const HOT_OVERRIDE_RE = /\b(today|tomorrow|EOD|COB)\b/i
const HOT_FORCE_WORDS = ['URGENT', 'DEADLINE']

// ── Noise detection ──────────────────────────────────
// Newsletters, subscriptions, notifications, marketing — never HOT
const NOISE_DOMAINS = new Set([
  // Newsletters & magazines
  'writersdigest.aimmedia.com', 'substack.com', 'medium.com',
  'mailchimp.com', 'constantcontact.com', 'campaignmonitor.com',
  // SaaS notifications
  'send.zapier.com', 'notification.mcafee.com', 'noreply.github.com',
  'accounts.google.com', 'no-reply.accounts.google.com',
  // Payment / receipt noise
  'service.paypal.com', 'email.apple.com',
  // Marketing / self-help
  'digital.silvamethod.com', 'silvamethod.com',
  // E-commerce, retail, shopping — never CEO-relevant
  'temu.com', 'amazon.com', 'ebay.com', 'aliexpress.com', 'shein.com',
  'wish.com', 'target.com', 'walmart.com', 'bestbuy.com',
  'shop.app', 'shopify.com', 'etsy.com', 'overstock.com',
  'newegg.com', 'wayfair.com', 'homedepot.com', 'lowes.com',
])

// Subject patterns that indicate noise
const NOISE_SUBJECT_RE = /\b(unsubscribe|newsletter|subscription|renewal|your order|receipt|confirm(ation)?|welcome to|getting started|verify your|weekly digest|daily digest|top stories|flash sale|limited time|% off|coupon|promo code|shipped|delivery|track(ing)? (order|package)|out for delivery|arriving (today|tomorrow)|free shipping|buy now|shop now)\b/i

/** Check if a thread is noise (newsletters, subscriptions, marketing) */
export function isNoiseThread(domain: string, subject: string, from: string): boolean {
  if (NOISE_DOMAINS.has(domain)) return true
  if (NOISE_SUBJECT_RE.test(subject)) return true
  // Catch common newsletter patterns in the from field
  if (/noreply|no-reply|newsletter|digest|notification|marketing|promo/i.test(from)) return true
  return false
}

interface ThreadInput { from: string; fromDomain: string; subject: string; labels: string[] }

export function tagThread(thread: ThreadInput, patterns: TagPatterns): ThreadTag {
  const from = thread.from.toLowerCase()
  const domain = thread.fromDomain.toLowerCase()
  const subject = thread.subject.toLowerCase()

  // Check noise FIRST — before any other classification
  if (isNoiseThread(domain, subject, from)) return 'INFO'

  if (patterns.DEAL.domains.some((d) => domain === d) || patterns.DEAL.senders.some((s) => from.includes(s))) return 'DEAL'
  if (patterns.INT.domains.some((d) => domain === d)) return 'INT'
  if (patterns.INFO.domains.some((d) => domain === d) || patterns.INFO.subjectIncludes.some((kw) => subject.includes(kw))) return 'INFO'
  if (patterns.INDUSTRY.domains.some((d) => domain === d) || patterns.INDUSTRY.senders.some((s) => from.includes(s))) return 'INDUSTRY'
  return 'NONE'
}

interface PriorityInput { tag: ThreadTag; unread: boolean; receivedAt: string; subject: string; fromDomain?: string; from?: string }

export function prioritizeThread(thread: PriorityInput): ThreadPriority {
  const ageMs = Date.now() - new Date(thread.receivedAt).getTime()
  const subject = thread.subject

  // Noise is always LOW, period
  if (thread.fromDomain && thread.from && isNoiseThread(thread.fromDomain, subject, thread.from)) return 'LOW'

  // INFO tag is always LOW — newsletters, receipts, digests
  if (thread.tag === 'INFO') return 'LOW'

  if (HOT_FORCE_WORDS.some((w) => subject.includes(w)) || HOT_OVERRIDE_RE.test(subject)) return 'HOT'
  if (ageMs > 7 * 24 * 60 * 60 * 1000) return 'LOW'

  if (thread.tag === 'DEAL') {
    return (thread.unread || ageMs < 12 * 60 * 60 * 1000) ? 'HOT' : 'MED'
  }
  if (thread.tag === 'INT') {
    const subjectLower = subject.toLowerCase()
    return MED_ACTION_VERBS.some((v) => subjectLower.includes(v)) ? 'MED' : 'LOW'
  }
  return 'LOW'
}
