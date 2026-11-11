import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.copyFileSync(path.join(root, 'catalog', 'projects.json'), path.join(root, 'apps', 'web', 'catalog.json'));
fs.copyFileSync(path.join(root, 'ports', 'index.json'), path.join(root, 'apps', 'web', 'ports.json'));
console.log('website build: catalog.json and ports.json synchronized');
