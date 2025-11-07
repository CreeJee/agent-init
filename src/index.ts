import { StreamableHTTPTransport } from '@hono/mcp'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { AppVariables } from './types.js'
import { mcpServer } from './mcp.js'
import { jwtAuth, getJWTPayload } from './auth/jwt.js'
import { getContextHandler, updateContextHandler } from './api/context.js'
import {
  createWorkspaceHandler,
  deleteWorkspaceHandler,
  listWorkspacesHandler,
  getWorkspaceHandler,
  createSymlinkHandler,
  deleteSymlinkHandler,
  listSymlinksHandler,
  validateSymlinksHandler,
  listStorageTeamsHandler,
  listStorageFilesHandler,
  getStorageFileHandler,
  updateStorageFileHandler,
} from './api/admin.js'
import { requestContext } from './context-store.js'

const app = new Hono<{ Variables: AppVariables }>()

// Middleware
app.use('*', logger())
app.use('*', cors())

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'Agent Context Hub',
    version: '1.0.0',
    status: 'healthy',
  })
})

// MCP endpoint (with JWT authentication)
app.all('/mcp', jwtAuth(), async (c) => {
  const jwtPayload = getJWTPayload(c)

  // Run MCP request with user context (for team-based filtering in tools)
  return requestContext.run({ jwtPayload }, async () => {
    const transport = new StreamableHTTPTransport()
    await mcpServer.connect(transport)
    return transport.handleRequest(c)
  })
})

// HTTP API endpoints (with JWT authentication)
// Context API (workspace-based)
app.use('/api/context/*', jwtAuth())
app.get('/api/context/:workspace/:path', getContextHandler)
app.put('/api/context/:workspace/:path', updateContextHandler)

// Admin API (requires admin:workspaces permission)
app.use('/admin/*', jwtAuth())

// Workspace management
app.post('/admin/workspaces', createWorkspaceHandler)
app.get('/admin/workspaces', listWorkspacesHandler)
app.get('/admin/workspaces/:workspace', getWorkspaceHandler)
app.delete('/admin/workspaces/:workspace', deleteWorkspaceHandler)

// Symlink management
app.post('/admin/workspaces/:workspace/links', createSymlinkHandler)
app.get('/admin/workspaces/:workspace/links', listSymlinksHandler)
app.get('/admin/workspaces/:workspace/links/validate', validateSymlinksHandler)
app.delete('/admin/workspaces/:workspace/links/:path', deleteSymlinkHandler)

// Storage management
app.get('/admin/storage', listStorageTeamsHandler)
app.get('/admin/storage/:team', listStorageFilesHandler)
app.get('/admin/storage/:team/:file', getStorageFileHandler)
app.post('/admin/storage/:team', updateStorageFileHandler)

// Start server
const port = parseInt(process.env.PORT || '3000', 10)

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`🚀 Agent Context Hub is running on http://localhost:${info.port}`)
    console.log(`📡 MCP endpoint: http://localhost:${info.port}/mcp`)
    console.log(`🔌 API endpoint: http://localhost:${info.port}/api/context`)
  }
)
