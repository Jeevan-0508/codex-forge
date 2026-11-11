import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installPort, uninstallPort, validateManifest } from '../packages/installer/install.mjs';

const port = path.resolve('ports/project-flow');

function copyPort() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-port-'));
  fs.cpSync(port, dir, { recursive: true });
  return dir;
}

test('installer validates a hashed runtime-verified manifest', () => {
  const manifest = validateManifest(port);
  assert.equal(manifest.id, 'project-flow');
  assert.equal(manifest.dependencies.length, 0);
});

test('installer supports dry-run, approval-gated overwrite, rollback, and uninstall backup', () => {
  const skillRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-skills-'));
  const preview = installPort(port, { skillRoot, dryRun: true });
  assert.equal(preview.dryRun, true);
  assert.equal(fs.existsSync(path.join(skillRoot, 'project-flow')), false);

  installPort(port, { skillRoot });
  assert.throws(() => installPort(port, { skillRoot }), /approve-overwrite/);
  const original = fs.readFileSync(path.join(skillRoot, 'project-flow', 'PORT.json'), 'utf8');
  assert.throws(() => installPort(port, { skillRoot, approveOverwrite: true, failAfterCopy: true }), /simulated installation failure/);
  assert.equal(fs.readFileSync(path.join(skillRoot, 'project-flow', 'PORT.json'), 'utf8'), original);
  const replaced = installPort(port, { skillRoot, approveOverwrite: true });
  assert.equal(fs.existsSync(replaced.backup), true);
  const removal = uninstallPort('project-flow', { skillRoot, approve: true });
  assert.equal(fs.existsSync(removal.backup), true);
  assert.equal(fs.existsSync(path.join(skillRoot, 'project-flow')), false);
});

test('installer rejects traversal and unsupported upstream dependencies', () => {
  const skillRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-skills-'));
  assert.throws(() => uninstallPort('../escape', { skillRoot }), /unsafe skill id/);
  const copied = copyPort();
  const manifestPath = path.join(copied, 'PORT.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.dependencies = ['claude-code-runtime'];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  assert.throws(() => validateManifest(copied), /unsupported upstream dependencies/);
});

test('installer rejects tampered files and unsafe manifest paths', () => {
  const copied = copyPort();
  fs.appendFileSync(path.join(copied, 'SKILL.md'), '\nTampered.\n');
  assert.throws(() => validateManifest(copied), /hash mismatch/);
  const copiedAgain = copyPort();
  const manifestPath = path.join(copiedAgain, 'PORT.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.files['../escape.txt'] = '0'.repeat(64);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  assert.throws(() => validateManifest(copiedAgain), /unsafe manifest path/);
});

test('installer rejects unexpected files, malformed required fields, and backup collisions', () => {
  const extra = copyPort();
  fs.writeFileSync(path.join(extra, 'unexpected.txt'), 'must not be installed');
  assert.throws(() => validateManifest(extra), /unexpected file/);

  const malformed = copyPort();
  const manifestPath = path.join(malformed, 'PORT.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  delete manifest.source.revision;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  assert.throws(() => validateManifest(malformed), /source\.revision is required/);

  const skillRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-skills-'));
  installPort(port, { skillRoot });
  const backupRoot = path.join(skillRoot, '.codex-forge-backups');
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.writeFileSync(path.join(backupRoot, 'project-flow-fixed'), 'corrupted backup placeholder');
  assert.throws(() => installPort(port, { skillRoot, approveOverwrite: true, backupToken: 'fixed' }), /collision or corrupted backup/);
  assert.equal(fs.existsSync(path.join(skillRoot, 'project-flow', 'PORT.json')), true);
});

test('installer rejects symbolic links without following them', (t) => {
  const copied = copyPort();
  try {
    fs.symlinkSync(path.join(copied, 'SKILL.md'), path.join(copied, 'linked-skill.md'), 'file');
  } catch (error) {
    t.skip(`symbolic links unavailable in this environment: ${error.code || error.message}`);
    return;
  }
  assert.throws(() => validateManifest(copied), /symbolic link|unexpected file/);
});
