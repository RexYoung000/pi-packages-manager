/**
 * pi-packages-manager/locale.ts
 *
 * Persist user-selected locale for the manager.
 *
 * Storage: ~/.pi/agent/extensions/pi-packages-manager/data/preferences.json
 *   { "locale": "zh-CN" }
 *
 * Project-level overrides are also supported via:
 *   <cwd>/.pi/pi-packages-manager.json   { "locale": "zh-CN" }
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  getLocaleOverride,
  type Locale,
  setLocaleOverride,
} from "./i18n";

const HOME = process.env.HOME!;
const GLOBAL_PREFS_FILE = join(
  HOME,
  ".pi/agent/extensions/pi-packages-manager/data/preferences.json",
);
const PROJECT_PREFS_FILE = ".pi/pi-packages-manager.json";

interface Preferences {
  locale?: Locale;
}

function readJsonSafe(path: string): Preferences {
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, "utf-8")) as Preferences;
  } catch {
    return {};
  }
}

function writeJson(path: string, value: Preferences): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

/**
 * Load locale preference from project (preferred) then global,
 * apply it to the i18n module, and return the effective locale.
 */
export function loadStoredLocale(cwd: string = process.cwd()): Locale | undefined {
  const projectPath = join(cwd, PROJECT_PREFS_FILE);
  const projectPrefs = readJsonSafe(projectPath);
  if (projectPrefs.locale) {
    setLocaleOverride(projectPrefs.locale);
    return projectPrefs.locale;
  }

  const globalPrefs = readJsonSafe(GLOBAL_PREFS_FILE);
  if (globalPrefs.locale) {
    setLocaleOverride(globalPrefs.locale);
    return globalPrefs.locale;
  }

  return undefined;
}

/**
 * Persist locale preference to the global preferences file and
 * apply it immediately.
 */
export function saveLocale(locale: Locale | undefined): void {
  const prefs = readJsonSafe(GLOBAL_PREFS_FILE);
  if (locale) {
    prefs.locale = locale;
  } else {
    delete prefs.locale;
  }
  writeJson(GLOBAL_PREFS_FILE, prefs);
  setLocaleOverride(locale);
}

export function getStoredLocale(): Locale | undefined {
  return getLocaleOverride();
}

/**
 * v1.3.0 J4: 返回当前生效的语言偏好来源。
 * - "project": 来自 <cwd>/.pi/pi-packages-manager.json
 * - "global": 来自 ~/.pi/agent/extensions/pi-packages-manager/data/preferences.json
 * - "default": 没有偏好，使用 i18n 默认
 */
export function getLocaleSource(cwd: string = process.cwd()): {
  source: "project" | "global" | "default";
  locale: Locale | undefined;
  path: string | null;
} {
  const projectPath = join(cwd, PROJECT_PREFS_FILE);
  const projectPrefs = readJsonSafe(projectPath);
  if (projectPrefs.locale) {
    return { source: "project", locale: projectPrefs.locale, path: projectPath };
  }

  const globalPrefs = readJsonSafe(GLOBAL_PREFS_FILE);
  if (globalPrefs.locale) {
    return { source: "global", locale: globalPrefs.locale, path: GLOBAL_PREFS_FILE };
  }

  return { source: "default", locale: undefined, path: null };
}

/**
 * v1.3.0 J3: 一键重置所有偏好（语言 + 项目级覆盖）。
 * 返回被清除的偏好描述，用于 notify。
 */
export function resetAllPreferences(cwd: string = process.cwd()): {
  clearedGlobal: boolean;
  clearedProject: boolean;
} {
  let clearedGlobal = false;
  let clearedProject = false;

  // 清全局
  try {
    if (existsSync(GLOBAL_PREFS_FILE)) {
      const prefs = readJsonSafe(GLOBAL_PREFS_FILE);
      if (prefs.locale) {
        delete prefs.locale;
        writeJson(GLOBAL_PREFS_FILE, prefs);
        clearedGlobal = true;
      }
    }
  } catch {
    // ignore
  }

  // 清项目级
  try {
    const projectPath = join(cwd, PROJECT_PREFS_FILE);
    if (existsSync(projectPath)) {
      const prefs = readJsonSafe(projectPath);
      if (prefs.locale) {
        delete prefs.locale;
        writeJson(projectPath, prefs);
        clearedProject = true;
      }
    }
  } catch {
    // ignore
  }

  // 重置内存中的 override
  setLocaleOverride(undefined);

  return { clearedGlobal, clearedProject };
}
