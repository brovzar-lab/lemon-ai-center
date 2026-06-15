import { useEffect } from 'react'
import { useInboxStore } from '@/stores/useInboxStore'
import { useCalendarStore } from '@/stores/useCalendarStore'
import { useBriefStore } from '@/stores/useBriefStore'

const TWO_MINUTES = 2 * 60 * 1000
const FIVE_MINUTES = 5 * 60 * 1000
const THIRTY_MINUTES = 30 * 60 * 1000

/**
 * Polling engine — sets up background refresh intervals for data freshness.
 * Call this once in Dashboard.tsx. Cleans up on unmount.
 *
 * - Gmail threads: every 5 minutes
 * - Calendar events: every 5 minutes
 * - Brief freshness check: every 30 minutes
 */
export function usePollingEngine() {
  useEffect(() => {
    const gmailInterval = setInterval(() => {
      useInboxStore.getState().fetch()
    }, TWO_MINUTES)

    const calendarInterval = setInterval(() => {
      useCalendarStore.getState().fetch()
    }, FIVE_MINUTES)

    const briefInterval = setInterval(() => {
      // Only trigger a non-forced refresh to check freshness
      const { generatedAt } = useBriefStore.getState()
      if (generatedAt) {
        const age = Date.now() - new Date(generatedAt).getTime()
        // If brief is older than 30 minutes, refresh
        if (age > THIRTY_MINUTES) {
          useBriefStore.getState().refresh()
        }
      }
    }, THIRTY_MINUTES)

    return () => {
      clearInterval(gmailInterval)
      clearInterval(calendarInterval)
      clearInterval(briefInterval)
    }
  }, [])
}
