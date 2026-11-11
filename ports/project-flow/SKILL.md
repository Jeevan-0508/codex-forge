---
name: project-flow
description: Codex-native project planning and delivery workflow using local PRDs, task decomposition, GitHub Issues, acceptance criteria, progress state, and guarded Git worktrees.
metadata:
  source: Yeachan-Heo/oh-my-claudecode
  source-license: MIT
  implementation: independent-codex-adapter
  verification:
    harness: passed
    real-codex-session: passed
---

# Project Flow

Use this skill when a feature needs a written plan, decomposed tasks, progress tracking, acceptance criteria, or a guarded handoff to GitHub Issues and Git worktrees.

This is an independent Codex implementation. It does not copy upstream files and does not require Claude Code.

## Safe workflow

Run the bundled script from the project root:

```text
node <installed-skill>/scripts/project-flow.mjs plan --slug <feature> --title "<title>" --requirements "<requirements>"
node <installed-skill>/scripts/project-flow.mjs decompose --slug <feature> --task "Task one" --task "Task two"
node <installed-skill>/scripts/project-flow.mjs status --slug <feature>
node <installed-skill>/scripts/project-flow.mjs complete --slug <feature> --task TASK-001 --test "npm test" --acceptance "All acceptance criteria pass" --passed
```

The state is stored under `.codex-forge/projects/<slug>/`:

- `PRD.md` — requirements and acceptance boundary.
- `state.json` — task status, tests, acceptance evidence, and timestamps.

## GitHub Issues and worktrees

These commands are explicit-write operations. Inspect the dry run first and pass `--approve` only after reviewing the target repository and issue body:

```text
node <installed-skill>/scripts/project-flow.mjs issue --slug <feature> --task TASK-001 --repo OWNER/REPO --dry-run
node <installed-skill>/scripts/project-flow.mjs issue --slug <feature> --task TASK-001 --repo OWNER/REPO --approve
node <installed-skill>/scripts/project-flow.mjs worktree --slug <feature> --task TASK-001 --base main --dry-run
node <installed-skill>/scripts/project-flow.mjs worktree --slug <feature> --task TASK-001 --base main --approve
```

The script uses argument arrays with `gh` and `git`; it does not invoke a shell or execute commands embedded in task text. It never submits applications, commits credentials, or claims tests passed without `--passed` evidence.
