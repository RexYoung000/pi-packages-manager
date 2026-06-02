# Roadmap

跟踪 pi-packages-manager 后续要做的事。按价值密度排序，并标注预估工作量与依赖。

更新时间：2026-06-02
当前版本：1.0.0

---

## 已完成（v1.0）

- Phase 0 项目化：独立仓库 + GitHub
- Phase 1 数据层：catalog 缓存、关键字优先、filter 解析、fuzzy ranking
- Phase 2 交互逻辑：Install/Remove/Update scope 选择、安全确认、reload 提示、详情资源/Security、pinned/skip 识别、Update all
- Phase 2d Settings 页（select 列表版）
- Phase 3a Claude 风格 overlay 面板（Tab 切换 / 异步加载）
- Phase 3b Settings 页内置语言切换器（5 种语言，立即生效，持久化到 preferences.json）
- 自定义 PackageList 组件（每项 3 行 + 1 空行，关键 chrome 不挤）
- 命名统一：`/packages-list`、`pi-packages-manager`

---

## 下一轮（v1.1 候选）

按价值密度排序。

### A. 实时搜索框（高优先）

panel 顶部内嵌单行 `Input`，输入即过滤当前 tab 的列表。

- Browse：把输入串作为搜索 query 发给 `searchNpmRegistry()` + 本地 catalog ranking
- Installed：用包名 + 描述 fuzzy 过滤本地列表
- Updates：同 Installed
- 不再需要先按 `/` 跳出 panel

依赖：pi-tui 没有内置 Input 组件，需要自写一个 minimal Input（光标 / 回退 / 中文 IME）

工作量：1-2 天

### B. 详情侧栏（高优先）

`Enter` 不关闭 panel，右侧 split 区直接渲染详情：版本、作者、Resources、Security。

- 左侧 PackageList 1/3 宽，右侧详情 2/3 宽
- `←` 收起侧栏返回单栏
- 安装/删除/更新操作直接在右侧执行后刷新

依赖：自己做 horizontal split layout（Container 不直接支持，需要写一个 SplitContainer 或者两段 render 后手动按行合并）

工作量：1.5 天

### C. 操作快捷键（中优先）

panel 内不进详情就能直接操作：

- `i` 安装当前选中
- `r` 删除当前选中
- `u` 更新当前选中
- `?` 帮助

依赖：A、B 之后体验更顺，但本身是独立项

工作量：0.5 天

### D. 过滤器 chip（中优先）

每个 tab 顶部加一行 chip：`[All] [extension] [skill] [prompt] [theme]`，按 `1-5` 切换。Browse tab 加 `[npm] [git] [local]` 来源筛选。

依赖：复用 PackageList，外层加一层 chip 组件

工作量：0.5 天

### E. 状态指示（低优先）

- 滚动指示器：`(10/120)` 已有，加 visual scrollbar 列
- Loading spinner：Browse/Updates 异步加载时显示
- 空状态友好提示：网络错误时给"按 r 重试"

工作量：0.5 天

### F. Settings 扩展（低优先）

- catalog 缓存状态展示 + `r` 刷新
- 项目级 vs 全局级语言开关
- 偏好重置按钮
- pi config 启用/禁用各资源（目前是文字提示）

工作量：1 天

### G. 发布到 npm（解锁分享）

发到 npm 后用户可以 `pi install npm:pi-packages-manager` 直接装。

- npm publish（推荐用 npm trusted publishing + GitHub Actions OIDC，参考 npm-trusts-github skill）
- 加 CHANGELOG（已加）
- README 加 install 一节

工作量：0.5 天

### H. 测试（中优先，长期）

目前完全靠人肉测试。建议加：

- search.ts 单元测试（filter parser、ranking）
- locale.ts 单元测试（持久化优先级）
- panel.ts smoke 测试（jiti load）

依赖：vitest + 本地 fixtures

工作量：1-2 天

---

## 后续可能（v1.2+）

- 包详情 README 渲染（用 Pi 的 Markdown 组件）
- 安装进度条（捕获 `pi install` stdout）
- 网络错误重试 + 离线降级
- 多用户/多 profile（不同语言、不同源）
- 收藏/置顶包
- AI 推荐：基于已装包推荐相关包（已有 aiSemanticSearch，可纳入 Browse tab）
- 主题切换器（pi 已有 ctx.ui.theme，但暴露切换入口在 Settings 也合理）
- 状态栏指示：装在 Pi 主界面 footer，显示有几个可用更新

---

## 已知技术债

- index.ts 现在 800+ 行，逻辑都在一个 closure 里。下一轮在改 panel 时顺手把 `installPackageFlow` / `removePackageFlow` / `updatePackages` 拆到 `src/flows/` 下
- panel.ts rebuild 每次都重建整个 Container，性能没问题但可以更细粒度
- legacy 菜单还在（`/packages-list legacy`），下一轮如果 panel 完全替代再删
- i18n.ts 5 种语言写死在文件里，加 key 时要 5 处改。下一轮改成每种语言一个 JSON 文件 + loader

---

## 发布计划

- v1.0.0：当前 commit，发到 GitHub release，准备投到 pi 社区 gallery
- v1.1.0：A + B + C 完成（实时搜索 + 详情侧栏 + 操作快捷键）
- v1.2.0：D + E + F + H（chip 过滤、状态指示、settings 扩展、单测）
- v2.0.0：拆分 flows、删 legacy、i18n 重构

---

## 链接

- 仓库：<https://github.com/RexYoung000/pi-packages-manager>
- 上一轮设计文档：[PLUGIN_MANAGER_OPTIMIZATION.md](./PLUGIN_MANAGER_OPTIMIZATION.md)
