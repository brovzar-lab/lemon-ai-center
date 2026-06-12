import 'dotenv/config'
import { db } from '../server/lib/firebase'

async function main() {
  const uid = process.env.CEO_UID!
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
  const note = (await db.doc(`users/${uid}/advisor/${date}`).get()).data()
  console.log('=== ADVISOR ===')
  console.log('HEADLINE:', note?.headline)
  console.log('BODY:', note?.body)
  console.log('CALLOUTS:', JSON.stringify(note?.callouts, null, 1))
  const fronts = (await db.doc(`users/${uid}/state/fronts`).get()).data()
  console.log('=== FRONTS ===')
  for (const f of fronts?.fronts ?? []) console.log(`${f.rank}. [${f.status}] ${f.key}: ${f.headline}`)
  const burnout = (await db.doc(`users/${uid}/state/burnout`).get()).data()
  console.log('=== BURNOUT ===', JSON.stringify(burnout))
  const scripts = await db.collection(`users/${uid}/scripts`).get()
  console.log('=== SCRIPTS ===')
  for (const s of scripts.docs) { const d = s.data(); console.log(`- ${d.title} [${d.stage}] touched=${d.lastTouchedAt?.slice(0,10) ?? 'never'}`) }
  const investors = await db.collection(`users/${uid}/investors`).get()
  console.log('=== INVESTORS ===')
  for (const i of investors.docs) { const d = i.data(); console.log(`- ${d.name} (${d.org ?? '-'}) [${d.stage}] ${d.amountMXN ? (d.amountMXN/1e6)+'M' : ''}`) }
  const slips = (await db.doc(`users/${uid}/state/slips`).get()).data()
  console.log('=== SLIPS ===', slips?.slips?.length)
  for (const s of (slips?.slips ?? []).slice(0, 8)) console.log(`- [${s.severity}] ${s.summary}`)
  process.exit(0)
}
main()
