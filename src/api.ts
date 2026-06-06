/**
 * pi-packages-manager/api.ts
 * 
 * 数据获取层：npm registry 搜索 + 已安装包读取 + AI 语义搜索
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, promises as fsp } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { userInfo } from "node:os";
import { rankPackages, parsePackageQuery, type Scope, type SourceType } from "./search";

const HOME = process.env.HOME!;
const SETTINGS_FILE = join(HOME, ".pi/agent/settings.json");
const NPM_DIR = join(HOME, ".pi/agent/npm/node_modules");
const PROJECT_SETTINGS_FILE = join(process.cwd(), ".pi/settings.json");
const PROJECT_NPM_DIR = join(process.cwd(), ".pi/npm/node_modules");
const CACHE_FILE = join(HOME, ".pi/agent/cache/pi-packages-manager/catalog.json");
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
  readme?: string;
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

export function getInstalledPackageRefs(): PackageRef[] {
  return readPackageRefs();
}

export function isPackageInstalled(pkgName: string): boolean {
  const installed = getInstalledPackages();
  return installed.some((p) => {
    if (p.name === pkgName) return true;
    // Handle scoped packages: @scope/name
    if (pkgName.includes("/")) {
      const parts = pkgName.split("/");
      return p.name === `@${parts[0]}/${parts[1]}`;
    }
    return false;
  });
}

// ─── 社区目录预取 ──────────────────────────────────────

/** 内存缓存，session 内复用 */
let catalogCache: PackageInfo[] | null = null;

/** Short-lived cache for installed packages (invalidated on install/uninstall). */
let installedPackagesCache: PackageInfo[] | null = null;
let installedPackagesCacheTime = 0;
const INSTALLED_CACHE_TTL_MS = 5_000; // 5 seconds

function getInstalledPackagesCached(): PackageInfo[] {
  const now = Date.now();
  if (installedPackagesCache && now - installedPackagesCacheTime < INSTALLED_CACHE_TTL_MS) {
    return installedPackagesCache;
  }
  installedPackagesCache = getInstalledPackages();
  installedPackagesCacheTime = now;
  return installedPackagesCache;
}

function invalidateInstalledCache(): void {
  installedPackagesCache = null;
  installedPackagesCacheTime = 0;
}

export function clearCatalogCache(): void {
  catalogCache = null;
  invalidateInstalledCache();
  try {
    writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: 0, packages: [] }, null, 2), "utf-8");
  } catch {
    // ignore cache clear failures
  }
}

/**
 * v1.3.0 J1: 读取 catalog 缓存的元信息（不反序列化 packages 数组）。
 * 用于 Settings 页展示“已缓存 N 个包 · X 小时前”。
 */
export function getCatalogCacheInfo(): {
  cached: boolean;
  count: number;
  fetchedAt: Date | null;
  sizeBytes: number;
} {
  try {
    if (!existsSync(CACHE_FILE)) {
      return { cached: false, count: 0, fetchedAt: null, sizeBytes: 0 };
    }
    const stat = statSync(CACHE_FILE);
    // 只解析头部的 fetchedAt + packages.length，避免反序列化整个文件
    const text = readFileSync(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(text) as { fetchedAt?: number; packages?: unknown[] };
    const fetchedAt = typeof parsed.fetchedAt === "number" ? new Date(parsed.fetchedAt) : null;
    const count = Array.isArray(parsed.packages) ? parsed.packages.length : 0;
    return {
      cached: count > 0 && fetchedAt !== null,
      count,
      fetchedAt,
      sizeBytes: stat.size,
    };
  } catch {
    return { cached: false, count: 0, fetchedAt: null, sizeBytes: 0 };
  }
}

/**
 * v1.3.0 J2: 刷新目录缓存（强制重新拉取 npm registry）。返回新缓存信息。
 */
export async function refreshCatalogCache(): Promise<{ success: boolean; info: ReturnType<typeof getCatalogCacheInfo> }> {
  try {
    catalogCache = null;
    await fetchFullCatalog(250, true);
    return { success: true, info: getCatalogCacheInfo() };
  } catch {
    return { success: false, info: getCatalogCacheInfo() };
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

  // Parallelize all registry queries for faster first load
  const batchResults = await Promise.allSettled(
    queries.map((q) => rawNpmSearch(q, size)),
  );

  const allResults: PackageInfo[] = [];
  const seen = new Set<string>();
  for (const result of batchResults) {
    if (result.status !== "fulfilled") continue;
    for (const r of result.value) {
      if (!seen.has(r.name)) {
        seen.add(r.name);
        allResults.push(r);
      }
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

  // When no search terms (only filters like type:extension), skip extra registry queries
  // since fetchFullCatalog already covers the full pi-package corpus.
  if (!registryQuery) return localResults;

  const queryVariants = [
    `${registryQuery} keywords:pi-package`,
    `${registryQuery} keywords:pi-extension`,
    `${registryQuery} keywords:pi-skill`,
    registryQuery,
  ];

  // Parallelize search variants
  const batchResults = await Promise.allSettled(
    queryVariants.map((text) => rawNpmSearch(text, size)),
  );

  const allResults = [...localResults];
  const seen = new Set(allResults.map((p) => p.name));

  for (const result of batchResults) {
    if (result.status !== "fulfilled") continue;
    for (const pkg of result.value) {
      if (seen.has(pkg.name)) continue;
      seen.add(pkg.name);
      allResults.push(pkg);
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
    const ctrl = fetchTimeout(15_000);
    const response = await fetch(url, { signal: ctrl.signal });
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
      readme: typeof data.readme === "string" && data.readme.trim() ? data.readme : "",
      piManifest: (pkgJson.pi as Record<string, unknown>) || {},
    };
  } catch {
    return null;
  }
}

// ─── 版本检查 ────────────────────────────────────────────

export interface UpdateInfo extends PackageInfo {
  hasUpdate: boolean;
  pinned?: boolean;
  skipReason?: string;
}

export async function checkForUpdates(): Promise<UpdateInfo[]> {
  const installed = getInstalledPackages();
  const results: UpdateInfo[] = [];

  // Collect packages that need registry checks
  const needsCheck: PackageInfo[] = [];
  for (const pkg of installed) {
    if (pkg.sourceType && pkg.sourceType !== "npm") {
      results.push({
        ...pkg,
        hasUpdate: false,
        skipReason: pkg.sourceType === "git"
          ? "git source: use pi update <source>@ref"
          : pkg.sourceType === "local"
          ? "local path: managed manually"
          : "unknown source",
      });
      continue;
    }

    if (isPinnedSource(pkg.source)) {
      results.push({
        ...pkg,
        hasUpdate: false,
        pinned: true,
        skipReason: "pinned version",
      });
      continue;
    }

    const npmName = normalizeNpmPackageName(pkg.name);
    if (!npmName) {
      results.push({ ...pkg, hasUpdate: false, skipReason: "unsupported source" });
      continue;
    }

    needsCheck.push(pkg);
  }

  // Check all packages concurrently
  const checkResults = await Promise.allSettled(
    needsCheck.map(async (pkg) => {
      const npmName = normalizeNpmPackageName(pkg.name)!;
      const url = `https://registry.npmjs.org/${registryPackagePath(npmName)}`;
      const ctrl = fetchTimeout(10_000);
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (!response.ok) {
        return { ...pkg, latestVersion: undefined, hasUpdate: false, skipReason: `registry ${response.status}` } as UpdateInfo;
      }
      const data = (await response.json()) as Record<string, unknown>;
      const latest = (data["dist-tags"] as Record<string, string>)?.latest;
      const hasUpdate = Boolean(latest && pkg.installedVersion && latest !== pkg.installedVersion);
      return { ...pkg, latestVersion: latest, hasUpdate } as UpdateInfo;
    }),
  );

  for (let i = 0; i < checkResults.length; i++) {
    const result = checkResults[i];
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      const failedPkg = needsCheck[i];
      results.push({ ...failedPkg, hasUpdate: false, skipReason: (result.reason as Error)?.message || "check failed" });
    }
  }

  return results;
}

function isPinnedSource(source?: string): boolean {
  if (!source) return false;
  if (source.startsWith("npm:")) {
    const rest = source.slice(4);
    if (rest.startsWith("@")) {
      const at = rest.indexOf("@", 1);
      return at > 0;
    }
    return rest.includes("@");
  }
  return false;
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
    const { execFile } = await import("node:child_process");
    const output = await new Promise<string>((resolve, reject) => {
      const proc = execFile("pi", ["-p", "--no-session"], {
        encoding: "utf-8",
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      }, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve(stdout || stderr || "");
      });
      // Pass prompt via stdin to avoid shell escaping issues
      if (proc.stdin) {
        proc.stdin.write(prompt);
        proc.stdin.end();
      }
    });
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

// ─── npm 缓存权限检测与修复 ──────────────────────────────────

const NPM_CACHE_DIR = join(HOME, ".npm/_cacache");

/**
 * 异步版：检测 npm 缓存权限问题。递归遍历 _cacache 但限制深度为 3 层。
 * 不会阻塞事件循环。
 */
export async function detectNpmCachePermissionIssuesAsync(): Promise<{ count: number; samplePaths: string[] }> {
  const currentUser = userInfo().username;
  const badPaths: string[] = [];

  try {
    if (!existsSync(NPM_CACHE_DIR)) return { count: 0, samplePaths: [] };
    await walkDirForBadOwner(NPM_CACHE_DIR, badPaths, 50, 0);
  } catch {
    return { count: -1, samplePaths: [NPM_CACHE_DIR] };
  }

  return { count: badPaths.length, samplePaths: badPaths.slice(0, 5) };
}

/**
 * 轻量级同步检查：只检查顶层目录的所有者，不递归。用于快速预检。
 */
export function detectNpmCachePermissionIssues(): { count: number; samplePaths: string[] } {
  try {
    if (!existsSync(NPM_CACHE_DIR)) return { count: 0, samplePaths: [] };
    const stat = statSync(NPM_CACHE_DIR);
    if (stat.uid === 0) {
      return { count: 1, samplePaths: [NPM_CACHE_DIR] };
    }
    // Also check immediate children (one level only)
    const entries = readdirSync(NPM_CACHE_DIR, { withFileTypes: true });
    const badPaths: string[] = [];
    for (const entry of entries) {
      if (badPaths.length >= 5) break;
      try {
        const fullPath = join(NPM_CACHE_DIR, entry.name);
        const s = statSync(fullPath);
        if (s.uid === 0) badPaths.push(fullPath);
      } catch {
        // Can't stat — permission issue
      }
    }
    return { count: badPaths.length, samplePaths: badPaths };
  } catch {
    return { count: -1, samplePaths: [NPM_CACHE_DIR] };
  }
}

async function walkDirForBadOwner(dir: string, results: string[], limit: number, depth: number): Promise<void> {
  // Depth guard: _cacache can be very deep, limit to 3 levels for performance
  if (results.length >= limit || depth > 3) return;
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= limit) return;
      const fullPath = join(dir, entry.name);
      try {
        const stat = await fsp.stat(fullPath);
        const currentUid = userInfo().uid;
        if (stat.uid !== 0 && stat.uid === currentUid) continue; // fast path: same uid
        // Only flag root-owned files as problematic
        if (stat.uid === 0) {
          results.push(fullPath);
        }
      } catch {
        // Can't stat — likely permission issue
        results.push(fullPath);
      }
      if (entry.isDirectory()) {
        await walkDirForBadOwner(fullPath, results, limit, depth + 1);
      }
    }
  } catch {
    // Can't read directory — permission issue
    results.push(dir);
  }
}

/**
 * 尝试异步修复 npm 缓存权限问题（npm cache clean）。
 * 失败时返回可操作的修复建议。
 */
export async function fixNpmCachePermissionsAsync(): Promise<{ fixed: boolean; message: string }> {
  const issues = await detectNpmCachePermissionIssuesAsync();
  if (issues.count === 0) return { fixed: true, message: "" };

  const currentUser = userInfo().username;
  const fixCommand = `sudo chown -R ${currentUser} ~/.npm`;

  // Try to fix by cleaning the npm cache
  try {
    const { execFile } = await import("node:child_process");
    await new Promise<void>((resolve, reject) => {
      execFile("npm", ["cache", "clean", "--force"], {
        encoding: "utf-8",
        timeout: 30_000,
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Re-check
    const recheck = await detectNpmCachePermissionIssuesAsync();
    if (recheck.count === 0) {
      return { fixed: true, message: "npm cache cleaned successfully." };
    }
  } catch {
    // cache clean also failed due to permissions, fall through
  }

  return {
    fixed: false,
    message: [
      `npm cache has ${issues.count} file(s)/dir(s) owned by another user (likely root).`,
      `This causes EACCES errors during install.`,
      ``,
      `Fix: run the following command in your terminal:`,
      `  ${fixCommand}`,
      ``,
      `Or clear the cache:`,
      `  sudo npm cache clean --force`,
    ].join("\n"),
  };
}

/**
 * 异步版：在安装/卸载前执行 npm 缓存健康检查。
 * 先做轻量级同步预检（只看顶层），仅在有疑点时才做异步深度检查。
 */
export async function ensureNpmCacheHealthyAsync(): Promise<{ ok: boolean; message: string }> {
  // Quick synchronous check (top-level only, very fast)
  const quickCheck = detectNpmCachePermissionIssues();
  if (quickCheck.count === 0) return { ok: true, message: "" };

  // Deeper async check + auto-fix attempt
  const fix = await fixNpmCachePermissionsAsync();
  if (fix.fixed) return { ok: true, message: fix.message };

  return { ok: false, message: fix.message };
}

// ─── 安装/卸载命令 ──────────────────────────────────────

export function runPiInstall(pkgName: string): { success: boolean; output: string } {
  // Quick sync pre-flight cache check
  const quickCheck = detectNpmCachePermissionIssues();
  if (quickCheck.count > 0) {
    return { success: false, output: `npm cache permission error: run 'sudo chown -R $(whoami) ~/.npm' in your terminal.` };
  }
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
    const rawOutput = e.stderr || e.stdout || e.message || "Install failed";
    return { success: false, output: enhanceNpmError(rawOutput) };
  }
}

/** 异步版安装，不会冻结 UI 事件循环 */
export async function runPiInstallAsync(pkgName: string, scope: "user" | "project" = "user"): Promise<{ success: boolean; output: string }> {
  // Pre-flight: check npm cache health (lightweight sync check first, async deep check only if needed)
  const quickCheck = detectNpmCachePermissionIssues();
 if (quickCheck.count > 0) {
    const cacheCheck = await ensureNpmCacheHealthyAsync();
    if (!cacheCheck.ok) {
      return { success: false, output: `npm cache permission error:\n${cacheCheck.message}` };
    }
  }

  const { execFile } = await import("node:child_process");
  const source = normalizeInstallSource(pkgName);
  const args = scope === "project" ? ["install", source, "-l"] : ["install", source];
  return new Promise((resolve) => {
    execFile("pi", args, {
      encoding: "utf-8",
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        const rawOutput = stderr || stdout || err.message || "Install failed";
        // Enhance EACCES/EEXIST errors with actionable fix
        const output = enhanceNpmError(rawOutput);
        resolve({ success: false, output });
      } else {
        resolve({ success: true, output: stdout });
      }
    });
  });
}

/**
 * Streaming 版本的 pi install。按行回调进度，适合 UI 展示实时输出。
 * 行为与 runPiInstallAsync 一致，但能在安装过程中逐行推送 stdout/stderr。
 */
export async function runPiInstallStreaming(
  pkgName: string,
  scope: "user" | "project" = "user",
  onProgress?: (line: string) => void,
): Promise<{ success: boolean; output: string }> {
  // Pre-flight: check npm cache health
  const quickCheck = detectNpmCachePermissionIssues();
  if (quickCheck.count > 0) {
    const cacheCheck = await ensureNpmCacheHealthyAsync();
    if (!cacheCheck.ok) {
      return { success: false, output: `npm cache permission error:\n${cacheCheck.message}` };
    }
  }

  const { spawn } = await import("node:child_process");
  const source = normalizeInstallSource(pkgName);
  const args = scope === "project" ? ["install", source, "-l"] : ["install", source];

  return new Promise((resolve) => {
    const child = spawn("pi", args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let stdoutClosed = false;
    let stderrClosed = false;
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000);
    }, 120_000);

    const emitLines = (chunk: string, isStderr: boolean) => {
      const text = (isStderr ? stderrBuffer : stdoutBuffer) + chunk;
      const lines = text.split(/\r?\n/);
      // 最后一段可能是不完整的行，暂存在 buffer 里
      if (isStderr) stderrBuffer = lines.pop() || "";
      else stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (isStderr) stderrChunks.push(trimmed);
        else stdoutChunks.push(trimmed);
        if (onProgress) {
          try {
            onProgress(trimmed);
          } catch {
            // 回调失败不影响安装流程
          }
        }
      }
    };

    child.stdout?.on("data", (chunk: Buffer | string) => emitLines(String(chunk), false));
    child.stderr?.on("data", (chunk: Buffer | string) => emitLines(String(chunk), true));

    child.stdout?.on("end", () => { stdoutClosed = true; });
    child.stderr?.on("end", () => { stderrClosed = true; });

    const finalize = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      // flush 残留的 buffer
      if (stdoutBuffer.trim()) {
        stdoutChunks.push(stdoutBuffer.trim());
        if (onProgress) {
          try { onProgress(stdoutBuffer.trim()); } catch {}
        }
      }
      if (stderrBuffer.trim()) {
        stderrChunks.push(stderrBuffer.trim());
        if (onProgress) {
          try { onProgress(stderrBuffer.trim()); } catch {}
        }
      }

      if (killed) {
        resolve({
          success: false,
          output: "Install timed out after 120s and was terminated.",
        });
        return;
      }

      const combined = stderrChunks.length > 0
        ? stderrChunks.join("\n")
        : stdoutChunks.join("\n");

      if (code === 0 && !signal) {
        resolve({ success: true, output: stdoutChunks.join("\n") });
      } else {
        resolve({ success: false, output: enhanceNpmError(combined || `Install failed (exit ${code})`) });
      }
    };

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        output: enhanceNpmError(err.message || "Failed to spawn pi install"),
      });
    });

    child.on("close", (code, signal) => finalize(code, signal));

    // 防止“stdout/stderr 永不关闭”这种边缘情况导致 Promise 不 resolve
    // 实际上 close 事件已经足够，这里不做额外处理
    void stdoutClosed; void stderrClosed;
  });
}

export function runPiUninstall(pkgName: string): { success: boolean; output: string } {
  // Quick sync pre-flight cache check
  const quickCheck = detectNpmCachePermissionIssues();
  if (quickCheck.count > 0) {
    return { success: false, output: `npm cache permission error: run 'sudo chown -R $(whoami) ~/.npm' in your terminal.` };
  }
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
    const rawOutput = e.stderr || e.stdout || e.message || "Uninstall failed";
    return { success: false, output: enhanceNpmError(rawOutput) };
  }
}

/** 异步版卸载，不会冻结 UI 事件循环 */
export async function runPiUninstallAsync(pkgName: string, scope?: "user" | "project"): Promise<{ success: boolean; output: string }> {
  // Pre-flight: check npm cache health (lightweight sync check first, async deep check only if needed)
  const quickCheck = detectNpmCachePermissionIssues();
  if (quickCheck.count > 0) {
    const cacheCheck = await ensureNpmCacheHealthyAsync();
    if (!cacheCheck.ok) {
      return { success: false, output: `npm cache permission error:\n${cacheCheck.message}` };
    }
  }

  const { execFile } = await import("node:child_process");
  const source = normalizeInstallSource(pkgName);
  const args = scope === "project" ? ["uninstall", source, "-l"] : ["uninstall", source];
  return new Promise((resolve) => {
    execFile("pi", args, {
      encoding: "utf-8",
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        const rawOutput = stderr || stdout || err.message || "Uninstall failed";
        const output = enhanceNpmError(rawOutput);
        resolve({ success: false, output });
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

/** 创建带超时的 fetch AbortController */
function fetchTimeout(ms: number): AbortController {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl;
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
  const ctrl = fetchTimeout(15_000);
  const response = await fetch(url, { signal: ctrl.signal }).catch(() => null);
  if (!response || !response.ok) return [];

  const data = await response.json() as NpmSearchResponse;

  const installedPkgs = getInstalledPackagesCached();
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
  const installedPkgs = getInstalledPackagesCached();
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

// ─── Error Enhancement ──────────────────────────────────

/**
 * 增强 npm 错误输出，对 EACCES/EEXIST 等权限错误添加可操作的修复建议。
 */
function enhanceNpmError(rawOutput: string): string {
  const isPermissionError = rawOutput.includes("EACCES") || rawOutput.includes("permission denied");
  const isEexistError = rawOutput.includes("EEXIST") || rawOutput.includes("File exists");

  if (isPermissionError || isEexistError) {
    const currentUser = userInfo().username;
    return [
      rawOutput,
      "",
      "━━━ npm Cache Permission Error ━━━",
      "",
      "The npm cache contains files/directories owned by another user (likely root).",
      "This usually happens when npm was previously run with sudo.",
      "",
      "To fix, run in your terminal:",
      `  sudo chown -R ${currentUser} ~/.npm`,
      "",
      "Or alternatively:",
      "  sudo npm cache clean --force",
    ].join("\n");
  }

  return rawOutput;
}

// ─── Helpers ─────────────────────────────────────────────

function readSettings(settingsFile = SETTINGS_FILE): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsFile, "utf-8"));
  } catch {
    return {};
  }
}

export type PackageRef = { ref: string; scope: "user" | "project" };

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
