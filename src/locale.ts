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
