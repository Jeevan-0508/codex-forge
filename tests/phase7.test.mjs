import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateManifest } from '../packages/installer/install.mjs';

const root = path.resolve('.');
test('phase 7 ports have cleared manifests, no dependencies, and verified hashes', () => {
  for (const id of ['seo-audit', 'game-prototype']) {
    const manifest = validateManifest(path.join(root, 'ports', id), { allowHarness: true });
    assert.equal(manifest.license, 'MIT');
    assert.deepEqual(manifest.dependencies, []);
    assert.equal(manifest.source.copied_upstream_files, false);
    assert.equal(manifest.verification.harness, 'passed');
  }
});

test('seo-audit produces deterministic findings without network access', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-seo-test-'));
  const html = path.join(temp, 'index.html');
  fs.writeFileSync(html, '<!doctype html><html lang="en"><head><title>Fixture</title><meta name="description" content="A fixture"><meta name="viewport" content="width=device-width"></head><body><h1>Fixture</h1><a href="/next">Next</a><img src="logo.png" alt="Logo"></body></html>\n');
  const result = spawnSync(process.execPath, [path.join(root, 'ports/seo-audit/scripts/seo-audit.mjs'), 'audit', html], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.score, 80);
  assert.equal(report.checks.find((item) => item.id === 'image-alt').pass, true);
});

test('game-prototype creates and validates a self-contained browser slice', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-game-test-'));
  const game = path.join(temp, 'game');
  const script = path.join(root, 'ports/game-prototype/scripts/game-prototype.mjs');
  assert.equal(spawnSync(process.execPath, [script, 'init', game, '--title', 'Fixture Runner'], { encoding: 'utf8' }).status, 0);
  const result = spawnSync(process.execPath, [script, 'check', game], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).passed, true);
});
