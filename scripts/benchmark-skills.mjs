import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installPort } from '../packages/installer/install.mjs';
import { runProcessTree, classifyProcessResult } from '../packages/evaluation/process.mjs';
import { TASKS, DIVERSE_TASKS, createFixture, gradeTask } from '../benchmarks/tasks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argValue = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const mode = argValue('--mode') || 'smoke';
const tasks = mode === 'full' ? DIVERSE_TASKS : TASKS;
if (!['smoke', 'full'].includes(mode)) throw new Error(`unsupported benchmark mode: ${mode}`);
const runs = Math.max(1, Number(process.env.CODEX_BENCHMARK_RUNS || 1));
const timeout = Number(process.env.CODEX_BENCHMARK_TIMEOUT_MS || 240000);
const seed = process.env.CODEX_BENCHMARK_SEED || 'codex-forge-phase-6';
const checkpointPath = argValue('--checkpoint') || path.join(root, 'benchmarks', 'results', '.phase-6-checkpoint.json');
const resume = args.includes('--resume');
const requestedModel = process.env.CODEX_BENCHMARK_MODEL || null;
const codexVersion = spawnSync('codex', ['--version'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() || 'unavailable';

const environment = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  codex: codexVersion,
  model_requested: requestedModel,
  model_observed: null,
  configuration: ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--approve-for-me (workspace-write implied)'],
  paid_api_calls: false
};

function parseEvents(stdout) {
  return stdout.split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function commandEvents(events) {
  return events.filter((event) => event.type === 'item.completed' && event.item?.type === 'command_execution');
}

function usage(events) {
  const total = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
  for (const event of events) {
    const value = event.usage || event.item?.usage;
    if (!value) continue;
    for (const key of Object.keys(total)) total[key] += Number(value[key] || 0);
  }
  return total;
}

function observedModel(events) {
  for (const event of events) {
    if (typeof event.model === 'string') return event.model;
    if (typeof event.item?.model === 'string') return event.item.model;
    if (typeof event.usage?.model === 'string') return event.usage.model;
  }
  return null;
}

function skillRead(events, portId) {
  const needle = `.agents/skills/${portId.toLowerCase()}/skill.md`;
  return commandEvents(events).some((event) => event.item.exit_code === 0 && String(event.item.command).toLowerCase().replaceAll('\\', '/').includes(needle));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function seededNumber(value) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 0x100000000;
}

function conditionOrder(task, repetition) {
  return seededNumber(`${seed}:${task.id}:${repetition}`) < 0.5 ? ['baseline', 'assisted'] : ['assisted', 'baseline'];
}

function writeCheckpoint(trials) {
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.writeFileSync(checkpointPath, `${JSON.stringify({ schema_version: 1, mode, runs, seed, task_ids: tasks.map((task) => task.id), trials }, null, 2)}\n`, 'utf8');
}

async function runTrial(task, condition, repetition, order) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `codex-forge-phase-6-${task.id}-${condition}-${repetition}-`));
  const project = path.join(temp, 'project');
  createFixture(task, project);
  spawnSync('git', ['init'], { cwd: project, encoding: 'utf8', windowsHide: true });
  const prompt = [
    task.prompt,
    condition === 'assisted'
      ? `Explicitly activate the installed $${task.skill} skill. Read its SKILL.md and only the relevant local references before working.`
      : 'This is the baseline condition. Solve directly without activating or loading a skill.',
    'This is an isolated local evaluation. Do not inspect the CODEX//FORGE source repository or hidden evaluation data.'
  ].join(' ');
  if (condition === 'assisted') installPort(path.join(root, 'ports', 'jeffallan', task.portId), { skillRoot: path.join(project, '.agents', 'skills') });
  const trace = path.join(temp, 'events.jsonl');
  const lastMessage = path.join(temp, 'last-message.txt');
  const commandArgs = ['exec', '--json', '--approve-for-me', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--cd', project, '--output-last-message', lastMessage];
  if (requestedModel) commandArgs.push('--model', requestedModel);
  commandArgs.push(prompt);
  const result = await runProcessTree('codex', commandArgs, { cwd: project, timeoutMs: timeout });
  fs.writeFileSync(trace, result.stdout || '', 'utf8');
  const events = parseEvents(result.stdout || '');
  const commands = commandEvents(events);
  const read = skillRead(events, task.portId);
  const grade = gradeTask(task, project);
  const observed = observedModel(events);
  if (observed && !environment.model_observed) environment.model_observed = observed;
  const valid = result.exitCode === 0 && (condition === 'baseline' ? !fs.existsSync(path.join(project, '.agents', 'skills')) && !read : read);
  return {
    key: `${task.id}:${repetition}:${condition}`,
    task: task.id,
    skill: task.skill,
    condition,
    repetition,
    condition_order: order,
    task_prompt_sha256: sha256(task.prompt),
    condition_instruction: condition === 'assisted' ? 'activate-named-skill' : 'direct-baseline',
    prompt_sha256: sha256(prompt),
    codex_exit_code: result.exitCode,
    signal: result.signal,
    exit_reason: classifyProcessResult(result),
    timed_out: result.timedOut,
    elapsed_ms: result.elapsedMs,
    process_tree_termination: result.termination || null,
    stderr_bytes: Buffer.byteLength(result.stderr || '', 'utf8'),
    command_count: commands.length,
    successful_command_count: commands.filter((event) => event.item.exit_code === 0).length,
    usage: usage(events),
    model_observed: observed,
    skill_read: read,
    valid,
    grade,
    evidence: {
      artifact_files: fs.existsSync(path.join(project, 'artifacts')) ? fs.readdirSync(path.join(project, 'artifacts')).sort() : [],
      private_trace_retained_locally: true
    }
  };
}

function pairFor(task, repetition, trials) {
  const baseline = trials.find((trial) => trial.task === task.id && trial.repetition === repetition && trial.condition === 'baseline');
  const assisted = trials.find((trial) => trial.task === task.id && trial.repetition === repetition && trial.condition === 'assisted');
  const baselineValid = Boolean(baseline?.valid);
  const assistedValid = Boolean(assisted?.valid);
  const status = baselineValid && assistedValid ? 'valid-pair' : !baselineValid ? 'baseline-failed' : assisted?.skill_read === false ? 'assisted-skill-not-read' : 'assisted-failed';
  return {
    task: task.id,
    skill: task.skill,
    repetition,
    condition_order: baseline?.condition_order || assisted?.condition_order || [],
    shared_task_prompt_sha256: baseline?.task_prompt_sha256 || assisted?.task_prompt_sha256 || null,
    baseline_score: baseline?.grade.score ?? null,
    assisted_score: assisted?.grade.score ?? null,
    max_score: baseline?.grade.max ?? assisted?.grade.max ?? null,
    score_delta: baseline && assisted ? assisted.grade.score - baseline.grade.score : null,
    baseline_elapsed_ms: baseline?.elapsed_ms ?? null,
    assisted_elapsed_ms: assisted?.elapsed_ms ?? null,
    baseline_output_tokens: baseline?.usage.output_tokens ?? null,
    assisted_output_tokens: assisted?.usage.output_tokens ?? null,
    baseline_skill_read: baseline?.skill_read ?? false,
    assisted_skill_read: assisted?.skill_read ?? false,
    baseline_valid: baselineValid,
    assisted_valid: assistedValid,
    comparison_status: status
  };
}

function summarize(trials) {
  const pairs = [];
  for (let repetition = 1; repetition <= runs; repetition += 1) for (const task of tasks) pairs.push(pairFor(task, repetition, trials));
  const comparable = pairs.filter((pair) => pair.comparison_status === 'valid-pair');
  const improved = comparable.filter((pair) => pair.score_delta > 0).length;
  const regressed = comparable.filter((pair) => pair.score_delta < 0).length;
  const tied = comparable.filter((pair) => pair.score_delta === 0).length;
  const performance = comparable.reduce((summary, pair) => ({
    baseline_elapsed_ms: summary.baseline_elapsed_ms + (pair.baseline_elapsed_ms || 0),
    assisted_elapsed_ms: summary.assisted_elapsed_ms + (pair.assisted_elapsed_ms || 0),
    baseline_output_tokens: summary.baseline_output_tokens + (pair.baseline_output_tokens || 0),
    assisted_output_tokens: summary.assisted_output_tokens + (pair.assisted_output_tokens || 0)
  }), { baseline_elapsed_ms: 0, assisted_elapsed_ms: 0, baseline_output_tokens: 0, assisted_output_tokens: 0 });
  performance.elapsed_delta_ms = performance.assisted_elapsed_ms - performance.baseline_elapsed_ms;
  performance.output_token_delta = performance.assisted_output_tokens - performance.baseline_output_tokens;
  const conclusion = improved > 0 && regressed > 0 ? 'mixed: improvements and regressions observed; no general improvement claim' : improved > regressed ? 'limited improvement observed; more repetitions required' : improved < regressed ? 'limited regression observed; more repetitions required' : 'inconclusive: no aggregate score improvement observed';
  return { pairs, aggregate: { comparable_pairs: comparable.length, improved, regressed, tied, invalid_pairs: pairs.length - comparable.length, mean_score_delta: comparable.length ? comparable.reduce((sum, pair) => sum + pair.score_delta, 0) / comparable.length : null, comparable_performance: performance, conclusion } };
}

async function main() {
  const checkpoint = resume && fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) : { trials: [] };
  const trials = [...(checkpoint.trials || [])];
  const completed = new Set(trials.map((trial) => trial.key));
  for (let repetition = 1; repetition <= runs; repetition += 1) {
    for (const task of tasks) {
      const order = conditionOrder(task, repetition);
      for (const condition of order) {
        const key = `${task.id}:${repetition}:${condition}`;
        if (completed.has(key)) continue;
        console.error(`benchmark ${mode} ${repetition}/${runs} ${task.id} ${condition}`);
        const trial = await runTrial(task, condition, repetition, order);
        trials.push(trial);
        completed.add(key);
        writeCheckpoint(trials);
      }
    }
  }
  const summary = summarize(trials);
  const result = {
    schema_version: 2,
    benchmark: 'phase-6-reliability-integrity-developer-experience',
    generated_at: new Date().toISOString(),
    mode,
    seed,
    repetitions_requested: runs,
    methodology: {
      identical_fixture_per_pair: true,
      randomized_condition_order: true,
      fresh_workspace_per_trial: true,
      baseline_skill_isolation: 'temporary Git project with no .agents/skills and --ignore-user-config/--ignore-rules',
      assisted_activation: 'only the named installed port is present and explicitly activated with $skill',
      hidden_criteria: 'grader runs outside each temporary project and is never copied into the agent workspace',
      grading_dimensions: ['functional correctness', 'security correctness', 'bug detection', 'false positives', 'test coverage', 'documentation completeness', 'runtime reliability', 'token and latency overhead'],
      checkpointing: 'one durable checkpoint is written after every trial; --resume continues missing keys',
      paid_api_calls: 'none; local Codex CLI only'
    },
    environment,
    trials_requested: runs * tasks.length * 2,
    trials_completed: trials.length,
    ...summary,
    trials
  };
  const outDir = path.join(root, 'benchmarks', 'results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'phase-6-latest.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  if (trials.length === runs * tasks.length * 2) fs.rmSync(checkpointPath, { force: true });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(`benchmark: ${error.stack || error.message}`); process.exitCode = 1; });
