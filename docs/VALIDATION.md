# Release validation and acceptance

**Release: 2.2.0 · Cumulative v2.1 and v2.2 · Runtime build: `53c8eee8280bd405` · October 25, 2026**

The authorized **2.1 everyday workbench** and **2.2 instruments and numerical
comparisons** batches are implemented in this cumulative release. They add
application behavior to the accepted 2.0 foundation; this release is not a
metadata-only promotion. The maintained catalog remains **43 parts, 37 model
definitions and 41 examples**: 16 analog, 16 digital and 9 mixed.

**Final release gate status: Completed. Application and numerical gates passed; the accompanying release-integrity receipt records final package tests and exact archive/rebuild verification. Browser-output limits are explicit below.**

The final evidence fields below identify the exact tested and packaged release.
Automated tests, numerical comparisons, browser observations and archive
verification are separate evidence categories. The earlier 842-case gate and
first final-gate attempt remain preserved under their original evidence names;
the fresh passing gate above is the current application result.

## Current release evidence

| Verification | Final result and evidence |
|---|---|
| Application test gate | **868 passed / 0 failed cases across 61 files**. The [final application record](../evidence/v220-final-application-tests.json) retains source identities and per-file transcripts; built-package acceptance is separate. |
| Numerical comparison | **24 passed against analytic, pinned native-ngspice and bundled-WASM references**. The [coordinated comparison record](../evidence/coordinated-validation-2.2.0.json) identifies analytic expectations, actual native/WASM executions and source hashes. Final source-identity check: **all seven recorded source hashes match this release**. |
| Browser workflows and downloaded outputs | **10 focused workflow checks passed; CSV/JSON/backup transfers and restore verified. HTML report download completion was not observed in the managed HTTP preview**. Evidence: [browser workflow record](../evidence/v220-browser-workflows.json), [download audit](../evidence/v220-browser-export-audit.json), and the actual exported fixtures in `evidence/v220-browser/`. Observed environment, operations and any limits belong to this record. |
| Final built-package checks | **11 built-package cases plus exact manifest/source/runtime checks; final outcome is recorded in the accompanying release-integrity receipt**. Exact manifest, worker, WASM, version and recovery checks belong to the release-integrity receipt. |
| Independent archive and source rebuild audit | **Both frozen archives receive independent CRC/hash checks and an isolated source rebuild compared byte-for-byte with the deploy ZIP; exact outcome and archive identities are in the accompanying release-integrity receipt**. The audit must identify both frozen ZIPs and compare an isolated source rebuild with the delivered deploy files. |

The release outputs are `CircuitBench-2.2.0-deploy.zip`,
`CircuitBench-2.2.0-source.zip`, `CircuitBench-2.2.0-release-integrity.json` and
`CircuitBench-2.2.0-SHA256SUMS.txt`. The external receipt and checksum list name
the exact archives. The source package omits a duplicate `dist/` tree; its build
recreates the deployable directory. Package preparation and local browser
observations do not establish that the release has been uploaded to the owner's
external host.

## Observed browser boundary

The current preview checks used managed Chrome at `http://terminal.local:4173/`.
The final observed runtime identity is `53c8eee8280bd405`; earlier intermediate
builds and the specific workflow observations are recorded in the browser evidence.
The checks included actual WebAssembly AC execution, coordinated threshold
capture, live source controls, independent step trials, bus expansion, guided
indicator construction with atomic Undo, revision-guarded navigation, measurement
export and backup restore.

HTML report generation and its rendered iframe were verified, including the
new capture, measurement and exact-plan sections. The managed browser's HTML
download waits did not complete, although CSV, JSON evidence, execution-plan
JSON and backup downloads did. HTML download completion is therefore not
claimed for this environment. No application-origin error was observed in the
inspected console errors; extension metadata errors were separate.

This HTTP preview does not provide the secure context needed for browser
SHA-256 input hashing or service-worker installation. Its saved evidence
explicitly records `unavailable-in-insecure-context` for those input hashes.
The file audit hashes the downloaded bytes, checks exact compiled inputs and
recomputes measurement arithmetic; it does not turn unavailable browser input
hashes into verified hashes. HTTPS/offline and additional device/browser
acceptance are not inferred from these observations.

## Delivered workflows and what is checked

### Everyday controls and construction

Pinned controls expose supported constant logic/bus inputs and independent DC
voltage/current sources beside the schematic. A digital voltage source has a
dedicated operation target; selection, dragging and wiring remain ordinary
editing operations. Momentary scalar controls preserve one press owner across
rerenders, acknowledgements, cancellation and focus loss. Starting values, live
input changes and recorded historical values stay distinct. A real-time button
hold does not prescribe a simulation-time pulse duration.

Guided wiring exposes compatible domains and widths. Corrective actions create
explicit ADC/DAC references and configuration, Slice/Join bit mappings or
matching decoder/display paths. New parts, wires and probes form one undoable
edit. Invalid configuration leaves the circuit and undo history intact. Bit zero
remains the LSB; helpers do not silently truncate, extend or replace X/Z states.

Navigable diagnostics resolve the affected component, pin or net. An alternative
analysis is offered only when the complete circuit compiles for that route.
Unsupported nonlinear feedback therefore does not receive a misleading
feed-forward engine suggestion. See [live controls](live-controls.md),
[guided construction](guided-construction.md) and their focused tests in
`tests/live-controls.test.mjs` and `tests/construction.test.mjs`.

### Captures, event stepping and linked views

Triggers run in the existing continuous coordinated worker. They observe a
declared analog voltage/current threshold, a scalar digital edge or one explicit
bus bit. Digital edges require direct settled binary transitions; the initial
held value and transitions through X/Z do not invent an edge. Analog trigger
localization uses trial states on the numerical time grid.

A capture retains its actual pre/post window and marks unavailable history
explicitly. A same-boundary input update that supersedes the trigger state
before post-trigger collection advances cancels that capture with a visible
reason. Completed zero-post captures remain immutable. Saving a capture retains
evidence, not resumable private worker state.

**Next event** searches scheduled digital operations, source corners, converter
samples, DAC ramp ends and localized scalar ADC changes. It passes ordinary
analog integration steps. A scheduled operation can leave its resolved output
unchanged. The 2,000-step command work limit is distinguished from reaching the
declared search horizon; both record the actual searched end and requested end.
Automatic capture completion clears pending work before notifying the paused UI.

Bus expansion derives view-only scalar lanes from retained word events or
samples. X/Z and bit ordering remain literal; the raw run, backup and raw CSV
stay intact. Linked schematic/plot selection checks the captured project and
revision before navigating. It does not silently replace the working schematic
with a historical circuit. See [captures](triggered-capture.md),
[linked signals](linked-signals.md), `tests/capture.test.mjs`,
`tests/capture-review.test.mjs` and `tests/plot-signals.test.mjs`.

### Measurements and numerical sensitivity

Instrument measurements use completed transient or AC evidence. Supported
quantities include rise/fall time, directional overshoot, finite-window settling,
threshold delay, transient/AC transfer gain, AC cutoff and declared digital
setup/hold constraints. Levels, windows, references and interpolation limits are
explicit. Missing crossings, X/Z, insufficient observation and ambiguous event
ordering retain their status instead of receiving guessed values.

Analog measurement inputs preserve original samples. Feed-forward mixed results
exclude added event-union interpolation positions from those original inputs.
Setup/hold checks use preserved resolved events and stated timing requirements;
they do not add a physical metastability or transistor timing model. Reusable
setups retain their exact configuration and window. Independent records retain
selected raw evidence even after the ordinary source run leaves history.

Time-step sensitivity studies run **2–4 fresh independent coordinated transient
trials**, changing only the maximum analog step by exact successive halvings on
the 1 ps grid. The same declared analog measurement is applied to every trial.
A scalar is available only for exactly one complete numeric occurrence. Trials
with failed, cancelled, missing or ambiguous results remain visible; comparisons
do not skip a failed intermediate trial.

For each adjacent pair, the declared criterion is
`abs(new - previous) <= absolute tolerance + relative tolerance * abs(new)`.
This reports numerical sensitivity, not a certified error estimate, proof of
convergence or physical-accuracy rating. Digital-only runs, AC, imported SPICE,
unsupported coordinated devices and continuous live-input histories are not
step-study inputs. See [measurements](measurements.md),
[time-step studies](step-study.md), `tests/measurements.test.mjs`,
`tests/measurement-evidence.test.mjs` and `tests/step-study.test.mjs`.

### Saved evidence and reports

Portable backups include independent captures, instrument measurements and
step studies alongside existing runs and experiments. Records keep their
captured circuit revision, engine identity, exact available execution inputs,
recorded hashes and original selected numerical data. Reports distinguish
ngspice feed-forward sampling from coordinated accepted states and describe
the settings of the engine actually used.

Import checks structure, signal definitions, retained witnesses, applicable
sampling provenance and recomputed measurement/study arithmetic. These checks
establish internal consistency. They do not resimulate a saved experiment,
authenticate an externally edited file or resume a stopped continuous solver.
See [project format](project-format.md) and the evidence guides above.

## Model and resource boundaries

The coordinated analog partition remains **R/C/L and independent voltage/current
sources**, coupled with supported digital logic and explicit scalar or 2–8-bit
converters. Diodes, transistors, op amps, switches and imported SPICE decks are
outside that coordinated subset. The existing nonlinear analog library remains
available through ngspice's supported analog and feed-forward mixed analyses.

Coordinated analog integration uses backward Euler with a declared maximum
step and causal breakpoints. It has step-dependent error and damping and no
adaptive local-error controller. Ngspice temperature and relative-tolerance
settings do not configure that method. The **1 ps event grid is scheduling
resolution**, not a claim of 1 ps analog accuracy. Pure-digital execution is
event driven and does not use the analog maximum step.

| Resource | Retained boundary |
|---|---|
| Coordinated analog problem | 48 non-reference nodes, 80 matrix unknowns and 160 analog elements. |
| Continuous command and history | 2,000 accepted steps per command; up to 30,000 positions, one million dense values and 250,000 sparse events in the rolling window. |
| Continuous lifetime evidence | Up to 2,000 groups of live input changes; safe absolute timeline ends at 9,000 seconds. |
| Independent captures | Up to six records, 16 MiB per record and 32 MiB across capture history. |
| Instrument configurations and evidence | Up to 16 saved configurations and 12 independent records, with the raw-data and byte bounds in the measurement guide. |
| Time-step studies | 2–4 trials per study and four saved studies, with the selected-data and byte bounds in the study guide. |

These limits can shorten a retained window or reject an oversized record.
Requested duration and actual coverage remain distinct. Detailed contracts are
in [the engine guide](closed-loop-engine.md),
[continuous simulation](continuous-simulation.md), [captures](triggered-capture.md),
[measurements](measurements.md) and [step studies](step-study.md).

The deployed analog engine remains **ngspice45.2 WASM**. The separately pinned
**native ngspice42** reference executes comparison decks with recorded binary
and runtime-library identities. This is an auditable distribution-binary
reference environment, not a hermetic C/C++ source rebuild. Numerical reference
checks do not by themselves verify browser loading, offline updates or output
downloads. See [the reference environment](reference-environment.md).

## Historical 2.0 acceptance

On October 25, 2026, the user confirmed **“hosting and browser acceptance checks
passed.”** That confirmation closed the outstanding acceptance of
**2.0.0-rc.3 / `8a99d6d843d32aa6`**, subsequently promoted to stable **2.0.0 /
`6cf7ae00d61a0f43`**. It remains recorded in
[v200-owner-acceptance.json](../evidence/v200-owner-acceptance.json).

The confirmation is historical owner acceptance of the 2.0 implementation. It
does not supply individual browser/device logs, establish v2.2 acceptance or
claim an assistant-performed external upload. Historical test totals and source
hashes retain their original identities; they are not added to the current
release's fresh counts.

The complete stable-2.0 narrative is preserved in
[VALIDATION-2.0.0.md](history/VALIDATION-2.0.0.md), with earlier candidate history
under [rc.3 validation](history/VALIDATION-2.0.0-rc.3.md). The next development
investigation is the nonlinear-engine architecture proof described in
[ROADMAP.md](../ROADMAP.md).
