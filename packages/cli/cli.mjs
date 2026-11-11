#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, searchCatalog, findProject } from '../core/catalog.mjs';
import { analyzeCompatibility } from '../compatibility/analyze.mjs';
import { convertSkill } from '../converter/convert.mjs';
import { discoverRepositories } from '../discovery/github.mjs';
import { validatePort } from '../validator/validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function usage() {
  return `codex-forge 0.1.0 (development stage)\n\n` +
    `Commands:\n` +
    `  list [query]                         list local catalog entries\n` +
    `  search <query>                       search the local catalog\n` +
    `  inspect <id>                         inspect one catalog entry\n` +
    `  compatibility <id>                  explain compatibility and license evidence\n` +
    `  discover <query> [--pages N]         search GitHub metadata without cloning or executing\n` +
    `  convert <source> --out <dir>        convert a Markdown skill safely\n` +
    `  validate <dir>                       validate converted skill output\n` +
    `  install <id>                         refuse unverified installs; verified ports only\n` +
    `  help                                 show this help\n`;
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

export async function run(argv = process.argv.slice(2), io = console) {
  const [command, ...args] = argv;
  const catalog = loadCatalog();
  if (!command || command === 'help' || command === '--help') return io.log(usage());
  if (command === 'list' || command === 'search') {
    const query = command === 'list' ? args.join(' ') : args.join(' ');
    return io.log(JSON.stringify(searchCatalog(catalog, query), null, 2));
  }
  if (command === 'inspect' || command === 'compatibility' || command === 'install') {
    const project = findProject(catalog, args[0]);
    if (!project) throw new Error(`Catalog entry not found: ${args[0]}`);
    if (command === 'compatibility') return io.log(JSON.stringify(analyzeCompatibility(project), null, 2));
    if (command === 'install' && project.verification_status !== 'runtime-verified') {
      throw new Error('Refusing install: this catalog entry is not runtime-verified');
    }
    return io.log(JSON.stringify(project, null, 2));
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
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => { console.error(`codex-forge: ${error.message}`); process.exitCode = 1; });
}
