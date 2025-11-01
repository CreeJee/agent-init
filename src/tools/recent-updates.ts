import * as v from 'valibot'
import { getStorage } from '../storage/filesystem.js'
import type { RecentUpdatesInput, RecentUpdatesResponse, JWTPayload } from '../schemas.js'
import { RecentUpdatesInputSchema } from '../schemas.js'

/**
 * recent_updates tool implementation
 *
 * Team filtering:
 * - Filters by user's team from JWT payload
 * - Users can only see updates from their own team
 */
export async function recentUpdates(
  input: unknown,
  jwtPayload: JWTPayload
): Promise<RecentUpdatesResponse> {
  const params = v.parse(RecentUpdatesInputSchema, input)

  const storage = getStorage()

  // Get team from JWT payload
  const currentTeamId = jwtPayload.team_id

  // Use current user's team for filtering
  const effectiveTeam = currentTeamId

  if (params.team && params.team !== currentTeamId) {
    throw new Error(`Access denied: You can only view updates from your own team (${currentTeamId})`)
  }

  const limit = params.limit || 10

  const documents = await storage.getRecentUpdates(limit, effectiveTeam)

  return {
    updates: documents.map((doc) => ({
      team: doc.team,
      file: doc.file,
      title: doc.title,
      lastModified: doc.lastModified.toISOString(),
    })),
  }
}

/**
 * Get MCP tool definition for recent_updates
 */
export function getRecentUpdatesToolDefinition() {
  return {
    name: 'recent_updates',
    description: `Get recently updated context documents across teams.
Useful for discovering what has changed recently.
Returns up to 50 documents, sorted by modification time (newest first).`,
    inputSchema: {
      type: 'object',
      properties: {
        team: {
          type: 'string',
          description: 'Optional: Filter by specific team',
        },
        limit: {
          type: 'number',
          description: 'Optional: Maximum number of results (1-50, default: 10)',
          minimum: 1,
          maximum: 50,
        },
      },
    },
  }
}
