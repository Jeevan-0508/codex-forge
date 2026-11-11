import fs from 'node:fs';
import path from 'node:path';

const SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/i,
  /(?:api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{12,}["']/i
];

export function validatePort(portDir) {
  const root = path.resolve(portDir);
  const skill = path.join(root, 'SKILL.md');
  const issues = [];
  const warnings = [];
  if (!fs.existsSync(skill)) issues.push('SKILL.md is missing');
  else {
    const text = fs.readFileSync(skill, 'utf8');
    if (!/^---\s*\n[\s\S]*?\n---/m.test(text)) issues.push('SKILL.md is missing YAML frontmatter');
    if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) issues.push('possible credential or private key detected');
    if (/curl\s+[^\n]*\|\s*(?:sh|bash)|irm\s+[^\n]*\|\s*iex/i.test(text)) warnings.push('contains a piped remote installer; review before use');
  }
  return { valid: issues.length === 0, issues, warnings, path: root };
}
