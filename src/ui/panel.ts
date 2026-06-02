/**
 * pi-packages-manager/ui/panel.ts
 *
 * Claude-style overlay panel for the packages manager.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │  📦 Pi Packages Manager                      │
 *   │  [Installed]  Browse  Updates  Settings      │
 *   ├──────────────────────────────────────────────┤
 *   │  ● pi-tinyfish-tools                  v0.1   │
 *   │    TinyFish 网页代理工具                     │
 *   │    extension·skill · user · npm              │
 *   │                                              │
 *   │  ○ pi-autoname                       v0.5.13 │
 *   │    AI 驱动会话命名                           │
 *   │    ...                                       │
 *   ├──────────────────────────────────────────────┤
 *   │  Tab/⇧Tab 切换 · ↑↓ 选择 · ↵ 详情 · Esc 关闭  │
 *   └──────────────────────────────────────────────┘
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Key,
  matchesKey,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
} from "@earendil-works/pi-tui";
import {
  checkForUpdates,
  fetchFullCatalog,
  getInstalledPackageRefs,
  getInstalledPackages,
  type PackageInfo,
} from "../api";
import {
  getTranslatedDescription,
  type Locale,
  SUPPORTED_LOCALES,
  t,
} from "../i18n";
import { PackageList, type PackageListItem } from "./package-list";

const TAB_KEYS = ["installed", "browse", "updates", "settings"] as const;
type TabKey = typeof TAB_KEYS[number];

export type PanelResult =
  | { action: "detail"; pkg: PackageInfo }
  | { action: "browse-search" }
  | { action: "settings-config" }
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
    let cachedCatalog: PackageInfo[] | null = null;
    let cachedUpdates: PackageInfo[] | null = null;

    const container = new Container();
    let list: PackageList | null = null;
    let langSelector: SelectList | null = null;

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

    function rebuild() {
      container.clear();

      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
      container.addChild(new Text(theme.fg("accent", theme.bold("📦 " + t("menu.title", locale))), 1, 0));
      container.addChild(new Text(buildTabBar(theme, currentTab, locale), 1, 0));
      container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));

      if (currentTab === "settings") {
        renderSettingsTab();
      } else {
        renderPackageTab();
      }

      container.addChild(new DynamicBorder((s: string) => theme.fg("borderMuted", s)));
      container.addChild(new Text(theme.fg("dim", buildHelpBar(currentTab, locale)), 1, 0));
      container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    }

    function renderPackageTab() {
      langSelector = null;
      const pkgs = collectPackages(currentTab, cachedCatalog, cachedUpdates);
      currentPkgs = pkgs;

      const items = pkgs.map((p) => packageToListItem(p, locale));
      list = new PackageList(items, 4, listTheme(), {
        emptyLabel: emptyMessage(currentTab, locale),
      });
      list.onSelect = (item) => {
        const pkg = currentPkgs.find((p) => p.name === item.value);
        if (pkg) done({ action: "detail", pkg });
      };
      list.onCancel = () => done(null);
      container.addChild(list);
    }

    function renderSettingsTab() {
      list = null;

      // Section header: language
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(theme.fg("accent", theme.bold("  " + t("settings.section.language", locale))), 1, 0),
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
          done({ action: "change-locale", locale: item.value });
        }
      };
      langSelector.onCancel = () => done(null);
      container.addChild(langSelector);

      container.addChild(new Spacer(1));
      container.addChild(
        new Text(
          theme.fg("muted", "  " + t("settings.tip.config", locale)),
          1,
          0,
        ),
      );
      container.addChild(new Spacer(1));
    }

    async function loadBrowse() {
      try {
        cachedCatalog = await fetchFullCatalog(80);
      } catch {
        cachedCatalog = [];
      }
      if (currentTab === "browse") {
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
      if (currentTab === "updates") {
        rebuild();
        tui.requestRender();
      }
    }

    function switchTab(direction: 1 | -1) {
      const idx = TAB_KEYS.indexOf(currentTab);
      const next = TAB_KEYS[(idx + direction + TAB_KEYS.length) % TAB_KEYS.length];
      currentTab = next;
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

    rebuild();

    if (initialTab === "browse" && cachedCatalog === null) {
      cachedCatalog = [];
      loadBrowse();
    }
    if (initialTab === "updates" && cachedUpdates === null) {
      cachedUpdates = [];
      loadUpdates();
    }

    return {
      render(width: number) {
        return container.render(width);
      },
      invalidate() {
        container.invalidate();
      },
      handleInput(data: string) {
        if (matchesKey(data, Key.tab)) {
          switchTab(1);
          return;
        }
        if (matchesKey(data, Key.shift("tab"))) {
          switchTab(-1);
          return;
        }
        if (data === "q" || matchesKey(data, Key.ctrl("c"))) {
          done(null);
          return;
        }
        if (data === "/" && currentTab === "browse") {
          done({ action: "browse-search" });
          return;
        }
        if (data === "g" && currentTab === "settings") {
          done({ action: "settings-config" });
          return;
        }
        if (currentTab === "settings") {
          langSelector?.handleInput(data);
        } else {
          list?.handleInput(data);
        }
        tui.requestRender();
      },
    };
  });
}

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

function buildHelpBar(tab: TabKey, locale: Locale): string {
  const base = t("panel.help.base", locale);
  if (tab === "browse") return `${base} · ${t("panel.help.search", locale)}`;
  if (tab === "settings") return `${base} · ${t("panel.help.config", locale)}`;
  return base;
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
