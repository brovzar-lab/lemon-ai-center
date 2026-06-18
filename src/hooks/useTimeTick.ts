import { useState, useEffect } from 'react'

/**
 * Returns a value that changes every `intervalMs` based on `Date.now()`.
 * Add the return value to `useMemo` dependency arrays that compute
 * time-dependent values (e.g. "3d overdue", "in 45 min") to prevent
 * them from going stale.
 *
 * Default interval: 60 seconds (1 minute granularity).
 */
export function useTimeTick(intervalMs = 60_000): number {
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return tick
}

/**
 * Returns the current hour (0–23) and auto-updates every minute.
 * Use this instead of `new Date().getHours()` in components that
 * need to react to time-of-day changes (morning→midday→evening).
 */
export function useCurrentHour(): number {
  const [hour, setHour] = useState(() => new Date().getHours())

  useEffect(() => {
    const id = setInterval(() => {
      const newHour = new Date().getHours()
      setHour((prev) => (prev !== newHour ? newHour : prev))
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  return hour
}
