import fs from 'fs/promises'
import path from 'path'
import type { DocumentMetadata } from '../schemas.js'

/**
 * Document information including content
 */
export interface Document {
  team: string
  file: string
  title: string
  content: string
  size: number
  lastModified: Date
}

/**
 * Cache entry
 */
interface CacheEntry {
  data: Document
  timestamp: number
}

/**
 * Filesystem storage for agent context documents
 */
export class FilesystemStorage {
  private baseDir: string
  private cache: Map<string, CacheEntry>
  private cacheTTL: number

  constructor(baseDir?: string, cacheTTL?: number) {
    this.baseDir = baseDir || process.env.AGENT_INIT_DIR || './.agent-init'
    this.cacheTTL = cacheTTL || parseInt(process.env.CACHE_TTL || '300000', 10) // 5 minutes
    this.cache = new Map()
  }

  /**
   * Security: Validate and sanitize team/file names to prevent path traversal
   */
  private validatePath(team: string, file: string): void {
    if (team.includes('..') || team.includes('/') || team.includes('\\')) {
      throw new Error('Invalid team name')
    }
    if (file.includes('..') || file.includes('/') || file.includes('\\')) {
      throw new Error('Invalid file name')
    }
    if (!file.endsWith('.md')) {
      throw new Error('Only markdown files are allowed')
    }
  }

  /**
   * Get full path to a document
   */
  private getDocumentPath(team: string, file: string): string {
    this.validatePath(team, file)
    return path.join(this.baseDir, team, file)
  }

  /**
   * Generate cache key
   */
  private getCacheKey(team: string, file: string): string {
    return `${team}/${file}`
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < this.cacheTTL
  }

  /**
   * Get from cache
   */
  private getFromCache(team: string, file: string): Document | null {
    const key = this.getCacheKey(team, file)
    const entry = this.cache.get(key)

    if (entry && this.isCacheValid(entry)) {
      return entry.data
    }

    // Remove expired cache
    if (entry) {
      this.cache.delete(key)
    }

    return null
  }

  /**
   * Set to cache
   */
  private setToCache(team: string, file: string, data: Document): void {
    const key = this.getCacheKey(team, file)
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  /**
   * Invalidate cache for a document
   */
  private invalidateCache(team: string, file: string): void {
    const key = this.getCacheKey(team, file)
    this.cache.delete(key)
  }

  /**
   * Extract title from markdown content (first # heading)
   */
  private extractTitle(content: string, fallback: string): string {
    const match = content.match(/^#\s+(.+)$/m)
    return match ? match[1].trim() : fallback
  }

  /**
   * Read a document
   */
  async readDocument(team: string, file: string): Promise<Document> {
    // Check cache first
    const cached = this.getFromCache(team, file)
    if (cached) {
      return cached
    }

    const filePath = this.getDocumentPath(team, file)

    try {
      const [content, stats] = await Promise.all([
        fs.readFile(filePath, 'utf-8'),
        fs.stat(filePath),
      ])

      const doc: Document = {
        team,
        file,
        title: this.extractTitle(content, file.replace('.md', '')),
        content,
        size: stats.size,
        lastModified: stats.mtime,
      }

      // Cache the result
      this.setToCache(team, file, doc)

      return doc
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Document not found: ${team}/${file}`)
      }
      throw error
    }
  }

  /**
   * Write a document
   */
  async writeDocument(team: string, file: string, content: string): Promise<void> {
    const filePath = this.getDocumentPath(team, file)

    // Ensure team directory exists
    const teamDir = path.join(this.baseDir, team)
    await fs.mkdir(teamDir, { recursive: true })

    // Check file size (1MB limit)
    const contentSize = Buffer.byteLength(content, 'utf-8')
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '1048576', 10)
    if (contentSize > maxSize) {
      throw new Error(`Content size ${contentSize} exceeds maximum ${maxSize} bytes`)
    }

    await fs.writeFile(filePath, content, 'utf-8')

    // Invalidate cache
    this.invalidateCache(team, file)
  }

  /**
   * List all documents in a team directory
   */
  async listTeamDocuments(team: string): Promise<Document[]> {
    this.validatePath(team, 'dummy.md') // Validate team name

    const teamDir = path.join(this.baseDir, team)

    try {
      const files = await fs.readdir(teamDir)
      const mdFiles = files.filter((f) => f.endsWith('.md'))

      const documents = await Promise.all(
        mdFiles.map((file) => this.readDocument(team, file))
      )

      return documents
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [] // Team directory doesn't exist yet
      }
      throw error
    }
  }

  /**
   * List all teams
   */
  async listTeams(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true })
      return entries.filter((e) => e.isDirectory()).map((e) => e.name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [] // Base directory doesn't exist yet
      }
      throw error
    }
  }

  /**
   * Scan all documents across all teams
   */
  async scanAllDocuments(teamFilter?: string): Promise<Document[]> {
    const teams = teamFilter ? [teamFilter] : await this.listTeams()

    const allDocs = await Promise.all(teams.map((team) => this.listTeamDocuments(team)))

    return allDocs.flat()
  }

  /**
   * Search documents by query
   */
  async searchDocuments(
    query: string,
    teamFilter?: string
  ): Promise<Document[]> {
    const allDocs = await this.scanAllDocuments(teamFilter)
    const lowerQuery = query.toLowerCase()

    return allDocs.filter((doc) => {
      const titleMatch = doc.title.toLowerCase().includes(lowerQuery)
      const contentMatch = doc.content.toLowerCase().includes(lowerQuery)
      const fileMatch = doc.file.toLowerCase().includes(lowerQuery)

      return titleMatch || contentMatch || fileMatch
    })
  }

  /**
   * Get recent updates
   */
  async getRecentUpdates(limit: number = 10, teamFilter?: string): Promise<Document[]> {
    const allDocs = await this.scanAllDocuments(teamFilter)

    // Sort by lastModified descending
    return allDocs
      .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
      .slice(0, limit)
  }

  /**
   * Convert Document to DocumentMetadata
   */
  toMetadata(doc: Document): DocumentMetadata {
    return {
      team: doc.team,
      file: doc.file,
      size: doc.size,
      lastModified: doc.lastModified.toISOString(),
    }
  }
}

// Singleton instance
let storageInstance: FilesystemStorage | null = null

/**
 * Get singleton storage instance
 */
export function getStorage(): FilesystemStorage {
  if (!storageInstance) {
    storageInstance = new FilesystemStorage()
  }
  return storageInstance
}
