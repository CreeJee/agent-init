import { jwt } from 'hono/jwt'
import type { Context, Next } from 'hono'
import * as v from 'valibot'
import { JWTPayloadSchema, type JWTPayload } from '../schemas.js'

/**
 * Get JWT secret from environment variables
 */
export function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long')
  }
  return secret
}

/**
 * Check if user has required permission
 */
export function hasPermission(payload: JWTPayload, required: string): boolean {
  return payload.permissions.includes(required)
}

/**
 * Hono middleware for JWT authentication
 *
 * Usage:
 * ```ts
 * app.use('/mcp/*', jwtAuth())
 * app.use('/api/*', jwtAuth())
 * ```
 */
export function jwtAuth() {
  const secret = getJWTSecret()

  return async (c: Context, next: Next) => {
    // Use Hono's built-in JWT middleware
    const jwtMiddleware = jwt({ secret })

    try {
      await jwtMiddleware(c, async () => {
        // Get payload from Hono's JWT middleware
        const rawPayload = c.get('jwtPayload')

        // Validate payload structure with Valibot
        const payload = v.parse(JWTPayloadSchema, rawPayload)

        // Store validated payload in context
        c.set('jwtPayload', payload)
        c.set('teamId', payload.team_id)
        c.set('userId', payload.sub)

        await next()
      })
    } catch (error) {
      return c.json(
        {
          error: 'Unauthorized',
          message: error instanceof Error ? error.message : 'Authentication failed',
        },
        401
      )
    }
  }
}

/**
 * Hono middleware for permission-based authorization
 *
 * Usage:
 * ```ts
 * app.put('/api/context/*', jwtAuth(), requirePermission('write:docs'), ...)
 * ```
 */
export function requirePermission(permission: string) {
  return async (c: Context, next: Next) => {
    const payload = c.get('jwtPayload') as JWTPayload | undefined

    if (!payload) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'Authentication required',
        },
        403
      )
    }

    if (!hasPermission(payload, permission)) {
      return c.json(
        {
          error: 'Forbidden',
          message: `Missing required permission: ${permission}`,
        },
        403
      )
    }

    await next()
  }
}

/**
 * Helper to get JWT payload from Hono context
 */
export function getJWTPayload(c: Context): JWTPayload {
  const payload = c.get('jwtPayload') as JWTPayload | undefined
  if (!payload) {
    throw new Error('JWT payload not found in context. Did you forget to use jwtAuth() middleware?')
  }
  return payload
}

/**
 * Helper to get team ID from Hono context
 */
export function getTeamId(c: Context): string {
  const teamId = c.get('teamId') as string | undefined
  if (!teamId) {
    throw new Error('Team ID not found in context. Did you forget to use jwtAuth() middleware?')
  }
  return teamId
}
