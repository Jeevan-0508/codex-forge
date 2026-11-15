# Reproducible demonstrations

All demonstrations run locally and use only the repository, Node.js, and an installed verified port. They do not require credentials, external APIs, MCP servers, or paid services.

| Demo | Fixture | Install | Invocation | Expected artifact | Validation |
| --- | --- | --- | --- | --- | --- |
| SEO audit | [`seo-audit/index.html`](seo-audit/index.html) | `node packages/cli/cli.mjs port install seo-audit` | `node "$HOME/.agents/skills/seo-audit/scripts/seo-audit.mjs" audit demos/seo-audit/index.html --out artifacts/seo-report.json --markdown artifacts/seo-report.md` | JSON and Markdown audit reports | JSON `tool` is `codex-forge/seo-audit`; inspect checks and score |
| Game prototype | Empty output directory | `node packages/cli/cli.mjs port install game-prototype` | `node "$HOME/.agents/skills/game-prototype/scripts/game-prototype.mjs" init artifacts/game --title "Signal Runner" --genre arcade` then `... check artifacts/game --out artifacts/game-check.json` | `game.json`, `index.html`, `game.js`, `game-check.json` | Checker reports `passed: true`; open `index.html` locally |
| Secure review | [`secure-review/insecure-render.js`](secure-review/insecure-render.js) | `node packages/cli/cli.mjs port install jeffallan-secure-code-guardian` | In Codex: `Use $jeffallan-secure-code-guardian to review demos/secure-review/insecure-render.js and write artifacts/security-review.md.` | Prioritized review Markdown | Confirm source location, impact, mitigation, and no fabricated findings |
| Project planning | [`project-planning/requirements.md`](project-planning/requirements.md) | `node packages/cli/cli.mjs port install project-flow` | In Codex: `Use $project-flow to plan and decompose the requirements in demos/project-planning/requirements.md.` | `.codex-forge/projects/demo/PRD.md` and `state.json` | Run `status`; completion requires explicit test evidence |

Windows PowerShell users should replace `$HOME` with `$env:USERPROFILE` or use the installed path shown by the CLI. Uninstall after a demo with `node packages/cli/cli.mjs port uninstall <id> --approve`.
