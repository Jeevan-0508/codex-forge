---
name: seo-audit
description: Run a deterministic, local-first SEO audit against an HTML file and produce machine-readable and Markdown evidence without network access.
metadata:
  source: AgriciDaniel/claude-seo
  source-license: MIT
  implementation: independent-codex-adapter
  verification:
    harness: pending
    real-codex-session: pending
---

# SEO Audit

Use this skill when a project needs a repeatable check of HTML metadata, headings, links, images, accessibility-adjacent SEO signals, or JSON-LD. This is an independent Codex adapter: it does not copy upstream files, install Python packages, call search engines, or send site data anywhere.

Run the bundled validator from the project root:

```text
node <installed-skill>/scripts/seo-audit.mjs audit path/to/index.html --out artifacts/seo-report.json --markdown artifacts/seo-report.md
```

The JSON report contains a score, individual pass/fail checks, severity, and actionable recommendations. Inspect the input and report before changing application files. The audit is intentionally static and local; it does not prove rankings, Core Web Vitals, crawlability of a deployed site, backlink quality, or AI-search visibility.

Do not add dependencies, credentials, MCP servers, telemetry, or network calls for this workflow. If a live crawl, Google data, rendering, or competitor research is requested, explain that it is outside this port and ask before proposing a separately approved tool.
