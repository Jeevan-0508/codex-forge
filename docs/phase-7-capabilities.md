# Phase 7 capability expansion

## Candidates audited

| Project | Revision audited | License | Decision | Reason |
| --- | --- | --- | --- | --- |
| [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) | `abc0de79d6ceb0b5d7aa693945849b3937afbe6a` | MIT | Narrow port selected | High-value browser-game prototyping workflow; Claude agents, hooks, registries, and optional toolchains were excluded. |
| [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) | `cca7e4a267991aca880efade1fd12e8498caf2ce` | MIT | Narrow port selected | Useful local static SEO evidence; Python/browser/Google/MCP/report extensions were excluded. |
| [JeffAllan/claude-skills](https://github.com/Jeffallan/claude-skills) | `078a25cc5bfd8011459be7b91d004e900c1d02d3` | MIT | Rejected for Phase 7 | Five useful skills from this collection are already published ports. |
| [Pimzino/spec-workflow-mcp](https://github.com/Pimzino/spec-workflow-mcp) | `d38e82eaa8a6a2f5480285fa1feb8cf8378c86e0` | GPL-3.0 | Rejected | License and MCP/dashboard/runtime dependencies do not fit a safe narrow redistribution; functionality overlaps `project-flow`. |
| [zenstory-ai/novel-to-game](https://github.com/zenstory-ai/novel-to-game) | catalog audit | MIT | Rejected | The repository already advertises Codex support, so it is not a missing Claude-only capability. |
| [akii-technologies-ltd/akii-seo-ai-search-optimizer](https://github.com/akii-technologies-ltd/akii-seo-ai-search-optimizer) | `9bf6fa45aacdc1b541355f39e243c9c9ba22394d` | MIT | Rejected | SEO scope overlaps the selected local port and includes optional telemetry/MCP/service integrations. |

Additional GitHub discovery found other MIT projects, but candidates advertising Codex support or duplicating SEO/project-management capability were not promoted. No external MCP server or dependency was installed.

## Ports

### `seo-audit`

An independent, dependency-free Node adapter that checks a local HTML file for doctype, language, title, description, canonical, viewport, heading, image-alt, links, and JSON-LD signals. It writes deterministic JSON and Markdown receipts. It does not fetch URLs, use Google APIs, measure rankings/Core Web Vitals, or claim AI-search visibility.

### `game-prototype`

An independent, dependency-free Node adapter that initializes a small Canvas browser-game slice (`game.json`, `index.html`, `game.js`, `README.md`) and validates the manifest, canvas, and browser loop. It does not execute upstream scripts or include Claude hooks, agents, engines, or asset services.

Both ports are MIT-cleared, hash-validated, installed only through the existing guarded installer, and runtime-verified in Codex CLI `0.159.2` on Windows 11/Node `v24.21.0`.

## Evidence

The real Codex session generated five non-empty artifacts: SEO JSON/Markdown reports and game manifest/HTML/check JSON. The isolated run completed successfully in `47,688 ms` without network, credentials, paid calls, or package installation.

The paired smoke benchmark ran four valid trials on fresh fixtures. SEO scored `1/3` baseline vs `3/3` assisted; browser-game scored `2/3` baseline vs `3/3` assisted. This is a limited result on two fixtures, not evidence of generalized improvement. The raw record is [`phase-7-latest.json`](../benchmarks/results/phase-7-latest.json). Phase 6 evidence remains separately published at [`phase-6-latest.json`](../benchmarks/results/phase-6-latest.json).
