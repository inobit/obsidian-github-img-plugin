import { App, Notice, PluginSettingTab, Setting } from 'obsidian'

import { GITHUB_TOKEN_LOCALSTORAGE_KEY } from '../github/constants'
import type GitHubImagePlugin from '../GitHubImagePlugin'

export default class GitHubPluginSettingsTab extends PluginSettingTab {
  plugin: GitHubImagePlugin

  private tokenInput: HTMLInputElement

  constructor(app: App, plugin: GitHubImagePlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this

    containerEl.empty()

    containerEl.createEl('h2', { text: 'GitHub Image Plugin Settings' })

    // GitHub Owner
    new Setting(containerEl)
      .setName('GitHub Owner')
      .setDesc('Your GitHub username or organization name')
      .addText((text) =>
        text
          .setPlaceholder('e.g., myusername')
          .setValue(this.plugin.settings.githubOwner)
          .onChange((value) => {
            this.plugin.settings.githubOwner = value.trim()
          }),
      )

    // Repository
    new Setting(containerEl)
      .setName('Repository')
      .setDesc('The name of the repository to store images')
      .addText((text) =>
        text
          .setPlaceholder('e.g., my-notes-images')
          .setValue(this.plugin.settings.githubRepo)
          .onChange((value) => {
            this.plugin.settings.githubRepo = value.trim()
          }),
      )

    // Branch
    new Setting(containerEl)
      .setName('Branch')
      .setDesc('The branch to upload images to (default: main)')
      .addText((text) =>
        text
          .setPlaceholder('main')
          .setValue(this.plugin.settings.githubBranch)
          .onChange((value) => {
            this.plugin.settings.githubBranch = value.trim() || 'main'
          }),
      )

    // Path
    new Setting(containerEl)
      .setName('Path')
      .setDesc('The directory path within the repository to store images')
      .addText((text) =>
        text
          .setPlaceholder('e.g., images')
          .setValue(this.plugin.settings.githubPath)
          .onChange((value) => {
            this.plugin.settings.githubPath = value.trim()
          }),
      )

    // Personal Access Token
    const tokenSetting = new Setting(containerEl)
      .setName('Personal Access Token')
      .setDesc('GitHub Personal Access Token with repo scope (stored locally, not synced)')
      .addText((text) => {
        this.tokenInput = text.inputEl
        this.tokenInput.type = 'password'
        this.tokenInput.placeholder = 'ghp_xxxxxxxxxxxxxxxxxxxx'

        // Show masked value if token exists
        const existingToken = localStorage.getItem(GITHUB_TOKEN_LOCALSTORAGE_KEY)
        if (existingToken) {
          this.tokenInput.value = '••••••••••••••••••••'
        }

        text.onChange((value) => {
          // Only update if value is not the mask
          if (value !== '••••••••••••••••••••') {
            if (value.trim()) {
              localStorage.setItem(GITHUB_TOKEN_LOCALSTORAGE_KEY, value.trim())
            } else {
              localStorage.removeItem(GITHUB_TOKEN_LOCALSTORAGE_KEY)
            }
          }
        })
      })

    tokenSetting.addExtraButton((button) => {
      button
        .setIcon('eye')
        .setTooltip('Show/Hide token')
        .onClick(() => {
          const isPassword = this.tokenInput.type === 'password'
          this.tokenInput.type = isPassword ? 'text' : 'password'
        })
    })

    // Private Repository Toggle
    new Setting(containerEl)
      .setName('Private Repository')
      .setDesc(
        'Enable if the repository is private. Images will be served via GitHub API (has rate limits).',
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.isPrivateRepo).onChange((value) => {
          this.plugin.settings.isPrivateRepo = value
        }),
      )

    // Confirm before upload
    new Setting(containerEl)
      .setName('Confirm before upload')
      .setDesc('Show a confirmation dialog before uploading images')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showRemoteUploadConfirmation).onChange((value) => {
          this.plugin.settings.showRemoteUploadConfirmation = value
        }),
      )

    // Test Connection Button
    new Setting(containerEl).addButton((button) => {
      button
        .setButtonText('Test Connection')
        .setCta()
        .onClick(() => this.testConnection())
    })
  }

  override hide() {
    void this.plugin.saveSettings().then(() => this.plugin.setupImagesUploader())
  }

  private async testConnection() {
    const token = localStorage.getItem(GITHUB_TOKEN_LOCALSTORAGE_KEY)
    const { githubOwner, githubRepo } = this.plugin.settings

    if (!token) {
      new Notice('❌ Please enter a GitHub Personal Access Token')
      return
    }

    if (!githubOwner || !githubRepo) {
      new Notice('❌ Please enter both GitHub Owner and Repository')
      return
    }

    new Notice('Testing connection...')

    try {
      const response = await fetch(
        `https://api.github.com/repos/${githubOwner}/${githubRepo}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        },
      )

      if (response.ok) {
        new Notice('✅ Connection successful! Repository is accessible.')
      } else if (response.status === 404) {
        new Notice('❌ Repository not found. Check owner and repo name.')
      } else if (response.status === 401) {
        new Notice('❌ Authentication failed. Check your token.')
      } else {
        const data = await response.json()
        new Notice(`❌ Error: ${data.message || response.statusText}`)
      }
    } catch (e) {
      new Notice('❌ Connection failed. Check your internet connection.')
      console.error('GitHub connection test failed:', e)
    }
  }
}
