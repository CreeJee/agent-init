import { AsyncLocalStorage } from 'node:async_hooks'
import type { JWTPayload } from './schemas.js'

/**
 * Request context for MCP tools
 */
interface RequestContext {
  jwtPayload: JWTPayload
}

/**
 * AsyncLocalStorage for request-scoped context
 *
 * This allows MCP tool handlers to access the current user's JWT payload
 * without passing it through every function call.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>()

/**
 * Get current request's JWT payload
 */
export function getCurrentUser(): JWTPayload | undefined {
  return requestContext.getStore()?.jwtPayload
}

/**
 * Get current user's team ID
 */
export function getCurrentTeamId(): string | undefined {
  return getCurrentUser()?.team_id
}

/**
 * Check if current user has permission
 */
export function hasCurrentPermission(permission: string): boolean {
  const user = getCurrentUser()
  return user?.permissions.includes(permission) ?? false
}
