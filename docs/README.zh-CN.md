# pi-packages-manager

Pi 插件管理器扩展。在 Pi 内浏览、搜索、安装、更新、卸载 Pi 包，灵感来自
Claude Code 的包管理体验。

[English](../README.md) · [简体中文](README.zh-CN.md) · [Pi Discussion](https://github.com/earendil-works/pi/discussions/5322) · [npm](https://www.npmjs.com/package/pi-packages-manager)

![status](https://img.shields.io/badge/status-1.1.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## 功能特性

- 📦 Claude 风格 overlay 面板，`Tab` 切换 已安装 / 社区 / 更新 / 设置
- 🌐 多语言界面（English / 简体中文 / 繁體中文 / 日本語 / 한국어），面板内
  即时切换，无需 reload
- 🔍 catalog 本地缓存 + 模糊排序，支持过滤器：`type:skill`、`source:npm`、
  `scope:project`、`installed`、`updates` 等
- ⬇️ 安装 / 卸载 / 更新流程支持作用域选择（全局 / 项目）、安全确认、reload 提示
- ⬆️ Update all 一键更新所有包，自动跳过 pinned / git / local 来源
- 🛡️ 详情页展示 extension / skill / prompt / theme 资源以及来源类型与信任警告
- 🔒 **安装前安全审计**：每次安装都先跑两层静态分析（元数据 + 源码关键词扫描），
  4 档风险分级。`high` / `critical` 级别的包需要二次确认。
- 🤖 **自然语言工具**：注册 4 个 LLM 可调用的工具（`packages_search`、
  `packages_detail`、`packages_audit`、`packages_install`），用户可以直接用
  自然语言搜索、审计、安装包。
- 🔍 **详情页审计按钮**：每个包详情页都有一键"运行安全审计"按钮，结果直接
  嵌入展示。
- 🧭 子命令完整：`list`、`search`、`install`、`remove`、`update`、`info`、
  `settings`、`refresh`、`panel`、`legacy`

## 安装

### 从 npm 安装

```bash
pi install npm:pi-packages-manager
```

### 从 GitHub 安装

```bash
pi install git:github.com/RexYoung000/pi-packages-manager
```

### 从本地 checkout 安装

```bash
git clone https://github.com/RexYoung000/pi-packages-manager.git
pi install /path/to/pi-packages-manager
```

安装后在 Pi 里执行：

```text
/reload
```

## 安全审计

每次 `install`（和 `update`）都会在确认前跑两层静态检查：

1. **元数据层**：`npm view` 获取依赖数、peer 数、文件数、解压体积、
   `flags.insecure` 标记、最后发布时间、声明的资源类型。
2. **源码关键词扫描**：`npm pack` + `tar` + grep，检查 15 个已知危险模式
   （`rm -rf`、`rimraf`、`fs.unlink`、`eval`、`Function()`、`execSync`、
   `spawn`、`child_process`、`process.env`、`chmod` 等）。大于 1.5 MB 的
   文件跳过以保持响应速度；`node_modules`、`test/`、`coverage/` 目录
   忽略。

综合评估为 4 档风险：

| 徽章 | 含义 | UX |
| --- | --- | --- |
| 🟢 safe | 深度扫描无发现 | 常规 confirm + 摘要 |
| 🟢 low / 🟡 medium | 仅有 low/medium 发现，或 3+ 个 medium | 常规 confirm + 摘要 |
| 🟠 high | 任何 high 发现，或在 extension 内的高危模式 | 两步选择 — 需选 "仍要安装" |
| 🔴 critical | 任何 critical 发现 | 两步选择 — 需选 "仍要安装" |

审计是**失败安全**的：`npm view` 或 `npm pack` 出错（网络、超时等）不会
阻塞安装，但会在 confirm 框里显示失败信息，由用户决定。

你也可以在**包详情页**直接点击"🔍 运行安全审计"按钮，对任意包进行按需扫描。

致谢：审计模块改编自 [pi-marketplace](https://github.com/507/pi-marketplace)。

## 自然语言工具

本扩展注册了 4 个 LLM 可调用的工具，你可以直接用自然语言与 Pi 对话：

> "帮我找一个 MCP 相关的包"

> "看看 pi-tinyfish-tools 的详情"

> "审计一下 pi-mcp-adapter 安全吗"

> "安装 pi-autoname"

| 工具 | 功能 |
| --- | --- |
| `packages_search` | 按关键词/类型搜索包 |
| `packages_detail` | 查看完整包信息（版本、作者、资源、链接） |
| `packages_audit` | 安全审计：元数据 + 源码扫描 |
| `packages_install` | 审计 → 确认 → 安装 |

这些工具与 `/packages-list` 命令并存——随你喜欢用哪种方式。

## 使用

打开 overlay 面板：

```text
/packages-list
```

| 按键 | 作用 |
| --- | --- |
| `Tab` / `⇧Tab` | 切换标签 |
| `↑` / `↓` | 上下导航 |
| `Enter` | 打开包详情 |
| `/` | 聚焦搜索栏 |
| `g`（设置标签） | 提示运行 `pi config` |
| `Esc` / `q` | 关闭面板 |

### 子命令

```text
/packages-list list                       # 已安装包
/packages-list search [关键词]            # 浏览社区
/packages-list install <source>           # 安装包
/packages-list remove <source>            # 卸载包
/packages-list update [source]            # 更新单个或全部
/packages-list info <source>              # 查看详情
/packages-list settings                   # 旧版设置视图
/packages-list refresh                    # 清空 catalog 缓存
/packages-list panel                      # 显式打开 overlay
/packages-list legacy                     # 经典选择菜单
```

### 切换语言

打开面板，按 `Tab` 切到 **设置** 标签，选语言后按 `Enter`。立即生效，并持久化到：

```text
~/.pi/agent/extensions/pi-packages-manager/data/preferences.json
```

项目级覆盖：在项目根目录创建 `<cwd>/.pi/pi-packages-manager.json`：

```json
{
  "locale": "zh-CN"
}
```

支持的语言：`en`、`zh-CN`、`zh-TW`、`ja`、`ko`。

## 开发

直接以源码方式运行扩展：

```bash
pi -e ./src/index.ts
```

运行测试：

```bash
npm test
```

## 路线图

详见 [docs/ROADMAP.md](docs/ROADMAP.md)。

下一轮计划：详情侧栏、面板内快捷键、过滤器 chip。

## 许可证

MIT © RexYoung000
