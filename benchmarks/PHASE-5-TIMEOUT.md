# Phase 5 architecture timeout investigation

The Phase 5 public record showed an assisted architecture trial with `codex_exit_code: null`, `timed_out: true`, and `elapsed_ms: 6,714,759`. The Phase 5 runner used synchronous `spawnSync('codex', ...)` with a timeout but did not record a termination method, signal, stderr, or child-process state.

## What is established

- The agent read the installed architecture skill before the run stopped.
- No successful final Codex exit was recorded.
- The recorded duration was inconsistent with the configured benchmark deadline.
- The old harness did not prove whether the Codex process, a descendant shell, or Windows cleanup remained active.

## What remains unresolved

The repository does not contain enough evidence to assign a single root cause. The supported hypotheses are an orphaned descendant process on Windows, synchronous child cleanup not terminating the complete tree, or a Codex/CLI-side stall. A blocked prompt cannot be established from the saved JSONL summary.

## Phase 6 correction

The evaluator now uses an asynchronous process runner. Unix-like systems launch a detached process group and terminate the group; Windows uses `taskkill /PID /T /F`. A hard-kill grace period, wall-clock deadline, exit reason, signal, stderr byte count, and termination method are recorded. The runner has direct normal-exit and timeout-tree tests.

The Phase 6 smoke run completed both architecture conditions successfully: baseline `135,500ms`, assisted `169,847ms`, both `7/7`, with `skill_read:true` only for the assisted condition. This is evidence that the new smoke run completed; it does not prove which Phase 5 hypothesis was the original cause.
