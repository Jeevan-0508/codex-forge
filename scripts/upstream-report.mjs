import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'projects.json'), 'utf8'));
const headers = { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };

const report = [];
for (const project of catalog) {
  const response = await fetch(`https://api.github.com/repos/${project.repository}/commits/${project.source_revision}`, { headers });
  if (response.status === 200) {
    report.push({ id: project.id, repository: project.repository, status: 'unchanged-at-recorded-revision', source_revision: project.source_revision });
  } else if (response.status === 404) {
    report.push({ id: project.id, repository: project.repository, status: 'revision-not-found-or-repository-changed', source_revision: project.source_revision });
  } else {
    report.push({ id: project.id, repository: project.repository, status: `check-failed-http-${response.status}`, source_revision: project.source_revision });
  }
}
console.log(JSON.stringify({ generated_at: new Date().toISOString(), report_only: true, report }));
