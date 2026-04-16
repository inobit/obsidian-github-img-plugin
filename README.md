# GitHub Image Plugin for Obsidian

This plugin uploads images to a GitHub repository instead of storing them locally in your vault.

## Why?

Obsidian stores all data locally by design. If you often add pictures to your notes, your vault can quickly grow in size, which can lead to reaching limits if you use free plans of cloud storage services or can lead to growth of repository size if you use git to back up your notes.

This plugin is a solution for people who paste images to their notes on a daily basis and do not want to clutter their vaults with image files.

## Features

- Upload images to a GitHub repository (public or private)
- Support for clipboard paste and drag-and-drop
- **Multi-repository support**: Configure separate public and private repositories based on file paths
- **Image deletion**: Delete images from GitHub directly from Obsidian (right-click menu or command palette)
- **CDN acceleration**: Use jsDelivr CDN for faster image loading from public repositories
- Token is stored securely in localStorage (not synced with vault)
- Private repository support via GitHub API

## Configuration

1. Go to Settings → GitHub Image
2. Configure the following:

### Public Repository (Default)

- **Enabled**: Enable public repository uploads
- **GitHub Owner**: Your GitHub username or organization
- **Repository**: The repository name to store images
- **Branch**: The branch to upload to (default: main)
- **Path**: The directory path within the repository (e.g., "images")
- **Use CDN**: Enable jsDelivr CDN acceleration for public access
- **Personal Access Token**: GitHub token (optional for public repos, required for private repos)

### Private Repository (Optional)

- **Enabled**: Enable private repository uploads
- Configure the same fields as public repository
- **Private Directories**: List of directory paths (e.g., "private", "notes/confidential") that will use the private repository instead of public

### How Multi-Repository Works

- Files in `Private Directories` and their subdirectories will use the **private repository**
- All other files will use the **public repository**
- Example: If you set `Private Directories` to `["private"]`, then:
  - `notes/idea.md` → public repository
  - `private/diary.md` → private repository
  - `private/2024/january.md` → private repository

## Creating a GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with the `repo` scope
3. Copy the token and paste it in the plugin settings

**Note**:

- The token is stored locally in your browser's localStorage and is not synced with your vault
- Public and private repositories use separate tokens for better security isolation

## Image Deletion

You can delete images from GitHub in two ways:

1. **Right-click in Preview Mode**: Right-click on any GitHub-hosted image and select "Delete from GitHub"
2. **Command Palette**: Use the "Delete GitHub Image" command to delete the image under cursor

A confirmation dialog will appear before deletion. After deletion, the image link in your note will be replaced with a placeholder.

## Important Notes

- **Rate Limits**: GitHub API has a rate limit of 5000 requests per hour for authenticated users
- **File Size**: Maximum file size is 100MB per image
- **File Naming**: Uploaded images use `YYYY-MM-DD-random.ext` format to avoid conflicts
- **Private Repositories**: Images in private repositories are fetched via GitHub API and displayed as blob URLs
- **CDN**: jsDelivr CDN is recommended for public repositories to improve loading speed in China and other regions

## Development

See [CLAUDE.md](CLAUDE.md) for development documentation.

## License

MIT
