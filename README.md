# pi-package-manager

A Pi package manager extension for browsing, searching, installing, updating, and removing Pi packages from inside Pi.

## Status

Early development. The current implementation is migrated from the global `/plugin` extension and will be iterated into a Claude-style package/plugin manager UI.

## Commands

```text
/plugin
/plugin list
/plugin search [query]
/plugin install <source-or-package>
/plugin remove <source-or-package>
/plugin update [source-or-package]
/plugin info <source-or-package>
```

## Local development

Run the extension directly:

```bash
pi -e ./src/index.ts
```

Or install this local package:

```bash
pi install ./path/to/Pi_Plugin_Manager
```

After installing or changing extensions, reload Pi:

```text
/reload
```

## Roadmap

See [docs/PLUGIN_MANAGER_OPTIMIZATION.md](docs/PLUGIN_MANAGER_OPTIMIZATION.md).
```
