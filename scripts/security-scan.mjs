import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['.git', 'node_modules', '.tmp']);
const patterns = [
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/i
];
const findings = [];
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(full);
    else if (fs.statSync(full).size < 2_000_000) {
      const text = fs.readFileSync(full, 'utf8');
      if (patterns.some((pattern) => pattern.test(text))) findings.push(path.relative(root, full));
    }
  }
}
visit(root);
if (findings.length) { console.error(`Potential secrets found: ${findings.join(', ')}`); process.exit(1); }
console.log('security scan: no high-confidence credential patterns found');
