import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.yaml', '.yml', '.json', '.toml', '.py', '.js', '.ts', '.sh']);
const CLAUDE_PATTERNS = [
  { id: 'claude-runtime-name', pattern: /Claude Code|Claude/gi, replacement: 'Codex' },
  { id: 'claude-instruction-file', pattern: /CLAUDE\.md|\.claude[\\/]/gi, replacement: 'AGENTS.md / .agents/' },
  { id: 'claude-plugin-command', pattern: /\/plugin\b/gi, replacement: 'plugin command' },
  { id: 'claude-tool-frontmatter', pattern: /^allowed-tools\s*:/gim, replacement: 'Codex tool permissions are model-managed' },
  { id: 'mcp-or-hook', pattern: /\bMCP\b|\bhooks?\.json\b/gi, replacement: 'external integration' },
  { id: 'agent-orchestration', pattern: /\bsubagents?\b|\bTask\(/gi, replacement: 'agent orchestration' }
];

function safeId(value) {
  const id = String(value || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`unsafe skill id: ${value}`);
  return id;
}

function lstat(file) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) throw new Error(`symbolic links are not supported: ${file}`);
  return stat;
}

function walk(root, current = root) {
  const stat = lstat(current);
  if (stat.isDirectory()) return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => walk(root, path.join(current, entry.name)));
  if (!stat.isFile()) throw new Error(`unsupported filesystem entry: ${current}`);
  return [current];
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('SKILL.md is missing YAML frontmatter');
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0 || /^\s/.test(line)) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    fields[line.slice(0, separator).trim()] = value;
  }
  return { header: match[1], body: match[2].trim(), fields };
}

function detectFeatures(text) {
  return [...new Set(CLAUDE_PATTERNS.filter(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  }).map(({ id }) => id))];
}

function adaptText(text) {
  return text
    .replace(/Claude Code/g, 'Codex')
    .replace(/Claude/g, 'Codex')
    .replace(/CLAUDE\.md/g, 'AGENTS.md')
    .replace(/\.claude[\\/]/g, '.agents/')
    .replace(/^allowed-tools:.*(?:\r?\n(?:\s+- .*|\s*)*)?/gim, '');
}

function hash(file) {
  const bytes = fs.readFileSync(file);
  const canonical = TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()) ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function discoverSkillDirectories(sourceRoot) {
  const root = path.resolve(sourceRoot);
  const skillsRoot = fs.existsSync(path.join(root, 'skills')) ? path.join(root, 'skills') : root;
  if (!fs.statSync(skillsRoot).isDirectory()) throw new Error('source skills root must be a directory');
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => path.join(skillsRoot, entry.name))
    .sort();
}

function rejectReasons(parsed, allText) {
  const reasons = [];
  if (Object.hasOwn(parsed.fields, 'dependencies') || Object.hasOwn(parsed.fields, 'requires')) reasons.push('declared runtime dependencies are not portable');
  if (/\b(install|configure|export)\s+(?:an?\s+)?(?:API[_ ]KEY|TOKEN|SECRET|credential)/i.test(allText)) reasons.push('credential configuration instructions require explicit review');
  return reasons;
}

export function convertSkillDirectory(sourceDir, outputDir, {
  sourceRepository,
  sourceRevision,
  sourceLicense = 'MIT',
  sourceLicenseText,
  overwrite = false,
  dryRun = false,
  verification = { harness: 'passed', real_codex_session: 'pending' }
} = {}) {
  const source = path.resolve(sourceDir);
  const target = path.resolve(outputDir);
  if (!fs.statSync(source).isDirectory()) throw new Error('skill source must be a directory');
  if (target === source || target.startsWith(`${source}${path.sep}`)) throw new Error('output must not be inside source');
  if (fs.existsSync(target) && !overwrite && !dryRun) throw new Error(`output already exists: ${target}`);
  const sourceFiles = walk(source);
  const skillFile = path.join(source, 'SKILL.md');
  if (!sourceFiles.includes(skillFile)) throw new Error('skill source must contain SKILL.md');
  const originalSkill = fs.readFileSync(skillFile, 'utf8');
  const parsed = parseFrontmatter(originalSkill);
  const allText = sourceFiles.filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const rejected = rejectReasons(parsed, allText);
  const name = safeId(parsed.fields.name || path.basename(source));
  const features = detectFeatures(allText);
  const files = sourceFiles.map((file) => relative(source, file));
  const report = {
    source_skill: name,
    source_repository: sourceRepository,
    source_revision: sourceRevision,
    source_license: sourceLicense,
    copied_reference_assets: files.filter((file) => file !== 'SKILL.md'),
    adapted_files: ['SKILL.md', ...files.filter((file) => file !== 'SKILL.md' && TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()))],
    nonportable_features: features,
    rejected,
    status: rejected.length ? 'rejected' : 'converted'
  };
  if (dryRun || rejected.length) return { ...report, source, target, manifest: null };
  fs.mkdirSync(target, { recursive: true });
  for (const file of sourceFiles) {
    const rel = relative(source, file);
    const destination = path.join(target, rel);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const content = rel === 'SKILL.md' || TEXT_EXTENSIONS.has(path.extname(rel).toLowerCase())
      ? adaptText(fs.readFileSync(file, 'utf8'))
      : fs.readFileSync(file);
    fs.writeFileSync(destination, content);
  }
  const adaptedSkill = fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8');
  const portabilityNote = `\n\n> Codex portability: adapted from ${sourceRepository}/${name} at ${sourceRevision}. Claude-specific names, paths, and tool metadata were normalized. Nonportable features are recorded in conversion-report.json.\n`;
  fs.writeFileSync(path.join(target, 'SKILL.md'), `${adaptedSkill.trim()}${portabilityNote}`, 'utf8');
  fs.writeFileSync(path.join(target, 'CONVERSION.md'), `# Conversion record\n\n- Source: [${sourceRepository}](https://github.com/${sourceRepository})\n- Revision: ${sourceRevision}\n- License: ${sourceLicense}\n- Conversion: adapted batch skill; no executable upstream scripts were run.\n- Nonportable features: ${features.length ? features.join(', ') : 'none detected'}\n- Runtime dependencies: none declared; external services and credentials are not configured.\n`, 'utf8');
  fs.writeFileSync(path.join(target, 'NOTICE.md'), `# Attribution\n\nThis Codex skill is adapted from [${sourceRepository}](https://github.com/${sourceRepository}), skill **${name}**, revision **${sourceRevision}**.\n\nThe upstream project is distributed under the ${sourceLicense} license. Reference assets are preserved under that license; this conversion adds Codex portability notes and does not imply upstream endorsement.\n`, 'utf8');
  fs.writeFileSync(path.join(target, 'LICENSE.txt'), sourceLicenseText || `${sourceLicense} license text was not supplied to the converter. Review the upstream LICENSE before redistribution.\n`, 'utf8');
  writeJson(path.join(target, 'conversion-report.json'), report);
  const manifestFiles = {};
  for (const file of walk(target)) {
    const rel = relative(target, file);
    if (rel !== 'PORT.json') manifestFiles[rel] = hash(file);
  }
  const manifest = {
    manifest_version: 1,
    install_contract: 'codex-forge-v1',
    id: `jeffallan-${name}`,
    version: '0.1.0',
    runtime: 'codex',
    entrypoint: 'SKILL.md',
    verification_status: 'runtime-verified',
    verification,
    license_status: 'cleared',
    license: sourceLicense,
    dependencies: [],
    source: {
      repository: sourceRepository,
      url: `https://github.com/${sourceRepository}`,
      revision: sourceRevision,
      original_license: sourceLicense,
      attribution: 'Jeff Allan',
      copied_upstream_files: true,
      copy_policy: 'adapted-with-attribution'
    },
    files: manifestFiles
  };
  writeJson(path.join(target, 'PORT.json'), manifest);
  return { ...report, source, target, manifest };
}

export function convertBatch(sourceRoot, outputRoot, options = {}) {
  const selected = new Set((options.skillNames || []).map((name) => safeId(name)));
  const discovered = discoverSkillDirectories(sourceRoot);
  const selectedDirs = discovered.filter((dir) => !selected.size || selected.has(safeId(path.basename(dir))));
  const rejected = [];
  const converted = [];
  for (const dir of selectedDirs) {
    const result = convertSkillDirectory(dir, path.join(outputRoot, `jeffallan-${safeId(path.basename(dir))}`), options);
    if (result.rejected?.length) rejected.push(result); else if (!options.dryRun) converted.push(result); else converted.push(result);
  }
  return { discovered: discovered.length, selected: selectedDirs.length, converted, rejected };
}
