# pi-packages-manager

A Pi packages manager extension. Browse, search, install, update, and remove
Pi packages without leaving Pi. Inspired by the Claude Code package UX.

[English](README.md) · [简体中文](README.zh-CN.md)

![status](https://img.shields.io/badge/status-1.0.0-blue)
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
- 🧭 Subcommands for power users: `list`, `search`, `install`, `remove`,
  `update`, `info`, `settings`, `refresh`, `panel`, `legacy`

## Install

### From npm (when published)

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
| `/` (Browse tab) | Open search flow |
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

Smoke-test loading:

```bash
node -e 'import("@earendil-works/pi-coding-agent/dist/core/extensions/loader.js").then(({loadExtensions})=>loadExtensions(["./src/index.ts"], process.cwd())).then(r=>console.log(r.errors,r.extensions[0].commands.keys()))'
```

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md).

Next up: live search input, detail side panel, in-panel install/remove
shortcuts.

## License

MIT © RexYoung000
