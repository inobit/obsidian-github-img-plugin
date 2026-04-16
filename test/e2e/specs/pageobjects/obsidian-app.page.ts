// Use type-only import to avoid runtime resolution issues
import type { EditorPosition } from 'obsidian'

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { Key } from 'webdriverio'

import { GITHUB_PLUGIN_ID, TEST_VAULT_DIR } from '../../constants'
import CanvasCard from './canvas-card.page'
import ObsidianSettings from './obsidian-settings.page'

const EXAMPLE_PNG_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAABlBMVEUAAAD///+' +
  'l2Z/dAAAAM0lEQVR4nGP4/5/h/1+' +
  'G/58ZDrAz3D/McH8yw83NDDeNGe4Ug9C9zwz3gVLMDA/A6P9/AFGGFyjOXZtQAAAAAElFTkSuQmCC'

class ObsidianApp {
  async removeE2eTestVaultIfExists() {
    await fs.rm(TEST_VAULT_DIR, { force: true, recursive: true })
  }

  async createAndOpenFreshVault() {
    await browser.execute((testVaultDir: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ipcRenderer } = require('electron')
      const shouldCreateNewVault = true
      ipcRenderer.sendSync('vault-open', testVaultDir, shouldCreateNewVault)
    }, TEST_VAULT_DIR)

    const targetPluginsDir = `${TEST_VAULT_DIR}/.obsidian/plugins/${GITHUB_PLUGIN_ID}/`
    await fs.mkdir(targetPluginsDir, { recursive: true })
    await fs.copyFile('manifest.json', `${targetPluginsDir}/manifest.json`)
    await fs.copyFile('main.js', `${targetPluginsDir}/main.js`)

    await this.switchToMainWindow()
    await $('button=Trust author and enable plugins').click()
    await this.closeModal('Trust vault modal')
  }

  private async switchToMainWindow() {
    await browser.switchWindow('app://obsidian.md/index.html')
  }

  async activateGitHubImagePlugin() {
    await this.activatePlugin(GITHUB_PLUGIN_ID)
  }

  private async activatePlugin(pluginId: string) {
    await browser.execute((id: string) => {
      const app = (window as any).app
      app.plugins.setEnable(true)
      app.plugins.enablePlugin(id)
    }, pluginId)
  }

  async closeModal(modalName: string) {
    console.log(`Closing '${modalName}'`)
    await $('.modal-close-button').click()
  }

  async openSettings() {
    await browser.execute(() => {
      const app = (window as any).app
      app.commands.executeCommandById('app:open-settings')
    })
    return ObsidianSettings
  }

  async createNewNoteWithContent(content: string) {
    await this.doCreateNewNote(content)
  }

  async createNewEmptyCanvas() {
    await $('aria/Create new canvas').click()
    await $('.workspace-leaf.mod-active .view-content').click()
  }

  async findAndSwitchToCanvasCard() {
    await browser.switchFrame(await $('iframe').getElement())
    return CanvasCard
  }

  async createNewNote() {
    await this.doCreateNewNote()
  }

  private async doCreateNewNote(content?: string) {
    const newNoteButton = $('aria/New note')
    await newNoteButton.click()

    const noteContent = $('.workspace-leaf.mod-active .cm-contentContainer')
    await noteContent.click()
    if (content) {
      await browser.execute((noteContent: string) => {
        const app = (window as any).app
        app.workspace.activeEditor!.editor!.setValue(noteContent)
      }, content)
    }
  }

  async createNoteInDirectory(dirPath: string, content?: string) {
    // Create directory structure and note
    const fullDirPath = path.join(TEST_VAULT_DIR, dirPath)
    await fs.mkdir(fullDirPath, { recursive: true })

    const noteName = 'test-note.md'
    const notePath = path.join(fullDirPath, noteName)
    await fs.writeFile(notePath, content || '')

    // Open the note in Obsidian
    await browser.execute(
      (relativePath: string) => {
        const app = (window as any).app
        const abstractFile = app.vault.getAbstractFileByPath(relativePath)

        if (abstractFile && abstractFile.extension === 'md') {
          app.workspace.getLeaf().openFile(abstractFile)
        }
      },
      path.join(dirPath, noteName).replace(/\\/g, '/'),
    )
  }

  async deleteGitHubImageUsingCommandPalette() {
    await this.openCommandPalette()
    await browser.keys('Delete GitHub Image')
    await this.hitEnter()
  }

  async uploadLocalImageToGitHubUsingCommandPalette() {
    await this.openCommandPalette()
    await browser.keys('Upload local image to GitHub')
    await this.hitEnter()
  }

  private async openCommandPalette() {
    await browser.keys([Key.Ctrl, 'p'])
  }

  private async hitEnter() {
    await browser.keys(Key.Enter)
  }

  async getTextFromOpenedNote(): Promise<string> {
    return await browser.execute(() => {
      const app = (
        window as unknown as {
          app: { workspace: { activeEditor: { editor: { getValue: () => string } } } }
        }
      ).app
      return app.workspace.activeEditor.editor.getValue()
    })
  }

  async setCursorPositionInActiveNote(position: EditorPosition) {
    await browser.execute((pos: EditorPosition) => {
      const app = (window as any).app
      app.workspace.activeEditor!.editor!.setCursor(pos)
    }, position)
  }

  async loadSampleImageToClipboard() {
    await browser.execute((imageBase64: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { nativeImage, clipboard } = require('electron')
      const dataUrl = 'data:image/png;base64,' + imageBase64
      const sampleImage = nativeImage.createFromDataURL(dataUrl)
      clipboard.writeImage(sampleImage)
    }, EXAMPLE_PNG_IMAGE_BASE64)
  }

  async putExampleImageToVault(pathRelativeToVault: string) {
    const imageBuffer = Buffer.from(EXAMPLE_PNG_IMAGE_BASE64, 'base64')
    await fs.writeFile(path.join(TEST_VAULT_DIR, pathRelativeToVault), imageBuffer)
  }

  async pasteFromClipboard() {
    await browser.keys([Key.Ctrl, 'v'])
  }

  async confirmUpload() {
    await $('button=Upload').click()
  }

  async cancelUpload() {
    await $('button=Cancel').click()
  }

  async confirmDelete() {
    await $('button=Delete').click()
  }

  async confirmReplacingAllLinks() {
    await $('//div[@class="modal"]//button[text()="Yes"]').click()
  }

  async getNoticeText(): Promise<string | null> {
    const notice = $('.notice')
    if (await notice.isExisting()) {
      return await notice.getText()
    }
    return null
  }

  async waitForNoticeContaining(text: string, timeout = 5000) {
    await browser.waitUntil(
      async () => {
        const noticeText = await this.getNoticeText()
        return noticeText?.includes(text) || false
      },
      { timeout, timeoutMsg: `Expected notice containing "${text}"` },
    )
  }
}

export default new ObsidianApp()
