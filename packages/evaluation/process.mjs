import { spawn, spawnSync } from 'node:child_process';

function killProcessTree(pid) {
  if (!pid) return { attempted: false, method: 'no-pid' };
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
      stdio: 'pipe'
    });
    return { attempted: true, method: 'taskkill-tree', exitCode: result.status ?? null, error: result.error?.code || null };
  }
  let termError = null;
  try { process.kill(-pid, 'SIGTERM'); } catch (error) { termError = error.code || error.message; }
  return { attempted: true, method: 'process-group-sigterm', error: termError };
}

function forceKillProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true, timeout: 5000, stdio: 'ignore' });
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch { /* The process already exited. */ }
}

/**
 * Run a command with a wall-clock deadline and terminate its complete process tree.
 * Windows uses taskkill /T; Unix-like systems use a detached process group.
 */
export function runProcessTree(command, args = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs || 120000);
  const killGraceMs = Number(options.killGraceMs || 1500);
  const startedAt = Date.now();
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  let timeoutHandle;
  let forceKillHandle;
  let settled = false;
  let timedOut = false;
  let termination;

  child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

  return new Promise((resolve) => {
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      clearTimeout(forceKillHandle);
      resolve({
        ...result,
        stdout,
        stderr,
        pid: child.pid ?? null,
        elapsedMs: Date.now() - startedAt,
        timedOut,
        termination,
        exitReason: timedOut ? 'timeout' : result.error ? 'spawn-error' : result.signal ? `signal:${result.signal}` : result.exitCode === 0 ? 'success' : 'exit-code'
      });
    };

    child.once('error', (error) => finish({ exitCode: null, signal: null, error: error.code || error.message }));
    child.once('close', (exitCode, signal) => finish({ exitCode, signal, error: null }));
    timeoutHandle = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      termination = killProcessTree(child.pid);
      forceKillHandle = setTimeout(() => forceKillProcessTree(child.pid), killGraceMs);
    }, timeoutMs);
  });
}

export function classifyProcessResult(result) {
  if (result.timedOut) return 'timeout';
  if (result.error) return 'spawn-error';
  if (result.exitCode === 0) return 'success';
  if (result.signal) return `signal:${result.signal}`;
  return 'exit-code';
}
