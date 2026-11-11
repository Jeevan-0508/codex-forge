#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnFileSync } from './runtime.mjs';

function value(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function values(args, flag) {
  const result = [];
  for (let index = 0; index < args.length; index += 1) if (args[index] === flag && args[index + 1]) result.push(args[index + 1]);
  return result;
}

function slugSafe(slug) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug || '')) throw new Error('slug must contain lowercase letters, numbers, and hyphens only');
  return slug;
}

function projectDir(slug, cwd = process.cwd()) {
  const root = path.resolve(cwd, '.codex-forge', 'projects');
  const dir = path.resolve(root, slugSafe(slug));
  if (!dir.startsWith(`${root}${path.sep}`)) throw new Error('project path escapes project root');
  return dir;
}

function readState(slug) {
  const dir = projectDir(slug);
  const file = path.join(dir, 'state.json');
  if (!fs.existsSync(file)) throw new Error(`project not found: ${slug}`);
  return { dir, file, state: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

function writeJson(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
}

function usage() {
  return `project-flow commands:\n  plan --slug <slug> --title <title> --requirements <text>\n  decompose --slug <slug> --task <title> [--task <title>]\n  status --slug <slug>\n  complete --slug <slug> --task TASK-001 --test <command> --acceptance <text> --passed\n  issue --slug <slug> --task TASK-001 --repo OWNER/REPO [--dry-run|--approve]\n  worktree --slug <slug> --task TASK-001 --base <branch> [--dry-run|--approve]`;
}

export function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const [command, ...args] = argv;
  if (!command || command === 'help') return { ok: true, output: usage() };
  if (command === 'plan') {
    const slug = slugSafe(value(args, '--slug'));
    const title = value(args, '--title');
    const requirements = value(args, '--requirements');
    if (!title || !requirements) throw new Error('plan requires --title and --requirements');
    const dir = projectDir(slug, cwd);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'PRD.md'), `# ${title}\n\n## Requirements\n\n${requirements}\n\n## Acceptance criteria\n\n- [ ] Requirements are implemented and tested.\n- [ ] No credentials or unrelated files are changed.\n`, 'utf8');
    writeJson(path.join(dir, 'state.json'), { slug, title, status: 'planned', created_at: new Date().toISOString(), tasks: [] });
    return { ok: true, output: { slug, status: 'planned', directory: dir } };
  }
  const slug = value(args, '--slug');
  if (!slug) throw new Error('command requires --slug');
  if (command === 'decompose') {
    const record = readState(slug);
    const titles = values(args, '--task');
    if (!titles.length) throw new Error('decompose requires at least one --task');
    const start = record.state.tasks.length;
    for (const [offset, taskTitle] of titles.entries()) record.state.tasks.push({ id: `TASK-${String(start + offset + 1).padStart(3, '0')}`, title: taskTitle, status: 'todo', tests: [], acceptance: [], issue: null, worktree: null });
    record.state.status = 'ready';
    writeJson(record.file, record.state);
    return { ok: true, output: { slug, added: titles.length, status: record.state.status } };
  }
  const record = readState(slug);
  if (command === 'status') {
    const counts = record.state.tasks.reduce((result, task) => {
      result[task.status] = (result[task.status] || 0) + 1;
      return result;
    }, {});
    return { ok: true, output: { slug, title: record.state.title, status: record.state.status, counts, tasks: record.state.tasks } };
  }
  const taskId = value(args, '--task');
  const task = record.state.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`task not found: ${taskId}`);
  if (command === 'complete') {
    if (!args.includes('--passed')) throw new Error('completion requires explicit --passed test evidence');
    const testCommand = value(args, '--test');
    const acceptance = value(args, '--acceptance');
    if (!testCommand || !acceptance) throw new Error('complete requires --test and --acceptance');
    task.status = 'done'; task.tests = [testCommand]; task.acceptance = [acceptance]; task.completed_at = new Date().toISOString();
    record.state.status = record.state.tasks.every((item) => item.status === 'done') ? 'complete' : 'in-progress';
    writeJson(record.file, record.state);
    return { ok: true, output: { slug, task: task.id, status: task.status, project_status: record.state.status } };
  }
  if (command === 'issue') {
    const repo = value(args, '--repo');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new Error('issue requires a safe OWNER/REPO');
    const title = `[${slug}] ${task.id}: ${task.title}`;
    const body = `Project: ${slug}\nTask: ${task.id}\n\nAcceptance criteria:\n- ${task.acceptance.join('\n- ') || 'Define before completion.'}`;
    const commandArgs = ['issue', 'create', '--repo', repo, '--title', title, '--body', body];
    if (!args.includes('--approve')) return { ok: true, output: { dry_run: true, command: ['gh', ...commandArgs], reason: 'pass --approve to create the GitHub Issue' } };
    const issue = spawnFileSync('gh', commandArgs, cwd);
    task.issue = issue.stdout.trim(); writeJson(record.file, record.state);
    return { ok: true, output: { task: task.id, issue: task.issue } };
  }
  if (command === 'worktree') {
    const base = value(args, '--base') || 'main';
    if (!/^[\w./-]+$/.test(base)) throw new Error('unsafe base branch');
    const worktree = path.resolve(cwd, '.worktrees', `${slug}-${task.id.toLowerCase()}`);
    if (!worktree.startsWith(`${path.resolve(cwd, '.worktrees')}${path.sep}`)) throw new Error('worktree path escapes project root');
    const commandArgs = ['worktree', 'add', worktree, base];
    if (!args.includes('--approve')) return { ok: true, output: { dry_run: true, command: ['git', ...commandArgs], reason: 'pass --approve to create the worktree' } };
    spawnFileSync('git', commandArgs, cwd);
    task.worktree = worktree; writeJson(record.file, record.state);
    return { ok: true, output: { task: task.id, worktree } };
  }
  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try { const result = run(); console.log(JSON.stringify(result.output, null, 2)); }
  catch (error) { console.error(`project-flow: ${error.message}`); process.exitCode = 1; }
}
