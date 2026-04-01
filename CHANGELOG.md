# obsidian-github-image-plugin changelog

## [3.1.0] - 2026-04-01

### Added

- **Image Delete Functionality**: Delete images from documents and GitHub repository
  - Right-click on any image to show "Delete Image" context menu
  - Command `github-delete-image-under-cursor` for Vim mode (`:deleteGithubImage`)
  - Supports deleting all images from document (not just GitHub images)
  - Only deletes from GitHub if image belongs to current configured repository
  - Asynchronous deletion: document updates immediately, GitHub deletion happens in background
  - Confirmation dialog with keyboard navigation (↑/↓ to switch, Enter to confirm, ESC to cancel)

### Changed

- Delete confirmation dialog now supports keyboard navigation

[3.1.0]: https://github.com/inobit/obsidian-github-img-plugin/releases/tag/3.1.0

## [3.0.1] - 2026-04-01

### Changed

- **Image Filename**: Changed filename format from timestamp to readable date
  - Format: `YYYY-MM-DD-random.ext` (e.g., `2026-04-01-a3f8b2.png`)
  - More human-readable and easier to browse

### Fixed

- Updated CI/CD workflow to use maintained `softprops/action-gh-release`
- Updated `package.json` with correct project name and metadata

## [3.0.0] - 2026-04-01

**BREAKING CHANGE**: Complete migration from Imgur to GitHub

This release replaces Imgur image hosting with GitHub repository storage.

### Changed

- **Image Storage**: Migrated from Imgur to GitHub repository
  - Images are now stored in a GitHub repository instead of Imgur
  - Supports both public and private repositories
  - Uses GitHub Contents API for file upload

- **Authentication**: Replaced OAuth with Personal Access Token
  - GitHub Personal Access Token with `repo` scope required
  - Token stored in localStorage (`github-img-plugin-token`)
  - No more Imgur Client ID or OAuth flow

- **Settings**: New configuration options
  - `githubOwner`: GitHub username or organization
  - `githubRepo`: Repository name
  - `githubBranch`: Branch name (default: `main`)
  - `githubPath`: Directory path for images
  - `isPrivateRepo`: Flag for private repositories
  - Removed: `uploadStrategy`, `clientId`, `albumToUpload`

- **Private Repository Support**: Images in private repos displayed via blob URL
  - Uses MutationObserver to intercept image loading
  - Fetches image content via GitHub API
  - Converts to blob URL for display
  - Caches blob URLs for performance

### Removed

- Imgur-related code and dependencies
- OAuth authentication flow
- Album selection feature
- Image resizing commands (Imgur-specific)

### Added

- Connection test button in settings
- Human-friendly error messages in Chinese
- Blob URL caching for private repository images
- Automatic CSS hiding for unloaded private images

## [2.0.0] - 2021-07-10

This release brings images upload on behalf of authenticated user.

Now you have a choice:

- either to upload "anonymously" with `client_id`
- or to sign in with your Imgur account and have your images uploaded to your account

### Added

- User-friendly OAuth authentication (#5)

## [1.2.0] - 2021-06-02

### Fixed

- fall back to default behavior if image upload fails (#8, #9)

### Added

- An `ImageUploader` interface which should simplify creating forks supporting other image providers

## [1.1.0] - 2021-04-26

### Added

- support for upload on drag-and-drop
- which enabled gifs upload support (#6)

## [1.0.0] - 2021-01-15

- Initial version
- Works by providing `client_id` manually
- Only supports paste action

[3.0.1]: https://github.com/inobit/obsidian-github-img-plugin/releases/tag/3.0.1
[3.0.0]: https://github.com/inobit/obsidian-github-img-plugin/releases/tag/3.0.0
[2.0.0]: https://github.com/gavvvr/obsidian-imgur-plugin/releases/tag/2.0.0
[1.2.0]: https://github.com/gavvvr/obsidian-imgur-plugin/releases/tag/1.2.0
[1.1.0]: https://github.com/gavvvr/obsidian-imgur-plugin/releases/tag/1.1.0
[1.0.0]: https://github.com/gavvvr/obsidian-imgur-plugin/releases/tag/1.0.0
