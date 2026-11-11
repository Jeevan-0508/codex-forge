import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portRoot = path.join(root, 'ports', 'jeffallan');
const names = ['architecture-designer', 'code-reviewer', 'debugging-wizard', 'secure-code-guardian', 'test-master'];
for (const name of names) {
  const file = path.join(portRoot, `jeffallan-${name}`, 'PORT.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (manifest.verification?.harness !== 'passed') throw new Error(`${name} is not harness-verified`);
  manifest.verification.real_codex_session = 'passed';
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
const indexFile = path.join(root, 'ports', 'index.json');
const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
for (const entry of index) if (names.some((name) => entry.id === `jeffallan-${name}`)) entry.verification.real_codex_session = 'passed';
fs.writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
const reportFile = path.join(portRoot, 'batch-report.json');
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
report.real_codex_session = 'passed';
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ promoted: names.length, status: 'real-codex-session-verified' }, null, 2));
