import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installPort } from '../packages/installer/install.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = path.join(root, 'ports', 'project-flow');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-session-'));
const project = path.join(temp, 'project');
const skillRoot = path.join(project, '.agents', 'skills');
const trace = path.join(temp, 'codex-events.jsonl');
const stderrFile = path.join(temp, 'codex-stderr.txt');
const lastMessage = path.join(temp, 'last-message.txt');

fs.mkdirSync(project, { recursive: true });
const gitInit = spawnSync('git', ['init'], { cwd: project, encoding: 'utf8', windowsHide: true });
if (gitInit.status !== 0) throw new Error(`git init failed: ${gitInit.stderr}`);
installPort(port, { skillRoot });

const prompt = [
  'Use the $project-flow skill installed in this project.',
  'This is a local validation run. Do not use the network, gh, credentials, MCP servers, or paid services.',
  'Do not create commits or modify files outside this project.',
  'Create a PRD with slug real-codex-session and title Real Codex Validation.',
  'Use requirements: prove that the installed project workflow can create and track a small feature.',
  'Decompose it into exactly two tasks, then inspect the task status.',
  'Do not complete tasks. At the end, report the paths created and the observed task counts.'
].join(' ');

const result = spawnSync('codex', [
  'exec',
  '--json',
  '--approve-for-me',
  '--ephemeral',
  '--ignore-user-config',
  '--cd', project,
  '--output-last-message', lastMessage,
  prompt
], {
  cwd: project,
  encoding: 'utf8',
  windowsHide: true,
  timeout: Number(process.env.CODEX_SESSION_TIMEOUT_MS || 300000),
  maxBuffer: 8 * 1024 * 1024
});

fs.writeFileSync(trace, result.stdout || '', 'utf8');
fs.writeFileSync(stderrFile, result.stderr || '', 'utf8');

const projectDir = path.join(project, '.codex-forge', 'projects', 'real-codex-session');
const prd = path.join(projectDir, 'PRD.md');
const stateFile = path.join(projectDir, 'state.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
const events = (result.stdout || '').split('\n').filter(Boolean).flatMap((line) => {
  try {
    return [JSON.parse(line)];
  } catch {
    return [];
  }
});
const commands = events.flatMap((event) => {
  const item = event.item;
  return item?.type === 'command_execution' && typeof item.command === 'string' ? [item.command] : [];
});
const successfulWorkflowCommands = events.flatMap((event) => {
  const item = event.item;
  if (event.type !== 'item.completed' || item?.type !== 'command_execution' || item.exit_code !== 0 || typeof item.command !== 'string') return [];
  return /project-flow\.mjs\s+(?:plan|decompose|status)\b/.test(item.command) ? [item.command.match(/project-flow\.mjs\s+(plan|decompose|status)/)?.[1]] : [];
}).filter(Boolean);

const authenticatedRun = result.status === 0 && !result.error;
const artifactsVerified = fs.existsSync(prd) && fs.existsSync(stateFile) && state?.tasks?.length === 2 && state.status === 'ready' && state.tasks.every((task) => task.status === 'todo');
const skillUsed = commands.some((command) => command.includes('project-flow.mjs'));
const summary = {
  verification: authenticatedRun && artifactsVerified && successfulWorkflowCommands.length === 3 ? 'real-codex-session-verified' : 'harness-only',
  codex_cli_detected: true,
  codex_command: 'codex exec',
  exit_code: result.status ?? null,
  skill_installed_at: path.relative(project, skillRoot),
  skill_used: skillUsed,
  successful_workflow_commands: [...new Set(successfulWorkflowCommands)],
  artifacts_verified: artifactsVerified,
  prd: fs.existsSync(prd) ? path.relative(project, prd) : null,
  state: fs.existsSync(stateFile) ? path.relative(project, stateFile) : null,
  task_count: state?.tasks?.length ?? 0,
  task_status_counts: state?.tasks?.reduce((counts, task) => ({ ...counts, [task.status]: (counts[task.status] || 0) + 1 }), {}) || {},
  evidence_directory: temp
};

if (summary.verification === 'real-codex-session-verified') assert.equal(summary.skill_used, true);
console.log(JSON.stringify(summary, null, 2));
