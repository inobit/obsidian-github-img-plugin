import ObsidianApp from './obsidian-app.page'

class ObsidianSettings {
  async switchToGitHubImageSettingsTab() {
    await $('.vertical-tab-nav-item=GitHub Image').click()
  }

  // Public Repository Settings
  async configurePublicRepository(config: {
    owner: string
    repo: string
    branch?: string
    path?: string
    token?: string
    useCdn?: boolean
  }) {
    // Enable public repository
    await this.toggleSetting('Enable public repository', true)

    if (config.owner) {
      await this.setSettingValue('GitHub Owner', config.owner)
    }
    if (config.repo) {
      await this.setSettingValue('Repository', config.repo)
    }
    if (config.branch) {
      await this.setSettingValue('Branch', config.branch)
    }
    if (config.path) {
      await this.setSettingValue('Path', config.path)
    }
    if (config.token) {
      await this.setSettingValue('Personal Access Token', config.token, true)
    }
    if (config.useCdn !== undefined) {
      await this.toggleSetting('Use CDN', config.useCdn)
    }
  }

  // Private Repository Settings
  async configurePrivateRepository(config: {
    owner: string
    repo: string
    branch?: string
    path?: string
    token: string
  }) {
    // Enable private repository
    await this.toggleSetting('Enable private repository', true)

    if (config.owner) {
      await this.setSettingValue('GitHub Owner (Private)', config.owner)
    }
    if (config.repo) {
      await this.setSettingValue('Repository (Private)', config.repo)
    }
    if (config.branch) {
      await this.setSettingValue('Branch (Private)', config.branch)
    }
    if (config.path) {
      await this.setSettingValue('Path (Private)', config.path)
    }
    if (config.token) {
      await this.setSettingValue('Personal Access Token (Private)', config.token, true)
    }
  }

  async setPrivateDirectories(directories: string[]) {
    const dirsString = directories.join('\n')
    await this.setSettingValue('Private Directories', dirsString)
  }

  private async setSettingValue(settingName: string, value: string, isPassword = false) {
    const settingItem = await this.findSettingItem(settingName)
    const inputType = isPassword ? 'password' : 'text'
     
    const input = await settingItem.$(`.setting-item-control input[type="${inputType}"]`)
    await input.setValue(value)
  }

  private async toggleSetting(settingName: string, enabled: boolean) {
    const settingItem = await this.findSettingItem(settingName)
     
    const toggle = await settingItem.$('.checkbox-container input')
    const isCurrentlyChecked = await toggle.isSelected()

    if (isCurrentlyChecked !== enabled) {
      await toggle.click()
    }
  }

  private async findSettingItem(settingName: string) {
    const settingItem = await $$('div.setting-item').find<WebdriverIO.Element>(async (item) => {
      const label = await item.$('.setting-item-info .setting-item-name').getText()
      return label === settingName
    })
    if (!settingItem) {
      throw new Error(`Setting item '${settingName}' not found`)
    }
    return settingItem
  }

  async closeSettings() {
    await ObsidianApp.closeModal('Settings')
  }
}

export default new ObsidianSettings()
