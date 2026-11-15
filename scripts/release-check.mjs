import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../packages/installer/install.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const help = spawnSync(process.execPath, [path.join(root, 'packages/cli/cli.mjs'), '--help'], { cwd: root, encoding: 'utf8', windowsHide: true });
if (help.status !== 0 || !help.stdout.includes(`codex-forge ${packageJson.version}`)) throw new Error('package version and CLI version are inconsistent');
const ports = JSON.parse(fs.readFileSync(path.join(root, 'ports/index.json'), 'utf8'));
const manifests = [];
for (const port of ports) {
  const candidates = [path.join(root, 'ports', port.id), path.join(root, 'ports', 'jeffallan', port.id)];
  const dir = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'PORT.json')));
  if (!dir) throw new Error(`manifest missing for ${port.id}`);
  const manifest = validateManifest(dir);
  if (manifest.verification_status !== 'runtime-verified') throw new Error(`${port.id} is not runtime-verified`);
  manifests.push({ id: port.id, revision: manifest.source.revision });
}
const npmCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm';
const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd pack --dry-run --json'] : ['pack', '--dry-run', '--json'];
const pack = spawnSync(npmCommand, npmArgs, { cwd: root, encoding: 'utf8', windowsHide: true });
if (pack.status !== 0) throw new Error(`npm pack --dry-run failed: ${pack.error?.message || pack.stderr || pack.stdout}`);
const packData = JSON.parse(pack.stdout);
const files = packData[0]?.files || [];
const unsafe = files.filter((entry) => /(?:\.env$|node_modules|\.tmp|checkpoint|events\.jsonl|credentials|secret)/i.test(entry.path));
if (unsafe.length) throw new Error(`unsafe package files: ${unsafe.map((entry) => entry.path).join(', ')}`);
console.log(JSON.stringify({ package: packageJson.name, version: packageJson.version, npm_registry_publication: 'not performed', ports: manifests.length, package_files_checked: files.length, manifests }, null, 2));
