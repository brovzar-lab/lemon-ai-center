import { useEffect, useMemo, useState } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useProjectsStore } from '@/stores/lemon/useProjectsStore'
import { useLemonDelegationsStore } from '@/stores/lemon/useLemonDelegationsStore'
import { useUIStore } from '@/stores/useUIStore'
import {
  detectSlippingThreads,
  detectOverdueDelegations,
  detectStallingDeals,
} from '@/lib/inbox/slipDetection'
import { useViewStore } from '@/stores/useViewStore'
import { useCopilotStore } from '@/stores/useCopilotStore'
import { EmptyState } from '@/components/workspace/EmptyState'
import type { InboxThread, InboxSlip, LemonDelegation, LemonDeal } from '@shared/types'

interface InboxIntelViewProps {
  onReply?: (thread: InboxThread) => void
}

// ── Helpers ──────────────────────────────────────────────────────

function formatAge(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const ms = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(ms / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

function daysSince(dateStr: string | undefined): number {
  if (!dateStr) return 999
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function extractName(from: string): string {
  const match = from.match(/^([^<]+)/)
  return match ? match[1].trim() : from
}

// ── Types ────────────────────────────────────────────────────────

interface NarrativeItem {
  id: string
  priority: 'urgent' | 'attention' | 'info'
  message: string
  context?: string
  actions: Array<{ label: string; onClick: () => void }>
}

// ── Component ────────────────────────────────────────────────────

export function InboxIntelView({ onReply }: InboxIntelViewProps) {
  const fetchInbox = useInboxStore((s) => s.fetch)
  const threads = useInboxStore((s) => s.threads)
  const inboxLoading = useInboxStore((s) => s.loading)
  const inboxError = useInboxStore((s) => s.error)
  const subscribeDelegations = useLemonDelegationsStore((s) => s.subscribe)
  const delegations = useLemonDelegationsStore((s) => s.delegations)
  const setDelegationStatus = useLemonDelegationsStore((s) => s.setStatus)
  const subscribeDeals = useDealsStore((s) => s.subscribe)
  const deals = useDealsStore((s) => s.deals)
  const subscribeProjects = useProjectsStore((s) => s.subscribe)
  const projects = useProjectsStore((s) => s.projects)
  const openDrawer = useUIStore((s) => s.openDrawer)
  const setActiveContext = useUIStore((s) => s.setActiveContext)
  const setView = useViewStore((s) => s.setView)
  const openCopilot = useCopilotStore((s) => s.open)

  const [showInfo, setShowInfo] = useState(false)
  const hotCount = useMemo(() => threads.filter((t) => t.priority === 'HOT').length, [threads])

  useEffect(() => {
    if (threads.length === 0 && !inboxLoading) fetchInbox()
  }, [threads.length, inboxLoading, fetchInbox])

  useEffect(() => {
    const unsubs = [subscribeDelegations(), subscribeDeals(), subscribeProjects()]
    return () => {
      for (const u of unsubs) u()
    }
  }, [subscribeDelegations, subscribeDeals, subscribeProjects])

  const slipping = useMemo(
    () => detectSlippingThreads(threads, deals, projects),
    [threads, deals, projects],
  )
  const overdue = useMemo(() => detectOverdueDelegations(delegations), [delegations])
  const stallingDeals = useMemo(() => detectStallingDeals(deals), [deals])

  // ── Build narrative ──────────────────────────────────────────────

  const narrative = useMemo(() => {
    const items: NarrativeItem[] = []

    // Helper: resolve deal name from ID
    const getDealName = (id?: string) => {
      if (!id) return undefined
      return deals.find((d) => d.id === id)?.name
    }
    // Helper: resolve project title from ID
    const getProjectTitle = (id?: string) => {
      if (!id) return undefined
      return projects.find((p) => p.id === id)?.title
    }

    // Urgent: threads awaiting reply > 24h
    const awaiting = slipping.filter((s) => s.reason === 'awaiting_reply')
    for (const slip of awaiting) {
      const thread = threads.find((t) => t.id === slip.threadId)
      if (!thread) continue
      const age = daysSince(thread.receivedAt)
      const name = extractName(thread.from)
      const dealName = getDealName(slip.linkedDealId)
      const projectTitle = getProjectTitle(slip.linkedProjectId)
      items.push({
        id: `thread-${thread.id}`,
        priority: age > 1 ? 'urgent' : 'attention',
        message: `${name} hasn't replied in ${age} day${age !== 1 ? 's' : ''} — "${thread.subject}".`,
        context: dealName ? `Tied to ${dealName} deal` : projectTitle ? `Tied to ${projectTitle}` : undefined,
        actions: [
          ...(onReply ? [{ label: 'Reply', onClick: () => onReply(thread) }] : []),
          {
            label: 'Open in Billy',
            onClick: () => {
              setActiveContext({ kind: 'thread', id: thread.id })
              openDrawer()
            },
          },
        ],
      })
    }

    // Urgent: overdue delegations
    for (const d of overdue) {
      const age = daysSince(d.expected_by)
      items.push({
        id: `deleg-${d.id}`,
        priority: 'urgent',
        message: `The delegation to ${d.person || 'someone'} for "${d.task}" was due ${age} day${age !== 1 ? 's' : ''} ago. No update yet.`,
        actions: [
          {
            label: 'Follow up',
            onClick: () => {
              setActiveContext({ kind: 'delegation' as any, id: d.id })
              openDrawer()
            },
          },
          {
            label: 'Mark done',
            onClick: () => setDelegationStatus(d.id, 'completed'),
          },
        ],
      })
    }

    // Attention: stalling deals
    for (const deal of stallingDeals) {
      const age = daysSince(deal.updated_at)
      const reason = !deal.next_action
        ? 'has no next action'
        : `hasn't moved in ${age} days`
      items.push({
        id: `deal-${deal.id}`,
        priority: 'attention',
        message: `The ${deal.name} deal ${reason}.${deal.counterparty ? ` (${deal.counterparty})` : ''}`,
        actions: [
          { label: 'Add next action', onClick: () => setView('deals') },
          { label: 'Open deal', onClick: () => setView('deals') },
        ],
      })
    }

    // Info: linked threads (tied to active deals/projects but not urgent)
    const linked = slipping.filter(
      (s) => s.reason === 'tied_to_active_deal' || s.reason === 'tied_to_active_project',
    )
    if (linked.length > 0) {
      items.push({
        id: 'info-linked',
        priority: 'info',
        message: `${linked.length} thread${linked.length !== 1 ? 's are' : ' is'} linked to active projects but ${linked.length !== 1 ? "don't" : "doesn't"} need urgent action.`,
        actions: [
          { label: showInfo ? 'Hide details' : 'Show details', onClick: () => setShowInfo(!showInfo) },
        ],
      })
    }

    // Sort: urgent first, then attention, then info
    const order = { urgent: 0, attention: 1, info: 2 }
    items.sort((a, b) => order[a.priority] - order[b.priority])

    return { items, linked, getDealName, getProjectTitle }
  }, [slipping, overdue, stallingDeals, threads, deals, projects, onReply, setActiveContext, openDrawer, setDelegationStatus, setView, showInfo])

  // ── Weekly pulse ─────────────────────────────────────────────────

  const weekAgo = useMemo(() => Date.now() - 7 * 24 * 60 * 60 * 1000, [])
  const dealsClosedThisWeek = deals.filter((d) => {
    if (d.status !== 'closed') return false
    const t = d.updated_at ? new Date(d.updated_at).getTime() : NaN
    return Number.isFinite(t) && t >= weekAgo
  }).length
  const projectsAdvancedThisWeek = projects.filter((p) => {
    const t = p.updated_at ? new Date(p.updated_at).getTime() : NaN
    return Number.isFinite(t) && t >= weekAgo
  }).length
  const delegationsCompletedThisWeek = delegations.filter((d) => {
    if (d.status !== 'completed') return false
    const t = d.completed_date ? new Date(d.completed_date as string).getTime() : NaN
    return Number.isFinite(t) && t >= weekAgo
  }).length

  // ── Render ───────────────────────────────────────────────────────

  const priorityDot: Record<NarrativeItem['priority'], string> = {
    urgent: 'bg-data-coral',
    attention: 'bg-amber-400',
    info: 'bg-data-teal',
  }

  const totalUrgent = narrative.items.filter((i) => i.priority !== 'info').length
  // Show the inbox error state ONLY when there's genuinely nothing to display.
  // A transient background-poll failure (usePollingEngine refetches every 2 min)
  // must not blank good/stale threads or hide unrelated delegation/deal alerts.
  const inboxLoadFailedEmpty = Boolean(inboxError) && narrative.items.length === 0

  return (
    <section className="space-y-5 animate-in">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink leading-tight">
            Inbox Intelligence
          </h2>
          <p className="text-sm font-sans text-ink-2 mt-2 leading-relaxed max-w-2xl">
            {inboxLoadFailedEmpty
              ? 'Inbox could not be loaded — this is an error, not an empty inbox.'
              : totalUrgent > 0
              ? `You have ${totalUrgent} thing${totalUrgent !== 1 ? 's' : ''} that need${totalUrgent === 1 ? 's' : ''} attention today.`
              : 'Everything looks good — nothing urgent right now.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hotCount > 0 && (
            <button
              type="button"
              onClick={openCopilot}
              className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-data-coral text-white px-3.5 py-1.5 rounded-md hover:brightness-110 transition-all"
            >
              Triage {hotCount} hot
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setActiveContext({ kind: null, id: null })
              openDrawer()
            }}
            className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-accent text-bg px-3.5 py-1.5 rounded-md hover:brightness-110 transition-all"
          >
            Ask Billy: what am I missing?
          </button>
        </div>
      </header>

      {/* Narrative items */}
      {inboxLoadFailedEmpty ? (
        <EmptyState
          title="Couldn’t load your inbox"
          body="Gmail didn’t respond, so this list may be incomplete. Reconnect Google or retry — don’t treat this as an empty inbox."
        />
      ) : narrative.items.length === 0 ? (
        <EmptyState
          title="All clear"
          body="No slipping threads, overdue delegations, or stalling deals."
        />
      ) : (
        <div className="bg-surface border border-line rounded-xl divide-y divide-line">
          {narrative.items.map((item) => (
            <div key={item.id} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${priorityDot[item.priority]}`}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-sans text-ink leading-relaxed">
                    {item.message}
                  </p>
                  {item.context && (
                    <p className="text-xs font-sans text-ink-3 mt-1">{item.context}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {item.actions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={action.onClick}
                        className="text-[11px] font-sans font-semibold uppercase tracking-wider text-accent hover:text-accent/80 transition-colors"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Expand linked threads detail */}
              {item.id === 'info-linked' && showInfo && (
                <div className="mt-3 ml-5 space-y-2">
                  {narrative.linked.map((slip) => {
                    const thread = threads.find((t) => t.id === slip.threadId)
                    if (!thread) return null
                    const dealName = narrative.getDealName(slip.linkedDealId)
                    const projectTitle = narrative.getProjectTitle(slip.linkedProjectId)
                    return (
                      <div key={slip.threadId} className="text-xs font-sans text-ink-3 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-data-teal flex-shrink-0" aria-hidden />
                        <span className="truncate">
                          {extractName(thread.from)} — "{thread.subject}"
                          {dealName && ` · ${dealName}`}
                          {projectTitle && ` · ${projectTitle}`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Weekly pulse — one line */}
      {(dealsClosedThisWeek > 0 || projectsAdvancedThisWeek > 0 || delegationsCompletedThisWeek > 0) && (
        <p className="text-xs font-sans text-ink-3 pt-2 border-t border-line">
          This week: {dealsClosedThisWeek} deal{dealsClosedThisWeek !== 1 ? 's' : ''} closed
          {' · '}{projectsAdvancedThisWeek} project{projectsAdvancedThisWeek !== 1 ? 's' : ''} advanced
          {' · '}{delegationsCompletedThisWeek} delegation{delegationsCompletedThisWeek !== 1 ? 's' : ''} completed.
        </p>
      )}
    </section>
  )
}
