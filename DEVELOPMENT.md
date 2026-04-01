# Development how-to

### Prerequisites

- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/) (package manager)

### Development

1. Clone the repository:
   ```bash
   git clone https://github.com/inobit/obsidian-github-img-plugin.git
   cd obsidian-github-img-plugin
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create a new Obsidian vault for testing (recommended)

4. Start development mode:
   ```bash
   pnpm run dev
   ```
   This will:
   - Prompt you to select an Obsidian vault
   - Install the hot-reload plugin if not present
   - Build and watch for changes with automatic reload

### Building

```bash
# Production build with type checking
pnpm run build

# Fast build without type checking
pnpm run build-fast
```

### Testing

```bash
# Run unit tests
pnpm run test

# Run E2E tests
pnpm run test:e2e

# Run linter
pnpm run test:eslint
```

### Plugin Configuration

To use the plugin, you need:

1. A GitHub account
2. A GitHub repository (public or private) to store images
3. A GitHub Personal Access Token with `repo` scope

#### Creating a Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name (e.g., "Obsidian Image Plugin")
4. Select the `repo` scope
5. Generate and copy the token

#### Plugin Settings

In Obsidian Settings → GitHub Image:

- **GitHub Owner**: Your GitHub username or organization
- **Repository**: The repository name
- **Branch**: The branch to upload to (default: `main`)
- **Path**: The directory path within the repository (e.g., `images`)
- **Personal Access Token**: Your GitHub token (stored in localStorage, not synced)
- **Private Repository**: Enable if your repository is private

### Architecture Overview

- **Entry**: `src/GitHubImagePlugin.ts` - Main plugin class
- **Uploader**: `src/uploader/github/GitHubUploader.ts` - GitHub API wrapper
- **Settings**: `src/ui/GitHubPluginSettingsTab.ts` - Configuration UI
- **Private Images**: `MutationObserver` + blob URL for private repo image display

### Notes

- The token is stored in `localStorage` with key `github-img-plugin-token`
- Private repository images are fetched via GitHub API and displayed as blob URLs
- GitHub API has a rate limit of 5000 requests per hour for authenticated users

---

Special thanks to:

- [@pjeby][pjeby] for [hot-reload plugin][hot-reload] which gives instant feedback on code changes
- [@zephraph][zephraph] for his [tools for Obsidian plugin development][obsidian-tools] which makes development a breeze

[zephraph]: https://github.com/zephraph/
[obsidian-tools]: https://github.com/zephraph/obsidian-tools
[pjeby]: https://github.com/pjeby
[hot-reload]: https://github.com/pjeby/hot-reload
