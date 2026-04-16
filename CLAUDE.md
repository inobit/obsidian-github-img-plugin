# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 提供在本仓库中工作的指导。

## 项目概述

这是一个 Obsidian 插件，用于将图片上传到 GitHub 仓库，而不是存储在本地 vault 中。支持公有和私有仓库，图片通过 GitHub API 上传，私有仓库图片通过 blob URL 在本地显示。

## 构建系统

**包管理器**: pnpm (详见 package.json 中的 `packageManager`)

**Node.js**: >= 24.0.0 (详见 package.json 中的 `engines`)

### 常用命令

| 命令                  | 用途                                                         |
| --------------------- | ------------------------------------------------------------ |
| `npm run dev`         | 启动开发模式，在 Obsidian 仓库中支持热重载（交互式仓库选择） |
| `npm run build`       | 生产构建（TypeScript 检查 + esbuild 打包到 `main.js`）       |
| `npm run build-fast`  | 不进行类型检查的生产构建                                     |
| `npm run test`        | 运行 Vitest 单元测试并生成覆盖率报告                         |
| `npm run test:e2e`    | 运行 WebdriverIO 端到端测试（需要先 build）                  |
| `npm run test:eslint` | 使用缓存运行 ESLint                                          |
| `npm run commit`      | 使用 Commitizen 进行规范提交                                 |

### 运行单个测试

```bash
# 运行特定测试文件
npx vitest run src/path/to/file.test.ts

# 运行测试匹配模式
npx vitest run -t "test name pattern"

# 开发模式下的监听模式
npx vitest --watch
```

## 架构

### 入口点

- **`src/GitHubImagePlugin.ts`**: 主插件类，继承自 Obsidian 的 `Plugin`。处理生命周期、事件注册，并协调上传器和 UI 之间的交互。

### 上传器

- **`src/uploader/ImageUploader.ts`**: 简单接口，定义 `upload(image: File, fileName?: string): Promise<string>`
- **`src/uploader/github/GitHubUploader.ts`**: GitHub API 上传器，使用 GitHub Contents API 上传文件
  - GitHub API 版本: `2022-11-28`
  - 支持 CDN 加速（public 仓库可通过 `useCdn` 启用 jsDelivr）
- **`src/uploader/imgUploaderFactory.ts`**: 工厂函数，从设置和 localStorage 构建 GitHubUploader，支持根据文件路径动态选择仓库

### GitHub API 客户端

- **`src/github/GitHubUploader.ts`**: 封装 GitHub API 调用
  - `upload()`: 上传图片到指定仓库路径
  - `getFileContent()`: 获取文件内容（用于私有仓库图片显示）
  - `deleteFile()`: 删除仓库中的图片文件
- **`src/github/constants.ts`**: GitHub API 基础 URL 和 localStorage 键名
  - Token 存储键: `github-img-plugin-token-public` / `github-img-plugin-token-private`
- **`src/github/githubApiTypes.ts`**: GitHub API 响应的 TypeScript 类型

### 多仓库配置 (Dual Repository Support)

插件支持根据文件路径自动选择不同的 GitHub 仓库：

- **Public 仓库**: 默认仓库，用于普通文档的图片上传
- **Private 仓库**: 用于特定目录下的文档（通过 `privateDirectories` 配置）
- **动态选择**: 通过 `isPrivateDocument()` 检查文件路径是否匹配私有目录前缀

Token 分别存储：

- Public: `localStorage.getItem('github-img-plugin-token-public')`
- Private: `localStorage.getItem('github-img-plugin-token-private')`

### 设置

- **`src/plugin-settings.ts`**: 设置接口和默认值
  - `publicRepo` / `privateRepo`: 仓库配置（owner, repo, branch, path, enabled, useCdn）
  - `privateDirectories`: 使用 private 仓库的目录列表
  - `showRemoteUploadConfirmation`: 上传前确认
- **`src/ui/GitHubPluginSettingsTab.ts`**: 设置界面
  - Token 使用密码输入框，存储在 localStorage
  - 提供 "Test Connection" 按钮测试配置

### 图片处理

- **粘贴处理**: `customPasteEventCallback` 拦截剪贴板粘贴事件
- **拖放处理**: `customDropEventListener` 处理文件拖放
- **Canvas 支持**: `Canvas.ts` 处理 Obsidian Canvas 视图中的图片粘贴
- **本地图片上传**: 右键菜单将现有本地图片上传到 GitHub

### 图片删除

- **右键删除**: 在预览模式下右键图片可删除（显示 "Delete from GitHub" 菜单项）
- **命令面板**: 提供 "Delete GitHub Image" 命令删除光标下的图片
- **确认对话框**: 删除前需要用户确认，避免误操作
- **GitHub API**: 通过 DELETE 请求删除文件，需要先获取文件 SHA
- **引用更新**: 删除成功后自动更新笔记中的图片链接为占位符

### 私有仓库图片显示

**关键实现** (`GitHubImagePlugin.ts`):

1. **CSS 预隐藏**: 添加全局 CSS 隐藏 `img[src^="github-img://"]`，防止浏览器尝试加载无效协议
2. **MutationObserver**: 监听 DOM 变化，在图片添加到 DOM 时立即处理
3. **转换为 blob URL**:
   - 截取 `src` 属性，保存到 `data-github-img`
   - 调用 GitHub API 获取 base64 内容
   - 转换为 Blob 并创建 blob URL
   - 设置 `img.src = blobUrl`
4. **缓存**: 使用 `privateImageCache` Map 缓存已加载的 blob URL
5. **错误处理**: 图片加载失败时显示中文错误提示（🔍 图片不存在、🔒 认证失败等）

### UI 组件

`src/ui/` 中的组件：

- `GitHubPluginSettingsTab.ts`: 设置面板（GitHub 配置）
- `RemoteUploadConfirmationDialog.ts`: 上传前的可选确认
- `UpdateLinksConfirmationModal.ts`: 更新引用本地图片的其他笔记
- `ImageUploadBlockingModal.ts`: Canvas 上传时的阻塞模态框
- `InfoModal.ts`: 通用信息对话框

### 工具函数

- **`src/utils/obsidian-vault.ts`**: Vault 操作（查找引用、跨文件替换链接）
- **`src/utils/editor.ts`**: 编辑器操作辅助函数
- **`src/utils/misc.ts`**: 杂项工具（图片类型修复、GitHub URL 解析等）
- **`src/utils/events.ts`**: 事件工具函数
- **`src/aux-event-classes/`**: 事件包装类，用于防止无限循环

## 构建配置

- **`scripts/esbuild.config.js`**: 共享的 esbuild 配置
  - 入口: `src/GitHubImagePlugin.ts`
  - 输出: `main.js` (CommonJS)
  - 外部依赖: `obsidian`、`electron` 和所有 CodeMirror 包（由 Obsidian 提供）
  - 目标: ES2018
- **`scripts/dev.js`**: 开发脚本，查找 Obsidian 仓库、安装热重载插件并设置文件监听
- **`scripts/esbuild.build.js`**: 生产构建脚本

## TypeScript 配置

- 启用严格模式并附加检查（`noImplicitOverride`、`noPropertyAccessFromIndexSignature` 等）
- ESM 模块，目标 ES6
- 编译排除 `test/e2e/**`

## 测试

- **单元测试**: Vitest，使用 v8 覆盖率提供程序
- **端到端测试**: WebdriverIO，使用 Electron 服务 (`test/e2e/`)，需要先运行 `build-fast`
- 覆盖率报告: lcov 和 HTML 格式

## 代码风格

- ESLint，使用 TypeScript ESLint 推荐和风格规则
- `eslint-plugin-perfectionist` 用于导入排序（自然顺序，按类型分组）
- Prettier 用于格式化
- Husky + lint-staged 用于预提交钩子
- commitlint 强制执行规范提交

## 重要实现说明

1. **Token 存储**: GitHub Personal Access Token 存储在 localStorage（`github-img-plugin-token-public` / `github-img-plugin-token-private`），不会随 vault 数据同步

2. **GitHub API 速率限制**: 每小时 5000 次请求（认证用户）

3. **私有仓库图片显示**: 使用 MutationObserver + blob URL 方案，而非 `registerMarkdownPostProcessor`

4. **回退行为**: 上传失败时，插件会通过重新分发原始事件回退到默认的 Obsidian 行为（本地存储）

5. **临时文本**: 上传期间，插入临时 Markdown（`![Uploading file...id]()`），完成后替换为最终图片 URL

6. **错误提示**: 图片加载失败时显示友好中文提示，console 保持简洁技术日志

7. **CDN 支持**: Public 仓库可配置使用 jsDelivr CDN 加速访问（`useCdn: true`）

8. **多仓库支持**: 根据文件路径自动选择 public/private 仓库配置，实现敏感文档和普通文档的分离存储

9. **文件名格式**: 上传图片使用 `YYYY-MM-DD-random.ext` 格式避免冲突
