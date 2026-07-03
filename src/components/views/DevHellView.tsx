import { useEffect } from 'react'
import { useSlateStore } from '@/stores/useSlateStore'
import { EmptyState } from '@/components/workspace/EmptyState'

/**
 * DEVELOPMENT-HELL — the development slate.
 * Milestone 1 is the module shell: mounted in the nav, behind auth, with a
 * designed empty state. The slate board, onboarding wizard, ingestion, and
 * query chat land in later milestones.
 */
export function DevHellView() {
  const projects = useSlateStore((s) => s.projects)
  const loading = useSlateStore((s) => s.loading)
  const loaded = useSlateStore((s) => s.loaded)
  const error = useSlateStore((s) => s.error)
  const fetch = useSlateStore((s) => s.fetch)

  useEffect(() => {
    if (!loaded) void fetch()
  }, [loaded, fetch])

  const internal = projects.filter((p) => p.origin !== 'external')
  const external = projects.length - internal.length

  return (
    <section className="space-y-4 animate-in">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink leading-tight">
            Development Hell
          </h2>
          <p className="text-xs font-sans text-ink-3 mt-1">
            {projects.length === 0
              ? 'The development slate · nothing tracked yet'
              : `${internal.length} project${internal.length === 1 ? '' : 's'} on the slate${
                  external > 0 ? ` · ${external} external (firewalled)` : ''
                }`}
          </p>
        </div>
      </header>

      {loading && !loaded ? (
        <div className="bg-surface rounded-xl shadow-card p-10 text-center">
          <div className="w-4 h-4 mx-auto rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      ) : error ? (
        <EmptyState
          title="The slate is unreachable"
          body={`Could not load the development slate: ${error}`}
          cta={{ label: 'Try again', onClick: () => void fetch() }}
        />
      ) : projects.length === 0 ? (
        <EmptyState
          title="Nothing on the slate yet"
          body="DEVELOPMENT-HELL turns your DEVELOPMENT folder into a living slate — every project and draft indexed and queryable, staleness tracked, nudges drafted before things die on the vine. Projects appear here the moment the folder is connected; the setup wizard is the next piece to land."
        />
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li
              key={p.slug}
              className="bg-surface rounded-xl shadow-card px-4 py-3 flex items-baseline justify-between gap-3"
            >
              <div className="min-w-0">
                <span className="text-[13px] font-sans font-semibold text-ink">{p.title}</span>
                {p.logline && (
                  <p className="text-[11px] font-sans text-ink-3 mt-0.5 truncate">{p.logline}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {p.origin === 'external' && (
                  <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-data-coral/15 text-data-coral">
                    External
                  </span>
                )}
                <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sunken text-ink-3">
                  {p.format} · {p.stage}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
