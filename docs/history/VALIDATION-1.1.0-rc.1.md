# Release validation and handoff

**Candidate: 1.1.0-rc.1 · Runtime build: `089964ae0aed2792` · October 24, 2026**

This candidate adds native four-state digital simulation and explicit feed-forward
mixed-signal bridges. It keeps the existing analog engine and its versioned
asset/recovery design. It is a release candidate: secure-context browser offline
installation/update and native browser print/output acceptance remain open.
The earlier v1.0 stable-release gates were not silently waived when digital work
was reprioritized. The supplied public deployment has not been changed.

## Delivered scope

- 28 component types: 14 existing analog, 12 native digital and 2 one-bit bridges.
- Four-state `0/1/X/Z` event logic, clocks, eight gate functions, tri-state driver
  resolution and rising-edge DFFs, with 1 ps resolution and transport delays.
- Explicit threshold/Schmitt ADC and finite-edge DAC models.
- Bounded feed-forward analog-input → digital → analog-output replay. A
  DAC-to-ADC analog dependency is rejected; coordinated feedback is not claimed.
- Logic and mixed timing views, held-state cursors, baselines, literal logic CSV,
  simulation-plan export, saved typed results and engine-aware reports.
- 20 examples: 13 unchanged analog, 4 digital and 3 mixed-signal experiments.

Timing resolution is not a physical accuracy claim. Digital devices do not model
setup/hold violations, metastability, drive strengths or supply current. ADC
crossings are reconstructed from saved analog samples; a smaller analog maximum
step may be needed. DAC input must remain known 0 or 1. Detailed semantics are in
[digital-engine.md](../digital-engine.md).

## Evidence layers

These counts describe different scopes and are intentionally kept separate.

| Layer | Result | What it establishes |
|---|---:|---|
| Core model/netlist | 25 tests | Existing topology, units, schema/import and analysis validation |
| Digital model/compiler | 23 tests | Pin domains, typed probes, clocks, bridges, dependency rejection and replay input validation |
| Digital kernel/bridges | 22 tests | Four-state truth/resolution, event timing, DFF behavior, ADC/DAC conversion and exact mixed merging |
| Simulation coordinator | 10 tests | Stage orchestration, failure propagation, actual worker cancellation/timeout/recovery |
| Existing editor | 11 tests | Connection-preserving edits, junctions, selection, transformations and SVG |
| Digital editor | 6 tests | Typed pins/wires, safe connection attempts and bridge boundaries |
| Existing result/report/import | 14 tests | Numeric/complex measurements, baselines, immutable evidence and escaped reports |
| Digital plots/reports | 10 tests | X/Z lanes, held-state cursors, all transitions, CSV provenance and engine-aware reports |
| Digital storage | 8 tests | Literal states, time order, sparse events, sample maps and exact executed decks |
| Autosave | 4 tests | Serialized writes, revision status, coalescing and recovery |
| Raw parser | 6 tests | Byte-accurate real/complex headers and malformed payload rejection |
| Analog loader | 24 tests | Response inspection, worker handshake, cancellation/watchdog races and bounded errors |
| Service worker | 22 VM tests | Integrity, canonical shell, versioned assets and installation-scope isolation |
| Standalone recovery | 12 tests | Scope-safe cache refresh and project-storage preservation |
| Package | 9 tests | Exact source/build mapping, local imports, complete versioned runtime and recovery assets |
| Actual analog WASM foundation | 62 checks | Real calculations, analytic/native comparisons, recovery and 56 terminated workers |
| Analog example proof | 15 fixtures | 13 examples plus I/PWL fixtures; 70 native vector comparisons and 16 analytic/behavior checks |
| Actual digital/mixed execution | 10 fixtures, 86 checks | All seven new examples plus focused analytic mixed fixtures; 24 terminated workers |
| Managed Chrome browser | Scoped observations below | Actual editor, workers, plots, backup round-trips, CSV and report preview |

The focused suites total **206 passed tests**. They ran directly as
`node tests/<suite>.test.mjs`; the test-file counts are not mistaken for
individual assertion/test counts. See
[focused-test-summary.json](../../evidence/history/1.1.0-rc.1/focused-test-summary.json) and its linked
per-suite transcripts. Package checks repeat after documentation/evidence freeze;
the release receipt identifies the exact final archives.

## Real computation

### Analog foundation and regression

The production analog engine remains EEcircuit-engine **1.8.0**, ngspice **45.2**,
CircuitBench adapter **4**. Its WASM is 6,133,055 bytes, SHA-256:

`ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4`

The foundation proof is dated **2026-10-24T06:19:03.083Z** and passed all 62
checks, including 48 native comparisons. All 56 workers were terminated, none
remained alive. The defined 40-run memory check averaged about 0.420 MiB RSS
growth against a 64 MiB allowance. Cancellation acknowledgment was about
0.252 ms, with worker termination separately observed. These timings and memory
figures belong to the recorded Node environment, not every browser/device.

The analog example proof is dated **2026-10-24T06:18:46.846Z**. It passed all
15 fixtures, 70 native vector comparisons and 16 analytic/behavior checks.
The native reference is ngspice **42+ds-3build1**, executable SHA-256
`820658317b0b54035208da41936fd6871ce924036e5ea4113a4168b821b7fc45`.
Differences between native and WASM versions are explicit. Agreement establishes
only the recorded fixtures within their specified tolerances.

The production Worker facade and actual WASM execute through a Node
`worker_threads` shim in these proofs. The shim provides worker messaging and
local asset loading; it does not replace the solver or create analytic traces.
See [engine-validation.json](../../evidence/history/1.1.0-rc.1/engine-validation.json),
[example-validation.json](../../evidence/history/1.1.0-rc.1/example-validation.json) and
[engine-evaluation.md](../engine-evaluation.md).

### Digital and mixed-signal proof

[digital-validation.json](../../evidence/history/1.1.0-rc.1/digital-validation.json) records **86
checks across 10 fixtures**. They include all seven authored new examples and
three focused mixed fixtures. The production coordinator runs actual disposable
digital workers and the unchanged analog WASM; 12 digital and 12 analog workers
were created and terminated, leaving none alive.

Checks include half-adder truth, unknown-state gates, DFF edge times, bus release
and contention, finite-edge DAC/RC response against analytic references,
threshold ADC crossing times and `0/X/1/X/0`, and complete Schmitt ADC → logic →
DAC replay. Every native final-pass analog sample was compared exactly against a
fresh final-deck run. Complete replay produced identical vectors/events.
Unknown DAC input was rejected instead of being assigned a fabricated voltage.

The shipped binary was built with `--disable-xspice`, and a real capability
probe rejected its XSPICE ADC device. See
[digital-engine-capability.json](../../evidence/history/1.1.0-rc.1/digital-engine-capability.json).
The new JavaScript event kernel is explicitly identified; this release does not
claim XSPICE was enabled in the pinned binary.

## Browser observations

Managed Chrome used `http://terminal.local:4173/`. This is an insecure,
non-localhost preview origin. Runtime build `220d09829102c215` was used for early
integration observations; final source build `089964ae0aed2792` was used for the
final mixed-chain run, digital run, report previews and digital backup
round-trip. The distinction is recorded in
[rc110-digital-mixed-browser.json](../../evidence/history/1.1.0-rc.1/rc110-digital-mixed-browser.json).

### Confirmed

- An existing rc.3 RC project, its revision, stored runs and baseline survived
  the update. A fresh 501-point analog AC run completed with protocol 4 and
  versioned `assets/1.1.0-rc.1/` worker, glue and WASM URLs.
- The half adder completed with 14 shared event positions and SUM/CARRY lanes.
  The DFF divide-by-two example completed with 22 positions and three logic lanes.
- Tri-state sharing completed with 16 positions. The bus visibly showed 0, X, 1
  and Z, including hatched X and dotted high-impedance intervals.
- Clock → DAC → RC completed with 900 positions (895 original analog times).
  Editing C1 from 100 nF to 220 nF incremented the project to revision 1; the
  new run had 894 positions (889 originals) and retained the pinned baseline.
- The mixed backup reopened through the app and survived a page reload with
  its revision, runs, literal logic and baseline intact.
- Complete analog → Schmitt logic → analog execution completed with 439 shared
  positions and 435 final-pass original times. Diagnostics retained the analog
  input pass, digital event pass and analog output pass, with both exact decks.
- A mixed cursor showed interpolated voltage values explicitly, alongside held
  logic states. A direct analog-to-digital wire attempt was rejected before a
  mutation; the project remained at revision 0.
- Digital CSV contained literal 0/1/X/Z. Mixed CSV contained 894 data rows,
  labeled 889 `ngspice-original` and 5 `linear-interpolated`.
- The final digital backup reopened and reloaded with every X/Z interval.
  Downloaded digital, mixed-baseline and two-pass mixed backups all passed the
  production `safeEnvelope` and project validators in a separate read.
- Final digital and mixed report previews showed literal logic states without
  numeric extrema, actual engine identities, timing settings, model provenance,
  captured plans and exact analog decks. Digital-only reports omitted unused
  analog solver configuration.

### Unverified or limited

- **Secure-context offline installation, reload and update activation are not
  browser-verified for this candidate.** Service-worker VM checks do not close
  this gate. The preview correctly reported that HTTPS/localhost is required.
- Web Crypto hashes were unavailable on this insecure browser origin and were
  shown as `unavailable-in-insecure-context`. Release ZIP hashes and the pinned
  WASM hash are separately verified by the packaging process.
- **HTML report download and native browser Print/PDF remain unverified.**
  The report rendered inside the app, but the Download HTML report action did
  not produce a verified download event/file in this managed session. No cause
  is assigned. This is not counted as a successful export.
- Phone/tablet layout and actual host cache-recovery behavior were not rerun
  for this digital milestone. Prior dated observations remain historical.
- The supplied Green Shoe Garage deployment was not modified or validated as
  running this new candidate. Its earlier hosting findings are historical.

## Deployment and remaining release gates

Upload every file from the deploy archive, including `assets/1.1.0-rc.1/`, its
engine folder and WASM, the release service worker and `repair/`. Preserve the
folder tree. Source checkouts require `node scripts/build.mjs` and serving
`dist/`. Serve HTTPS or localhost for offline caching. Do not open `index.html`
with `file://`. Installation details are in [installation.md](../installation.md).

Before stable promotion, verify the exact uploaded build on the target HTTPS
host: fresh and upgraded worker startup, complete offline reload/update,
installation-scoped recovery preserving saved projects, supported-browser and
viewport checks, and successful report/download/print outputs. Test mixed
examples on that exact hosted build. Coordinated cross-domain feedback and
multibit converters remain separate feature work, not hidden acceptance claims.

The release integrity receipt is generated after the final build and ZIP CRC
checks. It records exact file counts, archive sizes/hashes, source mapping,
versioned paths and the unique WASM asset. It is a content-integrity record,
separate from numerical and browser evidence.

## Historical records

The rc.3 validation and progress documents are preserved in
[history/VALIDATION-1.0.0-rc.3.md](VALIDATION-1.0.0-rc.3.md) and
[history/PROGRESS-1.0.0-rc.3.md](PROGRESS-1.0.0-rc.3.md).
Earlier browser, hosting and report-layout JSON records retain their original
versions and dates. They have not been relabeled as current observations.
