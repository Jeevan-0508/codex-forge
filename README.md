# CODEX//FORGE

**Claude-first tools. Codex-native experiences.**

CODEX//FORGE is a development-stage toolkit for discovering Claude Code projects, assessing portability and licensing evidence, converting safe Markdown skills into Codex Agent Skills, and validating the generated output.

Live catalog: [jeevan-0508.github.io/codex-forge](https://jeevan-0508.github.io/codex-forge/)

## What works now

- Local catalog with eight metadata-backed seed projects from GitHub.
- GitHub repository discovery with pagination, optional token auth, and no cloning or execution.
- Compatibility classes A–F with explicit confidence and license evidence.
- Safe Markdown skill conversion with dry-run mode and conversion records.
- Validation for frontmatter, suspicious installer pipelines, and common credential patterns.
- Searchable static GitHub Pages catalog.
- Deterministic Node test suite, CI, security scan, license gate, and weekly upstream-report workflow.

This release has **zero runtime-verified ports**. “Metadata-reviewed” and “conversion-only” are deliberately not presented as functional compatibility.

## CLI

Requires Node.js 20+ and has no npm runtime dependencies.

```powershell
node packages/cli/cli.mjs search memory
node packages/cli/cli.mjs inspect claude-mem
node packages/cli/cli.mjs compatibility claude-mem
node packages/cli/cli.mjs discover "claude code skills" --pages 2
node packages/cli/cli.mjs convert fixtures/sample-claude-skill --out .tmp/sample-port --dry-run
node packages/cli/cli.mjs convert fixtures/sample-claude-skill --out .tmp/sample-port
node packages/cli/cli.mjs validate .tmp/sample-port
```

`install` refuses every entry that is not marked `runtime-verified`; no unverified upstream project is installed. The converter never executes upstream scripts, migrates credentials, or writes outside the requested output directory.

## Compatibility classes

| Class | Meaning |
|---|---|
| A | Claude-exclusive capability that is portable to Codex |
| B | Partially portable; an adapter or limitation is required |
| C | Already Codex-compatible; avoid an unnecessary fork |
| D | Claude-dependent or unavailable in Codex |
| E | License-restricted until permission/evidence is resolved |
| F | Unverified or unsafe |

## Development

```powershell
npm test
npm run verify
```

The website is static and cannot execute conversions. Use the local CLI for conversion and validation. GitHub Actions does not merge generated ports or run arbitrary upstream code.

## License and security

CODEX//FORGE source is MIT licensed. Third-party projects remain under their own licenses. See [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
