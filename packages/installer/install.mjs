import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_SKILL_ROOT = path.join(os.homedir(), '.agents', 'skills');
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.mjs', '.js', '.ts', '.yaml', '.yml', '.toml', '.py', '.sh']);

export function resolveSkillRoot(env = process.env) {
  return path.resolve(env.CODEX_SKILL_ROOT || DEFAULT_SKILL_ROOT);
}

function safeRelative(file) {
  return typeof file === 'string' && file.length > 0 && !path.isAbsolute(file) && !file.split(/[\\/]/).includes('..');
}

function normalizedRelative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function sha256(file) {
  const bytes = fs.readFileSync(file);
  const canonical = TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()) ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function lstatOrNull(file) {
  try { return fs.lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertDirectory(root, label) {
  const stat = lstatOrNull(root);
  if (stat?.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  if (stat && !stat.isDirectory()) throw new Error(`${label} must be a directory`);
}

function listFiles(root, current = root) {
  const stat = lstatOrNull(current);
  if (!stat) throw new Error(`path disappeared during validation: ${current}`);
  if (stat.isSymbolicLink()) throw new Error(`symbolic links are not allowed: ${normalizedRelative(root, current) || '.'}`);
  if (stat.isDirectory()) return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => listFiles(root, path.join(current, entry.name)));
  if (!stat.isFile()) throw new Error(`unsupported filesystem entry: ${normalizedRelative(root, current)}`);
  return [current];
}

function safeBackupToken(token) {
  if (!/^[A-Za-z0-9-]+$/.test(token || '')) throw new Error('unsafe backup token');
  return token;
}

export function validateManifest(portDir) {
  const root = path.resolve(portDir);
  assertDirectory(root, 'port root');
  const manifestPath = path.join(root, 'PORT.json');
  const manifestStat = lstatOrNull(manifestPath);
  if (!manifestStat) throw new Error('PORT.json is missing');
  if (manifestStat.isSymbolicLink()) throw new Error('PORT.json must not be a symbolic link');
  if (!manifestStat.isFile()) throw new Error('PORT.json must be a regular file');
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch (error) { throw new Error(`PORT.json is not valid JSON: ${error.message}`); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('PORT.json must contain an object');
  if (manifest.manifest_version !== 1) throw new Error('unsupported manifest version');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id || '')) throw new Error('manifest id is not a safe skill id');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version || '')) throw new Error('manifest version is required and must be semver-like');
  if (manifest.install_contract !== 'codex-forge-v1') throw new Error('unsupported install contract');
  if (manifest.runtime !== 'codex') throw new Error('port runtime must be codex');
  if (typeof manifest.entrypoint !== 'string' || !safeRelative(manifest.entrypoint)) throw new Error('manifest entrypoint is required and must be relative');
  if (manifest.verification_status !== 'runtime-verified') throw new Error('port is not runtime-verified');
  if (manifest.license_status !== 'cleared') throw new Error('port license is not cleared');
  if (typeof manifest.license !== 'string' || !manifest.license.trim()) throw new Error('manifest license is required');
  if (!Array.isArray(manifest.dependencies) || manifest.dependencies.length) throw new Error('unsupported upstream dependencies are present');
  if (!manifest.files || typeof manifest.files !== 'object') throw new Error('manifest files are missing');
  if (manifest.files['PORT.json']) throw new Error('PORT.json must not hash itself');
  if (!manifest.source || typeof manifest.source !== 'object' || Array.isArray(manifest.source)) throw new Error('manifest source metadata is required');
  for (const field of ['repository', 'url', 'revision', 'original_license', 'attribution']) {
    if (typeof manifest.source[field] !== 'string' || !manifest.source[field].trim()) throw new Error(`manifest source.${field} is required`);
  }
  const adaptedWithAttribution = manifest.source.copied_upstream_files === true && manifest.source.copy_policy === 'adapted-with-attribution';
  if (manifest.source.copied_upstream_files !== false && !adaptedWithAttribution) throw new Error('manifest must declare an approved copy policy');
  if (adaptedWithAttribution && (!manifest.files['NOTICE.md'] || !manifest.files['LICENSE.txt'])) throw new Error('adapted ports must include NOTICE.md and LICENSE.txt');
  const expectedFiles = new Set(['PORT.json']);
  for (const [relative, expectedHash] of Object.entries(manifest.files)) {
    if (!safeRelative(relative)) throw new Error(`unsafe manifest path: ${relative}`);
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`) || !lstatOrNull(file)?.isFile()) throw new Error(`manifest file missing or not regular: ${relative}`);
    if (lstatOrNull(file).isSymbolicLink()) throw new Error(`manifest file must not be a symbolic link: ${relative}`);
    expectedFiles.add(relative.replaceAll('\\', '/'));
    if (!/^[a-f0-9]{64}$/.test(expectedHash) || sha256(file) !== expectedHash) throw new Error(`hash mismatch: ${relative}`);
  }
  if (!manifest.files[manifest.entrypoint]) throw new Error('entrypoint is not covered by manifest hashes');
  for (const file of listFiles(root)) {
    const relative = normalizedRelative(root, file);
    if (!expectedFiles.has(relative)) throw new Error(`unexpected file in port: ${relative}`);
  }
  return { ...manifest, _root: root, _manifestPath: manifestPath };
}

function targetFor(root, id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id || '')) throw new Error('unsafe skill id');
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, id);
  if (path.dirname(target) !== resolvedRoot) throw new Error('skill target escapes Codex skill root');
  return { resolvedRoot, target };
}

export function installPort(portDir, { skillRoot = DEFAULT_SKILL_ROOT, dryRun = false, approveOverwrite = false, failAfterCopy = false, backupToken = crypto.randomUUID() } = {}) {
  const initialManifest = validateManifest(portDir);
  const initialManifestBytes = fs.readFileSync(initialManifest._manifestPath, 'utf8');
  const manifest = initialManifest;
  const { resolvedRoot, target } = targetFor(skillRoot, manifest.id);
  const targetStat = lstatOrNull(target);
  if (targetStat?.isSymbolicLink()) throw new Error('existing installation must not be a symbolic link');
  if (targetStat && !targetStat.isDirectory()) throw new Error('existing installation must be a directory');
  const exists = Boolean(targetStat);
  if (exists && !approveOverwrite) throw new Error(`installation exists; pass --approve-overwrite to back it up: ${target}`);
  const backupRoot = path.join(resolvedRoot, '.codex-forge-backups');
  const backup = path.join(backupRoot, `${manifest.id}-${safeBackupToken(backupToken)}`);
  const plan = { id: manifest.id, target, backup: exists ? backup : null, files: Object.keys(manifest.files), dryRun };
  if (dryRun) return plan;

  fs.mkdirSync(resolvedRoot, { recursive: true });
  assertDirectory(resolvedRoot, 'Codex skill root');
  if (exists) {
    assertDirectory(backupRoot, 'backup root');
    if (lstatOrNull(backup)) throw new Error(`backup collision or corrupted backup already exists: ${backup}`);
  }
  const staging = path.join(resolvedRoot, `.${manifest.id}.codex-forge-stage-${crypto.randomUUID()}`);
  let backedUp = false;
  try {
    const refreshedManifest = validateManifest(portDir);
    const refreshedBytes = fs.readFileSync(refreshedManifest._manifestPath, 'utf8');
    if (refreshedBytes !== initialManifestBytes) throw new Error('port changed after initial validation; refusing installation');
    fs.mkdirSync(staging, { recursive: true });
    for (const relative of Object.keys(refreshedManifest.files)) {
      const source = path.join(refreshedManifest._root, relative);
      const destination = path.join(staging, relative);
      if (lstatOrNull(source)?.isSymbolicLink()) throw new Error(`source became a symbolic link: ${relative}`);
      if (sha256(source) !== refreshedManifest.files[relative]) throw new Error(`source changed before copy: ${relative}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      if (sha256(source) !== refreshedManifest.files[relative] || sha256(destination) !== refreshedManifest.files[relative]) throw new Error(`source changed during copy: ${relative}`);
    }
    if (fs.readFileSync(refreshedManifest._manifestPath, 'utf8') !== initialManifestBytes) throw new Error('PORT.json changed during installation');
    fs.copyFileSync(refreshedManifest._manifestPath, path.join(staging, 'PORT.json'));
    if (failAfterCopy) throw new Error('simulated installation failure');
    if (exists) {
      fs.mkdirSync(backupRoot, { recursive: true });
      if (lstatOrNull(backup)) throw new Error(`backup collision or corrupted backup already exists: ${backup}`);
      fs.renameSync(target, backup);
      backedUp = true;
    }
    fs.renameSync(staging, target);
    return plan;
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (backedUp) {
      if (lstatOrNull(target)) throw new Error(`${error.message}; rollback refused because target unexpectedly exists`);
      if (!lstatOrNull(backup)?.isDirectory()) throw new Error(`${error.message}; rollback refused because backup is missing or corrupted`);
      fs.renameSync(backup, target);
    }
    throw error;
  }
}

export function uninstallPort(id, { skillRoot = DEFAULT_SKILL_ROOT, dryRun = false, approve = false, backupToken = crypto.randomUUID() } = {}) {
  const { resolvedRoot, target } = targetFor(skillRoot, id);
  const targetStat = lstatOrNull(target);
  if (!targetStat) throw new Error(`installed skill not found: ${target}`);
  if (targetStat.isSymbolicLink()) throw new Error('refusing uninstall: target is a symbolic link');
  if (!targetStat.isDirectory()) throw new Error('refusing uninstall: target is not a directory');
  const manifestPath = path.join(target, 'PORT.json');
  const manifest = validateManifest(target);
  if (manifest.id !== id) throw new Error('refusing uninstall: manifest identity mismatch');
  if (!approve && !dryRun) throw new Error('uninstall requires --approve');
  const backup = path.join(resolvedRoot, '.codex-forge-backups', `${id}-uninstall-${safeBackupToken(backupToken)}`);
  if (dryRun) return { id, target, backup, dryRun: true };
  assertDirectory(resolvedRoot, 'Codex skill root');
  assertDirectory(path.dirname(backup), 'backup root');
  if (lstatOrNull(backup)) throw new Error(`backup collision or corrupted backup already exists: ${backup}`);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  if (lstatOrNull(backup)) throw new Error(`backup collision or corrupted backup already exists: ${backup}`);
  fs.renameSync(target, backup);
  return { id, target, backup, dryRun: false };
}
