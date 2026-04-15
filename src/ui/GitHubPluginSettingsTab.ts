import { App, Notice, PluginSettingTab, Setting } from 'obsidian'

import type GitHubImagePlugin from '../GitHubImagePlugin'

import {
  GITHUB_TOKEN_PRIVATE_KEY,
  GITHUB_TOKEN_PUBLIC_KEY,
} from '../github/constants'

export default class GitHubPluginSettingsTab extends PluginSettingTab {
  plugin: GitHubImagePlugin

  constructor(app: App, plugin: GitHubImagePlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl('h2', { text: 'GitHub Image Upload Settings' })

    // Public Repository Section
    this.createPublicRepoSection(containerEl)

    // Private Repository Section
    this.createPrivateRepoSection(containerEl)

    // Private Directories Section
    this.createPrivateDirectoriesSection(containerEl)

    // General Settings
    this.createGeneralSettingsSection(containerEl)
  }

  private createPublicRepoSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Public Repository' })

    const publicRepo = this.plugin.settings.publicRepo || {
      enabled: false,
      owner: '',
      repo: '',
      branch: 'main',
      path: 'images',
      useCdn: true,
    }

    // Enabled Toggle
    new Setting(containerEl)
      .setName('Enable Public Repository')
      .setDesc('Upload images to public GitHub repository')
      .addToggle((toggle) =>
        toggle
          .setValue(publicRepo.enabled)
          .onChange(async (value) => {
            const current = this.plugin.settings.publicRepo || publicRepo
            this.plugin.settings.publicRepo = { ...current, enabled: value }
            await this.plugin.saveSettings()
          }),
      )

    // Owner
    new Setting(containerEl)
      .setName('Owner')
      .setDesc('GitHub username or organization')
      .addText((text) =>
        text
          .setPlaceholder('username')
          .setValue(publicRepo.owner)
          .onChange(async (value) => {
            const current = this.plugin.settings.publicRepo || publicRepo
            this.plugin.settings.publicRepo = { ...current, owner: value.trim() }
            await this.plugin.saveSettings()
          }),
      )

    // Repo
    new Setting(containerEl)
      .setName('Repository')
      .setDesc('Repository name')
      .addText((text) =>
        text
          .setPlaceholder('repo-name')
          .setValue(publicRepo.repo)
          .onChange(async (value) => {
            const current = this.plugin.settings.publicRepo || publicRepo
            this.plugin.settings.publicRepo = { ...current, repo: value.trim() }
            await this.plugin.saveSettings()
          }),
      )

    // Branch
    new Setting(containerEl)
      .setName('Branch')
      .setDesc('Target branch (default: main)')
      .addText((text) =>
        text
          .setPlaceholder('main')
          .setValue(publicRepo.branch)
          .onChange(async (value) => {
            const current = this.plugin.settings.publicRepo || publicRepo
            this.plugin.settings.publicRepo = { ...current, branch: value.trim() || 'main' }
            await this.plugin.saveSettings()
          }),
      )

    // Path
    new Setting(containerEl)
      .setName('Path')
      .setDesc('Directory path for images')
      .addText((text) =>
        text
          .setPlaceholder('images')
          .setValue(publicRepo.path)
          .onChange(async (value) => {
            const current = this.plugin.settings.publicRepo || publicRepo
            this.plugin.settings.publicRepo = { ...current, path: value.trim() }
            await this.plugin.saveSettings()
          }),
      )

    // Token
    new Setting(containerEl)
      .setName('Token')
      .setDesc('GitHub Personal Access Token (optional for public repos)')
      .addText((text) => {
        text.inputEl.type = 'password'
        text.setPlaceholder('ghp_xxxxxxxxxxxx')

        // Show masked value if token exists
        const existingToken = localStorage.getItem(GITHUB_TOKEN_PUBLIC_KEY)
        if (existingToken) {
          text.setValue('••••••••••••••••••••')
        }

        text.onChange((value) => {
          // Only update if value is not the mask
          if (value !== '••••••••••••••••••••') {
            if (value.trim()) {
              localStorage.setItem(GITHUB_TOKEN_PUBLIC_KEY, value.trim())
            } else {
              localStorage.removeItem(GITHUB_TOKEN_PUBLIC_KEY)
            }
          }
        })
      })

    // CDN Toggle
    new Setting(containerEl)
      .setName('Use jsDelivr CDN')
      .setDesc('Use CDN for faster image loading (recommended)')
      .addToggle((toggle) =>
        toggle
          .setValue(publicRepo.useCdn ?? true)
          .onChange(async (value) => {
            const current = this.plugin.settings.publicRepo || publicRepo
            this.plugin.settings.publicRepo = { ...current, useCdn: value }
            await this.plugin.saveSettings()
          }),
      )

    // Test Connection Button
    new Setting(containerEl).addButton((button) => {
      button.setButtonText('Test Public Connection').setCta().onClick(() => this.testPublicConnection())
    })
  }

  private createPrivateRepoSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Private Repository' })

    const privateRepo = this.plugin.settings.privateRepo || {
      enabled: false,
      owner: '',
      repo: '',
      branch: 'main',
      path: 'images',
    }

    // Enabled Toggle
    new Setting(containerEl)
      .setName('Enable Private Repository')
      .setDesc('Upload images to private GitHub repository')
      .addToggle((toggle) =>
        toggle
          .setValue(privateRepo.enabled)
          .onChange(async (value) => {
            const current = this.plugin.settings.privateRepo || privateRepo
            this.plugin.settings.privateRepo = { ...current, enabled: value }
            await this.plugin.saveSettings()
          }),
      )

    // Owner
    new Setting(containerEl)
      .setName('Owner')
      .setDesc('GitHub username or organization')
      .addText((text) =>
        text
          .setPlaceholder('username')
          .setValue(privateRepo.owner)
          .onChange(async (value) => {
            const current = this.plugin.settings.privateRepo || privateRepo
            this.plugin.settings.privateRepo = { ...current, owner: value.trim() }
            await this.plugin.saveSettings()
          }),
      )

    // Repo
    new Setting(containerEl)
      .setName('Repository')
      .setDesc('Repository name')
      .addText((text) =>
        text
          .setPlaceholder('private-repo')
          .setValue(privateRepo.repo)
          .onChange(async (value) => {
            const current = this.plugin.settings.privateRepo || privateRepo
            this.plugin.settings.privateRepo = { ...current, repo: value.trim() }
            await this.plugin.saveSettings()
          }),
      )

    // Branch
    new Setting(containerEl)
      .setName('Branch')
      .setDesc('Target branch (default: main)')
      .addText((text) =>
        text
          .setPlaceholder('main')
          .setValue(privateRepo.branch)
          .onChange(async (value) => {
            const current = this.plugin.settings.privateRepo || privateRepo
            this.plugin.settings.privateRepo = { ...current, branch: value.trim() || 'main' }
            await this.plugin.saveSettings()
          }),
      )

    // Path
    new Setting(containerEl)
      .setName('Path')
      .setDesc('Directory path for images')
      .addText((text) =>
        text
          .setPlaceholder('images')
          .setValue(privateRepo.path)
          .onChange(async (value) => {
            const current = this.plugin.settings.privateRepo || privateRepo
            this.plugin.settings.privateRepo = { ...current, path: value.trim() }
            await this.plugin.saveSettings()
          }),
      )

    // Token
    new Setting(containerEl)
      .setName('Token')
      .setDesc('GitHub Personal Access Token (required for private repos)')
      .addText((text) => {
        text.inputEl.type = 'password'
        text.setPlaceholder('ghp_xxxxxxxxxxxx')

        // Show masked value if token exists
        const existingToken = localStorage.getItem(GITHUB_TOKEN_PRIVATE_KEY)
        if (existingToken) {
          text.setValue('••••••••••••••••••••')
        }

        text.onChange((value) => {
          // Only update if value is not the mask
          if (value !== '••••••••••••••••••••') {
            if (value.trim()) {
              localStorage.setItem(GITHUB_TOKEN_PRIVATE_KEY, value.trim())
            } else {
              localStorage.removeItem(GITHUB_TOKEN_PRIVATE_KEY)
            }
          }
        })
      })

    // Test Connection Button
    new Setting(containerEl).addButton((button) => {
      button.setButtonText('Test Private Connection').setCta().onClick(() => this.testPrivateConnection())
    })
  }

  private createPrivateDirectoriesSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Private Directories' })
    containerEl.createEl('p', {
      text: 'Documents in these directories (and their subdirectories) will use the private repository.',
      cls: 'setting-item-description',
    })

    const dirs = this.plugin.settings.privateDirectories || []

    // Display current directories list
    const dirsContainer = containerEl.createDiv('private-dirs-list')
    dirsContainer.style.display = 'flex'
    dirsContainer.style.flexDirection = 'column'
    dirsContainer.style.gap = '8px'
    dirsContainer.style.marginBottom = '16px'

    const renderDirs = () => {
      dirsContainer.empty()
      dirs.forEach((dir, index) => {
        const dirEl = dirsContainer.createDiv()
        dirEl.style.display = 'flex'
        dirEl.style.alignItems = 'center'
        dirEl.style.gap = '8px'
        dirEl.style.padding = '4px 8px'
        dirEl.style.background = 'var(--background-modifier-form-field)'
        dirEl.style.borderRadius = '4px'

        dirEl.createSpan({ text: dir })

        const removeBtn = dirEl.createEl('button', { text: '×' })
        removeBtn.style.marginLeft = 'auto'
        removeBtn.style.background = 'none'
        removeBtn.style.border = 'none'
        removeBtn.style.cursor = 'pointer'
        removeBtn.style.fontSize = '16px'
        removeBtn.style.color = 'var(--text-muted)'
        removeBtn.addEventListener('click', () => {
          void (async () => {
            dirs.splice(index, 1)
            this.plugin.settings.privateDirectories = [...dirs]
            await this.plugin.saveSettings()
            renderDirs()
          })()
        })
      })
    }

    renderDirs()

    // Add new directory
    const addContainer = containerEl.createDiv()
    addContainer.style.display = 'flex'
    addContainer.style.gap = '8px'
    addContainer.style.marginTop = '8px'

    const input = addContainer.createEl('input', {
      type: 'text',
      placeholder: 'e.g., work/private',
    })
    input.style.flex = '1'
    input.style.padding = '4px 8px'

    const addBtn = addContainer.createEl('button', { text: 'Add' })
    addBtn.addEventListener('click', () => {
      void (async () => {
        const value = input.value.trim()
        if (value && !dirs.includes(value)) {
          dirs.push(value)
          this.plugin.settings.privateDirectories = [...dirs]
          await this.plugin.saveSettings()
          input.value = ''
          renderDirs()
        }
      })()
    })
  }

  private createGeneralSettingsSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'General Settings' })

    new Setting(containerEl)
      .setName('Confirm before upload')
      .setDesc('Show a confirmation dialog before uploading images')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRemoteUploadConfirmation)
          .onChange(async (value) => {
            this.plugin.settings.showRemoteUploadConfirmation = value
            await this.plugin.saveSettings()
          }),
      )
  }

  override hide() {
    void this.plugin.saveSettings().then(() => this.plugin.setupImagesUploader())
  }

  private async testPublicConnection() {
    const token = localStorage.getItem(GITHUB_TOKEN_PUBLIC_KEY)
    const publicRepo = this.plugin.settings.publicRepo

    if (!publicRepo?.enabled) {
      new Notice('❌ Public repository is not enabled')
      return
    }

    if (!publicRepo?.owner || !publicRepo?.repo) {
      new Notice('❌ Please enter both GitHub Owner and Repository')
      return
    }

    new Notice('Testing public connection...')

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${publicRepo.owner}/${publicRepo.repo}`,
        { headers },
      )

      if (response.ok) {
        new Notice('✅ Connection successful! Repository is accessible.')
      } else if (response.status === 404) {
        new Notice('❌ Repository not found. Check owner and repo name.')
      } else if (response.status === 401) {
        new Notice('❌ Authentication failed. Check your token.')
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data: { message?: string } = await response.json()
        new Notice(`❌ Error: ${data.message || response.statusText}`)
      }
    } catch (e) {
      new Notice('❌ Connection failed. Check your internet connection.')
      console.error('GitHub connection test failed:', e)
    }
  }

  private async testPrivateConnection() {
    const token = localStorage.getItem(GITHUB_TOKEN_PRIVATE_KEY)
    const privateRepo = this.plugin.settings.privateRepo

    if (!privateRepo?.enabled) {
      new Notice('❌ Private repository is not enabled')
      return
    }

    if (!token) {
      new Notice('❌ Please enter a GitHub Personal Access Token')
      return
    }

    if (!privateRepo?.owner || !privateRepo?.repo) {
      new Notice('❌ Please enter both GitHub Owner and Repository')
      return
    }

    new Notice('Testing private connection...')

    try {
      const response = await fetch(
        `https://api.github.com/repos/${privateRepo.owner}/${privateRepo.repo}`,
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
        new Notice('❌ Repository not found. Check owner, repo name, and token permissions.')
      } else if (response.status === 401) {
        new Notice('❌ Authentication failed. Check your token.')
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data: { message?: string } = await response.json()
        new Notice(`❌ Error: ${data.message || response.statusText}`)
      }
    } catch (e) {
      new Notice('❌ Connection failed. Check your internet connection.')
      console.error('GitHub connection test failed:', e)
    }
  }
}
