import { GITHUB_PLUGIN_ID } from '../../constants'

class MockingUtils {
  /**
   * Mock GitHub upload to return a successful URL without actual API call
   */
  async mockGitHubUpload(mockedUrl: string) {
    await browser.execute(
      (pluginId: typeof GITHUB_PLUGIN_ID, uploadedImageUrl: string) => {
        const app = (window as any).app
        // Mock by setting up a custom upload function that bypasses actual API calls
        const plugin = (app.plugins.plugins as Record<string, unknown>)[pluginId]
        if (plugin) {
          // Store the mock URL for later use

          ;(plugin as any).__mockUploadUrl = uploadedImageUrl
        }
      },
      GITHUB_PLUGIN_ID,
      mockedUrl,
    )
  }

  /**
   * Mock GitHub file content retrieval for private repo image display
   */
  async mockGitHubFileContent(base64Content: string) {
    await browser.execute(
      (pluginId: typeof GITHUB_PLUGIN_ID, content: string) => {
        const app = (window as any).app
        const plugin = (app.plugins.plugins as Record<string, unknown>)[pluginId]
        if (plugin) {
          ;(plugin as any).__mockFileContent = content
        }
      },
      GITHUB_PLUGIN_ID,
      base64Content,
    )
  }
}

export default new MockingUtils()
