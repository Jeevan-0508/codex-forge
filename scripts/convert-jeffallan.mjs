import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertBatch } from '../packages/converter/batch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const source = args[args.indexOf('--source') + 1];
const revision = args[args.indexOf('--revision') + 1];
if (!source || !revision) throw new Error('usage: node scripts/convert-jeffallan.mjs --source <clone> --revision <sha>');
const output = path.join(root, 'ports', 'jeffallan');
const result = convertBatch(source, output, {
  sourceRepository: 'JeffAllan/claude-skills',
  sourceRevision: revision,
  sourceLicense: 'MIT',
  sourceLicenseText: fs.readFileSync(path.join(source, 'LICENSE'), 'utf8'),
  skillNames: ['architecture-designer', 'code-reviewer', 'debugging-wizard', 'secure-code-guardian', 'test-master'],
  overwrite: true
});
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'batch-report.json'), `${JSON.stringify({
  source: 'JeffAllan/claude-skills',
  revision,
  license: 'MIT',
  discovered: result.discovered,
  selected: result.selected,
  converted: result.converted.map((item) => item.source_skill),
  rejected: result.rejected.map((item) => ({ skill: item.source_skill, reasons: item.rejected }))
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ discovered: result.discovered, selected: result.selected, converted: result.converted.length, rejected: result.rejected.length }, null, 2));
