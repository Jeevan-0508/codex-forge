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
- Six runtime-verified Codex ports: `project-flow` plus five individually installable Jeff Allan skills (deterministic harness and real `codex exec` session verified).
- Phase 5 evidence benchmarks compare baseline Codex with explicitly activated skills on identical isolated fixtures; results distinguish valid quality comparisons from activation failures and timeouts.
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

Verification statuses are separate: `harness` means the local deterministic runner passed; `real_codex_session` means an installed Codex CLI session discovered the skill and exercised its workflow.

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
npm run codex-runtime
npm run benchmark:skills
```

`npm run codex-runtime` launches the installed local Codex CLI in a temporary Git project, asks it to use `project-flow`, and verifies the generated PRD, task decomposition, and status output. It requires a working Codex login; otherwise it reports harness-only evidence. The website is static and cannot execute conversions. Use the local CLI for conversion and validation. GitHub Actions does not merge generated ports or run arbitrary upstream code.

The Jeff Allan batch conversion is reproducible with `node scripts/convert-jeffallan.mjs --source <clone> --revision <sha>`. It discovers all source skill directories, converts only the selected five, preserves reference assets and MIT notices, and records unsupported Claude-specific features. `npm run codex-multiskill-runtime` installs those five into an isolated Codex project and verifies each real skill session before promotion.

Phase 5 benchmarks use five deterministic fixtures for architecture, code review, debugging, security, and testing. The baseline has no project skills; the assisted condition installs exactly one verified port and explicitly activates it. Hidden graders remain outside the temporary project, JSONL traces remain local, and the public summary is `benchmarks/results/phase-5-latest.json`. Runtime compatibility, functional correctness, and quality improvement are reported separately; mixed results are not presented as a general improvement claim.

## License and security

CODEX//FORGE source is MIT licensed. Third-party projects remain under their own licenses. See [SECURITY.md](SECURITY.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
