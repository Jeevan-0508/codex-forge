import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.copyFileSync(path.join(root, 'catalog', 'projects.json'), path.join(root, 'apps', 'web', 'catalog.json'));
fs.copyFileSync(path.join(root, 'ports', 'index.json'), path.join(root, 'apps', 'web', 'ports.json'));
const phase6Evidence = path.join(root, 'benchmarks', 'results', 'phase-6-latest.json');
const phase7Evidence = path.join(root, 'benchmarks', 'results', 'phase-7-latest.json');
const headroomEvidence = path.join(root, 'benchmarks', 'results', 'headroom-latest.json');
const phase5Evidence = path.join(root, 'benchmarks', 'results', 'phase-5-latest.json');
function publishableHeadroom(file) {
  if (!fs.existsSync(file)) return false;
  try {
    const result = JSON.parse(fs.readFileSync(file, 'utf8'));
    return result.status === 'completed' && result.trials_completed === result.trials_requested && Array.isArray(result.pairs) && result.pairs.length > 0 && result.pairs.every((pair) => pair.comparison_status === 'valid-pair');
  } catch { return false; }
}
const evidence = publishableHeadroom(headroomEvidence) ? headroomEvidence : fs.existsSync(phase7Evidence) ? phase7Evidence : fs.existsSync(phase6Evidence) ? phase6Evidence : phase5Evidence;
if (fs.existsSync(evidence)) fs.copyFileSync(evidence, path.join(root, 'apps', 'web', 'evidence.json'));
if (fs.existsSync(phase6Evidence) && evidence !== phase6Evidence) fs.copyFileSync(phase6Evidence, path.join(root, 'apps', 'web', 'phase-6-evidence.json'));
if (fs.existsSync(phase7Evidence) && evidence !== phase7Evidence) fs.copyFileSync(phase7Evidence, path.join(root, 'apps', 'web', 'phase-7-evidence.json'));
console.log(`website build: catalog.json, ports.json${fs.existsSync(evidence) ? `, and evidence.json (${path.basename(evidence)})` : ''}${fs.existsSync(phase6Evidence) && evidence !== phase6Evidence ? ', plus preserved phase-6-evidence.json' : ''}${fs.existsSync(phase7Evidence) && evidence !== phase7Evidence ? ', plus preserved phase-7-evidence.json' : ''} synchronized`);
