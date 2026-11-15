# Security policy

Third-party repositories are untrusted input. CODEX//FORGE does not clone, install, or execute upstream code during discovery.

Report security issues privately through the repository's GitHub security contact. Do not include credentials or personal data in issues.

If private GitHub security reporting is unavailable, contact the repository owner before opening a public issue. Include the affected commit, a minimal reproduction, impact, and a safe mitigation. Do not attach secrets or private project files.

The converter only reads Markdown and writes to an explicitly requested destination. It refuses output paths inside the source and flags common credentials and piped remote installers.

Installable ports are treated as untrusted artifacts: manifests, hashes, regular-file trees, license records, hooks, executable paths, and backups are validated before activation. CODEX//FORGE does not execute upstream install scripts or automatically connect external services.
