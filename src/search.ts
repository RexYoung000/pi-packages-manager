import type { PackageInfo } from "./api";

export type ResourceType = "extension" | "skill" | "prompt" | "theme" | "package";
export type SourceType = "npm" | "git" | "local" | "unknown";
export type Scope = "user" | "project" | "temporary";

export interface ParsedPackageQuery {
  raw: string;
  terms: string[];
  filters: {
    type?: ResourceType;
    installed?: boolean;
    updates?: boolean;
    source?: SourceType;
    scope?: Scope;
    author?: string;
  };
}

export interface RankedPackage {
  pkg: PackageInfo;
  score: number;
  reasons: string[];
}

const TYPE_ALIASES: Record<string, ResourceType> = {
  ext: "extension",
  extension: "extension",
  extensions: "extension",
  skill: "skill",
  skills: "skill",
  prompt: "prompt",
  prompts: "prompt",
  theme: "theme",
  themes: "theme",
  package: "package",
  pkg: "package",
};

export function parsePackageQuery(query: string): ParsedPackageQuery {
  const filters: ParsedPackageQuery["filters"] = {};
  const terms: string[] = [];

  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const lower = token.toLowerCase();

    if (lower === "installed") {
      filters.installed = true;
      continue;
    }
    if (lower === "updates" || lower === "update") {
      filters.updates = true;
      continue;
    }

    const match = lower.match(/^(type|source|scope|author):(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (key === "type" && TYPE_ALIASES[value]) filters.type = TYPE_ALIASES[value];
      else if (key === "source" && ["npm", "git", "local", "unknown"].includes(value)) filters.source = value as SourceType;
      else if (key === "scope" && ["user", "project", "temporary"].includes(value)) filters.scope = value as Scope;
      else if (key === "author") filters.author = value;
      else terms.push(token);
      continue;
    }

    terms.push(token);
  }

  return { raw: query, terms, filters };
}

export function rankPackages(packages: PackageInfo[], query: string, limit = 60): PackageInfo[] {
  const parsed = parsePackageQuery(query);
  return rankPackageDetails(packages, parsed)
    .filter((item) => item.score > 0 || hasOnlyFilters(parsed))
    .slice(0, limit)
    .map((item) => ({ ...item.pkg, searchScore: item.score, searchReasons: item.reasons }));
}

export function rankPackageDetails(packages: PackageInfo[], parsed: ParsedPackageQuery): RankedPackage[] {
  const terms = parsed.terms.map((t) => t.toLowerCase());

  return packages
    .filter((pkg) => matchesFilters(pkg, parsed))
    .map((pkg) => {
      let score = 0;
      let termScore = 0;
      const reasons = new Set<string>();
      const name = pkg.name.toLowerCase();
      const shortName = name.includes("/") ? name.split("/").pop() || name : name;
      const desc = (pkg.description || "").toLowerCase();
      const keywords = (pkg.keywords || []).map((k) => k.toLowerCase());
      const author = (pkg.author || "").toLowerCase();
      const types = (pkg.types || []).map((t) => t.toLowerCase());

      if (terms.length === 0) {
        score += basePackageScore(pkg, reasons);
      }

      for (const term of terms) {
        if (!term) continue;
        if (name === term || shortName === term) {
          score += 1000;
          termScore += 1000;
          reasons.add("exact name");
        } else if (name.startsWith(term) || shortName.startsWith(term)) {
          score += 300;
          termScore += 300;
          reasons.add("name prefix");
        } else if (name.includes(term) || shortName.includes(term)) {
          score += 150;
          termScore += 150;
          reasons.add("name match");
        }

        const keywordMatches = keywords.filter((kw) => kw.includes(term)).length;
        if (keywordMatches > 0) {
          score += keywordMatches * 80;
          termScore += keywordMatches * 80;
          reasons.add("keyword match");
        }

        if (types.some((tp) => tp.includes(term))) {
          score += 50;
          termScore += 50;
          reasons.add("type match");
        }

        if (desc.includes(term)) {
          score += 30;
          termScore += 30;
          reasons.add("description match");
        }

        if (author.includes(term)) {
          score += 25;
          termScore += 25;
          reasons.add("author match");
        }
      }

      score += basePackageScore(pkg, reasons);
      if (terms.length > 0 && termScore === 0) score = 0;

      return { pkg, score, reasons: [...reasons] };
    })
    .sort((a, b) => b.score - a.score || comparePackages(a.pkg, b.pkg));
}

function matchesFilters(pkg: PackageInfo, parsed: ParsedPackageQuery): boolean {
  const { filters } = parsed;
  if (filters.installed !== undefined && Boolean(pkg.installed) !== filters.installed) return false;
  if (filters.type && !(pkg.types || []).includes(filters.type)) return false;
  if (filters.source && pkg.sourceType !== filters.source) return false;
  if (filters.scope && pkg.scope !== filters.scope) return false;
  if (filters.author && !(pkg.author || "").toLowerCase().includes(filters.author.toLowerCase())) return false;
  if (filters.updates && !(pkg.latestVersion && pkg.installedVersion && pkg.latestVersion !== pkg.installedVersion)) return false;
  return true;
}

function hasOnlyFilters(parsed: ParsedPackageQuery): boolean {
  return parsed.terms.length === 0 && Object.keys(parsed.filters).length > 0;
}

function basePackageScore(pkg: PackageInfo, reasons: Set<string>): number {
  let score = 0;

  if (pkg.piManifest && Object.keys(pkg.piManifest).length > 0) {
    score += 120;
    reasons.add("pi manifest");
  }

  if ((pkg.keywords || []).includes("pi-package")) {
    score += 100;
    reasons.add("pi-package keyword");
  }

  if (pkg.installed) {
    score += 20;
    reasons.add("installed");
  }

  if (pkg.downloads) {
    score += Math.log10(pkg.downloads + 1) * 10;
    reasons.add("downloads");
  }

  if (pkg.updatedAt) {
    const updated = Date.parse(pkg.updatedAt);
    if (!Number.isNaN(updated)) {
      const ageDays = (Date.now() - updated) / 86_400_000;
      if (ageDays <= 30) {
        score += 20;
        reasons.add("recent update");
      } else if (ageDays <= 180) {
        score += 8;
      }
    }
  }

  return score;
}

function comparePackages(a: PackageInfo, b: PackageInfo): number {
  return (b.downloads || 0) - (a.downloads || 0) || a.name.localeCompare(b.name);
}
