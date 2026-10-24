# Execution architecture and reuse decision

## Selected production path

CircuitBench runs **ngspice 45.2 WebAssembly**, distributed in **EEcircuit-engine
1.8.0**, inside a fresh dedicated module Web Worker for each analog stage. The
main thread retains the project, editor and plots. CircuitBench **2.0.0-rc.1**
uses **analog adapter 4**; the exact runtime build is recorded in
`release-manifest.json`. Every terminal outcome,
including success, terminates the worker. Stop and the watchdog terminate the
underlying worker, not merely an interface timer. No compute service, account,
telemetry, CDN or external model fetch is required.

This ngspice route remains bounded, fresh simulation. The full analog model
library is preserved. Version 2.0 also adds an original, separately identified
coordinated transient solver for R/C/L and independent sources, together with
incremental logic and converters. Continuous operation retains that solver's
state across screen updates and pauses. Both routes compile from the same
authoritative electrical project model; their model scopes and numerical
methods remain explicit.

The tested runtime WASM is 6,133,055 bytes, SHA-256
`ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4`.
Its startup banner identifies ngspice-45.2, built September 5, 2026. Package
source gitHead is `f4dab6458d3865a1db9766008480690d23410c3a`.

## Digital and mixed-signal extension

The pinned WASM was built with `--disable-xspice`. A capability probe also
confirmed that it rejects an XSPICE ADC device; see
[`digital-engine-capability.json`](../evidence/digital-engine-capability.json).
The digital extension therefore introduced an original four-state event engine in a separate
disposable worker, coordinated by `src/simulation.js`. It does not advertise
native XSPICE support in this binary.

Pure digital circuits use explicit `0/1/X/Z` values, resolved drivers, a 1 ps
time grid, transport delays and stateful rising-edge DFFs. The ngspice mixed route uses
explicit ADC/DAC bridges and bounded feed-forward replay. An ADC/DAC chain
may require an analog input pass, digital event pass and final analog output
pass. DAC-to-ADC analog influence is conservatively rejected in that replay
mode. Unknown or high-impedance scalar DAC input is an
error. The final analog pass retains its original sample values exactly;
extra combined-axis positions are labeled as interpolated.

The foundation proof in
[`digital-validation.json`](../evidence/digital-validation.json) identifies its
source hashes, fixtures, analytic DAC/RC references, ADC crossings,
deterministic replay and created/terminated workers. Later digital extensions
retain buses, atomic word state, tables and timing evidence. Precise semantics
and limits are in [Digital engine](digital-engine.md); current numerical and
browser evidence is indexed separately in [Release validation](VALIDATION.md).

## Coordinated execution added in 2.0

Closed loops and paused/live operation need time advance with retained analog
and digital state. The pinned ngspice package's existing completed-run facade
and disabled XSPICE build do not establish that interface. Rather than claim
an unverified XSPICE rebuild, CircuitBench adds a bounded original solver with
an explicit subset and identity: `cb-coordinated-1`, modified nodal analysis
with backward Euler and an incremental four-state event queue.

The analog subset is R/C/L and independent DC/SIN/PULSE/PWL V/I sources. The
coordinated path also handles the original scalar bridges and sampled 2–8-bit
ADC/DAC parts. Source breakpoints, digital events, converter samples and DAC
ramp ends create shared time boundaries. Scalar ADC thresholds use trial-step
localization. It preserves capacitor/inductor state, clock phase, digital
memory and pending conversions through advances and pauses. No result from
this solver is identified as an ngspice computation.

This narrower scope enables a reviewable causal contract. It omits nonlinear
semiconductors, the op amp, controlled switch, noise and thermal behavior;
unsupported parts fail explicitly. Backward Euler has numerical damping and
step-dependent error. The 1 ps scheduling grid is not an accuracy guarantee;
repeat with smaller maximum steps when assessing a numerical result. The full
analog library and existing feed-forward replay remain on unchanged ngspice.

Finite coordinated runs use exact adjacent chunk joining under one overall
watchdog and cumulative result budgets, then terminate the worker. Continuous
sessions retain one worker, support Pause/Resume/Step and atomic live DIN/BUSIN
or DC V/I changes, and publish a bounded absolute-time window. Stop, failure or
an edit closes the session. Saved windows retain samples, input history and
engine provenance, but no resumable execution checkpoint. See
[continuous-simulation.md](continuous-simulation.md) and
[multibit-converters.md](multibit-converters.md).

Seven-segment rendering is a passive view of simulated segment bits; the
separate HEX7 decoder lowers to existing timed logic. Advanced analog studies
run fresh independent trials with recorded deterministic parameter generation,
engine identity and metric arithmetic. Neither feature is a replacement
numerical engine. Their contracts are in [seven-segment-display.md](seven-segment-display.md)
and [analog-experiments.md](analog-experiments.md).

## Reuse evaluation

| Candidate | Verified evidence | Decision |
|---|---|---|
| TINACloud | Official reference advertises schematic entry, simulation and instruments. It is used as a functional reference. | Independent UI, symbols and project model; no TINA source/assets copied. |
| ngspice | Official shared-library interface separates a controlling application from numerical simulation and returns simulation vectors. | Retain the complete analog path and scalar feed-forward replay; add a separately identified bounded original solver for stateful feedback. |
| EEcircuit-engine 1.8.0 | Published npm package exists with MIT license and no npm runtime dependencies. Actual DC, AC, transient and nonlinear computations pass tests. | Reuse adapter and compiled WASM, with documented packaging/error patches. |
| EEcircuit editor/application | Foundation inspection of `gen2-next` revision `0db7d45870bfe5b9a2103fff149318cd9904228c` found `eecircuit-schematic` referenced through `file:../EEcircuit-schematic`; npm metadata and the expected public GitHub repository returned 404 at that inspection. | The examined checkout could not reproduce the full frontend alone. Build the required small SVG editor against CircuitBench's authoritative schema. |
| EEcircuit plotting stack | Frontend references webgl-plot plus Svelte/Monaco and UI packages. | For bounded analog traces, CircuitBench's SVG plotting avoids that UI/dependency stack while preserving unmodified raw numerical arrays. |
| Native ngspice | Installed and pinned Ubuntu `42+ds-3build1`; executable SHA-256 `820658317b0b54035208da41936fd6871ce924036e5ea4113a4168b821b7fc45`. | Development reference only; not needed on a user's machine or server. Versions differ deliberately and are recorded in evidence. |

## Packaging and reproducibility

The upstream 20 MB ESM bundle contains two identical base64 copies of the WASM
and preloads numerous process-design kits. `scripts/vendor-engine.py` checks the
published package's SHA-512 integrity, extracts one unchanged WASM, rewrites its
local asset URL, removes every implicit PDK preload, and emits small adapter JS.
Only explicitly declared CircuitBench models are available in simulation.
It also propagates raw-output parse errors and bounds accumulated diagnostics.
Adapter version 2 introduced byte-based raw-header lookup, text-header decoding
and declared-payload length checks; adapter 3 retains these changes. They fix an upstream
character-index/byte-offset error exposed by a Unicode project title; the WASM
is unchanged. The readable patch is `scripts/vendor-raw-parser.js`.

Adapter 3 emits `engine/eecircuit-engine.js` instead of the former `.mjs`
runtime filename. The dedicated worker dynamically imports that local module
inside its error handler, so an import failure can report the requested URL and
inspect the response when permitted. The worker then fetches `spice.wasm`,
checks its version-1 header and exact expected byte length, and injects those
validated bytes into `Simulation`. There is no second opaque WASM fetch.
The vendored initializer rejects startup/compile failures instead of leaving
its startup promise pending. Successful computation still uses the unchanged
6,133,055-byte ngspice binary.

The application adapter is now **4**. The worker announces the
`circuitbench-worker-protocol-4` handshake before importing the engine. An opaque
failure before that signal terminates the worker, then inspects the exact
worker response with `cache: 'reload'`, bounded time and response size. Missing
files, HTML, wrong MIME and older worker protocol markers are reported as
observed. A healthy response leaves the original browser failure unexplained.
Cancellation and the original watchdog interrupt inspection as well as
calculation. The vendored numerical/glue changes introduced by adapter 3 remain
unchanged.

The distribution relocates the executing source, worker and engine to
`assets/<VERSION>/` without rewriting their relative imports. Root service-worker
filenames also contain the release version. These URL changes isolate releases
from the seven-day browser/CDN cache observed on the user's host.

The loader distinguishes worker creation, JavaScript import, WASM download,
initialization and solver phases. It retains actual browser error text, asset
URLs and available HTTP status/MIME information. HTML route fallbacks and
truncated downloads have specific errors; a generic worker error does not
claim that WASM was the cause. A valid WASM response with generic MIME can be
buffered and compiled. Browser module imports still require JavaScript MIME.

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

## Foundation numerical acceptance criteria, defined before test evaluation

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

The historical adapter-4 foundation run recorded at
**2026-10-24T06:19:03.083Z** used the `evidence/engine-validation.json` format.
In that recorded
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
change was approximately 0.420 MiB, below the 64 MiB allowance. Timing and
memory are environment-specific, not guarantees for every device.

Six focused raw-parser regression tests additionally cover Unicode real and
complex headers, CRLF, marker text inside a title, nonzero typed-array offsets
and malformed/truncated payloads. These tests supplement the actual Unicode
divider fixture that returned 5 V and 2 V in both WASM and native ngspice.

Twenty-four focused loader tests additionally cover HTTP failures, wrong JavaScript
MIME, HTML fallbacks, truncated/non-WASM responses, blocked diagnostic fetches,
actual initializer rejection, timeouts, retained error details, the ready protocol,
response inspection and Stop/watchdog races during inspection. An actual
disposable worker computes a 5 V divider from one validated WASM fetch served
with generic binary MIME. These are targeted Node/worker checks, separate from
the 62 foundation checks and the six parser regressions.

Browser worker loading, Stop/recovery, constrained phone/tablet viewports and
subdirectory paths have a dated **rc.1** baseline in
[release validation](VALIDATION.md). Focused rc.2 browser checks separately
confirmed 501-point root/subdirectory AC runs, successful buffered loading of
the unchanged binary with generic MIME, wrong-JavaScript-MIME diagnostics, and
an HTTP-200 HTML response identified in place of WASM. The recovery page was
visually reviewed on non-secure HTTP and correctly reported unavailable cache
controls before its Return action. These observations are recorded in
[`rc2-engine-loading-browser.json`](../evidence/rc2-engine-loading-browser.json)
at **2026-10-24T05:19:08Z**. Real secure-context browser cache removal/offline
reload and native browser print/output gates were unclosed in that evidence. No browser
observation is inferred from the Node suites.

These dated foundation observations are preserved as history. The current
candidate's checks and remaining browser gates are stated in
[VALIDATION.md](VALIDATION.md), not inferred from this earlier run.

## Complete project example verification

The historical `scripts/prove-examples.mjs` foundation run used real schema
objects and generated decks from its 13 authored analog examples, plus
independent-current-source and piecewise-linear-source fixtures. Its
`evidence/example-validation.json` record was dated
**2026-10-24T06:18:46.846Z** for adapter 4: 15 fixtures, 70 native vector comparisons,
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

A direct ngspice facade call defaults to a 15 s watchdog (configurable within
100 ms–60 s); the workbench requests 30 s for **Run experiment**. Returned data is rejected above 250,000 points, 256 vectors or two
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

The coordinated analog graph is limited to 48 nodes, 80 matrix unknowns and
160 elements. Finite coordinated runs use at most 20,000 accepted steps per
command and preserve the full result within 250,000 points, 256 vectors,
250,000 sparse events and a combined two-million dense-value/event budget.
Continuous mode uses 2,000-step commands and a 15-second command watchdog,
retaining at most 30,000 points, one million values and 250,000 events on an
absolute timeline capped at 9,000 s. Window retention does not reset the live
solver or invent values in an uncomputed gap. Independent analog studies have
their own 64-trial and evidence budgets, detailed in their guide.

Offline cache installation has a separate integrity boundary. The generated
worker checks every runtime response's expected length and SHA-256, with
browser-usable JavaScript/HTML/CSS MIME types, before writing a new cache.
Readiness repeats content validation; a stale or poisoned response cannot be
accepted merely because a cache key exists. Twenty-two service-worker VM tests
cover these operations, and twelve standalone recovery tests check exact-scope
cleanup without project-storage access. These checks do not establish actual
browser offline reload or update activation.

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

The foundation artifacts and availability findings above were checked on
October 24, 2026 at the stated revisions. Current 2.0 source and release checks
are recorded separately in [VALIDATION.md](VALIDATION.md). No assertion is made that a
nonselected upstream dependency will stay unavailable in later releases.
