# Execution architecture and reuse decision

## Selected production path

CircuitBench runs **ngspice 45.2 WebAssembly**, distributed in **EEcircuit-engine
1.8.0**, inside a fresh dedicated module Web Worker for every simulation. The
main thread retains the project, editor and plots. Every terminal outcome,
including success, terminates the worker. Stop and the watchdog terminate the
underlying worker, not merely an interface timer. No compute service, account,
telemetry, CDN or external model fetch is required.

This is bounded, fresh simulation. Changing a parameter starts a new run; no
continuous solver state is claimed. The engine facade (`src/engine.js`) can be
replaced later without changing the authoritative electrical project model.

The tested runtime WASM is 6,133,055 bytes, SHA-256
`ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4`.
Its startup banner identifies ngspice-45.2, built September 5, 2026. Package
source gitHead is `f4dab6458d3865a1db9766008480690d23410c3a`.

## Reuse evaluation

| Candidate | Verified evidence | Decision |
|---|---|---|
| TINACloud | Official reference advertises schematic entry, simulation and instruments. It is used as a functional reference. | Independent UI, symbols and project model; no TINA source/assets copied. |
| ngspice | Official shared-library interface separates a controlling application from numerical simulation and returns simulation vectors. | Reuse numerical implementation; no new circuit solver. |
| EEcircuit-engine 1.8.0 | Published npm package exists with MIT license and no npm runtime dependencies. Actual DC, AC, transient and nonlinear computations pass tests. | Reuse adapter and compiled WASM, with documented packaging/error patches. |
| EEcircuit editor/application | Examined `gen2-next` revision `0db7d45870bfe5b9a2103fff149318cd9904228c`. Its package.json references `eecircuit-schematic` via `file:../EEcircuit-schematic`; npm metadata and expected public GitHub repository return 404. | Full standalone frontend cannot currently be reproduced from the public checkout alone. Build the required small SVG editor against CircuitBench's authoritative schema. |
| EEcircuit plotting stack | Frontend references webgl-plot plus Svelte/Monaco and UI packages. | For bounded analog traces, CircuitBench's SVG plotting avoids that UI/dependency stack while preserving unmodified raw numerical arrays. |
| Native ngspice | Installed and pinned Ubuntu `42+ds-3build1`; executable SHA-256 `820658317b0b54035208da41936fd6871ce924036e5ea4113a4168b821b7fc45`. | Development reference only; not needed on a user's machine or server. Versions differ deliberately and are recorded in evidence. |

## Packaging and reproducibility

The upstream 20 MB ESM bundle contains two identical base64 copies of the WASM
and preloads numerous process-design kits. `scripts/vendor-engine.py` checks the
published package's SHA-512 integrity, extracts one unchanged WASM, rewrites its
local asset URL, removes every implicit PDK preload, and emits small adapter JS.
Only explicitly declared CircuitBench models are available in simulation.
It also propagates raw-output parse errors and bounds accumulated diagnostics.
Adapter version 2 finds the raw binary header in bytes, decodes only the text
header and checks the declared payload length. This fixes an upstream
character-index/byte-offset error exposed by a Unicode project title; the WASM
is unchanged. The readable patch is `scripts/vendor-raw-parser.js`.

These transformations are deterministic. The exact artifact hashes are in
`engine/manifest.json`. The prebuilt distribution has no dependency installer or
compile requirement. It contains all executable runtime files. The source
package also includes the extraction script; pass the pinned npm tarball to it
to reproduce those runtime files.

The upstream source-to-WASM Docker recipe uses a moving Emscripten `latest` and
selects the newest ngspice tag. A byte-identical compiler rebuild is therefore
**not claimed**. The release pins and verifies the published binary rather than
running that moving build. Upstream ngspice 45.2 source, integration patches and
license notices are included to support review, modification and rebuilding.
Maintain a newly compiled runtime as a separate, newly validated engine build.

## Numerical acceptance criteria, defined before test evaluation

- Equal 10 kΩ divider driven by 10 V: midpoint 5 V ± 1 nV.
- RC with 10 kΩ and 100 nF: analytic time constant 1 ms; cutoff
  159.15494309189532 Hz. Frequency probe tolerance 1 nHz for this direct fixture.
- At the exact cutoff: −3.010299956639812 dB ± 1e−8 dB and −45° ± 1e−8°.
- One-volt step, capacitor initially zero, 1 ns rise, 1 µs maximum step,
  `reltol=1e−6`: linearly interpolated voltage at 1 ms within 20 µV of
  `1 − exp(−1)`.
- Native comparison for DC/AC/nonlinear fixtures: maximum difference no greater
  than max(10 nV/A, 1e−5 times the largest reference value). Transient comparisons
  interpolate native adaptive time samples and allow 20 µV/A absolute.
- Repeated-run worker leak: every created worker terminated, none remaining;
  mean process RSS growth below 64 MiB over the defined 40-run sequence.

## Completed foundation verification

`node --expose-gc scripts/prove-engine.mjs` exercises the production adapter
through a test-only Node `worker_threads` implementation of the browser Worker
API. It executes the actual WASM and cross-checks the native reference. It does
not substitute analytic waveforms for the solver and is not a browser test.

The machine-readable record is `evidence/engine-validation.json`. In the recorded
run, 62 checks passed: operating point, Unicode-title independent dividers,
sweep, RC cutoff magnitude/phase, step
response, diode/BJT/MOS/switch and bounded behavioral opamp checks, native
comparisons, failure recovery, cancellation, timeout and subsequent recovery.
The divider returned exactly 5 V; RC cutoff returned −3.0102999566398116 dB and
−44.99999999999999°; the step at 1 ms returned 0.63212040006794 V.

56 workers were created and terminated, zero remained. Main-thread heartbeat
continued during an intentionally long simulation. Cancellation was
acknowledged in less than 1 ms; underlying worker exit was separately observed.
Forty repeated runs passed the defined process memory criterion; mean RSS
change was approximately +0.73 MiB, below the 64 MiB allowance. Timing and
memory are environment-specific, not guarantees for every device.

Six focused raw-parser regression tests additionally cover Unicode real and
complex headers, CRLF, marker text inside a title, nonzero typed-array offsets
and malformed/truncated payloads. These tests supplement the actual Unicode
divider fixture that returned 5 V and 2 V in both WASM and native ngspice.

Browser worker loading, Stop/recovery, constrained phone/tablet viewports and
subdirectory paths have separate observed checks in
[release validation](VALIDATION.md). Real secure-context browser offline reload
remains unverified. These observations are not inferred from the Node suite.

## Complete project example verification

The separate `scripts/prove-examples.mjs` suite uses the real schema objects and
generated decks from every authored example, plus independent-current-source
and piecewise-linear-source fixtures. Its evidence is in
`evidence/example-validation.json`: 15 fixtures, 70 native vector comparisons,
and 16 analytic/behavior checks passed. This covers the curated PNP, PMOS, LED
and inductor paths as well as the initial engine fixtures.

In a single-node current-source operating-point circuit, interactive ngspice
`write out.raw` can include a redundant `v(all)` expression vector in its raw
header in addition to the actual circuit voltage. CircuitBench retains it as
raw engine data and uses authoritative circuit measurement definitions to
select actual signals. Native comparisons check each canonical circuit vector
and record additional vectors separately. No vector is silently deleted based
on the name `all`, which is also a possible genuine user net name.

## Bounds and limitations

A normal run has a 15 s watchdog (configurable per application call within
100 ms–60 s). Returned data is rejected above 250,000 points, 256 vectors or two
million scalar samples, or if values are non-finite. Input validation must also
bound the requested analysis before computation. The application uses stricter
analysis limits for ordinary projects.

An ngspice error or aborted analysis rejects the run. Warnings and convergence
assistance such as gmin stepping are preserved, allowing the UI to distinguish
completed-with-warnings. A worker crash cannot modify the current project.
Single-run disposal costs startup time but removes cross-run solver residue and
makes cancellation reliable. No thread-sharing or cross-origin-isolation
headers are needed. HTTPS or localhost is required for service-worker offline
installation; ordinary HTTP still supports connected operation.

## Primary sources and checked artifacts

- [TINACloud](https://www.tina.com/tinacloud/)
- [ngspice official site](https://ngspice.sourceforge.io/)
- [ngspice shared-library interface](https://ngspice.sourceforge.io/shared.html)
- [ngspice official downloads and source information](https://ngspice.sourceforge.io/download.html)
- [EEcircuit](https://github.com/eelab-dev/EEcircuit)
- [EEcircuit-engine](https://github.com/eelab-dev/EEcircuit-engine)
- [Pinned engine source](https://github.com/eelab-dev/EEcircuit-engine/tree/f4dab6458d3865a1db9766008480690d23410c3a)
- [Published 1.8.0 tarball](https://registry.npmjs.org/eecircuit-engine/-/eecircuit-engine-1.8.0.tgz)
- [ngspice 45.2 source mirror tag](https://github.com/danchitnis/ngspice-sf-mirror/tree/ngspice-45.2)

Checked for this release on October 24, 2026. No assertion is made that a
nonselected upstream dependency will stay unavailable in later releases.
