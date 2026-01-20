import type { Context } from 'hono'
import * as v from 'valibot'
import { getStorage } from '../storage/filesystem.js'
import { getPermissionManager } from '../auth/permission-manager.js'
import { getJWTPayload } from '../auth/jwt.js'
import {
  CreateWorkspaceInputSchema,
  CreateSymlinkInputSchema,
  type WorkspaceInfo,
} from '../schemas.js'

const storage = getStorage()
const permissionManager = getPermissionManager()

// ============================================================================
// Workspace Management
// ============================================================================

/**
 * POST /admin/workspaces
 * Create a new workspace
 */
export async function createWorkspaceHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  try {
    const body = await c.req.json()
    const input = v.parse(CreateWorkspaceInputSchema, body)

    // Create workspace
    await storage.createWorkspace(input.id)

    return c.json(
      {
        success: true,
        workspace: {
          id: input.id,
          name: input.name,
          description: input.description,
        },
        message: `Workspace '${input.id}' created successfully`,
      },
      201
    )
  } catch (error) {
    if (error instanceof v.ValiError) {
      return c.json(
        {
          error: 'Validation error',
          details: error.issues,
        },
        400
      )
    }

    return c.json(
      {
        error: 'Failed to create workspace',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

/**
 * DELETE /admin/workspaces/:workspace
 * Delete a workspace
 */
export async function deleteWorkspaceHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  const workspaceId = c.req.param('workspace')

  try {
    await storage.deleteWorkspace(workspaceId)

    return c.json({
      success: true,
      message: `Workspace '${workspaceId}' deleted successfully`,
    })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to delete workspace',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

/**
 * GET /admin/workspaces
 * List all workspaces with details
 */
export async function listWorkspacesHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  try {
    const workspaceIds = await storage.listWorkspaces()

    const workspaces: WorkspaceInfo[] = await Promise.all(
      workspaceIds.map(async (id) => {
        try {
          const docs = await storage.listWorkspaceDocuments(id)
          const symlinks = await storage.listSymlinks(id)

          // Get last modified time from documents
          let lastModified: string | undefined
          if (docs.length > 0) {
            const sortedDocs = docs.sort(
              (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
            )
            lastModified = sortedDocs[0].lastModified.toISOString()
          }

          return {
            id,
            name: id, // TODO: Load from metadata if available
            documentCount: docs.length,
            lastModified,
            permissions: ['read', 'write'], // Admin has all permissions
          }
        } catch (error) {
          return {
            id,
            name: id,
            documentCount: 0,
            permissions: [],
          }
        }
      })
    )

    return c.json({
      workspaces,
      totalCount: workspaces.length,
    })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to list workspaces',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

/**
 * GET /admin/workspaces/:workspace
 * Get workspace details
 */
export async function getWorkspaceHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  const workspaceId = c.req.param('workspace')

  try {
    const exists = await storage.workspaceExists(workspaceId)
    if (!exists) {
      return c.json(
        {
          error: 'Workspace not found',
          workspace: workspaceId,
        },
        404
      )
    }

    const docs = await storage.listWorkspaceDocuments(workspaceId)
    const symlinks = await storage.listSymlinks(workspaceId)
    const brokenLinks = await storage.validateSymlinks(workspaceId)

    // Get last modified time
    let lastModified: string | undefined
    if (docs.length > 0) {
      const sortedDocs = docs.sort(
        (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
      )
      lastModified = sortedDocs[0].lastModified.toISOString()
    }

    return c.json({
      workspace: {
        id: workspaceId,
        name: workspaceId,
        documentCount: docs.length,
        symlinkCount: symlinks.length,
        brokenLinkCount: brokenLinks.length,
        lastModified,
      },
      documents: docs.map((doc) => ({
        path: doc.path,
        title: doc.title,
        size: doc.size,
        lastModified: doc.lastModified.toISOString(),
        sourceTeam: doc.sourceTeam,
        sourceFile: doc.sourceFile,
      })),
      symlinks,
      brokenLinks,
    })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to get workspace details',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

// ============================================================================
// Symlink Management
// ============================================================================

/**
 * POST /admin/workspaces/:workspace/links
 * Create a symlink in workspace
 */
export async function createSymlinkHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  const workspaceId = c.req.param('workspace')

  try {
    const body = await c.req.json()
    const input = v.parse(CreateSymlinkInputSchema, body)

    // Create symlink
    await storage.createSymlink(
      workspaceId,
      input.sourceTeam,
      input.sourceFile,
      input.targetPath
    )

    return c.json(
      {
        success: true,
        workspace: workspaceId,
        symlink: {
          targetPath: input.targetPath,
          source: `${input.sourceTeam}/${input.sourceFile}`,
        },
        message: 'Symlink created successfully',
      },
      201
    )
  } catch (error) {
    if (error instanceof v.ValiError) {
      return c.json(
        {
          error: 'Validation error',
          details: error.issues,
        },
        400
      )
    }

    return c.json(
      {
        error: 'Failed to create symlink',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

/**
 * DELETE /admin/workspaces/:workspace/links/:path
 * Delete a symlink from workspace
 */
export async function deleteSymlinkHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  const workspaceId = c.req.param('workspace')
  const symlinkPath = c.req.param('path')

  try {
    await storage.removeSymlink(workspaceId, symlinkPath)

    return c.json({
      success: true,
      message: `Symlink '${symlinkPath}' deleted successfully`,
    })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to delete symlink',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

/**
 * GET /admin/workspaces/:workspace/links
 * List all symlinks in workspace
 */
export async function listSymlinksHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  const workspaceId = c.req.param('workspace')

  try {
    const symlinks = await storage.listSymlinks(workspaceId)

    return c.json({
      workspace: workspaceId,
      links: symlinks,
      totalCount: symlinks.length,
      validCount: symlinks.filter((s) => s.isValid).length,
      brokenCount: symlinks.filter((s) => !s.isValid).length,
    })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to list symlinks',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

/**
 * GET /admin/workspaces/:workspace/links/validate
 * Validate all symlinks and return broken ones
 */
export async function validateSymlinksHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  const workspaceId = c.req.param('workspace')

  try {
    const brokenLinks = await storage.validateSymlinks(workspaceId)

    return c.json({
      workspace: workspaceId,
      brokenLinks,
      count: brokenLinks.length,
      isHealthy: brokenLinks.length === 0,
    })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to validate symlinks',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

// ============================================================================
// Storage Management
// ============================================================================

/**
 * GET /admin/storage
 * List all teams in storage
 */
export async function listStorageTeamsHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  try {
    // Read storage directory
    const fs = await import('fs/promises')
    const path = await import('path')

    const storageDir = path.join(
      process.env.AGENT_INIT_DIR || './.agent-init',
      'storage'
    )

    const entries = await fs.readdir(storageDir, { withFileTypes: true })
    const teams = entries.filter((e) => e.isDirectory()).map((e) => e.name)

    const teamInfos = await Promise.all(
      teams.map(async (team) => {
        const files = await storage.listStorageFiles(team)
        return {
          team,
          fileCount: files.length,
          totalSize: files.reduce((sum, f) => sum + f.size, 0),
        }
      })
    )

    return c.json({
      teams: teamInfos,
      totalCount: teams.length,
    })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to list storage teams',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

/**
 * GET /admin/storage/:team
 * List files in storage team with reverse references
 */
export async function listStorageFilesHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  const team = c.req.param('team')

  try {
    const files = await storage.listStorageFiles(team)

    return c.json({
      team,
      files,
      totalCount: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
    })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to list storage files',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

/**
 * GET /admin/storage/:team/:file
 * Get storage file details with reverse references
 */
export async function getStorageFileHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  const team = c.req.param('team')
  const file = c.req.param('file')

  try {
    const doc = await storage.readFromStorage(team, file)
    const files = await storage.listStorageFiles(team)
    const fileInfo = files.find((f) => f.file === file)

    if (!fileInfo) {
      return c.json(
        {
          error: 'File not found in storage',
          team,
          file,
        },
        404
      )
    }

    return c.json({
      team,
      file,
      title: doc.title,
      size: doc.size,
      lastModified: doc.lastModified.toISOString(),
      linkedBy: fileInfo.linkedBy,
      linkCount: fileInfo.linkedBy.length,
    })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to get storage file',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

/**
 * POST /admin/storage/:team
 * Create or update a file in storage
 */
export async function updateStorageFileHandler(c: Context) {
  const jwtPayload = getJWTPayload(c)

  // Check admin permission
  permissionManager.assertIsAdmin(jwtPayload)

  const team = c.req.param('team')

  try {
    const body = await c.req.json()

    if (!body.file || !body.content) {
      return c.json(
        {
          error: 'Missing required fields',
          required: ['file', 'content'],
        },
        400
      )
    }

    await storage.writeToStorage(team, body.file, body.content)

    return c.json({
      success: true,
      team,
      file: body.file,
      message: 'Storage file updated successfully',
    })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to update storage file',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}
