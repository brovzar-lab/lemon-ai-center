import { useEffect, useCallback, useRef } from 'react'
import { useBrainStore } from '@/stores/useBrainStore'

/** Folder icon based on category */
function folderIcon(folder: string): string {
  if (folder.includes('projects')) return '🎬'
  if (folder.includes('deals')) return '📋'
  if (folder.includes('people')) return '👤'
  if (folder.includes('companies')) return '🏢'
  if (folder.includes('meetings') || folder.includes('transcripts')) return '🎙'
  if (folder.includes('emails')) return '✉️'
  if (folder.includes('personal')) return '🔒'
  if (folder.includes('topics')) return '📚'
  return '📝'
}

/** Format relative time */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function BrainPanel() {
  const {
    stats,
    query,
    results,
    recent,
    loading,
    searchLoading,
    activeNote,
    activeNoteLoading,
    setQuery,
    fetchStatus,
    search,
    fetchRecent,
    openNote,
    closeNote,
  } = useBrainStore()

  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Initial load
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setQuery(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        search(value)
      }, 300)
    },
    [setQuery, search],
  )

  // Note detail view
  if (activeNote) {
    return (
      <section className="pb-4" aria-label="Brain note detail">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={closeNote}
            className="text-[11px] font-sans font-semibold text-data-coral hover:underline"
            aria-label="Back to brain search"
          >
            ← Back
          </button>
          <span className="text-[9px] font-sans text-ink-3">
            {activeNote.folder}
          </span>
        </div>
        <h3 className="font-display text-lg font-semibold text-ink mb-2">
          {activeNote.title}
        </h3>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[9px] font-sans text-ink-3">
            {timeAgo(activeNote.modifiedAt)}
          </span>
          {activeNote.links.length > 0 && (
            <span className="text-[9px] font-sans text-ink-3">
              · {activeNote.links.length} links
            </span>
          )}
        </div>
        <div className="prose-brain font-sans text-[12px] text-ink-2 leading-relaxed whitespace-pre-line max-h-[400px] overflow-y-auto">
          {activeNote.content}
        </div>
      </section>
    )
  }

  // Loading state for note
  if (activeNoteLoading) {
    return (
      <section className="pb-4" aria-label="Brain loading">
        <div className="flex items-center justify-center py-12">
          <div className="spinner" />
        </div>
      </section>
    )
  }

  const showResults = query.trim().length > 0

  return (
    <section className="pb-4" aria-label="Second brain">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="ed-section-label">Second Brain</div>
      </div>

      {/* Stats line */}
      {stats.ready && (
        <p className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3 mb-3">
          {stats.docCount} notes · {stats.chunkCount} chunks indexed
        </p>
      )}

      {/* Search input */}
      <div className="relative mb-3">
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search your brain…"
          className="w-full text-[12px] font-sans bg-sunken border border-line px-3 py-2 text-ink placeholder:text-ink-3 outline-none focus:border-line transition-colors"
          aria-label="Search Obsidian vault"
        />
        {searchLoading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <div className="w-3 h-3 rounded-full border border-accent border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      {/* Results or empty prompt */}
      {showResults ? (
        <>
          <p className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-ink-3 mb-2">
            {results.length} results
          </p>
          {loading && results.length === 0 ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-2 p-1.5">
                  <div className="skeleton w-5 h-5 flex-shrink-0 rounded" />
                  <div className="flex-1">
                    <div className="skeleton skeleton-line w-3/4" />
                    <div className="skeleton skeleton-line skeleton-line-short" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="text-[11px] font-sans text-ink-3 italic">No matching notes found.</p>
          ) : (
            <div className="flex flex-col gap-1" role="list" aria-label="Search results">
              {results.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => openNote(item.path)}
                  className="flex items-start gap-2 text-left group hover:bg-sunken/50 p-1.5 -mx-1.5 transition-colors min-h-[36px]"
                  role="listitem"
                  aria-label={`${item.title} — ${item.folder}`}
                >
                  <span className="flex-shrink-0 text-[12px] mt-0.5" aria-hidden="true">
                    {folderIcon(item.folder)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-sans font-semibold text-ink truncate leading-tight">
                      {item.title}
                      <span className="text-ink-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                    </p>
                    <p className="text-[10px] font-sans text-ink-3 truncate">
                      {item.folder} · {timeAgo(item.modifiedAt)}
                    </p>
                    {item.snippet && (
                      <p className="text-[10px] font-sans text-ink-3 mt-0.5 line-clamp-2 leading-relaxed">
                        {item.snippet}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-[11px] font-sans text-ink-3 italic">
          Type to search 321 notes across deals, people, projects, and meetings.
        </p>
      )}

      <hr className="ed-rule mt-3" />
    </section>
  )
}
