import { getStorage } from '../storage/filesystem.js'
import type { ListTeamsResponse, JWTPayload } from '../schemas.js'

/**
 * list_teams tool implementation
 *
 * Team filtering:
 * - Filters by user's team from JWT payload
 * - Users can only see their own team information
 */
export async function listTeams(jwtPayload: JWTPayload): Promise<ListTeamsResponse> {
  const storage = getStorage()

  // Get team from JWT payload
  const currentTeamId = jwtPayload.team_id

  // Only return current user's team
  const docs = await storage.listTeamDocuments(currentTeamId)

  const lastUpdated =
    docs.length > 0
      ? docs
          .map((d) => d.lastModified)
          .sort((a, b) => b.getTime() - a.getTime())[0]
          .toISOString()
      : undefined

  const teams = [
    {
      name: currentTeamId,
      documentCount: docs.length,
      lastUpdated,
    },
  ]

  return { teams }
}

/**
 * Get MCP tool definition for list_teams
 */
export function getListTeamsToolDefinition() {
  return {
    name: 'list_teams',
    description: `List all available teams and their document counts.
Useful for discovering which teams have context documents available.
Common teams: PM, BE (Backend), FE (Frontend), DESIGN, SALES, etc.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  }
}
