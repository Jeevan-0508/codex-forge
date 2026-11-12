import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installPort, uninstallPort, validateManifest } from '../packages/installer/install.mjs';
import { convertBatch, discoverSkillDirectories } from '../packages/converter/batch.mjs';

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

test('installer rejects executable hooks and unsafe hook paths', () => {
  const copied = copyPort();
  const manifestPath = path.join(copied, 'PORT.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.hooks = ['post-install'];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  assert.throws(() => validateManifest(copied), /unapproved executable hooks/);

  const withHookPath = copyPort();
  const hookManifestPath = path.join(withHookPath, 'PORT.json');
  const hookManifest = JSON.parse(fs.readFileSync(hookManifestPath, 'utf8'));
  hookManifest.files['hooks/post-install.ps1'] = '0'.repeat(64);
  fs.writeFileSync(hookManifestPath, JSON.stringify(hookManifest, null, 2));
  assert.throws(() => validateManifest(withHookPath), /unapproved executable or hook path/);
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

test('batch conversion discovers skills, adapts Claude metadata, and preserves reference assets', () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-batch-source-'));
  const skill = path.join(source, 'skills', 'alpha-skill');
  fs.mkdirSync(path.join(skill, 'references'), { recursive: true });
  fs.mkdirSync(path.join(skill, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(source, 'LICENSE'), 'MIT license fixture\n');
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: alpha-skill\ndescription: Use Claude Code with allowed tools.\nallowed-tools: Read Grep\n---\n\nRead CLAUDE.md and use .claude/config.\n', 'utf8');
  fs.writeFileSync(path.join(skill, 'references', 'guide.md'), '# Reference\n', 'utf8');
  fs.writeFileSync(path.join(skill, 'assets', 'icon.bin'), Buffer.from([0, 1, 2, 255]));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-batch-output-'));
  assert.equal(discoverSkillDirectories(source).length, 1);
  const result = convertBatch(source, output, { sourceRepository: 'owner/repo', sourceRevision: 'a'.repeat(40), sourceLicenseText: 'MIT license fixture\n', skillNames: ['alpha-skill'] });
  assert.equal(result.discovered, 1);
  assert.equal(result.converted.length, 1);
  const converted = path.join(output, 'jeffallan-alpha-skill');
  const skillText = fs.readFileSync(path.join(converted, 'SKILL.md'), 'utf8');
  assert.doesNotMatch(skillText, /allowed-tools:/i);
  assert.match(skillText, /Codex portability/);
  assert.equal(fs.readFileSync(path.join(converted, 'assets', 'icon.bin')).equals(Buffer.from([0, 1, 2, 255])), true);
  assert.equal(fs.existsSync(path.join(converted, 'references', 'guide.md')), true);
  assert.equal(validateManifest(converted).id, 'jeffallan-alpha-skill');
});

test('batch conversion rejects declared unsupported dependencies before writing output', () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-batch-deps-'));
  const skill = path.join(source, 'skills', 'dependent-skill');
  fs.mkdirSync(skill, { recursive: true });
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: dependent-skill\ndescription: Requires a runtime\nrequires: claude-plugin-runtime\n---\n\nUse the runtime.\n', 'utf8');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-batch-deps-out-'));
  const result = convertBatch(source, output, { sourceRepository: 'owner/repo', sourceRevision: 'b'.repeat(40), skillNames: ['dependent-skill'] });
  assert.equal(result.converted.length, 0);
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].rejected.join(' '), /dependencies/);
  assert.equal(fs.existsSync(path.join(output, 'jeffallan-dependent-skill')), false);
});
