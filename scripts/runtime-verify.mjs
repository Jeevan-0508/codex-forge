import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installPort, uninstallPort } from '../packages/installer/install.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = path.join(root, 'ports', 'project-flow');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-runtime-'));
const skillRoot = path.join(temp, 'codex-skill-root');
const project = path.join(temp, 'demo-project');
const node = process.execPath;
const entrypoint = path.join(port, 'scripts', 'project-flow.mjs');

function runProject(...args) {
  const stdout = execFileSync(node, [entrypoint, ...args], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  return JSON.parse(stdout);
}

fs.mkdirSync(project, { recursive: true });
const installed = installPort(port, { skillRoot });
const installedSkill = path.join(skillRoot, 'project-flow');
assert.equal(fs.existsSync(path.join(installedSkill, 'SKILL.md')), true);
assert.match(fs.readFileSync(path.join(installedSkill, 'SKILL.md'), 'utf8'), /name: project-flow/);
assert.equal(installed.id, 'project-flow');

const planned = runProject('plan', '--slug', 'demo', '--title', 'Demo delivery', '--requirements', 'Track a small feature safely.');
assert.equal(planned.status, 'planned');
const decomposed = runProject('decompose', '--slug', 'demo', '--task', 'Implement the core', '--task', 'Verify the workflow');
assert.equal(decomposed.added, 2);
const completed = runProject('complete', '--slug', 'demo', '--task', 'TASK-001', '--test', 'npm test', '--acceptance', 'The core behavior is verified', '--passed');
assert.equal(completed.status, 'done');
const status = runProject('status', '--slug', 'demo');
assert.equal(status.counts.done, 1);
assert.equal(status.counts.todo, 1);
const issuePreview = runProject('issue', '--slug', 'demo', '--task', 'TASK-001', '--repo', 'owner/repo', '--dry-run');
assert.equal(issuePreview.dry_run, true);
const worktreePreview = runProject('worktree', '--slug', 'demo', '--task', 'TASK-001', '--base', 'main', '--dry-run');
assert.equal(worktreePreview.dry_run, true);

assert.throws(() => installPort(port, { skillRoot }), /approve-overwrite/);
const before = fs.readFileSync(path.join(installedSkill, 'PORT.json'), 'utf8');
assert.throws(() => installPort(port, { skillRoot, approveOverwrite: true, failAfterCopy: true }), /simulated installation failure/);
assert.equal(fs.readFileSync(path.join(installedSkill, 'PORT.json'), 'utf8'), before);

const removalPreview = uninstallPort('project-flow', { skillRoot, dryRun: true });
assert.equal(removalPreview.dryRun, true);
const removed = uninstallPort('project-flow', { skillRoot, approve: true });
assert.equal(removed.dryRun, false);
assert.equal(fs.existsSync(installedSkill), false);
assert.equal(fs.existsSync(removed.backup), true);

const summary = {
  runtime_verified: true,
  codex_skill_root_discovered: true,
  workflow_executed: true,
  issue_and_worktree_writes_default_to_dry_run: true,
  rollback_verified: true,
  uninstall_verified: true,
  temp_root: temp,
  manifest_digest: crypto.createHash('sha256').update(fs.readFileSync(path.join(port, 'PORT.json'))).digest('hex')
};
console.log(JSON.stringify(summary, null, 2));
