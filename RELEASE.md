# Release checklist

CODEX//FORGE follows semantic versioning. A patch fixes documentation or backwards-compatible behavior; a minor release adds compatible ports or CLI capabilities; a major release changes the installer contract or public CLI behavior.

Before a release:

1. Confirm the version in `package.json`, CLI output, and release notes agree.
2. Run `npm run verify` and `npm run onboarding:acceptance`.
3. Run the applicable functional benchmark and record its exact result.
4. Validate every installable manifest and recompute hashes.
5. Run the security scan and license audit; resolve new findings.
6. Run `npm pack --dry-run` and inspect the file list for secrets, temporary traces, and unrelated files.
7. Review third-party attribution, source revisions, and unsupported-feature notes.
8. Create a signed or reviewed Git tag and GitHub release only after CI and Pages pass.

## Package publication status

The public npm registry was checked on 2026-11-15: `codex-forge` was not available. This repository does not publish automatically and does not include credentials. A future npm release requires explicit approval, package-name ownership confirmation, provenance/signing policy, and a separate publication review.
