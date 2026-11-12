import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TASKS, DIVERSE_TASKS, createFixture, gradeTask } from '../benchmarks/tasks.mjs';

test('benchmark suite contains five independent deterministic task definitions', () => {
  assert.deepEqual(TASKS.map((task) => task.id), ['architecture', 'code-review', 'debugging', 'security', 'testing']);
  assert.equal(new Set(TASKS.map((task) => task.skill)).size, 5);
  assert.equal(DIVERSE_TASKS.length, 10);
  assert.equal(new Set(DIVERSE_TASKS.map((task) => task.id)).size, 10);
  for (const task of TASKS) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), `codex-forge-benchmark-test-${task.id}-`));
    createFixture(task, project);
    const grade = gradeTask(task, project);
    assert.ok(grade.score < grade.max, `${task.id} must not pass before the agent acts`);
    assert.ok(grade.max > 0);
  }
});

test('benchmark task prompts keep the baseline and assisted conditions explicit', () => {
  for (const task of TASKS) {
    assert.match(task.prompt, /artifacts\//);
    assert.doesNotMatch(task.prompt, /hidden|criteria/i);
    assert.match(task.portId, /^jeffallan-/);
  }
});
