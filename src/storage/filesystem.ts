import fs from 'fs/promises'
import path from 'path'
import type { DocumentMetadata, SymlinkInfo, StorageFileInfo } from '../schemas.js'

/**
 * Document information including content
 */
export interface Document {
  workspace: string
  path: string // Path within workspace
  title: string
  content: string
  size: number
  lastModified: Date
  sourceTeam?: string // Original team (if from storage)
  sourceFile?: string // Original file (if from storage)
}

/**
 * Cache entry
 */
interface CacheEntry {
  data: Document
  timestamp: number
}

/**
 * Workspace-based filesystem storage with symlink support
 */
export class FilesystemStorage {
  private baseDir: string
  private storageDir: string
  private workspaceDir: string
  private cache: Map<string, CacheEntry>
  private cacheTTL: number

  constructor(baseDir?: string, cacheTTL?: number) {
    this.baseDir = baseDir || process.env.AGENT_INIT_DIR || './.agent-init'
    this.storageDir = path.join(this.baseDir, 'storage')
    this.workspaceDir = path.join(this.baseDir, 'workspaces')
    this.cacheTTL = cacheTTL || parseInt(process.env.CACHE_TTL || '300000', 10) // 5 minutes
    this.cache = new Map()
  }

  // ============================================================================
  // Validation & Security
  // ============================================================================

  /**
   * Validate workspace ID (alphanumeric, dash, underscore only)
   */
  private validateWorkspaceId(workspaceId: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) {
      throw new Error('Invalid workspace ID')
    }
    if (workspaceId.includes('..') || workspaceId.includes('/')) {
      throw new Error('Invalid workspace ID: path traversal detected')
    }
  }

  /**
   * Validate team name
   */
  private validateTeamName(team: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(team)) {
      throw new Error('Invalid team name')
    }
    if (team.includes('..') || team.includes('/')) {
      throw new Error('Invalid team name: path traversal detected')
    }
  }

  /**
   * Validate file name (must be .md)
   */
  private validateFileName(file: string): void {
    if (!file.endsWith('.md')) {
      throw new Error('Only markdown files are allowed')
    }
    if (!/^[a-zA-Z0-9_-]+\.md$/.test(file)) {
      throw new Error('Invalid file name')
    }
    if (file.includes('..') || file.includes('/')) {
      throw new Error('Invalid file name: path traversal detected')
    }
  }

  /**
   * Validate path within workspace
   */
  private validateWorkspacePath(workspacePath: string): void {
    if (workspacePath.includes('..') || workspacePath.startsWith('/')) {
      throw new Error('Invalid workspace path: path traversal detected')
    }
    if (!workspacePath.endsWith('.md')) {
      throw new Error('Only markdown files are allowed')
    }
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  private getCacheKey(workspace: string, path: string): string {
    return `${workspace}/${path}`
  }

  private isCacheValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < this.cacheTTL
  }

  private getFromCache(workspace: string, path: string): Document | null {
    const key = this.getCacheKey(workspace, path)
    const entry = this.cache.get(key)

    if (entry && this.isCacheValid(entry)) {
      return entry.data
    }

    if (entry) {
      this.cache.delete(key)
    }

    return null
  }

  private setToCache(workspace: string, path: string, data: Document): void {
    const key = this.getCacheKey(workspace, path)
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  private invalidateCache(workspace: string, path: string): void {
    const key = this.getCacheKey(workspace, path)
    this.cache.delete(key)
  }

  private invalidateWorkspaceCache(workspace: string): void {
    const prefix = `${workspace}/`
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  /**
   * Extract title from markdown content (first # heading)
   */
  private extractTitle(content: string, fallback: string): string {
    const match = content.match(/^#\s+(.+)$/m)
    return match ? match[1].trim() : fallback
  }

  /**
   * Check if file size is within limit
   */
  private async checkFileSize(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath)
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '1048576', 10) // 1MB
    if (stats.size > maxSize) {
      throw new Error(`File size ${stats.size} exceeds maximum ${maxSize} bytes`)
    }
  }

  // ============================================================================
  // Storage Direct Access (Admin Only)
  // ============================================================================

  /**
   * Read file directly from storage (admin only)
   */
  async readFromStorage(team: string, file: string): Promise<Document> {
    this.validateTeamName(team)
    this.validateFileName(file)

    const filePath = path.join(this.storageDir, team, file)

    try {
      const [content, stats] = await Promise.all([
        fs.readFile(filePath, 'utf-8'),
        fs.stat(filePath),
      ])

      return {
        workspace: 'storage', // Special marker for storage files
        path: `${team}/${file}`,
        title: this.extractTitle(content, file.replace('.md', '')),
        content,
        size: stats.size,
        lastModified: stats.mtime,
        sourceTeam: team,
        sourceFile: file,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Storage file not found: ${team}/${file}`)
      }
      throw error
    }
  }

  /**
   * Write file directly to storage (admin only)
   */
  async writeToStorage(team: string, file: string, content: string): Promise<void> {
    this.validateTeamName(team)
    this.validateFileName(file)

    // Check content size
    const contentSize = Buffer.byteLength(content, 'utf-8')
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '1048576', 10)
    if (contentSize > maxSize) {
      throw new Error(`Content size ${contentSize} exceeds maximum ${maxSize} bytes`)
    }

    // Ensure team directory exists
    const teamDir = path.join(this.storageDir, team)
    await fs.mkdir(teamDir, { recursive: true })

    const filePath = path.join(teamDir, file)
    await fs.writeFile(filePath, content, 'utf-8')

    // Invalidate all workspace caches that might reference this file
    this.cache.clear() // Simple approach: clear all caches
  }

  /**
   * List all files in a storage team directory
   */
  async listStorageFiles(team: string): Promise<StorageFileInfo[]> {
    this.validateTeamName(team)

    const teamDir = path.join(this.storageDir, team)

    try {
      const files = await fs.readdir(teamDir)
      const mdFiles = files.filter((f) => f.endsWith('.md'))

      const fileInfos = await Promise.all(
        mdFiles.map(async (file) => {
          const filePath = path.join(teamDir, file)
          const stats = await fs.stat(filePath)

          // Find all symlinks pointing to this file
          const linkedBy = await this.findSymlinksToFile(team, file)

          return {
            team,
            file,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
            linkedBy,
          }
        })
      )

      return fileInfos
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [] // Team directory doesn't exist
      }
      throw error
    }
  }

  /**
   * Find all symlinks pointing to a storage file (reverse references)
   */
  private async findSymlinksToFile(
    team: string,
    file: string
  ): Promise<Array<{ workspace: string; path: string }>> {
    const result: Array<{ workspace: string; path: string }> = []

    try {
      const workspaces = await this.listWorkspaces()

      for (const workspace of workspaces) {
        const symlinks = await this.listSymlinks(workspace)

        for (const symlink of symlinks) {
          if (symlink.sourceTeam === team && symlink.sourceFile === file) {
            result.push({
              workspace,
              path: symlink.path,
            })
          }
        }
      }
    } catch (error) {
      // Ignore errors in finding reverse references
    }

    return result
  }

  // ============================================================================
  // Workspace Access (Regular Users)
  // ============================================================================

  /**
   * Read document from workspace (follows symlinks)
   */
  async readDocument(workspace: string, docPath: string): Promise<Document> {
    this.validateWorkspaceId(workspace)
    this.validateWorkspacePath(docPath)

    // Check cache first
    const cached = this.getFromCache(workspace, docPath)
    if (cached) {
      return cached
    }

    const workspacePath = path.join(this.workspaceDir, workspace, docPath)

    try {
      // Check if it's a symlink
      const stats = await fs.lstat(workspacePath)
      const isSymlink = stats.isSymbolicLink()

      let sourceTeam: string | undefined
      let sourceFile: string | undefined

      if (isSymlink) {
        // Resolve symlink to get source info
        const linkTarget = await fs.readlink(workspacePath)
        const resolved = this.parseSymlinkPath(linkTarget)
        sourceTeam = resolved.team
        sourceFile = resolved.file
      }

      // Read content (follows symlink automatically)
      const [content, realStats] = await Promise.all([
        fs.readFile(workspacePath, 'utf-8'),
        fs.stat(workspacePath), // stat (not lstat) follows symlinks
      ])

      const doc: Document = {
        workspace,
        path: docPath,
        title: this.extractTitle(content, docPath.replace('.md', '')),
        content,
        size: realStats.size,
        lastModified: realStats.mtime,
        sourceTeam,
        sourceFile,
      }

      // Cache the result
      this.setToCache(workspace, docPath, doc)

      return doc
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Document not found: ${workspace}/${docPath}`)
      }
      throw error
    }
  }

  /**
   * List all documents in a workspace
   */
  async listWorkspaceDocuments(workspace: string): Promise<Document[]> {
    this.validateWorkspaceId(workspace)

    const workspaceFullPath = path.join(this.workspaceDir, workspace)

    try {
      const files = await fs.readdir(workspaceFullPath)
      const mdFiles = files.filter((f) => f.endsWith('.md'))

      const documents = await Promise.all(
        mdFiles.map((file) => this.readDocument(workspace, file))
      )

      return documents
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [] // Workspace doesn't exist
      }
      throw error
    }
  }

  /**
   * Search documents in a workspace
   */
  async searchDocuments(workspace: string, query: string): Promise<Document[]> {
    const allDocs = await this.listWorkspaceDocuments(workspace)
    const lowerQuery = query.toLowerCase()

    return allDocs.filter((doc) => {
      const titleMatch = doc.title.toLowerCase().includes(lowerQuery)
      const contentMatch = doc.content.toLowerCase().includes(lowerQuery)
      const pathMatch = doc.path.toLowerCase().includes(lowerQuery)

      return titleMatch || contentMatch || pathMatch
    })
  }

  // ============================================================================
  // Workspace Management (Admin)
  // ============================================================================

  /**
   * Create a new workspace
   */
  async createWorkspace(workspaceId: string): Promise<void> {
    this.validateWorkspaceId(workspaceId)

    const workspaceFullPath = path.join(this.workspaceDir, workspaceId)

    try {
      await fs.mkdir(workspaceFullPath, { recursive: false })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`Workspace already exists: ${workspaceId}`)
      }
      throw error
    }
  }

  /**
   * Delete a workspace (removes directory and all symlinks)
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    this.validateWorkspaceId(workspaceId)

    const workspaceFullPath = path.join(this.workspaceDir, workspaceId)

    try {
      await fs.rm(workspaceFullPath, { recursive: true })
      this.invalidateWorkspaceCache(workspaceId)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Workspace not found: ${workspaceId}`)
      }
      throw error
    }
  }

  /**
   * List all workspaces
   */
  async listWorkspaces(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.workspaceDir, { withFileTypes: true })
      return entries.filter((e) => e.isDirectory()).map((e) => e.name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [] // Workspace directory doesn't exist
      }
      throw error
    }
  }

  /**
   * Check if workspace exists
   */
  async workspaceExists(workspaceId: string): Promise<boolean> {
    this.validateWorkspaceId(workspaceId)
    const workspaceFullPath = path.join(this.workspaceDir, workspaceId)

    try {
      const stats = await fs.stat(workspaceFullPath)
      return stats.isDirectory()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false
      }
      throw error
    }
  }

  // ============================================================================
  // Symlink Management (Admin)
  // ============================================================================

  /**
   * Create a symlink in workspace pointing to storage file
   */
  async createSymlink(
    workspace: string,
    sourceTeam: string,
    sourceFile: string,
    targetPath: string
  ): Promise<void> {
    this.validateWorkspaceId(workspace)
    this.validateTeamName(sourceTeam)
    this.validateFileName(sourceFile)
    this.validateWorkspacePath(targetPath)

    // Ensure workspace exists
    if (!(await this.workspaceExists(workspace))) {
      throw new Error(`Workspace not found: ${workspace}`)
    }

    // Ensure source file exists
    const sourcePath = path.join(this.storageDir, sourceTeam, sourceFile)
    try {
      await fs.access(sourcePath)
    } catch (error) {
      throw new Error(`Source file not found: ${sourceTeam}/${sourceFile}`)
    }

    // Create symlink
    const targetFullPath = path.join(this.workspaceDir, workspace, targetPath)

    // Check if target already exists
    try {
      await fs.lstat(targetFullPath)
      throw new Error(`Target path already exists: ${workspace}/${targetPath}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }

    // Calculate relative path from target to source
    const relativePath = path.relative(
      path.dirname(targetFullPath),
      sourcePath
    )

    await fs.symlink(relativePath, targetFullPath)

    // Invalidate cache
    this.invalidateCache(workspace, targetPath)
  }

  /**
   * Remove a symlink from workspace
   */
  async removeSymlink(workspace: string, targetPath: string): Promise<void> {
    this.validateWorkspaceId(workspace)
    this.validateWorkspacePath(targetPath)

    const targetFullPath = path.join(this.workspaceDir, workspace, targetPath)

    try {
      // Verify it's a symlink (safety check)
      const stats = await fs.lstat(targetFullPath)
      if (!stats.isSymbolicLink()) {
        throw new Error(`Not a symlink: ${workspace}/${targetPath}`)
      }

      await fs.unlink(targetFullPath)

      // Invalidate cache
      this.invalidateCache(workspace, targetPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Symlink not found: ${workspace}/${targetPath}`)
      }
      throw error
    }
  }

  /**
   * List all symlinks in a workspace
   */
  async listSymlinks(workspace: string): Promise<SymlinkInfo[]> {
    this.validateWorkspaceId(workspace)

    const workspaceFullPath = path.join(this.workspaceDir, workspace)

    try {
      const files = await fs.readdir(workspaceFullPath)

      const symlinkInfos = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(workspaceFullPath, file)

          try {
            const stats = await fs.lstat(filePath)

            if (!stats.isSymbolicLink()) {
              return null // Not a symlink
            }

            const linkTarget = await fs.readlink(filePath)
            const { team, file: sourceFile } = this.parseSymlinkPath(linkTarget)

            // Try to resolve and get target info
            let isValid = false
            let targetPath: string | undefined
            let error: string | undefined
            let size: number | undefined
            let lastModified: string | undefined

            try {
              const realStats = await fs.stat(filePath) // Follows symlink
              targetPath = await fs.realpath(filePath)
              isValid = true
              size = realStats.size
              lastModified = realStats.mtime.toISOString()
            } catch (err) {
              isValid = false
              error = (err as Error).message
            }

            const info: SymlinkInfo = {
              path: file,
              source: linkTarget,
              sourceTeam: team,
              sourceFile,
              isValid,
              target: targetPath,
              error,
              size,
              lastModified,
            }

            return info
          } catch (err) {
            return null
          }
        })
      )

      return symlinkInfos.filter((info): info is SymlinkInfo => info !== null)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [] // Workspace doesn't exist
      }
      throw error
    }
  }

  /**
   * Validate all symlinks in a workspace and return broken ones
   */
  async validateSymlinks(workspace: string): Promise<SymlinkInfo[]> {
    const allSymlinks = await this.listSymlinks(workspace)
    return allSymlinks.filter((link) => !link.isValid)
  }

  /**
   * Parse symlink relative path to extract team and file
   * Example: "../../storage/BE/api-spec.md" → { team: "BE", file: "api-spec.md" }
   */
  private parseSymlinkPath(symlinkPath: string): { team: string; file: string } {
    const normalized = path.normalize(symlinkPath)
    const parts = normalized.split(path.sep)

    // Expected format: ../../storage/{team}/{file}
    const storageIndex = parts.indexOf('storage')
    if (storageIndex === -1 || storageIndex + 2 >= parts.length) {
      throw new Error(`Invalid symlink path format: ${symlinkPath}`)
    }

    const team = parts[storageIndex + 1]
    const file = parts[storageIndex + 2]

    return { team, file }
  }

  /**
   * Resolve symlink: given a workspace path, return the storage team/file
   */
  async resolveSymlink(workspace: string, docPath: string): Promise<{
    team: string
    file: string
    realPath: string
  }> {
    this.validateWorkspaceId(workspace)
    this.validateWorkspacePath(docPath)

    const workspacePath = path.join(this.workspaceDir, workspace, docPath)

    try {
      const stats = await fs.lstat(workspacePath)

      if (!stats.isSymbolicLink()) {
        throw new Error(`Not a symlink: ${workspace}/${docPath}`)
      }

      const linkTarget = await fs.readlink(workspacePath)
      const { team, file } = this.parseSymlinkPath(linkTarget)
      const realPath = await fs.realpath(workspacePath)

      return { team, file, realPath }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Symlink not found: ${workspace}/${docPath}`)
      }
      throw error
    }
  }

  // ============================================================================
  // Legacy Support (for backward compatibility)
  // ============================================================================

  /**
   * @deprecated Use readDocument with workspace instead
   */
  async readTeamDocument(team: string, file: string): Promise<Document> {
    return this.readFromStorage(team, file)
  }

  /**
   * Convert Document to DocumentMetadata
   */
  toMetadata(doc: Document): DocumentMetadata {
    return {
      team: doc.sourceTeam || doc.workspace,
      file: doc.sourceFile || doc.path,
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
