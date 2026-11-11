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
- One runtime-verified Codex port: `project-flow`.
- Deterministic Node test suite, isolated runtime harness, CI, security scan, license gate, and weekly upstream-report workflow.

CCPM was audited first. It already supports Codex through the Agent Skills format, so CODEX//FORGE does not duplicate it. The first independent port is `project-flow`, which provides a smaller Codex-native project workflow without copying CCPM or its source files.

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
node packages/cli/cli.mjs install project-flow --dry-run
node packages/cli/cli.mjs install project-flow
node packages/cli/cli.mjs uninstall project-flow --dry-run
node packages/cli/cli.mjs uninstall project-flow --approve
```

`install` refuses every entry that is not marked `runtime-verified`, has a valid manifest, and has matching SHA-256 hashes. It installs only into the documented Codex skill root, `~/.agents/skills` (or `CODEX_SKILL_ROOT` for isolated testing). Existing installations require `--approve-overwrite` and are moved to a backup first. `uninstall` also creates a recoverable backup. Both support dry runs; a failed replacement rolls back.

## Install a verified port

`project-flow` is discovered by Codex through its installed `SKILL.md` and runs with Node.js 20+:

```powershell
node packages/cli/cli.mjs install project-flow --dry-run
node packages/cli/cli.mjs install project-flow --approve-overwrite
node "$HOME/.agents/skills/project-flow/scripts/project-flow.mjs" plan --slug checkout --title "Checkout" --requirements "Track the checkout work safely."
```

The workflow keeps local state in `.codex-forge/projects/<slug>/`, requires explicit `--passed` evidence to complete a task, and defaults GitHub Issue and worktree operations to dry-run. Passing `--approve` is required for those external writes.

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
