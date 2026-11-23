import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { directBenchmarkEnv, headroomProxyEnv, HeadroomConfigError, parseHeadroomConfig, startHeadroomProxy, withHeadroomArgs } from '../packages/evaluation/headroom.mjs';

test('Headroom is disabled by default and preserves the direct command', () => {
  const config = parseHeadroomConfig({});
  assert.equal(config.enabled, false);
  assert.deepEqual(withHeadroomArgs(['exec', 'prompt'], null), ['exec', 'prompt']);
  assert.equal(directBenchmarkEnv({ CODEX_HEADROOM: '1', OPENAI_BASE_URL: 'http://127.0.0.1:8787' }, { stripProviderRouting: true }).OPENAI_BASE_URL, undefined);
  assert.equal(headroomProxyEnv({ GITHUB_TOKEN: 'secret', PATH: 'safe' }).GITHUB_TOKEN, undefined);
  assert.equal(headroomProxyEnv({ CODEX_HEADROOM_PASSTHROUGH_SECRETS: '1', GITHUB_TOKEN: 'secret' }).GITHUB_TOKEN, 'secret');
});

test('Headroom configuration rejects malformed, recursive, and non-loopback settings', () => {
  assert.throws(() => parseHeadroomConfig({ CODEX_HEADROOM: 'maybe' }), HeadroomConfigError);
  assert.throws(() => parseHeadroomConfig({ CODEX_HEADROOM: '1', CODEX_FORGE_HEADROOM_ACTIVE: '1' }), /recursive/);
  assert.throws(() => parseHeadroomConfig({ CODEX_HEADROOM: '1', CODEX_HEADROOM_PROXY_URL: 'https://127.0.0.1:8787' }), /http/);
  assert.throws(() => parseHeadroomConfig({ CODEX_HEADROOM: '1', CODEX_HEADROOM_PROXY_URL: 'http://example.test:8787' }), /loopback/);
  assert.throws(() => parseHeadroomConfig({ CODEX_HEADROOM: '1', CODEX_HEADROOM_PROXY_URL: 'http://localhost:8787' }), /loopback IP literal/);
  assert.throws(() => parseHeadroomConfig({ CODEX_HEADROOM: '1', CODEX_HEADROOM_PROXY: 'existing', CODEX_HEADROOM_PORT: '8787' }), /TRUST_EXISTING/);
  assert.throws(() => parseHeadroomConfig({ CODEX_HEADROOM: '1', CODEX_HEADROOM_MODE: 'lossy' }), /cache or token/);
});

test('Headroom existing-proxy mode reads bounded local stats and never owns the proxy', async () => {
  let statsCalls = 0;
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/health') return response.end(JSON.stringify({ status: 'ok' }));
    if (request.url === '/stats') { statsCalls += 1; return response.end(JSON.stringify({ tokens: { tokens_before: statsCalls > 1 ? 100 : 0, tokens_after: statsCalls > 1 ? 40 : 0, tokens_saved: statsCalls > 1 ? 60 : 0 }, request_count: statsCalls > 1 ? 1 : 0 })); }
    response.statusCode = 404;
    return response.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const config = parseHeadroomConfig({ CODEX_HEADROOM: '1', CODEX_HEADROOM_PROXY: 'existing', CODEX_HEADROOM_PORT: String(port), CODEX_HEADROOM_TRUST_EXISTING: '1' });
    const session = await startHeadroomProxy(config);
    assert.equal(session.status, 'existing');
    assert.equal(session.env.CODEX_FORGE_HEADROOM_ACTIVE, '1');
    assert.equal(session.env.CODEX_HEADROOM, '0');
    assert.throws(() => parseHeadroomConfig({ ...session.env, CODEX_HEADROOM: '1' }), /recursive/);
    assert.deepEqual(withHeadroomArgs(['exec', 'prompt'], session).slice(0, 2), ['--config', `openai_base_url="http://127.0.0.1:${port}/v1"`]);
    const closed = await session.close();
    assert.deepEqual(closed.stats, { requests: 1, tokens_before: 100, tokens_after: 40, tokens_saved: 60, compression_latency_ms: null });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Headroom does not treat an empty stats object as observed telemetry', async () => {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url === '/health') return response.end(JSON.stringify({ status: 'ok' }));
    if (request.url === '/stats') return response.end('{}');
    response.statusCode = 404;
    return response.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const config = parseHeadroomConfig({ CODEX_HEADROOM: '1', CODEX_HEADROOM_PROXY: 'existing', CODEX_HEADROOM_PORT: String(port), CODEX_HEADROOM_TRUST_EXISTING: '1' });
    const session = await startHeadroomProxy(config);
    const result = await session.close();
    assert.equal(result.stats, null);
    assert.equal(result.telemetry_observed, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Headroom missing binaries fail as safe startup errors instead of unhandled events', async () => {
  const config = parseHeadroomConfig({ CODEX_HEADROOM: '1', CODEX_HEADROOM_PROXY: 'spawn', CODEX_HEADROOM_BIN: 'codex-forge-missing-headroom-binary' });
  await assert.rejects(() => startHeadroomProxy(config), /headroom-startup-proxy-ENOENT/);
});

test('Headroom rejects oversized health responses before buffering them', async () => {
  const payload = JSON.stringify({ data: 'x'.repeat(600 * 1024) });
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.setHeader('content-length', Buffer.byteLength(payload));
    response.end(payload);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const config = parseHeadroomConfig({ CODEX_HEADROOM: '1', CODEX_HEADROOM_PROXY: 'existing', CODEX_HEADROOM_PORT: String(port), CODEX_HEADROOM_TRUST_EXISTING: '1', CODEX_HEADROOM_STARTUP_TIMEOUT_MS: '1000' });
    await assert.rejects(() => startHeadroomProxy(config), /headroom-startup-proxy-readiness-timeout|response-size-limit/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Headroom rejects malformed health JSON within the bounded readiness window', async () => {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end('{not-json');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    const config = parseHeadroomConfig({ CODEX_HEADROOM: '1', CODEX_HEADROOM_PROXY: 'existing', CODEX_HEADROOM_PORT: String(port), CODEX_HEADROOM_TRUST_EXISTING: '1', CODEX_HEADROOM_STARTUP_TIMEOUT_MS: '1000' });
    await assert.rejects(() => startHeadroomProxy(config), /readiness-timeout/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
