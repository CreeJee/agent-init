import * as v from 'valibot'

// ============================================================================
// JWT Payload Schema
// ============================================================================

export const JWTPayloadSchema = v.object({
  sub: v.string(),
  team_id: v.string(),
  project_id: v.optional(v.string()),
  permissions: v.array(v.string()),
  exp: v.number(),
  iat: v.optional(v.number()),
})

export type JWTPayload = v.InferOutput<typeof JWTPayloadSchema>

// ============================================================================
// Tool Input Schemas
// ============================================================================

/**
 * search_docs tool input
 */
export const SearchDocsInputSchema = v.object({
  query: v.pipe(
    v.string(),
    v.minLength(1, 'Query must not be empty'),
    v.maxLength(500, 'Query is too long')
  ),
  team: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
})

export type SearchDocsInput = v.InferOutput<typeof SearchDocsInputSchema>

/**
 * list_teams tool input
 */
export const ListTeamsInputSchema = v.optional(v.object({}))

export type ListTeamsInput = v.InferOutput<typeof ListTeamsInputSchema>

/**
 * recent_updates tool input
 */
export const RecentUpdatesInputSchema = v.object({
  team: v.optional(v.string()),
  limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(50))),
})

export type RecentUpdatesInput = v.InferOutput<typeof RecentUpdatesInputSchema>

/**
 * write_context tool input
 */
export const WriteContextInputSchema = v.object({
  team: v.pipe(
    v.string(),
    v.minLength(1, 'Team must not be empty'),
    v.regex(/^[a-zA-Z0-9_-]+$/, 'Team name must be alphanumeric')
  ),
  file: v.pipe(
    v.string(),
    v.minLength(1, 'File name must not be empty'),
    v.regex(/^[a-zA-Z0-9_-]+\.md$/, 'File must be a markdown file')
  ),
  content: v.pipe(
    v.string(),
    v.maxLength(1048576, 'Content exceeds 1MB limit')
  ),
})

export type WriteContextInput = v.InferOutput<typeof WriteContextInputSchema>

// ============================================================================
// Response Schemas
// ============================================================================

/**
 * ResourceLink for large files
 */
export const ResourceLinkSchema = v.object({
  uri: v.string(),
  mimeType: v.literal('text/markdown'),
  description: v.optional(v.string()),
})

export type ResourceLink = v.InferOutput<typeof ResourceLinkSchema>

/**
 * Document metadata
 */
export const DocumentMetadataSchema = v.object({
  team: v.string(),
  file: v.string(),
  size: v.number(),
  lastModified: v.string(), // ISO 8601
  tags: v.optional(v.array(v.string())),
})

export type DocumentMetadata = v.InferOutput<typeof DocumentMetadataSchema>

/**
 * Search result item
 */
export const SearchResultItemSchema = v.object({
  title: v.string(),
  preview: v.string(),
  metadata: DocumentMetadataSchema,
  resourceLink: v.optional(ResourceLinkSchema),
  fullContent: v.optional(v.string()), // For small files <5KB
})

export type SearchResultItem = v.InferOutput<typeof SearchResultItemSchema>

/**
 * search_docs response
 */
export const SearchDocsResponseSchema = v.object({
  results: v.array(SearchResultItemSchema),
  totalCount: v.number(),
})

export type SearchDocsResponse = v.InferOutput<typeof SearchDocsResponseSchema>

/**
 * Team info
 */
export const TeamInfoSchema = v.object({
  name: v.string(),
  documentCount: v.number(),
  lastUpdated: v.optional(v.string()), // ISO 8601
})

export type TeamInfo = v.InferOutput<typeof TeamInfoSchema>

/**
 * list_teams response
 */
export const ListTeamsResponseSchema = v.object({
  teams: v.array(TeamInfoSchema),
})

export type ListTeamsResponse = v.InferOutput<typeof ListTeamsResponseSchema>

/**
 * recent_updates response
 */
export const RecentUpdatesResponseSchema = v.object({
  updates: v.array(
    v.object({
      team: v.string(),
      file: v.string(),
      title: v.string(),
      lastModified: v.string(),
    })
  ),
})

export type RecentUpdatesResponse = v.InferOutput<typeof RecentUpdatesResponseSchema>

/**
 * write_context response
 */
export const WriteContextResponseSchema = v.object({
  success: v.boolean(),
  team: v.string(),
  file: v.string(),
  message: v.optional(v.string()),
})

export type WriteContextResponse = v.InferOutput<typeof WriteContextResponseSchema>
