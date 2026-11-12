import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function hasAll(text, terms) {
  const lower = text.toLowerCase();
  return terms.every((term) => lower.includes(term.toLowerCase()));
}

function hasAny(text, terms) {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function check(id, pass, notes) {
  return { id, pass: Boolean(pass), notes };
}

function gradeResult(checks, dimensions) {
  return { checks, score: checks.filter((item) => item.pass).length, max: checks.length, dimensions };
}

function dimension(checks, ids) {
  const selected = checks.filter((item) => ids.includes(item.id));
  return selected.length ? selected.filter((item) => item.pass).length / selected.length : null;
}

export const TASKS = [
  {
    id: 'architecture',
    skill: 'architecture-designer',
    portId: 'jeffallan-architecture-designer',
    prompt: 'Analyze the repository requirements and create artifacts/architecture.md. Include a concrete component design, data flow, storage decision, failure modes, security considerations, trade-offs, and one ADR. Do not modify source files, install dependencies, use the network, or create commits.',
    setup(project) {
      write(project, 'README.md', '# Order intake service\n\nThe service accepts orders from a web client, validates them, reserves inventory, charges a payment provider, and emits an order-confirmed event. Duplicate requests must not create duplicate charges.\n\nThe first release should support 500 requests per minute, recover from payment timeouts, and make failed orders inspectable by support staff.\n');
      write(project, 'src/current-state.md', '# Current state\nThe repository is empty apart from this requirements note. No framework, database, queue, or cloud provider is selected.\n');
    },
    grade(project) {
      const file = path.join(project, 'artifacts', 'architecture.md');
      const text = fs.existsSync(file) ? read(project, 'artifacts/architecture.md') : '';
      const checks = [
        check('architecture-artifact', text.length > 300, 'architecture artifact exists and is substantive'),
        check('components', hasAll(text, ['component', 'api', 'payment']), 'names the service components'),
        check('data-flow', hasAll(text, ['data flow', 'order']), 'describes order data flow'),
        check('trade-offs', hasAny(text, ['trade-off', 'tradeoff']), 'records trade-offs'),
        check('failure-recovery', hasAll(text, ['timeout', 'retry', 'failure']), 'covers failure and recovery'),
        check('idempotency-security', hasAll(text, ['idempot', 'security']), 'addresses duplicate charges and security'),
        check('adr', hasAll(text, ['adr', 'decision']), 'includes an architecture decision record')
      ];
      return gradeResult(checks, { documentation_completeness: dimension(checks, ['architecture-artifact', 'components', 'data-flow', 'trade-offs', 'adr']), reliability_design: dimension(checks, ['failure-recovery', 'idempotency-security']) });
    }
  },
  {
    id: 'code-review',
    skill: 'code-reviewer',
    portId: 'jeffallan-code-reviewer',
    prompt: 'Review src/cart.js and create artifacts/review.md. Report prioritized findings with file, location, severity, rationale, and remediation. Distinguish real defects from safe code. Do not modify source files, install dependencies, use the network, or create commits.',
    setup(project) {
      write(project, 'src/cart.js', `export function applyCoupon(total, percent) {\n  return total - (total * percent / 100);\n}\n\nexport function parseQuantity(value) {\n  return Number(value);\n}\n\nexport function safeAdd(a, b) {\n  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new TypeError('numbers required');\n  return a + b;\n}\n`);
      write(project, 'README.md', '# Cart review fixture\nReview the source without changing it. Percentages must be between 0 and 100, quantities must be finite positive integers, and safeAdd already enforces its numeric contract.\n');
    },
    grade(project) {
      const file = path.join(project, 'artifacts', 'review.md');
      const text = fs.existsSync(file) ? read(project, 'artifacts/review.md') : '';
      const lower = text.toLowerCase();
      const safeSection = lower.includes('safeadd') && (lower.includes('no issue') || lower.includes('correct') || lower.includes('valid') || lower.includes('not a defect'));
      const checks = [
        check('review-artifact', text.length > 250, 'review artifact exists and is substantive'),
        check('coupon-range', hasAll(text, ['coupon', 'percent', '0', '100']), 'identifies the unchecked coupon range'),
        check('quantity-validation', hasAll(text, ['quantity', 'nan']) && (lower.includes('negative') || lower.includes('positive')), 'identifies invalid quantity handling'),
        check('prioritized-remediation', hasAll(text, ['severity', 'remediat']), 'prioritizes and remediates findings'),
        check('false-positive-control', safeSection, 'does not incorrectly report safeAdd as a defect')
      ];
      return gradeResult(checks, { bug_detection: dimension(checks, ['coupon-range', 'quantity-validation']), false_positives: dimension(checks, ['false-positive-control']), documentation_completeness: dimension(checks, ['review-artifact', 'prioritized-remediation']) });
    }
  },
  {
    id: 'debugging',
    skill: 'debugging-wizard',
    portId: 'jeffallan-debugging-wizard',
    prompt: 'Investigate the failing tests in tests/priority.test.mjs, fix the production bug in src/priority.js, and create artifacts/debugging.md with the observed failure, root cause, fix, and verification. Run the tests. Do not install dependencies, use the network, or create commits.',
    setup(project) {
      write(project, 'src/priority.js', `export function priorityLabel(score) {\n  if (score > 80) return 'high';\n  if (score > 50) return 'medium';\n  return 'low';\n}\n`);
      write(project, 'tests/priority.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { priorityLabel } from '../src/priority.js';\n\n test('treats the high boundary as high', () => assert.equal(priorityLabel(80), 'high'));\n test('treats the medium boundary as medium', () => assert.equal(priorityLabel(50), 'medium'));\n test('keeps values below the medium boundary low', () => assert.equal(priorityLabel(49), 'low'));\n test('keeps very high values high', () => assert.equal(priorityLabel(120), 'high'));\n`);
    },
    grade(project) {
      const source = fs.existsSync(path.join(project, 'src/priority.js')) ? read(project, 'src/priority.js') : '';
      const artifact = fs.existsSync(path.join(project, 'artifacts/debugging.md')) ? read(project, 'artifacts/debugging.md') : '';
      const tests = fs.existsSync(path.join(project, 'tests/priority.test.mjs')) ? spawnTest(project, 'tests/priority.test.mjs') : { pass: false, notes: 'test file missing' };
      const checks = [
        check('bug-fixed', source.includes('>= 80') && source.includes('>= 50'), 'fixes both inclusive boundary comparisons'),
        check('regression-tests', tests.pass, tests.notes),
        check('debug-artifact', hasAll(artifact, ['root cause', 'boundary', 'verification']), 'records evidence-based diagnosis and verification'),
        check('tests-unchanged', artifact.length > 200, 'leaves a substantive debugging record')
      ];
      return gradeResult(checks, { functional_correctness: dimension(checks, ['bug-fixed', 'regression-tests']), documentation_completeness: dimension(checks, ['debug-artifact', 'tests-unchanged']) });
    }
  },
  {
    id: 'security',
    skill: 'secure-code-guardian',
    portId: 'jeffallan-secure-code-guardian',
    prompt: 'Audit and remediate the security defects in src/render.js. Run the existing tests and create artifacts/security.md describing the vulnerability, exploit impact, mitigation, and verification. Do not install dependencies, use the network, or create commits.',
    setup(project) {
      write(project, 'src/render.js', `export function renderGreeting(name) {\n  return \`<h1>Hello, \${name}</h1>\`;\n}\n\nexport function hasAdminAccess(role) {\n  return role === 'admin';\n}\n`);
      write(project, 'tests/security.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { renderGreeting, hasAdminAccess } from '../src/render.js';\n\n test('escapes markup and quotes in user names', () => {\n  assert.equal(renderGreeting('<img src=x>&"'), '<h1>Hello, &lt;img src=x&gt;&amp;&quot;</h1>');\n });\n test('does not grant admin access to a case variant', () => assert.equal(hasAdminAccess('ADMIN'), false));\n test('grants access to the exact admin role', () => assert.equal(hasAdminAccess('admin'), true));\n`);
    },
    grade(project) {
      const artifact = fs.existsSync(path.join(project, 'artifacts/security.md')) ? read(project, 'artifacts/security.md') : '';
      const tests = fs.existsSync(path.join(project, 'tests/security.test.mjs')) ? spawnTest(project, 'tests/security.test.mjs') : { pass: false, notes: 'test file missing' };
      const source = fs.existsSync(path.join(project, 'src/render.js')) ? read(project, 'src/render.js') : '';
      const checks = [
        check('security-tests', tests.pass, tests.notes),
        check('escaping-implemented', !source.includes('`<h1>Hello, ${name}</h1>`') && (source.includes('&lt;') || source.includes('escape')), 'removes raw HTML interpolation'),
        check('authorization-boundary', source.includes("role === 'admin'") || source.includes('role === "admin"'), 'retains exact-role authorization'),
        check('security-artifact', hasAll(artifact, ['xss', 'impact', 'mitigat', 'verification']), 'records vulnerability, impact, mitigation, and verification')
      ];
      return gradeResult(checks, { security_correctness: dimension(checks, ['security-tests', 'escaping-implemented', 'authorization-boundary']), documentation_completeness: dimension(checks, ['security-artifact']) });
    }
  },
  {
    id: 'testing',
    skill: 'test-master',
    portId: 'jeffallan-test-master',
    prompt: 'Create a focused test suite at tests/validate.test.mjs for src/validate.js. Cover valid values, invalid characters and types, minimum and maximum boundaries, and regression cases. Read only src/validate.js and README.md, run node --test tests/validate.test.mjs exactly once, then create a concise artifacts/test-plan.md with coverage and results. Do not inspect other directories, install dependencies, use the network, or create commits.',
    setup(project) {
      write(project, 'src/validate.js', `export function validateUsername(value) {\n  return typeof value === 'string' && /^[a-z0-9_]+$/i.test(value) && value.length >= 3 && value.length <= 12;\n}\n`);
      write(project, 'README.md', '# Validation fixture\nA username is 3-12 ASCII letters, numbers, or underscores. The validator must reject empty values, whitespace, punctuation, non-strings, and boundary violations.\n');
    },
    grade(project) {
      const file = path.join(project, 'tests/validate.test.mjs');
      const text = fs.existsSync(file) ? read(project, 'tests/validate.test.mjs') : '';
      const artifact = fs.existsSync(path.join(project, 'artifacts/test-plan.md')) ? read(project, 'artifacts/test-plan.md') : '';
      const tests = fs.existsSync(file) ? spawnTest(project, 'tests/validate.test.mjs') : { pass: false, notes: 'test file missing' };
      const testCount = (text.match(/\btest\s*\(/g) || []).length + (text.match(/\bit\s*\(/g) || []).length;
      const checks = [
        check('test-file', text.length > 250, 'test file exists and is substantive'),
        check('test-execution', tests.pass, tests.notes),
        check('boundary-coverage', hasAll(text, ['3', '12']) && testCount >= 6, `contains boundary cases and ${testCount} test cases`),
        check('invalid-inputs', hasAll(text, ['invalid', 'whitespace']) || (text.includes("''") && text.includes('!')), 'covers invalid input classes'),
        check('test-plan', hasAll(artifact, ['unit', 'boundary', 'result']), 'records test scope and result')
      ];
      return gradeResult(checks, { test_coverage: dimension(checks, ['boundary-coverage', 'invalid-inputs']), functional_correctness: dimension(checks, ['test-execution']), documentation_completeness: dimension(checks, ['test-file', 'test-plan']) });
    }
  }
];

export const DIVERSE_TASKS = [
  ...TASKS,
  {
    id: 'architecture-resilience',
    skill: 'architecture-designer',
    portId: 'jeffallan-architecture-designer',
    prompt: 'Analyze the webhook processing requirements and create artifacts/architecture-resilience.md. Include components, an end-to-end data flow, idempotency, retry and dead-letter behavior, observability, security, trade-offs, and one ADR. Do not modify source files, install dependencies, use the network, or create commits.',
    setup(project) {
      write(project, 'README.md', '# Webhook processing\n\nAccept signed webhooks from multiple regions, deduplicate delivery IDs, process events asynchronously, retry transient failures, preserve poison messages for inspection, and provide an operator replay path. The service must tolerate a regional queue outage without silently losing events.\n');
      write(project, 'src/current-state.md', '# Current state\nNo implementation exists. Runtime, queue, storage, and deployment topology are intentionally undecided.\n');
    },
    grade(project) {
      const text = fs.existsSync(path.join(project, 'artifacts/architecture-resilience.md')) ? read(project, 'artifacts/architecture-resilience.md') : '';
      const checks = [
        check('artifact', text.length > 300, 'resilience architecture artifact exists'),
        check('flow', hasAll(text, ['component', 'flow', 'webhook']), 'describes webhook components and flow'),
        check('reliability', hasAll(text, ['idempot', 'retry', 'dead']), 'covers deduplication, retries, and poison messages'),
        check('operations', hasAll(text, ['observ', 'replay']), 'covers operations and replay'),
        check('tradeoffs-adr', hasAny(text, ['trade-off', 'tradeoff']) && hasAll(text, ['adr', 'decision']), 'documents a trade-off and ADR')
      ];
      return gradeResult(checks, { documentation_completeness: dimension(checks, ['artifact', 'flow', 'tradeoffs-adr']), reliability_design: dimension(checks, ['reliability', 'operations']) });
    }
  },
  {
    id: 'code-review-auth',
    skill: 'code-reviewer',
    portId: 'jeffallan-code-reviewer',
    prompt: 'Review src/auth.js and create artifacts/auth-review.md. Report concrete findings with exact locations, severity, impact, remediation, and an explicit safe-code assessment. Do not modify source files, install dependencies, use the network, or create commits.',
    setup(project) {
      write(project, 'src/auth.js', `export function authorize(user, resource) {\n  if (user.id === resource.ownerId) return true;\n  return user.role === 'admin';\n}\n\nexport function isSafeRedirect(next) {\n  return typeof next === 'string' && next.startsWith('/');\n}\n\nexport function isSafePath(next) {\n  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//');\n}\n`);
      write(project, 'README.md', '# Auth review fixture\nExternal redirect targets must be same-origin paths. `isSafePath` already rejects protocol-relative paths; `isSafeRedirect` is the function under review.\n');
    },
    grade(project) {
      const text = fs.existsSync(path.join(project, 'artifacts/auth-review.md')) ? read(project, 'artifacts/auth-review.md') : '';
      const lower = text.toLowerCase();
      const safe = lower.includes('issafepath') && (lower.includes('safe') || lower.includes('no issue') || lower.includes('not a defect'));
      const checks = [
        check('artifact', text.length > 250, 'auth review artifact exists'),
        check('open-redirect', hasAll(text, ['isSafeRedirect', 'protocol']) || hasAll(text, ['redirect', '//']), 'identifies the protocol-relative redirect defect'),
        check('location-severity', hasAll(text, ['src/auth.js', 'severity', 'impact']), 'provides location, severity, and impact'),
        check('remediation', hasAll(text, ['remediat', 'isSafePath']), 'provides actionable remediation'),
        check('false-positive-control', safe, 'does not report isSafePath as a defect')
      ];
      return gradeResult(checks, { bug_detection: dimension(checks, ['open-redirect']), false_positives: dimension(checks, ['false-positive-control']), documentation_completeness: dimension(checks, ['artifact', 'location-severity', 'remediation']) });
    }
  },
  {
    id: 'debugging-cache',
    skill: 'debugging-wizard',
    portId: 'jeffallan-debugging-wizard',
    prompt: 'Investigate tests/cache.test.mjs, fix the production bug in src/cache.js, and create artifacts/cache-debugging.md with the failure, root cause, fix, and verification. Run the tests. Do not install dependencies, use the network, or create commits.',
    setup(project) {
      write(project, 'src/cache.js', `export function getCached(cache, key, compute) {\n  if (cache[key]) return cache[key];\n  const value = compute();\n  cache[key] = value;\n  return value;\n}\n`);
      write(project, 'tests/cache.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { getCached } from '../src/cache.js';\n\n test('reuses a cached false value', () => {\n  let calls = 0;\n  const cache = { feature: false };\n  assert.equal(getCached(cache, 'feature', () => { calls += 1; return true; }), false);\n  assert.equal(calls, 0);\n });\n test('computes and then reuses a missing value', () => {\n  let calls = 0;\n  const cache = {};\n  assert.equal(getCached(cache, 'answer', () => { calls += 1; return 42; }), 42);\n  assert.equal(getCached(cache, 'answer', () => { calls += 1; return 7; }), 42);\n  assert.equal(calls, 1);\n });\n`);
    },
    grade(project) {
      const source = fs.existsSync(path.join(project, 'src/cache.js')) ? read(project, 'src/cache.js') : '';
      const artifact = fs.existsSync(path.join(project, 'artifacts/cache-debugging.md')) ? read(project, 'artifacts/cache-debugging.md') : '';
      const tests = fs.existsSync(path.join(project, 'tests/cache.test.mjs')) ? spawnTest(project, 'tests/cache.test.mjs') : { pass: false, notes: 'test file missing' };
      const checks = [
        check('bug-fixed', !source.includes('if (cache[key])') && (source.includes('hasOwn') || source.includes('in cache') || source.includes('!== undefined')), 'distinguishes cached falsey values from misses'),
        check('regression-tests', tests.pass, tests.notes),
        check('debug-artifact', hasAll(artifact, ['root cause', 'false', 'verification']), 'documents the falsey-cache diagnosis and verification')
      ];
      return gradeResult(checks, { functional_correctness: dimension(checks, ['bug-fixed', 'regression-tests']), documentation_completeness: dimension(checks, ['debug-artifact']) });
    }
  },
  {
    id: 'security-redirect',
    skill: 'secure-code-guardian',
    portId: 'jeffallan-secure-code-guardian',
    prompt: 'Audit and remediate the redirect validation defect in src/redirect.js. Run the existing tests and create artifacts/redirect-security.md with vulnerability, impact, mitigation, and verification. Do not install dependencies, use the network, or create commits.',
    setup(project) {
      write(project, 'src/redirect.js', `export function isSafeRedirect(value) {\n  return typeof value === 'string' && value.startsWith('/');\n}\n`);
      write(project, 'tests/redirect.test.mjs', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { isSafeRedirect } from '../src/redirect.js';\n\n test('accepts a same-origin path', () => assert.equal(isSafeRedirect('/settings'), true));\n test('rejects protocol-relative redirects', () => assert.equal(isSafeRedirect('//evil.example'), false));\n test('rejects absolute URLs', () => assert.equal(isSafeRedirect('https://evil.example'), false));\n`);
    },
    grade(project) {
      const source = fs.existsSync(path.join(project, 'src/redirect.js')) ? read(project, 'src/redirect.js') : '';
      const artifact = fs.existsSync(path.join(project, 'artifacts/redirect-security.md')) ? read(project, 'artifacts/redirect-security.md') : '';
      const tests = fs.existsSync(path.join(project, 'tests/redirect.test.mjs')) ? spawnTest(project, 'tests/redirect.test.mjs') : { pass: false, notes: 'test file missing' };
      const checks = [
        check('security-tests', tests.pass, tests.notes),
        check('protocol-relative-block', !source.includes("value.startsWith('/')") || source.includes("!value.startsWith('//')") || source.includes('URL'), 'blocks protocol-relative redirects'),
        check('security-artifact', hasAll(artifact, ['open redirect', 'impact', 'mitigat', 'verification']), 'documents vulnerability, impact, mitigation, and verification')
      ];
      return gradeResult(checks, { security_correctness: dimension(checks, ['security-tests', 'protocol-relative-block']), documentation_completeness: dimension(checks, ['security-artifact']) });
    }
  },
  {
    id: 'testing-date',
    skill: 'test-master',
    portId: 'jeffallan-test-master',
    prompt: 'Create tests/date.test.mjs for src/date.js. Cover valid dates, invalid dates, leap-day boundaries, and non-string inputs. Run node --test tests/date.test.mjs exactly once and create a concise artifacts/date-test-plan.md with coverage and results. Do not inspect other directories, install dependencies, use the network, or create commits.',
    setup(project) {
      write(project, 'src/date.js', `export function isIsoDate(value) {\n  return typeof value === 'string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));\n}\n`);
      write(project, 'README.md', '# Date validation fixture\nDates must use YYYY-MM-DD, reject impossible calendar dates, accept 2024-02-29, and reject non-strings.\n');
    },
    grade(project) {
      const file = path.join(project, 'tests/date.test.mjs');
      const text = fs.existsSync(file) ? read(project, 'tests/date.test.mjs') : '';
      const artifact = fs.existsSync(path.join(project, 'artifacts/date-test-plan.md')) ? read(project, 'artifacts/date-test-plan.md') : '';
      const tests = fs.existsSync(file) ? spawnTest(project, 'tests/date.test.mjs') : { pass: false, notes: 'test file missing' };
      const testCount = (text.match(/\btest\s*\(/g) || []).length + (text.match(/\bit\s*\(/g) || []).length;
      const checks = [
        check('test-file', text.length > 220, 'date test file exists'),
        check('test-execution', tests.pass, tests.notes),
        check('date-boundaries', hasAll(text, ['2024-02-29']) && testCount >= 5, `contains leap-day coverage and ${testCount} tests`),
        check('invalid-inputs', hasAll(text, ['invalid', 'null']) || hasAll(text, ['2024-02-30', '123']), 'covers invalid dates and non-strings'),
        check('test-plan', hasAll(artifact, ['boundary', 'result']), 'records test scope and result')
      ];
      return gradeResult(checks, { test_coverage: dimension(checks, ['date-boundaries', 'invalid-inputs']), functional_correctness: dimension(checks, ['test-execution']), documentation_completeness: dimension(checks, ['test-file', 'test-plan']) });
    }
  }
];

function spawnTest(project, relative) {
  const result = spawnSync(process.execPath, ['--test', relative], { cwd: project, encoding: 'utf8', windowsHide: true });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim().replace(/\s+/g, ' ');
  return { pass: result.status === 0, notes: output.slice(-240) || `exit ${result.status ?? 'unknown'}` };
}

export function createFixture(task, project) {
  fs.mkdirSync(project, { recursive: true });
  task.setup(project);
}

export function gradeTask(task, project) {
  return task.grade(project);
}
