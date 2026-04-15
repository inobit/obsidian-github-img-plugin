import {
  CanvasView,
  Editor,
  EditorPosition,
  MarkdownFileInfo,
  MarkdownView,
  Menu,
  Modal,
  Notice,
  Plugin,
  ReferenceCache,
  TFile,
} from 'obsidian'

import DragEventCopy from './aux-event-classes/DragEventCopy'
import PasteEventCopy from './aux-event-classes/PasteEventCopy'
import { createCanvasPasteHandler } from './Canvas'
import {
  GITHUB_TOKEN_PRIVATE_KEY,
  GITHUB_TOKEN_PUBLIC_KEY,
} from './github/constants'
import { DEFAULT_SETTINGS, type GitHubPluginSettings } from './plugin-settings'
import GitHubPluginSettingsTab from './ui/GitHubPluginSettingsTab'
import InfoModal from './ui/InfoModal'
import RemoteUploadConfirmationDialog from './ui/RemoteUploadConfirmationDialog'
import UpdateLinksConfirmationModal from './ui/UpdateLinksConfirmationModal'
import ApiError from './uploader/ApiError'
import GitHubUploader from './uploader/github/GitHubUploader'
import ImageUploader from './uploader/ImageUploader'
import {
  getUploaderForFile,
  isPrivateDocument,
} from './uploader/imgUploaderFactory'
import { findLocalFileUnderCursor, replaceFirstOccurrence } from './utils/editor'
import { allFilesAreImages } from './utils/FileList'
import { removeReferenceIfPresent } from './utils/misc'
import {
  filesAndLinksStatsFrom,
  getAllCachedReferencesForFile,
  replaceAllLocalReferencesWithRemoteOne,
} from './utils/obsidian-vault'
import { generatePseudoRandomId } from './utils/pseudo-random'

// Cache for private image blob URLs
const privateImageCache = new Map<string, string>()

interface LocalImageInEditor {
  image: {
    file: TFile
    start: EditorPosition
    end: EditorPosition
  }
  editor: Editor
  noteFile: TFile
}

export default class GitHubImagePlugin extends Plugin {
  _settings: GitHubPluginSettings

  get settings() {
    return this._settings
  }

  // Dynamic uploader getter based on current file
  getUploaderForCurrentFile(): ImageUploader | undefined {
    const activeFile = this.app.workspace.getActiveFile()
    if (!activeFile) return undefined

    return getUploaderForFile(activeFile.path, this._settings)
  }

  // Helper: check if current file is in private directory
  private isCurrentFilePrivate(): boolean {
    const activeFile = this.app.workspace.getActiveFile()
    if (!activeFile) return false
    return isPrivateDocument(activeFile.path, this._settings.privateDirectories)
  }

  private customPasteEventCallback = async (
    e: ClipboardEvent,
    _: Editor,
    markdownView: MarkdownView,
  ) => {
    if (e instanceof PasteEventCopy) return

    const { files } = e.clipboardData

    if (!allFilesAreImages(files)) return

    // Dynamic uploader based on current file
    const uploader = this.getUploaderForCurrentFile()

    if (!uploader) {
      // Show friendly notice
      const isPrivate = this.isCurrentFilePrivate()
      if (isPrivate) {
        new Notice('Private 仓库未配置，图片将保存到本地', 5000)
      } else {
        new Notice('Public 仓库未配置，图片将保存到本地', 5000)
      }

      // Let Obsidian handle default behavior
      markdownView.currentMode.clipboardManager.handlePaste(new PasteEventCopy(e))
      return
    }

    e.preventDefault()

    if (this._settings.showRemoteUploadConfirmation) {
      const modal = new RemoteUploadConfirmationDialog(this.app)
      modal.open()

      const userResp = await modal.response()
      switch (userResp.shouldUpload) {
        case undefined:
          return
        case true:
          if (userResp.alwaysUpload) {
            this._settings.showRemoteUploadConfirmation = false
            void this.saveSettings()
          }
          break
        case false:
          markdownView.currentMode.clipboardManager.handlePaste(new PasteEventCopy(e))
          return
        default:
          return
      }
    }

    for (const file of files) {
      this.uploadFileAndEmbedImage(file, uploader).catch(() => {
        markdownView.currentMode.clipboardManager.handlePaste(new PasteEventCopy(e))
      })
    }
  }

  private customDropEventListener = async (e: DragEvent, _: Editor, markdownView: MarkdownView) => {
    if (e instanceof DragEventCopy) return

    if (e.dataTransfer.types.length !== 1 || e.dataTransfer.types[0] !== 'Files') {
      return
    }

    // Preserve files before showing modal, otherwise they will be lost from the event
    const { files } = e.dataTransfer

    if (!allFilesAreImages(files)) return

    // Dynamic uploader based on current file
    const uploader = this.getUploaderForCurrentFile()

    if (!uploader) {
      // Show friendly notice
      const isPrivate = this.isCurrentFilePrivate()
      if (isPrivate) {
        new Notice('Private 仓库未配置，图片将保存到本地', 5000)
      } else {
        new Notice('Public 仓库未配置，图片将保存到本地', 5000)
      }
      return
    }

    e.preventDefault()

    if (this._settings.showRemoteUploadConfirmation) {
      const modal = new RemoteUploadConfirmationDialog(this.app)
      modal.open()

      const userResp = await modal.response()
      switch (userResp.shouldUpload) {
        case undefined:
          return
        case true:
          if (userResp.alwaysUpload) {
            this._settings.showRemoteUploadConfirmation = false
            void this.saveSettings()
          }
          break
        case false: {
          markdownView.currentMode.clipboardManager.handleDrop(DragEventCopy.create(e, files))
          return
        }
        default:
          return
      }
    }

    // Adding newline to avoid messing images pasted via default handler
    // with any text added by the plugin
    this.activeEditor.replaceSelection('\n')

    const promises: Promise<any>[] = []
    const filesFailedToUpload: File[] = []
    for (const image of files) {
      const uploadPromise = this.uploadFileAndEmbedImage(image, uploader).catch(() => {
        filesFailedToUpload.push(image)
      })
      promises.push(uploadPromise)
    }

    await Promise.all(promises)

    if (filesFailedToUpload.length === 0) {
      return
    }

    markdownView.currentMode.clipboardManager.handleDrop(
      DragEventCopy.create(e, filesFailedToUpload),
    )
  }

  private githubPluginRightClickHandler = (menu: Menu, editor: Editor, view: MarkdownView) => {
    const localFile = findLocalFileUnderCursor(editor, view)
    if (!localFile) return

    menu.addItem((item) => {
      item
        .setTitle('Upload to GitHub')
        .setIcon('wand')
        .onClick(() => this.doUploadLocalImage({ image: localFile, editor, noteFile: view.file }))
    })
  }

  private async doUploadLocalImage(imageInEditor: LocalImageInEditor) {
    const { image, editor, noteFile } = imageInEditor
    const { file: imageFile, start, end } = image

    // Get uploader based on the note file path
    const uploader = getUploaderForFile(noteFile.path, this._settings)
    if (!uploader) {
      const isPrivate = isPrivateDocument(noteFile.path, this._settings.privateDirectories)
      new Notice(`${isPrivate ? 'Private' : 'Public'} 仓库未配置，无法上传`, 5000)
      return
    }

    const imageUrl = await this.uploadLocalImageFromEditor(editor, imageFile, start, end, uploader)
    this.proposeToReplaceOtherLocalLinksIfAny(imageFile, imageUrl, {
      path: noteFile.path,
      startPosition: start,
    })
  }

  private proposeToReplaceOtherLocalLinksIfAny(
    originalLocalFile: TFile,
    remoteImageUrl: string,
    originalReference: { path: string; startPosition: EditorPosition },
  ) {
    const otherReferencesByNote = this.getAllCachedReferencesForFile(originalLocalFile)
    this.removeReferenceToOriginalNoteIfPresent(otherReferencesByNote, originalReference)

    const notesWithSameLocalFile = Object.keys(otherReferencesByNote)
    if (notesWithSameLocalFile.length === 0) return

    this.showLinksUpdateDialog(originalLocalFile, remoteImageUrl, otherReferencesByNote)
  }

  private getAllCachedReferencesForFile(file: TFile) {
    return getAllCachedReferencesForFile(this.app.metadataCache)(file)
  }

  private removeReferenceToOriginalNoteIfPresent = (
    referencesByNote: Record<string, ReferenceCache[]>,
    originalNoteRef: { path: string; startPosition: EditorPosition },
  ) => removeReferenceIfPresent(referencesByNote, originalNoteRef)

  private showLinksUpdateDialog(
    localFile: TFile,
    remoteImageUrl: string,
    otherReferencesByNote: Record<string, ReferenceCache[]>,
  ) {
    const stats = filesAndLinksStatsFrom(otherReferencesByNote)
    const dialogBox = new UpdateLinksConfirmationModal(this.app, localFile.path, stats)
    dialogBox.onDoNotUpdateClick(() => dialogBox.close())
    dialogBox.onDoUpdateClick(() => {
      dialogBox.disableButtons()
      dialogBox.setContent('Working...')
      replaceAllLocalReferencesWithRemoteOne(this.app.vault, otherReferencesByNote, remoteImageUrl)
        .catch((e) => {
          new InfoModal(
            this.app,
            'Error',
            'Unexpected error occurred, check Developer Tools console for details',
          ).open()
          console.error('Something bad happened during links update', e)
        })
        .finally(() => dialogBox.close())
      new Notice(`Updated ${stats.linksCount} links in ${stats.filesCount} files`)
    })
    dialogBox.open()
  }

  private async uploadLocalImageFromEditor(
    editor: Editor,
    file: TFile,
    start: EditorPosition,
    end: EditorPosition,
    uploader: ImageUploader,
  ) {
    const arrayBuffer = await this.app.vault.readBinary(file)
    const fileToUpload = new File([arrayBuffer], file.name)
    editor.replaceRange('\n', end, end)
    const imageUrl = await this.uploadFileAndEmbedImage(fileToUpload, uploader, {
      ch: 0,
      line: end.line + 1,
    })
    editor.replaceRange(`<!--${editor.getRange(start, end)}-->`, start, end)
    return imageUrl
  }

  private async loadSettings() {
    const loaded = (await this.loadData()) as GitHubPluginSettings

    this._settings = {
      ...DEFAULT_SETTINGS,
      ...loaded,
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this._settings)
  }

  private mutationObserver: MutationObserver | null = null

  override onload() {
    void this.initPlugin()
  }

  private async initPlugin() {
    await this.loadSettings()
    this.addSettingTab(new GitHubPluginSettingsTab(this.app, this))

    this.setupImagesUploader()
    this.setupHandlers()
    this.addUploadLocalCommand()

    // Setup MutationObserver to handle private repo images globally
    this.setupPrivateImageHandler()
    this.setupImageDeleteHandler()
  }

  /**
   * Setup handler to add delete option to image context menu
   */
  private setupImageDeleteHandler(): void {
    // Register context menu handler for images (use capture to intercept before Obsidian)
    document.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement
      const imgElement = target.closest('img')

      if (!imgElement) return

      // Get image URL - support all images
      const imageUrl = imgElement.src || ''
      if (!imageUrl) return

      // Prevent default context menu immediately
      e.preventDefault()
      e.stopPropagation()

      // Get the actual URL (handle blob URLs for private repos)
      let actualImageUrl = imageUrl
      if (actualImageUrl.startsWith('blob:')) {
        actualImageUrl = imgElement.getAttribute('data-github-img') || actualImageUrl
      }

      // Show custom menu for ALL images
      this.showImageContextMenu(e, imgElement, actualImageUrl)
    }, true) // Use capture phase
  }

  /**
   * Check if URL is a GitHub image
   */
  private isGitHubImageUrl(imageUrl: string): boolean {
    return imageUrl.includes('github-img://') ||
           imageUrl.includes('raw.githubusercontent.com') ||
           imageUrl.includes('cdn.jsdelivr.net')
  }

  /**
   * Check if image belongs to current configured repository
   */
  private isCurrentRepoImage(imgElement: HTMLImageElement): boolean {
    // Get the actual image URL - for blob URLs, check data attribute
    let imageUrl = imgElement.src || ''

    // For blob URLs (private repo images), get original URL from data attribute
    if (imageUrl.startsWith('blob:')) {
      const originalUrl = imgElement.getAttribute('data-github-img') || ''
      if (originalUrl) {
        imageUrl = originalUrl
      } else {
        return false
      }
    }

    // Must be GitHub image
    if (!this.isGitHubImageUrl(imageUrl)) return false

    // Parse URL and check against configured repos
    const settings = this._settings
    let owner: string | undefined
    let repo: string | undefined

    if (imageUrl.includes('github-img://')) {
      const parts = imageUrl.replace('github-img://', '').split('/')
      if (parts.length >= 2) {
        owner = parts[0]
        repo = parts[1]
      }
    } else if (imageUrl.includes('raw.githubusercontent.com')) {
      const match = /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)/.exec(imageUrl)
      if (match) {
        owner = match[1]
        repo = match[2]
      }
    } else if (imageUrl.includes('cdn.jsdelivr.net')) {
      const match = /cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^/]+)/.exec(imageUrl)
      if (match) {
        owner = match[1]
        repo = match[2]
      }
    }

    if (!owner || !repo) return false

    // Check if matches public or private repo
    const publicRepo = settings.publicRepo
    const privateRepo = settings.privateRepo

    if (publicRepo && publicRepo.owner === owner && publicRepo.repo === repo) {
      return true
    }

    if (privateRepo && privateRepo.owner === owner && privateRepo.repo === repo) {
      return true
    }

    return false
  }

  /**
   * Show custom context menu for image
   */
  private showImageContextMenu(
    e: MouseEvent,
    imgElement: HTMLImageElement,
    imageUrl: string
  ): void {
    const menu = new Menu()

    menu.addItem((item) => {
      item
        .setTitle('删除图片')
        .setIcon('trash-2')
        .setSection('danger')
        .onClick(() => {
          void this.deleteImageWithConfirm(imgElement, imageUrl)
        })
    })

    menu.addSeparator()

    menu.addItem((item) => {
      item
        .setTitle('复制图片地址')
        .setIcon('link')
        .onClick(() => {
          void navigator.clipboard.writeText(imageUrl)
          new Notice('图片 URL 已复制')
        })
    })

    menu.showAtPosition({ x: e.clientX, y: e.clientY })
  }

  /**
   * Delete image with confirmation
   * Always removes from document, only deletes from GitHub if it belongs to current repo
   */
  private async deleteImageWithConfirm(
    imgElement: HTMLImageElement,
    imageUrl: string
  ): Promise<void> {
    // Check if this is a GitHub image that might need repo deletion
    const isGitHubImage = this.isGitHubImageUrl(imageUrl)

    let fileName = '图片'
    let shouldDeleteFromGitHub = false
    let uploader: GitHubUploader | undefined
    let filePath: string | null = null

    // If it's a GitHub image, check if it belongs to current repo
    if (isGitHubImage) {
      // Try to determine which repo this image belongs to
      const settings = this._settings
      let owner: string | undefined
      let repo: string | undefined
      let branch: string | undefined

      // Parse URL to get owner/repo/branch
      if (imageUrl.includes('github-img://')) {
        const parts = imageUrl.replace('github-img://', '').split('/')
        if (parts.length >= 3) {
          owner = parts[0]
          repo = parts[1]
          branch = parts[2]
        }
      } else if (imageUrl.includes('raw.githubusercontent.com')) {
        const match = /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)/.exec(imageUrl)
        if (match) {
          owner = match[1]
          repo = match[2]
          branch = match[3]
        }
      } else if (imageUrl.includes('cdn.jsdelivr.net')) {
        const match = /cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^/]+)@([^/]+)/.exec(imageUrl)
        if (match) {
          owner = match[1]
          repo = match[2]
          branch = match[3]
        }
      }

      if (owner && repo && branch) {
        // Check if matches public repo
        if (settings.publicRepo?.owner === owner && settings.publicRepo?.repo === repo) {
          const token = localStorage.getItem(GITHUB_TOKEN_PUBLIC_KEY) || ''
          // Only attempt deletion if token is available
          if (token) {
            uploader = new GitHubUploader(
              settings.publicRepo.owner,
              settings.publicRepo.repo,
              branch, // Use branch from URL, not from settings
              settings.publicRepo.path || '',
              token,
              false,
              settings.publicRepo.useCdn ?? true
            )
            shouldDeleteFromGitHub = true
          }
        }
        // Check if matches private repo
        else if (settings.privateRepo?.owner === owner && settings.privateRepo?.repo === repo) {
          const token = localStorage.getItem(GITHUB_TOKEN_PRIVATE_KEY) || ''
          if (token) {
            uploader = new GitHubUploader(
              settings.privateRepo.owner,
              settings.privateRepo.repo,
              branch, // Use branch from URL, not from settings
              settings.privateRepo.path || '',
              token,
              true,
              false
            )
            shouldDeleteFromGitHub = true
          }
        }

        if (uploader) {
          filePath = uploader.parseImageUrlToPath(imageUrl)
          if (filePath) {
            fileName = filePath.split('/').pop() || '图片'
          }
        }
      }
    }

    // Show confirmation
    const confirmed = await this.confirmDelete(fileName, isGitHubImage)
    if (!confirmed) return

    // ===== ALWAYS: Immediately remove from DOM (sync) =====
    imgElement.style.display = 'none'

    // Defer editor update (async)
    setTimeout(() => {
      this.removeImageLinkFromEditor(imageUrl)
    }, 0)

    // Show document removal notification
    new Notice('图片已从文档移除', 2000)

    // Clean up cache if it exists
    if (privateImageCache.has(imageUrl)) {
      URL.revokeObjectURL(privateImageCache.get(imageUrl))
      privateImageCache.delete(imageUrl)
    }

    // ===== CONDITIONAL: Delete from GitHub only if belongs to current repo =====
    if (shouldDeleteFromGitHub && uploader && filePath) {
      this.deleteFromGitHubAsync(uploader, filePath, fileName).catch((e) => {
        console.error('[GitHubImage] Background delete failed:', e)
      })
    }
  }

  /**
   * Remove image markdown link from editor
   */
  private removeImageLinkFromEditor(imageUrl: string): void {
    try {
      const editor = this.activeEditor
      if (!editor) return

      const content = editor.getValue()
      const escapedUrl = imageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${escapedUrl}\\)`, 'g')

      const newContent = content.replace(regex, '')
      if (newContent !== content) {
        editor.setValue(newContent)
      }
    } catch (e) {
      console.error('[GitHubImage] Failed to update editor:', e)
    }
  }

  /**
   * Delete file from GitHub asynchronously
   */
  private async deleteFromGitHubAsync(
    uploader: GitHubUploader,
    filePath: string,
    fileName: string,
  ): Promise<void> {
    try {
      const sha = await uploader.getFileSha(filePath)
      if (!sha) {
        console.log('[GitHubImage] File already deleted or not found:', filePath)
        return
      }

      await uploader.deleteFile(filePath, sha)
      new Notice(`GitHub 图片 "${fileName}" 已删除`)
    } catch (e) {
      console.error('[GitHubImage] Failed to delete from GitHub:', e)
      const message = e instanceof ApiError ? e.message : '删除失败'
      new Notice(`GitHub 删除失败: ${fileName} - ${message}`, 5000)
    }
  }

  /**
   * Show delete confirmation dialog
   */
  private async confirmDelete(fileName: string, isGitHubImage = false): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app)
      modal.titleEl.setText('确认删除')

      const content = modal.contentEl
      content.createEl('p', { text: `确定要删除 "${fileName}" 吗？` })

      if (isGitHubImage) {
        content.createEl('p', {
          text: '这将同时删除 GitHub 仓库中的文件，且无法恢复。',
          attr: { style: 'color: #dc3545; font-size: 0.9em;' },
        })
      }

      const buttonContainer = content.createDiv({
        attr: { style: 'display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;' }
      })

      const cancelBtn = buttonContainer.createEl('button', { text: '取消' })
      cancelBtn.setAttribute('tabindex', '0')
      cancelBtn.addEventListener('click', () => {
        modal.close()
        resolve(false)
      })

      const deleteBtn = buttonContainer.createEl('button', {
        text: '删除',
        attr: { style: 'background: #dc3545; color: white;' },
      })
      deleteBtn.setAttribute('tabindex', '0')
      deleteBtn.addEventListener('click', () => {
        modal.close()
        resolve(true)
      })

      // Keyboard navigation
      const buttons = [cancelBtn, deleteBtn]
      let currentIndex = 0

      // Focus first button
      setTimeout(() => cancelBtn.focus(), 0)

      const handleKeydown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          // Toggle between buttons (0 <-> 1)
          currentIndex = currentIndex === 0 ? 1 : 0
          buttons[currentIndex].focus()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          // Click the focused button
          buttons[currentIndex].click()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          modal.close()
          resolve(false)
        }
      }

      modal.contentEl.addEventListener('keydown', handleKeydown)

      modal.open()
    })
  }

  /**
   * Setup MutationObserver to handle github-img:// URLs
   * This is more reliable than MarkdownPostProcessor because it catches
   * images before browser tries to load them
   */
  private setupPrivateImageHandler(): void {
    // Add CSS to hide images with github-img protocol initially
    const style = document.createElement('style')
    style.textContent = `
      img[src^="github-img://"] {
        visibility: hidden;
      }
    `
    document.head.appendChild(style)

    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            this.processPrivateImagesInElement(node)
          }
        }
      }
    })

    // Observe entire document for added nodes
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    })

    // Also process existing images
    this.processPrivateImagesInElement(document.body)
  }

  /**
   * Process all private images within an element
   */
  private processPrivateImagesInElement(element: HTMLElement): void {
    const images = element.querySelectorAll('img[src^="github-img://"]')

    for (const img of Array.from(images)) {
      const imgElement = img as HTMLImageElement
      if (imgElement.hasAttribute('data-github-img-processing')) continue

      const src = imgElement.getAttribute('src')
      imgElement.setAttribute('data-github-img-processing', 'true')
      imgElement.removeAttribute('src')
      imgElement.setAttribute('data-github-img', src)
      imgElement.style.visibility = 'visible'
      imgElement.style.opacity = '0.5'
      imgElement.alt = 'Loading...'

      void this.loadPrivateImage(imgElement, src)
    }
  }

  override onunload() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect()
      this.mutationObserver = null
    }

    // Clean up all blob URLs
    for (const [, blobUrl] of privateImageCache) {
      URL.revokeObjectURL(blobUrl)
    }
    privateImageCache.clear()
  }

  /**
   * Load private image and set blob URL
   */
  private async loadPrivateImage(img: HTMLImageElement, githubImgUrl: string): Promise<void> {
    // Check cache first
    if (privateImageCache.has(githubImgUrl)) {
      img.src = privateImageCache.get(githubImgUrl)!
      img.style.opacity = '1'
      return
    }

    try {
      const blobUrl = await this.fetchPrivateImageAsBlob(githubImgUrl)
      if (blobUrl) {
        privateImageCache.set(githubImgUrl, blobUrl)
        img.src = blobUrl
        img.style.opacity = '1'
      }
    } catch (e) {
      const errorMessage = this.getFriendlyErrorMessage(e)
      console.error(`[GitHubImage] Failed to load: ${githubImgUrl.replace('github-img://', '')}`, e)
      img.alt = errorMessage
      img.style.opacity = '1'
      img.classList.add('github-image-error')
    }
  }

  /**
   * Get human-friendly error message based on error type
   */
  private getFriendlyErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
      const message = error.message.toLowerCase()

      if (message.includes('not found')) {
        return '🔍 图片不存在或已被删除'
      }
      if (message.includes('bad credentials') || message.includes('unauthorized')) {
        return '🔒 认证失败，请检查 GitHub Token 是否有效'
      }
      if (message.includes('rate limit')) {
        return '⏱️ GitHub API 请求太频繁，请稍后再试'
      }
      if (message.includes('forbidden')) {
        return '🚫 没有权限访问该仓库或图片'
      }
      if (message.includes('network') || message.includes('fetch')) {
        return '📡 网络连接失败，请检查网络'
      }

      // Generic API error
      return `⚠️ 加载失败: ${error.message}`
    }

    if (error instanceof Error) {
      if (error.message.includes('network') || error.message.includes('fetch')) {
        return '📡 网络连接失败，请检查网络'
      }
      return `⚠️ 加载失败: ${error.message}`
    }

    return '⚠️ 图片加载失败，请稍后重试'
  }

  /**
   * Fetch private image and convert to blob URL
   * Format: github-img://owner/repo/branch/path
   * @throws ApiError or Error on failure
   */
  private async fetchPrivateImageAsBlob(githubImgUrl: string): Promise<string> {
    // Parse URL: github-img://owner/repo/branch/path/to/file
    const urlWithoutProtocol = githubImgUrl.replace('github-img://', '')
    const pathParts = urlWithoutProtocol.split('/')
    if (pathParts.length < 4) {
      throw new Error('图片链接格式无效')
    }

    const owner = pathParts[0]
    const repo = pathParts[1]
    const branch = pathParts[2]
    const filePath = pathParts.slice(3).join('/')

    // Check if the private repo is configured and matches
    const privateConfig = this._settings.privateRepo
    if (!privateConfig) {
      throw new Error('Private 仓库未配置')
    }

    if (privateConfig.owner !== owner || privateConfig.repo !== repo) {
      throw new Error('Private 仓库配置不匹配')
    }

    const token = localStorage.getItem(GITHUB_TOKEN_PRIVATE_KEY)
    if (!token) {
      throw new Error('Private 仓库 Token 未配置')
    }

    // Create temporary uploader for this request
    const uploader = new GitHubUploader(
      owner,
      repo,
      branch,
      privateConfig.path || '',
      token,
      true,
      false
    )

    const content = await uploader.getFileContent(filePath)

    // Convert base64 to blob
    const base64Data = content.content
    const mimeType = this.getMimeTypeFromFileName(content.name)
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }

    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: mimeType })

    return URL.createObjectURL(blob)
  }

  setupImagesUploader(): void {
    // This method is kept for backward compatibility
    // Uploaders are now created dynamically based on file path
  }

  private setupHandlers() {
    this.registerEvent(this.app.workspace.on('editor-paste', this.customPasteEventCallback))
    this.registerEvent(this.app.workspace.on('editor-drop', this.customDropEventListener))
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        const { view } = leaf

        if (view.getViewType() === 'canvas') {
          this.overridePasteHandlerForCanvasView(view as CanvasView)
        }
      }),
    )

    this.registerEvent(this.app.workspace.on('editor-menu', this.githubPluginRightClickHandler))
  }

  private overridePasteHandlerForCanvasView(view: CanvasView) {
    const originalPasteFn = view.handlePaste
    view.handlePaste = createCanvasPasteHandler(this, originalPasteFn)
  }

  private addUploadLocalCommand() {
    this.addCommand({
      id: 'github-upload-local',
      name: 'Upload to GitHub',
      editorCheckCallback: this.editorCheckCallbackForLocalUpload,
    })
    this.addCommand({
      id: 'github-delete-image-under-cursor',
      name: 'Delete image under cursor',
      editorCheckCallback: this.editorCheckCallbackForDeleteImage,
    })
  }

  private editorCheckCallbackForDeleteImage = (
    checking: boolean,
    editor: Editor,
    ctx: MarkdownFileInfo,
  ) => {
    const imageInfo = this.findImageUnderCursor(editor, ctx)
    if (!imageInfo) return false
    if (checking) return true

    void this.deleteImageFromCommand(imageInfo, editor)
  }

  /**
   * Find image link under cursor (any image, not just GitHub)
   */
  private findImageUnderCursor(
    editor: Editor,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _ctx: MarkdownFileInfo,
  ): { url: string; start: EditorPosition; end: EditorPosition } | null {
    const cursor = editor.getCursor()
    const content = editor.getValue()

    // Regex to match ANY image markdown
    const regex = /!\[([^\]]*)\]\(([^)]+)\)/g

    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      const url = match[2]
      const startIdx = match.index
      const endIdx = startIdx + match[0].length

      const startPos = this.indexToPosition(content, startIdx)
      const endPos = this.indexToPosition(content, endIdx)

      // Check if cursor is on the same line as the image
      if (cursor.line >= startPos.line && cursor.line <= endPos.line) {
        return { url, start: startPos, end: endPos }
      }
    }

    return null
  }

  /**
   * Convert string index to editor position
   */
  private indexToPosition(content: string, index: number): EditorPosition {
    const lines = content.substring(0, index).split('\n')
    const line = lines.length - 1
    const ch = lines[lines.length - 1].length
    return { line, ch }
  }

  /**
   * Delete image from command
   * Always removes from document, only deletes from GitHub if it belongs to current repo
   */
  private async deleteImageFromCommand(
    imageInfo: { url: string; start: EditorPosition; end: EditorPosition },
    editor: Editor,
  ): Promise<void> {
    const imageUrl = imageInfo.url
    const isGitHubImage = this.isGitHubImageUrl(imageUrl)

    let fileName = '图片'

    // Check if it's current repo image (for GitHub deletion)
    let shouldDeleteFromGitHub = false
    let uploader: GitHubUploader | undefined
    let filePath: string | null = null

    if (isGitHubImage) {
      // Try to determine which repo this image belongs to
      const settings = this._settings
      let owner: string | undefined
      let repo: string | undefined

      // Parse URL to get owner/repo
      if (imageUrl.includes('github-img://')) {
        const parts = imageUrl.replace('github-img://', '').split('/')
        if (parts.length >= 2) {
          owner = parts[0]
          repo = parts[1]
        }
      } else if (imageUrl.includes('raw.githubusercontent.com')) {
        const match = /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)/.exec(imageUrl)
        if (match) {
          owner = match[1]
          repo = match[2]
        }
      } else if (imageUrl.includes('cdn.jsdelivr.net')) {
        const match = /cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^/]+)/.exec(imageUrl)
        if (match) {
          owner = match[1]
          repo = match[2]
        }
      }

      if (owner && repo) {
        // Check if matches public repo
        if (settings.publicRepo?.owner === owner && settings.publicRepo?.repo === repo) {
          const token = localStorage.getItem(GITHUB_TOKEN_PUBLIC_KEY) || ''
          uploader = new GitHubUploader(
            settings.publicRepo.owner,
            settings.publicRepo.repo,
            settings.publicRepo.branch || 'main',
            settings.publicRepo.path || '',
            token,
            false,
            settings.publicRepo.useCdn ?? true
          )
          shouldDeleteFromGitHub = true
        }
        // Check if matches private repo
        else if (settings.privateRepo?.owner === owner && settings.privateRepo?.repo === repo) {
          const token = localStorage.getItem(GITHUB_TOKEN_PRIVATE_KEY) || ''
          if (token) {
            uploader = new GitHubUploader(
              settings.privateRepo.owner,
              settings.privateRepo.repo,
              settings.privateRepo.branch || 'main',
              settings.privateRepo.path || '',
              token,
              true,
              false
            )
            shouldDeleteFromGitHub = true
          }
        }

        if (uploader) {
          filePath = uploader.parseImageUrlToPath(imageUrl)
          if (filePath) {
            fileName = filePath.split('/').pop() || '图片'
          }
        }
      }
    }

    // Show confirmation
    const confirmed = await this.confirmDelete(fileName, isGitHubImage)
    if (!confirmed) return

    // ===== ALWAYS: Immediately remove from editor (sync) =====
    editor.replaceRange('', imageInfo.start, imageInfo.end)

    // Show document removal notification
    new Notice('图片已从文档移除', 2000)

    // Clean up cache if it exists
    if (privateImageCache.has(imageUrl)) {
      URL.revokeObjectURL(privateImageCache.get(imageUrl))
      privateImageCache.delete(imageUrl)
    }

    // ===== CONDITIONAL: Delete from GitHub only if belongs to current repo =====
    if (shouldDeleteFromGitHub && uploader && filePath) {
      this.deleteFromGitHubAsync(uploader, filePath, fileName).catch((e) => {
        console.error('[GitHubImage] Background delete failed:', e)
      })
    }
  }

  private editorCheckCallbackForLocalUpload = (
    checking: boolean,
    editor: Editor,
    ctx: MarkdownFileInfo,
  ) => {
    const localFile = findLocalFileUnderCursor(editor, ctx)
    if (!localFile) return false
    if (checking) return true

    void this.doUploadLocalImage({ image: localFile, editor, noteFile: ctx.file })
  }

  private getMimeTypeFromFileName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      tiff: 'image/tiff',
    }
    return mimeTypes[ext || ''] || 'image/png'
  }

  private static showUnconfiguredPluginNotice() {
    const fiveSecondsMillis = 5_000
    new Notice(
      '⚠️ Please configure GitHub settings (owner, repo, token) or disable the plugin',
      fiveSecondsMillis,
    )
  }

  private async uploadFileAndEmbedImage(file: File, uploader?: ImageUploader, atPos?: EditorPosition) {
    const actualUploader = uploader || this.getUploaderForCurrentFile()

    if (!actualUploader) {
      throw new Error('Uploader not available')
    }

    const pasteId = generatePseudoRandomId()
    this.insertTemporaryText(pasteId, atPos)

    let imgUrl: string
    try {
      imgUrl = await actualUploader.upload(file)
    } catch (e) {
      if (e instanceof ApiError) {
        this.handleFailedUpload(
          pasteId,
          `Upload failed, GitHub API returned an error: ${e.message}`,
        )
      } else {
        console.error('Failed GitHub upload: ', e)
        this.handleFailedUpload(pasteId, '⚠️GitHub upload failed, check dev console')
      }
      throw e
    }
    this.embedMarkDownImage(pasteId, imgUrl)
    return imgUrl
  }

  private insertTemporaryText(pasteId: string, atPos?: EditorPosition) {
    const progressText = GitHubImagePlugin.progressTextFor(pasteId)
    const replacement = `${progressText}\n`
    const editor = this.activeEditor
    if (atPos) {
      editor.replaceRange(replacement, atPos, atPos)
    } else {
      editor.replaceSelection(replacement)
    }
  }

  private static progressTextFor(id: string) {
    return `![Uploading file...${id}]()`
  }

  private embedMarkDownImage(pasteId: string, imageUrl: string) {
    const progressText = GitHubImagePlugin.progressTextFor(pasteId)
    const markDownImage = `![](${imageUrl})`

    replaceFirstOccurrence(this.activeEditor, progressText, markDownImage)
  }

  private handleFailedUpload(pasteId: string, message: string) {
    const progressText = GitHubImagePlugin.progressTextFor(pasteId)
    replaceFirstOccurrence(this.activeEditor, progressText, `<!--${message}-->`)
  }

  private get activeEditor(): Editor {
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView)
    return mdView.editor
  }
}
