import { useEffect, useCallback, type ReactNode } from 'react'
import { useFocusModeStore } from '@/stores/useFocusModeStore'

interface FocusModeProviderProps {
  children: ReactNode
}

/** Wraps the dashboard to provide F/Esc keybindings for focus mode toggle. */
export function FocusModeProvider({ children }: FocusModeProviderProps) {
  const toggle = useFocusModeStore((s) => s.toggle)
  const exit = useFocusModeStore((s) => s.exit)
  const active = useFocusModeStore((s) => s.active)

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement).isContentEditable) return

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggle()
      }
      if (e.key === 'Escape' && active) {
        e.preventDefault()
        exit()
      }
    },
    [toggle, exit, active],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  return <>{children}</>
}
