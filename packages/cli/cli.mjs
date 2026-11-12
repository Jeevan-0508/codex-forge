#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCatalog, searchCatalog, findProject } from '../core/catalog.mjs';
import { analyzeCompatibility } from '../compatibility/analyze.mjs';
import { convertSkill } from '../converter/convert.mjs';
import { discoverRepositories } from '../discovery/github.mjs';
import { validatePort } from '../validator/validate.mjs';
import { installPort, uninstallPort, resolveSkillRoot } from '../installer/install.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT_INDEX = path.join(ROOT, 'ports', 'index.json');

function loadPorts() {
  return JSON.parse(fs.readFileSync(PORT_INDEX, 'utf8'));
}

function findPort(id) {
  const port = loadPorts().find((entry) => entry.id === id);
  if (!port) throw new Error(`Verified port not found: ${id}`);
  return port;
}

function verifiedPortDir(id) {
  const port = findPort(id);
  const candidate = path.resolve(ROOT, 'ports', port.id === 'project-flow' ? port.id : path.join('jeffallan', port.id));
  const portsRoot = path.resolve(ROOT, 'ports');
  if (!candidate.startsWith(`${portsRoot}${path.sep}`)) throw new Error('unsafe port path');
  return candidate;
}

function portSearch(query = '') {
  const normalized = query.trim().toLowerCase();
  return loadPorts().filter((port) => !normalized || JSON.stringify(port).toLowerCase().includes(normalized));
}

function usage() {
  return `codex-forge 0.2.0 (development stage)\n\nCommands:\n` +
    `  list [query]                         list local catalog entries\n` +
    `  search <query>                       search the local catalog\n` +
    `  inspect <id>                         inspect one catalog entry\n` +
    `  compatibility <id>                  explain compatibility and license evidence\n` +
    `  discover <query> [--pages N]         search GitHub metadata without cloning or executing\n` +
    `  convert <source> --out <dir>        convert a Markdown skill safely\n` +
    `  validate <dir>                       validate converted skill output\n` +
    `  install <port> [--dry-run]           install a verified port into the Codex skill root\n` +
    `  uninstall <port> [--dry-run]        back up and remove an installed port\n` +
    `  upgrade <port> [--dry-run]          replace a verified port after approval, with backup\n` +
    `  port list [query]                   list verified installable ports\n` +
    `  port search <query>                 search verified ports\n` +
    `  port inspect <id>                   inspect port status, source, and limitations\n` +
    `  port install <id> [--dry-run]       install a verified port\n` +
    `  port uninstall <id> [--dry-run]    uninstall a verified port\n` +
    `  port upgrade <id> [--dry-run]      upgrade with approval-gated backup\n` +
    `  help                                 show this help\n`;
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function portDir(id) {
  const candidate = path.resolve(ROOT, 'ports', id || '');
  if (!candidate.startsWith(`${path.join(ROOT, 'ports')}${path.sep}`)) throw new Error('unsafe port path');
  return candidate;
}

export async function run(argv = process.argv.slice(2), io = console) {
  const [command, ...args] = argv;
  const catalog = loadCatalog();
  if (!command || command === 'help' || command === '--help') return io.log(usage());
  if (command === 'ports' || command === 'port-list') return io.log(JSON.stringify(portSearch(args.join(' ')), null, 2));
  if (command === 'port') {
    const [subcommand, id, ...subargs] = args;
    if (subcommand === 'list' || subcommand === 'search') return io.log(JSON.stringify(portSearch([id, ...subargs].filter(Boolean).join(' ')), null, 2));
    if (subcommand === 'inspect') return io.log(JSON.stringify(findPort(id), null, 2));
    if (subcommand === 'install' || subcommand === 'upgrade') {
      const approved = subargs.includes('--approve-overwrite') || subargs.includes('--approve') || subcommand === 'install' && subargs.includes('--approve-overwrite');
      if (subcommand === 'upgrade' && !approved && !subargs.includes('--dry-run')) throw new Error('upgrade requires --approve-overwrite (the existing installation is backed up first)');
      return io.log(JSON.stringify(installPort(verifiedPortDir(id), {
        skillRoot: resolveSkillRoot(),
        dryRun: subargs.includes('--dry-run'),
        approveOverwrite: approved
      }), null, 2));
    }
    if (subcommand === 'uninstall') return io.log(JSON.stringify(uninstallPort(id, {
      skillRoot: resolveSkillRoot(),
      dryRun: subargs.includes('--dry-run'),
      approve: subargs.includes('--approve')
    }), null, 2));
    throw new Error(`Unknown port command: ${subcommand || '(missing)'}\n\n${usage()}`);
  }
  if (command === 'list' || command === 'search') return io.log(JSON.stringify(searchCatalog(catalog, args.join(' ')), null, 2));
  if (command === 'inspect' || command === 'compatibility') {
    const project = findProject(catalog, args[0]);
    if (!project) throw new Error(`Catalog entry not found: ${args[0]}`);
    return io.log(JSON.stringify(command === 'compatibility' ? analyzeCompatibility(project) : project, null, 2));
  }
  if (command === 'discover') {
    const pages = Number(argValue(args, '--pages') || 1);
    const query = args.filter((arg, index) => arg !== '--pages' && args[index - 1] !== '--pages').join(' ');
    return io.log(JSON.stringify(await discoverRepositories({ query, pages, token: process.env.GITHUB_TOKEN }), null, 2));
  }
  if (command === 'convert') {
    const source = args[0];
    const out = argValue(args, '--out');
    if (!source || !out) throw new Error('convert requires <source> --out <dir>');
    return io.log(JSON.stringify(convertSkill(source, out, { dryRun: args.includes('--dry-run') }), null, 2));
  }
  if (command === 'validate') return io.log(JSON.stringify(validatePort(args[0]), null, 2));
  if (command === 'install') {
    const result = installPort(verifiedPortDir(args[0]), {
      skillRoot: resolveSkillRoot(),
      dryRun: args.includes('--dry-run'),
      approveOverwrite: args.includes('--approve-overwrite')
    });
    return io.log(JSON.stringify(result, null, 2));
  }
  if (command === 'upgrade') {
    if (!args.includes('--approve-overwrite') && !args.includes('--approve') && !args.includes('--dry-run')) throw new Error('upgrade requires --approve-overwrite (the existing installation is backed up first)');
    const result = installPort(verifiedPortDir(args[0]), {
      skillRoot: resolveSkillRoot(),
      dryRun: args.includes('--dry-run'),
      approveOverwrite: args.includes('--approve-overwrite') || args.includes('--approve')
    });
    return io.log(JSON.stringify(result, null, 2));
  }
  if (command === 'uninstall') {
    const result = uninstallPort(args[0], {
      skillRoot: resolveSkillRoot(),
      dryRun: args.includes('--dry-run'),
      approve: args.includes('--approve')
    });
    return io.log(JSON.stringify(result, null, 2));
  }
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => { console.error(`codex-forge: ${error.message}`); process.exitCode = 1; });
}
