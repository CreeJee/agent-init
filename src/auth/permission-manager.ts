import type { JWTPayload } from '../schemas.js'
import type { FilesystemStorage } from '../storage/filesystem.js'
import { getStorage } from '../storage/filesystem.js'

/**
 * Permission Manager
 *
 * Handles all permission checks for workspace and document access.
 * Implements the principle of least privilege with explicit symlink-based permissions.
 */
export class PermissionManager {
  private storage: FilesystemStorage

  constructor(storage?: FilesystemStorage) {
    this.storage = storage || getStorage()
  }

  // ============================================================================
  // Workspace-level Permissions
  // ============================================================================

  /**
   * Check if user can access a workspace
   */
  canAccessWorkspace(jwtPayload: JWTPayload, workspaceId: string): boolean {
    // Check if workspace is in user's accessible list
    return jwtPayload.workspaces.includes(workspaceId)
  }

  /**
   * Check if user has specific permission for a workspace
   */
  hasWorkspacePermission(
    jwtPayload: JWTPayload,
    workspaceId: string,
    permission: 'read' | 'write'
  ): boolean {
    const permString = `${permission}:workspace:${workspaceId}`
    return jwtPayload.permissions.includes(permString)
  }

  /**
   * Get user's permissions for a specific workspace
   */
  getUserPermissionsForWorkspace(
    jwtPayload: JWTPayload,
    workspaceId: string
  ): string[] {
    if (!this.canAccessWorkspace(jwtPayload, workspaceId)) {
      return []
    }

    const permissions: string[] = []

    if (this.hasWorkspacePermission(jwtPayload, workspaceId, 'read')) {
      permissions.push('read')
    }

    if (this.hasWorkspacePermission(jwtPayload, workspaceId, 'write')) {
      permissions.push('write')
    }

    return permissions
  }

  // ============================================================================
  // Document-level Permissions
  // ============================================================================

  /**
   * Check if user can read a document in a workspace
   *
   * Requirements:
   * 1. User must have access to the workspace
   * 2. User must have read permission for the workspace
   * 3. Document must exist in the workspace (symlink exists)
   */
  async canReadDocument(
    jwtPayload: JWTPayload,
    workspace: string,
    path: string
  ): Promise<boolean> {
    // Check workspace access
    if (!this.canAccessWorkspace(jwtPayload, workspace)) {
      return false
    }

    // Check read permission
    if (!this.hasWorkspacePermission(jwtPayload, workspace, 'read')) {
      return false
    }

    // Check if document exists in workspace (symlink exists)
    try {
      await this.storage.readDocument(workspace, path)
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * Check if user can write a document in a workspace
   *
   * Requirements:
   * 1. User must be able to read the document
   * 2. User must have write permission for the workspace
   */
  async canWriteDocument(
    jwtPayload: JWTPayload,
    workspace: string,
    path: string
  ): Promise<boolean> {
    // Must be able to read first
    if (!(await this.canReadDocument(jwtPayload, workspace, path))) {
      return false
    }

    // Check write permission
    return this.hasWorkspacePermission(jwtPayload, workspace, 'write')
  }

  /**
   * Assert read permission (throws error if not allowed)
   */
  async assertCanReadDocument(
    jwtPayload: JWTPayload,
    workspace: string,
    path: string
  ): Promise<void> {
    if (!(await this.canReadDocument(jwtPayload, workspace, path))) {
      throw new Error(
        `Access denied: Cannot read ${workspace}/${path}. ` +
        `Check workspace access and document existence.`
      )
    }
  }

  /**
   * Assert write permission (throws error if not allowed)
   */
  async assertCanWriteDocument(
    jwtPayload: JWTPayload,
    workspace: string,
    path: string
  ): Promise<void> {
    if (!(await this.canWriteDocument(jwtPayload, workspace, path))) {
      throw new Error(
        `Access denied: Cannot write ${workspace}/${path}. ` +
        `Check workspace write permission.`
      )
    }
  }

  // ============================================================================
  // Admin Permissions
  // ============================================================================

  /**
   * Check if user is an admin
   */
  isAdmin(jwtPayload: JWTPayload): boolean {
    return jwtPayload.permissions.includes('admin:workspaces')
  }

  /**
   * Assert admin permission (throws error if not admin)
   */
  assertIsAdmin(jwtPayload: JWTPayload): void {
    if (!this.isAdmin(jwtPayload)) {
      throw new Error('Access denied: Admin permission required')
    }
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get all workspaces accessible to a user
   */
  async getAccessibleWorkspaces(jwtPayload: JWTPayload): Promise<
    Array<{
      id: string
      permissions: string[]
      documentCount: number
    }>
  > {
    const results = []

    for (const workspaceId of jwtPayload.workspaces) {
      try {
        const docs = await this.storage.listWorkspaceDocuments(workspaceId)
        const permissions = this.getUserPermissionsForWorkspace(jwtPayload, workspaceId)

        results.push({
          id: workspaceId,
          permissions,
          documentCount: docs.length,
        })
      } catch (error) {
        // Skip workspaces that don't exist or have errors
        continue
      }
    }

    return results
  }

  /**
   * Get all documents accessible to a user
   *
   * @param jwtPayload JWT payload
   * @param workspaceId Optional: filter by specific workspace
   */
  async getAccessibleDocuments(
    jwtPayload: JWTPayload,
    workspaceId?: string
  ): Promise<
    Array<{
      workspace: string
      path: string
      title: string
      size: number
      lastModified: string
    }>
  > {
    const workspaces = workspaceId
      ? [workspaceId].filter((ws) => this.canAccessWorkspace(jwtPayload, ws))
      : jwtPayload.workspaces

    const allDocs = []

    for (const ws of workspaces) {
      try {
        // Check read permission
        if (!this.hasWorkspacePermission(jwtPayload, ws, 'read')) {
          continue
        }

        const docs = await this.storage.listWorkspaceDocuments(ws)

        for (const doc of docs) {
          allDocs.push({
            workspace: doc.workspace,
            path: doc.path,
            title: doc.title,
            size: doc.size,
            lastModified: doc.lastModified.toISOString(),
          })
        }
      } catch (error) {
        // Skip workspaces with errors
        continue
      }
    }

    return allDocs
  }

  /**
   * Search documents accessible to a user
   */
  async searchAccessibleDocuments(
    jwtPayload: JWTPayload,
    query: string,
    workspaceId?: string
  ): Promise<
    Array<{
      workspace: string
      path: string
      title: string
      preview: string
      size: number
      lastModified: string
    }>
  > {
    const workspaces = workspaceId
      ? [workspaceId].filter((ws) => this.canAccessWorkspace(jwtPayload, ws))
      : jwtPayload.workspaces

    const results = []

    for (const ws of workspaces) {
      try {
        // Check read permission
        if (!this.hasWorkspacePermission(jwtPayload, ws, 'read')) {
          continue
        }

        const docs = await this.storage.searchDocuments(ws, query)

        for (const doc of docs) {
          // Generate preview (first 500 chars)
          const maxPreviewLength = parseInt(
            process.env.MAX_PREVIEW_LENGTH || '500',
            10
          )
          const preview = doc.content.substring(0, maxPreviewLength)

          results.push({
            workspace: doc.workspace,
            path: doc.path,
            title: doc.title,
            preview,
            size: doc.size,
            lastModified: doc.lastModified.toISOString(),
          })
        }
      } catch (error) {
        // Skip workspaces with errors
        continue
      }
    }

    return results
  }

  // ============================================================================
  // Storage Access Permissions (Admin only)
  // ============================================================================

  /**
   * Check if user can directly access storage (admin only)
   */
  canAccessStorage(jwtPayload: JWTPayload): boolean {
    return this.isAdmin(jwtPayload)
  }

  /**
   * Assert storage access permission
   */
  assertCanAccessStorage(jwtPayload: JWTPayload): void {
    if (!this.canAccessStorage(jwtPayload)) {
      throw new Error('Access denied: Storage access requires admin permission')
    }
  }

  /**
   * Check if user can manage workspaces (admin only)
   */
  canManageWorkspaces(jwtPayload: JWTPayload): boolean {
    return this.isAdmin(jwtPayload)
  }

  /**
   * Assert workspace management permission
   */
  assertCanManageWorkspaces(jwtPayload: JWTPayload): void {
    if (!this.canManageWorkspaces(jwtPayload)) {
      throw new Error('Access denied: Workspace management requires admin permission')
    }
  }

  /**
   * Check if user can manage symlinks (admin only)
   */
  canManageSymlinks(jwtPayload: JWTPayload): boolean {
    return this.isAdmin(jwtPayload)
  }

  /**
   * Assert symlink management permission
   */
  assertCanManageSymlinks(jwtPayload: JWTPayload): void {
    if (!this.canManageSymlinks(jwtPayload)) {
      throw new Error('Access denied: Symlink management requires admin permission')
    }
  }
}

// Singleton instance
let permissionManagerInstance: PermissionManager | null = null

/**
 * Get singleton permission manager instance
 */
export function getPermissionManager(): PermissionManager {
  if (!permissionManagerInstance) {
    permissionManagerInstance = new PermissionManager()
  }
  return permissionManagerInstance
}
