import {
  CanvasView,
  Editor,
  EditorPosition,
  MarkdownFileInfo,
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  ReferenceCache,
  TFile,
} from 'obsidian'

import { createCanvasPasteHandler } from './Canvas'
import DragEventCopy from './aux-event-classes/DragEventCopy'
import PasteEventCopy from './aux-event-classes/PasteEventCopy'
import { GITHUB_TOKEN_LOCALSTORAGE_KEY } from './github/constants'
import type GitHubUploader from './uploader/github/GitHubUploader'
import { DEFAULT_SETTINGS, type GitHubPluginSettings } from './plugin-settings'
import GitHubPluginSettingsTab from './ui/GitHubPluginSettingsTab'
import InfoModal from './ui/InfoModal'
import RemoteUploadConfirmationDialog from './ui/RemoteUploadConfirmationDialog'
import UpdateLinksConfirmationModal from './ui/UpdateLinksConfirmationModal'
import ApiError from './uploader/ApiError'
import ImageUploader from './uploader/ImageUploader'
import buildUploaderFrom from './uploader/imgUploaderFactory'
import { allFilesAreImages } from './utils/FileList'
import { findLocalFileUnderCursor, replaceFirstOccurrence } from './utils/editor'
import { fixImageTypeIfNeeded, removeReferenceIfPresent } from './utils/misc'
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

  private _imgUploader: ImageUploader

  get imgUploader(): ImageUploader {
    return this._imgUploader
  }

  private customPasteEventCallback = async (
    e: ClipboardEvent,
    _: Editor,
    markdownView: MarkdownView,
  ) => {
    if (e instanceof PasteEventCopy) return

    if (!this.imgUploader) {
      GitHubImagePlugin.showUnconfiguredPluginNotice()
      return
    }

    const { files } = e.clipboardData

    if (!allFilesAreImages(files)) return

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
      this.uploadFileAndEmbedImage(file).catch(() => {
        markdownView.currentMode.clipboardManager.handlePaste(new PasteEventCopy(e))
      })
    }
  }

  private customDropEventListener = async (e: DragEvent, _: Editor, markdownView: MarkdownView) => {
    if (e instanceof DragEventCopy) return

    if (!this.imgUploader) {
      GitHubImagePlugin.showUnconfiguredPluginNotice()
      return
    }

    if (e.dataTransfer.types.length !== 1 || e.dataTransfer.types[0] !== 'Files') {
      return
    }

    // Preserve files before showing modal, otherwise they will be lost from the event
    const { files } = e.dataTransfer

    if (!allFilesAreImages(files)) return

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
      const uploadPromise = this.uploadFileAndEmbedImage(image).catch(() => {
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
    const imageUrl = await this.uploadLocalImageFromEditor(editor, imageFile, start, end)
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
  ) {
    const arrayBuffer = await this.app.vault.readBinary(file)
    const fileToUpload = new File([arrayBuffer], file.name)
    editor.replaceRange('\n', end, end)
    const imageUrl = await this.uploadFileAndEmbedImage(fileToUpload, {
      ch: 0,
      line: end.line + 1,
    })
    editor.replaceRange(`<!--${editor.getRange(start, end)}-->`, start, end)
    return imageUrl
  }

  private async loadSettings() {
    this._settings = {
      ...DEFAULT_SETTINGS,
      ...((await this.loadData()) as GitHubPluginSettings),
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

      const src = imgElement.getAttribute('src')!
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
    const uploader = this.imgUploader as GitHubUploader | undefined
    if (!uploader) {
      throw new Error('GitHub 上传器未配置，请先配置插件设置')
    }

    // Parse URL: github-img://owner/repo/branch/path/to/file
    const urlWithoutProtocol = githubImgUrl.replace('github-img://', '')
    const pathParts = urlWithoutProtocol.split('/')
    if (pathParts.length < 4) {
      throw new Error('图片链接格式无效')
    }

    const filePath = pathParts.slice(3).join('/')
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
    const uploader = buildUploaderFrom(this._settings)
    this._imgUploader = uploader
    if (!uploader) return

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalUploadFunction = uploader.upload
    uploader.upload = function (image: File) {
      if (!uploader) return
      return originalUploadFunction.call(uploader, fixImageTypeIfNeeded(image))
    }
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

  private async uploadFileAndEmbedImage(file: File, atPos?: EditorPosition) {
    const pasteId = generatePseudoRandomId()
    this.insertTemporaryText(pasteId, atPos)

    let imgUrl: string
    try {
      imgUrl = await this.imgUploader.upload(file)
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
