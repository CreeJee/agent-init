import { getStorage } from '../storage/filesystem.js'
import type { JWTPayload } from '../schemas.js'

/**
 * Service layer for context operations
 */

/**
 * Get a context document
 */
export async function getContextDocument(
  team: string,
  file: string,
  userPayload: JWTPayload
): Promise<{ content: string; size: number }> {
  // Verify team access
  if (userPayload.team_id !== team) {
    throw new Error(`Access denied to team '${team}'. Your team is '${userPayload.team_id}'`)
  }

  const storage = getStorage()
  const doc = await storage.readDocument(team, file)

  return {
    content: doc.content,
    size: doc.size,
  }
}

/**
 * Update or create a context document
 */
export async function updateContextDocument(
  team: string,
  file: string,
  content: string,
  userPayload: JWTPayload
): Promise<{ success: boolean; message: string }> {
  // Verify team access
  if (userPayload.team_id !== team) {
    throw new Error(`Cannot write to team '${team}'. Your team is '${userPayload.team_id}'`)
  }

  // Check write permission
  if (!userPayload.permissions.includes('write:docs')) {
    throw new Error('Missing required permission: write:docs')
  }

  const storage = getStorage()
  await storage.writeDocument(team, file, content)

  return {
    success: true,
    message: `Document ${team}/${file} updated successfully`,
  }
}
