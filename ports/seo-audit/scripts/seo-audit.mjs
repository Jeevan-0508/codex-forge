import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error('Usage: seo-audit.mjs audit <html-file> [--out <json>] [--markdown <md>]');
  process.exit(2);
}
function attr(html, tag, name) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*\\b${name}=["']([^"']*)["']`, 'i'));
  return match?.[1]?.trim() || '';
}
function count(html, tag) { return [...html.matchAll(new RegExp(`<${tag}\\b`, 'gi'))].length; }
function check(id, pass, severity, message, recommendation = '') { return { id, pass, severity, message, recommendation }; }
function markdown(report) {
  const lines = [`# SEO audit`, ``, `Input: \`${report.input}\``, ``, `Score: **${report.score}%**`, ``];
  for (const item of report.checks) lines.push(`- ${item.pass ? 'PASS' : item.severity.toUpperCase()}: ${item.message}${item.recommendation ? ` — ${item.recommendation}` : ''}`);
  return `${lines.join('\n')}\n`;
}
function audit(file) {
  const html = fs.readFileSync(file, 'utf8');
  const title = (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const description = attr(html, 'meta', 'content');
  const hasDescription = /<meta\b[^>]*name=["']description["']/i.test(html) && Boolean(description);
  const lang = attr(html, 'html', 'lang');
  const headings = count(html, 'h1');
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const missingAlt = images.filter((image) => !/\balt=["'][^"']*["']/i.test(image));
  const links = count(html, 'a');
  const checks = [
    check('doctype', /^\s*<!doctype html>/i.test(html), 'warning', /^\s*<!doctype html>/i.test(html) ? 'HTML5 doctype is present' : 'HTML5 doctype is missing', 'Add <!doctype html>.'),
    check('language', Boolean(lang), 'warning', lang ? `Document language is ${lang}` : 'Document language is missing', 'Set html lang to the primary language.'),
    check('title', title.length > 0 && title.length <= 60, 'error', title ? `Title length is ${title.length}` : 'Title is missing', 'Add a concise title up to 60 characters.'),
    check('meta-description', hasDescription && description.length <= 160, 'error', hasDescription ? `Description length is ${description.length}` : 'Meta description is missing', 'Add a useful description up to 160 characters.'),
    check('canonical', /<link\b[^>]*rel=["']canonical["']/i.test(html), 'warning', /<link\b[^>]*rel=["']canonical["']/i.test(html) ? 'Canonical link is present' : 'Canonical link is missing', 'Declare the preferred URL when duplicate URLs are possible.'),
    check('viewport', /<meta\b[^>]*name=["']viewport["']/i.test(html), 'warning', /<meta\b[^>]*name=["']viewport["']/i.test(html) ? 'Viewport metadata is present' : 'Viewport metadata is missing', 'Add responsive viewport metadata.'),
    check('h1', headings === 1, 'warning', `${headings} h1 element(s) found`, 'Use exactly one primary h1.'),
    check('image-alt', missingAlt.length === 0, 'warning', `${missingAlt.length} image(s) lack alt text`, 'Add meaningful alt text or alt="" for decorative images.'),
    check('links', links > 0, 'info', `${links} link(s) found`, 'Add useful internal navigation where appropriate.'),
    check('json-ld', /<script\b[^>]*type=["']application\/ld\+json["']/i.test(html), 'info', /<script\b[^>]*type=["']application\/ld\+json["']/i.test(html) ? 'JSON-LD is present' : 'JSON-LD is not present', 'Add valid structured data only when it describes visible content.')
  ];
  const weighted = checks.reduce((sum, item) => sum + (item.pass ? 1 : 0), 0);
  return { tool: 'codex-forge/seo-audit', input: path.basename(file), score: Math.round((weighted / checks.length) * 100), checks, recommendations: checks.filter((item) => !item.pass).map((item) => item.recommendation).filter(Boolean) };
}
const [, , command, input, ...options] = process.argv;
if (command !== 'audit' || !input) usage();
const file = path.resolve(input);
if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { console.error(`Input HTML file not found: ${input}`); process.exit(1); }
const report = audit(file);
const get = (name) => { const index = options.indexOf(name); return index >= 0 ? options[index + 1] : ''; };
const out = get('--out');
const md = get('--markdown');
if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(path.resolve(out), `${JSON.stringify(report, null, 2)}\n`); }
if (md) { fs.mkdirSync(path.dirname(path.resolve(md)), { recursive: true }); fs.writeFileSync(path.resolve(md), markdown(report)); }
console.log(JSON.stringify(report, null, 2));
