import crypto from 'node:crypto';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
const DEFAULT_PROXY_MODE = 'cache';
const MAX_STARTUP_TIMEOUT_MS = 60_000;
const MAX_STATS_BYTES = 512 * 1024;
const MAX_PROXY_OUTPUT_BYTES = 256 * 1024;
const STAT_KEYS = ['requests', 'tokens_before', 'tokens_after', 'tokens_saved', 'compression_latency_ms'];
const truthy = new Set(['1', 'true', 'yes', 'on']);
const falsy = new Set(['0', 'false', 'no', 'off', '']);

export class HeadroomConfigError extends Error {
  constructor(message) { super(message); this.name = 'HeadroomConfigError'; }
}

function booleanEnv(value, name, defaultValue = false) {
  if (value === undefined) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (truthy.has(normalized)) return true;
  if (falsy.has(normalized)) return false;
  throw new HeadroomConfigError(`${name} must be one of: 0, 1, false, true, off, on`);
}

function positiveInt(value, name, fallback, maximum) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) throw new HeadroomConfigError(`${name} must be an integer between 1 and ${maximum}`);
  return parsed;
}

function localProxyUrl(value, name) {
  if (!value) return null;
  let parsed;
  try { parsed = new URL(value); } catch { throw new HeadroomConfigError(`${name} must be a valid URL`); }
  if (parsed.protocol !== 'http:') throw new HeadroomConfigError(`${name} must use http:// for a loopback proxy`);
  if (!['127.0.0.1', '[::1]', '::1'].includes(parsed.hostname)) throw new HeadroomConfigError(`${name} must target a loopback IP literal`);
  if (!parsed.port) throw new HeadroomConfigError(`${name} must include an explicit port`);
  return parsed;
}

export function parseHeadroomConfig(env = process.env) {
  const enabled = booleanEnv(env.CODEX_HEADROOM, 'CODEX_HEADROOM', false);
  const required = booleanEnv(env.CODEX_HEADROOM_REQUIRED, 'CODEX_HEADROOM_REQUIRED', false);
  const active = booleanEnv(env.CODEX_FORGE_HEADROOM_ACTIVE, 'CODEX_FORGE_HEADROOM_ACTIVE', false);
  if (enabled && active) throw new HeadroomConfigError('recursive Headroom configuration detected');
  const mode = String(env.CODEX_HEADROOM_MODE || DEFAULT_PROXY_MODE).trim().toLowerCase();
  if (!['cache', 'token'].includes(mode)) throw new HeadroomConfigError('CODEX_HEADROOM_MODE must be cache or token');
  const proxyPolicy = String(env.CODEX_HEADROOM_PROXY || 'auto').trim().toLowerCase();
  if (!['auto', 'existing', 'spawn'].includes(proxyPolicy)) throw new HeadroomConfigError('CODEX_HEADROOM_PROXY must be auto, existing, or spawn');
  const proxyUrl = localProxyUrl(env.CODEX_HEADROOM_PROXY_URL, 'CODEX_HEADROOM_PROXY_URL');
  const port = positiveInt(env.CODEX_HEADROOM_PORT, 'CODEX_HEADROOM_PORT', null, 65_535);
  if (port !== null && port < 1024) throw new HeadroomConfigError('CODEX_HEADROOM_PORT must be between 1024 and 65535');
  if (proxyUrl && port !== null && Number(proxyUrl.port) !== port) throw new HeadroomConfigError('CODEX_HEADROOM_PORT does not match CODEX_HEADROOM_PROXY_URL');
  if (proxyPolicy === 'existing' && !proxyUrl && port === null) throw new HeadroomConfigError('existing Headroom proxy requires CODEX_HEADROOM_PROXY_URL or CODEX_HEADROOM_PORT');
  if (proxyPolicy === 'spawn' && proxyUrl) throw new HeadroomConfigError('spawn Headroom proxy cannot be combined with CODEX_HEADROOM_PROXY_URL');
  const startupTimeoutMs = positiveInt(env.CODEX_HEADROOM_STARTUP_TIMEOUT_MS, 'CODEX_HEADROOM_STARTUP_TIMEOUT_MS', DEFAULT_STARTUP_TIMEOUT_MS, MAX_STARTUP_TIMEOUT_MS);
  const command = String(env.CODEX_HEADROOM_BIN || 'headroom').trim();
  if (!command || command.includes('\0')) throw new HeadroomConfigError('CODEX_HEADROOM_BIN must be a non-empty executable name or path');
  return { enabled, required, mode, proxyPolicy, proxyUrl, port, startupTimeoutMs, command, configHash: crypto.createHash('sha256').update(JSON.stringify({ enabled, required, mode, proxyPolicy, proxyUrl: proxyUrl?.origin || null, port, startupTimeoutMs, command })).digest('hex') };
}

export function directBenchmarkEnv(env = process.env, { stripProviderRouting = false } = {}) {
  const direct = { ...env, CODEX_HEADROOM: '0', CODEX_HEADROOM_REQUIRED: '0', CODEX_FORGE_HEADROOM_ACTIVE: '0' };
  for (const key of ['CODEX_HEADROOM_PROXY_URL', 'CODEX_HEADROOM_PORT', 'CODEX_HEADROOM_BIN', 'HEADROOM_PORT', 'HEADROOM_PROJECT']) delete direct[key];
  if (stripProviderRouting) delete direct.OPENAI_BASE_URL;
  return direct;
}

export function headroomProxyEnv(env = process.env) {
  const sanitized = { ...env, CODEX_HEADROOM: '0', HEADROOM_OFFLINE: '1', HEADROOM_BEACON: 'off', HEADROOM_UPDATE_CHECK: 'off', HEADROOM_TELEMETRY: 'on' };
  if (!booleanEnv(env.CODEX_HEADROOM_PASSTHROUGH_SECRETS, 'CODEX_HEADROOM_PASSTHROUGH_SECRETS', false)) {
    for (const key of Object.keys(sanitized)) {
      if (/(TOKEN|SECRET|PASSWORD|API_KEY|AUTH|COOKIE|CREDENTIAL|PRIVATE_KEY)/i.test(key)) delete sanitized[key];
    }
  }
  return sanitized;
}

function appendBounded(target, chunk) {
  const value = `${target}${chunk}`;
  return Buffer.byteLength(value, 'utf8') <= MAX_PROXY_OUTPUT_BYTES ? value : Buffer.from(value, 'utf8').subarray(-MAX_PROXY_OUTPUT_BYTES).toString('utf8');
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function readBounded(response) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_STATS_BYTES) throw new Error('response-size-limit');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('response-body-unavailable');
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_STATS_BYTES) {
      await reader.cancel();
      throw new Error('response-size-limit');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

async function getJson(url, timeoutMs = 2_000) {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error', headers: { accept: 'application/json' } });
    const text = await readBounded(response);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return JSON.parse(text);
  } finally { clearTimeout(handle); }
}

function safeErrorCode(error) {
  if (error?.code) return error.code;
  const message = String(error?.message || '');
  if (/^[a-z0-9-]+$/i.test(message)) return message;
  if (message.includes('ENOENT')) return 'ENOENT';
  return error?.name || 'startup-error';
}

async function waitForReady(baseUrl, child, timeoutMs, getSpawnError = () => null) {
  const started = Date.now();
  let lastError = 'not-ready';
  while (Date.now() - started < timeoutMs) {
    const spawnError = getSpawnError();
    if (spawnError) throw new Error(`proxy-${safeErrorCode(spawnError)}`);
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`proxy-exit-${child.exitCode}`);
    try { await getJson(`${baseUrl}/health`, 500); return; }
    catch (error) { lastError = safeErrorCode(error); await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error(`proxy-readiness-timeout-${lastError}`);
}

function killTree(pid, signal = 'SIGTERM') {
  if (!pid) return { attempted: false, method: 'no-pid' };
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true, timeout: 5_000, stdio: 'ignore' });
    return { attempted: true, method: 'taskkill-tree', signal, exitCode: result.status ?? null, error: result.error?.code || null };
  }
  try { process.kill(-pid, signal); return { attempted: true, method: `process-group-${signal.toLowerCase()}` }; }
  catch (error) { return { attempted: true, method: `process-group-${signal.toLowerCase()}`, error: error.code || error.message }; }
}

async function stopProxy(child) {
  if (!child || child.exitCode !== null) return null;
  const termination = killTree(child.pid, 'SIGTERM');
  await new Promise((resolve) => { const timer = setTimeout(resolve, 1_500); child.once('close', () => { clearTimeout(timer); resolve(); }); });
  if (child.exitCode === null && process.platform !== 'win32') {
    termination.force = killTree(child.pid, 'SIGKILL');
    await new Promise((resolve) => { const timer = setTimeout(resolve, 1_000); child.once('close', () => { clearTimeout(timer); resolve(); }); });
  }
  return termination;
}

function listenerPid(port) {
  if (process.platform === 'win32') {
    const output = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true, timeout: 5_000 }).stdout || '';
    const match = output.match(new RegExp(`(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::\\]):${port}\\s+[^\\r\\n]*LISTENING\\s+(\\d+)`, 'i'));
    return match ? Number(match[1]) : null;
  }
  const lsof = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], { encoding: 'utf8', timeout: 5_000 });
  const lsofMatch = (lsof.stdout || '').match(/p(\d+)/);
  if (lsofMatch) return Number(lsofMatch[1]);
  const ss = spawnSync('ss', ['-ltnp'], { encoding: 'utf8', timeout: 5_000 });
  const ssMatch = (ss.stdout || '').match(new RegExp(`:${port}\\s+.*pid=(\\d+)`));
  return ssMatch ? Number(ssMatch[1]) : null;
}

function processIsDescendant(rootPid, targetPid) {
  if (rootPid === targetPid) return true;
  if (process.platform === 'win32') {
    const script = `$root=${Number(rootPid)}; $current=${Number(targetPid)}; for ($i=0; $i -lt 32; $i++) { if ($current -eq $root) { Write-Output 'owned'; exit 0 }; $row=Get-CimInstance Win32_Process -Filter \"ProcessId = $current\" | Select-Object -First 1 ParentProcessId; if (-not $row) { Write-Output 'missing'; exit 1 }; $current=[int]$row.ParentProcessId }; Write-Output 'depth'; exit 1`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
    return result.status === 0 && (result.stdout || '').trim() === 'owned';
  }
  const output = spawnSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8', timeout: 5_000 }).stdout || '';
  const parents = new Map(output.split('\n').map((line) => line.trim().split(/\s+/).map(Number)).filter((row) => row.length === 2).map(([pid, ppid]) => [pid, ppid]));
  let current = targetPid;
  for (let i = 0; i < 32 && parents.has(current); i += 1) { current = parents.get(current); if (current === rootPid) return true; }
  return false;
}

function assertOwnedListener(port, pid) {
  const owner = listenerPid(port);
  if (!owner || !processIsDescendant(pid, owner)) throw new Error('proxy-listener-ownership-unverified');
  return owner;
}

async function waitForOwnedListener(port, pid, timeoutMs) {
  const deadline = Date.now() + Math.min(Math.max(Number(timeoutMs) || 1_000, 250), 5_000);
  let lastError;
  while (Date.now() < deadline) {
    try { return assertOwnedListener(port, pid); }
    catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw lastError || new Error('proxy-listener-ownership-unverified');
}

function statsSummary(stats) {
  if (!stats || typeof stats !== 'object') return null;
  const find = (keys) => {
    const queue = [stats];
    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;
      for (const [key, value] of Object.entries(current)) {
        if (keys.includes(key) && Number.isFinite(Number(value))) return Number(value);
        if (value && typeof value === 'object') queue.push(value);
      }
    }
    return null;
  };
  const summary = { requests: find(['requests', 'request_count', 'total_requests']), tokens_before: find(['tokens_before', 'total_tokens_before']), tokens_after: find(['tokens_after', 'total_tokens_after']), tokens_saved: find(['tokens_saved', 'total_tokens_saved', 'total_tokens_removed']), compression_latency_ms: find(['compression_latency_ms', 'latency_ms']) };
  return telemetryObserved(summary) ? summary : null;
}

function deltaStats(before, after) {
  if (!after) return null;
  if (!before) return after;
  return Object.fromEntries(STAT_KEYS.map((key) => [key, Number.isFinite(after[key]) && Number.isFinite(before[key]) ? after[key] - before[key] : after[key]]));
}

function telemetryObserved(stats) {
  return Boolean(stats && STAT_KEYS.some((key) => Number.isFinite(stats[key])));
}

export async function startHeadroomProxy(config, { cwd, env = process.env } = {}) {
  if (!config?.enabled) return { enabled: false, active: false, status: 'disabled', args: null, env: directBenchmarkEnv(env), close: async () => ({ stats: null, termination: null }) };
  const base = config.proxyUrl || (config.port ? new URL(`http://127.0.0.1:${config.port}`) : null);
  const useExisting = config.proxyPolicy === 'existing' || Boolean(config.proxyUrl) || (config.proxyPolicy === 'auto' && Boolean(config.port));
  const routedEnv = { ...env, CODEX_HEADROOM: '0', CODEX_FORGE_HEADROOM_ACTIVE: '1' };
  if (useExisting) {
    const existingUrl = base;
    await waitForReady(existingUrl.origin, null, config.startupTimeoutMs);
    const before = await getJson(`${existingUrl.origin}/stats`).then(statsSummary).catch(() => null);
    return { enabled: true, active: true, status: 'existing', proxyUrl: existingUrl.origin, args: ['--config', `openai_base_url="${existingUrl.origin}/v1"`], env: { ...routedEnv, OPENAI_BASE_URL: `${existingUrl.origin}/v1` }, close: async () => { const after = await getJson(`${existingUrl.origin}/stats`).then(statsSummary).catch(() => null); return { stats: deltaStats(before, after), termination: null, telemetry_observed: telemetryObserved(after) }; } };
  }
  if (config.proxyPolicy === 'existing') throw new Error('proxy-not-configured');
  const port = config.port || await findFreePort();
  const childEnv = { ...headroomProxyEnv(env), CODEX_FORGE_HEADROOM_ACTIVE: '1' };
  const child = spawn(config.command, ['proxy', '--host', '127.0.0.1', '--port', String(port), '--mode', config.mode, '--telemetry'], { cwd, env: childEnv, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let spawnError = null;
  child.once('error', (error) => { spawnError = error; });
  let proxyStdout = '';
  let proxyStderr = '';
  child.stdout?.on('data', (chunk) => { proxyStdout = appendBounded(proxyStdout, chunk.toString()); });
  child.stderr?.on('data', (chunk) => { proxyStderr = appendBounded(proxyStderr, chunk.toString()); });
  try {
    const proxyUrl = new URL(`http://127.0.0.1:${port}`);
    await waitForReady(proxyUrl.origin, child, config.startupTimeoutMs, () => spawnError);
    const ownerPid = await waitForOwnedListener(port, child.pid, config.startupTimeoutMs);
    return { enabled: true, active: true, status: 'spawned', proxyUrl: proxyUrl.origin, ownerPid, args: ['--config', `openai_base_url="${proxyUrl.origin}/v1"`], env: { ...routedEnv, OPENAI_BASE_URL: `${proxyUrl.origin}/v1` }, close: async () => { const stats = await getJson(`${proxyUrl.origin}/stats`).then(statsSummary).catch(() => null); const termination = await stopProxy(child); return { stats, termination, telemetry_observed: telemetryObserved(stats), proxy_output: { stdout_bytes: Buffer.byteLength(proxyStdout), stderr_bytes: Buffer.byteLength(proxyStderr) } }; } };
  } catch (error) {
    await stopProxy(child);
    throw new Error(`headroom-startup-${safeErrorCode(error)}`);
  }
}

export function withHeadroomArgs(args, session) { return session?.active ? [...session.args, ...args] : args; }
