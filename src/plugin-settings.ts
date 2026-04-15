export interface RepoConfig {
  owner: string
  repo: string
  branch: string
  path: string
  useCdn?: boolean
}

export interface GitHubPluginSettings {
  // 向后兼容：旧配置字段
  githubOwner?: string
  githubRepo?: string
  githubBranch?: string
  githubPath?: string
  isPrivateRepo?: boolean

  // 新配置
  publicRepo?: RepoConfig
  privateRepo?: RepoConfig
  privateDirectories: string[]

  showRemoteUploadConfirmation: boolean
}

export const DEFAULT_SETTINGS: GitHubPluginSettings = {
  privateDirectories: [],
  showRemoteUploadConfirmation: true,
}
