import * as v from 'valibot'
import { getStorage } from '../storage/filesystem.js'
import { getPermissionManager } from '../auth/permission-manager.js'
import type { SearchDocsInput, SearchDocsResponse, SearchResultItem, JWTPayload } from '../schemas.js'
import { SearchDocsInputSchema } from '../schemas.js'

/**
 * File size thresholds for different strategies
 */
const SMALL_FILE_THRESHOLD = 5 * 1024 // 5KB - include full content
const LARGE_FILE_THRESHOLD = 50 * 1024 // 50KB - only metadata

/**
 * Preview length
 */
const PREVIEW_LENGTH = parseInt(process.env.MAX_PREVIEW_LENGTH || '500', 10)

/**
 * search_docs tool implementation (Workspace-based)
 *
 * Strategy:
 * - Files <5KB: Return full content (prompt cache eligible)
 * - Files 5-50KB: Return preview + ResourceLink
 * - Files >50KB: Return metadata only
 *
 * Workspace filtering:
 * - Uses workspace_id from JWT payload by default
 * - Users can search in any workspace they have access to
 * - Permission checked via PermissionManager
 */
export async function searchDocs(
  input: unknown,
  jwtPayload: JWTPayload
): Promise<SearchDocsResponse> {
  // Validate input
  const params = v.parse(SearchDocsInputSchema, input)

  const storage = getStorage()
  const permissionManager = getPermissionManager()

  // Determine which workspace to search
  const workspaceId = params.workspace || jwtPayload.workspace_id

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

  // Search documents in the workspace
  const documents = await storage.searchDocuments(workspaceId, params.query)

  // Transform to search results
  const results: SearchResultItem[] = documents.map((doc) => {
    const baseResult: SearchResultItem = {
      title: doc.title,
      preview: generatePreview(doc.content),
      metadata: {
        team: doc.sourceTeam || 'unknown',
        file: doc.sourceFile || doc.path,
        size: doc.size,
        lastModified: doc.lastModified.toISOString(),
      },
    }

    // Strategy based on file size
    if (doc.size < SMALL_FILE_THRESHOLD) {
      // Small files: include full content for prompt caching
      return {
        ...baseResult,
        fullContent: doc.content,
      }
    } else if (doc.size < LARGE_FILE_THRESHOLD) {
      // Medium files: preview + ResourceLink
      return {
        ...baseResult,
        resourceLink: {
          uri: `context://${workspaceId}/${doc.path}`,
          mimeType: 'text/markdown' as const,
          description: `Complete ${doc.title} document (${formatSize(doc.size)})`,
        },
      }
    } else {
      // Large files: metadata only (preview is already included)
      return {
        ...baseResult,
        resourceLink: {
          uri: `context://${workspaceId}/${doc.path}`,
          mimeType: 'text/markdown' as const,
          description: `Large document: ${doc.title} (${formatSize(doc.size)}). Request full content if needed.`,
        },
      }
    }
  })

  return {
    results,
    totalCount: results.length,
  }
}

/**
 * Generate preview from content
 */
function generatePreview(content: string): string {
  if (content.length <= PREVIEW_LENGTH) {
    return content
  }

  // Try to cut at word boundary
  const preview = content.substring(0, PREVIEW_LENGTH)
  const lastSpace = preview.lastIndexOf(' ')

  if (lastSpace > PREVIEW_LENGTH * 0.8) {
    return preview.substring(0, lastSpace) + '...'
  }

  return preview + '...'
}

/**
 * Format file size for human reading
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
