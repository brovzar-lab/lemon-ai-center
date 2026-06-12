import { db } from '../../firebase'
import { writeState } from '../data'
import type { QuoteSnapshot, WatchlistItem } from '@shared/types'

/**
 * Weekday market-close snapshot for Billy's personal watchlist.
 * Uses the Finnhub free tier; gracefully no-ops without FINNHUB_API_KEY
 * (same pattern as other optional integrations).
 */
export async function runWatchlist(uid: string): Promise<void> {
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    console.log('[watchlist] FINNHUB_API_KEY not set — skipping quotes')
    return
  }

  const snap = await db.collection(`users/${uid}/watchlist`).get()
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WatchlistItem)
  if (!items.length) return

  const quotes: QuoteSnapshot[] = []
  for (const item of items) {
    try {
      const ticker = item.ticker.toUpperCase()
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`,
      )
      if (!res.ok) continue
      const q = (await res.json()) as { c: number; d: number; dp: number }
      if (typeof q.c !== 'number' || q.c === 0) continue
      quotes.push({
        ticker,
        price: q.c,
        change: q.d ?? 0,
        changePct: q.dp ?? 0,
        asOf: new Date().toISOString(),
      })
    } catch (err) {
      console.warn(`[watchlist] Quote failed for ${item.ticker}:`, (err as Error).message)
    }
  }

  await writeState(uid, 'quotes', { quotes, computedAt: new Date().toISOString() })
}
