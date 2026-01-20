import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod'
import { searchDocs } from './tools/search-docs.js'
import { listWorkspaces } from './tools/list-workspaces.js'
import { recentUpdates } from './tools/recent-updates.js'
import { writeContext } from './tools/write-context.js'
import { encode } from '@byjohann/toon'
import { getCurrentUser } from './context-store.js'

// Create MCP server instance
export const mcpServer = new McpServer({
    name: 'agent-context-hub',
    version: '1.0.0',
})

/**
 * Register all MCP tools
 */

// search_docs - Main tool for finding documentation (Workspace-based)
mcpServer.registerTool(
    'search_docs',
    {
        title: 'Search Workspace Documents',
        description: `Search for context documents (markdown files) in workspaces by query.
Returns relevant documents with previews and metadata.
Small files (<5KB) include full content, larger files provide ResourceLinks for on-demand fetching.
Use this when you need to find documentation, specs, or context within your accessible workspaces.`,
        inputSchema: {
            query: z.string().describe('Search query to find relevant documents'),
            workspace: z.string().optional().describe('Optional: Workspace to search in (defaults to your primary workspace)'),
            tags: z.array(z.string()).optional().describe('Optional: Filter by tags (not yet implemented)'),
        },
        outputSchema: {
            results: z.array(z.any()),
            totalCount: z.number(),
        },
    },
    async (args) => {
        const jwtPayload = getCurrentUser()
        if (!jwtPayload) {
            throw new Error('Authentication required')
        }
        const result = await searchDocs(args, jwtPayload)
        return {
            content: [{ type: 'text', text: encode(result) }],
            structuredContent: result,
        }
    }
)

// list_workspaces - List all accessible workspaces
mcpServer.registerTool(
    'list_workspaces',
    {
        title: 'List Workspaces',
        description: `List all workspaces you have access to, with document counts and permissions.
Useful for discovering which workspaces are available and what you can do in each.
Each workspace is an isolated collection of documents with its own access control.`,
        inputSchema: {},
        outputSchema: {
            workspaces: z.array(z.any()),
        },
    },
    async () => {
        const jwtPayload = getCurrentUser()
        if (!jwtPayload) {
            throw new Error('Authentication required')
        }
        const result = await listWorkspaces(jwtPayload)
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        }
    }
)

// recent_updates - Get recently updated documents (Workspace-based)
mcpServer.registerTool(
    'recent_updates',
    {
        title: 'Recent Updates',
        description: `Get recently updated context documents from your accessible workspaces.
Useful for discovering what has changed recently.
Returns up to 50 documents, sorted by modification time (newest first).`,
        inputSchema: {
            workspace: z.string().optional().describe('Optional: Filter by specific workspace (defaults to your primary workspace)'),
            limit: z.number().min(1).max(50).optional().describe('Optional: Maximum number of results (1-50, default: 10)'),
        },
        outputSchema: {
            updates: z.array(z.any()),
        },
    },
    async (args) => {
        const jwtPayload = getCurrentUser()
        if (!jwtPayload) {
            throw new Error('Authentication required')
        }
        const result = await recentUpdates(args, jwtPayload)
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        }
    }
)

// write_context - Update workspace document (Workspace-based)
mcpServer.registerTool(
    'write_context',
    {
        title: 'Write Context Document',
        description: `Update a context document in a workspace.
Requires write permission for the workspace.
Use this to update outdated documentation or modify context files.
Maximum content size: 1MB.
Note: Updates to symlinked files affect the original storage file, impacting all workspaces that reference it.`,
        inputSchema: {
            workspace: z.string().describe('Workspace name (alphanumeric, dashes, underscores)'),
            path: z.string().describe('Document path in workspace (must end with .md)'),
            content: z.string().describe('Markdown content to write'),
        },
        outputSchema: {
            success: z.boolean(),
            workspace: z.string(),
            path: z.string(),
            message: z.string().optional(),
        },
    },
    async (args) => {
        const jwtPayload = getCurrentUser()
        if (!jwtPayload) {
            throw new Error('Authentication required')
        }
        const result = await writeContext(args, jwtPayload)
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        }
    }
)