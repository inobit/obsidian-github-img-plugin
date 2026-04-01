export interface GitHubContentResponse {
  content: string
  encoding: 'base64'
  sha: string
  size: number
  name: string
  path: string
}

export interface GitHubErrorResponse {
  message: string
  documentation_url?: string
}

export interface GitHubCreateContentRequest {
  message: string
  content: string // base64 encoded
  branch: string
  sha?: string // Required if updating existing file
}

export interface GitHubCreateContentResponse {
  content: {
    name: string
    path: string
    sha: string
    size: number
    html_url: string
    download_url: string
  }
  commit: {
    message: string
    sha: string
  }
}
