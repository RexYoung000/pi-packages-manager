/**
 * plugin-manager/index.ts
 *
 * 🔌 pi 插件管理器
 *
 * 交互设计（类 Claude Code 风格）：
 *   /plugin             → 主菜单：已安装 / 浏览社区 / 检查更新
 *   /plugin list        → 已安装插件列表
 *   /plugin search      → 浏览社区（分页 + 搜索 + AI 搜索）
 *   /plugin install xxx → 安装插件
 *   /plugin remove xxx  → 卸载插件
 *   /plugin update [x]  → 检查/更新插件
 *   /plugin info xxx    → 查看插件详情
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  getInstalledPackages,
  searchNpmRegistry,
  getPackageDetail,
  checkForUpdates,
  runPiInstallAsync,
  runPiUninstallAsync,
  removeFromSettings,
  fetchFullCatalog,
  aiSemanticSearch,
  clearCatalogCache,
  normalizeInstallSource,
  type PackageInfo,
} from "./api";
import {
  detectLocale,
  getTranslatedDescription,
  localizeType,
  t,
} from "./i18n";

const PAGE_SIZE = 8;

export default function pluginManager(pi: ExtensionAPI) {
  const locale = detectLocale();

  pi.registerCommand("plugin", {
    description: t("command.description", locale),
    getArgumentCompletions: (prefix: string) => {
      const subcommands = [
        { value: "list", label: t("completion.list", locale) },
        { value: "search", label: t("completion.search", locale) },
        { value: "install", label: t("completion.install", locale) },
        { value: "remove", label: t("completion.remove", locale) },
        { value: "update", label: t("completion.update", locale) },
        { value: "info", label: t("completion.info", locale) },
      ];
      const filtered = subcommands.filter((s) => s.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const parts = (args || "").trim().split(/\s+/);
      const sub = parts[0];
      const rest = parts.slice(1).join(" ");

      // 无子命令 → 进入主菜单循环（Esc 在主菜单上才退出）
      if (!sub) {
        let exit = false;
        while (!exit) {
          exit = await showMainMenu(ctx);
        }
        return;
      }

      // 有子命令时执行对应操作
      switch (sub) {
        case "list":
          await listInstalled(ctx);
          break;
        case "search":
          await browseCommunity(ctx, rest);
          break;
        case "install":
          await installPackageFlow(rest, ctx);
          break;
        case "remove":
          await removePackageFlow(rest, ctx);
          break;
        case "update":
          await updatePackages(rest, ctx);
          break;
        case "info":
          await showPackageInfo(rest, ctx);
          break;
        default:
          ctx.ui.notify(
            `${t("plugin.unknown", locale)}: ${sub}\n${t("plugin.available", locale)}: list, search, install, remove, update, info`,
            "error"
          );
      }
    },
  });

  // ─── 加载提示 ────────────────────────────────────────

  const LOADING_KEY = "plugin-manager-loading";

  function showLoading(ctx: ExtensionCommandContext, message: string) {
    ctx.ui.setWidget(LOADING_KEY, [`  ⠋ ${message}`, ""]);
    ctx.ui.setStatus("plugin", message);
  }

  function updateLoading(ctx: ExtensionCommandContext, message: string) {
    ctx.ui.setWidget(LOADING_KEY, [`  ⠋ ${message}`, ""]);
    ctx.ui.setStatus("plugin", message);
  }

  function clearLoading(ctx: ExtensionCommandContext) {
    ctx.ui.setWidget(LOADING_KEY, undefined);
    ctx.ui.setStatus("plugin", undefined);
  }

  // ─── 主菜单 ─────────────────────────────────────────

  /**
   * 主菜单：三合一入口。返回 true=退出，false=继续循环。
   */
  async function showMainMenu(ctx: ExtensionCommandContext): Promise<boolean> {
    const installed = getInstalledPackages();

    const options = [
      `📦 ${t("menu.installed", locale)}  (${installed.length})`,
      "",
      `🏪 ${t("browse.title", locale)}`,
      "",
      `⬆️  ${t("menu.update", locale)}`,
    ];

    const choice = await ctx.ui.select(t("menu.title", locale), options);

    if (!choice) return true;  // Esc → 退出

    if (choice.includes(t("menu.installed", locale))) {
      await listInstalled(ctx);
    } else if (choice.includes(t("browse.title", locale)) || choice.includes("Community") || choice.includes("社区") || choice.includes("社群") || choice.includes("コミュニティ") || choice.includes("커뮤니티")) {
      await browseCommunity(ctx);
    } else if (choice.includes(t("menu.update", locale))) {
      await updatePackages("", ctx);
    }

    return false;
  }

  // ─── 已安装列表 ─────────────────────────────────────

  async function listInstalled(ctx: ExtensionCommandContext) {
    const installed = getInstalledPackages();

    if (installed.length === 0) {
      ctx.ui.notify(t("installed.empty", locale), "info");
      return;
    }

    // 编号 + 空行分隔
    const items: string[] = [];
    installed.forEach((pkg, i) => {
      const desc = getTranslatedDescription(pkg.name, pkg.description, locale);
      const typeLabels = pkg.types?.map((tp) => localizeType(tp, locale)).join(", ") || "";
      const version = pkg.installedVersion ? `  v${pkg.installedVersion}` : "";
      if (i > 0) items.push("");  // 空行分隔
      items.push(`${circleNum(i + 1)} ${pkg.name}${version}${typeLabels ? `  [${typeLabels}]` : ""}${formatMeta(pkg)}\n    ${desc}`);
    });

    const selected = await ctx.ui.select(
      `${t("installed.title", locale)} (${installed.length})`,
      items
    );

    if (!selected) return;

    // Find by matching package name (skip empty separator lines)
    const pkgIdx = items.filter(it => it !== "").indexOf(selected);
    if (pkgIdx >= 0) {
      await showPackageDetail(installed[pkgIdx], ctx);
    }
  }

  // ─── 社区浏览（搜索即入口）─────────────────────

  async function browseCommunity(ctx: ExtensionCommandContext, initialQuery?: string) {
    // 第一步：让用户输入关键词（留空 = 浏览全部，Esc = 取消）
    const rawInput = initialQuery ?? (await ctx.ui.input(
      t("browse.title", locale),
      t("search.placeholder", locale)
    ));

    // Esc 取消 → 返回主菜单
    if (rawInput === undefined && !initialQuery) return;

    const query = (rawInput || "").trim();

    showLoading(ctx, query ? `${t("search.searching", locale)}...` : t("browse.loading", locale));

    let items: PackageInfo[];
    try {
      items = query ? await searchNpmRegistry(query, 60) : await fetchFullCatalog();
    } catch (err) {
      clearLoading(ctx);
      ctx.ui.notify(`${t("search.error", locale)}: ${(err as Error).message}`, "error");
      return;
    }
    clearLoading(ctx);

    if (items.length === 0) {
      ctx.ui.notify(query ? t("search.no_results", locale) : t("browse.empty", locale), "info");
      return;
    }

    const pageTitle = query ? `${t("browse.title", locale)} · "${query}"` : t("browse.title", locale);
    await paginatedView(items, pageTitle, ctx);
  }

  /**
   * 分页列表浏览。返回 "home" 或 "back" 指示返回目标。
   * 使用分段结构：提示栏 | 插件列表 | 分隔线 | 操作区
   * 通过预计算索引发牌，不依赖字符串匹配。
   */
  async function paginatedView(
    items: PackageInfo[],
    title: string,
    ctx: ExtensionCommandContext,
  ): Promise<"home" | "back"> {
    let page = 0;
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

    while (true) {
      const start = page * PAGE_SIZE;
      const pageItems = items.slice(start, start + PAGE_SIZE);

      // ── 1. 构建插件列表项（编号 + 描述）──
      const pluginOpts: string[] = [];
      pageItems.forEach((pkg, i) => {
        if (i > 0) pluginOpts.push("");  // 空行分隔
        const desc = getTranslatedDescription(pkg.name, pkg.description, locale);
        const badge = pkg.installed ? " ✅" : "";
        const dl = pkg.downloads ? `  (${formatNumber(pkg.downloads)}/mo)` : "";
        const meta = formatMeta(pkg);
        const reasons = pkg.searchReasons?.length ? `\n    match: ${pkg.searchReasons.slice(0, 3).join(", ")}` : "";
        pluginOpts.push(`${circleNum(start + i + 1)} ${pkg.name}${badge}${dl}${meta}\n    ${desc}${reasons}`);
      });

      // ── 2. 构建操作区 ──
      const actions: Array<{ label: string; tag: "prev" | "next" | "search" | "ai" | "back" | "home" }> = [];

      const add = (label: string, tag: typeof actions[number]["tag"]) => {
        actions.push({ label, tag });
      };

      if (totalPages > 1 && page > 0) add(t("nav.prev", locale), "prev");
      if (totalPages > 1 && page < totalPages - 1) add(t("nav.next", locale), "next");
      add(t("nav.search", locale), "search");
      add(t("nav.ai_search", locale), "ai");
      add(t("nav.back", locale), "back");
      add(t("nav.home", locale), "home");

      const actionOptions = actions.flatMap((action, index) =>
        index === 0 ? [action.label] : ["", action.label]
      );

      // ── 3. 组装完整选项列表 ──
      const sep = repeatStr("─", 36);
      const labelWidth = [...t("nav.section", locale)].reduce((w, c) => w + (c.charCodeAt(0) > 0x7f ? 2 : 1), 0);
      const sideDash = Math.max(0, Math.floor((30 - labelWidth) / 2));
      const sectionLabel = `├${repeatStr("─", sideDash)} ${t("nav.section", locale)} ${repeatStr("─", sideDash)}┤`;

      const options = [
        `┈ ${t("nav.hint", locale)}`,        // 0: 提示栏
        "",                                     // 1: 空行
        ...pluginOpts,                          // 2+: 插件列表
        "",                                     // 分隔
        sep,                                    // 分隔线
        "",                                     // 分隔
        sectionLabel,                           // 操作标签
        "",                                     // 空行
        ...actionOptions,                         // 操作按钮
      ];

      const pageLabel = totalPages > 1 ? ` (${page + 1}/${totalPages})` : "";
      const selected = await ctx.ui.select(`${title}${pageLabel} — ${items.length}`, options);

      if (!selected) continue;

      // ── 5. 分派选中项 ──
      const selIdx = options.indexOf(selected);
      if (selIdx < 0) continue;

      // 跳过提示栏、分隔线、操作标签
      if (selIdx <= 1 || selected.startsWith("─") || selected.startsWith("├")) continue;

      // 插件列表项？
      const nonEmptyPlugins = pluginOpts.filter(it => it !== "");
      const pluginIdx = nonEmptyPlugins.indexOf(selected);
      if (pluginIdx >= 0) {
        await showPackageDetail(pageItems[pluginIdx], ctx);
        refreshInstallStatus(items);
        continue;
      }

      const action = actions.find((item) => item.label === selected);
      if (action) {
        const tag = action.tag;
        if (tag === "prev") { page--; continue; }
        if (tag === "next") { page++; continue; }
        if (tag === "home") return "home";
        if (tag === "back") return "back";
        if (tag === "search") {
          const q = (await ctx.ui.input(t("keyword.title", locale), t("keyword.placeholder", locale))) || "";
          if (!q.trim()) continue;
          showLoading(ctx, `${t("search.searching", locale)}...`);
          try {
            const r = await searchNpmRegistry(q, 40);
            clearLoading(ctx);
            if (r.length === 0) { ctx.ui.notify(t("search.no_results", locale), "info"); continue; }
            const sub = await paginatedView(r, `${t("browse.title", locale)} · "${q}"`, ctx);
            if (sub === "home") return "home";
          } catch (err) {
            clearLoading(ctx);
            ctx.ui.notify(`${t("search.error", locale)}: ${(err as Error).message}`, "error");
          }
          continue;
        }
        if (tag === "ai") {
          const q = (await ctx.ui.input(t("ai.title", locale), t("ai.placeholder", locale))) || "";
          if (!q.trim()) continue;
          showLoading(ctx, t("ai.loading", locale));
          try {
            const catalog = await fetchFullCatalog().catch(() => items);
            const r = await aiSemanticSearch(q, catalog);
            clearLoading(ctx);
            if (r.length === 0) { ctx.ui.notify(t("ai.no_results", locale), "info"); continue; }
            const sub = await paginatedView(r, `${t("ai.title", locale)} · "${q}"`, ctx);
            if (sub === "home") return "home";
          } catch (err) {
            clearLoading(ctx);
            ctx.ui.notify(`${t("ai.error", locale)}: ${(err as Error).message}`, "error");
          }
          continue;
        }
      }
    } // while(true)
  }   // paginatedView

  // ─── 包详情 ─────────────────────────────────────────

  async function showPackageDetail(pkg: PackageInfo, ctx: ExtensionCommandContext) {
    showLoading(ctx, `📦 ${t("detail.loading", locale)} ${pkg.name}...`);

    const detail = await getPackageDetail(pkg.name);

    clearLoading(ctx);
    const info = detail || pkg;

    const status = info.installed
      ? `✅ ${t("detail.installed", locale)} (v${info.installedVersion || info.version})`
      : `⬜ ${t("detail.not_installed", locale)}`;

    const hasUpdate = info.latestVersion && info.installedVersion && info.latestVersion !== info.installedVersion;

    const lines = [
      `📦 ${info.name}`,
      ``,
      `${info.description}`,
      ``,
      `${status}`,
    ];

    if (hasUpdate) {
      lines.push(`⬆️  ${t("detail.update", locale)}: ${info.installedVersion} → ${info.latestVersion}`);
    }

    if (info.source) lines.push(`source: ${info.source}`);
    if (info.sourceType || info.scope) lines.push(`scope: ${[info.scope, info.sourceType].filter(Boolean).join(" · ")}`);
    if (info.searchReasons?.length) lines.push(`match: ${info.searchReasons.join(", ")}`);
    if (info.version) lines.push(`${t("detail.version", locale)}: ${info.version}`);
    if (info.latestVersion && !info.installed) lines.push(`${t("detail.latest", locale)}: ${info.latestVersion}`);
    if (info.author) lines.push(`${t("detail.author", locale)}: ${info.author}`);
    if (info.license) lines.push(`${t("detail.license", locale)}: ${info.license}`);
    if (info.types?.length) lines.push(`${t("detail.types", locale)}: ${info.types.map((tp) => localizeType(tp, locale)).join(", ")}`);
    if (info.downloads) lines.push(`${t("detail.downloads", locale)}: ${formatNumber(info.downloads)}/mo`);
    if (info.keywords?.length) lines.push(`${t("detail.keywords", locale)}: ${info.keywords.join(", ")}`);
    if (info.npmUrl) lines.push(`npm: ${info.npmUrl}`);
    if (info.repoUrl) lines.push(`repo: ${info.repoUrl}`);

    // 操作按钮（emoji 在此统一加，i18n 值不含 emoji）
    const options: string[] = [];
    if (info.installed) {
      if (hasUpdate) options.push(`⬆️  ${t("detail.update", locale)}`);
      options.push(`🗑️  ${t("detail.remove", locale)}`);
    } else {
      options.push(`📥 ${t("detail.install", locale)}`);
    }
    options.push(t("nav.back", locale));   // i18n 已含 ↩️

    const choice = await ctx.ui.select(lines.join("\n"), options);

    if (!choice) return;

    if (choice.includes(t("detail.install", locale))) {
      await installPackageFlow(info.name, ctx);
    } else if (choice.includes(t("detail.remove", locale))) {
      const removed = await removePackageFlow(info.name, ctx);
      if (removed) return;  // 卸载成功 → 返回上一层列表（会自动刷新）
    } else if (choice.includes(t("detail.update", locale))) {
      await updatePackages(info.name, ctx);
    }
  }

  // ─── 安装 ───────────────────────────────────────────

  async function installPackageFlow(pkgName: string, ctx: ExtensionCommandContext) {
    if (!pkgName) {
      pkgName = (await ctx.ui.input(t("detail.install", locale), "package name (e.g. pi-tinyfish-tools)")) || "";
    }
    if (!pkgName.trim()) return;

    const installSource = normalizeInstallSource(pkgName);
    const confirmed = await ctx.ui.confirm(
      t("install.confirm", locale),
      `pi install ${installSource}`
    );

    if (!confirmed) return;

    showLoading(ctx, `📥 ${t("install.running", locale)} ${pkgName}...`);

    const result = await runPiInstallAsync(pkgName);

    clearLoading(ctx);
    if (result.success) {
      ctx.ui.notify(`✅ ${pkgName} ${t("install.success", locale)}`, "info");
      clearCatalogCache();
    } else {
      ctx.ui.notify(`❌ ${t("install.fail", locale)}: ${result.output}`, "error");
    }
  }

  // ─── 卸载 ───────────────────────────────────────────

  async function removePackageFlow(pkgName: string, ctx: ExtensionCommandContext): Promise<boolean> {
    if (!pkgName) {
      pkgName = (await ctx.ui.input(t("detail.remove", locale), "package name")) || "";
    }
    if (!pkgName.trim()) return false;

    const uninstallSource = normalizeInstallSource(pkgName);
    const confirmed = await ctx.ui.confirm(
      t("remove.confirm", locale),
      `pi uninstall ${uninstallSource}`
    );

    if (!confirmed) return false;

    showLoading(ctx, `🗑️  ${t("remove.running", locale)} ${pkgName}...`);

    // 用异步子进程执行，避免 execSync 冻结 UI
    const result = await runPiUninstallAsync(pkgName);

    if (result.success) {
      clearLoading(ctx);
      ctx.ui.notify(`✅ ${pkgName} ${t("remove.success", locale)}`, "info");
      clearCatalogCache();
      return true;
    }

    // 如果 pi uninstall 失败，尝试直接从 settings 移除
    updateLoading(ctx, `🗑️  ${t("remove.fallback", locale)} ${pkgName}...`);

    // 给 UI 一点时间渲染
    await sleep(300);

    const removed = removeFromSettings(pkgName);

    clearLoading(ctx);
    if (removed) {
      ctx.ui.notify(`✅ ${pkgName} removed from settings. ${t("remove.success", locale)}`, "info");
      clearCatalogCache();
      return true;
    } else {
      ctx.ui.notify(`❌ ${t("remove.fail", locale)}: Package not found in settings.`, "error");
      return false;
    }
  }

  // ─── 更新 ───────────────────────────────────────────

  async function updatePackages(pkgName: string, ctx: ExtensionCommandContext) {
    if (pkgName) {
      showLoading(ctx, `⬆️  ${t("detail.update", locale)} ${pkgName}...`);
      const result = await runPiInstallAsync(pkgName);
      clearLoading(ctx);
      if (result.success) {
        ctx.ui.notify(`✅ ${pkgName} ${t("update.success", locale)}`, "info");
      } else {
        ctx.ui.notify(`❌ ${t("install.fail", locale)}: ${result.output}`, "error");
      }
      return;
    }

    showLoading(ctx, `🔍 ${t("update.checking", locale)}`);

    const updates = await checkForUpdates();

    clearLoading(ctx);

    const withUpdates = updates.filter((p) => p.hasUpdate);

    if (withUpdates.length === 0) {
      ctx.ui.notify(`✅ ${t("update.all_latest", locale)}`, "info");
      return;
    }

    const items = withUpdates.map(
      (p, i) => {
        const line = `${p.name}: ${p.installedVersion} → ${p.latestVersion}`;
        return i > 0 ? ["", line] : [line];
      }
    ).flat();

    const selected = await ctx.ui.select(
      `${t("update.available", locale)} (${withUpdates.length})`,
      items
    );

    if (!selected) return;

    const nonEmpty = items.filter(it => it !== "");
    const idx = nonEmpty.indexOf(selected);
    if (idx >= 0) {
      const target = withUpdates[idx];
      const confirmed = await ctx.ui.confirm(
        t("detail.update", locale),
        `${target.name}: ${target.installedVersion} → ${target.latestVersion}`
      );
      if (confirmed) {
        showLoading(ctx, `⬆️  ${t("detail.update", locale)} ${target.name}...`);
        const result = await runPiInstallAsync(target.name);
        clearLoading(ctx);
        if (result.success) {
          ctx.ui.notify(`✅ ${target.name} ${t("update.success", locale)}`, "info");
        } else {
          ctx.ui.notify(`❌ ${t("install.fail", locale)}: ${result.output}`, "error");
        }
      }
    }
  }

  // ─── 查看详情 ───────────────────────────────────────

  async function showPackageInfo(pkgName: string, ctx: ExtensionCommandContext) {
    if (!pkgName) {
      pkgName = (await ctx.ui.input(t("detail.version", locale), "package name")) || "";
    }
    if (!pkgName.trim()) return;

    showLoading(ctx, `🔍 ${t("info.loading", locale)} ${pkgName}...`);

    const detail = await getPackageDetail(pkgName);

    clearLoading(ctx);
    if (!detail) {
      ctx.ui.notify(`${t("info.not_found", locale)}: ${pkgName}`, "error");
      return;
    }

    await showPackageDetail(detail, ctx);
  }
}

// ─── Helpers ─────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatMeta(pkg: PackageInfo): string {
  const parts = [pkg.scope, pkg.sourceType].filter(Boolean);
  return parts.length ? `  · ${parts.join("/")}` : "";
}

/** 编号圆圈 1-20 */
function circleNum(n: number): string {
  const circles = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];
  return circles[(n - 1) % 20] || `${n}.`;
}

/** 刷新列表中所有包的安装状态 */
function refreshInstallStatus(items: PackageInfo[]): void {
  const installed = getInstalledPackages();
  const installedNames = new Set(installed.map((p) => p.name));
  for (const item of items) {
    item.installed = installedNames.has(item.name);
    if (item.installed) {
      const found = installed.find((p) => p.name === item.name);
      if (found) {
        item.installedVersion = found.installedVersion;
        item.scope = found.scope;
        item.source = found.source || item.source;
        item.sourceType = found.sourceType || item.sourceType;
      }
    }
  }
}

/** 简易 sleep */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 重复字符 */
function repeatStr(ch: string, n: number): string {
  return Array(n).fill(ch).join("");
}
