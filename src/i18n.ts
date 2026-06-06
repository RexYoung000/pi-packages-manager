/**
 * pi-packages-manager/i18n.ts
 *
 * 本地化/翻译层：
 * 1. 检测用户语言环境
 * 2. 读取本地缓存的翻译
 * 3. 内置种子翻译（常用包的中文描述）
 *
 * Supported locales: zh-CN, zh-TW, en, ja, ko
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const HOME = process.env.HOME!;
const DATA_DIR = join(HOME, ".pi/agent/extensions/pi-packages-manager/data");
const TRANSLATIONS_FILE = join(DATA_DIR, "translations.json");

// ─── Locale ─────────────────────────────────────────────

export type Locale = "zh-CN" | "zh-TW" | "en" | "ja" | "ko" | string;

export const SUPPORTED_LOCALES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

function detectSystemLocale(): Locale {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale;
  } catch {
    return "en";
  }
}

// In-memory override applied via Settings.
let localeOverride: Locale | undefined;

export function setLocaleOverride(locale: Locale | undefined): void {
  localeOverride = locale;
}

export function getLocaleOverride(): Locale | undefined {
  return localeOverride;
}

/**
 * Resolve the locale to use.
 * Priority: user override (Settings) > system detection.
 */
export function detectLocale(): Locale {
  return localeOverride || detectSystemLocale();
}

export function shouldTranslate(locale?: Locale): boolean {
  const loc = locale || detectLocale();
  return loc.startsWith("zh") || loc.startsWith("ja") || loc.startsWith("ko");
}

// ─── 内置种子翻译 ───────────────────────────────────────

const SEED_TRANSLATIONS: Record<string, Record<string, string>> = {
  "zh-CN": {
    // 用户已安装的包
    "pi-tinyfish-tools": "TinyFish 网页代理工具 — 搜索、抓取和目标驱动的浏览器自动化",
    "pi-autoname": "AI 驱动的会话命名 — 通过 LLM 生成有意义的语义化会话名称",
    "pi-i18n": "多语言支持 — 让 pi 能说中文、日本語、한국어、Español 等多种语言",
    "@juicesharp/rpiv-ask-user-question": "结构化问卷扩展 — 当模型无法猜测时，向用户提供带选项的问卷",
    "@juicesharp/rpiv-todo": "待办事项列表 — 以实时叠加层渲染，支持 /reload 和对话压缩后恢复",
    "@juicesharp/rpiv-i18n": "rpiv 系列插件的本地化基础 — 语言检测、/languages 命令、跨包语言注册表",
    "@gerdloos/npm-trusts-github-skill": "npm 可信发布技能 — 教 LLM 如何通过 GitHub Actions 配置 OIDC 发布，无需 token",
    // 热门社区包
    "@samfp/pi-memory": "持久化记忆 — 从会话中学习修正、偏好和模式，并注入到未来的对话中",
    "pi-crew": "多 AI 团队协作 — 工作流、工作树和异步任务编排",
    "context-mode": "上下文模式管理 — 切换不同的上下文处理策略",
    "pi-subagents": "子代理 — 让 pi 生成和管理子代理执行任务",
    "pi-mcp-adapter": "MCP 协议适配器 — 将 MCP 服务器接入 pi",
    "pi-web-access": "网页访问 — 让 pi 能够浏览和获取网页内容",
    "@vigolium/piolium": "piolium 扩展包",
    "pi-simplify": "简化输出 — 精简 pi 的回复内容",
    "@plannotator/pi-extension": "规划器 — 项目规划和任务分解扩展",
    "@nitra/cursor": "光标增强 — 改进编辑器中的光标控制",
    "@ff-labs/pi-fff": "FFF 模糊搜索 — 快速模糊查找文件和内容",
    "pi-smart-fetch": "智能网页抓取 — 桌面浏览器 TLS 指纹模拟和内容提取",
    "@cryptolibertus/pi-peer": "本地 pi 对等消息 — 本地 pi 实例之间的消息传递、命令、工具和运行时传输",
    "@aliou/pi-guardrails": "安全防护 — 为 pi 添加安全护栏和权限控制",
    "gentle-engram": "持久化记忆 — 本地或云端共享大脑，跨会话、压缩和 MCP 代理",
    "glimpseui": "原生微 UI — 跨平台 WebView 窗口，支持双向 JSON 通信",
    "@linimin/pi-letscook": "长时运行工作流 — .agent 状态管理、角色子代理、连续性和验证",
    "@raindrop-ai/pi-agent": "Raindrop 可观测性 — 通过订阅者或扩展实现自动追踪",
    "@llblab/pi-telegram": "Telegram 运行时适配器 — 将 pi 连接到 Telegram",
    "pi-agent-browser-native": "浏览器自动化 — 将 agent-browser 作为原生工具暴露",
    "@syntesseraai/pi-feature-factory": "功能工厂 — 工具编排的阶段委派",
    "@runfusion/fusion": "Fusion CLI — HTTP API 服务器、守护进程、仪表盘和任务工具",
    "@gotgenes/pi-permission-system": "权限系统 — 细粒度控制 pi 的文件和命令权限",
    "@gotgenes/pi-subagents": "子代理 — 另一个子代理实现",
    "@juicesharp/rpiv-advisor": "顾问 — rpiv 系列的智能建议扩展",
    "@juicesharp/rpiv-web-tools": "网页工具 — rpiv 系列的网页操作工具集",
    "@juicesharp/rpiv-btw": "顺便提醒 — rpiv 系列的备忘和提醒扩展",
  },
  "ja": {
    "pi-tinyfish-tools": "TinyFish Webエージェントツール — 検索、フェッチ、ゴール駆動ブラウザ自動化",
    "pi-autoname": "AI駆動セッション命名 — LLMでセマンティックなセッション名を生成",
    "pi-i18n": "多言語サポート — piで日本語、中文、한국어、Españolなどを話せるように",
    "@juicesharp/rpiv-ask-user-question": "構造化アンケート拡張 — モデルが推測できない場合にユーザーに選択肢付きの質問を提示",
    "@juicesharp/rpiv-todo": "ToDoリスト — リアルタイムオーバーレイで表示、/reloadと圧縮後に復元",
    "@juicesharp/rpiv-i18n": "rpivシリーズのi18n基盤 — 言語検出、/languagesコマンド、クロスパッケージ言語レジストリ",
    "@gerdloos/npm-trusts-github-skill": "npmトラストパブリッシングスキル — GitHub ActionsでOIDCパブリッシュを設定する方法をLLMに教える",
  },
  "ko": {
    "pi-tinyfish-tools": "TinyFish 웹 에이전트 도구 — 검색, 페치, 목표 기반 브라우저 자동화",
    "pi-autoname": "AI 기반 세션 이름 지정 — LLM으로 의미 있는 세션 이름 생성",
    "pi-i18n": "다국어 지원 — pi에서 한국어, 日本語, 中文, Español 등을 사용 가능",
    "@juicesharp/rpiv-ask-user-question": "구조화된 질문 확장 — 모델이 추측할 수 없을 때 사용자에게 선택지가 있는 질문 제공",
    "@juicesharp/rpiv-todo": "할 일 목록 — 실시간 오버레이로 렌더링, /reload 및 압축 후 복원",
    "@juicesharp/rpiv-i18n": "rpiv 시리즈의 i18n 기반 — 언어 감지, /languages 명령, 크로스 패키지 언어 레지스트리",
    "@gerdloos/npm-trusts-github-skill": "npm 트러스트 퍼블리싱 스킬 — GitHub Actions로 OIDC 퍼블리시를 설정하는 방법을 LLM에 가르침",
  },
};

// ─── Translations Cache ─────────────────────────────────

interface TranslationEntry {
  description: string;       // 原始描述
  translated: string;        // 翻译后描述
  locale: string;
  translatedAt: number;      // timestamp
}

type TranslationCache = Record<string, TranslationEntry>; // keyed by pkgName

function loadCache(): TranslationCache {
  try {
    if (existsSync(TRANSLATIONS_FILE)) {
      return JSON.parse(readFileSync(TRANSLATIONS_FILE, "utf-8"));
    }
  } catch { /* empty */ }
  return {};
}

function saveCache(cache: TranslationCache): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(TRANSLATIONS_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch { /* empty */ }
}

/**
 * 获取包的翻译描述
 * 优先级：用户缓存 > 内置种子翻译 > 原始描述
 */
export function getTranslatedDescription(pkgName: string, originalDesc: string, locale?: Locale): string {
  if (!shouldTranslate(locale)) return originalDesc;

  const loc = locale || detectLocale();
  const cache = loadCache();

  // 1. 用户缓存优先
  const entry = cache[pkgName];
  if (entry && entry.translated && entry.locale === loc) {
    return entry.translated;
  }

  // 2. 内置种子翻译
  const seedKey = loc.startsWith("zh") ? "zh-CN" : loc.split("-")[0];
  const seed = SEED_TRANSLATIONS[seedKey]?.[pkgName];
  if (seed) return seed;

  // 3. 原始描述
  return originalDesc;
}

/**
 * 批量获取翻译描述
 */
export function getTranslatedDescriptions(
  packages: Array<{ name: string; description: string }>,
  locale?: Locale
): Map<string, string> {
  const result = new Map<string, string>();
  for (const pkg of packages) {
    result.set(pkg.name, getTranslatedDescription(pkg.name, pkg.description, locale));
  }
  return result;
}

/**
 * 保存翻译到缓存
 */
export function saveTranslation(pkgName: string, originalDesc: string, translated: string, locale?: Locale): void {
  const cache = loadCache();
  cache[pkgName] = {
    description: originalDesc,
    translated,
    locale: locale || detectLocale(),
    translatedAt: Date.now(),
  };
  saveCache(cache);
}

/**
 * 批量保存翻译
 */
export function saveTranslations(
  translations: Array<{ pkgName: string; original: string; translated: string }>,
  locale?: Locale
): void {
  const cache = loadCache();
  const loc = locale || detectLocale();
  const now = Date.now();

  for (const t of translations) {
    cache[t.pkgName] = {
      description: t.original,
      translated: t.translated,
      locale: loc,
      translatedAt: now,
    };
  }

  saveCache(cache);
}

// ─── 类型标签的本地化 ────────────────────────────────────

const TYPE_LABELS: Record<string, Record<string, string>> = {
  "zh-CN": { extension: "扩展", skill: "技能", prompt: "模板", package: "包" },
  "zh-TW": { extension: "擴展", skill: "技能", prompt: "模板", package: "包" },
  ja:      { extension: "拡張", skill: "スキル", prompt: "テンプレート", package: "パッケージ" },
  ko:      { extension: "확장", skill: "스킬", prompt: "템플릿", package: "패키지" },
  en:      { extension: "extension", skill: "skill", prompt: "template", package: "package" },
};

export function localizeType(type: string, locale?: Locale): string {
  const loc = (locale || detectLocale()).split("-")[0] === "zh"
    ? (locale || detectLocale()).startsWith("zh-TW") ? "zh-TW" : "zh-CN"
    : (locale || detectLocale()).split("-")[0];
  return TYPE_LABELS[loc]?.[type] || type;
}

// ─── UI 文本的本地化 ────────────────────────────────────

const UI_TEXT: Record<string, Record<string, string>> = {
  // ── 简体中文 ──
  "zh-CN": {
    // command description
    "command.description": "🔌 插件管理器：查看、搜索、安装、卸载 pi 扩展插件",
    // completions
    "completion.list": "list — 查看已安装插件",
    "completion.search": "search <关键词> — 搜索社区插件",
    "completion.install": "install <包名> — 安装插件",
    "completion.remove": "remove <包名> — 卸载插件",
    "completion.update": "update [包名] — 更新插件",
    "completion.info": "info <包名> — 查看插件详情",
    // menu
    "menu.title": "🔌 插件管理器",
    "menu.installed": "已安装插件",
    "menu.search": "搜索社区插件",
    "menu.update": "检查更新",
    // installed
    "installed.title": "已安装的插件",
    "installed.empty": "暂无已安装的插件",
    // search
    "search.title": "搜索社区插件",
    "search.placeholder": "输入搜索关键词...",
    "search.no_results": "未找到相关插件",
    "search.searching": "正在搜索...",
    // detail
    "detail.install": "安装",
    "detail.remove": "卸载",
    "detail.update": "更新",
    "detail.back": "返回",
    "detail.installed": "已安装",
    "detail.not_installed": "未安装",
    "detail.version": "版本",
    "detail.latest": "最新版本",
    "detail.author": "作者",
    "detail.license": "许可证",
    "detail.types": "类型",
    "detail.downloads": "下载量",
    "detail.keywords": "关键词",
    "detail.loading": "正在加载",
    "detail.readme": "README",
    "detail.no_readme": "该包没有提供 README",
    // install
    "install.confirm": "确认安装",
    "install.running": "正在安装",
    "install.success": "安装成功！请使用 /reload 重新加载。",
    "install.fail": "安装失败",
    // remove
    "remove.confirm": "确认卸载",
    "remove.running": "正在卸载",
    "remove.fallback": "正在从配置中移除",
    "remove.success": "卸载成功！请使用 /reload 重新加载。",
    "remove.fail": "卸载失败",
    // update
    "update.checking": "正在检查更新...",
    "update.all_latest": "所有插件均为最新版本",
    "update.available": "有更新可用",
    "update.success": "更新成功！请使用 /reload 重新加载。",
    // misc
    "plugin.unknown": "未知子命令",
    "plugin.available": "可用",
    "search.error": "搜索出错",
    "info.not_found": "未找到包",
    "info.loading": "正在查询",
    // browse
    "browse.title": "🏪 社区插件",
    "browse.loading": "正在加载社区插件...",
    "browse.empty": "未找到插件",
    // navigation
    "nav.prev": "⬅️ 上一页",
    "nav.next": "➡️ 下一页",
    "nav.search": "🔍 重新搜索",
    "nav.ai_search": "🧠 AI 搜索",
    "nav.back": "↩️ 返回上一层",
    "nav.close": "关闭",
    "nav.home": "🏠 主菜单",
    "nav.section": "操作",
    "nav.hint": "↑↓ 选择  ↵ 查看  Esc 返回",
    // ai search
    "ai.title": "🧠 AI 智能搜索",
    "ai.placeholder": "描述你想要的插件功能，如：我想要UI相关的插件",
    "ai.loading": "正在让 AI 分析你的需求...",
    "ai.no_results": "AI 未找到匹配的插件",
    "ai.fallback": "AI 搜索超时，已切换为关键词搜索",
    "ai.error": "AI 搜索失败",
    // keyword search
    "keyword.title": "🔍 搜索插件",
    "keyword.placeholder": "输入关键词，如：memory、browser、telegram",
    // panel
    "panel.tab.installed": "已安装",
    "panel.tab.browse": "社区",
    "panel.tab.updates": "更新",
    "panel.tab.settings": "设置",
    "panel.help.base": "Tab/⇧Tab 切换 · ↑↓ 选择 · ↵ 详情 · Esc 关闭",
    "panel.help.search": "/ 搜索",
    "panel.help.config": "g 运行 pi config",
    "panel.empty.installed": "尚未安装任何插件。",
    "panel.empty.browse": "正在加载社区插件...（按 Tab 切换）",
    "panel.empty.updates": "正在检查更新...（按 Tab 切换）",
    "settings.section.language": "语言",
    "settings.section.cache": "目录缓存",
    "settings.section.preferences": "偏好",
    "settings.section.tip": "提示",
    "settings.cache.status": "状态",
    "settings.cache.cached": "已缓存 {count} 个包 · {age}",
    "settings.cache.empty": "未缓存",
    "settings.cache.refresh": "[r] 刷新缓存",
    "settings.cache.clear": "[c] 清空缓存",
    "settings.locale.source": "当前生效: {source}",
    "settings.locale.source.project": "项目（覆盖全局）",
    "settings.locale.source.global": "全局",
    "settings.locale.source.default": "默认",
    "settings.preferences.reset": "[x] 重置所有偏好到默认",
    "settings.confirm.reset": "这会清除你的语言偏好，恢复为默认。继续？",
    "settings.refreshed": "已刷新目录缓存（{count} 个包）",
    "settings.refresh.failed": "刷新缓存失败",
    "settings.cleared": "已清空目录缓存",
    "settings.reset.done": "已重置偏好",
    "settings.reset.noop": "没有需要重置的偏好",
    "settings.tip.config": "提示：在终端运行 `pi config` 可启用 / 禁用扩展、技能、提示词、主题。",
    "settings.locale.changed": "语言已切换为",
  },
  // ── 繁體中文 ──
  "zh-TW": {
    "command.description": "🔌 插件管理器：檢視、搜尋、安裝、解除安裝 pi 擴展插件",
    "completion.list": "list — 檢視已安裝插件",
    "completion.search": "search <關鍵詞> — 搜尋社群插件",
    "completion.install": "install <包名> — 安裝插件",
    "completion.remove": "remove <包名> — 解除安裝插件",
    "completion.update": "update [包名] — 更新插件",
    "completion.info": "info <包名> — 檢視插件詳情",
    "menu.title": "🔌 插件管理器",
    "menu.installed": "已安裝插件",
    "menu.search": "搜尋社群插件",
    "menu.update": "檢查更新",
    "installed.title": "已安裝的插件",
    "installed.empty": "暫無已安裝的插件",
    "search.title": "搜尋社群插件",
    "search.placeholder": "輸入搜尋關鍵詞...",
    "search.no_results": "未找到相關插件",
    "search.searching": "正在搜尋...",
    "detail.install": "安裝",
    "detail.remove": "解除安裝",
    "detail.update": "更新",
    "detail.back": "返回",
    "detail.installed": "已安裝",
    "detail.not_installed": "未安裝",
    "detail.version": "版本",
    "detail.latest": "最新版本",
    "detail.author": "作者",
    "detail.license": "授權條款",
    "detail.types": "類型",
    "detail.downloads": "下載量",
    "detail.keywords": "關鍵詞",
    "detail.loading": "正在載入",
    "detail.readme": "README",
    "detail.no_readme": "該包沒有提供 README",
    // install
    "install.confirm": "確認安裝",
    "install.running": "正在安裝",
    "install.success": "安裝成功！請使用 /reload 重新載入。",
    "install.fail": "安裝失敗",
    // remove
    "remove.confirm": "確認解除安裝",
    "remove.running": "正在解除安裝",
    "remove.fallback": "正在從設定中移除",
    "remove.success": "解除安裝成功！請使用 /reload 重新載入。",
    "remove.fail": "解除安裝失敗",
    // update
    "update.checking": "正在檢查更新...",
    "update.all_latest": "所有插件均為最新版本",
    "update.available": "有更新可用",
    "update.success": "更新成功！請使用 /reload 重新載入。",
    // misc
    "plugin.unknown": "未知子命令",
    "plugin.available": "可用",
    "search.error": "搜尋出錯",
    "info.not_found": "未找到包",
    "info.loading": "正在查詢",
    "browse.title": "🏪 社群插件",
    "browse.loading": "正在載入社群插件...",
    "browse.empty": "未找到插件",
    "nav.prev": "⬅️ 上一頁",
    "nav.next": "➡️ 下一頁",
    "nav.search": "🔍 重新搜尋",
    "nav.ai_search": "🧠 AI 搜尋",
    "nav.back": "↩️ 返回上一層",
    "nav.close": "關閉",
    "nav.home": "🏠 主選單",
    "nav.section": "操作",
    "nav.hint": "↑↓ 選擇  ↵ 查看  Esc 返回",
    "ai.title": "🧠 AI 智慧搜尋",
    "ai.placeholder": "描述你想要的插件功能，如：我想要UI相關的插件",
    "ai.loading": "正在讓 AI 分析你的需求...",
    "ai.no_results": "AI 未找到匹配的插件",
    "ai.fallback": "AI 搜尋超時，已切換為關鍵詞搜尋",
    "ai.error": "AI 搜尋失敗",
    "keyword.title": "🔍 搜尋插件",
    "keyword.placeholder": "輸入關鍵詞，如：memory、browser、telegram",
    "panel.tab.installed": "已安裝",
    "panel.tab.browse": "社群",
    "panel.tab.updates": "更新",
    "panel.tab.settings": "設定",
    "panel.help.base": "Tab/⇧Tab 切換 · ↑↓ 選擇 · ↵ 詳情 · Esc 關閉",
    "panel.help.search": "/ 搜尋",
    "panel.help.config": "g 執行 pi config",
    "panel.empty.installed": "尚未安裝任何套件。",
    "panel.empty.browse": "正在載入社群套件...（按 Tab 切換）",
    "panel.empty.updates": "正在檢查更新...（按 Tab 切換）",
    "settings.section.language": "語言",
    "settings.section.cache": "目錄快取",
    "settings.section.preferences": "偏好",
    "settings.section.tip": "提示",
    "settings.cache.status": "狀態",
    "settings.cache.cached": "已快取 {count} 個套件 · {age}",
    "settings.cache.empty": "未快取",
    "settings.cache.refresh": "[r] 重新整理快取",
    "settings.cache.clear": "[c] 清空快取",
    "settings.locale.source": "目前生效: {source}",
    "settings.locale.source.project": "專案（覆蓋全域）",
    "settings.locale.source.global": "全域",
    "settings.locale.source.default": "預設",
    "settings.preferences.reset": "[x] 重設所有偏好為預設",
    "settings.confirm.reset": "這會清除你的語言偏好，恢復為預設。繼續？",
    "settings.refreshed": "已重新整理目錄快取（{count} 個套件）",
    "settings.refresh.failed": "重新整理快取失敗",
    "settings.cleared": "已清空目錄快取",
    "settings.reset.done": "已重設偏好",
    "settings.reset.noop": "沒有需要重設的偏好",
    "settings.tip.config": "提示：在終端執行 `pi config` 可啟用 / 停用擴充、技能、提示詞、主題。",
    "settings.locale.changed": "語言已切換為",
  },
  // ── English ──
  "en": {
    "command.description": "🔌 Plugin Manager: view, search, install, and uninstall pi extensions",
    "completion.list": "list — View installed plugins",
    "completion.search": "search <keyword> — Search community plugins",
    "completion.install": "install <package> — Install a plugin",
    "completion.remove": "remove <package> — Uninstall a plugin",
    "completion.update": "update [package] — Update plugins",
    "completion.info": "info <package> — View plugin details",
    "menu.title": "🔌 Plugin Manager",
    "menu.installed": "Installed Plugins",
    "menu.search": "Search Community",
    "menu.update": "Check for Updates",
    "installed.title": "Installed Plugins",
    "installed.empty": "No plugins installed",
    "search.title": "Search Community Plugins",
    "search.placeholder": "Enter search keywords...",
    "search.no_results": "No plugins found",
    "search.searching": "Searching...",
    "detail.install": "Install",
    "detail.remove": "Uninstall",
    "detail.update": "Update",
    "detail.back": "Back",
    "detail.installed": "Installed",
    "detail.not_installed": "Not installed",
    "detail.version": "Version",
    "detail.latest": "Latest",
    "detail.author": "Author",
    "detail.license": "License",
    "detail.types": "Types",
    "detail.downloads": "Downloads",
    "detail.keywords": "Keywords",
    "detail.loading": "Loading",
    "detail.readme": "README",
    "detail.no_readme": "No README available for this package",
    // install
    "install.confirm": "Confirm install",
    "install.running": "Installing",
    "install.success": "Installed! Use /reload to apply.",
    "install.fail": "Install failed",
    // remove
    "remove.confirm": "Confirm uninstall",
    "remove.running": "Uninstalling",
    "remove.fallback": "Removing from settings",
    "remove.success": "Uninstalled! Use /reload to apply.",
    "remove.fail": "Uninstall failed",
    // update
    "update.checking": "Checking for updates...",
    "update.all_latest": "All plugins are up to date",
    "update.available": "Updates available",
    "update.success": "Updated! Use /reload to apply.",
    // misc
    "plugin.unknown": "Unknown subcommand",
    "plugin.available": "Available",
    "search.error": "Search error",
    "info.not_found": "Package not found",
    "info.loading": "Fetching info for",
    "browse.title": "🏪 Community Plugins",
    "browse.loading": "Loading community plugins...",
    "browse.empty": "No plugins found",
    "nav.prev": "⬅️ Previous",
    "nav.next": "➡️ Next",
    "nav.search": "🔍 Search Again",
    "nav.ai_search": "🧠 AI Search",
    "nav.back": "↩️ Back",
    "nav.close": "Close",
    "nav.home": "🏠 Main Menu",
    "nav.section": "Actions",
    "nav.hint": "↑↓ Select  ↵ View  Esc Back",
    "ai.title": "🧠 AI Semantic Search",
    "ai.placeholder": "Describe what you need, e.g.: I want UI-related plugins",
    "ai.loading": "AI is analyzing your request...",
    "ai.no_results": "AI found no matching plugins",
    "ai.fallback": "AI search timed out, fell back to keyword search",
    "ai.error": "AI search failed",
    "keyword.title": "🔍 Search Plugins",
    "keyword.placeholder": "Enter keywords, e.g.: memory, browser, telegram",
    "panel.tab.installed": "Installed",
    "panel.tab.browse": "Browse",
    "panel.tab.updates": "Updates",
    "panel.tab.settings": "Settings",
    "panel.help.base": "Tab/⇧Tab switch · ↑↓ navigate · ↵ detail · Esc close",
    "panel.help.search": "/ search",
    "panel.help.config": "g run pi config",
    "panel.empty.installed": "No packages installed yet.",
    "panel.empty.browse": "Loading community catalog... (press Tab to switch)",
    "panel.empty.updates": "Checking for updates... (press Tab to switch)",
    "settings.section.language": "Language",
    "settings.section.cache": "Catalog cache",
    "settings.section.preferences": "Preferences",
    "settings.section.tip": "Tip",
    "settings.cache.status": "Status",
    "settings.cache.cached": "Cached {count} packages · {age}",
    "settings.cache.empty": "Not cached",
    "settings.cache.refresh": "[r] Refresh cache",
    "settings.cache.clear": "[c] Clear cache",
    "settings.locale.source": "Active: {source}",
    "settings.locale.source.project": "Project (overrides global)",
    "settings.locale.source.global": "Global",
    "settings.locale.source.default": "Default",
    "settings.preferences.reset": "[x] Reset all preferences to defaults",
    "settings.confirm.reset": "This will clear your language preference and restore defaults. Continue?",
    "settings.refreshed": "Catalog refreshed ({count} packages)",
    "settings.refresh.failed": "Failed to refresh catalog",
    "settings.cleared": "Catalog cache cleared",
    "settings.reset.done": "Preferences reset",
    "settings.reset.noop": "No preferences to reset",
    "settings.tip.config": "Tip: run `pi config` in your terminal to enable/disable extensions, skills, prompts, and themes.",
    "settings.locale.changed": "Language switched to",
  },
  // ── 日本語 ──
  "ja": {
    "command.description": "🔌 プラグインマネージャー：pi拡張プラグインの表示・検索・インストール・アンインストール",
    "completion.list": "list — インストール済みプラグインを表示",
    "completion.search": "search <キーワード> — コミュニティプラグインを検索",
    "completion.install": "install <パッケージ> — プラグインをインストール",
    "completion.remove": "remove <パッケージ> — プラグインをアンインストール",
    "completion.update": "update [パッケージ] — プラグインを更新",
    "completion.info": "info <パッケージ> — プラグイン詳細を表示",
    "menu.title": "🔌 プラグインマネージャー",
    "menu.installed": "インストール済みプラグイン",
    "menu.search": "コミュニティを検索",
    "menu.update": "アップデートを確認",
    "installed.title": "インストール済みプラグイン",
    "installed.empty": "インストール済みのプラグインはありません",
    "search.title": "コミュニティプラグインを検索",
    "search.placeholder": "検索キーワードを入力...",
    "search.no_results": "プラグインが見つかりません",
    "search.searching": "検索中...",
    "detail.install": "インストール",
    "detail.remove": "アンインストール",
    "detail.update": "アップデート",
    "detail.back": "戻る",
    "detail.installed": "インストール済み",
    "detail.not_installed": "未インストール",
    "detail.version": "バージョン",
    "detail.latest": "最新バージョン",
    "detail.author": "作者",
    "detail.license": "ライセンス",
    "detail.types": "タイプ",
    "detail.downloads": "ダウンロード数",
    "detail.keywords": "キーワード",
    "detail.loading": "読み込み中",
    "detail.readme": "README",
    "detail.no_readme": "このパッケージには README がありません",
    // install
    "install.confirm": "インストールを確認",
    "install.running": "インストール中",
    "install.success": "インストール完了！ /reload で反映してください。",
    "install.fail": "インストール失敗",
    // remove
    "remove.confirm": "アンインストールを確認",
    "remove.running": "アンインストール中",
    "remove.fallback": "設定から削除中",
    "remove.success": "アンインストール完了！ /reload で反映してください。",
    "remove.fail": "アンインストール失敗",
    // update
    "update.checking": "アップデートを確認中...",
    "update.all_latest": "すべてのプラグインは最新です",
    "update.available": "アップデート可能",
    "update.success": "アップデート完了！ /reload で反映してください。",
    // misc
    "plugin.unknown": "不明なサブコマンド",
    "plugin.available": "利用可能",
    "search.error": "検索エラー",
    "info.not_found": "パッケージが見つかりません",
    "info.loading": "情報を取得中",
    "browse.title": "🏪 コミュニティプラグイン",
    "browse.loading": "コミュニティプラグインを読み込み中...",
    "browse.empty": "プラグインが見つかりません",
    "nav.prev": "⬅️ 前へ",
    "nav.next": "➡️ 次へ",
    "nav.search": "🔍 再検索",
    "nav.ai_search": "🧠 AI検索",
    "nav.back": "↩️ 戻る",
    "nav.close": "閉じる",
    "nav.home": "🏠 メインメニュー",
    "nav.section": "操作",
    "nav.hint": "↑↓ 選択  ↵ 表示  Esc 戻る",
    "ai.title": "🧠 AIセマンティック検索",
    "ai.placeholder": "必要な機能を説明してください。例：UI関連のプラグインが欲しい",
    "ai.loading": "AIがリクエストを分析中...",
    "ai.no_results": "一致するプラグインが見つかりませんでした",
    "ai.fallback": "AI検索がタイムアウト、キーワード検索に切り替えました",
    "ai.error": "AI検索に失敗しました",
    "keyword.title": "🔍 プラグイン検索",
    "keyword.placeholder": "キーワードを入力、例：memory、browser、telegram",
    "panel.tab.installed": "インストール済",
    "panel.tab.browse": "コミュニティ",
    "panel.tab.updates": "更新",
    "panel.tab.settings": "設定",
    "panel.help.base": "Tab/⇧Tab 切替 · ↑↓ 選択 · ↵ 詳細 · Esc 閉じる",
    "panel.help.search": "/ 検索",
    "panel.help.config": "g pi config を実行",
    "panel.empty.installed": "インストール済みパッケージはありません。",
    "panel.empty.browse": "コミュニティカタログを読み込み中...（Tab で切替）",
    "panel.empty.updates": "更新を確認中...（Tab で切替）",
    "settings.section.language": "言語",
    "settings.section.cache": "カタログキャッシュ",
    "settings.section.preferences": "プリファレンス",
    "settings.section.tip": "ヒント",
    "settings.cache.status": "状態",
    "settings.cache.cached": "キャッシュ済み {count} パッケージ · {age}",
    "settings.cache.empty": "キャッシュなし",
    "settings.cache.refresh": "[r] キャッシュを更新",
    "settings.cache.clear": "[c] キャッシュをクリア",
    "settings.locale.source": "有効: {source}",
    "settings.locale.source.project": "プロジェクト（グローバル上書き）",
    "settings.locale.source.global": "グローバル",
    "settings.locale.source.default": "デフォルト",
    "settings.preferences.reset": "[x] すべてのプリファレンスをデフォルトに戻す",
    "settings.confirm.reset": "言語プリファレンスをクリアし、デフォルトに戻します。続行しますか？",
    "settings.refreshed": "カタログキャッシュを更新しました（{count} パッケージ）",
    "settings.refresh.failed": "カタログの更新に失敗しました",
    "settings.cleared": "カタログキャッシュをクリアしました",
    "settings.reset.done": "プリファレンスをリセットしました",
    "settings.reset.noop": "リセットするプリファレンスはありません",
    "settings.tip.config": "ヒント: ターミナルで `pi config` を実行して拡張・スキル・プロンプト・テーマを制御します。",
    "settings.locale.changed": "言語を切り替えました:",
  },
  // ── 한국어 ──
  "ko": {
    "command.description": "🔌 플러그인 관리자: pi 확장 플러그인 보기, 검색, 설치, 제거",
    "completion.list": "list — 설치된 플러그인 보기",
    "completion.search": "search <키워드> — 커뮤니티 플러그인 검색",
    "completion.install": "install <패키지> — 플러그인 설치",
    "completion.remove": "remove <패키지> — 플러그인 제거",
    "completion.update": "update [패키지] — 플러그인 업데이트",
    "completion.info": "info <패키지> — 플러그인 상세 보기",
    "menu.title": "🔌 플러그인 관리자",
    "menu.installed": "설치된 플러그인",
    "menu.search": "커뮤니티 검색",
    "menu.update": "업데이트 확인",
    "installed.title": "설치된 플러그인",
    "installed.empty": "설치된 플러그인이 없습니다",
    "search.title": "커뮤니티 플러그인 검색",
    "search.placeholder": "검색 키워드를 입력하세요...",
    "search.no_results": "플러그인을 찾을 수 없습니다",
    "search.searching": "검색 중...",
    "detail.install": "설치",
    "detail.remove": "제거",
    "detail.update": "업데이트",
    "detail.back": "돌아가기",
    "detail.installed": "설치됨",
    "detail.not_installed": "미설치",
    "detail.version": "버전",
    "detail.latest": "최신 버전",
    "detail.author": "작성자",
    "detail.license": "라이선스",
    "detail.types": "유형",
    "detail.downloads": "다운로드",
    "detail.keywords": "키워드",
    "detail.loading": "불러오는 중",
    "detail.readme": "README",
    "detail.no_readme": "이 패키지에는 README가 없습니다",
    // install
    "install.confirm": "설치 확인",
    "install.running": "설치 중",
    "install.success": "설치 완료! /reload로 적용하세요.",
    "install.fail": "설치 실패",
    // remove
    "remove.confirm": "제거 확인",
    "remove.running": "제거 중",
    "remove.fallback": "설정에서 제거 중",
    "remove.success": "제거 완료! /reload로 적용하세요.",
    "remove.fail": "제거 실패",
    // update
    "update.checking": "업데이트 확인 중...",
    "update.all_latest": "모든 플러그인이 최신입니다",
    "update.available": "업데이트 가능",
    "update.success": "업데이트 완료! /reload로 적용하세요.",
    // misc
    "plugin.unknown": "알 수 없는 하위 명령",
    "plugin.available": "사용 가능",
    "search.error": "검색 오류",
    "info.not_found": "패키지를 찾을 수 없습니다",
    "info.loading": "정보를 불러오는 중",
    "browse.title": "🏪 커뮤니티 플러그인",
    "browse.loading": "커뮤니티 플러그인 불러오는 중...",
    "browse.empty": "플러그인을 찾을 수 없습니다",
    "nav.prev": "⬅️ 이전",
    "nav.next": "➡️ 다음",
    "nav.search": "🔍 다시 검색",
    "nav.ai_search": "🧠 AI 검색",
    "nav.back": "↩️ 이전으로",
    "nav.close": "닫기",
    "nav.home": "🏠 메인 메뉴",
    "nav.section": "작업",
    "nav.hint": "↑↓ 선택  ↵ 보기  Esc 뒤로",
    "ai.title": "🧠 AI 시맨틱 검색",
    "ai.placeholder": "원하는 기능을 설명하세요. 예: UI 관련 플러그인이 필요해요",
    "ai.loading": "AI가 요청을 분석 중...",
    "ai.no_results": "일치하는 플러그인을 찾지 못했습니다",
    "ai.fallback": "AI 검색 시간 초과, 키워드 검색으로 전환",
    "ai.error": "AI 검색 실패",
    "keyword.title": "🔍 플러그인 검색",
    "keyword.placeholder": "키워드 입력, 예: memory, browser, telegram",
    "panel.tab.installed": "설치됨",
    "panel.tab.browse": "커뮤니티",
    "panel.tab.updates": "업데이트",
    "panel.tab.settings": "설정",
    "panel.help.base": "Tab/⇧Tab 전환 · ↑↓ 선택 · ↵ 상세 · Esc 닫기",
    "panel.help.search": "/ 검색",
    "panel.help.config": "g pi config 실행",
    "panel.empty.installed": "설치된 패키지가 없습니다.",
    "panel.empty.browse": "커뮤니티 카탈로그를 로드 중...（Tab으로 전환）",
    "panel.empty.updates": "업데이트 확인 중...（Tab으로 전환）",
    "settings.section.language": "언어",
    "settings.section.cache": "카탈로그 캐시",
    "settings.section.preferences": "환경설정",
    "settings.section.tip": "팁",
    "settings.cache.status": "상태",
    "settings.cache.cached": "캐시됨 {count}개 패키지 · {age}",
    "settings.cache.empty": "캐시 없음",
    "settings.cache.refresh": "[r] 캐시 새로고침",
    "settings.cache.clear": "[c] 캐시 비우기",
    "settings.locale.source": "활성: {source}",
    "settings.locale.source.project": "프로젝트 (글로벌 덮어쓰기)",
    "settings.locale.source.global": "글로벌",
    "settings.locale.source.default": "기본",
    "settings.preferences.reset": "[x] 모든 환경설정 기본값으로 초기화",
    "settings.confirm.reset": "언어 환경설정을 지우고 기본값으로 되돌립니다. 계속하시겠습니까?",
    "settings.refreshed": "카탈로그 캐시 새로고침됨 ({count}개 패키지)",
    "settings.refresh.failed": "카탈로그 새로고침 실패",
    "settings.cleared": "카탈로그 캐시 비워짐",
    "settings.reset.done": "환경설정 초기화됨",
    "settings.reset.noop": "초기화할 환경설정이 없습니다",
    "settings.tip.config": "팁: 터미널에서 `pi config`를 실행하여 확장/스킬/프롬프트/테마를 활성화/비활성화하세요.",
    "settings.locale.changed": "언어가 다음으로 전환되었습니다:",
  },
};

/**
 * Resolve locale to the best matching UI_TEXT key.
 * Falls back to base language, then to "en".
 */
function resolveUILocale(locale?: Locale): string {
  const loc = locale || detectLocale();

  // Exact match
  if (UI_TEXT[loc]) return loc;

  // Language prefix match (e.g. "ja-JP" → "ja")
  const base = loc.split("-")[0];
  if (UI_TEXT[base]) return base;

  // Chinese variants → zh-CN as fallback
  if (base === "zh") return "zh-CN";

  // Default to English
  return "en";
}

export function t(key: string, locale?: Locale, params?: Record<string, string | number>): string {
  const resolved = resolveUILocale(locale);
  let text = UI_TEXT[resolved]?.[key] || UI_TEXT["en"]?.[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/**
 * v1.3.0 J1: 相对时间格式化。根据 locale 输出 “11 小时前” / "11 hours ago" 等。
 */
export function formatRelativeTime(date: Date, locale?: Locale): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return t("settings.cache.empty", locale);
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const resolved = resolveUILocale(locale);
  if (resolved === "zh-CN" || resolved === "zh-TW") {
    if (seconds < 60) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return `${days} 天前`;
  }
  if (resolved === "ja") {
    if (seconds < 60) return "たった今";
    if (minutes < 60) return `${minutes} 分前`;
    if (hours < 24) return `${hours} 時間前`;
    return `${days} 日前`;
  }
  if (resolved === "ko") {
    if (seconds < 60) return "방금";
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return `${days}일 전`;
  }
  // en + default
  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
