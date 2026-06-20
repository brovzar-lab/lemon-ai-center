import { AuthGate } from '@/components/AuthGate'
import { Dashboard } from '@/components/Dashboard'

export function App() {
  return (
    <AuthGate>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-bg focus:px-4 focus:py-2 focus:rounded focus:ring-2 focus:ring-data-coral"
      >
        Skip to content
      </a>
      <Dashboard />
    </AuthGate>
  )
}
