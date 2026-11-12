# Phase 5 evidence benchmarks

This benchmark compares the same local Codex CLI, task prompt, fixture, and execution settings in two conditions:

1. **Baseline** — no project `.agents/skills` directory and no skill activation.
2. **Skill-assisted** — exactly one verified CODEX//FORGE port installed into the temporary project and explicitly activated with `$skill-name`.

The harness creates a fresh Git repository for every condition. It keeps hidden grading criteria in the runner process and never copies them into the agent workspace. Graders check concrete artifacts, source behavior, and test results; they do not score response length or prose polish. JSONL traces are retained only in temporary directories and are not published.

The five deterministic fixtures cover architecture, code review, debugging, security, and testing. Each pair records Codex version, model setting, configuration, prompt hash, elapsed time, command count, token usage when emitted, skill-read evidence, and objective score. A score delta is reported as improvement, regression, or tie; no percentage is claimed unless the completed trials support it.

Run the small smoke evaluation locally with Node.js 20+:

```powershell
npm run benchmark:skills
```

The smoke mode runs one fixture per skill category. The explicitly invoked full evaluation adds distinct architecture, review, debugging, security, and testing fixtures:

```powershell
$env:CODEX_BENCHMARK_RUNS='2'
npm run benchmark:skills:full
npm run benchmark:skills:resume
```

Condition order is randomized deterministically from `CODEX_BENCHMARK_SEED`. Every trial gets a fresh repository and writes a checkpoint after completion. `--resume` skips completed keys after interruption. The process runner enforces a wall-clock deadline and kills the complete process tree on Windows and Unix-like systems. Each result records exit reason, timeout, signal, termination method, stderr size, command counts, model when emitted, input/cached/output tokens, and latency separately.

The command uses the local Codex CLI with `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, and an isolated workspace. It does not use API keys, MCP servers, network access, package installation, or paid API calls. Phase 6 results are written to `benchmarks/results/phase-6-latest.json`; they are not published until a completed evaluation is explicitly reviewed.

Compatibility and execution are separate from quality. A port can be runtime-verified while its benchmark result is tied, negative, invalid, or unavailable. This suite is a controlled signal, not a claim of general model improvement. Hidden grading criteria are loaded by the harness and are never copied into the Codex workspace.
