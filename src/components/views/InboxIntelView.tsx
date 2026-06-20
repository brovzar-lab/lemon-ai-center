import { useEffect, useMemo } from 'react'
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
import { EmptyState } from '@/components/workspace/EmptyState'
import { TasksEisenhower } from '@/components/workspace/TasksEisenhower'
import type {
  InboxThread,
  InboxSlip,
  LemonDelegation,
  LemonDeal,
} from '@shared/types'

interface InboxIntelViewProps {
  onReply?: (thread: InboxThread) => void
}

export function InboxIntelView({ onReply }: InboxIntelViewProps) {
  const fetchInbox = useInboxStore((s) => s.fetch)
  const threads = useInboxStore((s) => s.threads)
  const inboxLoading = useInboxStore((s) => s.loading)
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

  const linked = slipping.filter(
    (s) => s.reason === 'tied_to_active_deal' || s.reason === 'tied_to_active_project',
  )
  const awaiting = slipping.filter((s) => s.reason === 'awaiting_reply')

  const totalAtRisk = awaiting.length + overdue.length + stallingDeals.length

  // Weekly pulse — uses `updated_at` as a proxy for stage movement
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

  function openInBillyDrawer(thread: InboxThread | undefined) {
    if (!thread) return
    setActiveContext({ kind: 'thread', id: thread.id })
    openDrawer()
  }

  return (
    <section className="space-y-5 animate-in">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink leading-tight">
            Inbox Intelligence
          </h2>
          <p className="text-xs font-sans text-ink-3 mt-1 max-w-2xl leading-relaxed">
            What you're missing right now. Heuristic-driven slip detection across
            inbox, delegations, and deals. AI summaries land in P2 — for now, ask
            Billy directly using the chat drawer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalAtRisk > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-sans font-medium px-2.5 py-1 rounded-full bg-data-coral/15 text-data-coral">
              <span className="w-1.5 h-1.5 rounded-full bg-data-coral" aria-hidden />
              {totalAtRisk} at risk
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setActiveContext({ kind: null, id: null })
              openDrawer()
            }}
            className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-accent text-bg px-3.5 py-1.5 rounded-md hover:brightness-110 transition-all"
          >
            Ask AI: what am I missing?
          </button>
        </div>
      </header>

      {/* Weekly pulse — progress signals to balance "what's slipping" */}
      <div className="grid grid-cols-3 gap-3">
        <PulseStat
          label="Deals closed"
          value={dealsClosedThisWeek}
          accent="var(--data-teal)"
          hint="Last 7 days"
        />
        <PulseStat
          label="Projects moved"
          value={projectsAdvancedThisWeek}
          accent="var(--data-blue)"
          hint="Stage changes"
        />
        <PulseStat
          label="Delegations done"
          value={delegationsCompletedThisWeek}
          accent="var(--accent)"
          hint="By your team"
        />
      </div>

      {/* Eisenhower task grid for right-now decisions */}
      <TasksEisenhower />

      {/* Lane: Awaiting your reply */}
      <Lane
        title="Slipping — awaiting your reply"
        accent="var(--data-coral)"
        count={awaiting.length}
        emptyTitle="Nothing slipping right now"
        emptyBody="HOT older than 24h or MED older than 72h would surface here."
      >
        {awaiting.map((slip) => {
          const thread = threads.find((t) => t.id === slip.threadId)
          if (!thread) return null
          return (
            <SlipCard
              key={slip.threadId}
              slip={slip}
              thread={thread}
              actions={
                <>
                  <ActionButton onClick={() => onReply?.(thread)}>Reply</ActionButton>
                  <ActionButton onClick={() => openInBillyDrawer(thread)}>Ask Billy</ActionButton>
                </>
              }
            />
          )
        })}
      </Lane>

      {/* Lane: Tied to deals/projects */}
      <Lane
        title="Tied to active deals & projects"
        accent="var(--accent)"
        count={linked.length}
        emptyTitle="No threads matched to active ops"
        emptyBody="Threads whose subject mentions an active deal counterparty or project title appear here."
      >
        {linked.map((slip) => {
          const thread = threads.find((t) => t.id === slip.threadId)
          if (!thread) return null
          const deal = slip.linkedDealId
            ? deals.find((d) => d.id === slip.linkedDealId)
            : undefined
          const project = slip.linkedProjectId
            ? projects.find((p) => p.id === slip.linkedProjectId)
            : undefined
          return (
            <SlipCard
              key={slip.threadId}
              slip={slip}
              thread={thread}
              footer={
                deal ? (
                  <button
                    type="button"
                    onClick={() => setView('deals')}
                    className="text-[11px] font-sans font-medium uppercase tracking-wider text-accent hover:opacity-80"
                  >
                    Open deal · {deal.name}
                  </button>
                ) : project ? (
                  <button
                    type="button"
                    onClick={() => setView('projects')}
                    className="text-[11px] font-sans font-medium uppercase tracking-wider text-accent hover:opacity-80"
                  >
                    Open project · {project.title}
                  </button>
                ) : null
              }
              actions={
                <>
                  <ActionButton onClick={() => onReply?.(thread)}>Reply</ActionButton>
                  <ActionButton onClick={() => openInBillyDrawer(thread)}>Ask Billy</ActionButton>
                </>
              }
            />
          )
        })}
      </Lane>

      {/* Lane: Blocked on others */}
      <Lane
        title="Blocked on others — overdue follow-ups"
        accent="var(--data-blue)"
        count={overdue.length}
        emptyTitle="Nobody is owing you anything overdue"
        emptyBody="Pending delegations whose `expected_by` has passed land here."
      >
        {overdue.map((d) => (
          <DelegationRow
            key={d.id}
            delegation={d}
            onComplete={() => setDelegationStatus(d.id, 'completed')}
          />
        ))}
      </Lane>

      {/* Lane: Stalling deals */}
      <Lane
        title="Stalling deals — no next action or stale > 7d"
        accent="var(--error)"
        count={stallingDeals.length}
        emptyTitle="Pipeline is moving"
        emptyBody="Deals with no `next_action` or untouched for over a week appear here."
      >
        {stallingDeals.map((d) => (
          <DealStalling key={d.id} deal={d} onOpen={() => setView('deals')} />
        ))}
      </Lane>
    </section>
  )
}

function Lane({
  title,
  accent,
  count,
  emptyTitle,
  emptyBody,
  children,
}: {
  title: string
  accent: string
  count: number
  emptyTitle: string
  emptyBody: string
  children: React.ReactNode
}) {
  const isEmpty = count === 0
  return (
    <article aria-label={title}>
      <header className="flex items-center gap-2 mb-2">
        <span
          aria-hidden
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: accent }}
        />
        <h3 className="text-[11px] font-sans font-bold uppercase tracking-[0.18em] text-ink-2">
          {title}
        </h3>
        <span className="text-[11px] font-sans tabular-nums text-ink-3 ml-auto">
          {count}
        </span>
      </header>
      {isEmpty ? (
        <div className="bg-surface border border-line rounded-xl px-4 py-5 text-center">
          <p className="text-[12px] font-sans italic text-ink-2">{emptyTitle}</p>
          <p className="text-[11px] font-sans text-ink-3 mt-1 leading-snug max-w-md mx-auto">
            {emptyBody}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </article>
  )
}

function SlipCard({
  slip,
  thread,
  actions,
  footer,
}: {
  slip: InboxSlip
  thread: InboxThread
  actions?: React.ReactNode
  footer?: React.ReactNode
}) {
  const ageLabel = formatAge(slip.ageHours)
  const priorityClass =
    slip.priority === 'HOT'
      ? 'bg-data-coral/15 text-data-coral'
      : slip.priority === 'MED'
        ? 'bg-accent/15 text-accent'
        : 'bg-sunken text-ink-3'

  return (
    <li className="bg-surface border border-line rounded-xl px-4 py-3 group hover:border-line transition-colors">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex items-center text-[11px] font-sans font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${priorityClass} flex-shrink-0`}
        >
          {slip.priority}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-sans font-semibold text-ink truncate">
            {thread.subject}
          </p>
          <p className="text-[11px] font-sans text-ink-3 line-clamp-2 mt-0.5 leading-snug">
            {thread.snippet}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-[11px] font-sans text-ink-3 flex-wrap">
            <span>{thread.from}</span>
            <span>·</span>
            <span className="font-mono">{ageLabel}</span>
          </div>
          {footer && <div className="mt-2">{footer}</div>}
        </div>
        {actions && (
          <div className="flex items-center gap-1 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            {actions}
          </div>
        )}
      </div>
    </li>
  )
}

function DelegationRow({
  delegation,
  onComplete,
}: {
  delegation: LemonDelegation
  onComplete: () => void
}) {
  const expected = delegation.expected_by ? new Date(delegation.expected_by) : null
  const overdueDays = expected
    ? Math.floor((Date.now() - expected.getTime()) / (1000 * 60 * 60 * 24))
    : null

  return (
    <li className="bg-surface border border-line rounded-xl px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-sans font-semibold text-ink leading-snug">
          {delegation.task}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[11px] font-sans text-ink-3 flex-wrap">
          <span className="text-data-blue font-medium">{delegation.person}</span>
          {expected && (
            <>
              <span>·</span>
              <span className="font-mono">
                expected {expected.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </>
          )}
          {overdueDays !== null && overdueDays > 0 && (
            <span className="text-data-coral font-medium">{overdueDays}d overdue</span>
          )}
        </div>
        {delegation.context && (
          <p className="text-[11px] font-sans text-ink-3 mt-1 line-clamp-2 leading-snug">
            {delegation.context}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onComplete}
        className="text-[11px] font-sans font-medium uppercase tracking-wider px-2.5 py-1 rounded-md border border-line hover:border-data-teal/40 hover:text-data-teal text-ink-2 transition-colors flex-shrink-0"
      >
        Mark done
      </button>
    </li>
  )
}

function DealStalling({ deal, onOpen }: { deal: LemonDeal; onOpen: () => void }) {
  return (
    <li className="bg-surface border border-line rounded-xl px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-sans font-semibold text-ink leading-snug">
          {deal.name}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[11px] font-sans text-ink-3">
          {deal.counterparty && <span>{deal.counterparty}</span>}
          {!deal.next_action && (
            <span className="text-data-coral font-medium">No next action set</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="text-[11px] font-sans font-medium uppercase tracking-wider px-2.5 py-1 rounded-md border border-line hover:border-line text-ink-2 hover:text-ink transition-colors flex-shrink-0"
      >
        Open
      </button>
    </li>
  )
}

function ActionButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] font-sans font-medium uppercase tracking-wider px-2 py-1 rounded-md border border-line hover:border-line text-ink-2 hover:text-ink transition-colors"
    >
      {children}
    </button>
  )
}

function PulseStat({
  label,
  value,
  accent,
  hint,
}: {
  label: string
  value: number
  accent: string
  hint: string
}) {
  return (
    <div className="bg-surface border border-line rounded-xl px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-sans font-bold uppercase tracking-wider text-ink-3">
          {label}
        </span>
        <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold text-ink leading-none tabular-nums">
          {value}
        </span>
        <span className="text-[11px] font-sans italic text-ink-3">{hint}</span>
      </div>
    </div>
  )
}

function formatAge(hours: number): string {
  if (hours < 1) return 'just now'
  if (hours < 24) return `${Math.round(hours)}h ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d ago`
  const weeks = Math.round(days / 7)
  return `${weeks}w ago`
}
