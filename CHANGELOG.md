# Changelog

## 2.2.0 — 2026-10-25

- Completed the authorized 2.1 and 2.2 batches as one cumulative release.
- Added worker-backed digital-edge and analog-threshold triggers, explicit
  pre/post windows, Run until event and bounded Next event navigation. Captures
  retain original samples, live input history, immutable circuit provenance and
  explicit unavailable-history durations.
- Added view-only bus-bit expansion and guarded schematic/plot selection links.
- Added rise/fall, overshoot, finite-window settling, threshold-delay, transfer
  gain, AC-cutoff and digital setup/hold measurements. Reusable configurations
  and independent source evidence survive run removal and backup restore;
  imported arithmetic is recomputed from retained inputs.
- Added bounded coordinated transient time-step studies with exact halvings,
  independent initializations, per-trial evidence, explicit scalar comparisons
  and user-declared absolute/relative tolerances.
- Preserved the existing component catalog, broader ngspice analog library,
  coordinated R/C/L/V/I scope, complete engine package and earlier release
  evidence. Current validation and delivery details are in docs/VALIDATION.md.

## 2.1 batch — completed within 2.2.0

- Added pinned live controls and direct digital source operation with separate
  initial/live/recorded state. Momentary controls release on pointer or keyboard
  cancellation, loss of focus, Stop and session replacement without late writes
  into a new session.
- Added compatible wire destinations, explicit configured ADC/DAC and Slice/Join
  corrective actions, attach-indicator, probe-bit and decoder/display shortcuts,
  all with atomic undo behavior.
- Added navigable component/pin/net diagnostics, whole-circuit compatibility
  alternatives and examples organized by operating goal. A nonlinear mixed
  feedback circuit is never silently rerouted into feed-forward execution.
- Recorded the batch checkpoint in evidence/v2.1-batch-checkpoint.json. A
  separate public 2.1 deployment is not implied.

## 2.0.0 — 2026-10-25

- Promoted the accepted 2.0.0-rc.3 workbench to stable 2.0.0 after the project
  owner confirmed: “hosting and browser acceptance checks passed.” This closes
  the remaining hosting and browser release gates on the basis of that owner
  confirmation. Earlier automated and managed-browser observations retain
  their original release/build identities.
- Updated application and package version labels, versioned runtime and
  recovery paths, current release documentation and complete source/deploy
  packages to 2.0.0. The stable promotion preserves the accepted application
  behavior, simulation kernels, models, project format and feature catalog.
- Corrected archive selection for checksum and integrity records: stable
  `2.0.0` packages now list exactly the current deploy and source ZIPs, without
  including older `2.0.0-rc.*` archives sharing their filename prefix. Added a
  black-box regression using the real packager and preserved the initial audit
  failure as release evidence.
- Recorded acceptance provenance and stable-package verification in
  [VALIDATION.md](docs/VALIDATION.md) and the release integrity receipt.
  Preparing these packages does not claim a new external-server deployment.
- Marked the 2.0 milestone complete and 2.1 everyday workbench improvements as
  the next roadmap milestone. The coordinated analog subset and later
  nonlinear-engine architecture work retain their existing scope.

## 2.0.0-rc.3 — 2026-10-24

- Added **Help → Check installation** and a loading-failure entry point.
  The check compares loaded release identity, advertised release/recovery
  manifests and runtime files, with bounded requests, explicit cancellation
  and per-stage results. SHA-256 verification is reported as unavailable when
  the browser cannot provide it; connected checks do not imply offline or
  upgrade acceptance.
- Added three independent smoke computations through real disposable workers:
  digital HIGH through NOT, coordinated Schmitt RC feedback across retained
  updates, and a 10 V equal-resistor divider through the pinned ngspice WASM.
  Check workers are disposed after success, failure or cancellation. The
  working circuit and saved project data are not used or mutated.
- Added downloadable installation diagnostic JSON, individual asset details
  and an explicit link to scoped cache repair. The diagnostic checker does
  not clear caches, unregister service workers or refresh the page.
- Added a persistent workbench state/time strip that distinguishes active
  computation, current completed results and saved/historical evidence.
  Latest/Cursor A and **Return to latest** clarify which retained time drives
  indicator observations without starting or resuming computation. Selected
  DVS context distinguishes initial, live and recorded drive commands.
- Fixed paused Step lifecycle feedback: pending commands disable Step, and
  completion restores the paused retained-state explanation. Late completions
  or errors from a replaced session cannot overwrite the new session's UI.
- Generated current operational release labels and paths in the installation
  guide, user guide and both recovery-page aliases. The renderer rejects stale
  current-release references while preserving explicitly historical examples.
  Corrected old rc.1 guide references and the recovery page's 1.0.0-rc.3 labels.
  Release manifests distinguish generated documents from byte-identical source
  copies and record the template/renderer inputs.
- Added loaded build identity to the application shell, with a documented
  canonical-shell hashing method and corresponding package checks. Preserved
  verification of the final served shell bytes and versioned runtime assets.
- Added a reproducible setup recipe for the exact previously pinned native
  ngspice42 binary, using verified Ubuntu package archives in a private
  directory. Records identify the initialization transformation and host
  runtime libraries; no native/WASM source-rebuild or hermetic-toolchain claim
  is implied. The coordinated proof accepts an explicit native executable,
  retains the existing hash pin and excludes user/local initialization with
  `-n`.
- Completed a fresh 24-check numerical proof using pinned native42, deployed
  ngspice45.2 WASM, analytic expectations and retained-state checks. Application
  test totals, browser observations and remaining acceptance gates are recorded
  in [VALIDATION.md](docs/VALIDATION.md). The reference recipe and its limits are
  documented in [reference-environment.md](docs/reference-environment.md).
- Reassessed the roadmap around release acceptance, everyday bench operation,
  instruments and a separate nonlinear-engine architecture milestone. The
  catalog remains 43 parts, 37 models and 41 examples. DVS/DLED and the six
  earlier 2.0 feature batches retain their existing model/solver scope.
- Retained release-candidate status. Exact external-host HTTPS/offline/update
  acceptance and a complete declared browser/output matrix remain distinct
  from implementation, local browser checks and package preparation.

## 2.0.0-rc.2 — 2026-10-24

- Added `DVS`, a digital voltage source with explicit LOW/HIGH inspector buttons and a scalar digital output. Optional voltage mode exposes separate analog positive/negative terminals, configurable 0/5 V defaults and finite rise/fall times. Its initial voltage matches its chosen state.
- Added `DLED`, a passive logic indicator with a red glow only for resolved HIGH. LOW is dark, X is amber and Z uses a dashed blue outline. Run/revision checks and exact sparse events control schematic and inspector readouts; Cursor A selects the recorded time. SVG export preserves the glow.
- Added live binary source controls in both the inspector and Live inputs dialog. Continuous changes retain numerical state, record simulation timestamps and preserve the original project snapshot. Unknown source settings are rejected before applying a live update.
- Added domain-safe selectable voltage terminals, protection for attached wiring/labels/probes when removing pins, and explicit X/Z rejection for unresolved voltage output. Existing DIN and BUSIN retain their four-state behavior.
- Added three examples: complementary digital indicators, actual voltage/RC/Schmitt response, and simultaneous HIGH/LOW/X/Z observation. The catalog now contains 43 parts, 37 models and 41 examples (16 analog, 16 digital, 9 mixed).
- Tightened indicator readback checks for malformed or contradictory scalar metadata and time axes. Preserved the existing seven-segment model identity and all earlier workflows.
- Verified 595 application tests, fresh pinned-WASM numerical comparisons, source voltage levels through actual WASM workers, and browser live switching. Exact results and remaining external-host gates are in [VALIDATION.md](docs/VALIDATION.md).

## 2.0.0-rc.1 — 2026-10-24

- Implemented all six requested batches: working seven-segment display,
  coordinated feedback, closed-loop execution, multibit converters, advanced
  analog studies and stateful continuous simulation.
- Added `SEG7`, an eight-bit digital segment indicator, and `HEX7`, a separate
  hexadecimal/BCD decoder with decimal-point input. Displays use the selected
  run's preserved events at the selected time, distinguish X/Z, and support
  active-high/low logic. This is an ideal digital display without LED current,
  brightness or multiplex-persistence modeling.
- Added a separate coordinated transient worker for R/C/L, independent V/I
  sources, digital logic and explicit converters. Backward-Euler analog state,
  threshold localization, converter sampling and digital events share a causal
  timeline. Schmitt RC and sampled four-bit controllers exercise actual closed
  analog/digital feedback.
- Added unsigned 2–8-bit `ADCBUS` and `DACBUS` parts with differential analog
  terminals, full-word width checks, nearest-code saturation, periodic samples,
  conversion delay and finite output transitions. ADC delay is checked after
  rounding to the 1 ps grid. DAC compilers require fully known startup words;
  the configured initial code is held until the first known input, and later
  X/Z stops the run.
- Added linear/logarithmic parameter sweeps and deterministic seeded Monte
  Carlo tolerance studies for analog-only schematics. Up to 64 trials and
  eight tolerance parameters use fresh isolated simulations without changing
  the working project. Measurements include final/extreme/peak-to-peak values,
  time-weighted transient RMS and AC magnitude/phase at a requested frequency.
- Added immutable study history with exact applied parameters, source samples,
  engine/input identity, explicit failed/cancelled trials and recomputed import
  arithmetic. Up to six study records are retained within sample/byte bounds.
  Autosave, backups, CSV, evidence JSON and reports preserve the records.
- Added stateful continuous batches with Pause, Resume, Step and live changes
  to `DIN`, `BUSIN` and independent DC voltage/current sources. The worker keeps
  analog/digital state across bounded commands. Results retain a bounded rolling
  window, absolute time boundaries and the applied input history. Stop keeps
  completed results; backup snapshots are inspectable and cannot resume a live
  solver. Circuit edits stop the session.
- Added display, converter, feedback, live-RC and analog-study examples,
  bringing the workbench to 41 parts, 35 model definitions and 38 examples
  (16 analog, 14 digital and 8 mixed).
- Retained ngspice for the full analog model library and its supported scalar
  feed-forward mixed execution. The coordinated subset does not include
  nonlinear semiconductor, switch or op-amp models; the pinned ngspice WASM
  remains unchanged and XSPICE remains disabled.
- Added focused integration, numerical, worker and persistence coverage plus
  new feature guides. Exact test totals and current evidence are recorded in
  [VALIDATION.md](docs/VALIDATION.md). Historical changelog and validation entries
  retain their original release identities.
- Retained candidate status. External-host deployment and exact HTTPS/offline
  acceptance remain separate from implementation and packaging.

## 1.3.0-rc.1 — 2026-10-24

- Added event-based propagation delay, pulse width, period, frequency and duty
  cycle measurements for scalar logic and explicitly selected bus bits.
- Defined direct binary edge selection, polarity, inclusive windows,
  simultaneous-event zero delay, X/Z ambiguity and missing-edge behavior.
  Numerical summaries exclude incomplete or indeterminate rows.
- Added timing setup, saved history, exact event-pair tables and waveform cursor
  navigation to the original run. Measurement operations preserve circuit state.
- Added immutable sparse timing evidence with captured circuit, run identity,
  engine/input hashes and bridge assumptions. Evidence survives source-run
  removal, autosave and portable backup import; imports verify arithmetic
  against the saved events without claiming a fresh circuit simulation.
- Added timing CSV/evidence JSON and report sections identifying each original
  run and revision. Retain up to 12 timing records within explicit event/byte
  bounds; removed older records are reported.
- Added clock/delay, reconvergent hazard and X/Z/boundary examples, bringing
  the library to 29 examples with the existing 37 parts.
- Retained ngspice, digital simulation and feed-forward bridge semantics. The
  candidate does not add mixed feedback, setup/hold constraints or MCU/HDL.
- Preserved the 1.2 validation and progress evidence under their original
  version identities. Target HTTPS/offline/browser acceptance remains a
  distinct release gate; packaging does not deploy the external host.

## 1.2.0-rc.1 — 2026-10-24

- Added 1–8 bit bus inputs and timed patterns, passive slices/joins, registers,
  counters, multiplexers, one-hot decoders and bounded truth-table logic.
- Derived pin widths from component parameters; reject mismatched wiring,
  junction/label aliases and connected width edits before mutation.
- Added atomic private register/counter state, synchronous reset priority,
  wrap behavior, transport delay and conservative X/Z semantics.
- Added a LUT row editor and an independent combinational truth-table experiment
  using the production event kernel in a disposable, cancellable worker.
- Added exact-width word timing lanes, state-at-time cursors, CSV/report output,
  width-aware baselines and immutable saved truth-table evidence.
- Kept leading zeros and per-bit X/Z through compilation, simulation, export and
  project round trips. Scalar results retain their existing one-bit format.
- Added six worked examples, bringing the total to 26, and expanded focused and
  actual-worker validation while retaining the unchanged ngspice WASM.
- Retained candidate status. Packaging does not update the external host, which
  still displayed 1.0.0-rc.2 during this milestone's live inspection.

## 1.1.0-rc.1 — 2026-10-24

- Prioritized digital and mixed-signal simulation at the user's request.
- Added a local four-state event engine with timed gates, clocks, tri-state
  resolution and rising-edge D flip-flops in disposable workers.
- Added explicit digital pin/net domains, logic probes and input validation;
  direct analog/digital joins and unsupported feedback are actionable errors.
- Added one-bit ADC/DAC bridges and bounded feed-forward replay through the
  unchanged ngspice WASM engine, including threshold and Schmitt sensing.
- Added digital timing lanes and a mixed analog/logic plot, literal-state CSV,
  project/result round trips and explicit sampling/execution provenance.
- Added digital and mixed worked examples and reference/behavior checks.
- Preserved the versioned assets, canonical offline shell, startup diagnostics
  and project-preserving recovery introduced in rc.3.
- Retained release-candidate status and all unclosed secure-browser/output
  acceptance gates; no external server was updated by packaging this release.


## 1.0.0-rc.3 — 2026-10-24

### Hosting and recovery repair

- Put the executable module graph, worker, stylesheet and engine in a release-specific `assets/<version>/` directory, with a versioned root service-worker filename.
- Construct the offline HTML shell from canonical bytes embedded in the service worker. Cloudflare's analytics insertion and the host's broken explicit `index.html` redirect no longer affect shell installation.
- Add a `repair/` directory entry so extensionless HTML redirects reach a real recovery page.
- Refresh browser HTTP-cache entries as well as the installation's service-worker cache, while preserving project storage and other applications.
- Add a worker-ready signal and bounded response inspection after an opaque bootstrap failure; a successful fetch does not invent the reason for a browser execution failure.
- Keep exact asset verification and scoped cleanup; do not change site security settings or the numerical WASM.

Live rc.2 inspection at the supplied Green Shoe Garage URL completed two
501-point AC runs in a fresh browser. It also established seven-day script
caching, modified HTML and two HTML-to-directory 404 redirects. The exact
failure inside the user's browser was not reproduced; stale assets remain an
inference. This candidate includes the resulting hosting fixes and records
new verification separately from earlier evidence.

## 1.0.0-rc.2 — 2026-10-24

### Fixed

- Replaced the `.mjs` runtime module with `.js` for broader static-host MIME compatibility.
- Removed the worker's top-level engine dependency so module-load errors can be caught and reported with their exact resource URL.
- Explicitly loaded and checked WASM bytes before initialization; missing, HTML, and truncated responses now fail with useful diagnostics.
- Corrected the vendored wrapper to use supplied WASM bytes, avoiding a second fetch and supporting valid binaries served with generic MIME types.
- Propagated engine initialization rejection instead of leaving startup pending.
- Preserved bounded startup-stage details in saved failed-run records.
- Required fresh, hash-verified runtime responses before accepting an offline cache; rejected misleading HTTP-200 error pages and stale bytes.
- Added a recovery page that refreshes only this installation's executable cache while preserving projects and preferences.
- Clarified deploy ZIP versus source ZIP launch instructions and corrected the documented JSON import limit.

The numerical WASM, models and schema remain unchanged. The app remains a
release candidate pending the real-browser offline/output gates recorded in
`docs/VALIDATION.md`. The exact cause on the user's host is not asserted without
its URL or new detailed diagnostic.

## 1.0.0-rc.1 — 2026-10-24

First reviewable CircuitBench release candidate.

### Added

- Versioned authoritative electrical project model separate from visual layout.
- Schematic editing, explicit pin connectivity/junctions/net labels, context
  properties, selection, copy/paste, rotation/mirror, undo/redo and SVG export.
- Real ngspice 45.2 WebAssembly execution through pinned EEcircuit-engine 1.8.0.
- Disposable worker isolation with physical cancellation, watchdog timeout,
  diagnostic preservation and fresh-run recovery.
- DC operating point, one-source DC sweep, logarithmic AC and transient analyses.
- Voltage/differential/current measurements, magnitude/phase, cursors, numerical
  CSV, immutable run records and baseline comparisons.
- Fourteen component types and thirteen worked examples with explicit generic
  educational models and limitations.
- Local autosave/recovery, portable project files, SPICE subset import/export,
  component CSV and designed printable analysis reports.
- Dark/light/high-contrast themes, responsive panels, keyboard alternatives,
  local runtime assets and offline-installation support.
- Reproducible package extraction, third-party notices/source, user/deployment
  guides, compatibility boundaries, numerical evidence and focused tests.

### Verification at candidate creation

The 62-check numerical/worker foundation suite passed against analytic cases and
a pinned native ngspice reference, with 56 workers created and terminated. All
13 worked examples plus two source fixtures passed 70 native vector comparisons
and 16 analytic/behavior checks. Another 74 Node/VM tests passed across the core,
editor, results/reports, autosave, package, service-worker and raw-parser suites.

The actual browser completed RC computation, changed-capacitor baseline
comparison, project backup export/import/reload and report preview, with further
editing and deployment checks recorded in [VALIDATION.md](docs/VALIDATION.md).
Real browser offline installation/reload/update remains unverified because the
managed review origin is insecure HTTP on a non-localhost host. Standalone
report HTML and SPICE-file downloads also remain unverified. This candidate is not promoted
to v1.0.0 while its required release gates remain open.

### Fixed during candidate review

- Corrected upstream raw-output parsing for Unicode project titles: locate
  binary data by byte position and validate payload lengths. The original
  two-divider failure now returns 5 V and 2 V in both the browser and numerical
  regression suite. The numerical WASM binary is unchanged; adapter version is 2.
- Corrected endpoint-body routing for moved, rotated and mirrored components,
  with the actual RC capacitor transformation retained as an editor regression.

### Scope

No external destination has been deployed. Digital logic, MCU/HDL simulation,
PCB layout, classroom administration, real-time collaboration and AI assistance
remain outside this release.
