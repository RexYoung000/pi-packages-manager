# pi-packages-manager

A Pi packages manager extension. Browse, search, install, update, and remove
Pi packages without leaving Pi. Inspired by the Claude Code package UX.

[English](README.md) · [简体中文](docs/README.zh-CN.md) · [Pi Discussion](https://github.com/earendil-works/pi/discussions/5322) · [npm](https://www.npmjs.com/package/pi-packages-manager)

![status](https://img.shields.io/badge/status-1.1.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## Features

- 📦 Claude-style overlay panel with `Tab` to switch between Installed,
  Browse, Updates, and Settings
- 🌐 Multi-language UI (English, 简体中文, 繁體中文, 日本語, 한국어) with an
  in-panel language switcher that takes effect immediately
- 🔍 Fast catalog with disk cache and fuzzy ranking; supports filters like
  `type:skill`, `source:npm`, `scope:project`, `installed`, `updates`
- ⬇️ Install / remove / update flows with scope selection (Global vs Project),
  safety confirmation and reload prompt
- ⬆️ Update all with skip detection for pinned, git and local sources
- 🛡️ Detail page surfacing extensions, skills, prompts, themes, source type
  and trust warnings
- 🔒 **Pre-install security audit**: every install runs a two-layer static
  analysis (metadata + source-code keyword scan) with 4-tier risk
  classification. High/critical packages require explicit "Install anyway"
  confirmation.
- 🤖 **Natural language tools**: 4 LLM-callable tools (`packages_search`,
  `packages_detail`, `packages_audit`, `packages_install`) — ask Pi to
  find, audit, or install packages in plain English.
- 🔍 **Audit in detail page**: one-click "Run security audit" button on
  every package detail page, with results embedded inline.
- 🧭 Subcommands for power users: `list`, `search`, `install`, `remove`,
  `update`, `info`, `settings`, `refresh`, `panel`, `legacy`

## Install

### From npm

```bash
pi install npm:pi-packages-manager
```

### From GitHub

```bash
pi install git:github.com/RexYoung000/pi-packages-manager
```

### From a local checkout

```bash
git clone https://github.com/RexYoung000/pi-packages-manager.git
pi install /path/to/pi-packages-manager
```

After install, reload Pi:

```text
/reload
```

## Security audit

Every `install` (and `update`) runs a two-layer static audit before the
final confirmation:

1. **Metadata** via `npm view`: dependency count, peer count, file count,
   unpacked size, npm `flags.insecure`, last-published date, declared
   resource types.
2. **Source code keyword scan** via `npm pack` + `tar` + grep against 15
   known-dangerous patterns (`rm -rf`, `rimraf`, `fs.unlink`, `eval`,
   `Function()`, `execSync`, `spawn`, `child_process`, `process.env`,
   `chmod`, ...). Files larger than 1.5 MB are skipped to keep audits
   snappy; `node_modules`, `test/`, `coverage/` are ignored.

Findings are aggregated into a 4-tier risk:

| Badge | Meaning | UX |
| --- | --- | --- |
| 🟢 safe | No findings in deep scan | Plain confirm with summary |
| 🟢 low / 🟡 medium | Only low/medium findings, or 3+ medium | Plain confirm with summary |
| 🟠 high | Any `high` finding, or high finding inside an extension | Two-step select — must pick "Install anyway" |
| 🔴 critical | Any `critical` finding | Two-step select — must pick "Install anyway" |

The audit is fail-safe: if `npm view` or `npm pack` fails (network,
timeout, etc.), the install is **not** blocked, but the failure is shown
in the confirm dialog so the user can decide.

You can also trigger an audit from the **detail page** — click "🔍 Run security
audit" to scan any package on demand.

Credits: the audit module is adapted from
[pi-marketplace](https://github.com/507/pi-marketplace).

## Natural language tools

This extension registers 4 tools that the LLM can call directly. Try saying:

> "Find me a Pi package for MCP"

> "Show me details of pi-tinyfish-tools"

> "Audit the package pi-mcp-adapter before installing"

> "Install pi-autoname"

| Tool | What it does |
| --- | --- |
| `packages_search` | Search packages by keyword, filter by type |
| `packages_detail` | Full package info: version, author, resources, links |
| `packages_audit` | Security audit: metadata + source code scan |
| `packages_install` | Audit → confirm → install |

These tools coexist with the `/packages-list` command — use whichever feels
more natural.

## Usage

Open the overlay panel:

```text
/packages-list
```

| Key | Action |
| --- | --- |
| `Tab` / `⇧Tab` | Switch tabs |
| `↑` / `↓` | Navigate |
| `Enter` | Open package detail |
| `/` | Focus search bar |
| `g` (Settings tab) | Reminder to run `pi config` |
| `Esc` / `q` | Close panel |

### Subcommands

```text
/packages-list list                       # installed packages
/packages-list search [query]             # browse community
/packages-list install <source>           # install a package
/packages-list remove <source>            # remove a package
/packages-list update [source]            # update one or all
/packages-list info <source>              # detail page
/packages-list settings                   # legacy settings view
/packages-list refresh                    # clear catalog cache
/packages-list panel                      # explicit overlay
/packages-list legacy                     # classic select menu
```

### Switch language

Open the panel, press `Tab` to focus the **Settings** tab, choose a language
and press `Enter`. The change is applied immediately and persisted to:

```text
~/.pi/agent/extensions/pi-packages-manager/data/preferences.json
```

For project-level overrides, create:

```text
<cwd>/.pi/pi-packages-manager.json
```

with content:

```json
{
  "locale": "zh-CN"
}
```

Supported locales: `en`, `zh-CN`, `zh-TW`, `ja`, `ko`.

## Development

Run the extension directly from source:

```bash
pi -e ./src/index.ts
```

Run tests:

```bash
npm test
```

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

Next up: detail side panel, in-panel shortcuts, filter chips.

## License

MIT © RexYoung000
