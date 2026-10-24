# Architecture and authoritative data

## Decision

CircuitBench is a buildless-source browser application packaged as a prebuilt
static directory. Its modules use standard browser APIs: SVG for the editor and
plots, IndexedDB for projects, Web Workers for numerical isolation and a service
worker for installed offline use. No frontend framework or numerical solver was
introduced. The required numerical engine is pinned EEcircuit-engine 1.8.0 /
ngspice 45.2 WebAssembly.

The application keeps one production execution path. A native ngspice binary is
a development reference, not a runtime dependency. `engine.js` provides a small
replaceable facade rather than a general compute platform.

## One electrical authority

| Module | Responsibility |
|---|---|
| `library.js` | Pin definitions, parameters and units, engineering-value parsing, explicit generic models and provenance |
| `model.js` | Schema validation, IDs, components, connections, electrical net construction, checks, copy/delete semantics |
| `editor.js`, `symbols.js` | Interaction and SVG rendering from the model, with separate drawing geometry |
| `netlist.js` | Canonical deck generation and allowlisted SPICE import |
| `engine.js`, `engine-worker.js` | Worker lifecycle, actual solver execution, normalized real/complex results and diagnostics |
| `plots.js` | Derived measurements, view simplification, plots, cursors and numerical CSV |
| `storage.js` | IndexedDB autosave/recovery, envelope validation, local preferences and downloads |
| `reports.js` | Designed reports derived from recorded project/run evidence |
| `app.js` | One project state, revision history, visible controls and integration |

Schema 1 separates `circuit` from `layout`. Components have stable IDs and pin
names. Connections reference endpoints such as `componentId:pinId`; junctions
have their own endpoint IDs. Labels intentionally unify equal named nets.
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
transaction. An envelope has `project`, retained `runs`, active-run ID and
baseline ID. Downloads are explicit; no filesystem handle is retained for a
file imported from disk. UI preferences use localStorage and can fail without
preventing work. Save failure is visible and downloadable backups remain the
recovery route.

This is a single active local workbench, not a multiuser database. Independent
browsers/devices do not synchronize. Two paths under the same origin share the
same first-version IndexedDB name. Use exported projects to transfer work.

## Immutable run evidence

Before numerical execution, the app captures the project revision, project
snapshot, generated deck, model definitions/versions/hashes, selected
measurements, settings and engine identity. Once completed, raw result arrays,
status, timing and logs are attached to that record. Later project changes do
not rewrite that evidence. The UI separately labels results from older working
revisions.

A fresh module Worker creates its own WASM instance and virtual filesystem. The
main interface remains independent. Success, Stop, timeout and failure terminate
the worker, releasing engine state. Subsequent runs do not carry capacitor or
inductor state. Each job reinitializes from its recorded circuit and analysis.

Raw complex AC values remain real/imaginary arrays. Bode magnitude and phase,
differential voltages and resistor currents are deterministic postprocessing
of those samples, not replacement circuit calculations. Plot decimation affects
only SVG drawing. Exports preserve numerical sample arrays.

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

Imported user text is escaped in UI/report markup. No user-supplied JavaScript,
remote model URL or application command is evaluated. Model card numeric
parameters are normalized by a restricted parser.

## Build and offline boundary

The build copies local source and public assets into `dist/`, creates the
versioned service-worker asset list and packages exactly that output. All core
paths are relative so a subdirectory deployment does not need a rewritten API
or asset base URL. Model cards are part of the application source; the worker
never fetches a PDK or component card.

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
