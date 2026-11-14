import fs from 'node:fs';
import path from 'node:path';

function fail(message) { console.error(message); process.exit(2); }
function get(args, name, fallback = '') { const i = args.indexOf(name); return i >= 0 ? args[i + 1] || fallback : fallback; }
function init(dir, args) {
  const title = get(args, '--title', 'Codex Game');
  const genre = get(args, '--genre', 'arcade');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'game.json'), `${JSON.stringify({ title, genre, controls: 'Arrow keys', win_condition: 'Reach 10 points', entry: 'index.html' }, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p id="status">Score: 0 · Use arrow keys</p><canvas id="game" width="640" height="360" aria-label="${title} game"></canvas></main><script src="game.js"></script></body></html>\n`);
  fs.writeFileSync(path.join(dir, 'game.js'), `const canvas = document.querySelector('#game');\nconst context = canvas.getContext('2d');\nconst player = { x: 300, y: 160, size: 24, score: 0 };\nconst keys = new Set();\ndocument.addEventListener('keydown', event => keys.add(event.key));\ndocument.addEventListener('keyup', event => keys.delete(event.key));\nfunction frame() { if (keys.has('ArrowLeft')) player.x -= 3; if (keys.has('ArrowRight')) player.x += 3; if (keys.has('ArrowUp')) player.y -= 3; if (keys.has('ArrowDown')) player.y += 3; player.x = Math.max(0, Math.min(canvas.width - player.size, player.x)); player.y = Math.max(0, Math.min(canvas.height - player.size, player.y)); context.clearRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#13233f'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#62d9a7'; context.fillRect(player.x, player.y, player.size, player.size); document.querySelector('#status').textContent = 'Score: ' + player.score + ' · Use arrow keys'; requestAnimationFrame(frame); }\nframe();\n`);
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${title}\n\nA ${genre} browser-game vertical slice. Open index.html, move with the arrow keys, and keep the win condition in game.json visible while iterating.\n`);
  console.log(JSON.stringify({ created: path.resolve(dir), files: ['game.json', 'index.html', 'game.js', 'README.md'] }, null, 2));
}
function check(dir, out) {
  const required = ['game.json', 'index.html', 'game.js', 'README.md'];
  const missing = required.filter((name) => !fs.existsSync(path.join(dir, name)));
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8')); } catch { missing.push('valid game.json'); }
  const checks = [
    { id: 'required-files', pass: missing.length === 0, message: missing.length ? `Missing: ${missing.join(', ')}` : 'All prototype files exist' },
    { id: 'manifest', pass: Boolean(manifest?.title && manifest?.genre && manifest?.win_condition), message: manifest ? 'Manifest has title, genre, and win condition' : 'Manifest is invalid' },
    { id: 'canvas', pass: fs.existsSync(path.join(dir, 'index.html')) && /<canvas\b/i.test(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')), message: 'HTML declares a canvas' },
    { id: 'entrypoint', pass: fs.existsSync(path.join(dir, 'game.js')) && /requestAnimationFrame|canvas\.getContext/.test(fs.readFileSync(path.join(dir, 'game.js'), 'utf8')), message: 'JavaScript contains a browser loop' }
  ];
  const report = { tool: 'codex-forge/game-prototype', input: path.basename(dir), passed: checks.every((item) => item.pass), checks };
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(path.resolve(out), `${JSON.stringify(report, null, 2)}\n`); }
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
const [, , command, target, ...args] = process.argv;
if (!command || !target || !['init', 'check'].includes(command)) fail('Usage: game-prototype.mjs init|check <directory> [options]');
const dir = path.resolve(target);
if (command === 'init') init(dir, args); else check(dir, get(args, '--out'));
