import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod'
import { searchDocs } from './tools/search-docs.js'
import { listTeams } from './tools/list-teams.js'
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

// search_docs - Main tool for finding documentation
mcpServer.registerTool(
    'search_docs',
    {
        title: 'Search Team Context Documents',
        description: `Search for team context documents (markdown files) by query.
Returns relevant documents with previews and metadata.
Small files (<5KB) include full content, larger files provide ResourceLinks for on-demand fetching.
Use this when you need to find team documentation, specs, or context.`,
        inputSchema: {
            query: z.string().describe('Search query to find relevant documents'),
            team: z.string().optional().describe('Optional: Filter by specific team (e.g., "PM", "BE", "FE", "DESIGN")'),
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

// list_teams - List all available teams
mcpServer.registerTool(
    'list_teams',
    {
        title: 'List Teams',
        description: `List all available teams and their document counts.
Useful for discovering which teams have context documents available.
Common teams: PM, BE (Backend), FE (Frontend), DESIGN, SALES, etc.`,
        inputSchema: {},
        outputSchema: {
            teams: z.array(z.any()),
        },
    },
    async () => {
        const jwtPayload = getCurrentUser()
        if (!jwtPayload) {
            throw new Error('Authentication required')
        }
        const result = await listTeams(jwtPayload)
        return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        }
    }
)

// recent_updates - Get recently updated documents
mcpServer.registerTool(
    'recent_updates',
    {
        title: 'Recent Updates',
        description: `Get recently updated context documents across teams.
Useful for discovering what has changed recently.
Returns up to 50 documents, sorted by modification time (newest first).`,
        inputSchema: {
            team: z.string().optional().describe('Optional: Filter by specific team'),
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

// write_context - Create or update context document
mcpServer.registerTool(
    'write_context',
    {
        title: 'Write Context Document',
        description: `Create or update a team context document.
Requires write:docs permission.
Use this to update outdated documentation or create new context files.
Maximum content size: 1MB.`,
        inputSchema: {
            team: z.string().describe('Team name (alphanumeric, dashes, underscores)'),
            file: z.string().describe('File name (must end with .md)'),
            content: z.string().describe('Markdown content to write'),
        },
        outputSchema: {
            success: z.boolean(),
            team: z.string(),
            file: z.string(),
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