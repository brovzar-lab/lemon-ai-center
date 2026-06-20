import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { briefRouter } from './brief'
import { chatRouter } from './aiChat'
import { sparkRouter } from './spark'

export const claudeRouter = Router()
claudeRouter.use(requireAuth)
claudeRouter.use(briefRouter)
claudeRouter.use(chatRouter)
claudeRouter.use(sparkRouter)

// Re-export for engine consumers
export { assembleContext } from './brief'
