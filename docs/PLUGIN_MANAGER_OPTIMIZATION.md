# Pi Plugin Manager 优化计划

> 目标：把当前 `/plugin` 从简单的命令式包列表，升级为更接近 Claude Code plugin manager / marketplace 的 Pi Package Manager。

## 1. 当前状态

当前 `/plugin` 扩展实际位于：

```text
~/.pi/agent/extensions/plugin-manager/
├── index.ts
├── api.ts
└── i18n.ts
```

已具备基础命令：

```text
/plugin
/plugin list
/plugin search
/plugin install <pkg>
/plugin remove <pkg>
/plugin update [pkg]
/plugin info <pkg>
```

已修复的问题：

- `/plugin` 命令可以被 Pi loader 正常发现并加载。
- 分页操作区按钮映射错误已修复。
- `npm:` 前缀重复问题已修复。
- 安装/卸载改为 `execFile`，避免 shell 拼接风险。
- scoped npm 包 registry URL 已修复。
- 已安装列表现在能读取全局和项目 settings，并对 git/local 包 fallback 显示。

## 2. 为什么建议做成独立项目

不建议直接改 Pi 源头。

原因：

1. `/plugin` 属于扩展能力，不是 Pi core 必需能力。
2. Pi 官方已经提供 extension/package 机制，适合把插件管理器本身做成一个 Pi package。
3. 独立仓库便于版本管理、GitHub 发布、npm 发布、issue 管理和迭代。
4. 不会污染 `~/.pi/agent/extensions/` 里的手写临时代码。
5. 后续可以用 `pi install npm:<package>` 或 `pi install git:<repo>` 安装。

推荐路线：

```text
当前项目目录 Pi_Plugin_Manager/
├── package.json
├── README.md
├── src/
│   ├── index.ts
│   ├── api.ts
│   ├── catalog.ts
│   ├── search.ts
│   ├── i18n.ts
│   └── ui/
│       └── ...
├── docs/
│   └── PLUGIN_MANAGER_OPTIMIZATION.md
└── .git/
```

然后在 `package.json` 中声明：

```json
{
  "name": "pi-plugin-manager",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./src/index.ts"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*"
  }
}
```

开发时可以用：

```bash
pi -e ./src/index.ts
```

或者安装本地项目：

```bash
pi install ./path/to/Pi_Plugin_Manager
```

成熟后再发布到 GitHub/npm。

## 3. 是否需要改 Pi 源头？

一般不需要。

只有以下情况才考虑改 Pi core：

- Pi extension API 不足以实现需要的 UI。
- `ctx.ui.custom()` 无法满足插件管理器交互。
- 需要官方内置 `/plugin` 命令。
- 需要 Pi package manager 暴露更多内部能力，例如资源 enable/disable 的官方 API。

目前根据 Pi 文档，extension 能力已支持：

- 注册 `/plugin` 命令。
- `ctx.ui.select/input/confirm/notify`。
- `ctx.ui.custom()` 自定义 TUI。
- overlay UI。
- 读取/写入 settings。
- 调用 `pi install/remove/update/config`。

所以当前阶段应做成独立扩展项目，而不是改 Pi 源头。

## 4. 推荐实施路线

### Phase 0：项目化迁移

目标：把当前 `~/.pi/agent/extensions/plugin-manager` 迁移到当前项目目录，形成可维护仓库。

任务：

- 初始化 `package.json`。
- 新建 `src/`。
- 复制当前 `index.ts/api.ts/i18n.ts`。
- 声明 `pi.extensions`。
- 写 `README.md`。
- 添加 `.gitignore`。
- 本地用 `pi -e ./src/index.ts` 测试。

### Phase 1：数据层和搜索层重构

目标：搜索更准、状态更完整、为 Claude 风格 UI 打基础。

任务：

- 新增 `catalog.ts`。
- 新增 `search.ts`。
- 扩展 `PackageInfo` 数据模型。
- catalog 落盘缓存到：

```text
~/.pi/agent/extensions/plugin-manager/data/catalog.json
```

或未来项目包自己的 data dir。

- `fetchFullCatalog()` 优先搜索：

```text
keywords:pi-package
keywords:pi-extension
keywords:pi-skill
pi-coding-agent
```

- 本地 fuzzy ranking。
- 支持 query filters：

```text
type:skill
source:npm
installed
updates
scope:project
```

- 搜索结果合并 installed 状态。

### Phase 2：交互逻辑增强

目标：让 `/plugin` 更像管理中心。

任务：

- `/plugin` 主菜单改成：

```text
Installed
Browse
Search
Updates
Settings / Configure
Refresh catalog
```

- 详情页增强：
  - source
  - scope
  - version/latest
  - resource summary
  - commands/tools/skills/prompts/themes
  - security warning
  - actions

- 安装流程增强：
  - install globally
  - install project-locally
  - temporary run / try
  - 安装后提示 `/reload`

- 删除流程增强：
  - 显示要从 user/project 哪个 scope 删除
  - 明确删除 settings 引用，不一定删除缓存文件

- 更新页支持：
  - update one
  - update all
  - skip pinned

### Phase 3：Claude 风格 TUI / overlay

目标：从 select 列表升级为面板式插件管理器。

可使用 Pi：

```ts
ctx.ui.custom(component, { overlay: true })
```

目标 UI：

```text
┌─ Plugin Manager ─────────────────────────────────────────────┐
│ Installed  Browse  Updates  Settings                        │
├──────────────────────────────────────────────────────────────┤
│ Search: browser automation                                   │
├──────────────────────────────────────────────────────────────┤
│ ● pi-tinyfish-tools            installed   extension skill    │
│   TinyFish Web Agent tools                                   │
│   npm · v0.1.3 · 3.2k/mo                                     │
│                                                              │
│ ○ pi-agent-browser-native      not installed extension        │
│   Browser automation as native tools                         │
├──────────────────────────────────────────────────────────────┤
│ Enter details  / search  i install  r remove  u update  q    │
└──────────────────────────────────────────────────────────────┘
```

需要实现：

- tabs
- realtime search input
- scroll list
- detail panel
- keyboard shortcuts
- loading state
- install/update progress
- IME support if有输入框

建议等 Phase 1/2 稳定后再做。

## 5. 搜索逻辑设计

### 查询解析

支持：

```text
browser automation
type:skill
type:extension
installed
updates
source:npm
scope:project
author:xxx
```

解析为：

```ts
interface ParsedQuery {
  text: string[];
  filters: {
    type?: "extension" | "skill" | "prompt" | "theme" | "package";
    installed?: boolean;
    updates?: boolean;
    source?: "npm" | "git" | "local";
    scope?: "user" | "project";
    author?: string;
  };
}
```

### 排序权重建议

```text
exact name match          +1000
name prefix match         +300
name contains             +150
keyword match             +80
resource type match       +50
description match         +30
installed boost           +20
pi manifest boost         +120
pi-package keyword boost  +100
downloads boost           log scale
recent update boost       +20
```

核心原则：

- 规范 Pi package 优先。
- 已安装状态要准确。
- 包名命中优先级高于描述命中。
- 下载量只是辅助，不能压倒相关性。

## 6. 安全与信任设计

安装前应显示安全确认：

```text
Install npm:xxx?

This package may run arbitrary code on your machine.
Only install packages from sources you trust.

Resources:
- 1 extension
- 1 skill

Scope:
- Global
- Project
- Cancel
```

信任信息建议显示：

- source type: npm/git/local
- repository URL
- author
- license
- npm downloads
- latest version
- whether package has pi manifest
- whether source is pinned

## 7. 后续执行原则

后续真正执行任务前，需要先询问确认：

1. 是否先做项目化迁移？
2. 是否保留当前 `~/.pi/agent/extensions/plugin-manager` 作为临时可用版本？
3. 新项目包名使用什么？例如：
   - `pi-plugin-manager`
   - `pi-package-manager`
   - `pi-marketplace`
4. 是否初始化 git？
5. 是否准备连接 GitHub？
6. 是否以后发布 npm？

建议默认答案：

- 先做项目化迁移。
- 保留当前全局扩展作为备份。
- 包名先用 `pi-plugin-manager`。
- 当前项目初始化 git。
- GitHub/npm 暂不发布，等稳定后再做。
