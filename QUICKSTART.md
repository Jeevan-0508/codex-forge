# CODEX//FORGE quick start

This route uses a GitHub checkout and does not require a global npm package. It works in Windows PowerShell, macOS, and Linux with Node.js 20+ and Git.

## 1. Clone and discover

```sh
git clone https://github.com/Jeevan-0508/codex-forge.git
cd codex-forge
node packages/cli/cli.mjs port list
node packages/cli/cli.mjs port search SEO
node packages/cli/cli.mjs port inspect seo-audit
```

The catalog currently contains eight runtime-verified ports: `project-flow`, five Jeff Allan skills, `seo-audit`, and `game-prototype`.

## 2. Install safely

Preview before copying into `~/.agents/skills`:

```sh
node packages/cli/cli.mjs port install seo-audit --dry-run
node packages/cli/cli.mjs port install seo-audit
```

Windows PowerShell uses the same commands. To isolate a test without touching your normal Codex skills:

```powershell
$env:CODEX_SKILL_ROOT = Join-Path $env:TEMP 'codex-forge-skills'
node packages/cli/cli.mjs port install seo-audit --dry-run
node packages/cli/cli.mjs port install seo-audit
```

Start a new Codex session after installation. Ask Codex to use `$seo-audit`; the installed `SKILL.md` and local script are discovered from the skill root.

## 3. Produce and verify useful output

```sh
node "$HOME/.agents/skills/seo-audit/scripts/seo-audit.mjs" audit demos/seo-audit/index.html --out artifacts/seo-report.json --markdown artifacts/seo-report.md
```

Verify that the JSON has `tool: codex-forge/seo-audit`, a numeric score, and individual checks. The audit is local static analysis; it does not fetch a website or measure search rankings.

For game prototyping:

```sh
node "$HOME/.agents/skills/game-prototype/scripts/game-prototype.mjs" init artifacts/game --title "Signal Runner" --genre arcade
node "$HOME/.agents/skills/game-prototype/scripts/game-prototype.mjs" check artifacts/game --out artifacts/game-check.json
```

Windows PowerShell users can replace `$HOME` with `$env:USERPROFILE` and use backslashes, or copy the installed path returned by the CLI.

## 4. Upgrade, rollback, uninstall

```sh
node packages/cli/cli.mjs port upgrade seo-audit --dry-run
node packages/cli/cli.mjs port upgrade seo-audit --approve-overwrite
node packages/cli/cli.mjs port uninstall seo-audit --dry-run
node packages/cli/cli.mjs port uninstall seo-audit --approve
```

Replacement is approval-gated and backs up the existing installation. A failed copy rolls back. Uninstall moves the skill to a recoverable backup rather than deleting it immediately.

## 5. Measure the complete path

```sh
npm run onboarding:acceptance
```

The acceptance test uses a temporary skill root, inspects a port, previews and performs installation, runs the installed SEO script, verifies the report, uninstalls the port, and prints elapsed milliseconds. It does not change your global Codex configuration.
