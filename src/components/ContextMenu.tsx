import { useEffect, useRef, useState, useCallback } from 'react'

export interface ContextAction {
  label: string
  icon?: string
  danger?: boolean
  /** If provided, renders an inline text input instead of a button */
  input?: {
    placeholder: string
    onSubmit: (value: string) => void
  }
  onClick?: () => void
}

interface ContextMenuProps {
  actions: ContextAction[]
  onClose: () => void
  x: number
  y: number
}

export function ContextMenu({ actions, onClose, x, y }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState('')
  const [activeInput, setActiveInput] = useState<number | null>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position so it doesn't overflow the viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 260),
    top: Math.min(y, window.innerHeight - 300),
    zIndex: 9999,
  }

  return (
    <div ref={ref} style={style} className="ctx-menu">
      {actions.map((action, i) => {
        if (action.input) {
          if (activeInput === i) {
            return (
              <form
                key={i}
                className="ctx-input-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (inputValue.trim()) {
                    action.input!.onSubmit(inputValue.trim())
                    setInputValue('')
                    setActiveInput(null)
                    onClose()
                  }
                }}
              >
                <input
                  autoFocus
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={action.input.placeholder}
                  className="ctx-input"
                />
                <button type="submit" className="ctx-input-submit">↵</button>
              </form>
            )
          }
          return (
            <button
              key={i}
              type="button"
              className="ctx-item"
              onClick={() => { setActiveInput(i); setInputValue('') }}
            >
              {action.icon && <span className="ctx-icon">{action.icon}</span>}
              <span>{action.label}</span>
            </button>
          )
        }
        return (
          <button
            key={i}
            type="button"
            className={`ctx-item ${action.danger ? 'ctx-danger' : ''}`}
            onClick={() => { action.onClick?.(); onClose() }}
          >
            {action.icon && <span className="ctx-icon">{action.icon}</span>}
            <span>{action.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Hook: attach to any element to get right-click context menu state.
 *
 * Usage:
 *   const { contextMenu, onContextMenu, closeMenu } = useContextMenu()
 *   <div onContextMenu={onContextMenu}> ... </div>
 *   {contextMenu && <ContextMenu {...contextMenu} actions={[...]} onClose={closeMenu} />}
 */
export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const closeMenu = useCallback(() => setContextMenu(null), [])

  return { contextMenu, onContextMenu, closeMenu }
}
