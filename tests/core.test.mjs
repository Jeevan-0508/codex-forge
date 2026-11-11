import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCatalog, searchCatalog, findProject } from '../packages/core/catalog.mjs';
import { analyzeCompatibility } from '../packages/compatibility/analyze.mjs';
import { convertSkill } from '../packages/converter/convert.mjs';
import { validatePort } from '../packages/validator/validate.mjs';
import { buildSearchUrl, discoverRepositories } from '../packages/discovery/github.mjs';

test('catalog loads and searches real seed metadata', () => {
  const catalog = loadCatalog();
  assert.equal(catalog.length, 8);
  assert.equal(findProject(catalog, 'claude-mem').repository, 'thedotmack/claude-mem');
  assert.equal(searchCatalog(catalog, 'memory').length >= 1, true);
});

test('license evidence blocks unsafe compatibility claims', () => {
  const project = findProject(loadCatalog(), 'claude-code');
  const result = analyzeCompatibility(project);
  assert.equal(result.redistribution_allowed, false);
  assert.match(result.reasons.join(' '), /license/i);
});

test('converter writes a Codex skill and an explicit conversion record', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-'));
  const result = convertSkill(path.join(process.cwd(), 'fixtures', 'sample-claude-skill'), out);
  assert.equal(result.name, 'sample-review');
  assert.match(fs.readFileSync(path.join(out, 'SKILL.md'), 'utf8'), /generated-by: codex-forge/);
  assert.match(fs.readFileSync(path.join(out, 'CONVERSION.md'), 'utf8'), /runtime behavior is not verified/);
  assert.equal(validatePort(out).valid, true);
});

test('validator catches credential-like content', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-forge-secret-'));
  fs.writeFileSync(path.join(out, 'SKILL.md'), '---\nname: bad\ndescription: bad\n---\napi_key: "abcdefghijklmnop"\n');
  assert.equal(validatePort(out).valid, false);
});

test('GitHub discovery builds paginated requests and preserves evidence fields', async () => {
  assert.match(buildSearchUrl('claude code', 2, 10), /page=2/);
  const result = await discoverRepositories({
    query: 'claude code',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ items: [{ full_name: 'owner/repo', html_url: 'https://github.com/owner/repo', license: { spdx_id: 'MIT' }, stargazers_count: 2, updated_at: '2026-01-01T00:00:00Z' }] }) })
  });
  assert.equal(result[0].repository, 'owner/repo');
  assert.equal(result[0].license, 'MIT');
});
