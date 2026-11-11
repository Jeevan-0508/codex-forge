import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_SKILL_ROOT = path.join(os.homedir(), '.agents', 'skills');

export function resolveSkillRoot(env = process.env) {
  return path.resolve(env.CODEX_SKILL_ROOT || DEFAULT_SKILL_ROOT);
}

function safeRelative(file) {
  return typeof file === 'string' && file.length > 0 && !path.isAbsolute(file) && !file.split(/[\\/]/).includes('..');
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function validateManifest(portDir) {
  const root = path.resolve(portDir);
  const manifestPath = path.join(root, 'PORT.json');
  if (!fs.existsSync(manifestPath)) throw new Error('PORT.json is missing');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id || '')) throw new Error('manifest id is not a safe skill id');
  if (manifest.install_contract !== 'codex-forge-v1') throw new Error('unsupported install contract');
  if (manifest.runtime !== 'codex') throw new Error('port runtime must be codex');
  if (manifest.verification_status !== 'runtime-verified') throw new Error('port is not runtime-verified');
  if (manifest.license_status !== 'cleared') throw new Error('port license is not cleared');
  if (!Array.isArray(manifest.dependencies) || manifest.dependencies.length) throw new Error('unsupported upstream dependencies are present');
  if (!manifest.files || typeof manifest.files !== 'object') throw new Error('manifest files are missing');
  for (const [relative, expected] of Object.entries(manifest.files)) {
    if (!safeRelative(relative)) throw new Error(`unsafe manifest path: ${relative}`);
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) throw new Error(`manifest file missing: ${relative}`);
    if (!/^[a-f0-9]{64}$/.test(expected) || sha256(file) !== expected) throw new Error(`hash mismatch: ${relative}`);
  }
  if (!safeRelative(manifest.entrypoint) || !manifest.files[manifest.entrypoint]) throw new Error('entrypoint is not covered by manifest hashes');
  return { ...manifest, _root: root, _manifestPath: manifestPath };
}

function targetFor(root, id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id || '')) throw new Error('unsafe skill id');
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, id);
  if (path.dirname(target) !== resolvedRoot) throw new Error('skill target escapes Codex skill root');
  return { resolvedRoot, target };
}

export function installPort(portDir, { skillRoot = DEFAULT_SKILL_ROOT, dryRun = false, approveOverwrite = false, failAfterCopy = false } = {}) {
  const manifest = validateManifest(portDir);
  const { resolvedRoot, target } = targetFor(skillRoot, manifest.id);
  const exists = fs.existsSync(target);
  if (exists && !approveOverwrite) throw new Error(`installation exists; pass --approve-overwrite to back it up: ${target}`);
  const backupRoot = path.join(resolvedRoot, '.codex-forge-backups');
  const backup = path.join(backupRoot, `${manifest.id}-${Date.now()}`);
  const plan = { id: manifest.id, target, backup: exists ? backup : null, files: Object.keys(manifest.files), dryRun };
  if (dryRun) return plan;

  fs.mkdirSync(resolvedRoot, { recursive: true });
  const staging = path.join(resolvedRoot, `.${manifest.id}.codex-forge-stage-${crypto.randomUUID()}`);
  let backedUp = false;
  try {
    fs.mkdirSync(staging, { recursive: true });
    for (const relative of Object.keys(manifest.files)) {
      const source = path.join(manifest._root, relative);
      const destination = path.join(staging, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
    fs.copyFileSync(manifest._manifestPath, path.join(staging, 'PORT.json'));
    if (failAfterCopy) throw new Error('simulated installation failure');
    if (exists) {
      fs.mkdirSync(backupRoot, { recursive: true });
      fs.renameSync(target, backup);
      backedUp = true;
    }
    fs.renameSync(staging, target);
    return plan;
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (backedUp && !fs.existsSync(target) && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  }
}

export function uninstallPort(id, { skillRoot = DEFAULT_SKILL_ROOT, dryRun = false, approve = false } = {}) {
  const { resolvedRoot, target } = targetFor(skillRoot, id);
  if (!fs.existsSync(target)) throw new Error(`installed skill not found: ${target}`);
  const manifestPath = path.join(target, 'PORT.json');
  if (!fs.existsSync(manifestPath)) throw new Error('refusing uninstall: target has no CODEX//FORGE manifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.id !== id || manifest.install_contract !== 'codex-forge-v1') throw new Error('refusing uninstall: manifest identity mismatch');
  if (!approve && !dryRun) throw new Error('uninstall requires --approve');
  const backup = path.join(resolvedRoot, '.codex-forge-backups', `${id}-uninstall-${Date.now()}`);
  if (dryRun) return { id, target, backup, dryRun: true };
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.renameSync(target, backup);
  return { id, target, backup, dryRun: false };
}
