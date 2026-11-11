import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
export const DEFAULT_CATALOG = path.join(ROOT, 'catalog', 'projects.json');

export function loadCatalog(file = DEFAULT_CATALOG) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(entries)) throw new Error('Catalog must be a JSON array');
  return entries;
}

export function searchCatalog(entries, query) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) => JSON.stringify(entry).toLowerCase().includes(needle));
}

export function findProject(entries, idOrRepo) {
  return entries.find((entry) => entry.id === idOrRepo || entry.repository === idOrRepo);
}
