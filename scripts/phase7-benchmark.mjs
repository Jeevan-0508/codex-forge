import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installPort } from '../packages/installer/install.mjs';
import { runProcessTree, classifyProcessResult } from '../packages/evaluation/process.mjs';
import { PHASE7_TASKS } from '../benchmarks/phase7-tasks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const timeout = Number(process.env.CODEX_BENCHMARK_TIMEOUT_MS || 240000);
const requestedModel = process.env.CODEX_BENCHMARK_MODEL || null;
const codexVersion = spawnSync('codex', ['--version'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() || 'unavailable';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
function events(stdout) { return stdout.split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } }); }
function usage(items) { const value = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 }; for (const item of items) { const u = item.usage || item.item?.usage; if (u) for (const key of Object.keys(value)) value[key] += Number(u[key] || 0); } return value; }
function skillRead(items, id) { const needle = `.agents/skills/${id}/skill.md`; return items.some((e) => e.type === 'item.completed' && e.item?.type === 'command_execution' && e.item.exit_code === 0 && String(e.item.command).toLowerCase().replaceAll('\\', '/').includes(needle)); }
async function trial(task, condition) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `codex-forge-phase-7-${task.id}-${condition}-`));
  const project = path.join(temp, 'project'); fs.mkdirSync(project, { recursive: true }); task.create(project); spawnSync('git', ['init'], { cwd: project, windowsHide: true });
  if (condition === 'assisted') installPort(path.join(root, 'ports', task.portId), { skillRoot: path.join(project, '.agents', 'skills'), allowHarness: true });
  const prompt = `${task.prompt} ${condition === 'assisted' ? `Explicitly activate $${task.skill}, read .agents/skills/${task.skill}/SKILL.md, and use its bundled script.` : 'This is the baseline condition. Work directly without activating or loading any CODEX//FORGE skill.'} This is isolated local evaluation; do not inspect the CODEX//FORGE source repository or hidden evaluation data.`;
  const last = path.join(temp, 'last-message.txt'); const args = ['exec', '--json', '--approve-for-me', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--cd', project, '--output-last-message', last]; if (requestedModel) args.push('--model', requestedModel); args.push(prompt);
  const result = await runProcessTree('codex', args, { cwd: project, timeoutMs: timeout });
  const parsed = events(result.stdout || ''); const read = skillRead(parsed, task.skill); const grade = task.grade(project); const valid = result.exitCode === 0 && (condition === 'baseline' ? !read : read);
  return { task: task.id, skill: task.skill, condition, prompt_sha256: sha256(prompt), valid, skill_read: read, grade, exit_reason: classifyProcessResult(result), timed_out: result.timedOut, exit_code: result.exitCode, elapsed_ms: result.elapsedMs, usage: usage(parsed), model_observed: parsed.find((e) => e.model)?.model || null, artifact_files: fs.existsSync(path.join(project, 'artifacts')) ? fs.readdirSync(path.join(project, 'artifacts')).sort() : [] };
}
const trials = [];
for (const task of PHASE7_TASKS) for (const condition of ['baseline', 'assisted']) { console.error(`phase7 ${task.id} ${condition}`); trials.push(await trial(task, condition)); }
const pairs = PHASE7_TASKS.map((task) => { const b=trials.find((t)=>t.task===task.id&&t.condition==='baseline'); const a=trials.find((t)=>t.task===task.id&&t.condition==='assisted'); const valid=Boolean(b.valid&&a.valid); return { task:task.id, skill:task.skill, comparison_status:valid?'valid-pair':'invalid-pair', baseline_score:b.grade.score, assisted_score:a.grade.score, max_score:b.grade.max, score_delta:a.grade.score-b.grade.score, baseline_elapsed_ms:b.elapsed_ms, assisted_elapsed_ms:a.elapsed_ms, baseline_output_tokens:b.usage.output_tokens, assisted_output_tokens:a.usage.output_tokens }; });
const comparable = pairs.filter((p)=>p.comparison_status==='valid-pair');
const result = { schema_version: 1, benchmark: 'phase-7-functional-port-smoke', generated_at: new Date().toISOString(), mode: 'smoke', methodology: { paired_conditions: 'same fixture and requirements; assisted condition explicitly activates only the named port', hidden_grading: 'independent artifact checks in phase7-tasks.mjs', network: false, paid_api_calls: false }, environment: { node:process.version, platform:process.platform, arch:process.arch, codex:codexVersion, model_requested:requestedModel, model_observed:trials.find((t)=>t.model_observed)?.model_observed||null }, trials_completed:trials.length, trials, pairs, aggregate: { comparable_pairs:comparable.length, improved:comparable.filter((p)=>p.score_delta>0).length, tied:comparable.filter((p)=>p.score_delta===0).length, regressed:comparable.filter((p)=>p.score_delta<0).length, invalid_pairs:pairs.length-comparable.length, conclusion:comparable.length && comparable.every((p)=>p.score_delta>0)?'limited improvement observed; repeat before generalizing':'inconclusive or mixed; no general improvement claim' } };
fs.mkdirSync(path.join(root, 'benchmarks', 'results'), { recursive: true }); fs.writeFileSync(path.join(root, 'benchmarks', 'results', 'phase-7-latest.json'), `${JSON.stringify(result, null, 2)}\n`); console.log(JSON.stringify(result.aggregate, null, 2));
