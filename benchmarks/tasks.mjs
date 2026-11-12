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
      return { checks, score: checks.filter((item) => item.pass).length, max: checks.length };
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
      return { checks, score: checks.filter((item) => item.pass).length, max: checks.length };
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
      return { checks, score: checks.filter((item) => item.pass).length, max: checks.length };
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
      return { checks, score: checks.filter((item) => item.pass).length, max: checks.length };
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
      return { checks, score: checks.filter((item) => item.pass).length, max: checks.length };
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
