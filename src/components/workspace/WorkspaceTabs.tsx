import { useEffect } from 'react'
import { useViewStore, type ViewId } from '@/stores/useViewStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useProjectsStore } from '@/stores/lemon/useProjectsStore'
import { useLemonDelegationsStore } from '@/stores/lemon/useLemonDelegationsStore'
import { detectSlippingThreads } from '@/lib/inbox/slipDetection'

interface TabDef {
  id: ViewId
  label: string
  count?: number
  hint?: string
}

export function WorkspaceTabs() {
  const view = useViewStore((s) => s.view)
  const setView = useViewStore((s) => s.setView)
  const threads = useInboxStore((s) => s.threads)
  const deals = useDealsStore((s) => s.deals)
  const projects = useProjectsStore((s) => s.projects)
  const delegations = useLemonDelegationsStore((s) => s.delegations)

  // Keyboard shortcuts: g then 1..6 (gmail-style)
  useEffect(() => {
    let armed = false
    let armedAt = 0
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

      if (e.key === 'g' || e.key === 'G') {
        armed = true
        armedAt = Date.now()
        return
      }

      if (armed && Date.now() - armedAt < 1500) {
        const map: Record<string, ViewId> = {
          '1': 'briefing',
          '2': 'inbox',
          '3': 'deals',
          '4': 'projects',
          '5': 'fund',
          '6': 'writing',
          '7': 'you',
          '8': 'memory',
          '9': 'archive',
        }
        const next = map[e.key]
        if (next) {
          setView(next)
          armed = false
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setView])

  const slipping = detectSlippingThreads(threads, deals, projects)
  const overdueDelegations = delegations.filter(
    (d) => d.status === 'pending' && d.expected_by && new Date(d.expected_by) < new Date(),
  )
  const inboxCount = slipping.length + overdueDelegations.length

  const tabs: TabDef[] = [
    { id: 'briefing', label: 'Briefing', hint: 'g 1' },
    { id: 'inbox', label: 'Inbox Intel', count: inboxCount, hint: 'g 2' },
    { id: 'deals', label: 'Deals', count: deals.filter((d) => d.status !== 'closed').length, hint: 'g 3' },
    { id: 'projects', label: 'Projects', count: projects.length, hint: 'g 4' },
    { id: 'fund', label: 'Fund', hint: 'g 5' },
    { id: 'writing', label: 'Writing', hint: 'g 6' },
    { id: 'you', label: 'You', hint: 'g 7' },
    { id: 'memory', label: 'Memory', hint: 'g 8' },
    { id: 'archive', label: 'Archive', hint: 'g 9' },
  ]

  return (
    <nav
      aria-label="Workspace views"
      className="flex items-center gap-1 overflow-x-auto pb-2 mb-4 -mx-1 px-1 relative"
    >
      {tabs.map((tab) => {
        const active = tab.id === view
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            aria-pressed={active}
            title={tab.hint ? `Shortcut: ${tab.hint}` : undefined}
            className={[
              'group relative flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-sans font-medium uppercase tracking-[0.12em] transition-colors whitespace-nowrap',
              active
                ? 'bg-sunken text-ink border border-line'
                : 'text-ink-3 hover:text-ink-2 border border-transparent hover:border-line',
            ].join(' ')}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span
                className={[
                  'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums',
                  active
                    ? 'bg-accent/15 text-accent'
                    : tab.id === 'inbox'
                      ? 'bg-data-coral/15 text-data-coral'
                      : 'bg-sunken text-ink-3',
                ].join(' ')}
                aria-label={`${tab.count} items`}
              >
                {tab.count}
              </span>
            )}
            {active && (
              <span
                aria-hidden
                className="absolute left-3 right-3 -bottom-px h-px bg-accent"
              />
            )}
          </button>
        )
      })}
      <span
        aria-hidden
        className="hidden md:inline text-[9px] font-sans uppercase tracking-[0.18em] text-ink-3 whitespace-nowrap ml-auto pl-3"
        title="Press g then 1–9 to switch views"
      >
        <kbd className="px-1 rounded bg-sunken text-ink-3 font-mono">g</kbd>
        <span className="mx-1">+</span>
        <kbd className="px-1 rounded bg-sunken text-ink-3 font-mono">1–9</kbd>
        <span className="ml-2 italic">to switch</span>
      </span>
    </nav>
  )
}
