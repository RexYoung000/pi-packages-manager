/**
 * plugin-manager/api.ts
 * 
 * 数据获取层：npm registry 搜索 + 已安装包读取 + AI 语义搜索
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { rankPackages, parsePackageQuery, type Scope, type SourceType } from "./search";

const HOME = process.env.HOME!;
const SETTINGS_FILE = join(HOME, ".pi/agent/settings.json");
const NPM_DIR = join(HOME, ".pi/agent/npm/node_modules");
const PROJECT_SETTINGS_FILE = join(process.cwd(), ".pi/settings.json");
const PROJECT_NPM_DIR = join(process.cwd(), ".pi/npm/node_modules");
const CACHE_FILE = join(HOME, ".pi/agent/cache/pi-package-manager/catalog.json");
const CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ─── Types ───────────────────────────────────────────────

export interface PackageInfo {
  name: string;
  description: string;
  version: string;
  source?: string;
  sourceType?: SourceType;
  scope?: Scope;
  latestVersion?: string;
  author?: string;
  license?: string;
  keywords?: string[];
  types?: string[];       // "extension" | "skill" | "prompt" | "theme" | "package"
  downloads?: number;
  updatedAt?: string;
  installed: boolean;
  installedVersion?: string;
  npmUrl?: string;
  repoUrl?: string;
  piManifest?: Record<string, unknown>;
  searchScore?: number;
  searchReasons?: string[];
}

// ─── 已安装包 ────────────────────────────────────────────

export function getInstalledPackages(): PackageInfo[] {
  const refs = readPackageRefs();
  const results: PackageInfo[] = [];
  const seen = new Set<string>();

  for (const { ref, scope } of refs) {
    if (seen.has(`${scope}:${ref}`)) continue;
    seen.add(`${scope}:${ref}`);

    const pkgName = resolvePackageName(ref);
    if (pkgName) {
      const npmDir = scope === "project" ? PROJECT_NPM_DIR : NPM_DIR;
      const pkgJsonPath = join(npmDir, pkgName, "package.json");
      if (!existsSync(pkgJsonPath)) {
        results.push({ ...createFallbackPackage(ref, pkgName, true), scope });
        continue;
      }

      try {
        const raw = readFileSync(pkgJsonPath, "utf-8");
        const pkg = JSON.parse(raw);

        results.push({
          name: pkg.name || pkgName,
          description: pkg.description || "",
          version: pkg.version || "unknown",
          source: ref,
          sourceType: "npm",
          scope,
          author: pkg.author?.name || pkg.author || "",
          license: pkg.license || "",
          keywords: pkg.keywords || [],
          types: extractTypes(pkg),
          installed: true,
          installedVersion: pkg.version || "unknown",
          npmUrl: `https://www.npmjs.com/package/${pkg.name || pkgName}`,
          repoUrl: pkg.repository?.url?.replace(/^git\+/, "").replace(/\.git$/, "") || "",
          piManifest: pkg.pi || {},
        });
      } catch {
        results.push({ ...createFallbackPackage(ref, pkgName, true), scope });
      }
      continue;
    }

    const localPackage = readLocalPackage(ref);
    if (localPackage) {
      results.push({ ...localPackage, source: ref, sourceType: detectSourceType(ref), scope });
    } else {
      results.push({ ...createFallbackPackage(ref, ref, true), scope });
    }
  }

  return dedupePackages(results);
}

export function isPackageInstalled(pkgName: string): boolean {
  const installed = getInstalledPackages();
  return installed.some((p) => p.name === pkgName || `@${pkgName.split("/")[0]}/${pkgName.split("/")[1]}` === p.name);
}

// ─── 社区目录预取 ──────────────────────────────────────

/** 内存缓存，session 内复用 */
let catalogCache: PackageInfo[] | null = null;

export function clearCatalogCache(): void {
  catalogCache = null;
  try {
    writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: 0, packages: [] }, null, 2), "utf-8");
  } catch {
    // ignore cache clear failures
  }
}

/**
 * 预取社区插件目录（多查询合并去重，按相关性/下载量排序）。
 * 优先使用 Pi 官方推荐的 pi-package keyword，再补充 extension/skill 和历史关键词。
 */
export async function fetchFullCatalog(size = 250, forceRefresh = false): Promise<PackageInfo[]> {
  if (!forceRefresh && catalogCache) return catalogCache;

  if (!forceRefresh) {
    const cached = readCatalogCache();
    if (cached) {
      catalogCache = mergeInstalledState(cached);
      return catalogCache;
    }
  }

  const queries = [
    "keywords:pi-package",
    "keywords:pi-extension",
    "keywords:pi-skill",
    "pi-coding-agent",
  ];

  const allResults: PackageInfo[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    try {
      const results = await rawNpmSearch(q, size);
      for (const r of results) {
        if (!seen.has(r.name)) {
          seen.add(r.name);
          allResults.push(r);
        }
      }
    } catch {
      // skip failed queries
    }
  }

  const ranked = rankPackages(allResults, "", size);
  catalogCache = ranked;
  writeCatalogCache(ranked);
  return ranked;
}

// ─── npm Registry 搜索（关键词）─────────────────────────

export async function searchNpmRegistry(query: string, size = 20): Promise<PackageInfo[]> {
  const parsed = parsePackageQuery(query);
  const registryQuery = parsed.terms.join(" ").trim();
  const catalog = await fetchFullCatalog(Math.max(size, 250));
  const localResults = rankPackages(catalog, query, size);

  // If local catalog has enough relevant results, avoid extra registry calls.
  if (localResults.length >= Math.min(size, 10)) return localResults;

  const queryVariants = registryQuery
    ? [
        `${registryQuery} keywords:pi-package`,
        `${registryQuery} keywords:pi-extension`,
        `${registryQuery} keywords:pi-skill`,
        `${registryQuery} pi-coding-agent`,
        registryQuery,
      ]
    : ["keywords:pi-package", "keywords:pi-extension", "keywords:pi-skill", "pi-coding-agent"];

  const allResults = [...localResults];
  const seen = new Set(allResults.map((p) => p.name));

  for (const text of queryVariants) {
    try {
      const results = await rawNpmSearch(text, size);
      for (const pkg of results) {
        if (seen.has(pkg.name)) continue;
        seen.add(pkg.name);
        allResults.push(pkg);
      }
    } catch {
      // continue with other variants
    }
  }

  return rankPackages(allResults, query, size);
}

// ─── npm 包详情 ─────────────────────────────────────────

export async function getPackageDetail(pkgName: string): Promise<PackageInfo | null> {
  const npmName = normalizeNpmPackageName(pkgName);
  if (!npmName) return null;

  try {
    const url = `https://registry.npmjs.org/${registryPackagePath(npmName)}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, unknown>;
    const latest = (data["dist-tags"] as Record<string, string>)?.latest;
    const latestVersion = data.versions?.[latest || ""] as Record<string, unknown> | undefined;
    
    if (!latestVersion) return null;

    const pkgJson = latestVersion as Record<string, unknown>;
    const authorObj = pkgJson.author as { name?: string } | string | undefined;
    const repoObj = pkgJson.repository as { url?: string } | undefined;

    const installedPkgs = getInstalledPackages();
    const isInstalled = installedPkgs.some((p) => p.name === npmName);

    return {
      name: (data.name as string) || npmName,
      description: (pkgJson.description as string) || "",
      version: latest || "",
      latestVersion: latest,
      source: `npm:${npmName}`,
      sourceType: "npm",
      scope: installedPkgs.find((p) => p.name === npmName)?.scope,
      author: typeof authorObj === "string" ? authorObj : authorObj?.name || "",
      license: (pkgJson.license as string) || "",
      keywords: (pkgJson.keywords as string[]) || [],
      types: extractTypesFromManifest(pkgJson.pi as Record<string, unknown> | undefined),
      downloads: undefined,
      installed: isInstalled,
      installedVersion: isInstalled
        ? installedPkgs.find((p) => p.name === npmName)?.installedVersion
        : undefined,
      npmUrl: `https://www.npmjs.com/package/${npmName}`,
      repoUrl: repoObj?.url?.replace(/^git\+/, "").replace(/\.git$/, "") || "",
      piManifest: (pkgJson.pi as Record<string, unknown>) || {},
    };
  } catch {
    return null;
  }
}

// ─── 版本检查 ────────────────────────────────────────────

export async function checkForUpdates(): Promise<Array<PackageInfo & { hasUpdate: boolean }>> {
  const installed = getInstalledPackages();
  const results: Array<PackageInfo & { hasUpdate: boolean }> = [];

  for (const pkg of installed) {
    try {
      const npmName = normalizeNpmPackageName(pkg.name);
      if (!npmName) {
        results.push({ ...pkg, hasUpdate: false });
        continue;
      }

      const url = `https://registry.npmjs.org/${registryPackagePath(npmName)}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) continue;

      const data = (await response.json()) as Record<string, unknown>;
      const latest = (data["dist-tags"] as Record<string, string>)?.latest;

      results.push({
        ...pkg,
        latestVersion: latest,
        hasUpdate: latest && latest !== pkg.installedVersion,
      });
    } catch {
      results.push({ ...pkg, hasUpdate: false });
    }
  }

  return results;
}

// ─── AI 语义搜索 ──────────────────────────────────────

/**
 * 通过 pi -p 调用当前模型，从目录中筛选匹配用户语义需求的插件。
 * 失败时自动 fallback 到关键词搜索。
 */
export async function aiSemanticSearch(
  query: string,
  catalog: PackageInfo[],
): Promise<PackageInfo[]> {
  // Take top 60 by downloads for prompt (keep it concise)
  const topCatalog = catalog.slice(0, 60);

  const catalogLines = topCatalog
    .map((p, i) => `${i + 1}. ${p.name}: ${p.description || "No description"}`)
    .join("\n");

  const prompt = [
    "You are a pi coding agent extension advisor.",
    "Here are available pi extensions:",
    "",
    catalogLines,
    "",
    `User request: "${query}"`,
    "",
    "Which extensions best match? Reply with ONLY package names, one per line. Max 10 results. No explanation.",
  ].join("\n");

  try {
    // Pass prompt via stdin ($'...' for bash escaping) to avoid @file path issues
    const escaped = prompt.replace(/'/g, "'\\''");
    const output = execSync(
      `pi -p --no-session $'${escaped}' 2>/dev/null`,
      { encoding: "utf-8", timeout: 60_000 },
    );
    const results = parseAiResponse(output, catalog);
    if (results.length > 0) return results;
    // If AI returned nothing parseable, fallback
    return fallbackKeywordSearch(query, catalog);
  } catch {
    // pi -p failed entirely, fallback to keyword search
    return fallbackKeywordSearch(query, catalog);
  }
}

/** 解析 AI 返回的包名列表 */
function parseAiResponse(output: string, catalog: PackageInfo[]): PackageInfo[] {
  const lines = output.trim().split("\n");
  const matched: PackageInfo[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    // Clean common formatting: "1. pkg-name", "- pkg-name", "`pkg-name`", etc.
    let cleaned = line.trim()
      .replace(/^\d+[\.\)\-]\s*/, "")
      .replace(/^[-*]\s*/, "")
      .replace(/[`"']/g, "")
      .replace(/\s*[-–—]\s+.*/, "")   // Remove trailing description
      .trim();

    if (!cleaned) continue;

    // Try to find matching package in catalog
    for (const pkg of catalog) {
      if (seen.has(pkg.name)) continue;
      const shortName = pkg.name.includes("/") ? pkg.name.split("/").pop()! : pkg.name;
      if (cleaned === pkg.name || cleaned === shortName ||
          cleaned.includes(pkg.name) || pkg.name.includes(cleaned)) {
        seen.add(pkg.name);
        matched.push(pkg);
        break;
      }
    }
  }

  return matched;
}

/** 关键词 fallback：对目录做本地模糊匹配 */
function fallbackKeywordSearch(query: string, catalog: PackageInfo[]): PackageInfo[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = catalog.map((pkg) => {
    const text = `${pkg.name} ${pkg.description} ${(pkg.keywords || []).join(" ")}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) score++;
    }
    return { pkg, score };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  return scored.map((s) => s.pkg).slice(0, 20);
}

// ─── 安装/卸载命令 ──────────────────────────────────────

export function runPiInstall(pkgName: string): { success: boolean; output: string } {
  try {
    const source = normalizeInstallSource(pkgName);
    const output = execFileSync("pi", ["install", source], {
      encoding: "utf-8",
      timeout: 120_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { success: false, output: e.stderr || e.stdout || e.message || "Install failed" };
  }
}

/** 异步版安装，不会冻结 UI 事件循环 */
export async function runPiInstallAsync(pkgName: string, scope: "user" | "project" = "user"): Promise<{ success: boolean; output: string }> {
  const { execFile } = await import("node:child_process");
  const source = normalizeInstallSource(pkgName);
  const args = scope === "project" ? ["install", "-l", source] : ["install", source];
  return new Promise((resolve) => {
    execFile("pi", args, {
      encoding: "utf-8",
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, output: stderr || stdout || err.message || "Install failed" });
      } else {
        resolve({ success: true, output: stdout });
      }
    });
  });
}

export function runPiUninstall(pkgName: string): { success: boolean; output: string } {
  try {
    const source = normalizeInstallSource(pkgName);
    const output = execFileSync("pi", ["uninstall", source], {
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { success: true, output };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { success: false, output: e.stderr || e.stdout || e.message || "Uninstall failed" };
  }
}

/** 异步版卸载，不会冻结 UI 事件循环 */
export async function runPiUninstallAsync(pkgName: string): Promise<{ success: boolean; output: string }> {
  const { execFile } = await import("node:child_process");
  const source = normalizeInstallSource(pkgName);
  return new Promise((resolve) => {
    execFile("pi", ["uninstall", source], {
      encoding: "utf-8",
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, output: stderr || stdout || err.message || "Uninstall failed" });
      } else {
        resolve({ success: true, output: stdout });
      }
    });
  });
}

// ─── 直接从 settings.json 移除包（fallback）─────────────────

export function removeFromSettings(pkgName: string): boolean {
  const targetRef = normalizeInstallSource(pkgName);
  const npmName = normalizeNpmPackageName(pkgName);
  let removed = false;

  for (const settingsFile of [SETTINGS_FILE, PROJECT_SETTINGS_FILE]) {
    const settings = readSettings(settingsFile);
    const packages = settings.packages as string[] | undefined;
    if (!packages || !Array.isArray(packages)) continue;

    const filtered = packages.filter((ref) =>
      ref !== targetRef && !(npmName && ref === `npm:${npmName}`)
    );
    if (filtered.length === packages.length) continue;

    settings.packages = filtered;
    try {
      writeFileSync(settingsFile, JSON.stringify(settings, null, 2), "utf-8");
      removed = true;
    } catch {
      // keep trying other scopes
    }
  }

  return removed;
}

// ─── npm 搜索内部工具 ──────────────────────────────────

interface NpmSearchResponse {
  objects: Array<{
    package: {
      name: string;
      description?: string;
      version: string;
      date?: string;
      author?: { name?: string } | string;
      keywords?: string[];
      links?: { npm?: string; repository?: string };
    };
    downloads?: { monthly?: number };
  }>;
}

/** 原始 npm search，不追加 pi-coding-agent */
async function rawNpmSearch(text: string, size: number): Promise<PackageInfo[]> {
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(text)}&size=${size}`;
  const response = await fetch(url);
  if (!response.ok) return [];

  const data = await response.json() as NpmSearchResponse;

  const installedPkgs = getInstalledPackages();
  const installedNames = new Set(installedPkgs.map((p) => p.name));

  return data.objects.map((obj) => mapNpmObject(obj, installedPkgs, installedNames));
}

function mapNpmObject(
  obj: NpmSearchResponse["objects"][number],
  installedPkgs: PackageInfo[],
  installedNames: Set<string>,
): PackageInfo {
  const pkg = obj.package;
  const authorName = typeof pkg.author === "string" ? pkg.author : pkg.author?.name;
  return {
    name: pkg.name,
    description: pkg.description || "",
    version: pkg.version,
    source: `npm:${pkg.name}`,
    sourceType: "npm",
    author: authorName || "",
    keywords: pkg.keywords || [],
    types: inferTypesFromKeywords(pkg.keywords || []),
    downloads: obj.downloads?.monthly,
    updatedAt: pkg.date,
    installed: installedNames.has(pkg.name),
    installedVersion: installedNames.has(pkg.name)
      ? installedPkgs.find((p) => p.name === pkg.name)?.installedVersion
      : undefined,
    scope: installedPkgs.find((p) => p.name === pkg.name)?.scope,
    npmUrl: pkg.links?.npm || `https://www.npmjs.com/package/${pkg.name}`,
    repoUrl: pkg.links?.repository || "",
  };
}

// ─── Catalog cache ─────────────────────────────────────

interface CatalogCacheFile {
  fetchedAt: number;
  packages: PackageInfo[];
}

function readCatalogCache(): PackageInfo[] | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const cache = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as CatalogCacheFile;
    if (!cache.fetchedAt || !Array.isArray(cache.packages)) return null;
    if (Date.now() - cache.fetchedAt > CATALOG_CACHE_TTL_MS) return null;
    return cache.packages;
  } catch {
    return null;
  }
}

function writeCatalogCache(packages: PackageInfo[]): void {
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), packages }, null, 2), "utf-8");
  } catch {
    // cache is best-effort
  }
}

function mergeInstalledState(packages: PackageInfo[]): PackageInfo[] {
  const installedPkgs = getInstalledPackages();
  const installedByName = new Map(installedPkgs.map((p) => [p.name, p]));
  return packages.map((pkg) => {
    const installed = installedByName.get(pkg.name);
    if (!installed) return { ...pkg, installed: false, installedVersion: undefined, scope: undefined };
    return {
      ...pkg,
      installed: true,
      installedVersion: installed.installedVersion,
      scope: installed.scope,
      source: installed.source || pkg.source,
      sourceType: installed.sourceType || pkg.sourceType,
      piManifest: Object.keys(installed.piManifest || {}).length > 0 ? installed.piManifest : pkg.piManifest,
      types: installed.types?.length ? installed.types : pkg.types,
    };
  });
}

// ─── Helpers ─────────────────────────────────────────────

function readSettings(settingsFile = SETTINGS_FILE): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsFile, "utf-8"));
  } catch {
    return {};
  }
}

type PackageRef = { ref: string; scope: "user" | "project" };

function readPackageRefs(): PackageRef[] {
  const refs: PackageRef[] = [];
  for (const [settingsFile, scope] of [[SETTINGS_FILE, "user"], [PROJECT_SETTINGS_FILE, "project"]] as const) {
    const settings = readSettings(settingsFile);
    const packages = settings.packages as string[] | undefined;
    if (!packages || !Array.isArray(packages)) continue;
    refs.push(...packages.filter((ref): ref is string => typeof ref === "string").map((ref) => ({ ref, scope })));
  }
  return refs;
}

function readLocalPackage(ref: string): PackageInfo | null {
  if (/^(git:|https?:\/\/|ssh:\/\/)/.test(ref)) return null;

  const path = ref.startsWith("file:") ? ref.slice(5) : ref;
  if (!path.startsWith(".") && !path.startsWith("/")) return null;

  const packagePath = isAbsolute(path) ? path : resolve(process.cwd(), path);
  const pkgJsonPath = packagePath.endsWith("package.json") ? packagePath : join(packagePath, "package.json");
  if (!existsSync(pkgJsonPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    return {
      name: pkg.name || ref,
      description: pkg.description || "",
      version: pkg.version || "unknown",
      source: ref,
      sourceType: detectSourceType(ref),
      author: pkg.author?.name || pkg.author || "",
      license: pkg.license || "",
      keywords: pkg.keywords || [],
      types: extractTypes(pkg),
      installed: true,
      installedVersion: pkg.version || "unknown",
      repoUrl: pkg.repository?.url?.replace(/^git\+/, "").replace(/\.git$/, "") || "",
      piManifest: pkg.pi || {},
    };
  } catch {
    return null;
  }
}

function createFallbackPackage(ref: string, name: string, installed: boolean): PackageInfo {
  return {
    name,
    description: ref.startsWith("git:") || ref.startsWith("http") || ref.startsWith("ssh:")
      ? "Git/remote pi package"
      : "Pi package",
    version: "unknown",
    source: ref,
    sourceType: detectSourceType(ref),
    types: ["package"],
    installed,
    installedVersion: installed ? "unknown" : undefined,
    repoUrl: /^(git:|https?:\/\/|ssh:\/\/)/.test(ref) ? ref : undefined,
  };
}

function dedupePackages(packages: PackageInfo[]): PackageInfo[] {
  const seen = new Set<string>();
  const result: PackageInfo[] = [];
  for (const pkg of packages) {
    const key = pkg.name;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pkg);
  }
  return result;
}

function resolvePackageName(ref: string): string | null {
  if (!ref.startsWith("npm:")) return null;
  return ref.slice(4);
}

function detectSourceType(ref: string): SourceType {
  if (ref.startsWith("npm:")) return "npm";
  if (/^(git:|https?:\/\/|ssh:\/\/)/.test(ref)) return "git";
  if (ref.startsWith("file:") || ref.startsWith("./") || ref.startsWith("../") || ref.startsWith("/")) return "local";
  return "unknown";
}

function inferTypesFromKeywords(keywords: string[]): string[] {
  const lower = keywords.map((k) => k.toLowerCase());
  const types: string[] = [];
  if (lower.includes("pi-extension") || lower.includes("extension")) types.push("extension");
  if (lower.includes("pi-skill") || lower.includes("skill")) types.push("skill");
  if (lower.includes("pi-prompt") || lower.includes("prompt")) types.push("prompt");
  if (lower.includes("pi-theme") || lower.includes("theme")) types.push("theme");
  if (types.length === 0) types.push("package");
  return types;
}

function normalizeNpmPackageName(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^(git:|https?:\/\/|ssh:\/\/|file:)/.test(value) || value.startsWith("./") || value.startsWith("../") || value.startsWith("/")) {
    return null;
  }
  return value.startsWith("npm:") ? value.slice(4) : value;
}

export function normalizeInstallSource(input: string): string {
  const value = input.trim();
  if (!value) return value;
  if (/^(npm:|git:|https?:\/\/|ssh:\/\/|file:)/.test(value) || value.startsWith("./") || value.startsWith("../") || value.startsWith("/")) {
    return value;
  }
  return `npm:${value}`;
}

function registryPackagePath(pkgName: string): string {
  // npm registry expects scoped names as @scope%2Fname. encodeURIComponent
  // would encode '@' as %40, which can fail for some registry endpoints/proxies.
  return pkgName.startsWith("@") ? pkgName.replace("/", "%2F") : encodeURIComponent(pkgName);
}

function extractTypes(pkg: Record<string, unknown>): string[] {
  const types: string[] = [];
  const pi = pkg.pi as Record<string, unknown> | undefined;
  if (pi?.extensions) types.push("extension");
  if (pi?.skills) types.push("skill");
  if (pi?.prompts) types.push("prompt");
  if (pi?.themes) types.push("theme");
  if (types.length === 0) types.push("package");
  return types;
}

function extractTypesFromManifest(pi?: Record<string, unknown>): string[] {
  if (!pi) return ["package"];
  const types: string[] = [];
  if (pi.extensions) types.push("extension");
  if (pi.skills) types.push("skill");
  if (pi.prompts) types.push("prompt");
  if (pi.themes) types.push("theme");
  if (types.length === 0) types.push("package");
  return types;
}
