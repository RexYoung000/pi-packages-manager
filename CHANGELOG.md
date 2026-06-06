# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-06-06

### Added

- **Settings 页改造为多区块设置中心（J）**：
  - **J1. 目录缓存状态展示**：在 Settings tab 新增「📦 目录缓存」区块，
    实时显示缓存包数、获取时间（“已缓存 247 个包 · 29 小时前”），
    未缓存时显示“未缓存”。
  - **J2. 缓存快捷操作**：在缓存区块按 `r` 刷新缓存（强制重新拉取 npm
    registry），按 `c` 清空缓存。操作完成后留在 Settings tab。
  - **J3. 偏好重置**：Settings tab 新增「⚙️ 偏好」区块，按 `x` 一键重置
    所有偏好（包括项目级 `.pi/pi-packages-manager.json` 和全局
    `~/.pi/agent/extensions/pi-packages-manager/data/preferences.json`
    中的语言偏好）。有二次确认。当前会话语言不变，下次启动 pi 生效。
  - **J4. 语言来源展示**：Settings tab 顶部显示当前生效的语言来源
    （“当前生效: 项目（覆盖全局）” / “当前生效: 全局” / “当前生效: 默认”），
    让用户知道修改哪个文件能改变语言。

### Improved

- **i18n 插值支持**：`t()` 函数新增可选 `params` 参数（向后兼容），
  支持 `{count}` / `{age}` 等占位符。新增 `formatRelativeTime()` 工具
  函数，覆盖 zh-CN / zh-TW / en / ja / ko 五种语言的相对时间格式。
- **Settings tab 键盘交互**：新增 `r` / `c` / `x` 三个快捷键，用于
  刷新缓存、清空缓存、重置偏好。
- **面板状态记忆**：panelLoop 记住用户上次的 tab，操作完成后重新打开
  仍留在同一 tab（之前总是回到 Installed tab）。

## [1.2.2] - 2026-06-06

### Added

- **包详情 README 渲染（K）**：在包详情页基础信息和动作按钮之间，新增
  「📖 README」分隔区域，自动从 npm registry 拉取并渲染 README，支持
  Markdown 语法（标题、列表、代码块等）。没有 README 时显示多语言提示。
  覆盖 zh-CN / zh-TW / en / ja / ko 五种语言。

### Improved

- **安装进度实时显示（L）**：按 `i` 安装包后，不再只显示静态的
  "📥 Installing..."，而是逐行滚动展示 `pi install` 的实际输出（npm
  fetching / extracting / registering 等），最多显示最近 6 行，长行自动
  截断到 90 字符。安装结束（成功 ✅ / 失败 ❌）后保留最后一帧 350ms
  让用户看清结果，再切换到通知。改善长时间安装时的等待体验。

## [1.2.1] - 2026-06-04

### Fixed

- **Visual section separators**: added `DynamicBorder` separators between
  filter chips, search bar, and package list in the panel, so each section
  is visually distinct instead of blending together.
- **Larger default catalog**: removed the hardcoded 80-item cap in the
  Browse tab. It now loads up to 250 community packages by default, so
  more packages show up without manual refresh.

## [1.2.0] - 2026-06-04

### Added

- **Quick shortcuts**: press `i` to install, `r` to remove, `u` to update,
  `a` to audit, `?` for help overlay — all without leaving the panel.
- **Filter chips**: tab bar now shows `[All] [extension] [skill] [prompt] [theme]`
  chips, press `1-5` to filter by resource type.
- **Inline detail view**: `Enter` opens package detail inside the panel
  instead of closing it. Shows version, author, resources, and audit results.
  Press `←` or `Esc` to return to the list.
- **Help overlay**: press `?` to see all keyboard shortcuts.

## [1.1.0] - 2026-06-03

### Added

- **Pre-install security audit** (`src/security.ts`): two-layer static
  analysis that runs before every install. Layer 1 checks metadata via
  `npm view` (deps, peers, file count, size, npm insecure flag). Layer 2
  downloads the tarball and scans source code against 15 known-dangerous
  patterns (`rm -rf`, `eval`, `execSync`, `spawn`, etc.).
- **4-tier risk classification** (`safe` / `low` / `medium` / `high` /
  `critical`). High/critical packages require a two-step "Install anyway"
  confirmation instead of a simple yes/no.
- **Pi tools** (`src/tools.ts`): registered 4 LLM-callable tools so users
  can search, audit, and install packages via natural language:
  - `packages_search` — search by keyword or type
  - `packages_detail` — full package metadata
  - `packages_audit` — security audit with risk report
  - `packages_install` — audit + confirm + install
- **Audit button in detail page**: package detail view now has a
  "🔍 Run security audit" button that runs the scan and embeds results
  inline. Users can re-run audits at any time.
- **Test suite**: 14 unit + integration tests covering risk evaluation,
  pattern catalog integrity, and end-to-end audit against real npm
  packages.

### Credits

- Security audit module adapted from
  [pi-marketplace](https://github.com/507/pi-marketplace) by
  [@ssdiwu](https://github.com/ssdiwu) (PR #1).

## [1.0.3] - 2026-06-03

### Fixed

- Fixed TUI focus management crash: search input no longer causes all
  keyboard input to be silently dropped after search. Input routing is
  now fully manual via handleInputImpl with forwarding to searchInput.
- Added dismissed guard (safeDone) to prevent async callbacks from
  touching TUI after panel dismissal.
- Redesigned search bar with 3 visual states: idle (hint + / shortcut),
  active (highlighted Box), has results (filter pill with match count).

## [1.0.2] - 2026-06-03

### Fixed

- Added pre-flight npm cache permission check before install/uninstall
  operations. Detects files/directories owned by root (typically caused
  by running npm with `sudo`) and provides clear actionable fix
  instructions when `EACCES`/`EEXIST` errors occur.
- Enhanced npm error output: `EACCES` and `EEXIST` permission errors now
  include a human-readable diagnostic with the exact `chown` command to
  fix the issue.

## [1.0.1] - 2026-06-02

### Changed

- Updated README release links for npm, Pi Discussion, and public package
  install instructions.
- Refreshed status badges to `1.0.1`.

## [1.0.0] - 2026-06-02

First stable release. Project is now ready to be shared via the Pi packages
gallery.

### Added

- Claude-style overlay panel as the default UI (`/packages-list`)
  - Tabs: Installed / Browse / Updates / Settings
  - Custom `PackageList` component with relaxed line spacing (3 lines per item
    plus a blank gap)
  - Async lazy loading of catalog and updates
- Multi-language UI: English, 简体中文, 繁體中文, 日本語, 한국어
  - In-panel language switcher (Settings tab)
  - Effective immediately (no reload)
  - Persisted to `~/.pi/agent/extensions/pi-packages-manager/data/preferences.json`
  - Project-level override via `<cwd>/.pi/pi-packages-manager.json`
- Subcommands: `list`, `search`, `install`, `remove`, `update`, `info`,
  `settings`, `refresh`, `panel`, `legacy`
- Catalog disk cache with 24h TTL, `keywords:pi-package` priority, fuzzy
  ranking and filter parser (`type:`, `source:`, `scope:`, `installed`,
  `updates`, ...)
- Install/Remove/Update flows
  - Scope selection (Global vs Project)
  - Safety confirmation showing the actual `pi install` / `pi uninstall` command
  - Reload prompt after success
  - Update all + per-package update with auto scope detection
  - Skips pinned/git/local sources during update with reasons
- Detail page resources (Extensions / Skills / Prompts / Themes) and Security
  info (source / sourceType / pinned / trust warning)
- Settings page (legacy select-list version) showing global and project
  packages with scope, pinned, source type, version and types

### Changed

- Renamed extension from `plugin-manager` (global) to standalone
  `pi-packages-manager`
- Command renamed from `/plugin` to `/packages-list`
- Catalog cache moved to `~/.pi/agent/cache/pi-packages-manager/`

### Fixed

- npm `npm:` prefix duplication when normalising sources
- Scoped registry URL handling
- execFile usage to avoid shell injection
- Settings reads now traverse multiple scopes correctly
