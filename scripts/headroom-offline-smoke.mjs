import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

const timeoutMs = Number(process.env.CODEX_HEADROOM_SMOKE_TIMEOUT_MS || 60_000);
const command = process.env.CODEX_HEADROOM_BIN || 'headroom';

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

async function waitForHealth(url, child) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not-ready';
  while (Date.now() < deadline) {
    if (child.error) throw child.error;
    if (child.exitCode !== null) throw new Error(`headroom-exit-${child.exitCode}`);
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      lastError = `http-${response.status}`;
    } catch (error) {
      lastError = error?.name || 'request-error';
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`headroom-smoke-timeout-${lastError}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 5_000 });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (child.exitCode === null) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
  }
  await new Promise((resolve) => child.once('close', resolve));
}

const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const childEnv = {
  ...process.env,
  HEADROOM_OFFLINE: '1',
  HEADROOM_BEACON: 'off',
  HEADROOM_UPDATE_CHECK: 'off',
  HEADROOM_TELEMETRY: 'off',
};
const child = spawn(command, ['proxy', '--host', '127.0.0.1', '--port', String(port), '--no-optimize', '--no-cache', '--no-telemetry', '--stateless'], {
  cwd: process.cwd(),
  env: childEnv,
  windowsHide: true,
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'ignore', 'ignore'],
});
child.error = null;
child.once('error', (error) => { child.error = error; });
try {
  await waitForHealth(baseUrl, child);
  const statsResponse = await fetch(`${baseUrl}/stats`, { signal: AbortSignal.timeout(2_000) });
  if (!statsResponse.ok) throw new Error(`headroom-stats-http-${statsResponse.status}`);
  const stats = await statsResponse.json();
  if (!stats || typeof stats !== 'object') throw new Error('headroom-stats-not-object');
  await stop(child);
  try {
    await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1_000) });
    throw new Error('headroom-process-still-reachable');
  } catch (error) {
    if (error?.message === 'headroom-process-still-reachable') throw error;
  }
  console.log(JSON.stringify({ command, port, health: 'ok', stats: 'json-object', cleanup: 'process-tree-terminated', provider_requests: 0 }));
} finally {
  await stop(child);
}
