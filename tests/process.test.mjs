import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { classifyProcessResult, runProcessTree } from '../packages/evaluation/process.mjs';

test('process runner reports a normal successful exit', async () => {
  const result = await runProcessTree(process.execPath, ['-e', 'process.stdout.write("ok")'], { timeoutMs: 2000 });
  assert.equal(result.exitCode, 0);
  assert.equal(result.exitReason, 'success');
  assert.equal(classifyProcessResult(result), 'success');
  assert.equal(result.stdout, 'ok');
});

test('process runner terminates a timed-out process tree', async () => {
  const marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-process-')), 'orphan-marker.txt');
  const childCode = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'orphan-survived'), 1000);`;
  const parentCode = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], {stdio: 'ignore'}); setInterval(() => {}, 1000);`;
  const result = await runProcessTree(process.execPath, ['-e', parentCode], { timeoutMs: 100, killGraceMs: 500 });
  assert.equal(result.timedOut, true);
  assert.equal(result.exitReason, 'timeout');
  assert.equal(classifyProcessResult(result), 'timeout');
  assert.equal(result.termination?.attempted, true);
  assert.ok(result.elapsedMs < 10000, `tree termination took ${result.elapsedMs}ms`);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(fs.existsSync(marker), false, 'a descendant process survived tree cancellation');
});
