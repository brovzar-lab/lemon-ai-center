/**
 * Out-of-app failure alerting for the engine.
 *
 * When a scheduled job (morning assembly, inbox scan, ...) throws, the ledger
 * + console are the only record — invisible unless Billy opens the dashboard.
 * If ALERT_WEBHOOK_URL is set (Slack/Discord/any JSON webhook), post a short
 * failure notice so a 5:30am morning-assembly failure actually reaches him.
 *
 * Deliberately best-effort: a webhook failure must NEVER throw into the job
 * path, and no webhook configured is a silent no-op (no regression).
 */
export async function notifyJobFailure(jobId: string, message: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL
  if (!url) return

  const text = `⚠️ Lemon AI Center — job "${jobId}" failed: ${message}`
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `text` (Slack) and `content` (Discord) — each service ignores the other key.
      body: JSON.stringify({ text, content: text }),
    })
  } catch (err) {
    console.error('[engine] Failure alert webhook errored:', (err as Error).message)
  }
}
