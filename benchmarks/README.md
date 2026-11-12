# Phase 5 evidence benchmarks

This benchmark compares the same local Codex CLI, task prompt, fixture, and execution settings in two conditions:

1. **Baseline** — no project `.agents/skills` directory and no skill activation.
2. **Skill-assisted** — exactly one verified CODEX//FORGE port installed into the temporary project and explicitly activated with `$skill-name`.

The harness creates a fresh Git repository for every condition. It keeps hidden grading criteria in the runner process and never copies them into the agent workspace. Graders check concrete artifacts, source behavior, and test results; they do not score response length or prose polish. JSONL traces are retained only in temporary directories and are not published.

The five deterministic fixtures cover architecture, code review, debugging, security, and testing. Each pair records Codex version, model setting, configuration, prompt hash, elapsed time, command count, token usage when emitted, skill-read evidence, and objective score. A score delta is reported as improvement, regression, or tie; no percentage is claimed unless the completed trials support it.

Run locally with Node.js 20+:

```powershell
npm run benchmark:skills
```

Use `CODEX_BENCHMARK_RUNS=2` for two repetitions. The command uses the local Codex CLI with `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, and an isolated workspace. It does not use API keys, MCP servers, network access, package installation, or paid API calls. The latest public summary is written to `benchmarks/results/phase-5-latest.json` and copied to the website as `evidence.json`.

Compatibility and execution are separate from quality. A port can be runtime-verified while its benchmark result is tied, negative, or unavailable. This suite is a controlled signal, not a claim of general model improvement.
