import { App, Canvas } from 'obsidian'

import type GitHubImagePlugin from './GitHubImagePlugin'

import ImageUploadBlockingModal from './ui/ImageUploadBlockingModal'
import RemoteUploadConfirmationDialog from './ui/RemoteUploadConfirmationDialog'
import ImageUploader from './uploader/ImageUploader'
import { buildPasteEventCopy } from './utils/events'
import { allFilesAreImages } from './utils/FileList'

export function createCanvasPasteHandler(
  plugin: GitHubImagePlugin,
  originalPasteHandler: (e: ClipboardEvent) => Promise<void>,
) {
  return function (this: { app: App; canvas: Canvas }, e: ClipboardEvent) {
    return canvasPaste.call(this, plugin, originalPasteHandler, e)
  }
}

async function canvasPaste(
  this: { app: App; canvas: Canvas },
  plugin: GitHubImagePlugin,
  originalPasteHandler: (e: ClipboardEvent) => Promise<void>,
  e: ClipboardEvent,
) {
  const { files } = e.clipboardData
  if (!allFilesAreImages(files) || files.length != 1) {
    void originalPasteHandler.call(this, e)
    return
  }

  // Get uploader based on current file (for Canvas, use default behavior)
  // Canvas doesn't have a file path context, so we try to get uploader and fallback if not available
  const activeFile = plugin.app.workspace.getActiveFile()
  const uploader = activeFile
    ? plugin.getUploaderForCurrentFile()
    : undefined

  if (!uploader) {
    // No uploader available, use default behavior
    void originalPasteHandler.call(this, e)
    return
  }

  if (plugin.settings.showRemoteUploadConfirmation) {
    const modal = new RemoteUploadConfirmationDialog(plugin.app)
    modal.open()

    const userResp = await modal.response()
    switch (userResp.shouldUpload) {
      case undefined:
        return
      case true:
        if (userResp.alwaysUpload) {
          plugin.settings.showRemoteUploadConfirmation = false
          void plugin.saveSettings()
        }
        break
      case false:
        void originalPasteHandler.call(this, e)
        return
      default:
        return
    }
  }

  const canvas: Canvas = this.canvas
  uploadImageOnCanvas(canvas, this.app, uploader, buildPasteEventCopy(e, files)).catch(() => {
    void originalPasteHandler.call(this, e)
  })
}

function uploadImageOnCanvas(canvas: Canvas, app: App, uploader: ImageUploader, e: ClipboardEvent) {
  const modal = new ImageUploadBlockingModal(app)
  modal.open()

  const file = e.clipboardData.files[0]
  return uploader
    .upload(file)
    .then((url: string) => {
      if (!modal.isOpen) {
        return
      }

      modal.close()
      pasteRemoteImageToCanvas(canvas, url)
    })
    .catch((err: Error) => {
      modal.close()
      throw err
    })
}

function pasteRemoteImageToCanvas(canvas: Canvas, imageUrl: string) {
  canvas.createTextNode({
    pos: canvas.posCenter(),
    position: 'center',
    text: `![](${imageUrl})`,
  })
}
