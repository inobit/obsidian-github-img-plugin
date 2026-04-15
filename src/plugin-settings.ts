export interface RepoConfig {
  enabled: boolean
  owner: string
  repo: string
  branch: string
  path: string
  useCdn?: boolean
}

export interface GitHubPluginSettings {
  publicRepo?: RepoConfig
  privateRepo?: RepoConfig
  privateDirectories: string[]
  showRemoteUploadConfirmation: boolean
}

export const DEFAULT_SETTINGS: GitHubPluginSettings = {
  privateDirectories: [],
  showRemoteUploadConfirmation: true,
}
