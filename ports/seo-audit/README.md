# SEO Audit — Codex port

This verified-port candidate turns the local, evidence-oriented portion of Claude SEO into a dependency-free Codex workflow. It audits one HTML document and emits deterministic JSON/Markdown artifacts.

```text
node scripts/seo-audit.mjs audit ./index.html --out ./artifacts/seo-report.json --markdown ./artifacts/seo-report.md
```

It checks document type, language, title, description, canonical URL, viewport, one primary heading, image alt text, links, and JSON-LD. It does not fetch URLs or claim live search performance.
