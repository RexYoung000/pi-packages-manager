# pi-packages-manager

Pi 插件管理器扩展。在 Pi 内浏览、搜索、安装、更新、卸载 Pi 包，灵感来自
Claude Code 的包管理体验。

[English](README.md) · [简体中文](README.zh-CN.md)

![status](https://img.shields.io/badge/status-1.0.0-blue)
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
- 🧭 子命令完整：`list`、`search`、`install`、`remove`、`update`、`info`、
  `settings`、`refresh`、`panel`、`legacy`

## 安装

### 从 npm 安装（发布后）

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
| `/`（社区标签） | 打开搜索流 |
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

加载冒烟测试：

```bash
node -e 'import("@earendil-works/pi-coding-agent/dist/core/extensions/loader.js").then(({loadExtensions})=>loadExtensions(["./src/index.ts"], process.cwd())).then(r=>console.log(r.errors,r.extensions[0].commands.keys()))'
```

## 路线图

详见 [docs/ROADMAP.md](docs/ROADMAP.md)。

下一轮计划：实时搜索框、详情侧栏、面板内 install/remove 快捷键。

## 许可证

MIT © RexYoung000
