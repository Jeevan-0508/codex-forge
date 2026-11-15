import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { run } from '../packages/cli/cli.mjs';

function logger() {
  const output = [];
  return { output, io: { log(value) { output.push(String(value)); } } };
}

test('CLI exposes verified port catalog and inspection', async () => {
  const listed = logger();
  await run(['port', 'list'], listed.io);
  const ports = JSON.parse(listed.output[0]);
  assert.equal(ports.length, 8);
  assert.ok(ports.some((port) => port.id === 'jeffallan-code-reviewer'));

  const inspected = logger();
  await run(['port', 'inspect', 'project-flow'], inspected.io);
  assert.equal(JSON.parse(inspected.output[0]).status, 'runtime-verified');
});

test('CLI port install and upgrade support dry-run without changing global configuration', async () => {
  const previous = process.env.CODEX_SKILL_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-cli-skills-'));
  process.env.CODEX_SKILL_ROOT = root;
  try {
    const install = logger();
    await run(['port', 'install', 'jeffallan-code-reviewer', '--dry-run'], install.io);
    assert.equal(JSON.parse(install.output[0]).dryRun, true);
    assert.equal(fs.readdirSync(root).length, 0);

    const upgrade = logger();
    await run(['upgrade', 'project-flow', '--dry-run'], upgrade.io);
    assert.equal(JSON.parse(upgrade.output[0]).dryRun, true);
  } finally {
    if (previous === undefined) delete process.env.CODEX_SKILL_ROOT;
    else process.env.CODEX_SKILL_ROOT = previous;
  }
});

test('CLI resolves direct Phase 7 ports and reports package version', async () => {
  const previous = process.env.CODEX_SKILL_ROOT;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-cli-phase7-'));
  process.env.CODEX_SKILL_ROOT = root;
  try {
    const install = logger();
    await run(['port', 'install', 'seo-audit', '--dry-run'], install.io);
    assert.equal(JSON.parse(install.output[0]).id, 'seo-audit');
    const help = logger();
    await run(['--help'], help.io);
    assert.match(help.output[0], /codex-forge 0\.1\.0/);
  } finally {
    if (previous === undefined) delete process.env.CODEX_SKILL_ROOT;
    else process.env.CODEX_SKILL_ROOT = previous;
  }
});
