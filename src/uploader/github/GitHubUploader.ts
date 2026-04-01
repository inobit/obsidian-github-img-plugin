import { requestUrl, RequestUrlResponse } from 'obsidian'

import ApiError from '../ApiError'
import { GITHUB_API_BASE } from '../../github/constants'
import {
  type GitHubContentResponse,
  type GitHubCreateContentRequest,
  type GitHubCreateContentResponse,
  type GitHubErrorResponse,
} from '../../github/githubApiTypes'

export function handleGitHubErrorResponse(resp: RequestUrlResponse): void {
  if (resp.headers['content-type']?.includes('application/json')) {
    const error = (resp.json as GitHubErrorResponse).message
    throw new ApiError(error || `GitHub API error: ${resp.status}`)
  }
  throw new Error(`GitHub API error: ${resp.status}`)
}

export default class GitHubUploader {
  private readonly owner: string
  private readonly repo: string
  private readonly branch: string
  private readonly basePath: string
  private readonly token: string
  private readonly isPrivateRepo: boolean

  constructor(
    owner: string,
    repo: string,
    branch: string,
    basePath: string,
    token: string,
    isPrivateRepo: boolean,
  ) {
    this.owner = owner
    this.repo = repo
    this.branch = branch
    this.basePath = basePath
    this.token = token
    this.isPrivateRepo = isPrivateRepo
  }

  /**
   * Upload an image to GitHub repository
   * @param image - The image file to upload
   * @param fileName - Optional custom filename (if not provided, uses image.name)
   * @returns Promise<string> - The URL to access the image
   */
  async upload(image: File, fileName?: string): Promise<string> {
    const targetFileName = fileName || this.generateFileName(image.name)
    const path = this.basePath ? `${this.basePath}/${targetFileName}` : targetFileName

    // Convert file to base64
    const base64Content = await this.fileToBase64(image)

    // Check if file already exists
    const existingSha = await this.getFileSha(path)

    const requestBody: GitHubCreateContentRequest = {
      message: `Upload image ${targetFileName} via Obsidian`,
      content: base64Content,
      branch: this.branch,
    }

    if (existingSha) {
      requestBody.sha = existingSha
    }

    const resp = await requestUrl({
      url: `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/contents/${path}`,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(requestBody),
      throw: false,
    })

    if (resp.status >= 400) {
      handleGitHubErrorResponse(resp)
    }

    const responseData = resp.json as GitHubCreateContentResponse

    // For private repos, we need to use API to fetch content
    // For public repos, we can use raw.githubusercontent.com
    if (this.isPrivateRepo) {
      // Return a special URL format that the plugin will handle
      // Format: github-img://owner/repo/branch/path
      return `github-img://${this.owner}/${this.repo}/${this.branch}/${path}`
    }

    // Public repo: use raw URL
    return `${GITHUB_API_BASE.replace('api.github.com', 'raw.githubusercontent.com')}/${this.owner}/${this.repo}/${this.branch}/${path}`
  }

  /**
   * Get file content from GitHub (for private repo image display)
   */
  async getFileContent(path: string): Promise<GitHubContentResponse> {
    const resp = await requestUrl({
      url: `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      throw: false,
    })

    if (resp.status >= 400) {
      handleGitHubErrorResponse(resp)
    }

    return resp.json as GitHubContentResponse
  }

  /**
   * Convert file to base64 string (url-safe, no data URI prefix)
   */
  private async fileToBase64(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  /**
   * Get file SHA if it exists (needed for updates)
   */
  private async getFileSha(path: string): Promise<string | undefined> {
    try {
      const resp = await requestUrl({
        url: `${GITHUB_API_BASE}/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        throw: false,
      })

      if (resp.status === 200) {
        const data = resp.json as GitHubContentResponse
        return data.sha
      }
      return undefined
    } catch {
      return undefined
    }
  }

  /**
   * Generate a unique filename to avoid collisions
   */
  private generateFileName(originalName: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    const extension = originalName.split('.').pop() || 'png'
    return `${timestamp}-${random}.${extension}`
  }
}
