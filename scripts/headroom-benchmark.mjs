import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runProcessTree, classifyProcessResult } from '../packages/evaluation/process.mjs';
import { directBenchmarkEnv, parseHeadroomConfig, startHeadroomProxy, withHeadroomArgs } from '../packages/evaluation/headroom.mjs';
import { TASKS, createFixture, gradeTask } from '../benchmarks/tasks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const timeout = Number(process.env.CODEX_BENCHMARK_TIMEOUT_MS || 240000);
const runs = Math.max(1, Number(process.env.CODEX_HEADROOM_RUNS || 1));
const seed = process.env.CODEX_HEADROOM_SEED || 'codex-forge-headroom-v1';
const requestedModel = process.env.CODEX_BENCHMARK_MODEL || null;
const codexVersion = spawnSync('codex', ['--version'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() || 'unavailable';
const config = parseHeadroomConfig({ ...process.env, CODEX_HEADROOM: '1', CODEX_HEADROOM_REQUIRED: '1' });
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const events = (stdout) => stdout.split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });

function usage(items) {
  const total = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
  let observed = false;
  for (const item of items) {
    const value = item.usage || item.item?.usage;
    if (!value) continue;
    observed = true;
    for (const key of Object.keys(total)) total[key] += Number(value[key] || 0);
  }
  return { ...total, observed };
}

function seededNumber(value) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 0x100000000;
}

function conditionOrder(task, repetition) {
  return seededNumber(`${seed}:${task.id}:${repetition}`) < 0.5 ? ['baseline', 'headroom'] : ['headroom', 'baseline'];
}

async function trial(task, condition, repetition, order) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `codex-forge-headroom-${task.id}-${condition}-${repetition}-`));
  const project = path.join(temp, 'project');
  createFixture(task, project);
  spawnSync('git', ['init'], { cwd: project, encoding: 'utf8', windowsHide: true });
  const prompt = `${task.prompt} This is the baseline-vs-Headroom condition. Do not activate or load a CODEX//FORGE skill. This is an isolated local evaluation. Do not inspect the CODEX//FORGE source repository or hidden evaluation data.`;
  const lastMessage = path.join(temp, 'last-message.txt');
  const args = ['exec', '--json', '--approve-for-me', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--cd', project, '--output-last-message', lastMessage];
  if (requestedModel) args.push('--model', requestedModel);
  args.push(prompt);
  let session = null;
  let setupError = null;
  const setupStarted = Date.now();
  if (condition === 'headroom') {
    try { session = await startHeadroomProxy(config, { cwd: project }); }
    catch (error) { setupError = error.message; }
  }
  const startupMs = condition === 'headroom' ? Date.now() - setupStarted : 0;
  if (setupError) return { task: task.id, condition, repetition, condition_order: order, prompt_sha256: sha256(prompt), valid: false, startup_ms: startupMs, setup_error: setupError, headroom: { requested: true, active: false, status: 'unavailable', telemetry_observed: false, stats: null } };
  const result = await runProcessTree('codex', withHeadroomArgs(args, session), { cwd: project, timeoutMs: timeout, env: session?.env || directBenchmarkEnv(process.env, { stripProviderRouting: true }) });
  const headroomResult = session ? await session.close() : null;
  const parsed = events(result.stdout || '');
  const observedUsage = usage(parsed);
  const valid = result.exitCode === 0 && (condition === 'baseline' || Boolean(session?.active && headroomResult?.telemetry_observed));
  return { task: task.id, condition, repetition, condition_order: order, prompt_sha256: sha256(prompt), valid, startup_ms: startupMs, exit_reason: classifyProcessResult(result), timed_out: result.timedOut, exit_code: result.exitCode, elapsed_ms: result.elapsedMs, usage: observedUsage, model_observed: parsed.find((event) => event.model)?.model || null, grade: gradeTask(task, project), stderr_bytes: Buffer.byteLength(result.stderr || '', 'utf8'), headroom: { requested: condition === 'headroom', active: Boolean(session?.active), status: session?.status || 'disabled', telemetry_observed: Boolean(headroomResult?.telemetry_observed), stats: headroomResult?.stats || null, proxy_termination: headroomResult?.termination || null } };
}

function pairFor(task, repetition, trials) {
  const baseline = trials.find((item) => item.task === task.id && item.repetition === repetition && item.condition === 'baseline');
  const headroom = trials.find((item) => item.task === task.id && item.repetition === repetition && item.condition === 'headroom');
  const valid = Boolean(baseline?.valid && headroom?.valid);
  const measured = (item, key) => item?.usage?.observed ? item.usage[key] : null;
  return { task: task.id, repetition, condition_order: baseline?.condition_order || headroom?.condition_order || [], comparison_status: valid ? 'valid-pair' : 'invalid-pair', baseline_score: baseline?.grade?.score ?? null, headroom_score: headroom?.grade?.score ?? null, max_score: baseline?.grade?.max ?? headroom?.grade?.max ?? null, score_delta: baseline?.grade && headroom?.grade ? headroom.grade.score - baseline.grade.score : null, baseline_startup_ms: baseline?.startup_ms ?? null, headroom_startup_ms: headroom?.startup_ms ?? null, baseline_elapsed_ms: baseline?.elapsed_ms ?? null, headroom_elapsed_ms: headroom?.elapsed_ms ?? null, baseline_input_tokens: measured(baseline, 'input_tokens'), headroom_input_tokens: measured(headroom, 'input_tokens'), baseline_output_tokens: measured(baseline, 'output_tokens'), headroom_output_tokens: measured(headroom, 'output_tokens') };
}

const trials = [];
for (let repetition = 1; repetition <= runs; repetition += 1) {
  for (const task of TASKS) {
    const order = conditionOrder(task, repetition);
    for (const condition of order) { console.error(`headroom ${repetition}/${runs} ${task.id} ${condition}`); trials.push(await trial(task, condition, repetition, order)); }
  }
}
const pairs = [];
for (let repetition = 1; repetition <= runs; repetition += 1) for (const task of TASKS) pairs.push(pairFor(task, repetition, trials));
const comparable = pairs.filter((pair) => pair.comparison_status === 'valid-pair');
const sum = (key) => comparable.reduce((total, pair) => total + (pair[key] || 0), 0);
const aggregate = { baseline_startup_ms: sum('baseline_startup_ms'), headroom_startup_ms: sum('headroom_startup_ms'), baseline_elapsed_ms: sum('baseline_elapsed_ms'), headroom_elapsed_ms: sum('headroom_elapsed_ms'), baseline_input_tokens: comparable.every((pair) => pair.baseline_input_tokens !== null) ? sum('baseline_input_tokens') : null, headroom_input_tokens: comparable.every((pair) => pair.headroom_input_tokens !== null) ? sum('headroom_input_tokens') : null, baseline_output_tokens: comparable.every((pair) => pair.baseline_output_tokens !== null) ? sum('baseline_output_tokens') : null, headroom_output_tokens: comparable.every((pair) => pair.headroom_output_tokens !== null) ? sum('headroom_output_tokens') : null };
aggregate.input_token_delta = aggregate.baseline_input_tokens === null || aggregate.headroom_input_tokens === null ? null : aggregate.headroom_input_tokens - aggregate.baseline_input_tokens;
aggregate.output_token_delta = aggregate.baseline_output_tokens === null || aggregate.headroom_output_tokens === null ? null : aggregate.headroom_output_tokens - aggregate.baseline_output_tokens;
aggregate.elapsed_delta_ms = aggregate.headroom_elapsed_ms - aggregate.baseline_elapsed_ms;
const result = { schema_version: 2, benchmark: 'headroom-baseline-vs-experiment', generated_at: new Date().toISOString(), status: comparable.length === pairs.length && pairs.length === runs * TASKS.length ? 'completed' : 'incomplete', methodology: { identical_fixture_per_pair: true, identical_prompt_per_pair: true, randomized_condition_order: true, seed, repetitions_requested: runs, fresh_workspace_per_trial: true, headroom_condition: 'local loopback proxy; provider-reported usage retained when emitted', evidence_policy: 'authoritative fixture artifacts are graded from disk; Headroom stats are telemetry', network: 'provider traffic may traverse the configured provider; Headroom sidecar is local', paid_api_calls: 'unknown', cost_estimate: { status: 'not-computed', reason: 'model pricing was not supplied or observed' } }, environment: { node: process.version, platform: process.platform, arch: process.arch, codex: codexVersion, model_requested: requestedModel, model_observed: trials.find((item) => item.model_observed)?.model_observed || null, headroom: { mode: config.mode, proxy_policy: config.proxyPolicy, config_hash: config.configHash } }, trials_requested: runs * TASKS.length * 2, trials_completed: trials.length, pairs, aggregate: { ...aggregate, comparable_performance: { baseline_elapsed_ms: aggregate.baseline_elapsed_ms, assisted_elapsed_ms: aggregate.headroom_elapsed_ms, baseline_input_tokens: aggregate.baseline_input_tokens, assisted_input_tokens: aggregate.headroom_input_tokens, baseline_output_tokens: aggregate.baseline_output_tokens, assisted_output_tokens: aggregate.headroom_output_tokens }, comparable_pairs: comparable.length, improved: comparable.filter((pair) => pair.score_delta > 0).length, regressed: comparable.filter((pair) => pair.score_delta < 0).length, tied: comparable.filter((pair) => pair.score_delta === 0).length, invalid_pairs: pairs.length - comparable.length, conclusion: comparable.length === 0 ? 'no valid pairs; no performance claim' : 'measured result limited to completed local fixture pairs' } };
const resultsDir = path.join(root, 'benchmarks', 'results');
fs.mkdirSync(resultsDir, { recursive: true });
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (result.status === 'completed') fs.writeFileSync(path.join(resultsDir, 'headroom-latest.json'), serialized, 'utf8');
else fs.writeFileSync(path.join(resultsDir, 'headroom-last-incomplete.json'), serialized, 'utf8');
console.log(JSON.stringify(result.aggregate, null, 2));
if (result.status !== 'completed') process.exitCode = 2;
