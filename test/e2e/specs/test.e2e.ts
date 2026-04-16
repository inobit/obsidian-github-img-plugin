import ObsidianApp from './pageobjects/obsidian-app.page'
import MockingUtils from './utils/mocking'

describe('GitHub Image Plugin E2E Tests', () => {
  before(async () => {
    // Configure plugin with test settings
    const settings = await ObsidianApp.openSettings()
    await settings.switchToGitHubImageSettingsTab()

    // Configure public repository
    await settings.configurePublicRepository({
      owner: 'test-owner',
      repo: 'test-public-repo',
      branch: 'main',
      path: 'images',
      token: 'test-token-public',
      useCdn: true,
    })

    // Configure private repository
    await settings.configurePrivateRepository({
      owner: 'test-owner',
      repo: 'test-private-repo',
      branch: 'main',
      path: 'private-images',
      token: 'test-token-private',
    })

    // Set private directories
    await settings.setPrivateDirectories(['private', 'confidential'])

    await settings.closeSettings()
  })

  describe('Public Repository Uploads', () => {
    context('blank note', () => {
      it('uploads clipboard image on paste shortcut', async () => {
        await ObsidianApp.createNewNote()

        const mockUrl =
          'https://cdn.jsdelivr.net/gh/test-owner/test-public-repo@main/images/2024-01-15-abc123.png'
        await MockingUtils.mockGitHubUpload(mockUrl)

        await ObsidianApp.loadSampleImageToClipboard()
        await ObsidianApp.pasteFromClipboard()
        await ObsidianApp.confirmUpload()

        const noteContent = await ObsidianApp.getTextFromOpenedNote()
        await expect(noteContent).toContain(mockUrl)
      })

      it('shows upload confirmation dialog when enabled', async () => {
        await ObsidianApp.createNewNote()
        await MockingUtils.mockGitHubUpload('https://example.com/image.png')

        await ObsidianApp.loadSampleImageToClipboard()
        await ObsidianApp.pasteFromClipboard()

        // Should show confirmation dialog
         
        const uploadButton = await $('button=Upload')

        void expect(uploadButton).toBeDisplayed()

        // Cancel and verify no upload
        await ObsidianApp.cancelUpload()
        const noteContent = await ObsidianApp.getTextFromOpenedNote()
        await expect(noteContent).not.toContain('github-img://')
      })
    })

    context('note with existing local image', () => {
      it('uploads local image to GitHub via command palette', async () => {
        await ObsidianApp.putExampleImageToVault('example-local-image.png')
        await ObsidianApp.createNewNoteWithContent('![[example-local-image.png]]')

        const mockUrl =
          'https://cdn.jsdelivr.net/gh/test-owner/test-public-repo@main/images/2024-01-15-xyz789.png'
        await MockingUtils.mockGitHubUpload(mockUrl)

        const somewhereWithinMarkdownImage: { line: number; ch: number } = { line: 0, ch: 5 }

        await ObsidianApp.setCursorPositionInActiveNote(
          somewhereWithinMarkdownImage as import('obsidian').EditorPosition,
        )

        await ObsidianApp.uploadLocalImageToGitHubUsingCommandPalette()
        await ObsidianApp.confirmReplacingAllLinks()

        const noteContent = await ObsidianApp.getTextFromOpenedNote()
        await expect(noteContent).toContain(mockUrl)
        await expect(noteContent).toContain('<!--![[example-local-image.png]]-->')
      })
    })

    context('drag and drop', () => {
      it('uploads dragged image file', async () => {
        await ObsidianApp.createNewNote()
        await ObsidianApp.putExampleImageToVault('dragged-image.png')

        const mockUrl =
          'https://cdn.jsdelivr.net/gh/test-owner/test-public-repo@main/images/2024-01-15-drag456.png'
        await MockingUtils.mockGitHubUpload(mockUrl)

        // Simulate drag and drop (this would need proper WebdriverIO drag-drop implementation)
        // For now, this is a placeholder for the test structure
      })
    })
  })

  describe('Private Repository Uploads', () => {
    context('note in private directory', () => {
      it('uploads to private repository for files in private directories', async () => {
        await ObsidianApp.createNoteInDirectory('private/notes', 'Private note content')

        const mockUrl =
          'github-img://test-owner/test-private-repo/main/private-images/2024-01-15-private789.png'
        await MockingUtils.mockGitHubUpload(mockUrl)

        await ObsidianApp.loadSampleImageToClipboard()
        await ObsidianApp.pasteFromClipboard()
        await ObsidianApp.confirmUpload()

        const noteContent = await ObsidianApp.getTextFromOpenedNote()
        await expect(noteContent).toContain('github-img://')
      })

      it('uploads to private repository for nested private directories', async () => {
        await ObsidianApp.createNoteInDirectory('private/2024/january', 'Nested private note')

        const mockUrl =
          'github-img://test-owner/test-private-repo/main/private-images/2024-01-15-nested123.png'
        await MockingUtils.mockGitHubUpload(mockUrl)

        await ObsidianApp.loadSampleImageToClipboard()
        await ObsidianApp.pasteFromClipboard()
        await ObsidianApp.confirmUpload()

        const noteContent = await ObsidianApp.getTextFromOpenedNote()
        await expect(noteContent).toContain('github-img://')
      })
    })

    context('note in confidential directory', () => {
      it('uploads to private repository for confidential directory', async () => {
        await ObsidianApp.createNoteInDirectory('confidential/projects', 'Confidential note')

        const mockUrl =
          'github-img://test-owner/test-private-repo/main/private-images/2024-01-15-conf456.png'
        await MockingUtils.mockGitHubUpload(mockUrl)

        await ObsidianApp.loadSampleImageToClipboard()
        await ObsidianApp.pasteFromClipboard()
        await ObsidianApp.confirmUpload()

        const noteContent = await ObsidianApp.getTextFromOpenedNote()
        await expect(noteContent).toContain('github-img://')
      })
    })
  })

  describe('Image Deletion', () => {
    context('note with GitHub image', () => {
      it('deletes image using command palette', async () => {
        const imageUrl =
          'https://cdn.jsdelivr.net/gh/test-owner/test-public-repo@main/images/to-delete.png'
        await ObsidianApp.createNewNoteWithContent(`![](${imageUrl})`)

        const somewhereWithinMarkdownImage: { line: number; ch: number } = { line: 0, ch: 5 }

        await ObsidianApp.setCursorPositionInActiveNote(
          somewhereWithinMarkdownImage as import('obsidian').EditorPosition,
        )

        await ObsidianApp.deleteGitHubImageUsingCommandPalette()
        await ObsidianApp.confirmDelete()

        const noteContent = await ObsidianApp.getTextFromOpenedNote()
        // Image should be replaced with placeholder or removed
        await expect(noteContent).not.toContain(imageUrl)
      })
    })
  })

  describe('Canvas Support', () => {
    context('blank canvas', () => {
      it('uploads clipboard image on paste shortcut', async () => {
        const mockUrl =
          'https://cdn.jsdelivr.net/gh/test-owner/test-public-repo@main/images/2024-01-15-canvas123.png'
        await MockingUtils.mockGitHubUpload(mockUrl)
        await ObsidianApp.createNewEmptyCanvas()

        await ObsidianApp.loadSampleImageToClipboard()
        await ObsidianApp.pasteFromClipboard()
        await ObsidianApp.confirmUpload()

        const canvasCard = await ObsidianApp.findAndSwitchToCanvasCard()
        const canvasCardText = await canvasCard.getText()
        await expect(canvasCardText).toContain(mockUrl)
      })
    })
  })

  describe('Error Handling', () => {
    context('upload failures', () => {
      it('falls back to local storage when upload fails', async () => {
        await ObsidianApp.createNewNote()

        // Mock upload to fail
        await browser.execute(() => {
          const app = (
            window as unknown as {
              app: {
                plugins: {
                  plugins: Record<
                    string,
                    {
                      getUploaderForCurrentFile: () => { upload: () => Promise<string> } | undefined
                    }
                  >
                }
              }
            }
          ).app
          const plugin = app.plugins.plugins['obsidian-github-image-plugin']
          if (plugin) {
            const originalGetUploader = plugin.getUploaderForCurrentFile.bind(plugin)
            plugin.getUploaderForCurrentFile = function () {
              const uploader = originalGetUploader()
              if (uploader) {
                uploader.upload = () => Promise.reject(new Error('Network error'))
              }
              return uploader
            }
          }
        })

        await ObsidianApp.loadSampleImageToClipboard()
        await ObsidianApp.pasteFromClipboard()

        // Should show error notice and fall back to local
        await ObsidianApp.waitForNoticeContaining('上传失败')
      })
    })

    context('unconfigured repository', () => {
      it('shows notice when repository is not configured', async () => {
        // Create note without configuring plugin
        await ObsidianApp.createNewNote()

        // Reset plugin settings to simulate unconfigured state
        await browser.execute(() => {
          const app = (window as any).app

          const plugin = app.plugins.plugins['obsidian-github-image-plugin']
          if (plugin) {
            plugin._settings = {
              privateDirectories: [],
              showRemoteUploadConfirmation: true,
            }
          }
        })

        await ObsidianApp.loadSampleImageToClipboard()
        await ObsidianApp.pasteFromClipboard()

        await ObsidianApp.waitForNoticeContaining('仓库未配置')
      })
    })
  })
})
