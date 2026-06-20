import { useState, useEffect, type ReactNode } from 'react'

interface CollapsibleSectionProps {
  id: string
  title: string
  subtitle?: string
  children: ReactNode
  defaultOpen?: boolean
  /** If set, section auto-collapses outside these hours (0-23) */
  autoCollapseOutside?: { start: number; end: number }
  /** data-focus-keep attribute for focus mode */
  focusKeep?: boolean
  className?: string
}

function isWithinHours(start: number, end: number): boolean {
  const hour = new Date().getHours()
  return hour >= start && hour < end
}

export function CollapsibleSection({
  id,
  title,
  subtitle,
  children,
  defaultOpen = true,
  autoCollapseOutside,
  focusKeep,
  className = '',
}: CollapsibleSectionProps) {
  const storageKey = `collapsible-${id}`

  const [isOpen, setIsOpen] = useState(() => {
    // Check localStorage first
    const stored = localStorage.getItem(storageKey)
    if (stored !== null) return stored === 'true'

    // Then check auto-collapse time
    if (autoCollapseOutside) {
      return isWithinHours(autoCollapseOutside.start, autoCollapseOutside.end)
    }

    return defaultOpen
  })

  // Auto-collapse/expand based on time (check every 5 minutes)
  useEffect(() => {
    if (!autoCollapseOutside) return
    const interval = setInterval(() => {
      const withinHours = isWithinHours(autoCollapseOutside.start, autoCollapseOutside.end)
      // Only auto-change if user hasn't manually set it (check for manual override)
      const manualOverride = localStorage.getItem(storageKey)
      if (manualOverride === null) {
        setIsOpen(withinHours)
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [autoCollapseOutside, storageKey])

  const toggle = () => {
    const next = !isOpen
    setIsOpen(next)
    localStorage.setItem(storageKey, String(next))
  }

  return (
    <section
      className={className}
      aria-label={title}
      {...(focusKeep ? { 'data-focus-keep': 'true' } : {})}
    >
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between py-2 group"
        aria-expanded={isOpen}
        aria-controls={`collapsible-content-${id}`}
      >
        <div className="flex items-baseline gap-2">
          <p className="text-[11px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3">
            {title}
          </p>
          {subtitle && (
            <p className="text-[11px] font-sans text-ink-3">
              {subtitle}
            </p>
          )}
        </div>
        <span
          className={`text-ink-3/50 group-hover:text-ink-2 transition-transform duration-200 text-xs ${
            isOpen ? 'rotate-0' : '-rotate-90'
          }`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      <div
        id={`collapsible-content-${id}`}
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </section>
  )
}
