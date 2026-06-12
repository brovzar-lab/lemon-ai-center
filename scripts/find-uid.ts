import 'dotenv/config'
import { db } from '../server/lib/firebase'

async function main() {
  const users = await db.collection('users').listDocuments()
  for (const u of users) {
    const tok = await u.collection('google_tokens').doc('token').get()
    const sessions = await db.collection('sessions').where('uid', '==', u.id).limit(1).get()
    const email = sessions.empty ? '(no session)' : sessions.docs[0].data().email
    console.log(`uid=${u.id} tokens=${tok.exists} email=${email}`)
  }
  process.exit(0)
}
main()
