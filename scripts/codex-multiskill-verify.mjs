import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installPort } from '../packages/installer/install.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portRoot = path.join(root, 'ports', 'jeffallan');
const skills = ['architecture-designer', 'code-reviewer', 'debugging-wizard', 'secure-code-guardian', 'test-master'];
const artifactNames = {
  'architecture-designer': 'architecture.md',
  'code-reviewer': 'code-review.md',
  'debugging-wizard': 'debugging.md',
  'secure-code-guardian': 'security.md',
  'test-master': 'test-plan.md'
};
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-multiskill-'));
const project = path.join(temp, 'project');
const skillRoot = path.join(project, '.agents', 'skills');
const trace = path.join(temp, 'codex-events.jsonl');
const stderrFile = path.join(temp, 'codex-stderr.txt');
const lastMessage = path.join(temp, 'last-message.txt');
fs.mkdirSync(project, { recursive: true });
const gitInit = spawnSync('git', ['init'], { cwd: project, encoding: 'utf8', windowsHide: true });
if (gitInit.status !== 0) throw new Error(`git init failed: ${gitInit.stderr}`);

fs.mkdirSync(path.join(project, 'fixtures'), { recursive: true });
fs.writeFileSync(path.join(project, 'fixtures', 'review.js'), 'export function total(items) { return items.reduce((sum, item) => sum + item.price, 0); }\n', 'utf8');
fs.writeFileSync(path.join(project, 'fixtures', 'failure.log'), 'ERROR request timeout after retry; root cause unknown\n', 'utf8');
fs.writeFileSync(path.join(project, 'fixtures', 'insecure.js'), 'function render(input) { return `<div>${input}</div>`; }\n', 'utf8');
fs.writeFileSync(path.join(project, 'fixtures', 'feature.md'), '# Feature\nNeed a small API with validation and tests.\n', 'utf8');

for (const name of skills) installPort(path.join(portRoot, `jeffallan-${name}`), { skillRoot });

const prompt = [
  'Use each of these five installed Codex skills explicitly, one at a time: $architecture-designer, $code-reviewer, $debugging-wizard, $secure-code-guardian, and $test-master.',
  'This is a local read-only validation run. Do not use the network, MCP servers, gh, credentials, package managers, or paid services. Do not modify the fixtures and do not create commits.',
  'For architecture-designer, read fixtures/feature.md and write artifacts/architecture.md with a small architecture proposal and trade-offs.',
  'For code-reviewer, read fixtures/review.js and write artifacts/code-review.md with prioritized findings.',
  'For debugging-wizard, read fixtures/failure.log and write artifacts/debugging.md with hypotheses and next checks.',
  'For secure-code-guardian, read fixtures/insecure.js and write artifacts/security.md with concrete security findings and mitigations.',
  'For test-master, read fixtures/feature.md and write artifacts/test-plan.md with unit, integration, and acceptance tests.',
  'Read each installed SKILL.md and any relevant local references before producing its artifact. Finish by reporting the five artifact paths.'
].join(' ');

const result = spawnSync('codex', [
  'exec', '--json', '--approve-for-me', '--ephemeral', '--ignore-user-config', '--cd', project,
  '--output-last-message', lastMessage, prompt
], { cwd: project, encoding: 'utf8', windowsHide: true, timeout: Number(process.env.CODEX_SESSION_TIMEOUT_MS || 600000), maxBuffer: 16 * 1024 * 1024 });
fs.writeFileSync(trace, result.stdout || '', 'utf8');
fs.writeFileSync(stderrFile, result.stderr || '', 'utf8');

const events = (result.stdout || '').split('\n').filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});
const successfulCommands = events.flatMap((event) => {
  const item = event.item;
  return event.type === 'item.completed' && item?.type === 'command_execution' && item.exit_code === 0 && typeof item.command === 'string' ? [item.command] : [];
});
const skillReads = Object.fromEntries(skills.map((name) => [name, successfulCommands.some((command) => command.includes(`.agents\\skills\\jeffallan-${name}\\SKILL.md`) || command.includes(`.agents/skills/jeffallan-${name}/SKILL.md`))]));
const artifacts = Object.fromEntries(Object.entries(artifactNames).map(([skill, file]) => {
  const artifact = path.join(project, 'artifacts', file);
  return [skill, { path: fs.existsSync(artifact) ? path.relative(project, artifact) : null, nonempty: fs.existsSync(artifact) && fs.statSync(artifact).size > 0 }];
}));
const allSkillsRead = Object.values(skillReads).every(Boolean);
const allArtifacts = Object.values(artifacts).every((item) => item.nonempty);
const verified = result.status === 0 && !result.error && allSkillsRead && allArtifacts;
const summary = {
  verification: verified ? 'real-codex-session-verified' : 'harness-only',
  codex_command: 'codex exec',
  exit_code: result.status ?? null,
  installed_skills: skills,
  skill_reads: skillReads,
  artifacts,
  all_skills_read: allSkillsRead,
  all_artifacts_verified: allArtifacts,
  evidence_directory: temp
};
console.log(JSON.stringify(summary, null, 2));
