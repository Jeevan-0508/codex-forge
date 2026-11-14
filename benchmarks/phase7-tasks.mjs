import fs from 'node:fs';
import path from 'node:path';

export const PHASE7_TASKS = [
  {
    id: 'seo-local-audit',
    skill: 'seo-audit',
    portId: 'seo-audit',
    prompt: 'Audit the intentionally incomplete fixture site/index.html. Produce artifacts/seo-report.json and artifacts/seo-report.md with a deterministic report. Do not fetch the network or change the fixture.',
    create(project) {
      fs.mkdirSync(path.join(project, 'site'), { recursive: true });
      fs.writeFileSync(path.join(project, 'site', 'index.html'), '<html><head><title>Example documentation</title></head><body><h1>Docs</h1><img src="logo.png"><p>Local fixture.</p></body></html>\n');
    },
    grade(project) {
      const reportPath = path.join(project, 'artifacts', 'seo-report.json');
      if (!fs.existsSync(reportPath)) return { score: 0, max: 3, criteria: ['report-json', 'expected-findings', 'markdown-report'] };
      try {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        const ids = new Map((report.checks || []).map((item) => [item.id, item]));
        const score = [fs.existsSync(path.join(project, 'artifacts', 'seo-report.md')), ids.get('meta-description')?.pass === false, ids.get('image-alt')?.pass === false].filter(Boolean).length;
        return { score, max: 3, criteria: ['report-json', 'expected-findings', 'markdown-report'] };
      } catch { return { score: 0, max: 3, criteria: ['report-json', 'expected-findings', 'markdown-report'] }; }
    }
  },
  {
    id: 'browser-game-slice',
    skill: 'game-prototype',
    portId: 'game-prototype',
    prompt: 'Create a small browser game slice under artifacts/game with title "Signal Runner" and genre "arcade". Then produce artifacts/game-check.json and ensure the checker passes. Do not install dependencies.',
    create(project) { fs.mkdirSync(project, { recursive: true }); },
    grade(project) {
      const dir = path.join(project, 'artifacts', 'game');
      const reportPath = path.join(project, 'artifacts', 'game-check.json');
      let report = null;
      try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch { /* missing artifact */ }
      const score = [fs.existsSync(path.join(dir, 'game.json')), fs.existsSync(path.join(dir, 'index.html')), report?.passed === true].filter(Boolean).length;
      return { score, max: 3, criteria: ['manifest', 'browser-entrypoint', 'passing-check'] };
    }
  }
];
