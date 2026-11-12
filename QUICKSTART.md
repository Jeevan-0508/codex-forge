# CODEX//FORGE quick start

CODEX//FORGE installs only verified ports into Codex’s documented skill directory. It does not edit Codex configuration, add MCP servers, or install project dependencies.

## Requirements

Windows PowerShell, macOS, and Linux are supported with Node.js 20 or newer and Git. Clone this repository, then run commands from its root. There are no npm runtime dependencies.

```text
Verified ports
───────────────
project-flow                         PRDs, tasks, acceptance evidence, guarded worktrees
jeffallan-architecture-designer     architecture and ADR guidance
jeffallan-code-reviewer             evidence-first code review
jeffallan-debugging-wizard          hypothesis-driven debugging
jeffallan-secure-code-guardian      secure coding guidance
jeffallan-test-master               test planning and quality gates
```

## Discover and inspect

```sh
node packages/cli/cli.mjs port list
node packages/cli/cli.mjs port search security
node packages/cli/cli.mjs port inspect jeffallan-code-reviewer
```

## Install safely

Preview first. The default location is `~/.agents/skills` on all three platforms.

```sh
node packages/cli/cli.mjs port install project-flow --dry-run
node packages/cli/cli.mjs port install project-flow
```

On Windows PowerShell:

```powershell
$env:CODEX_SKILL_ROOT = Join-Path $HOME '.agents\skills'
node packages/cli/cli.mjs port install jeffallan-code-reviewer --dry-run
node packages/cli/cli.mjs port install jeffallan-code-reviewer
```

The installer validates the signed manifest shape, hashes, source metadata, license notices, regular-file tree, and runtime verification before copying. Existing installations are never overwritten without approval.

## Upgrade, rollback, and uninstall

An upgrade is an approval-gated replacement. The old installation is moved to a recoverable backup before the new one is activated; a failed copy rolls back.

```sh
node packages/cli/cli.mjs port upgrade project-flow --dry-run
node packages/cli/cli.mjs port upgrade project-flow --approve-overwrite
node packages/cli/cli.mjs port uninstall project-flow --dry-run
node packages/cli/cli.mjs port uninstall project-flow --approve
```

Use `CODEX_SKILL_ROOT` for isolated testing on Windows, macOS, or Linux. Start a new Codex session after installation so the skill can be discovered. Verify status with `port inspect`; runtime verification and benchmark quality are separate claims.
