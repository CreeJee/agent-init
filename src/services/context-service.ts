import { getStorage } from '../storage/filesystem.js'
import { getPermissionManager } from '../auth/permission-manager.js'
import type { JWTPayload } from '../schemas.js'

/**
 * Service layer for context operations (Workspace-based)
 */

/**
 * Get a context document from workspace
 */
export async function getContextDocument(
  workspace: string,
  path: string,
  userPayload: JWTPayload
): Promise<{ content: string; size: number }> {
  const storage = getStorage()
  const permissionManager = getPermissionManager()

  // Check read permission
  await permissionManager.assertCanReadDocument(userPayload, workspace, path)

  // Read document from workspace
  const doc = await storage.readDocument(workspace, path)

  return {
    content: doc.content,
    size: doc.size,
  }
}

/**
 * Update a context document in workspace
 */
export async function updateContextDocument(
  workspace: string,
  path: string,
  content: string,
  userPayload: JWTPayload
): Promise<{ success: boolean; message: string }> {
  const storage = getStorage()
  const permissionManager = getPermissionManager()

  // Check write permission
  await permissionManager.assertCanWriteDocument(userPayload, workspace, path)

  // Resolve symlink to find storage location
  const resolved = await storage.resolveSymlink(workspace, path)

  // Write to storage (updates the original file)
  await storage.writeToStorage(resolved.team, resolved.file, content)

  return {
    success: true,
    message: `Document ${workspace}/${path} updated successfully (storage: ${resolved.team}/${resolved.file})`,
  }
}
