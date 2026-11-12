import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.copyFileSync(path.join(root, 'catalog', 'projects.json'), path.join(root, 'apps', 'web', 'catalog.json'));
fs.copyFileSync(path.join(root, 'ports', 'index.json'), path.join(root, 'apps', 'web', 'ports.json'));
const phase6Evidence = path.join(root, 'benchmarks', 'results', 'phase-6-latest.json');
const phase5Evidence = path.join(root, 'benchmarks', 'results', 'phase-5-latest.json');
const evidence = fs.existsSync(phase6Evidence) ? phase6Evidence : phase5Evidence;
if (fs.existsSync(evidence)) fs.copyFileSync(evidence, path.join(root, 'apps', 'web', 'evidence.json'));
console.log(`website build: catalog.json, ports.json${fs.existsSync(evidence) ? `, and evidence.json (${path.basename(evidence)})` : ''} synchronized`);
