# Architecture and authoritative data

## Decision

CircuitBench is a buildless-source browser application packaged as a prebuilt
static directory. Its modules use standard browser APIs: SVG for the editor and
plots, IndexedDB for projects, Web Workers for numerical isolation and a service
worker for installed offline use. The application has no frontend-framework
runtime dependency. The analog foundation uses pinned EEcircuit-engine 1.8.0 /
ngspice 45.2 WebAssembly. Version 1.1 introduced four-state digital events, 1.2
added buses/state/tables, and 1.3 added timing evidence. Version 2.0 adds an
explicit coordinated transient engine for R/C/L and independent sources,
stateful continuous sessions, multibit converters, working seven-segment
displays and independent analog parameter/tolerance studies.

One WorkbenchEngine routes a captured circuit to ngspice analog execution,
native digital events, ngspice feed-forward mixed replay, or coordinated
transient execution according to its recorded analysis and parts. The full
ngspice model library remains available; the coordinated solver has a smaller,
explicit model boundary. A native ngspice binary is a development reference,
not a runtime dependency. The existing engine.js analog facade is preserved.
The bundled WASM was compiled with XSPICE disabled; digital models are therefore
executed by an explicitly identified event engine, not fictitious XSPICE devices.

## One electrical authority

| Module | Responsibility |
|---|---|
| `library.js` | Pin definitions, parameters and units, engineering-value parsing, explicit generic models and provenance |
| `model.js` | Schema validation, IDs, components, connections, electrical net construction, checks, copy/delete semantics |
| `editor.js`, `symbols.js` | Interaction and SVG rendering from the model, with separate drawing geometry |
| `netlist.js` | Canonical analog deck generation, typed digital/mixed plans and allowlisted analog SPICE import |
| `digital.js`, `digital-worker.js`, `simulation.js` | Four-state timed events, isolated digital execution, explicit ADC/DAC replay and coordinated cancellation |
| `coordinated.js`, `coordinated-digital.js`, `coordinated-worker.js` | Original backward-Euler modified nodal analysis, incremental events, converter scheduling and retained circuit state |
| `coordinated-engine.js`, `coordinated-results.js` | Stateful worker protocol, watchdogs, bounded finite-run chunk joining and checked result contracts |
| `continuous.js`, `continuous-evidence.js` | Pause/resume/step/live-input lifecycle, absolute-time rolling windows and portable continuous provenance |
| `displays.js` | Passive seven-segment state selection and SVG/readout rendering from matching captured events |
| `experiments.js`, `experiments-ui.js` | Independent analog sweep/tolerance trials, reproducible parameter generation, metric arithmetic and immutable study evidence |
| `engine.js`, `engine-worker.js` | Worker lifecycle, catchable local engine loading, checked WASM bytes, actual solver execution, normalized real/complex results and structured diagnostics |
| `plots.js` | Derived measurements, view simplification, plots, cursors and numerical CSV |
| `storage.js`, `truth-table-evidence.js`, `timing-evidence.js` | IndexedDB autosave/recovery, bounded envelope and immutable table/timing validation, local preferences and downloads |
| `truth-table-ui.js` | Truth-table selections, LUT rows, literal-word CSV and evidence presentation |
| `timing.js`, `timing-ui.js` | Bounded event-pair measurements, scalar/bus-bit selection and exact measurement presentation |
| `reports.js` | Designed reports derived from recorded project/run evidence |
| `app.js` | One project state, revision history, visible controls and integration |

Schema 1 separates `circuit` from `layout`. Components have stable IDs and pin
names. Connections reference endpoints such as `componentId:pinId`; junctions
have their own endpoint IDs. Labels intentionally unify equal named nets; domain validation then rejects
analog/digital joins, including label and junction paths. Pin domain/direction metadata comes from the component definition. Dynamic
widths come from `getPins(component)` and trusted part parameters; endpoint
identities remain fixed. Width-aware mutations reject connected conflicts
before changing the project.
Grounds unify node 0. Layout holds coordinates, 90-degree rotation, mirror state
and wire bends. Net construction never infers connectivity from coincident
coordinates or crossing segments.

This permits a component to move without disconnecting its intended pins. A
junction tool changes the electrical graph explicitly. Copy/paste gives copied
objects new IDs, preserves selected internal connections and omits external
wires that would incorrectly tie the copy back to the original.

Parameters stay human-readable in the JSON model and are validated/normalized
to SI values before netlist generation. Netlists use numeric scientific
notation. Model assignments and pin ordering are explicit; invalid/unavailable
models block a run.

## Mutations and persistence

Complete editor/property actions pass through a single application commit
function. It snapshots the old project for undo, applies the mutation,
validates the resulting project, increments its revision and schedules
persistence. Undo and redo restore both electrical and visual state while
creating a new working revision. Drag previews remain transient until released.

IndexedDB stores the current envelope and preceding autosave in an atomic
transaction. An envelope has `project`, retained `runs`, active-run ID, baseline ID and up
to four immutable `truthTables` records, 12 independent `timingMeasurements`
and six `analogExperiments` study records, each subject to separate size bounds.
Continuous data is stored inside a normal run as a completed retained-window
snapshot, not as a resumable worker checkpoint. Downloads are explicit; no filesystem handle is retained for a
file imported from disk. UI preferences use localStorage and can fail without
preventing work. Save failure is visible and downloadable backups remain the
recovery route.

This is a single active local workbench, not a multiuser database. Independent
browsers/devices do not synchronize. Two paths under the same origin share the
same first-version IndexedDB name. Use exported projects to transfer work.

## Immutable run evidence

Before numerical execution, the app captures the project revision, project
snapshot, generated deck, model definitions/versions/hashes, selected
measurements, settings and engine identity. Once completed, result arrays, original analog sample positions, sparse logic
events, executed analog decks, status, timing and logs are attached to that record. Later project changes do
not rewrite that evidence. The UI separately labels results from older working
revisions.

Each bounded ngspice job creates a fresh module worker, WASM instance and
virtual filesystem. Bounded native digital and coordinated jobs also own fresh
workers. Success, Stop, timeout and failure release those workers. Subsequent
independent runs and analog study trials initialize from their captured circuit
and analysis; they do not inherit a preceding run's state. Continuous mode has
an explicitly different lifecycle: one coordinated worker remains alive across
updates and pauses until Stop, failure or a circuit edit.

Raw complex AC values remain real/imaginary arrays. Bode magnitude and phase,
differential voltages and resistor currents are deterministic postprocessing
of those samples, not replacement circuit calculations. Plot decimation affects
only SVG drawing. Analog-only exports preserve numerical sample arrays.
Ngspice feed-forward mixed results retain all original analog samples and add
digital event times; analog values at those added positions are linear
interpolation, identified by the sampling metadata. Coordinated results contain
actual accepted analog states at shared solver/event times and declare
`analogInterpolation: 'none'`. Logic values are literal 0/1/X/Z strings and are
never interpolated. Continuous retention removes complete old intervals and
preserves all events within its remaining absolute-time window.

## Digital and feed-forward mixed execution

Digital simulation runs in a disposable worker with bounded event/output budgets.
Events use 1 ps integer ticks, explicit transport delay, four-state driver
resolution and a defined simultaneous-edge policy. Combinational-only cycles
are rejected; D flip-flops, registers and counters provide explicit state boundaries.

Buses lower to LSB-first private scalar nets while visible words are MSB first.
Passive Slice/Join aliases are united before driver and feedback checks. The
compiler exposes visible scalar taps and aggregate bus probes; private bit
traces do not duplicate every bus in the UI. Each register/counter owns its
internal word state, independent of delayed or externally contended output
nets. This avoids making state evolution depend on output propagation delay.

Truth-table jobs use the same timed kernel through a separate disposable worker.
Each binary input row starts independently, settles through the longest
combinational path, and captures literal outputs. Bounds limit input bits, rows,
columns, events and saved evidence. Tables record the complete circuit and plan,
not transient timing or physical setup/hold behavior. Their selection order
defines input significance and output column order.

In the ngspice feed-forward mode, mixed plans contain ADC and DAC bridges with distinct analog/digital pins.
The coordinator obtains input analog waveforms when needed, interpolates
threshold crossings to events, runs logic, generates DAC PWL drives, and runs
the final analog circuit. No analog solver is replaced. A conservative
analog-dependency check rejects DAC-to-ADC paths, excluding common ground.
This makes replay valid within its stated feed-forward scope without implying
feedback in this replay mode or synchronized native XSPICE execution. Selecting
the coordinated engine enables feedback within its separate supported model
set; it does not waive replay's dependency check.

Threshold ADC mode exposes the uncertain band as X. Schmitt mode retains an
established 0/1 in the band; unknown startup remains unknown. X/Z at a DAC
causes a diagnostic, never a guessed voltage. Exact bridge parameters, analog
decks and both engine identities are retained in evidence. See
[digital-mixed-signal.md](digital-mixed-signal.md) for timing and modeling limits.

## Coordinated transient and continuous sessions

The new coordinated engine accepts schematic transient plans containing
resistors, capacitors, inductors and independent V/I sources. It uses original
modified nodal analysis with backward Euler for stored analog state and a
stateful digital kernel on a 1 ps scheduling grid. Source breakpoints, pending
digital events, ADC sample times and DAC ramp ends subdivide the configured
maximum analog step. Scalar ADC crossings are localized through trial solves
before an accepted shared boundary. The grid is not a physical accuracy claim;
step-convergence comparisons remain necessary.

Normal startup uses a DC solution; UIC uses explicit capacitor voltage and
inductor current. Semiconductors, the controlled switch and the op-amp model
are rejected in this solver. A singular network or unsupported part fails
explicitly. The unchanged ngspice path continues to handle the wider analog
library. Native digital combinational cycles remain invalid, while stored
analog state and explicit converter timing can participate in a mixed loop.

The multibit ADC samples a differential voltage at an absolute periodic phase,
quantizes to an unsigned 2–8-bit word and publishes after conversion delay.
The multibit DAC maps a known word to an ideal voltage source with finite
edges. Its configured startup code lasts only until the first known word;
later X/Z is an error. See [multibit-converters.md](multibit-converters.md).

The worker accepts bounded advance commands. Finite runs join exact adjacent
chunks without interpolation or retention loss, enforce one overall timeout
and cumulative budgets, then dispose the worker. Continuous sessions instead
retain that worker across Pause/Resume/Step and source changes. Stop, edits and
failures invalidate in-flight replies so old work cannot publish into a new
session. Idle worker failures also close a paused session.

Continuous history is bounded to 30,000 points, one million dense values and
250,000 sparse events over an absolute timeline of at most 9,000 s. Window
trimming inserts the known value at its retained start as a state, not an edge.
Live DIN/BUSIN and DC V/I changes apply atomically at a completed boundary and
retain an independent input timeline. Saving captures the recent result and
provenance; it does not serialize numerical solver state. See
[continuous-simulation.md](continuous-simulation.md).

`SEG7` is a passive observer of a fixed eight-bit segment word. `HEX7` lowers to
ordinary timed LUT/BUF/NOT logic and supplies a separate hexadecimal/BCD
decoder. Display selection uses an exact matching project/revision snapshot
and captured sparse events at cursor A or the retained end. Missing results,
X and Z remain distinct. It adds no electrical LED load or guessed digit. See
[seven-segment-display.md](seven-segment-display.md).

## Independent analog studies

Parameter sweeps and seeded tolerance studies generate bounded independent
trial projects from an immutable analog schematic. Each trial gets fresh
simulation state and records its exact parameters, input deck, engine,
selected samples, metric and failures. The working schematic is not rewritten.
Stop retains finished trial evidence and marks unfinished work cancelled.

Metric arithmetic and seeded parameter generation are versioned and rechecked
when evidence is imported. This validates internal consistency, not a new
simulation or provenance authentication. Study records have independent history
bounds and use `analogExperiments` in the portable envelope. See
[analog-experiments.md](analog-experiments.md).

## Failure handling and input boundaries

Schema validation rejects invalid identifiers, dangling endpoints, oversized
lists and invalid value shapes. Electrical checks identify missing ground,
unconnected pins, invalid values, incompatible models and other actionable
issues. The imported SPICE language is allowlisted; file directives, shell
commands, arbitrary control scripts and model code are rejected.

The solver runs with a timeout and result-size bounds. Non-finite output,
missing results and explicit solver errors reject a run. Warning logs and
reported convergence assistance remain visible. No fallback demonstration
waveform is shown after failure. The editable project lives outside the worker
and survives an engine crash.

Adapter 3, introduced in 1.0.0-rc.2, keeps the worker bootstrap free of static
engine imports. It dynamically imports `engine/eecircuit-engine.js` inside its
error handler, fetches `engine/spice.wasm` once, checks its version-1 header and
expected length, and supplies the bytes directly to the initializer. Startup
rejection, timeout and worker errors retain the known loading phase and asset
URL. When a failed response can be inspected, its HTTP status and MIME type are
also retained in bounded run diagnostics and portable backups. An opaque worker
failure does not assert an unobserved WASM cause. Generic WASM MIME is accepted
through buffered compilation; JavaScript module MIME requirements still apply.

Adapter 4 adds a worker-ready protocol message before engine loading. If the
browser reports an opaque failure before that signal, the adapter terminates
the failed worker and performs a bounded reload request for the exact worker
URL. Its HTTP status, MIME, HTML detection and protocol marker help distinguish
a bad response from a browser execution restriction. A valid response leaves
the original cause explicitly unknown. Stop and timeout remain authoritative
during this diagnostic request.

Imported user text is escaped in UI/report markup. No user-supplied JavaScript,
remote model URL or application command is evaluated. Model card numeric
parameters are normalized by a restricted parser.

## Build and offline boundary

The build copies local source and public assets into `dist/`, placing the
executable modules, stylesheet and numerical engine under `assets/<VERSION>/`.
Their relative imports remain unchanged. The generated root HTML selects that
release directory, and the application registers a root-level
`sw-<VERSION>.js` through the document base URL. This prevents old browser/CDN
entries from supplying a different release's worker or module dependency.
The distribution manifest maps copied files to their source inputs so packaging
can verify both sets of bytes. Model cards remain in application source; the
worker never fetches a PDK or component card.

The service worker requests runtime assets with `cache: 'reload'`, then
validates the complete download against expected lengths, SHA-256 hashes and
required browser content types before writing a new cache. Missing digest
support refuses installation. Cache-write failure removes the incomplete new
cache; a prior build is retained until a verified update activates. Readiness
rechecks cached content, rather than only the presence of cache keys. Cache
names begin with `circuitbench:${scope}|`; activation removes older entries
only in that exact installation namespace.

The canonical generated HTML is embedded in the service worker. Root and
`index.html` cache responses are constructed from those bytes, verified against
their release hash, and never downloaded as HTML during installation. This
avoids Cloudflare analytics injection and explicit-filename redirects observed
on the user's host. All other runtime bytes retain their integrity checks.

The self-contained `repair/` directory entry and flat `repair.html`
compatibility file are excluded from precaching. Their explicit refresh action
unregisters only the application's exact directory scope and removes only that
scope's CircuitBench caches. A fresh recovery manifest enumerates safe relative
runtime paths; reload requests refresh their browser HTTP-cache entries and
check available byte/hash evidence. The root navigation is reloaded separately,
without expecting CDN-modified HTML to match the canonical shell. The page
never accesses project IndexedDB or localStorage. Results and partial errors
remain visible until an explicit Return action. On ordinary HTTP, the HTTP
refresh can still run; unavailable service-worker cleanup is reported honestly.

Offline installation requires HTTPS or localhost. Documentation and the
upstream source archive are distribution materials, not required compute
assets. Browser-storage eviction can remove cached files, so the prebuilt ZIP
and downloaded project backups remain useful independently of that cache.

## Reuse and reproducibility

The engine package is pinned by release version, npm SHA-512 integrity, package
gitHead and WASM SHA-256. The runtime vendoring script deterministically extracts
unchanged WASM and adapts packaging/error propagation. The upstream C-to-WASM
recipe uses a moving toolchain; byte-identical compiler reproduction is not
claimed. The source and notices are provided, and a replacement compiled engine
must receive a new identity and the numerical acceptance suite.

See `engine-evaluation.md` for the public EEcircuit schematic-dependency
availability finding, primary source links, numerical tolerances and exact
foundation results. Browser QA, visual review and packaged-route/offline tests
remain distinct evidence from numerical worker tests.

## Timing evidence, introduced in 1.3

The measurement core reads preserved resolved digital events, never waveform
pixels or interpolated analog values. It projects a selected bus bit explicitly,
validates the declared grid and source limits, and applies the versioned
`cb-event-timing-1` pairing contract. Work is bounded to 250,000 selected events
and 256 reported occurrences. This postprocessing is synchronous and creates no
additional simulation worker; it neither reruns nor changes the circuit.

A record copies the selected sparse traces and circuit snapshot, plus source
run timestamps, engine identity, input hashes and bridge assumptions. Removing
the source run does not remove its timing evidence. On import, arithmetic is
recomputed from those event streams and compared with the saved result. Any
retained full source run is also cross-checked. This verifies internal
consistency, not authorship or a new physical simulation. See
[timing-measurements.md](timing-measurements.md) and
[project-format.md](project-format.md).

Version 2.0 also accepts completed continuous windows with nonzero retained
time bounds. Their first state is never counted as a new edge. Independent
timing records copy `sourceRun.continuous`, including the live-input history,
so their meaning survives removal of the source window. Older 1.3 analysis
records normalize a missing solver choice to ngspice.
