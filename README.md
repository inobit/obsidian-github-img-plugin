# GitHub Image Plugin for Obsidian

This plugin uploads images to a GitHub repository instead of storing them locally in your vault.

## Why?

Obsidian stores all data locally by design. If you often add pictures to your notes, your vault can quickly grow in size, which can lead to reaching limits if you use free plans of cloud storage services or can lead to growth of repository size if you use git to back up your notes.

This plugin is a solution for people who paste images to their notes on a daily basis and do not want to clutter their vaults with image files.

## Features

- Upload images to a GitHub repository (public or private)
- Support for clipboard paste and drag-and-drop
- Token is stored securely in localStorage (not synced with vault)
- Private repository support via GitHub API

## Configuration

1. Go to Settings → GitHub Image
2. Configure the following:
   - **GitHub Owner**: Your GitHub username or organization
   - **Repository**: The repository name to store images
   - **Branch**: The branch to upload to (default: main)
   - **Path**: The directory path within the repository (e.g., "images")
   - **Personal Access Token**: GitHub token with `repo` scope
   - **Private Repository**: Enable if your repository is private

### Creating a GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with the `repo` scope
3. Copy the token and paste it in the plugin settings

**Note**: The token is stored locally in your browser's localStorage and is not synced with your vault.

## Important Notes

- **Rate Limits**: GitHub API has a rate limit of 5000 requests per hour for authenticated users
- **File Size**: Maximum file size is 100MB per image
- **Private Repositories**: Images in private repositories are fetched via GitHub API and displayed as blob URLs

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for development setup.

## License

MIT
