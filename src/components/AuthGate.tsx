import { useEffect } from 'react'
import { useAuthStore } from '@/stores/useAuthStore'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}
