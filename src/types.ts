import type { JWTPayload } from './schemas.js'

/**
 * Hono context variables (globally shared)
 */
export type AppVariables = {
  jwtPayload: JWTPayload
  teamId: string
  userId: string
}
