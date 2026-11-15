import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const started = Date.now();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-onboarding-'));
const skillRoot = path.join(temp, 'skills');
const fixture = path.join(temp, 'index.html');
const report = path.join(temp, 'seo-report.json');
fs.writeFileSync(fixture, '<!doctype html><html lang="en"><head><title>Onboarding fixture</title><meta name="description" content="A local fixture"><meta name="viewport" content="width=device-width"></head><body><h1>Onboarding</h1><a href="/next">Next</a><img src="logo.png" alt="Logo"></body></html>\n');

function run(args) {
  const result = spawnSync(process.execPath, [path.join(root, 'packages', 'cli', 'cli.mjs'), ...args], { cwd: root, env: { ...process.env, CODEX_SKILL_ROOT: skillRoot }, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`command failed: ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout;
}
run(['port', 'inspect', 'seo-audit']);
const dryRun = JSON.parse(run(['port', 'install', 'seo-audit', '--dry-run']));
run(['port', 'install', 'seo-audit']);
const installedScript = path.join(skillRoot, 'seo-audit', 'scripts', 'seo-audit.mjs');
const audit = spawnSync(process.execPath, [installedScript, 'audit', fixture, '--out', report], { cwd: root, encoding: 'utf8', windowsHide: true });
if (audit.status !== 0 || !fs.existsSync(report)) throw new Error(`installed workflow failed: ${audit.stderr || audit.stdout}`);
const reportJson = JSON.parse(fs.readFileSync(report, 'utf8'));
const removal = JSON.parse(run(['port', 'uninstall', 'seo-audit', '--approve']));
const result = { accepted: true, source: 'local Git checkout', port: 'seo-audit', dry_run_previewed: dryRun.dryRun === true, report_score: reportJson.score, report_verified: reportJson.tool === 'codex-forge/seo-audit', uninstalled: !fs.existsSync(path.join(skillRoot, 'seo-audit')), elapsed_ms: Date.now() - started, evidence_directory: temp };
console.log(JSON.stringify(result, null, 2));
if (!result.uninstalled || !removal.backup) process.exitCode = 1;
