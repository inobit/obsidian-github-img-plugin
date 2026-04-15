import type { GitHubPluginSettings } from '../plugin-settings'

import { GITHUB_TOKEN_PRIVATE_KEY, GITHUB_TOKEN_PUBLIC_KEY } from '../github/constants'
import GitHubUploader from './github/GitHubUploader'
import ImageUploader from './ImageUploader'

export function isPrivateDocument(filePath: string, privateDirs: string[]): boolean {
  if (!privateDirs || privateDirs.length === 0) return false

  const normalizedPath = filePath.replace(/\\/g, '/')

  for (const dir of privateDirs) {
    const normalizedDir = dir.replace(/\\/g, '/').replace(/\/+$/, '')

    if (normalizedPath === normalizedDir ||
        normalizedPath.startsWith(normalizedDir + '/')) {
      return true
    }
  }
  return false
}

export function getUploaderForFile(
  filePath: string,
  settings: GitHubPluginSettings
): ImageUploader | undefined {
  const isPrivate = isPrivateDocument(filePath, settings.privateDirectories)

  if (isPrivate) {
    // Private 文档：检查 private 仓库是否启用且配置完整
    if (!settings.privateRepo?.enabled) {
      return undefined
    }
    if (!settings.privateRepo?.owner || !settings.privateRepo?.repo) {
      return undefined
    }
    const token = localStorage.getItem(GITHUB_TOKEN_PRIVATE_KEY)
    if (!token) return undefined

    return new GitHubUploader(
      settings.privateRepo.owner,
      settings.privateRepo.repo,
      settings.privateRepo.branch || 'main',
      settings.privateRepo.path || '',
      token,
      true,   // isPrivateRepo
      false   // useCdn
    )
  } else {
    // Public 文档：检查 public 仓库是否启用且配置完整
    if (!settings.publicRepo?.enabled) {
      return undefined
    }
    if (!settings.publicRepo?.owner || !settings.publicRepo?.repo) {
      return undefined
    }
    const token = localStorage.getItem(GITHUB_TOKEN_PUBLIC_KEY)
    // Public 仓库 token 可选

    return new GitHubUploader(
      settings.publicRepo.owner,
      settings.publicRepo.repo,
      settings.publicRepo.branch || 'main',
      settings.publicRepo.path || '',
      token || '',
      false,  // isPrivateRepo
      settings.publicRepo.useCdn ?? true  // useCdn
    )
  }
}

export default function buildUploaderFrom(settings: GitHubPluginSettings): ImageUploader | undefined {
  return getUploaderForFile('default.md', settings)
}
