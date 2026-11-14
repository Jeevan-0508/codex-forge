---
name: game-prototype
description: Create and validate a dependency-free playable browser-game vertical slice with deterministic local checks.
metadata:
  source: Donchitos/Claude-Code-Game-Studios
  source-license: MIT
  implementation: independent-codex-adapter
  verification:
    harness: pending
    real-codex-session: pending
---

# Game Prototype

Use this skill when a project needs a small playable browser-game slice, an explicit game manifest, and a repeatable validation receipt. Start with a short concept and keep the first slice intentionally small.

```text
node <installed-skill>/scripts/game-prototype.mjs init prototypes/my-game --title "Dusk Catch" --genre arcade
node <installed-skill>/scripts/game-prototype.mjs check prototypes/my-game --out artifacts/game-check.json
```

The initializer creates a self-contained Canvas prototype with no package install, network access, hooks, engine, or external assets. The checker validates the manifest, HTML canvas, JavaScript entrypoint, and a stated win condition. Read the generated files and run the checker before claiming the prototype is complete.

This is a narrow Codex port of the upstream idea, not a port of its Claude agents, hooks, studio registry, shell helpers, or asset pipeline. Do not execute arbitrary upstream scripts.
