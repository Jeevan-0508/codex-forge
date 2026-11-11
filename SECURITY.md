# Security policy

Third-party repositories are untrusted input. CODEX//FORGE does not clone, install, or execute upstream code during discovery.

Report security issues privately through the repository's GitHub security contact. Do not include credentials or personal data in issues.

The converter only reads Markdown and writes to an explicitly requested destination. It refuses output paths inside the source and flags common credentials and piped remote installers.
