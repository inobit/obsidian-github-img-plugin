import GitHubImagePlugin from '../../../src/GitHubImagePlugin'
import { GITHUB_PLUGIN_ID } from '../constants'

declare module 'obsidian' {
  interface App {
    plugins: {
      plugins: {
        [index: string]: Plugin
        [GITHUB_PLUGIN_ID]: GitHubImagePlugin
      }
      setEnable(toggle: boolean): void
      enablePlugin(pluginId: string): void
    }
    commands: {
      executeCommandById: (id: string) => boolean
    }
  }
}
