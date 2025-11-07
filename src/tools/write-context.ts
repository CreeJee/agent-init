import * as v from 'valibot'
import { getStorage } from '../storage/filesystem.js'
import { getPermissionManager } from '../auth/permission-manager.js'
import type { JWTPayload } from '../schemas.js'

/**
 * Input schema for write_context tool
 */
const WriteContextInputSchema = v.object({
  workspace: v.pipe(
    v.string(),
    v.minLength(1, 'Workspace must not be empty'),
    v.regex(/^[a-zA-Z0-9_-]+$/, 'Workspace name must be alphanumeric')
  ),
  path: v.pipe(
    v.string(),
    v.minLength(1, 'Path must not be empty'),
    v.regex(/^[a-zA-Z0-9_-]+\.md$/, 'Path must be a markdown file')
  ),
  content: v.pipe(
    v.string(),
    v.maxLength(1048576, 'Content exceeds 1MB limit')
  ),
})

type WriteContextInput = v.InferOutput<typeof WriteContextInputSchema>

/**
 * write_context tool implementation (Workspace-based)
 *
 * Updates documents in workspace by writing to the underlying storage file.
 * - Resolves symlink to find actual storage location
 * - Requires write permission for the workspace
 * - Updates affect all workspaces that reference the same storage file
 */
export async function writeContext(
  input: unknown,
  jwtPayload: JWTPayload
): Promise<{
  success: boolean
  workspace: string
  path: string
  message?: string
}> {
  const params = v.parse(WriteContextInputSchema, input)

  const storage = getStorage()
  const permissionManager = getPermissionManager()

  // Check write permission
  await permissionManager.assertCanWriteDocument(
    jwtPayload,
    params.workspace,
    params.path
  )

  // Resolve symlink to find storage location
  const resolved = await storage.resolveSymlink(params.workspace, params.path)

  // Write to storage (updates the original file)
  await storage.writeToStorage(resolved.team, resolved.file, params.content)

  return {
    success: true,
    workspace: params.workspace,
    path: params.path,
    message: `Document ${params.workspace}/${params.path} updated successfully (storage: ${resolved.team}/${resolved.file})`,
  }
}
