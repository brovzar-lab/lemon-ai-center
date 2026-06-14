import { useEffect, useState } from 'react'
import { useViewStore, type ViewId } from '@/stores/useViewStore'
import { useInboxStore } from '@/stores/useInboxStore'
import { useDealsStore } from '@/stores/lemon/useDealsStore'
import { useProjectsStore } from '@/stores/lemon/useProjectsStore'
import { useLemonDelegationsStore } from '@/stores/lemon/useLemonDelegationsStore'
import { useTrackersStore } from '@/stores/useTrackersStore'
import { detectSlippingThreads } from '@/lib/inbox/slipDetection'
import { ChevronDown } from 'lucide-react'

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
  const scripts = useTrackersStore((s) => s.scripts)
  const [showMore, setShowMore] = useState(false)

  // Keyboard shortcuts: g then 1..4 (gmail-style)
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
          '2': 'deals',
          '3': 'projects',
          '4': 'writing',
          // Hidden but accessible via keyboard
          '5': 'inbox',
          '6': 'fund',
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

  const activeDeals = deals.filter((d) => d.status !== 'closed')
  const slipping = detectSlippingThreads(threads, deals, projects)
  const activeScripts = scripts.filter((s) => s.stage !== 'delivered')

  // ── Primary tabs (always visible) ──
  const primaryTabs: TabDef[] = [
    {
      id: 'briefing',
      label: 'Command Center',
      count: slipping.length > 0 ? slipping.length : undefined,
      hint: 'g 1',
    },
    {
      id: 'deals',
      label: 'Deals',
      count: activeDeals.length || undefined,
      hint: 'g 2',
    },
    {
      id: 'projects',
      label: 'Projects',
      count: projects.length || undefined,
      hint: 'g 3',
    },
    {
      id: 'writing',
      label: 'Writing',
      count: activeScripts.length || undefined,
      hint: 'g 4',
    },
  ]

  // ── Secondary views (hidden behind "More") ──
  const secondaryTabs: TabDef[] = [
    { id: 'inbox', label: 'Inbox Intel', hint: 'g 5' },
    { id: 'fund', label: 'Fund', hint: 'g 6' },
    { id: 'you', label: 'You', hint: 'g 7' },
    { id: 'memory', label: 'Memory', hint: 'g 8' },
    { id: 'archive', label: 'Archive', hint: 'g 9' },
  ]

  // If current view is a secondary tab, show it in the primary row
  const isSecondaryActive = secondaryTabs.some((t) => t.id === view)

  return (
    <nav
      aria-label="Workspace views"
      className="flex items-center gap-1 overflow-x-auto pb-2 mb-4 -mx-1 px-1 relative"
    >
      {primaryTabs.map((tab) => (
        <TabButton key={tab.id} tab={tab} active={tab.id === view} onClick={() => setView(tab.id)} />
      ))}

      {/* More menu for secondary views */}
      <div className="relative ml-auto">
        <button
          type="button"
          onClick={() => setShowMore(!showMore)}
          className={[
            'flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-body font-medium uppercase tracking-[0.12em] transition-colors whitespace-nowrap',
            isSecondaryActive
              ? 'text-text-primary border border-border-medium'
              : 'text-text-muted border border-transparent hover:text-text-secondary hover:border-border-soft',
          ].join(' ')}
          aria-label="More views"
        >
          {isSecondaryActive
            ? secondaryTabs.find((t) => t.id === view)?.label ?? 'More'
            : 'More'}
          <ChevronDown size={10} className={`transition-transform ${showMore ? 'rotate-180' : ''}`} />
        </button>

        {showMore && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 bg-bg-elevated border border-border-medium rounded-lg shadow-xl py-1 min-w-[140px]">
              {secondaryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setView(tab.id)
                    setShowMore(false)
                  }}
                  className={[
                    'w-full text-left px-3 py-2 text-[11px] font-body transition-colors',
                    tab.id === view
                      ? 'text-text-primary bg-bg-surface'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-surface',
                  ].join(' ')}
                >
                  {tab.label}
                  {tab.hint && (
                    <span className="ml-2 text-[9px] text-text-muted">{tab.hint}</span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Keyboard shortcut hint */}
      <span
        aria-hidden
        className="hidden md:inline text-[9px] font-body uppercase tracking-[0.18em] text-text-muted whitespace-nowrap pl-2"
        title="Press g then 1–9 to switch views"
      >
        <kbd className="px-1 rounded bg-bg-elevated text-text-tertiary font-mono">g</kbd>
        <span className="mx-1">+</span>
        <kbd className="px-1 rounded bg-bg-elevated text-text-tertiary font-mono">1–4</kbd>
      </span>
    </nav>
  )
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: TabDef
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={tab.hint ? `Shortcut: ${tab.hint}` : undefined}
      className={[
        'group relative flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-body font-medium uppercase tracking-[0.12em] transition-colors whitespace-nowrap',
        active
          ? 'bg-bg-elevated text-text-primary border border-border-medium'
          : 'text-text-muted hover:text-text-secondary border border-transparent hover:border-border-soft',
      ].join(' ')}
    >
      <span>{tab.label}</span>
      {typeof tab.count === 'number' && tab.count > 0 && (
        <span
          className={[
            'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold tabular-nums',
            active
              ? 'bg-accent-lemon/15 text-accent-lemon'
              : 'bg-bg-elevated text-text-tertiary',
          ].join(' ')}
          aria-label={`${tab.count} items`}
        >
          {tab.count}
        </span>
      )}
      {active && (
        <span
          aria-hidden
          className="absolute left-3 right-3 -bottom-px h-px bg-accent-lemon"
        />
      )}
    </button>
  )
}
