import { getPermissionManager } from '../auth/permission-manager.js'
import type { JWTPayload, ListWorkspacesResponse } from '../schemas.js'

/**
 * list_workspaces tool implementation
 *
 * Returns all workspaces accessible to the user with:
 * - Workspace ID and name
 * - Document count
 * - Last modified time
 * - User's permissions for each workspace
 */
export async function listWorkspaces(jwtPayload: JWTPayload): Promise<ListWorkspacesResponse> {
  const permissionManager = getPermissionManager()

  // Get all accessible workspaces with details
  const workspaces = await permissionManager.getAccessibleWorkspaces(jwtPayload)

  const workspaceInfos = workspaces.map((ws) => ({
    id: ws.id,
    name: ws.id, // TODO: Load display name from metadata if available
    documentCount: ws.documentCount,
    permissions: ws.permissions,
  }))

  return {
    workspaces: workspaceInfos,
  }
}
