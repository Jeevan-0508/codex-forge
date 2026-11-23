# Optional Headroom integration

CODEX//FORGE can run its Codex benchmark through a local Headroom proxy to measure whether repetitive tool output, logs, or JSON reduce provider-reported input tokens. The integration is opt-in and disabled by default. Skill conversion, manifests, installer behavior, and authoritative fixture evidence do not pass through Headroom.

## Architecture

```text
fresh fixture → Codex subprocess → loopback Headroom proxy → configured provider
       │                │                     │
       └── disk grader ─┴── JSONL trace ──────┴── bounded stats snapshot
```

The benchmark starts a short-lived proxy only when `CODEX_HEADROOM=1`. It routes Codex with a process-local `--config openai_base_url=...` override, uses a loopback address, enables local telemetry for the trial, disables Headroom beacon/update traffic, and terminates the proxy after the trial. An explicitly configured existing loopback proxy may be reused. No Headroom package is installed at runtime.

Authoritative evidence remains the fixture files and deterministic graders. Headroom statistics are advisory telemetry and never replace exact artifacts, signed inputs, manifests, receipts, or audit records.

## Prerequisites

Install Headroom separately in a Python 3.11–3.13 environment; the repository does not add it as an npm dependency:

```powershell
pip install "headroom-ai[proxy]==0.45.0"
```

Verify that `headroom` is on `PATH`, or set `CODEX_HEADROOM_BIN` to an executable path. Keep the proxy local and use a provider configuration already supported by your Codex installation.

## Configuration

The default is direct CODEX//FORGE behavior:

```powershell
$env:CODEX_HEADROOM='0'
```

Enable the sidecar for the existing skill benchmark or the Phase 7 benchmark:

```powershell
$env:CODEX_HEADROOM='1'
$env:CODEX_HEADROOM_MODE='cache'       # cache (default) or token
$env:CODEX_HEADROOM_BIN='headroom'     # optional absolute path
npm run benchmark:skills
```

To require an already-running loopback proxy instead of starting one:

```powershell
$env:CODEX_HEADROOM_PROXY='existing'
$env:CODEX_HEADROOM_PORT='8787'
$env:CODEX_HEADROOM_TRUST_EXISTING='1'
npm run benchmark:skills
```

`CODEX_HEADROOM_TRUST_EXISTING=1` is required when routing credentials and provider traffic through a proxy that CODEX//FORGE did not spawn; this is an explicit local trust decision. `CODEX_HEADROOM_REQUIRED=1` turns an unavailable sidecar into a hard failure. Without it, the existing direct path is used and the trial is marked `headroom.status=unavailable`; it is never counted as a valid Headroom experiment. Recursive activation, remote proxy URLs, invalid modes, mismatched ports, and malformed values fail validation before a trial starts.

## Baseline versus Headroom benchmark

Run a direct paired experiment with the same five deterministic tasks and no skill activation in either condition:

```powershell
$env:CODEX_HEADROOM='1'
$env:CODEX_HEADROOM_REQUIRED='1'
npm run benchmark:headroom
```

Only a completed run with every pair valid is written to `benchmarks/results/headroom-latest.json`; incomplete runs are retained separately as `headroom-last-incomplete.json` and cannot replace dashboard evidence. The result records provider-reported input/output usage when Codex emits it, proxy startup and steady-state latency, objective task score, timeout and exit data, and sanitized per-trial Headroom compression stats. Estimated cost is explicitly left uncomputed unless a model and pricing assumptions are supplied. Provider cost is reported as unknown, not as zero. The benchmark must not be used to claim savings from proxy estimates alone.

The default skill benchmark remains the existing Phase 6 paired quality comparison. Set `CODEX_HEADROOM=1` only when you want to measure skill behavior while both conditions use the same Headroom sidecar.

## Security and limitations

- Headroom is a local proxy that can see prompts, tool output, credentials, and provider responses. Treat it as a privileged local process.
- The sidecar is restricted to loopback HTTP, uses bounded readiness/stats responses, disables the beacon and update checks, and never receives a secret in command-line arguments.
- The spawned proxy receives a scrubbed environment by default. Set `CODEX_HEADROOM_PASSTHROUGH_SECRETS=1` only when the provider requires environment-held credentials and the local proxy is trusted.
- Headroom's CCR store may retain originals locally. Review its retention and filesystem permissions for the machine running the benchmark.
- Compression is workload-dependent. Repetitive JSON and logs are more promising than already-compact source code or short prose.
- Windows is supported by the pinned package wheel, but proxy/WebSocket behavior and resumed Codex sessions should be verified on the target machine before routine use.
- Do not compress cryptographic inputs, signed receipts, exact-match evidence, or other byte-sensitive records. CODEX//FORGE grades those from disk outside the compressed working context.

## Troubleshooting

If the benchmark reports `headroom.status=unavailable`, run `headroom --version`, check that the proxy extra is installed, and verify `CODEX_HEADROOM_BIN`. If an existing proxy is used, check `http://127.0.0.1:<port>/health` and ensure `CODEX_HEADROOM_PORT` matches the URL. A provider failure is not a compression success; inspect the trial's exit reason, timeout, stderr byte count, and `headroom` object before interpreting results.

## Windows CI verification

`.github/workflows/headroom-windows.yml` installs Python 3.12 and the pinned `headroom-ai[proxy]==0.45.0` package into the runner's temporary directory. It runs the JavaScript unit tests plus `npm run headroom:smoke`, which starts Headroom in no-optimization, no-cache, no-telemetry, stateless mode, exercises only loopback `/health` and `/stats`, and verifies process-tree cleanup. The workflow has read-only repository permissions and does not define provider credentials or run the provider benchmark.
