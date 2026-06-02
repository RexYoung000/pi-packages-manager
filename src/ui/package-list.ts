/**
 * pi-packages-manager/ui/package-list.ts
 *
 * Custom scrollable list with relaxed spacing for the overlay panel.
 *
 * Each row is rendered as 3 lines + 1 blank separator:
 *   ● <name>          <badge>
 *     <description>
 *     <meta>
 *
 * Built-in `SelectList` collapses everything to a single line, so we
 * implement our own component with pi-tui primitives.
 */

import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

export interface PackageListItem {
  value: string;
  title: string;
  badge?: string;
  description?: string;
  meta?: string;
}

export interface PackageListTheme {
  selectedTitle: (text: string) => string;
  title: (text: string) => string;
  badge: (text: string) => string;
  description: (text: string) => string;
  meta: (text: string) => string;
  scrollInfo: (text: string) => string;
  empty: (text: string) => string;
  bullet: (text: string) => string;
  selectedBullet: (text: string) => string;
}

const ROW_HEIGHT = 3; // title + description + meta
const ROW_GAP = 1;    // blank separator
const ROW_TOTAL = ROW_HEIGHT + ROW_GAP;

export class PackageList {
  private items: PackageListItem[];
  private maxRows: number;
  private theme: PackageListTheme;
  private selected = 0;
  private offset = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];
  private emptyLabel: string;

  public onSelect?: (item: PackageListItem) => void;
  public onCancel?: () => void;
  public onSelectionChange?: (item: PackageListItem) => void;

  constructor(
    items: PackageListItem[],
    maxRows: number,
    theme: PackageListTheme,
    options: { emptyLabel?: string } = {},
  ) {
    this.items = items;
    this.maxRows = Math.max(1, maxRows);
    this.theme = theme;
    this.emptyLabel = options.emptyLabel ?? "No items";
  }

  setItems(items: PackageListItem[]): void {
    this.items = items;
    this.selected = 0;
    this.offset = 0;
    this.invalidate();
  }

  getSelected(): PackageListItem | undefined {
    return this.items[this.selected];
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.move(-1);
    } else if (matchesKey(data, Key.down)) {
      this.move(1);
    } else if (matchesKey(data, Key.pageUp)) {
      this.move(-this.maxRows);
    } else if (matchesKey(data, Key.pageDown)) {
      this.move(this.maxRows);
    } else if (matchesKey(data, Key.home)) {
      this.selected = 0;
      this.ensureVisible();
      this.invalidate();
    } else if (matchesKey(data, Key.end)) {
      this.selected = Math.max(0, this.items.length - 1);
      this.ensureVisible();
      this.invalidate();
    } else if (matchesKey(data, Key.enter)) {
      const item = this.items[this.selected];
      if (item) this.onSelect?.(item);
    } else if (matchesKey(data, Key.escape)) {
      this.onCancel?.();
    }
  }

  private move(delta: number): void {
    if (this.items.length === 0) return;
    const last = this.items.length - 1;
    let next = this.selected + delta;
    if (next < 0) next = 0;
    if (next > last) next = last;
    if (next === this.selected) return;
    this.selected = next;
    this.ensureVisible();
    this.onSelectionChange?.(this.items[this.selected]);
    this.invalidate();
  }

  private ensureVisible(): void {
    if (this.selected < this.offset) {
      this.offset = this.selected;
    } else if (this.selected >= this.offset + this.maxRows) {
      this.offset = this.selected - this.maxRows + 1;
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }
    const lines: string[] = [];

    if (this.items.length === 0) {
      lines.push("");
      lines.push("  " + this.theme.empty(truncateToWidth(this.emptyLabel, Math.max(1, width - 2), "")));
      lines.push("");
      this.cachedWidth = width;
      this.cachedLines = lines;
      return lines;
    }

    const start = this.offset;
    const end = Math.min(this.items.length, start + this.maxRows);

    for (let i = start; i < end; i++) {
      const item = this.items[i];
      const isSelected = i === this.selected;
      this.renderRow(lines, item, isSelected, width);
      if (i < end - 1) {
        lines.push(""); // blank gap
      }
    }

    if (this.items.length > this.maxRows) {
      const indicator = `  (${this.selected + 1}/${this.items.length})`;
      lines.push(this.theme.scrollInfo(truncateToWidth(indicator, Math.max(1, width - 2), "")));
    }

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  private renderRow(
    lines: string[],
    item: PackageListItem,
    isSelected: boolean,
    width: number,
  ): void {
    const bullet = isSelected ? this.theme.selectedBullet("● ") : this.theme.bullet("○ ");
    const indent = "    ";

    // Line 1: bullet + title (+ optional badge right-aligned)
    const titleStyled = isSelected
      ? this.theme.selectedTitle(item.title)
      : this.theme.title(item.title);
    let titleLine = `  ${bullet}${titleStyled}`;
    if (item.badge) {
      const badgeStyled = this.theme.badge(item.badge);
      const visibleTitle = visibleWidth(`  ● ${item.title}`);
      const visibleBadge = visibleWidth(item.badge);
      const padding = Math.max(1, width - visibleTitle - visibleBadge - 2);
      titleLine = `  ${bullet}${titleStyled}${" ".repeat(padding)}${badgeStyled}`;
    }
    lines.push(truncateToWidth(titleLine, width, "…"));

    // Line 2: description
    const desc = item.description ?? "";
    const descTruncated = truncateToWidth(desc, Math.max(1, width - indent.length), "…");
    lines.push(indent + this.theme.description(descTruncated));

    // Line 3: meta
    const meta = item.meta ?? "";
    const metaTruncated = truncateToWidth(meta, Math.max(1, width - indent.length), "…");
    lines.push(indent + this.theme.meta(metaTruncated));
  }
}
