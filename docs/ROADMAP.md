# Roadmap

pi-packages-manager 后续版本迭代计划。按优先级排列，标注工作量与参考来源。

更新时间：2026-06-04
当前版本：**1.2.1**

---

## 已完成

### v1.0.0 — 基础功能（2026-06-02）

- 项目化：独立仓库 + GitHub
- 数据层：catalog 缓存、关键字优先、filter 解析、fuzzy ranking
- 交互逻辑：Install/Remove/Update scope 选择、安全确认、reload 提示
- Settings 页（select 列表版）
- Claude 风格 overlay 面板（Tab 切换 / 异步加载）
- Settings 页内置语言切换器（5 种语言）
- 自定义 PackageList 组件（每项 3 行 + 1 空行）
- 命名统一：`/packages-list`、`pi-packages-manager`
- npm 发布 + GitHub Actions

### v1.0.2 — npm 权限修复（2026-06-03）

- 安装/卸载前 npm 缓存权限预检
- EACCES/EEXIST 错误增强：提供可执行的 chown 修复命令

### v1.0.3 — 搜索修复 + UI 优化（2026-06-03）

- 修复 TUI 焦点管理：搜索后无法按键操作的崩溃问题
- 搜索栏 UI 重设计：三种状态（空闲/活跃/有结果）视觉区分
- 引入 `dismissed` 防护，防止异步回调在面板关闭后操作 TUI

### v1.1.0 — 安全审计 + Tool 工具化（2026-06-03）

> 竞品参考：[pi-marketplace](https://www.npmjs.com/package/pi-marketplace)（作者 diwu507）
> 安全审计模块由 @ssdiwu 贡献（PR #1）

- ✅ **A. 源码安全审计** — 两层审计（元数据 + 源码扫描），15 个危险模式，4 档风险分级
- ✅ **B. 注册 Pi 工具** — `packages_search` / `packages_detail` / `packages_audit` / `packages_install` 四个工具，用户通过自然语言触发
- ✅ **D. 审计报告嵌入详情页** — 详情页新增 🔍 Run security audit 按钮，结果直接嵌入展示

### v1.2.0 — 面板交互升级（2026-06-04）

- ✅ **E. 内联详情视图** — Enter 不关闭面板，内嵌展示包详情 + 审计结果，← 返回列表
- ✅ **F. 操作快捷键** — i 安装、r 删除、u 更新、a 审计、? 帮助
- ✅ **G. 过滤器 chip** — [All] [extension] [skill] [prompt] [theme]，按 1-5 切换
- ✅ **H. 帮助 overlay** — 按 ? 查看所有快捷键

### v1.2.1 — 面板视觉微调（2026-06-04）

- ✅ Filter chips / 搜索栏 / 包列表之间加分隔线，视觉层次更清晰
- ✅ Browse tab 默认拉取数量从 80 提升到 250，能看到更多社区包

### v1.2.2 — 包详情 README + 安装进度（2026-06-06）

- ✅ **K. 包详情 README 渲染** — 详情页内嵌 README，Markdown 渲染（标题/列表/代码块），5 语言 i18n 兼底
- ✅ **L. 安装进度实时显示** — `i` 安装后逐行滚动展示 `pi install` 输出，最近 6 行 + 90 字截断 + 末帧保留 350ms

---

### v1.3.0 — Settings 扩展（2026-06-06）

- ✅ **J1. 目录缓存状态展示** — Settings tab 新增缓存区块，实时显示包数 + 相对时间（5 语言）
- ✅ **J2. 缓存快捷操作** — 按 r 刷新缓存、按 c 清空缓存
- ✅ **J3. 偏好重置** — 按 x 一键重置项目级 + 全局级语言偏好，有二次确认
- ✅ **J4. 语言来源展示** — Settings tab 顶部显示当前语言来源（project / global / default）
- ✅ i18n `t()` 新增 params 插值 + `formatRelativeTime()` 工具函数
- ✅ panelLoop 记住上次 tab，操作后留在同一 tab

---

### v1.3.x — 质量 + 扩展（剩余项）

| # | 特性 | 说明 | 工作量 |
|---|------|------|--------|
| **C** | 🌐 pi.dev 数据富化 | 动态检测可用 web fetch 工具（tinyfish / web-fetch 等），搜索结果补全 pi.dev 上的展示数据（截图、分类标签） | 1 天 |
| **I** | 🧪 扩展测试 | `search.ts`（filter parser、ranking）、`locale.ts`（持久化优先级）、`api.ts`（mock registry）。已有 security.ts 的 14 个测试，补充其他模块 | 1-2 天 |

**预计工期：2-3 天**

---

### v2.0.0 — 架构重构

| # | 特性 | 说明 | 工作量 |
|---|------|------|--------|
| **M** | 🏗 flows 拆分 | `index.ts` 900+ 行拆到 `src/flows/` 下（install、remove、update、detail） | 0.5 天 |
| **N** | 🗑 删 legacy 菜单 | `/packages-list legacy` 完全移除，panel 是唯一入口 | 0.5 天 |
| **O** | 🌍 i18n 重构 | 5 种语言从单文件拆成独立 JSON + loader，加 key 时只改一处 | 1 天 |
| **P** | 🔄 网络错误重试 + 离线降级 | registry 请求失败自动重试，离线时只展示已安装 + 缓存数据 | 1 天 |
| **Q** | 🤖 AI 推荐 | 基于已装包推荐相关包，纳入 Browse tab 的 AI 搜索结果 | 1 天 |
| **R** | ❤️ 收藏/置顶包 | 本地收藏列表，置顶显示在 Browse 和 Installed 顶部 | 0.5 天 |
| **S** | 📌 主界面状态栏 | Pi footer 展示可用更新数量 | 0.5 天 |

**预计工期：5 天**

---

## 版本时间线

```
v1.0.0 ✅ 基础功能
v1.0.2 ✅ npm 权限修复
v1.0.3 ✅ 搜索修复 + UI 优化
v1.1.0 ✅ 安全审计 + Tool 工具化
  │
  ▼
v1.2.0 ✅ 面板交互升级（侧栏 + 快捷键 + chip + 状态增强）
  │
  ▼
v1.2.1 ✅ 面板视觉微调（分隔线 + 默认 250 包）← 当前
  │
  ▼
v1.3.0 🔜 质量 + 扩展（pi.dev 富化 + 测试 + Settings + README + 进度条）
  │
  ▼
v2.0.0 — 架构重构（拆分 + 删 legacy + i18n + AI 推荐）
```

---

## 竞品参考笔记

### pi-marketplace（diwu507 / @ssdiwu）

- 已引入的特性：
  - 🔒 两层安全审计 — v1.1.0 通过 PR #1 合并
  - 🛠 Tool 架构 — v1.1.0 注册 4 个 Pi 工具
- 待参考：
  - 🔌 Tool-agnostic web fetch 检测 — v1.3.0 pi.dev 富化时参考
- 我们的差异化优势：
  - 🖥 完整 TUI 面板（Tab 切换、分页、键盘导航）vs 他的纯工具调用
  - 📋 全生命周期管理（安装/卸载/更新/设置）vs 他只做搜索+安装
  - 🌍 多语言 i18n vs 他只有英文
  - 🔍 详情页内嵌审计按钮 — 他的审计只在安装路径触发
  - 📦 本地目录预取缓存 + AI 语义搜索

---

## 已知技术债

- `index.ts` 900+ 行，逻辑都在一个 closure 里。v2.0 拆到 `src/flows/`
- `panel.ts` rebuild 每次重建整个 Container，性能可优化
- legacy 菜单还在（`/packages-list legacy`），v2.0 删除
- i18n.ts 5 种语言写死，加 key 时 5 处改。v2.0 改成独立 JSON 文件

---

## 链接

- 仓库：<https://github.com/RexYoung000/pi-packages-manager>
- npm：<https://www.npmjs.com/package/pi-packages-manager>
- 设计文档：[PLUGIN_MANAGER_OPTIMIZATION.md](./PLUGIN_MANAGER_OPTIMIZATION.md)
