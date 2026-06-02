/**
 * pi-packages-manager/index.ts
 *
 * 📦 pi packages 管理器
 *
 * 交互设计（类 Claude Code 风格）：
 *   /packages-list              → 主菜单：已安装 / 浏览社区 / 检查更新
 *   /packages-list list         → 已安装插件列表
 *   /packages-list search       → 浏览社区（分页 + 搜索 + AI 搜索）
 *   /packages-list install xxx  → 安装插件
 *   /packages-list remove xxx   → 卸载插件
 *   /packages-list update [x]   → 检查/更新插件
 *   /packages-list info xxx     → 查看插件详情
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  getInstalledPackages,
  getInstalledPackageRefs,
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
  SUPPORTED_LOCALES,
  t,
} from "./i18n";
import { loadStoredLocale, saveLocale } from "./locale";
import { showPackagesPanel } from "./ui/panel";

const PAGE_SIZE = 8;

export default function pluginManager(pi: ExtensionAPI) {
  // Apply persisted locale (project > global) before reading any UI strings.
  loadStoredLocale(process.cwd());
  let locale = detectLocale();

  pi.registerCommand("packages-list", {
    description: t("command.description", locale),
    getArgumentCompletions: (prefix: string) => {
      const subcommands = [
        { value: "list", label: t("completion.list", locale) },
        { value: "search", label: t("completion.search", locale) },
        { value: "install", label: t("completion.install", locale) },
        { value: "remove", label: t("completion.remove", locale) },
        { value: "update", label: t("completion.update", locale) },
        { value: "info", label: t("completion.info", locale) },
        { value: "settings", label: "settings: view installed package sources" },
        { value: "refresh", label: "Refresh package catalog" },
        { value: "panel", label: "Open Claude-style overlay panel" },
        { value: "legacy", label: "Open the classic select menu" },
      ];
      const filtered = subcommands.filter((s) => s.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      // Re-detect in case it was changed in another panelLoop session.
      locale = detectLocale();
      const parts = (args || "").trim().split(/\s+/);
      const sub = parts[0];
      const rest = parts.slice(1).join(" ");

      // 无子命令 → 默认进入 overlay 面板（Phase 3）。多次开关交互都在 panelLoop 里进行。
      if (!sub) {
        await panelLoop(ctx);
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
        case "settings":
          await showSettings(ctx);
          break;
        case "refresh":
          await refreshCatalog(ctx);
          break;
        case "panel":
          await panelLoop(ctx);
          break;
        case "legacy": {
          let exit = false;
          while (!exit) {
            exit = await showMainMenu(ctx);
          }
          break;
        }
        default:
          ctx.ui.notify(
            `${t("plugin.unknown", locale)}: ${sub}\n${t("plugin.available", locale)}: list, search, install, remove, update, info`,
            "error"
          );
      }
    },
  });

  // ─── 加载提示 ────────────────────────────────────────

  const LOADING_KEY = "pi-packages-manager-loading";

  function showLoading(ctx: ExtensionCommandContext, message: string) {
    ctx.ui.setWidget(LOADING_KEY, [`  ⠋ ${message}`, ""]);
    ctx.ui.setStatus("packages-list", message);
  }

  function updateLoading(ctx: ExtensionCommandContext, message: string) {
    ctx.ui.setWidget(LOADING_KEY, [`  ⠋ ${message}`, ""]);
    ctx.ui.setStatus("packages-list", message);
  }

  function clearLoading(ctx: ExtensionCommandContext) {
    ctx.ui.setWidget(LOADING_KEY, undefined);
    ctx.ui.setStatus("packages-list", undefined);
  }

  // ─── Overlay 面板（Phase 3）────────────────────────────────

  /**
   * 面板主循环。overlay 交互后会返回要执行的动作（详情/搜索/...），动作完成后重新打开面板。
   */
  async function panelLoop(ctx: ExtensionCommandContext) {
    while (true) {
      const result = await showPackagesPanel(ctx, { locale });
      if (!result) return;

      if (result.action === "detail") {
        await showPackageDetail(result.pkg, ctx);
        continue;
      }
      if (result.action === "browse-search") {
        await browseCommunity(ctx);
        continue;
      }
      if (result.action === "settings-config") {
        ctx.ui.notify(t("settings.tip.config", locale), "info");
        continue;
      }
      if (result.action === "change-locale") {
        saveLocale(result.locale);
        locale = result.locale;
        const labelEntry = SUPPORTED_LOCALES.find((entry) => entry.code === result.locale);
        const label = labelEntry?.label ?? result.locale;
        ctx.ui.notify(
          `${t("settings.locale.changed", result.locale)} ${label}`,
          "success",
        );
        continue;
      }
    }
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
      `🔍 Search packages`,
      "",
      `🏪 ${t("browse.title", locale)}`,
      "",
      `⬆️  ${t("menu.update", locale)}`,
      "",
      `⚙️  Settings`,
      "",
      `🔄 Refresh catalog`,
    ];

    const choice = await ctx.ui.select(t("menu.title", locale), options);

    if (!choice) return true;  // Esc → 退出

    if (choice.includes(t("menu.installed", locale))) {
      await listInstalled(ctx);
    } else if (choice.includes("Search packages")) {
      await browseCommunity(ctx);
    } else if (choice.includes(t("browse.title", locale)) || choice.includes("Community") || choice.includes("社区") || choice.includes("社群") || choice.includes("コミュニティ") || choice.includes("커뮤니티")) {
      await browseCommunity(ctx, "");
    } else if (choice.includes(t("menu.update", locale))) {
      await updatePackages("", ctx);
    } else if (choice.includes("Settings")) {
      await showSettings(ctx);
    } else if (choice.includes("Refresh catalog")) {
      await refreshCatalog(ctx);
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
    const info = detail
      ? { ...pkg, ...detail, downloads: detail.downloads ?? pkg.downloads, searchScore: pkg.searchScore, searchReasons: pkg.searchReasons }
      : pkg;

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
    lines.push(...formatResourceSummary(info.piManifest));
    lines.push(...formatSecuritySummary(info));
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
    const scopeChoice = await ctx.ui.select("Install scope", [
      "🌍 Global — available in all Pi projects",
      "📁 Project — write to this project's .pi/settings.json",
      "Cancel",
    ]);
    if (!scopeChoice || scopeChoice === "Cancel") return;

    const scope = scopeChoice.includes("Project") ? "project" : "user";
    const command = scope === "project" ? `pi install ${installSource} -l` : `pi install ${installSource}`;
    const confirmed = await ctx.ui.confirm(
      t("install.confirm", locale),
      [
        command,
        "",
        "Security: Pi packages may run arbitrary code on your machine.",
        "Only install packages from sources you trust.",
      ].join("\n")
    );

    if (!confirmed) return;

    showLoading(ctx, `📥 ${t("install.running", locale)} ${pkgName}...`);

    const result = await runPiInstallAsync(pkgName, scope);

    clearLoading(ctx);
    if (result.success) {
      ctx.ui.notify(`✅ ${pkgName} ${t("install.success", locale)}\nRun /reload or restart Pi to activate new resources.`, "info");
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

    const installedRefs = findInstalledRefsForPackage(pkgName);
    const selectedRef = await chooseRemovalTarget(pkgName, installedRefs, ctx);
    if (!selectedRef) return false;

    const uninstallSource = selectedRef.ref;
    const command = selectedRef.scope === "project" ? `pi uninstall ${uninstallSource} -l` : `pi uninstall ${uninstallSource}`;
    const confirmed = await ctx.ui.confirm(
      t("remove.confirm", locale),
      [
        command,
        "",
        `Scope: ${selectedRef.scope}`,
        "This removes the package reference from settings. Installed cache files may remain.",
      ].join("\n")
    );

    if (!confirmed) return false;

    showLoading(ctx, `🗑️  ${t("remove.running", locale)} ${pkgName}...`);

    // 用异步子进程执行，避免 execSync 冻结 UI
    const result = await runPiUninstallAsync(uninstallSource, selectedRef.scope);

    if (result.success) {
      clearLoading(ctx);
      ctx.ui.notify(`✅ ${pkgName} ${t("remove.success", locale)}\nRun /reload or restart Pi to unload removed resources.`, "info");
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
      const target = findInstalledRefsForPackage(pkgName)[0];
      const scope = target?.scope === "project" ? "project" : "user";
      showLoading(ctx, `⬆️  ${t("detail.update", locale)} ${pkgName}...`);
      const result = await runPiInstallAsync(pkgName, scope);
      clearLoading(ctx);
      if (result.success) {
        ctx.ui.notify(`✅ ${pkgName} ${t("update.success", locale)}\nRun /reload or restart Pi to activate updated resources.`, "info");
        clearCatalogCache();
      } else {
        ctx.ui.notify(`❌ ${t("install.fail", locale)}: ${result.output}`, "error");
      }
      return;
    }

    showLoading(ctx, `🔍 ${t("update.checking", locale)}`);

    const updates = await checkForUpdates();

    clearLoading(ctx);

    const withUpdates = updates.filter((p) => p.hasUpdate);
    const skipped = updates.filter((p) => !p.hasUpdate && (p.pinned || p.skipReason));

    if (withUpdates.length === 0) {
      const skippedLines = skipped.map((p) => `• ${p.name} — ${p.skipReason || "skipped"}`);
      const message = [t("update.all_latest", locale)];
      if (skippedLines.length) {
        message.push("", "Skipped:", ...skippedLines);
      }
      ctx.ui.notify(`✅ ${message.join("\n")}`, "info");
      return;
    }

    const items: string[] = [];
    items.push(`⬆️  Update all (${withUpdates.length})`);

    withUpdates.forEach((pkg) => {
      items.push("");
      const meta = formatMeta(pkg);
      items.push(`${pkg.name}: ${pkg.installedVersion} → ${pkg.latestVersion}${meta}`);
    });

    if (skipped.length) {
      items.push("");
      items.push(`Skipped (${skipped.length})`);
      skipped.forEach((pkg) => {
        items.push("");
        items.push(`• ${pkg.name}${formatMeta(pkg)} — ${pkg.skipReason || "skipped"}`);
      });
    }

    const selected = await ctx.ui.select(
      `${t("update.available", locale)} (${withUpdates.length})`,
      items,
    );

    if (!selected) return;

    if (selected.startsWith("⬆️  Update all")) {
      const confirmed = await ctx.ui.confirm(
        "Update all",
        `Run pi install for ${withUpdates.length} package(s)?`,
      );
      if (!confirmed) return;

      let succeeded = 0;
      const failures: string[] = [];
      for (const target of withUpdates) {
        showLoading(ctx, `⬆️  ${t("detail.update", locale)} ${target.name}...`);
        const scope = target.scope === "project" ? "project" : "user";
        const result = await runPiInstallAsync(target.name, scope);
        if (result.success) succeeded += 1;
        else failures.push(`${target.name}: ${result.output}`);
      }
      clearLoading(ctx);
      clearCatalogCache();
      const summary = [
        `✅ Updated ${succeeded}/${withUpdates.length} package(s)`,
        "Run /reload or restart Pi to activate updated resources.",
      ];
      if (failures.length) summary.push("", "Failures:", ...failures);
      ctx.ui.notify(summary.join("\n"), failures.length ? "error" : "info");
      return;
    }

    if (selected.startsWith("Skipped") || selected.startsWith("•")) return;

    const target = withUpdates.find((pkg) => selected.startsWith(`${pkg.name}: `));
    if (!target) return;

    const confirmed = await ctx.ui.confirm(
      t("detail.update", locale),
      `${target.name}: ${target.installedVersion} → ${target.latestVersion}`,
    );
    if (!confirmed) return;

    showLoading(ctx, `⬆️  ${t("detail.update", locale)} ${target.name}...`);
    const scope = target.scope === "project" ? "project" : "user";
    const result = await runPiInstallAsync(target.name, scope);
    clearLoading(ctx);
    if (result.success) {
      ctx.ui.notify(`✅ ${target.name} ${t("update.success", locale)}\nRun /reload or restart Pi to activate updated resources.`, "info");
      clearCatalogCache();
    } else {
      ctx.ui.notify(`❌ ${t("install.fail", locale)}: ${result.output}`, "error");
    }
  }

  // ─── 刷新目录 ───────────────────────────────────────

  async function refreshCatalog(ctx: ExtensionCommandContext) {
    const confirmed = await ctx.ui.confirm(
      "Refresh package catalog",
      "Clear local catalog cache and fetch the latest Pi packages from npm registry?"
    );
    if (!confirmed) return;

    showLoading(ctx, "🔄 Refreshing package catalog...");
    try {
      clearCatalogCache();
      const items = await fetchFullCatalog(250, true);
      clearLoading(ctx);
      ctx.ui.notify(`✅ Catalog refreshed: ${items.length} packages`, "info");
    } catch (err) {
      clearLoading(ctx);
      ctx.ui.notify(`❌ Refresh failed: ${(err as Error).message}`, "error");
    }
  }

  // ─── 设置 ───────────────────────────────────────

  async function showSettings(ctx: ExtensionCommandContext) {
    while (true) {
      const refs = getInstalledPackageRefs();
      const installed = getInstalledPackages();
      const installedByName = new Map(installed.map((p) => [p.name, p]));

      const userRefs = refs.filter((r) => r.scope === "user");
      const projectRefs = refs.filter((r) => r.scope === "project");

      const items: string[] = [];
      const entries: Array<{ ref: typeof refs[number]; pkg: PackageInfo | undefined }> = [];

      const pushGroup = (title: string, group: typeof refs) => {
        if (group.length === 0) return;
        if (items.length > 0) items.push("");
        items.push(title);
        group.forEach((ref) => {
          const pkg = installedByName.get(refToName(ref.ref));
          const pinned = isPinned(ref.ref) ? " 🔒" : "";
          const sourceType = pkg?.sourceType || sourceTypeOf(ref.ref);
          const types = pkg?.types?.length ? ` [${pkg.types.join(", ")}]` : "";
          const version = pkg?.installedVersion ? `  v${pkg.installedVersion}` : "";
          items.push("");
          items.push(`• ${ref.ref}${pinned}${version}${types}  — ${sourceType}`);
          entries.push({ ref, pkg });
        });
      };

      pushGroup(`🌍 Global  (${userRefs.length})`, userRefs);
      pushGroup(`📁 Project  (${projectRefs.length})`, projectRefs);

      if (refs.length === 0) {
        items.push("No packages found in user or project settings.");
      }

      items.push("");
      items.push("——————————————————————————————");
      items.push("");
      items.push("🛠  Configure resources (run pi config in terminal)");
      items.push("");
      items.push("🔄 Refresh catalog");
      items.push("");
      items.push("↩️  Back");

      const subtitle = [
        `Global settings: ~/.pi/agent/settings.json`,
        `Project settings: ${process.cwd()}/.pi/settings.json`,
      ].join("\n");
      const selected = await ctx.ui.select(`Settings\n${subtitle}`, items);
      if (!selected || selected.includes("Back")) return;

      if (selected.includes("Configure resources")) {
        ctx.ui.notify(
          [
            "Run `pi config` in your terminal to enable or disable extensions, skills, prompts, and themes.",
            "This launches Pi's interactive resource configurator.",
          ].join("\n"),
          "info",
        );
        continue;
      }

      if (selected.includes("Refresh catalog")) {
        await refreshCatalog(ctx);
        continue;
      }

      const matchedEntry = entries.find((e) => selected.startsWith(`• ${e.ref.ref}`));
      if (!matchedEntry) continue;

      const pkg = matchedEntry.pkg;
      if (pkg) {
        await showPackageDetail(pkg, ctx);
      } else {
        const proceed = await ctx.ui.confirm(
          "Remove broken package",
          `Package ${matchedEntry.ref.ref} is in settings but not installed on disk.\nRemove it from settings?`,
        );
        if (proceed) {
          const removed = removeFromSettings(matchedEntry.ref.ref);
          ctx.ui.notify(removed ? `✅ Removed ${matchedEntry.ref.ref} from settings.` : `❌ Could not remove ${matchedEntry.ref.ref}.`, removed ? "info" : "error");
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

type InstalledRef = { ref: string; scope: "user" | "project" };

function refToName(ref: string): string {
  if (ref.startsWith("npm:")) {
    const rest = ref.slice(4);
    if (rest.startsWith("@")) {
      const at = rest.indexOf("@", 1);
      return at > 0 ? rest.slice(0, at) : rest;
    }
    return rest.includes("@") ? rest.slice(0, rest.indexOf("@")) : rest;
  }
  if (ref.startsWith("git:") || /^(https?:\/\/|ssh:\/\/)/.test(ref)) {
    const stripped = ref.replace(/^git:/, "").replace(/^(https?:\/\/|ssh:\/\/)/, "");
    return stripped.split("@")[0];
  }
  return ref;
}

function isPinned(ref: string): boolean {
  if (ref.startsWith("npm:")) {
    const rest = ref.slice(4);
    if (rest.startsWith("@")) return rest.indexOf("@", 1) > 0;
    return rest.includes("@");
  }
  if (ref.startsWith("git:") || /^(https?:\/\/|ssh:\/\/)/.test(ref)) {
    const stripped = ref.replace(/^git:/, "").replace(/^(https?:\/\/|ssh:\/\/)/, "");
    return stripped.includes("@");
  }
  return false;
}

function sourceTypeOf(ref: string): string {
  if (ref.startsWith("npm:")) return "npm";
  if (ref.startsWith("git:") || /^(https?:\/\/|ssh:\/\/)/.test(ref)) return "git";
  if (ref.startsWith("file:") || ref.startsWith("./") || ref.startsWith("../") || ref.startsWith("/")) return "local";
  return "unknown";
}

function findInstalledRefsForPackage(pkgName: string): InstalledRef[] {
  const normalized = normalizeInstallSource(pkgName);
  const npmName = normalized.startsWith("npm:") ? normalized.slice(4) : null;
  return getInstalledPackageRefs().filter(({ ref }) => {
    if (ref === normalized || ref === pkgName) return true;
    return Boolean(npmName && ref === `npm:${npmName}`);
  });
}

async function chooseRemovalTarget(
  pkgName: string,
  refs: InstalledRef[],
  ctx: ExtensionCommandContext,
): Promise<InstalledRef | null> {
  if (refs.length === 1) return refs[0];

  const fallback = { ref: normalizeInstallSource(pkgName), scope: "user" as const };
  if (refs.length === 0) {
    const proceed = await ctx.ui.confirm(
      "Remove package",
      `Package source was not found in settings. Try global removal anyway?\n\npi uninstall ${fallback.ref}`,
    );
    return proceed ? fallback : null;
  }

  const options = refs.flatMap((item, index) => {
    const label = `${item.scope === "project" ? "📁 Project" : "🌍 Global"} — ${item.ref}`;
    return index === 0 ? [label] : ["", label];
  });
  options.push("", "Cancel");

  const selected = await ctx.ui.select("Remove from which scope?", options);
  if (!selected || selected === "Cancel") return null;

  const nonEmpty = options.filter((item) => item !== "" && item !== "Cancel");
  const idx = nonEmpty.indexOf(selected);
  return idx >= 0 ? refs[idx] : null;
}

function formatResourceSummary(piManifest?: Record<string, unknown>): string[] {
  if (!piManifest || Object.keys(piManifest).length === 0) return [];

  const lines = ["", "Resources:"];
  const resources = [
    ["extensions", "Extensions"],
    ["skills", "Skills"],
    ["prompts", "Prompts"],
    ["themes", "Themes"],
  ] as const;

  for (const [key, label] of resources) {
    const value = piManifest[key];
    const count = Array.isArray(value) ? value.length : value ? 1 : 0;
    if (count > 0) lines.push(`  ${label}: ${count}`);
  }

  return lines.length > 2 ? lines : [];
}

function formatSecuritySummary(pkg: PackageInfo): string[] {
  const lines = ["", "Security:"];
  if (pkg.sourceType === "npm") lines.push("  Source: npm registry");
  else if (pkg.sourceType === "git") lines.push("  Source: git/remote repository");
  else if (pkg.sourceType === "local") lines.push("  Source: local path");
  else lines.push("  Source: unknown");

  if (pkg.source?.match(/@\d+\.\d+\.\d+$/) || pkg.source?.includes("@v")) {
    lines.push("  Pinned: yes");
  }
  lines.push("  Note: Pi packages may run arbitrary code. Review trusted sources before installing.");
  return lines;
}

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
