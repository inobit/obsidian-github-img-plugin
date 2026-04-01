import type { GitHubPluginSettings } from '../plugin-settings'

import { GITHUB_TOKEN_LOCALSTORAGE_KEY } from '../github/constants'
import ImageUploader from './ImageUploader'
import GitHubUploader from './github/GitHubUploader'

export default function buildUploaderFrom(settings: GitHubPluginSettings): ImageUploader | undefined {
  const token = localStorage.getItem(GITHUB_TOKEN_LOCALSTORAGE_KEY)

  if (!settings.githubOwner || !settings.githubRepo || !token) {
    return undefined
  }

  return new GitHubUploader(
    settings.githubOwner,
    settings.githubRepo,
    settings.githubBranch || 'main',
    settings.githubPath || '',
    token,
    settings.isPrivateRepo,
  )
}
