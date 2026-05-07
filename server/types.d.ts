import 'express-session'

declare module 'express-session' {
  interface SessionData {
    uid: string
    email: string
    oauthState?: string
  }
}

export {}
