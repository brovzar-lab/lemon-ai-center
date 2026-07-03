import { useEffect, useState } from 'react'
import { useSlateStore } from '@/stores/useSlateStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { EmptyState } from '@/components/workspace/EmptyState'
import { SlateBoard } from '@/components/workspace/SlateBoard'
import type { SlateConfirmItem } from '@shared/types'

/**
 * DEVELOPMENT-HELL — the development slate.
 * Not onboarded → the setup wizard (creates the DEVELOPMENT/ folder,
 * saves its location, starts the watcher). Onboarded → the slate board:
 * the visual pipeline in film/series lanes, plus the confirm queue for
 * anything the scanner couldn't file deterministically.
 */
export function DevHellView() {
  const status = useSlateStore((s) => s.status)
  const projects = useSlateStore((s) => s.projects)
  const confirm = useSlateStore((s) => s.confirm)
  const loading = useSlateStore((s) => s.loading)
  const loaded = useSlateStore((s) => s.loaded)
  const error = useSlateStore((s) => s.error)
  const refresh = useSlateStore((s) => s.refresh)

  useEffect(() => {
    if (!loaded) void refresh()
  }, [loaded, refresh])

  const live = projects.filter((p) => p.status !== 'dead')
  const archived = projects.length - live.length
  const external = live.filter((p) => p.origin === 'external').length

  return (
    <section className="space-y-4 animate-in">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink leading-tight">
            Development Hell
          </h2>
          <p className="text-xs font-sans text-ink-3 mt-1">
            {!status?.onboarded
              ? 'The development slate · not set up yet'
              : projects.length === 0
                ? 'The development slate · watching, nothing tracked yet'
                : `${live.length} on the slate${
                    external > 0 ? ` · ${external} external (firewalled)` : ''
                  }${archived > 0 ? ` · ${archived} archived` : ''}`}
          </p>
        </div>
        {status?.onboarded && <SlateMeta />}
      </header>

      {!loaded && loading ? (
        <div className="bg-surface rounded-xl shadow-card p-10 text-center">
          <div className="w-4 h-4 mx-auto rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      ) : !status && error ? (
        <EmptyState
          title="The slate is unreachable"
          body={`Could not load the development slate: ${error}`}
          cta={{ label: 'Try again', onClick: () => void refresh() }}
        />
      ) : status && !status.onboarded ? (
        <SlateWizard />
      ) : (
        <>
          {confirm.length > 0 && <ConfirmQueue items={confirm} />}
          {projects.length === 0 ? (
            <EmptyState
              title="Folder connected — the slate is watching"
              body={`Drop a project folder into ${status?.devFolderPath ?? 'your DEVELOPMENT folder'} (one folder per project, with a project.yaml) and it appears here within seconds. Loose material goes in _inbox and lands in the confirm queue.`}
            />
          ) : live.length === 0 ? (
            <EmptyState
              title="Everything on the slate is archived"
              body="All tracked projects are in _archive. Move a project folder back out (or drop new material in) and the board wakes up."
            />
          ) : (
            <SlateBoard projects={projects} />
          )}
        </>
      )}
    </section>
  )
}

function SlateMeta() {
  const status = useSlateStore((s) => s.status)
  const busy = useSlateStore((s) => s.busy)
  const error = useSlateStore((s) => s.error)
  const lastScan = useSlateStore((s) => s.lastScan)
  const rescan = useSlateStore((s) => s.rescan)
  if (!status?.onboarded) return null

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <span
        className="text-[10px] font-mono px-2 py-1 rounded bg-sunken text-ink-3 max-w-[280px] truncate"
        title={status.devFolderPath}
      >
        {status.devFolderPath}
      </span>
      <span
        className={[
          'inline-flex items-center gap-1.5 text-[9px] font-sans font-bold uppercase tracking-wider px-2 py-1 rounded',
          status.watcherActive ? 'bg-data-teal/15 text-data-teal' : 'bg-data-coral/15 text-data-coral',
        ].join(' ')}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${status.watcherActive ? 'bg-data-teal' : 'bg-data-coral'}`} />
        {status.watcherActive ? 'Watching' : status.folderAccessible === false ? 'Folder unreachable' : 'Watcher off'}
      </span>
      {(status.chunkCount ?? 0) > 0 && (
        <span
          className="text-[9px] font-sans font-bold uppercase tracking-wider px-2 py-1 rounded bg-sunken text-ink-3 tabular-nums"
          title={status.lastIngestAt ? `Slate index · last ingest ${status.lastIngestAt}` : 'Slate index'}
        >
          {status.chunkCount} chunks
        </span>
      )}
      {status.ingestRunning && (
        <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-2 py-1 rounded bg-data-violet/15 text-data-violet">
          Indexing…
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void rescan()}
        className="text-[10px] font-sans font-medium uppercase tracking-wider px-2.5 py-1 rounded-md border border-line text-ink-2 hover:text-ink transition-colors disabled:opacity-50"
      >
        {busy ? 'Scanning…' : 'Rescan'}
      </button>
      {lastScan && !busy && (
        <span className="text-[10px] font-sans text-ink-3">
          {lastScan.projects} project{lastScan.projects === 1 ? '' : 's'} · {lastScan.confirmItems} to confirm
        </span>
      )}
      {error && <span className="text-[10px] font-sans text-data-coral">{error}</span>}
    </div>
  )
}

function SlateWizard() {
  const isDemo = useAuthStore((s) => s.isDemo)
  const busy = useSlateStore((s) => s.busy)
  const error = useSlateStore((s) => s.error)
  const onboard = useSlateStore((s) => s.onboard)
  const [path, setPath] = useState('~/DEVELOPMENT')

  return (
    <div className="bg-surface rounded-xl shadow-card px-6 py-8 max-w-xl">
      <p className="font-display text-lg italic text-ink-2 leading-tight">
        One folder. The whole slate.
      </p>
      <p className="mt-3 text-xs font-sans text-ink-3 leading-relaxed">
        DEVELOPMENT-HELL needs one folder to call home. The wizard creates it — with{' '}
        <code className="font-mono text-[11px]">_external</code>,{' '}
        <code className="font-mono text-[11px]">_archive</code> and{' '}
        <code className="font-mono text-[11px]">_inbox</code> inside — saves the location, starts
        watching, and files everything it finds. Material already in the folder is scanned in
        place, never moved. Anything that breaks the naming convention waits for your confirmation
        instead of being filed silently.
      </p>

      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy && !isDemo && path.trim()) void onboard(path.trim())
        }}
      >
        <label className="block">
          <span className="block text-[10px] font-sans font-bold uppercase tracking-wider text-ink-3 mb-1">
            Folder location
          </span>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            spellCheck={false}
            className="w-full bg-bg border border-line text-ink text-[13px] font-mono px-3 py-2 rounded-lg outline-none focus:border-accent transition-colors"
          />
        </label>

        {isDemo ? (
          <p className="text-[11px] font-sans text-ink-3 italic">
            Demo mode — sign in with Google to set up the slate.
          </p>
        ) : (
          <button
            type="submit"
            disabled={busy || !path.trim()}
            className="text-[11px] font-sans font-semibold uppercase tracking-wider bg-accent text-bg px-4 py-2 rounded-md hover:brightness-110 transition-all disabled:opacity-50"
          >
            {busy ? 'Creating & scanning…' : 'Create & start watching'}
          </button>
        )}
        {error && <p className="text-[11px] font-sans text-data-coral">{error}</p>}
      </form>
    </div>
  )
}

const REASON_LABELS: Record<SlateConfirmItem['reason'], string> = {
  unfiled: 'Unfiled',
  'bad-name': 'Bad name',
  'missing-yaml': 'No project.yaml',
  'bad-yaml': 'YAML problem',
}

function ConfirmQueue({ items }: { items: SlateConfirmItem[] }) {
  return (
    <div className="bg-surface rounded-xl shadow-card px-4 py-4">
      <h3 className="text-[11px] font-sans font-bold uppercase tracking-[0.14em] text-ink-2">
        Needs your confirmation
        <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] tabular-nums bg-data-coral/15 text-data-coral">
          {items.length}
        </span>
      </h3>
      <p className="text-[11px] font-sans text-ink-3 mt-1">
        The scanner files only what it can prove. These broke convention — filing actions arrive
        with a later milestone; for now, fix the file or name on disk and the queue clears itself.
      </p>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-baseline gap-2 min-w-0">
            <span className="text-[9px] font-sans font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sunken text-ink-3 flex-shrink-0">
              {REASON_LABELS[item.reason]}
            </span>
            <span className="text-[11px] font-mono text-ink truncate" title={item.path}>
              {item.path}
            </span>
            <span className="text-[11px] font-sans text-ink-3 truncate hidden sm:inline" title={item.detail}>
              {item.detail}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

