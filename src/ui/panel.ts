/**
 * pi-packages-manager/ui/panel.ts
 *
 * Claude-style overlay panel for the packages manager.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │  📦 Pi Packages Manager                      │
 *   │  [Installed]  Browse  Updates  Settings      │
 *   │  [All] extension skill prompt theme           │
 *  ├──────────────────────────────────────────────┤
 *   │  🔍 search or press /                        │
 *   │                                              │
 *   │  ● pi-tinyfish-tools                  v0.1   │
 *   │    TinyFish 网页代理工具                     │
 *   │    extension·skill · user · npm              │
 *   ├──────────────────────────────────────────────┤
 *   │  Tab/⇧Tab · ↑↓ · ↵ detail · / 🔍 · ? help  │
 *   └──────────────────────────────────────────────┘
 *
 * v1.2.0 adds:
 *   - Quick shortcuts: i=install, r=remove, u=update, ?=help overlay
 *   - Filter chips: [All] [extension] [skill] [prompt] [theme]
 *   - Inline detail view (Enter opens detail without closing panel)
 *   - Loading/empty state improvements
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  DynamicBorder,
  getMarkdownTheme,
} from "@earendil-works/pi-coding-agent";
import {
  Box,
  Container,
  Input,
  Key,
  Markdown,
  matchesKey,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import {
  checkForUpdates,
  fetchFullCatalog,
  getCatalogCacheInfo,
  getInstalledPackages,
  searchNpmRegistry,
  type PackageInfo,
} from "../api";
import {
  formatRelativeTime,
  getTranslatedDescription,
  localizeType,
  type Locale,
  SUPPORTED_LOCALES,
  t,
} from "../i18n";
import { getLocaleSource } from "../locale";
import { rankPackages } from "../search";
import { auditPackage, RISK_BADGE } from "../security";
import { PackageList, type PackageListItem } from "./package-list";

const TAB_KEYS = ["installed", "browse", "updates", "settings"] as const;
type TabKey = typeof TAB_KEYS[number];

const FILTER_ALL = "all";
const FILTER_TYPES = ["extension", "skill", "prompt", "theme"] as const;
type FilterType = typeof FILTER_TYPES[number] | "all";

export type PanelResult =
  | { action: "detail"; pkg: PackageInfo }
  | { action: "browse-search" }
  | { action: "settings-config" }
  | { action: "settings-refresh-catalog" }
  | { action: "settings-clear-catalog" }
  | { action: "settings-reset" }
  | { action: "change-locale"; locale: Locale }
  | null;

interface PanelOptions {
  initialTab?: TabKey;
  locale: Locale;
}

export async function showPackagesPanel(
  ctx: ExtensionCommandContext,
  options: PanelOptions,
): Promise<PanelResult> {
  const { initialTab = "installed", locale } = options;

  return ctx.ui.custom<PanelResult>((tui, theme, _kb, done) => {
    let currentTab: TabKey = initialTab;
    let currentPkgs: PackageInfo[] = [];
    let unfilteredPkgs: PackageInfo[] = [];
    let cachedCatalog: PackageInfo[] | null = null;
    let cachedUpdates: PackageInfo[] | null = null;
    let focusTarget: "search" | "list" = "list";
    let activeFilter: FilterType = FILTER_ALL;
    let showHelp = false;

    // Inline detail view state
    let detailPkg: PackageInfo | null = null;
    let detailAudit: Awaited<ReturnType<typeof auditPackage>> | null = null;
    let detailLoading = false;

    let dismissed = false;
    const safeDone = (result: PanelResult) => {
      if (dismissed) return;
      dismissed = true;
      done(result);
    };

    const container = new Container();
    let list: PackageList | null = null;
    let langSelector: SelectList | null = null;

    const mainComponent = {
      render(w: number) { return container.render(w); },
      invalidate() { container.invalidate(); },
      handleInput(d: string) { handleInputImpl(d); },
    };

    // ─── Search input ─────────────────────────────────

    const searchInput = new Input();
    searchInput.onSubmit = () => {
      focusTarget = "list";
      searchInput.focused = false;
      rebuild();
      tui.requestRender();
    };
    searchInput.onEscape = () => {
      if (searchInput.getValue()) {
        searchInput.setValue("");
        applySearch("");
        focusTarget = "list";
        searchInput.focused = false;
        rebuild();
        tui.requestRender();
      } else {
        focusTarget = "list";
        searchInput.focused = false;
        rebuild();
        tui.requestRender();
      }
    };

    // ─── Theme helpers ───────────────────────────────

    function listTheme() {
      return {
        selectedTitle: (s: string) => theme.fg("accent", theme.bold(s)),
        title: (s: string) => theme.fg("text", s),
        badge: (s: string) => theme.fg("success", s),
        description: (s: string) => theme.fg("muted", s),
        meta: (s: string) => theme.fg("dim", s),
        scrollInfo: (s: string) => theme.fg("dim", s),
        empty: (s: string) => theme.fg("muted", s),
        bullet: (s: string) => theme.fg("muted", s),
        selectedBullet: (s: string) => theme.fg("accent", s),
      };
    }

    // ─── Rebuild ─────────────────────────────────────

    function rebuild() {
      container.clear();

      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
      container.addChild(new Text(theme.fg("accent", theme.bold("📦 " + t("menu.title", locale))), 1, 0));
      container.addChild(new Text(buildTabBar(theme, currentTab, locale), 1, 0));

      // Help overlay (toggled by ?)
      if (showHelp) {
        container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));
        renderHelpOverlay();
        container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));
        container.addChild(new Text(theme.fg("dim", "Press ? or Esc to close help"), 1, 0));
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        return;
      }

      container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));

      if (currentTab === "settings") {
        renderSettingsTab();
      } else if (detailPkg) {
        renderDetailView();
      } else {
        // Filter chips (only for package tabs)
        renderFilterChips();
        container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));
        preparePackageData();
        renderSearchBar();
        container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));
        renderPackageList();
      }

      container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));
      container.addChild(new Text(theme.fg("dim", buildHelpBar(currentTab, locale, focusTarget, !!detailPkg)), 1, 0));
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    }

    // ─── Filter chips ────────────────────────────────

    function renderFilterChips() {
      const chips = [
        { key: FILTER_ALL as string, label: "All", shortcut: "1" },
        ...FILTER_TYPES.map((tp, i) => ({
          key: tp,
          label: localizeType(tp, locale),
          shortcut: String(i + 2),
        })),
      ];

      const parts = chips.map((chip) => {
        const isActive = activeFilter === chip.key;
        const styled = isActive
          ? theme.fg("accent", theme.bold(`[${chip.label}]`))
          : theme.fg("dim", ` ${chip.label} `);
        return `${styled}${theme.fg("dim", chip.shortcut)}`;
      });

      container.addChild(new Text("  " + parts.join("  ") + " ", 0, 0));
    }

    function applyFilter() {
      // First apply search, then filter by type
      const query = searchInput.getValue();
      let base = unfilteredPkgs;

      if (query) {
        if (currentTab === "browse") {
          base = rankPackages(unfilteredPkgs, query, 60);
        } else {
          const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
          base = unfilteredPkgs.filter((pkg) => {
            const text = `${pkg.name} ${pkg.description || ""} ${(pkg.keywords || []).join(" ")} ${pkg.author || ""}`.toLowerCase();
            return terms.every((term) => text.includes(term));
          });
        }
      }

      if (activeFilter === FILTER_ALL) {
        currentPkgs = base;
      } else {
        currentPkgs = base.filter((pkg) =>
          pkg.types?.includes(activeFilter) ?? false,
        );
      }
    }

    // ─── Search bar ──────────────────────────────────

    function renderSearchBar() {
      const query = searchInput.getValue();
      const isActive = focusTarget === "search";

      if (isActive) {
        searchInput.focused = true;
        const searchBox = new Box(1, 0, (s: string) => theme.fg("accent", theme.bold(s)));
        searchBox.addChild(searchInput);
        container.addChild(searchBox);
      } else if (query) {
        searchInput.focused = false;
        const resultCount = currentPkgs.length;
        const totalCount = unfilteredPkgs.length;
        const pill = theme.fg("accent", theme.bold(" 🔍 ")) +
          theme.fg("text", truncateToWidth(query, 20, "…")) +
          theme.fg("dim", ` — ${resultCount}/${totalCount}`) +
          theme.fg("muted", `  [press / to edit]`);
        container.addChild(new Text(pill, 0, 0));
      } else {
        searchInput.focused = false;
        const hint = theme.fg("dim", "  🔍 ") +
          theme.fg("muted", t("search.placeholder", locale)) +
          theme.fg("dim", "  [press /]");
        container.addChild(new Text(hint, 0, 0));
      }
    }

    // ─── Package list ────────────────────────────────

    function preparePackageData() {
      langSelector = null;
      const pkgs = collectPackages(currentTab, cachedCatalog, cachedUpdates);
      unfilteredPkgs = pkgs;
      applyFilter();
    }

    function renderPackageList() {
      const items = currentPkgs.map((p) => packageToListItem(p, locale));
      list = new PackageList(items, 4, listTheme(), {
        emptyLabel: emptyMessage(currentTab, locale),
      });
      list.onSelect = (item) => {
        // v1.2.0: open inline detail instead of closing panel
        const pkg = currentPkgs.find((p) => p.name === item.value);
        if (pkg) openDetail(pkg);
      };
      list.onCancel = () => safeDone(null);
      container.addChild(list);
    }

    // ─── Inline detail view ──────────────────────────

    async function openDetail(pkg: PackageInfo) {
      detailPkg = pkg;
      detailAudit = null;
      detailLoading = true;
      focusTarget = "list";
      rebuild();
      tui.requestRender();

      // Fetch fresh detail from npm in background
      try {
        const { getPackageDetail } = await import("../api");
        const fresh = await getPackageDetail(pkg.name);
        if (fresh && !dismissed) {
          detailPkg = { ...pkg, ...fresh, downloads: fresh.downloads ?? pkg.downloads };
        }
      } catch {
        // use local data
      }

      detailLoading = false;
      if (!dismissed) {
        rebuild();
        tui.requestRender();
      }
    }

    function closeDetail() {
      detailPkg = null;
      detailAudit = null;
      detailLoading = false;
      rebuild();
      tui.requestRender();
    }

    function renderDetailView() {
      list = null;
      const pkg = detailPkg!;
      const info = pkg;

      const status = info.installed
        ? theme.fg("success", `✅ ${t("detail.installed", locale)} (v${info.installedVersion || info.version})`)
        : theme.fg("muted", `⬜ ${t("detail.not_installed", locale)}`);

      const hasUpdate = info.latestVersion && info.installedVersion && info.latestVersion !== info.installedVersion;

      const lines: string[] = [];
      lines.push(`  📦 ${theme.fg("accent", theme.bold(info.name))}`);
      lines.push(`  ${theme.fg("muted", info.description || "")}`);
      lines.push(`  ${status}`);

      if (hasUpdate) {
        lines.push(`  ${theme.fg("warning", `⬆️  ${info.installedVersion} → ${info.latestVersion}`)}`);
      }
      if (info.author) lines.push(`  ${theme.fg("dim", `${t("detail.author", locale)}: ${info.author}`)}`);
      if (info.license) lines.push(`  ${theme.fg("dim", `${t("detail.license", locale)}: ${info.license}`)}`);
      if (info.types?.length) lines.push(`  ${theme.fg("dim", `${t("detail.types", locale)}: ${info.types.map((tp) => localizeType(tp, locale)).join(", ")}`)}`);
      if (info.downloads) lines.push(`  ${theme.fg("dim", `${t("detail.downloads", locale)}: ${formatNumber(info.downloads)}/mo`)}`);
      if (info.npmUrl) lines.push(`  ${theme.fg("dim", `npm: ${info.npmUrl}`)}`);

      // Audit result
      if (detailAudit) {
        lines.push("");
        lines.push(`  ${theme.fg("accent", `🔒 ${RISK_BADGE[detailAudit.overallRisk]}`)}`);
        lines.push(`  ${theme.fg("dim", `Version: ${detailAudit.version}`)}`);
        lines.push(`  ${theme.fg("dim", detailAudit.summary.split("\n")[0])}`);
        if (detailAudit.findings.length > 0) {
          lines.push(`  ${theme.fg("dim", `Findings: ${detailAudit.findings.length} pattern(s) detected`)}`);
        }
      } else if (detailLoading) {
        lines.push(`  ${theme.fg("dim", "⠋ Loading details...")}`);
      }

      for (const line of lines) {
        container.addChild(new Text(line, 0, 0));
      }

      // v1.2.2: README inline rendering
      if (info.readme) {
        container.addChild(new Spacer(1));
        container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));
        container.addChild(new Text(theme.fg("dim", `  📖 ${t("detail.readme", locale)}`), 0, 0));
        try {
          const mdTheme = getMarkdownTheme();
          container.addChild(new Markdown(info.readme, 1, 0, mdTheme));
        } catch {
          // Markdown component unavailable — fall back to plain text
          const previewLines = info.readme.split("\n").slice(0, 30);
          for (const ln of previewLines) {
            container.addChild(new Text(`  ${theme.fg("muted", ln)}`, 0, 0));
          }
        }
      } else if (!detailLoading) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("dim", `  📖 ${t("detail.no_readme", locale)}`), 0, 0));
      }

      // Action buttons
      container.addChild(new Spacer(1));
      const actionParts: string[] = [];

      if (!detailAudit) {
        actionParts.push(theme.fg("accent", "  [a] Audit"));
      } else {
        actionParts.push(theme.fg("accent", "  [a] Re-audit"));
      }

      if (info.installed) {
        if (hasUpdate) actionParts.push(theme.fg("warning", "  [u] Update"));
        actionParts.push(theme.fg("error", "  [r] Remove"));
      } else {
        actionParts.push(theme.fg("success", "  [i] Install"));
      }
      actionParts.push(theme.fg("dim", "  [←] Back"));

      container.addChild(new Text(actionParts.join(""), 0, 0));
    }

    // ─── Help overlay ────────────────────────────────

    function renderHelpOverlay() {
      const lines = [
        theme.fg("accent", theme.bold("  ⌨  Keyboard shortcuts")),
        "",
        theme.fg("text", "  Navigation") + theme.fg("dim", "─────────────────────────"),
        theme.fg("dim", "  Tab / ⇧Tab     Switch tabs"),
        theme.fg("dim", "  ↑ / ↓          Navigate list"),
        theme.fg("dim", "  Enter           Open detail view"),
        theme.fg("dim", "  Esc / q         Close panel"),
        "",
        theme.fg("text", "  Search & Filter") + theme.fg("dim", "─────────────────────"),
        theme.fg("dim", "  /               Focus search bar"),
        theme.fg("dim", "  1-5             Filter by type"),
        theme.fg("dim", "                  1=All 2=ext 3=skill 4=prompt 5=theme"),
        "",
        theme.fg("text", "  Actions") + theme.fg("dim", "─────────────────────────────"),
        theme.fg("dim", "  i               Install selected package"),
        theme.fg("dim", "  r               Remove selected package"),
        theme.fg("dim", "  u               Update selected package"),
        theme.fg("dim", "  a               Run security audit"),
        "",
        theme.fg("text", "  Detail View") + theme.fg("dim", "─────────────────────────"),
        theme.fg("dim", "  ← / Backspace   Back to list"),
        theme.fg("dim", "  Esc             Close panel"),
      ];

      for (const line of lines) {
        container.addChild(new Text(line, 0, 0));
      }
    }

    // ─── Settings tab ────────────────────────────────

    function renderSettingsTab() {
      list = null;

      // === J4: 当前生效的偏好来源 ===
      const localeSource = getLocaleSource();
      const sourceLabel = t(`settings.locale.source.${localeSource.source}`, locale);
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(
          theme.fg("dim", "  " + t("settings.locale.source", locale, { source: sourceLabel })),
          1,
          0,
        ),
      );

      container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));

      // === 语言区 ===
      container.addChild(
        new Text(theme.fg("accent", theme.bold("  🌐 " + t("settings.section.language", locale))), 1, 0),
      );

      const langItems: SelectItem[] = SUPPORTED_LOCALES.map((entry) => ({
        value: entry.code,
        label: entry.code === locale ? `${entry.label}  ✓` : entry.label,
        description: entry.code,
      }));

      langSelector = new SelectList(langItems, Math.min(langItems.length, 6), {
        selectedPrefix: (s: string) => theme.fg("accent", s),
        selectedText: (s: string) => theme.fg("accent", s),
        description: (s: string) => theme.fg("dim", s),
        scrollInfo: (s: string) => theme.fg("dim", s),
        noMatch: (s: string) => theme.fg("warning", s),
      });
      langSelector.onSelect = (item) => {
        if (item.value !== locale) {
          safeDone({ action: "change-locale", locale: item.value });
        }
      };
      langSelector.onCancel = () => safeDone(null);
      container.addChild(langSelector);

      container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));

      // === J1: 目录缓存区 ===
      const cacheInfo = getCatalogCacheInfo();
      container.addChild(
        new Text(theme.fg("accent", theme.bold("  📦 " + t("settings.section.cache", locale))), 1, 0),
      );
      const cacheStatusText = cacheInfo.cached
        ? t("settings.cache.cached", locale, {
            count: cacheInfo.count,
            age: formatRelativeTime(cacheInfo.fetchedAt!, locale),
          })
        : t("settings.cache.empty", locale);
      container.addChild(
        new Text(theme.fg("dim", `  ${t("settings.cache.status", locale)}: ${cacheStatusText}`), 1, 0),
      );
      // 快捷键提示行
      container.addChild(
        new Text(
          theme.fg("muted", `  ${t("settings.cache.refresh", locale)}    ${t("settings.cache.clear", locale)}`),
          1,
          0,
        ),
      );

      container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));

      // === J3: 偏好区 ===
      container.addChild(
        new Text(theme.fg("accent", theme.bold("  ⚙️  " + t("settings.section.preferences", locale))), 1, 0),
      );
      container.addChild(
        new Text(theme.fg("muted", "  " + t("settings.preferences.reset", locale)), 1, 0),
      );

      container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));

      // === 提示区 ===
      container.addChild(
        new Text(theme.fg("accent", theme.bold("  💡 " + t("settings.section.tip", locale))), 1, 0),
      );
      container.addChild(
        new Text(theme.fg("muted", "  " + t("settings.tip.config", locale)), 1, 0),
      );
      container.addChild(new Spacer(1));
    }

    // ─── Async loaders ───────────────────────────────

    async function loadBrowse() {
      try {
        cachedCatalog = await fetchFullCatalog();
      } catch {
        cachedCatalog = [];
      }
      if (dismissed) return;
      if (currentTab === "browse" && !detailPkg) {
        rebuild();
        tui.requestRender();
      }
    }

    async function loadUpdates() {
      try {
        cachedUpdates = await checkForUpdates();
      } catch {
        cachedUpdates = [];
      }
      if (dismissed) return;
      if (currentTab === "updates" && !detailPkg) {
        rebuild();
        tui.requestRender();
      }
    }

    // ─── Tab switching ───────────────────────────────

    function switchTab(direction: 1 | -1) {
      const idx = TAB_KEYS.indexOf(currentTab);
      const next = TAB_KEYS[(idx + direction + TAB_KEYS.length) % TAB_KEYS.length];
      currentTab = next;
      searchInput.setValue("");
      focusTarget = "list";
      searchInput.focused = false;
      activeFilter = FILTER_ALL;
      detailPkg = null;
      detailAudit = null;
      rebuild();
      tui.requestRender();
      if (next === "browse" && cachedCatalog === null) {
        cachedCatalog = [];
        loadBrowse();
      }
      if (next === "updates" && cachedUpdates === null) {
        cachedUpdates = [];
        loadUpdates();
      }
    }

    // ─── Search ──────────────────────────────────────

    function applySearch(query: string) {
      if (!query) {
        currentPkgs = unfilteredPkgs;
        applyFilter();
        return;
      }
      applyFilter();
    }

    // ─── Quick action handlers ───────────────────────

    async function handleQuickInstall() {
      const pkg = getSelectedPkg();
      if (!pkg) return;
      safeDone({ action: "detail", pkg });
    }

    async function handleQuickRemove() {
      const pkg = getSelectedPkg();
      if (!pkg || !pkg.installed) return;
      safeDone({ action: "detail", pkg });
    }

    async function handleQuickUpdate() {
      const pkg = getSelectedPkg();
      if (!pkg || !pkg.installed) return;
      safeDone({ action: "detail", pkg });
    }

    async function handleQuickAudit() {
      if (detailPkg) {
        // Audit from detail view
        detailLoading = true;
        rebuild();
        tui.requestRender();
        try {
          detailAudit = await auditPackage(detailPkg.name, { deepScan: true });
        } catch {
          detailAudit = null;
        }
        detailLoading = false;
        if (!dismissed) {
          rebuild();
          tui.requestRender();
        }
        return;
      }

      // Audit from list view
      const pkg = getSelectedPkg();
      if (!pkg) return;
      await openDetail(pkg);
      // Then auto-trigger audit
      detailLoading = true;
      rebuild();
      tui.requestRender();
      try {
        detailAudit = await auditPackage(pkg.name, { deepScan: true });
      } catch {
        detailAudit = null;
      }
      detailLoading = false;
      if (!dismissed) {
        rebuild();
        tui.requestRender();
      }
    }

    function getSelectedPkg(): PackageInfo | null {
      if (detailPkg) return detailPkg;
      const selected = list?.getSelected();
      if (!selected) return null;
      return currentPkgs.find((p) => p.name === selected.value) || null;
    }

    // ─── Build & init ────────────────────────────────

    rebuild();

    if (initialTab === "browse" && cachedCatalog === null) {
      cachedCatalog = [];
      loadBrowse();
    }
    if (initialTab === "updates" && cachedUpdates === null) {
      cachedUpdates = [];
      loadUpdates();
    }

    // ─── Input handling ──────────────────────────────

    function handleInputImpl(data: string) {
      // Help overlay
      if (showHelp) {
        if (data === "?" || matchesKey(data, Key.escape)) {
          showHelp = false;
          rebuild();
          tui.requestRender();
        }
        return;
      }

      // Toggle help
      if (data === "?") {
        showHelp = true;
        rebuild();
        tui.requestRender();
        return;
      }

      if (matchesKey(data, Key.tab)) {
        switchTab(1);
        return;
      }
      if (matchesKey(data, Key.shift("tab"))) {
        switchTab(-1);
        return;
      }
      if (data === "q" || matchesKey(data, Key.ctrl("c"))) {
        safeDone(null);
        return;
      }

      if (currentTab === "settings") {
        // 缓存快捷键
        if (data === "r") {
          safeDone({ action: "settings-refresh-catalog" });
          return;
        }
        if (data === "c") {
          safeDone({ action: "settings-clear-catalog" });
          return;
        }
        // 偏好重置快捷键
        if (data === "x") {
          safeDone({ action: "settings-reset" });
          return;
        }
        if (data === "g") {
          safeDone({ action: "settings-config" });
          return;
        }
        langSelector?.handleInput(data);
        tui.requestRender();
        return;
      }

      // ── Detail view shortcuts ──
      if (detailPkg) {
        if (matchesKey(data, Key.escape) || matchesKey(data, Key.left) || matchesKey(data, Key.backspace)) {
          closeDetail();
          return;
        }
        if (data === "i" && !detailPkg.installed) {
          safeDone({ action: "detail", pkg: detailPkg });
          return;
        }
        if (data === "r" && detailPkg.installed) {
          safeDone({ action: "detail", pkg: detailPkg });
          return;
        }
        if (data === "u" && detailPkg.installed) {
          safeDone({ action: "detail", pkg: detailPkg });
          return;
        }
        if (data === "a") {
          handleQuickAudit();
          return;
        }
        // Enter in detail view also goes to full detail (for install/remove/update)
        if (matchesKey(data, Key.enter)) {
          safeDone({ action: "detail", pkg: detailPkg });
          return;
        }
        return;
      }

      // ── Package list shortcuts (when not in search) ──
      if (focusTarget === "list") {
        // Filter chips: 1-5
        if (data === "1") { activeFilter = FILTER_ALL; rebuild(); tui.requestRender(); return; }
        if (data === "2") { activeFilter = "extension"; rebuild(); tui.requestRender(); return; }
        if (data === "3") { activeFilter = "skill"; rebuild(); tui.requestRender(); return; }
        if (data === "4") { activeFilter = "prompt"; rebuild(); tui.requestRender(); return; }
        if (data === "5") { activeFilter = "theme"; rebuild(); tui.requestRender(); return; }

        // Quick actions
        if (data === "i") { handleQuickInstall(); return; }
        if (data === "r") { handleQuickRemove(); return; }
        if (data === "u") { handleQuickUpdate(); return; }
        if (data === "a") { handleQuickAudit(); return; }
      }

      // Focus search input
      if (data === "/" && focusTarget === "list") {
        focusTarget = "search";
        searchInput.focused = true;
        rebuild();
        tui.requestRender();
        return;
      }

      if (focusTarget === "search") {
        searchInput.handleInput(data);
        const query = searchInput.getValue();
        applySearch(query);
        if (list) {
          const items = currentPkgs.map((p) => packageToListItem(p, locale));
          list.setItems(items);
        }
        tui.requestRender();
        return;
      }

      // Move focus to search on up arrow when at top of list
      if (matchesKey(data, Key.up) && list && list.isAtTop()) {
        focusTarget = "search";
        searchInput.focused = true;
        rebuild();
        tui.requestRender();
        return;
      }

      list?.handleInput(data);
      tui.requestRender();
    }

    return mainComponent;
  });
}

// ─── Helper functions ────────────────────────────────────

function collectPackages(
  tab: TabKey,
  cachedCatalog: PackageInfo[] | null,
  cachedUpdates: PackageInfo[] | null,
): PackageInfo[] {
  if (tab === "installed") return getInstalledPackages();
  if (tab === "browse") return cachedCatalog || [];
  if (tab === "updates") return cachedUpdates || [];
  return [];
}

function packageToListItem(pkg: PackageInfo, locale: Locale): PackageListItem {
  const desc = getTranslatedDescription(pkg.name, pkg.description, locale);
  const metaParts: string[] = [];
  if (pkg.types?.length) metaParts.push(pkg.types.join("·"));
  if (pkg.scope) metaParts.push(pkg.scope);
  if (pkg.sourceType) metaParts.push(pkg.sourceType);
  if (pkg.downloads) metaParts.push(`${formatNumber(pkg.downloads)}/mo`);
  const badge = pkg.installedVersion
    ? `✅ v${pkg.installedVersion}`
    : pkg.installed
      ? "✅"
      : "";
  return {
    value: pkg.name,
    title: pkg.name,
    badge: badge || undefined,
    description: desc || "",
    meta: metaParts.join(" · "),
  };
}

function buildTabBar(
  theme: { fg: (color: string, text: string) => string; bold: (text: string) => string },
  current: TabKey,
  locale: Locale,
): string {
  const tabLabels: Record<TabKey, string> = {
    installed: t("panel.tab.installed", locale),
    browse: t("panel.tab.browse", locale),
    updates: t("panel.tab.updates", locale),
    settings: t("panel.tab.settings", locale),
  };
  return TAB_KEYS.map((tab) => {
    const label = tabLabels[tab];
    if (tab === current) return theme.fg("accent", theme.bold(`[${label}]`));
    return theme.fg("muted", ` ${label} `);
  }).join("  ");
}

function buildHelpBar(tab: TabKey, locale: Locale, focus?: "search" | "list", inDetail?: boolean): string {
  const base = t("panel.help.base", locale);
  if (inDetail) return `${base} · ← back · a audit · i/r/u action · Esc close`;
  if (focus === "search") return `${base} · ↵ search · Esc clear`;
  if (tab === "settings") return `${base} · ${t("panel.help.config", locale)}`;
  return `${base} · / 🔍 · ? help`;
}

function emptyMessage(tab: TabKey, locale: Locale): string {
  if (tab === "installed") return t("panel.empty.installed", locale);
  if (tab === "browse") return t("panel.empty.browse", locale);
  if (tab === "updates") return t("panel.empty.updates", locale);
  return "";
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
