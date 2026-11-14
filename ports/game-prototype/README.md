# Game Prototype — Codex port

Create a small playable browser-game slice without installing an engine:

```text
node scripts/game-prototype.mjs init prototypes/my-game --title "Dusk Catch" --genre arcade
node scripts/game-prototype.mjs check prototypes/my-game --out artifacts/game-check.json
```

The output is a local `index.html`, `game.js`, and `game.json` that can be opened in a browser. The checker is deterministic and suitable for CI or a Codex acceptance receipt.
