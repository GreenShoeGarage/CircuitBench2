# Release validation and acceptance

**Stable release: 2.0.0 · Runtime build: `6cf7ae00d61a0f43` · October 25, 2026**

CircuitBench 2.0 is accepted for stable release. On October 25, 2026, the user
confirmed: **“hosting and browser acceptance checks passed.”** This closes the
outstanding hosting and browser acceptance discussed at the rc.3 handoff.

The confirmation is recorded in
[v200-owner-acceptance.json](../evidence/v200-owner-acceptance.json), together
with the accepted candidate identity, **2.0.0-rc.3 / `8a99d6d843d32aa6`**.
It is owner-confirmed acceptance. It is not presented as a new agent-observed
browser run, host inspection or set of device-specific test logs.

## Stable promotion scope

This promotion changes the release version, release documentation, evidence
and the packager’s selection of checksum entries.
The application remains the accepted rc.3 implementation. The source version
constant and visible shell label now read **2.0.0**; the builder produces matching
versioned asset paths, service workers, recovery pages and manifests. Project
schema, saved-result behavior, numerical methods, component models, worker
implementation, controls and visual styling are unchanged.

The maintained catalog contains **43 parts, 37 model definitions and 41
examples**: 16 analog, 16 digital and 9 mixed. It includes the working
seven-segment display, digital voltage source, red-HIGH logic indicators,
coordinated analog/digital feedback, closed-loop execution, multibit converters,
analog parameter studies and stateful continuous batches. Installation checks
and the operation/display-time strip remain part of the stable workbench.

The complete deploy and source archives are provided as
`CircuitBench-2.0.0-deploy.zip` and `CircuitBench-2.0.0-source.zip`. The release
receipt is `CircuitBench-2.0.0-release-integrity.json`; archive checksums are in
`CircuitBench-2.0.0-SHA256SUMS.txt`. Preparing these stable-version packages does
not claim that an external upload was performed by the assistant.

## Acceptance provenance

| Evidence category | Release treatment |
|---|---|
| Hosting and browser acceptance | Passed, confirmed by the user on October 25, 2026, closing the acceptance requested after the rc.3 handoff. |
| Earlier managed-preview observations | Preserved under rc.3, including its HTTP-preview icon injection, unavailable secure APIs and output-download limitations. Those historical observations are not current release blockers following the owner's acceptance. |
| Stable promotion checks | Fresh version-sensitive tests, package integrity checks and an isolated rebuild of the stable source archive. |
| Application and numerical baseline | Retained with its original rc.3 version/build and hashes; functional equivalence is established by the promotion audit. |

The user's confirmation covers the outstanding hosting/browser acceptance as a
whole. No new individual browser versions, device list, per-case logs or output
files were supplied with that confirmation. The acceptance record preserves
that distinction without inventing additional observations.

## Fresh promotion verification

**40 existing version-sensitive test cases pass**:

- Nine release-document rendering and version-reference cases.
- Twenty installation-check cases, including bounded asset checks and worker
  computations.
- Eleven installation-dialog lifecycle cases.

The complete record and per-file transcripts are included in
[v200-promotion-tests.json](../evidence/v200-promotion-tests.json) and
`evidence/v200-promotion-tests/`. These checks were run for stable version 2.0.0
and runtime `6cf7ae00d61a0f43`.

**Eleven final built-package cases also pass, for 51 fresh promotion cases in
all.** Their exact transcript and source/manifest identities are in the external
release-integrity receipt, together with the independent archive audit. The
package gate verifies version agreement, all declared file hashes, versioned
module paths, complete worker/WASM assets, generated documentation and recovery
manifests.

The independent promotion audit compares the stable source against the accepted
rc.3 source archive. Runtime and engine bytes must match after normalizing only
the source version constant and visible shell version label. It also verifies
that the prior evidence was preserved, extracts the stable source ZIP into a
private directory, rebuilds it, and compares every resulting deploy file with
the stable deploy ZIP. Exact counts, hashes and results are retained in the
release receipt.

The first independent stable-package audit found that a filename-prefix glob
also selected older `2.0.0-rc.*` ZIPs for the checksum list and receipt. The
packager now selects the two exact current archive paths. One new black-box
regression exercises the actual packager with prerelease and unrelated ZIPs
next to its outputs, checks exact archive membership and hashes, and verifies
that those neighboring files remain intact. The initial failed audit is kept in
[v200-promotion-audit-initial.json](../evidence/v200-promotion-audit-initial.json).

This packaging correction does not change the application runtime. The full
application suite and numerical study were not rerun under a new label; the
accepted baseline remains explicitly identified below.

## Accepted implementation baseline

The rc.3 baseline records:

| Verification | Accepted result |
|---|---:|
| Application cases | 676 passed across 46 files |
| Built-package cases | 10 passed |
| Native/WASM numerical comparisons | 24 passed |
| Checks of actual diagnostic/project/CSV downloads | 80 passed |
| Independent rc.3 archive audit | 57 passed |
| Isolated rc.3 source rebuild | 437 deploy files matched byte-for-byte |

These are prior rc.3 results, not additional fresh stable test executions. Their
records retain their original source hashes, including the rc.3 version constant
in `src/model.js`. The stable audit explains that one metadata change instead
of rewriting historical evidence.

The original reports remain available:
[application tests](../evidence/rc203-test-summary.json),
[numerical comparisons](../evidence/rc203-coordinated-validation.json),
[native reference environment](../evidence/rc203-native-reference-environment.json),
[browser observations](../evidence/rc203-browser-validation.json),
[download validation](../evidence/rc203-download-validation.json), and
[complete rc.3 integrity receipt](../evidence/rc203-release-integrity.json).
The full preceding narrative is preserved in
[rc.3 validation](history/VALIDATION-2.0.0-rc.3.md).

## Model and reproducibility boundaries

Stable status does not expand the documented models. Coordinated analog support
remains R/C/L and independent voltage/current sources, coupled with digital logic
and explicit converters. Backward Euler has step-dependent error and damping;
the 1 ps event grid describes scheduling resolution. The existing nonlinear
analog library remains available through ngspice's supported analyses and
feed-forward mixed mode. A saved continuous window preserves evidence and does
not resume a stopped private solver.

The deployed engine remains ngspice45.2 WASM. The pinned native ngspice42 recipe
provides an auditable distribution-binary reference environment with recorded
runtime dependencies; it does not claim a hermetic toolchain or a fresh native
C/C++ source rebuild. See [the engine contract](closed-loop-engine.md),
[continuous simulation](continuous-simulation.md), and
[the reference environment](reference-environment.md).

The next development milestone is **2.1 — Everyday workbench**. Stable 2.0 is
complete; the later instrument and nonlinear-engine work remains sequenced in
[ROADMAP.md](../ROADMAP.md).
