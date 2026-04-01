export interface GitHubPluginSettings {
  githubOwner: string
  githubRepo: string
  githubBranch: string
  githubPath: string
  showRemoteUploadConfirmation: boolean
  isPrivateRepo: boolean
}

export const DEFAULT_SETTINGS: GitHubPluginSettings = {
  githubOwner: '',
  githubRepo: '',
  githubBranch: 'main',
  githubPath: 'images',
  showRemoteUploadConfirmation: true,
  isPrivateRepo: false,
}
