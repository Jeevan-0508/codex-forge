import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = JSON.parse(fs.readFileSync(path.join(root, 'catalog', 'projects.json'), 'utf8'));
const invalid = entries.filter((entry) => !entry.license || entry.license === 'NOASSERTION' || entry.license === 'UNKNOWN');
if (invalid.length) {
  console.log(`license audit: ${invalid.length} catalog entries remain restricted/unresolved; they cannot be installed or redistributed`);
  console.log(invalid.map((entry) => `${entry.id}:${entry.license}`).join(', '));
} else console.log('license audit: all catalog entries have SPDX evidence');
