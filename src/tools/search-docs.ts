import * as v from 'valibot'
import { getStorage } from '../storage/filesystem.js'
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
 * search_docs tool implementation
 *
 * Strategy:
 * - Files <5KB: Return full content (prompt cache eligible)
 * - Files 5-50KB: Return preview + ResourceLink
 * - Files >50KB: Return metadata only
 *
 * Team filtering:
 * - Filters by user's team from JWT payload
 * - Users can only see documents from their own team
 */
export async function searchDocs(
  input: unknown,
  jwtPayload: JWTPayload
): Promise<SearchDocsResponse> {
  // Validate input
  const params = v.parse(SearchDocsInputSchema, input)

  const storage = getStorage()

  // Get team from JWT payload
  const currentTeamId = jwtPayload.team_id

  // Use current user's team for filtering (security: prevent cross-team access)
  const effectiveTeam = currentTeamId

  if (params.team && params.team !== currentTeamId) {
    // User tried to access another team's documents
    throw new Error(`Access denied: You can only search your own team (${currentTeamId})`)
  }

  // Search documents
  const documents = await storage.searchDocuments(params.query, effectiveTeam)

  // Transform to search results
  const results: SearchResultItem[] = documents.map((doc) => {
    const baseResult: SearchResultItem = {
      title: doc.title,
      preview: generatePreview(doc.content),
      metadata: storage.toMetadata(doc),
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
          uri: `context://${doc.team}/${doc.file}`,
          mimeType: 'text/markdown' as const,
          description: `Complete ${doc.title} document (${formatSize(doc.size)})`,
        },
      }
    } else {
      // Large files: metadata only (preview is already included)
      return {
        ...baseResult,
        resourceLink: {
          uri: `context://${doc.team}/${doc.file}`,
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

/**
 * Get MCP tool definition for search_docs
 */
export function getSearchDocsToolDefinition() {
  return {
    name: 'search_docs',
    description: `Search for team context documents (markdown files) by query.
Returns relevant documents with previews and metadata.
Small files (<5KB) include full content, larger files provide ResourceLinks for on-demand fetching.
Use this when you need to find team documentation, specs, or context.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant documents',
        },
        team: {
          type: 'string',
          description: 'Optional: Filter by specific team (e.g., "PM", "BE", "FE", "DESIGN")',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Filter by tags (not yet implemented)',
        },
      },
      required: ['query'],
    },
  }
}
