import { useState } from 'react'
import type { DragEvent, ReactNode } from 'react'

export interface BoardColumnDef<TKey extends string> {
  key: TKey
  label: string
  /** CSS color string used for accent dot + active border. Use design tokens. */
  accent: string
  /** Optional descriptive subtitle shown beneath the column header. */
  subtitle?: string
}

export interface BoardKanbanProps<T extends { id: string }, TKey extends string> {
  columns: BoardColumnDef<TKey>[]
  items: T[]
  /** Read column for an item. */
  getColumn: (item: T) => TKey
  /** Called when an item is dropped on a different column. */
  onMove: (id: string, target: TKey) => void
  /** Render the card body (drag affordance is wrapped automatically). */
  renderCard: (item: T) => ReactNode
  /** Optional click-through (does not fire while dragging). */
  onCardClick?: (item: T) => void
  /** Optional right-click handler for context menus. */
  onCardContextMenu?: (item: T, e: React.MouseEvent) => void
  /** Per-column empty placeholder. */
  emptyHint?: string
  /** Column width minimum, default `min-w-[240px]`. */
  columnMinWidth?: string
}

/**
 * Reusable kanban board with native HTML5 drag-and-drop. Zero new
 * dependencies, accessible to keyboard via the underlying buttons in
 * each card if rendered with `<button>` semantics.
 *
 * Visual style follows CEO design tokens — opaque surfaces, soft
 * borders, accent dot per column, no glassmorphism.
 */
export function BoardKanban<T extends { id: string }, TKey extends string>({
  columns,
  items,
  getColumn,
  onMove,
  renderCard,
  onCardClick,
  onCardContextMenu,
  emptyHint = 'Drop here',
  // Mobile: each column fills the screen and snaps one-at-a-time when swiped.
  // Desktop (sm+): normal 240px columns side by side.
  columnMinWidth = 'min-w-[86vw] sm:min-w-[240px]',
}: BoardKanbanProps<T, TKey>) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<TKey | null>(null)

  const grouped = new Map<TKey, T[]>()
  for (const col of columns) grouped.set(col.key, [])
  for (const item of items) {
    const colKey = getColumn(item)
    const list = grouped.get(colKey)
    if (list) list.push(item)
    else {
      // Item with unknown column — drop into the first column so it
      // remains visible rather than silently disappearing.
      const first = columns[0]?.key
      if (first) grouped.get(first)?.push(item)
    }
  }

  function onCardDragStart(e: DragEvent<HTMLDivElement>, id: string) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    setDraggingId(id)
  }

  function onCardDragEnd() {
    setDraggingId(null)
    setOverColumn(null)
  }

  function onColumnDragOver(e: DragEvent<HTMLDivElement>, key: TKey) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (overColumn !== key) setOverColumn(key)
  }

  function onColumnDragLeave(_e: DragEvent<HTMLDivElement>, key: TKey) {
    if (overColumn === key) setOverColumn(null)
  }

  function onColumnDrop(e: DragEvent<HTMLDivElement>, key: TKey) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || draggingId
    setDraggingId(null)
    setOverColumn(null)
    if (!id) return
    onMove(id, key)
  }

  return (
    <div className="grid gap-3 grid-flow-col auto-cols-fr overflow-x-auto pb-2 snap-x snap-mandatory scroll-pl-1 [-webkit-overflow-scrolling:touch]">
      {columns.map((col) => {
        const colItems = grouped.get(col.key) ?? []
        const isOver = overColumn === col.key
        return (
          <section
            key={col.key}
            aria-label={col.label}
            className={`flex flex-col snap-start ${columnMinWidth}`}
          >
            {/* Header */}
            <header className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: col.accent }}
                />
                <span className="text-[10px] font-sans font-bold uppercase tracking-[0.18em] text-ink-2">
                  {col.label}
                </span>
              </div>
              <span className="text-[10px] font-sans tabular-nums text-ink-3">
                {colItems.length}
              </span>
            </header>
            {col.subtitle && (
              <p className="text-[10px] italic font-sans text-ink-3 px-1 mb-2 leading-snug">
                {col.subtitle}
              </p>
            )}

            {/* Drop zone */}
            <div
              onDragOver={(e) => onColumnDragOver(e, col.key)}
              onDragLeave={(e) => onColumnDragLeave(e, col.key)}
              onDrop={(e) => onColumnDrop(e, col.key)}
              className={[
                'flex-1 min-h-[120px] rounded-xl p-2 space-y-2 border transition-colors',
                isOver
                  ? 'bg-sunken border-accent/40'
                  : 'bg-surface border-line',
              ].join(' ')}
            >
              {colItems.map((item) => {
                const isDragging = draggingId === item.id
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => onCardDragStart(e, item.id)}
                    onDragEnd={onCardDragEnd}
                    onClick={() => {
                      if (!isDragging) onCardClick?.(item)
                    }}
                    onContextMenu={(e) => {
                      if (onCardContextMenu) {
                        e.preventDefault()
                        onCardContextMenu(item, e)
                      }
                    }}
                    role={onCardClick ? 'button' : undefined}
                    tabIndex={onCardClick ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (!onCardClick) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onCardClick(item)
                      }
                    }}
                    className={[
                      'group relative cursor-grab active:cursor-grabbing rounded-lg border bg-bg px-3 py-2.5 transition-all',
                      'border-line hover:border-line hover:bg-sunken',
                      isDragging ? 'opacity-30 scale-[0.98]' : 'opacity-100',
                    ].join(' ')}
                    style={
                      isDragging
                        ? undefined
                        : { boxShadow: '0 1px 0 rgba(0,0,0,0.04)' }
                    }
                  >
                    {renderCard(item)}
                  </div>
                )
              })}
              {colItems.length === 0 && (
                <p className="text-[11px] italic font-sans text-ink-3 text-center py-6">
                  {emptyHint}
                </p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
