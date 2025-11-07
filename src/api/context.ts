import type { Context } from 'hono'
import { stream } from 'hono/streaming'
import type { AppVariables } from '../types.js'
import { getJWTPayload } from '../auth/jwt.js'
import { getContextDocument, updateContextDocument } from '../services/context-service.js'

/**
 * GET /api/context/:workspace/:path
 *
 * Resolve ResourceLink - return full markdown content from workspace
 */
export const getContextHandler = async (c: Context<{ Variables: AppVariables }>) => {
  const workspace = c.req.param('workspace')
  const docPath = c.req.param('path')
  const payload = getJWTPayload(c)

  try {
    const { content, size } = await getContextDocument(workspace, docPath, payload)

    // For large files, use streaming
    if (size > 100 * 1024) {
      c.header('Content-Type', 'text/markdown; charset=utf-8')
      c.header('Content-Length', size.toString())

      return stream(c, async (stream) => {
        await stream.write(content)
      })
    }

    // For smaller files, return directly
    c.header('Content-Type', 'text/markdown; charset=utf-8')
    return c.body(content)
  } catch (error) {
    const err = error as Error
    if (err.message.includes('not found')) {
      return c.json({ error: 'Not Found', message: `Document ${workspace}/${docPath} not found` }, 404)
    }
    if (err.message.includes('Access denied')) {
      return c.json({ error: 'Forbidden', message: err.message }, 403)
    }
    throw error
  }
}

/**
 * PUT /api/context/:workspace/:path
 *
 * Update a context document in workspace
 */
export const updateContextHandler = async (c: Context<{ Variables: AppVariables }>) => {
  const workspace = c.req.param('workspace')
  const docPath = c.req.param('path')
  const payload = getJWTPayload(c)

  const content = await c.req.text()
  if (!content) {
    return c.json({ error: 'Bad Request', message: 'Request body is empty' }, 400)
  }

  try {
    const result = await updateContextDocument(workspace, docPath, content, payload)

    return c.json({
      success: result.success,
      workspace,
      path: docPath,
      message: result.message,
    })
  } catch (error) {
    const err = error as Error
    if (err.message.includes('exceeds maximum')) {
      return c.json({ error: 'Payload Too Large', message: err.message }, 413)
    }
    if (err.message.includes('Invalid')) {
      return c.json({ error: 'Bad Request', message: err.message }, 400)
    }
    if (err.message.includes('Access denied') || err.message.includes('Cannot write')) {
      return c.json({ error: 'Forbidden', message: err.message }, 403)
    }
    if (err.message.includes('Missing required permission')) {
      return c.json({ error: 'Forbidden', message: err.message }, 403)
    }
    throw error
  }
}
