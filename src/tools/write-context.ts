import * as v from 'valibot'
import { getStorage } from '../storage/filesystem.js'
import type { WriteContextInput, WriteContextResponse, JWTPayload } from '../schemas.js'
import { WriteContextInputSchema } from '../schemas.js'

/**
 * write_context tool implementation
 *
 * Permissions:
 * - Requires write:docs permission
 * - Can only write to user's own team
 */
export async function writeContext(
  input: unknown,
  jwtPayload: JWTPayload
): Promise<WriteContextResponse> {
  // Get team from JWT payload
  const currentTeamId = jwtPayload.team_id

  // Check write permission
  if (!jwtPayload.permissions.includes('write:docs')) {
    throw new Error('Missing required permission: write:docs')
  }

  const params = v.parse(WriteContextInputSchema, input)

  const storage = getStorage()

  // Users can only write to their own team
  if (params.team !== currentTeamId) {
    throw new Error(`Permission denied: Cannot write to team '${params.team}'. Your team is '${currentTeamId}'`)
  }

  await storage.writeDocument(params.team, params.file, params.content)

  return {
    success: true,
    team: params.team,
    file: params.file,
    message: `Document ${params.team}/${params.file} updated successfully`,
  }
}

/**
 * Get MCP tool definition for write_context
 */
export function getWriteContextToolDefinition() {
  return {
    name: 'write_context',
    description: `Create or update a team context document.
Requires write:docs permission.
Use this to update outdated documentation or create new context files.
Maximum content size: 1MB.`,
    inputSchema: {
      type: 'object',
      properties: {
        team: {
          type: 'string',
          description: 'Team name (alphanumeric, dashes, underscores)',
        },
        file: {
          type: 'string',
          description: 'File name (must end with .md)',
        },
        content: {
          type: 'string',
          description: 'Markdown content to write',
        },
      },
      required: ['team', 'file', 'content'],
    },
  }
}
