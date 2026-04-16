/// <reference types="wdio-electron-service" />
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const debug = process.env.DEBUG
const GITHUB_PLUGIN_ID = 'obsidian-github-image-plugin'
const TEST_VAULT_DIR = 'test/e2e/e2e_test_vault'

// Get Obsidian path from environment or use platform defaults
function getObsidianPath(): string | null {
  if (process.env.OBSIDIAN_PATH) {
    return process.env.OBSIDIAN_PATH
  }

  // Platform-specific defaults
  if (process.platform === 'darwin') {
    return '/Applications/Obsidian.app/Contents/MacOS/Obsidian'
  } else if (process.platform === 'linux') {
    // Common Linux paths
    const linuxPaths = [
      '/usr/bin/obsidian',
      '/usr/local/bin/obsidian',
      '/opt/Obsidian/obsidian',
      '/opt/obsidian/obsidian',
      path.join(process.env.HOME || '', '.local/bin/obsidian'),
    ]
    for (const p of linuxPaths) {
      try {
        if (fsSync.existsSync(p)) {
          return p
        }
      } catch {
        // Continue checking
      }
    }
  } else if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || '', 'Obsidian', 'Obsidian.exe')
  }

  return null
}

// Check if file exists
import * as fsSync from 'node:fs'

function checkObsidianExists(obsidianPath: string | null): boolean {
  if (!obsidianPath) return false
  try {
    fsSync.accessSync(obsidianPath, fsSync.constants.X_OK)
    return true
  } catch {
    return false
  }
}

// Inline the page object functions to avoid import issues
async function removeE2eTestVaultIfExists() {
  await fs.rm(TEST_VAULT_DIR, { force: true, recursive: true })
}

async function createAndOpenFreshVault() {
  await browser.execute((testVaultDir: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcRenderer } = require('electron') as {
      ipcRenderer: { sendSync: (channel: string, ...args: unknown[]) => unknown }
    }
    const shouldCreateNewVault = true

    ipcRenderer.sendSync('vault-open', testVaultDir, shouldCreateNewVault)
  }, TEST_VAULT_DIR)

  const targetPluginsDir = `${TEST_VAULT_DIR}/.obsidian/plugins/${GITHUB_PLUGIN_ID}/`
  await fs.mkdir(targetPluginsDir, { recursive: true })
  await fs.copyFile('manifest.json', `${targetPluginsDir}/manifest.json`)
  await fs.copyFile('main.js', `${targetPluginsDir}/main.js`)

  await browser.switchWindow('app://obsidian.md/index.html')
  await $('button=Trust author and enable plugins').click()
  await $('.modal-close-button').click()
}

async function activateGitHubImagePlugin() {
  await browser.execute((id: string) => {
    const app = (
      window as unknown as {
        app: {
          plugins: {
            setEnable: (toggle: boolean) => void
            enablePlugin: (pluginId: string) => void
          }
        }
      }
    ).app
    app.plugins.setEnable(true)
    app.plugins.enablePlugin(id)
  }, GITHUB_PLUGIN_ID)
}

const obsidianPath = getObsidianPath()
const obsidianExists = checkObsidianExists(obsidianPath)

if (!obsidianExists) {
  console.error('\n=================================================')
  console.error('E2E 测试需要 Obsidian 桌面应用')
  console.error('=================================================')
  console.error('\n未找到 Obsidian 应用。')
  console.error('\n请通过以下方式之一安装 Obsidian：')
  console.error('  - macOS: 从 https://obsidian.md/download 下载并安装')
  console.error('  - Linux: 下载 AppImage 或使用包管理器安装')
  console.error('  - Windows: 从 https://obsidian.md/download 下载并安装')
  console.error('\n或者设置环境变量 OBSIDIAN_PATH 指向 Obsidian 可执行文件：')
  console.error('  export OBSIDIAN_PATH=/path/to/obsidian')
  console.error('\n=================================================\n')
  process.exit(1)
}

console.log(`\n使用 Obsidian: ${obsidianPath}\n`)

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./specs/*.ts'],
  exclude: [],
  maxInstances: 10,
  capabilities: [
    {
      browserName: 'electron',
      browserVersion: '32.2.5',
      'wdio:electronServiceOptions': {
        // custom application args
        appBinaryPath: obsidianPath!,
        appArgs: [],
      },
    },
  ],
  // Level of logging verbosity: trace | debug | info | warn | error | silent
  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: ['electron'],
  framework: 'mocha',

  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: debug ? 24 * 60 * 60 * 1000 : 60000,
  },
  beforeSuite: async () => {
    await removeE2eTestVaultIfExists()
    await createAndOpenFreshVault()
    await activateGitHubImagePlugin()
  },
}
