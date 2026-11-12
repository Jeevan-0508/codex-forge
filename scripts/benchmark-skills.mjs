import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installPort } from '../packages/installer/install.mjs';
import { TASKS, createFixture, gradeTask } from '../benchmarks/tasks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runs = Math.max(1, Number(process.env.CODEX_BENCHMARK_RUNS || 1));
const timeout = Number(process.env.CODEX_BENCHMARK_TIMEOUT_MS || 240000);
const codexVersion = spawnSync('codex', ['--version'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() || 'unavailable';
const model = process.env.CODEX_BENCHMARK_MODEL || 'default-configured';
const environment = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  codex: codexVersion,
  model,
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

function skillRead(events, portId) {
  const needle = `.agents/skills/${portId.toLowerCase()}/skill.md`;
  return commandEvents(events).some((event) => event.item.exit_code === 0 && String(event.item.command).toLowerCase().replaceAll('\\', '/').includes(needle));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function runTrial(task, condition, repetition) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `codex-forge-benchmark-${task.id}-${condition}-${repetition}-`));
  const project = path.join(temp, 'project');
  createFixture(task, project);
  spawnSync('git', ['init'], { cwd: project, encoding: 'utf8', windowsHide: true });
  const prompt = [
    task.prompt,
    condition === 'assisted'
      ? `Explicitly activate the installed $${task.skill} skill. Read its SKILL.md and relevant local references before working.`
      : 'This is the baseline condition. Do not look for, load, or use any installed skill; solve the task directly.',
    'This is an isolated local evaluation. Do not inspect the CODEX//FORGE source repository or any hidden evaluation data.'
  ].join(' ');
  if (condition === 'assisted') {
    installPort(path.join(root, 'ports', 'jeffallan', task.portId), { skillRoot: path.join(project, '.agents', 'skills') });
  }
  const trace = path.join(temp, 'events.jsonl');
  const lastMessage = path.join(temp, 'last-message.txt');
  const started = Date.now();
  const result = spawnSync('codex', [
    'exec', '--json', '--approve-for-me', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--cd', project,
    '--output-last-message', lastMessage, prompt
  ], { cwd: project, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 32 * 1024 * 1024 });
  const elapsedMs = Date.now() - started;
  const stdout = result.stdout || '';
  fs.writeFileSync(trace, stdout, 'utf8');
  const events = parseEvents(stdout);
  const commands = commandEvents(events);
  const grade = gradeTask(task, project);
  const read = skillRead(events, task.portId);
  return {
    task: task.id,
    skill: task.skill,
    condition,
    repetition,
    prompt_sha256: sha256(prompt),
    codex_exit_code: result.status ?? null,
    timed_out: Boolean(result.error?.code === 'ETIMEDOUT'),
    elapsed_ms: elapsedMs,
    command_count: commands.length,
    successful_command_count: commands.filter((event) => event.item.exit_code === 0).length,
    usage: usage(events),
    skill_read: read,
    baseline_skill_isolation: condition === 'baseline' ? !fs.existsSync(path.join(project, '.agents', 'skills')) && !read : null,
    grade,
    evidence: {
      artifact_files: fs.existsSync(path.join(project, 'artifacts')) ? fs.readdirSync(path.join(project, 'artifacts')).sort() : [],
      private_trace_retained_locally: true
    }
  };
}

const trials = [];
for (let repetition = 1; repetition <= runs; repetition += 1) {
  for (const task of TASKS) {
    for (const condition of ['baseline', 'assisted']) {
      console.error(`benchmark ${repetition}/${runs} ${task.id} ${condition}`);
      trials.push(runTrial(task, condition, repetition));
    }
  }
}

const pairs = TASKS.map((task) => {
  const baseline = trials.find((trial) => trial.task === task.id && trial.condition === 'baseline');
  const assisted = trials.find((trial) => trial.task === task.id && trial.condition === 'assisted');
  const baselineValid = Boolean(baseline?.codex_exit_code === 0 && baseline?.baseline_skill_isolation === true);
  const assistedValid = Boolean(assisted?.codex_exit_code === 0 && assisted?.skill_read === true);
  const status = baselineValid && assistedValid ? 'valid-pair' : !baselineValid ? 'baseline-failed' : !assistedValid && assisted?.skill_read === false ? 'assisted-skill-not-read' : 'assisted-failed';
  return {
    task: task.id,
    skill: task.skill,
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
});
const comparablePairs = pairs.filter((pair) => pair.comparison_status === 'valid-pair');
const improved = comparablePairs.filter((pair) => pair.score_delta > 0).length;
const regressed = comparablePairs.filter((pair) => pair.score_delta < 0).length;
const tied = comparablePairs.filter((pair) => pair.score_delta === 0).length;
const meanScoreDelta = comparablePairs.length ? comparablePairs.reduce((sum, pair) => sum + pair.score_delta, 0) / comparablePairs.length : null;
const comparablePerformance = comparablePairs.reduce((summary, pair) => ({
  baseline_elapsed_ms: summary.baseline_elapsed_ms + (pair.baseline_elapsed_ms || 0),
  assisted_elapsed_ms: summary.assisted_elapsed_ms + (pair.assisted_elapsed_ms || 0),
  baseline_output_tokens: summary.baseline_output_tokens + (pair.baseline_output_tokens || 0),
  assisted_output_tokens: summary.assisted_output_tokens + (pair.assisted_output_tokens || 0)
}), { baseline_elapsed_ms: 0, assisted_elapsed_ms: 0, baseline_output_tokens: 0, assisted_output_tokens: 0 });
comparablePerformance.elapsed_delta_ms = comparablePerformance.assisted_elapsed_ms - comparablePerformance.baseline_elapsed_ms;
comparablePerformance.output_token_delta = comparablePerformance.assisted_output_tokens - comparablePerformance.baseline_output_tokens;
const conclusion = improved > 0 && regressed > 0
  ? 'mixed: improvements and regressions observed; no general improvement claim'
  : improved > regressed
    ? 'limited improvement observed on deterministic checks; more trials required'
    : improved < regressed
      ? 'limited regression observed on deterministic checks; more trials required'
      : 'inconclusive: no aggregate score improvement observed';
const result = {
  schema_version: 1,
  benchmark: 'phase-5-evidence-based-quality-benchmarks',
  generated_at: new Date().toISOString(),
  methodology: {
    identical_fixture_per_pair: true,
    baseline_skill_isolation: 'temporary Git project with no .agents/skills and --ignore-user-config/--ignore-rules',
    assisted_activation: 'only the named installed port is present and explicitly activated with $skill',
    hidden_criteria: 'grader runs outside each temporary project and is never copied into the agent workspace',
    scoring: 'deterministic fixture checks; artifacts are not scored for length or polish',
    paid_api_calls: 'none; local Codex CLI only'
  },
  environment,
  trials_requested: runs * TASKS.length * 2,
  trials_completed: trials.length,
  pairs,
  aggregate: { comparable_pairs: comparablePairs.length, improved, regressed, tied, invalid_pairs: pairs.length - comparablePairs.length, mean_score_delta: meanScoreDelta, comparable_performance: comparablePerformance, conclusion },
  trials
};
const outDir = path.join(root, 'benchmarks', 'results');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'phase-5-latest.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...result, trials: result.trials.map(({ evidence, ...trial }) => ({ ...trial, evidence: { artifact_files: evidence.artifact_files } })) }, null, 2));
