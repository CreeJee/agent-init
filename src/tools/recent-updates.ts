import * as v from 'valibot'
import { getStorage } from '../storage/filesystem.js'
import { getPermissionManager } from '../auth/permission-manager.js'
import type { JWTPayload } from '../schemas.js'

/**
 * Input schema for recent_updates tool
 */
const RecentUpdatesInputSchema = v.object({
  workspace: v.optional(v.string()),
  limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(50))),
})

type RecentUpdatesInput = v.InferOutput<typeof RecentUpdatesInputSchema>

/**
 * recent_updates tool implementation (Workspace-based)
 *
 * Returns recently updated documents from accessible workspaces
 * - If workspace specified, returns updates from that workspace only
 * - If no workspace specified, returns updates from all accessible workspaces
 */
export async function recentUpdates(
  input: unknown,
  jwtPayload: JWTPayload
): Promise<{
  updates: Array<{
    workspace: string
    path: string
    title: string
    lastModified: string
  }>
}> {
  const params = v.parse(RecentUpdatesInputSchema, input)

  const storage = getStorage()
  const permissionManager = getPermissionManager()

  const workspaceId = params.workspace || jwtPayload.workspace_id
  const limit = params.limit || 10

  // Check if user has access to the workspace
  if (!permissionManager.canAccessWorkspace(jwtPayload, workspaceId)) {
    throw new Error(
      `Access denied: You don't have access to workspace '${workspaceId}'`
    )
  }

  // Check read permission
  if (!permissionManager.hasWorkspacePermission(jwtPayload, workspaceId, 'read')) {
    throw new Error(
      `Access denied: You don't have read permission for workspace '${workspaceId}'`
    )
  }

  // Get recent documents from workspace
  const documents = await storage.listWorkspaceDocuments(workspaceId)

  // Sort by last modified (newest first) and limit
  const recentDocs = documents
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
    .slice(0, limit)

  return {
    updates: recentDocs.map((doc) => ({
      workspace: doc.workspace,
      path: doc.path,
      title: doc.title,
      lastModified: doc.lastModified.toISOString(),
    })),
  }
}
