# CircuitBench project format — schema 1

CircuitBench stores an electrical graph and a drawing in one versioned JSON project. The electrical graph is authoritative. Connections never come from inferred line intersections or from a separately maintained simulation circuit.

## Project object

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Integer `1`. Future schemas are rejected with a preservation message. This is the first released schema; no earlier schema migrations are claimed. |
| `appVersion` | Version that wrote the project. |
| `id`, `title`, `revision` | Stable project identity, display title, and monotonically increasing edit revision. |
| `createdAt`, `updatedAt` | ISO timestamps. |
| `question`, `notes`, `assumptions` | Investigation question, user interpretation, and stated assumptions. |
| `circuit` | Components, explicit connections, explicit junctions, and net labels. |
| `layout` | Component transforms, wire bends, junction positions, and drawing annotations. |
| `analysis` | The selected analysis, `solver` choice, numeric settings, temperature, relative tolerance, and initial-condition choice. |
| `probes` | Selected voltage, differential, branch-current and logic measurements. |
| `workspace` | `schematic` or `netlist`; imported SPICE does not reconstruct a drawing. |
| `netlistText` | Original editable SPICE input for the netlist workspace. |

The application backup envelope stores the project and its saved runs together as `{ project, runs, truthTables, timingMeasurements, analogExperiments }`; absent evidence arrays default to empty in older backups. A run contains its frozen project revision/snapshot, generated netlist or plan, model manifest, engine identification, analysis settings, measurements, diagnostics, status, and raw vectors. Run arrays, truth-table records, timing records and analog studies are separate from the editable electrical graph. A continuous session is saved inside an ordinary run as a completed retained-window snapshot, not as a resumable worker checkpoint. Opening an envelope through the core project parser selects its `project`; the application restores the accompanying evidence separately.

## Electrical graph

A component has `{id, ref, type, params, model}`. Its pins come from the versioned component definition. Stable pin addresses are `${componentId}:${pinId}`. A junction address is `j:${junctionId}`.

A connection has `{id, a, b}` where `a` and `b` are explicit pin or junction addresses. Multiple connections can share a pin. A junction has `{id}` in the electrical graph and a position in the drawing. A net label has `{id, name, target}`. Equal labels, compared without case, explicitly join their targets. A label `0` and every Ground symbol refer to node zero.

Example of a connection, without assuming its drawn path:

```json
{
  "id": "w_example",
  "a": "c_resistor:2",
  "b": "c_capacitor:1"
}
```

Its bends appear separately as `layout.wires.w_example.points`. A visual crossing does **not** join wires. Creating an explicit junction splits the intended connection(s) and attaches the new junction address. Moving, rotating, or mirroring a component changes only its drawing transform, so existing wires retain the same pin addresses.

Net names are derived on demand by union-find over connections, equal labels, and ground references. Ground is named `0`; labelled nets use a canonical label; unnamed nets receive deterministic `n1`, `n2`, and so forth for the current graph. Net names may change after graph edits. Persistent probes therefore refer to stable endpoint addresses, not generated net names.

## Drawing and editing

Component transforms contain `{x, y, rotation, mirror}`. Rotation is a multiple of 90 degrees. Coordinates are logical drawing units on a 20-unit snapping grid. Pin positions are derived by applying the transform to the component definition's pin coordinates.

Deletion removes dependent wires, labels, and probes so that dangling references cannot survive unnoticed. Copy/paste assigns new component and item identifiers and unique reference designators. Internal wiring is copied; external connections are not. Selected equal-name labels in a copied group receive one shared new label name to preserve their internal connectivity without shorting the copy to the original labelled net. Ground symbols remain global ground references by definition.

Undo/redo stores the entire editable project state. It restores electrical and visual state together. Each subsequent user change receives a new revision so that completed simulations can be marked outdated.

## Parameters and analyses

Parameters are human-readable strings with units defined by the part definition. Human entry uses SI case deliberately: `M` is mega, `m` is milli, `Meg` is also mega, and `u`/`µ` are micro. Explicit SI units are accepted, such as `10 kΩ`, `100 nF`, `20 us`, and `10 um`. Unit symbols retain SI case: `F` is farad while `f` is the femto prefix. Values become finite decimal scientific-notation numbers before entering ngspice. This avoids ambiguous SPICE suffix handling.

SPICE text import uses **SPICE** suffix conventions: `Meg` is mega, while `M` and `m` both mean milli. The importer normalizes these tokens and explains this difference in the user guide.

Analyses use `op`, `dc`, `ac`, or `tran`. The analysis object includes AC start/stop/points per decade, transient step/duration/UIC, DC source/start/stop/step, temperature in °C, and relative tolerance. Source excitation is separate: an AC small-signal amplitude is not the same setting as a transient sine amplitude.

Version 2.0 adds `analysis.solver: "ngspice" | "coordinated"`. Missing solver
fields in older schema-1 projects and historical timing analysis normalize to
`ngspice`. Coordinated execution requires a schematic and transient analysis;
its maximum step and UIC settings apply, while ngspice temperature/tolerance
settings do not. Continuous mode uses the same `tran` analysis and coordinated
plan rather than a new analysis type.

## Validation and limits

Imports are parsed as data, not executable JavaScript. The schema validator rejects unsupported versions, unknown component types, duplicate IDs/references, invalid geometry, missing endpoints, and malformed structural fields. Invalid numeric component values and missing models remain editable project data and produce actionable preflight errors before simulation.

The release bounds a schematic to 300 components, 1,600 connections, 600 junctions, 600 labels, 300 annotations, and 100 probes. JSON backups are limited to 256 MiB on import. The application limits retained result history separately and provides a visible notice when older unpinned runs are removed. Keep explicit downloadable backups for long-term archives.

Analog analysis preflight bounds AC to 20,000 points, DC to 20,000 intervals, transient duration/maximum-step to 200,000, and estimated data to 1.5 million samples. A practical vector budget is 240 nodes plus branch currents. Adaptive transient stepping can generate additional points, so the execution adapter also enforces timeout and returned-data limits. These are resource limits, not claims about circuit accuracy.

Native digital runs allow at most 255 scalar bit nets after alias expansion, 600 scalar source/gate/state elements, and 200,000 scheduled events. Clock/pattern/gate estimates are checked before execution, and the kernel enforces the event budget independently, including ADC-triggered events. Digital duration, periods, and delays must fit a safe integer count of picoseconds. Gate delays and clock high/low intervals are at least 1 ps. Pure digital output follows event times, so the analog maximum-step setting is not a digital sampling interval. Ngspice feed-forward mixed output combines native analog samples and event times and is limited to 250,000 rows, 256 vectors including time, and 2 million values. A bus word occupies one stored position; its width is independently limited to eight bits. Coordinated finite runs and continuous windows have the additional limits listed below.

The formatted native plan is limited to 220 kB, and generated simulation input to 240 kB. An oversized compilation yields an explicit failed-input record while retaining the complete editable project; it is not executed or stored as an oversized purported deck. DAC replay additionally bounds each generated waveform. Truth-table experiments enumerate at most eight selected binary input bits (256 rows) and 32 output signals, with one shared event budget and timeout. Portable backups retain at most four truth-table records separately from the 12 time/frequency-domain runs.

Autosave writes browser-local state. It never overwrites an imported file on disk. Downloading a project is an explicit portable backup operation. Browser storage and downloaded files serve different purposes.

## SPICE import boundary

The importer accepts the documented R/C/L/V/I/D/Q/M/S subset and the exact bundled `CB_OPAMP` subcircuit. Supported model cards are numeric D, NPN, PNP, level-1 NMOS/PMOS, and SW definitions. Generic bundled model names are reserved; a matching exported bundled definition is accepted, but an altered definition must use a different custom name.

Supported analyses are one `.op`, `.dc source start stop step`, `.ac dec points start stop`, or `.tran step stop [0 [maxstep]] [uic]`. Imported settings can initialize the experiment controls; those controls determine each subsequent run. Imported `.temp` and allowed numeric `.options` are superseded by the recorded experiment settings, with an explicit diagnostic. `.save all`, comments, and continuation lines are supported.

The subset rejects `.include`, `.lib`, `.control`/`.endc`, shell commands, `.param`, arbitrary behavioral sources, arbitrary subcircuits, external files, digital code models, manufacturer dialect extensions, Monte Carlo directives, `.step`, and arbitrary measurement commands. The application-level parameter/tolerance study feature generates independent supported trials; it does not extend this SPICE language subset. Native project JSON is the round-trip format for a full schematic. SPICE text is a separate netlist-oriented workspace and does not retain original drawing geometry.

## Primary references

- [ngspice official documentation](https://ngspice.sourceforge.io/docs.html) describes the underlying SPICE devices and analysis syntax.
- [ngspice shared-library interface](https://ngspice.sourceforge.io/shared.html) documents integration and callback concepts. CircuitBench's selected production path is the bundled WebAssembly adapter described in the architecture notes.
- Source of truth for this schema: `src/model.js`, `src/library.js`, `src/netlist.js`, `tests/core.test.mjs`, `tests/digital-model.test.mjs`, and `tests/bus-model.test.mjs`.

## Native digital schema (introduced in 1.1)

Existing analog schema-1 projects continue to load without changing their
connectivity or analysis. New component definitions add explicit pin domain
and direction metadata. Digital component types and `kind: "logic"` probes
are additive; older application versions do not understand those component
names and should not be used to open a new digital project.

The project does not serialize editable pin definitions, domains, or executable
logic. Pin rules come from the application's trusted library for each `type`.
The LUT introduced in 1.2 stores a complete bounded truth table as row data.
Existing analog pin IDs and model cards remain unchanged. Domain metadata
therefore cannot be overridden by an imported project to disguise an analog
pin as a digital pin. A component uses the same `{id, ref, type, params, model}`
shape for either domain, and all new parameters remain bounded strings.

The added types are `DIN`, `CLOCK`, `BUF`, `NOT`, `AND`, `OR`, `XOR`, `NAND`,
`NOR`, `XNOR`, `TRI`, `DFF`, `ADC`, and `DAC`. Their exact pin IDs, defaults,
state semantics, and model versions are listed in `component-models.md`.
`CLOCK.duty` is a percentage in project data; the compiled event plan uses a
fraction. There is no independently stored clock high-width parameter.

Net domains are derived after explicit wires, junctions, labels, and ground
are resolved. A net containing both analog and digital pins is invalid,
including a cross-domain equal-label alias or a digital connection to node 0.
An unattached junction has no domain until connected. Invalid domain joins
remain editable project data, but preflight blocks their execution. Pure
digital circuits require no ground. Required digital inputs need an explicit
driver; a `DIN` set to `X` or `Z` expresses intentional uncertainty or release.
Multiple drivers are permitted with a visible contention warning.

A logic probe uses `{id, kind: "logic", a: "componentId:pinId", b: null,
label}`. Its stable address must resolve to a digital net. Voltage and
differential probes require analog nets. Moving or duplicating parts never
changes a pin's domain. Deleting a part removes its dependent logic probes
using the same endpoint rules as analog probes.

Digital and mixed runs require `analysis.type: "tran"`. The ngspice/native
replay route requires `uic: false`; coordinated transient also supports stated
component initial conditions. Combinational digital feedback is rejected; a
DFF or register may provide explicit state. In the ngspice replay mode, the
analog dependency check rejects any path from a DAC output or reference to an
ADC input or reference, ignoring only common ground. Passive and controlled
device paths count conservatively. ADC inputs are ideal observers and never
provide a ground return. Independent analog input and output blocks may share
ground for feed-forward replay. Coordinated plans allow mixed feedback within
their R/C/L and independent-source analog subset.

### Compiled simulation records

`generateNetlist(project)` returns `simulation: null` for analog projects and
the standalone SPICE workspace. Native projects additionally return a pure
data simulation plan with `mode`, `duration`, `maxStep`, `digital`, `adcs`, and
`dacs`. `digital` contains constant/clock/pattern `sources`, ordered-input
scalar `gates`, word-state `sequential` records, canonical probes, bus bit
mappings, and constant input groups for truth-table enumeration. ADC records include differential input vectors,
thresholds and mode. DAC records include the input net, collision-safe analog
source name, voltage levels, edge times, and held initial voltage.

The plan is derived from the authoritative project for every run; it is not
another editable electrical graph. A ngspice replay plan's initial analog pass holds
each DAC at its configured low level while the independent ADC inputs are
sampled. The event result supplies all final DAC waveforms together. Unknown,
missing, partial, nonnumeric, unordered, or out-of-range replay overrides are
rejected, and an `X`/`Z` DAC input is never converted to an invented voltage.

Digital runs use transient analysis. Logic result vectors use
`{name, kind: "logic", unit: "logic", values: ["0", "1", "X", "Z", ...]}`.
Their arrays align with the strictly increasing numeric `time` vector.
These strings are validated and never accepted as ordinary voltages/currents.
The corresponding measurement has both `kind: "logic"` and `unit: "logic"`.

`result.digitalEvents` records change-only `{name, events: [{time, value}]}`
series, seeded at time zero for a bounded run or at the retained window start
for continuous evidence. `result.sampling` records the event-grid method,
right-continuous logic semantics, time resolution and analog interpolation.
For a ngspice mixed event union, `analogSampleIndices` identifies original analog
positions; the remaining analog values at added event times are interpolated.
`result.analogNetlists` retains each actual analog stage as bounded plain text.
The backup validator checks event ordering, literal states, sample provenance
indices and agreement between event records and sampled logic vectors.

The captured input for a pure digital project is clearly identified as a
native plan, not a SPICE deck. The mixed generated text is valid SPICE for one
analog pass, with an explicit marker that it is not the complete native
experiment. The importer rejects both forms with guidance to import the JSON
project. It also rejects native digital/bridge `CB_*` names in ordinary SPICE
model bindings. The full native project backup is the round-trip format;
simulation-plan exports and recorded analog stages are reproducibility
evidence. No arbitrary digital JavaScript, HDL or XSPICE code models are
accepted through SPICE import.

The coordinated compiler additionally produces a `kind: "coordinated-transient"`,
version-1 plan containing the bounded analog graph, incremental digital plan,
converter parameters, source controls, duration, maximum step and UIC choice.
Its engine identity identifies CircuitBench's original solver rather than
claiming an ngspice execution. Continuous runs retain `coordinatedPlan` and a
hash of the compiled plan. A generated analog deck alone cannot encode the
native feedback or event schedule.

## Bus additions in 1.2 (schema 1 retained)

The new component types are `BUSIN`, `PATTERN`, `SLICE`, `JOIN`, `REGISTER`,
`COUNTER`, `MUX`, `DECODER`, and `LUT`. Existing analog and scalar projects
continue to load without migration, with the same pins, electrical topology,
and parameter values. Older builds reject these unknown component types;
they cannot interpret a new bus project. The authoritative graph still uses
ordinary stable pin endpoints and whole-net connections.

`getPart(type)` supplies static library metadata. `getPins(component)` supplies
instance pins with trusted `width` values derived from bounded parameters.
Widths are 1–8; scalar control pins stay one bit. Pin identifiers and positions
are fixed across width changes. Dimension fields must be valid bounded integers
to define a project; word content, pattern timing, LUT completeness, and
electrical mismatches are checked before execution. Imported pin or connection
objects cannot override the part's width rule.

`buildNets()` adds `width` and `widthConflict` to each net. A loose junction
has no width until connected. Direct wires, equal labels, and junctions joining
different widths produce `NET_WIDTH_CONFLICT`; no truncation, extension, or
bit broadcast is inferred. `canConnect()` rejects such joins before an editor
connection. `setComponentParams(project,id,changes)` checks width changes
against the existing graph before mutation, including label aliases. A conflict
reports the component and connected net and leaves the old parameters intact.

`SLICE` and `JOIN` introduce explicit electrical bit aliases. `SLICE` maps
output bit i to input bit `lsb+i`; `JOIN` puts A in the lower bits and B in the
upper bits. Their ports are passive, with no timing delay or added driver.
`buildDigitalNets()` resolves these aliases with a second union-find over
individual bits. Driver checks, bit budgets, and combinational-cycle checks use
that expanded graph. Alias names never collide with named public scalar nets.

The compiler uses LSB-first arrays of scalar bit identities internally:

```js
digital.buses = [{
  name: "b(data)",
  width: 4,
  bits: ["bit0", "bit1", "bit2", "bit3"],
  bitOrder: "msb-first"
}];
```

Here `bits` is an internal mapping in least-significant-first order;
`bitOrder` describes the displayed/stored word. `digital.hiddenNodes` marks
private lowered bits, while explicit one-bit taps remain visible scalar
traces. Registers/counters have ordered bit ports and private state in
`digital.sequential`; they are not approximated by a delayed ripple network.
`digital.inputGroups` identifies constant DIN/BUSIN components and their
LSB-first `sources` for selected truth-table enumeration.

Project probes remain `kind: "logic"` on any digital endpoint. Generated
measurements derive their actual kind and width from the net. Wider results use
`{name, kind: "bus", unit: "logic", width: 2..8, bitOrder: "msb-first", values}`;
every value is an exact-width uppercase `[01XZ]` word. A width of one remains
the legacy scalar `kind: "logic"`. Bus events carry matching width/order
metadata and change-only words. No bus value is encoded as an analog number
or a decimal integer that would discard `X` and `Z`.

### Complete LUT rows and truth-table evidence

LUT parameters are `inputBits`, `outputBits`, `table`, and `delay`.
`parseTruthTable(text,inputBits,outputBits)` accepts every binary address
exactly once, in `input:output` rows separated by semicolons or newlines, and
returns output words ordered by address. `buildTruthTable(rows,...)` writes
the same complete canonical format. Input width is 1–4, output width is 1–8.
Missing/duplicate addresses, wildcards in input addresses, overflow, and
executable expressions are rejected. Unknown input *signals* are handled by
the event kernel's consensus over compatible binary rows.

`truthTables` in the backup is a bounded list of immutable completed experiment
records. Each captures a project snapshot/revision, compiled plan and hash,
selected input IDs/output names, engine identity, settling interval, and every
binary input combination with its measured output words. The schema checks
widths, states, row order/completeness, selections, and snapshot identity.
Restoring recorded evidence does not recompute or independently authenticate
its numerical result. A table describes settled combinational behavior;
transient hazards and stateful behavior remain time-domain experiments.

## Timing measurement additions in 1.3 (schema 1 retained)

`timingMeasurements` is an optional envelope array. Its absence in a prior
backup becomes an empty array; old numeric runs are not fabricated as timing
evidence. Each completed record contains:

| Field | Meaning |
|---|---|
| `id`, `kind`, `status` | Unique measurement ID, `timing`, and `completed`; individual rows may still lack a numeric result. |
| `projectId`, `revision`, `projectSnapshot` | Immutable captured circuit identity and validated project. |
| `sourceRunId`, `createdAt` | Original run ID and measurement timestamp. |
| `sourceRun` | Original analysis, run timestamps/status, engine identity, input hashes, sampling description, warnings and bridge assumptions. |
| `source` | Original run time bounds, declared 1 ps grid, and one or two complete selected sparse event streams with width/kind/bit order and captured labels. |
| `spec` | Kind, source and optional target, explicit bus-bit index, polarities and inclusive time window. |
| `result` | Versioned method, normalized specification, exact row endpoints/status/value, summary, pairing policy and warnings. |
| `importedFromBackup` | Optional restored-record marker. Source restoration status remains historical provenance. |

No sampled analog vectors or full time-domain run are duplicated into a timing
record. Each selected bus stream retains its original complete words so bit
selection can be checked. A retained full source run is cross-checked when
available, but it may be removed without making the measurement unreadable.
Imports recompute timing arithmetic from retained events and reject differing
values, summaries, selections or event metadata; this is not circuit
resimulation or a cryptographic authenticity claim.

Limits are 250,000 selected events per measurement and 256 reported rows. Up to
12 records, one million selected events and 16 MiB of serialized timing evidence
are retained. Adding a record removes oldest measurements until all bounds are
met, with a visible notice. A single oversized new record is rejected. These
bounds are separate from the existing four-million-sample run budget.

Timing CSV includes source/run identities, selectors, window, source/end times,
raw numerical units and row statuses; unavailable numbers are empty. Standalone
JSON uses `format: "CircuitBench timing evidence"`, `formatVersion: 1` and a
`measurement` field. Use the complete project backup to reopen the workbench;
the standalone evidence export is an inspection/interchange record. Older app
versions do not preserve this newly introduced evidence array.

## Coordinated, display and study additions in 2.0 (schema 1 retained)

### New component data

| Type | Stable port IDs | Parameters |
|---|---|---|
| `SEG7` | Digital input `in`, fixed width 8 | `active` (`high` or `low`) |
| `HEX7` | Digital `in` width 4, scalar `dp`, `out` width 8 | `mode` (`hex` or `bcd`), `active`, `delay` |
| `ADCBUS` | Analog `p`, `n`; digital output `q` | `width` 2–8, `vmin`, `vmax`, `period`, `delay` |
| `DACBUS` | Digital input `d`; analog `p`, `n` | `width` 2–8, `low`, `high`, `rise`, `fall`, `initial` |

Display model version is `cb-display-models-1.0.0`; converter model version is
`cb-converters-1.0.0`. Their manifests retain exact native definitions. The
segment word maps bits 0–7 to `a,b,c,d,e,f,g,dp`. Display readouts are derived
from recorded events and are not editable electrical state. The passive
display adds no driver; the separate decoder lowers to existing timed logic.

ADCBUS uses unsigned nearest-code quantization over a finite increasing voltage
range. Project settings require both its period and delay to be at least 1 ps,
with rounded delay strictly shorter than rounded period. DACBUS's startup word is fully known;
after its first known input, any X/Z stops conversion. See
[seven-segment-display.md](seven-segment-display.md) and
[multibit-converters.md](multibit-converters.md) for exact semantics.

### Coordinated results

Coordinated analog support is restricted to R/C/L and independent V/I sources
with the existing DC/SIN/PULSE/PWL excitation forms. No alternate model is
substituted for an unsupported device. Results identify the original
CircuitBench coordinated engine, backward-Euler integration and shared event
timeline. `sampling.mode` is `coordinated-events`, logic continuity is right
continuous, and `analogInterpolation` is `none`. Returned analog values are
accepted solver states; scalar ADC localization uses trial solves rather than
post-run interpolation of a ngspice waveform.

Finite runs join only chunks with the exact same shared boundary, matching
vectors and matching event metadata. They preserve the latest settled boundary
state and reject gaps or overlaps. Limits include 48 analog nodes, 80 matrix
unknowns, 160 analog elements, 256 vectors, 250,000 points and a combined
two-million dense-value/sparse-event budget. Each worker advance accepts at most
20,000 steps; one overall run watchdog covers all commands.

### Continuous window provenance

A saved continuous result is a completed run snapshot with
`sampling.mode: "continuous-window"`, `windowStart`, `windowEnd`,
`timeBounds: [windowStart, windowEnd]` and a 1 ps event resolution. Time values
are absolute. The first time may be nonzero; sparse logic events begin with a
boundary state at that exact first time. The boundary state is not an edge.
Every retained digital sample must agree with its sparse predecessor state.

`result.continuous` contains:

| Field | Meaning |
|---|---|
| `formatVersion` | `1` |
| `startedAtTime` | Original simulation origin, `0` |
| `windowStart`, `currentTime` | Exact retained first and last times |
| `totalPoints`, `droppedPoints` | Accepted history count and removed point count; their difference equals retained points |
| `inputChanges` | Ordered `{time, updates:[{id,value}]}` groups, retaining normalized literal logic words or finite DC source values |
| `stateRetained` | `true`, identifying continuity during execution; it does not serialize private numerical state |
| `sessionStatus` | `snapshot`, `stopped`, or `failed-after-window` |

Continuous output is bounded to 30,000 points, one million dense values,
250,000 sparse events and a 9,000 s absolute timeline. Input history contains
at most 2,000 groups of 1–64 updates. Each update must name an eligible DIN,
BUSIN or independent DC V/I source in the captured project, with matching word
width or a finite analog value. Its timestamp can precede the retained window
when it describes an earlier source change, but cannot exceed `currentTime`.

There is no top-level portable `continuousRun` execution object. Backups do not
contain a suspended worker or resumable capacitor/inductor/digital checkpoint.
Starting a new session initializes from the captured schematic. A failure after
an accepted interval can retain that completed window with a warning; failed
partial work is not appended. See [continuous-simulation.md](continuous-simulation.md).

### Independent timing evidence from windows

Version 2.0 timing sources permit `timeBounds: [start,end]` with nonzero `start`
only when valid continuous-window provenance accompanies the record.
`sourceRun.continuous` copies the same continuous metadata and input history,
independent of the full source run. The selected measurement window must lie
inside the retained bounds. Older normal runs continue to begin at zero, and
missing legacy solver fields normalize to ngspice. Timing import rechecks the
event arithmetic and continuous source/parameter identities without claiming
to resume or rerun a solver.

### Analog experiment evidence

`analogExperiments` is an optional envelope array of independent analog studies;
it defaults to empty for older files. Each `kind: "analog-experiment"` record
uses method `cb-analog-experiments-1` and captures the base project, study
specification, deterministic parameter sequence, per-trial input/settings,
engine and status, selected samples, metric arithmetic and summary. Failed or
cancelled trials remain explicit. The working project is not replaced with a
trial, and solver state does not carry between trials.

Parameter sweeps have 2–64 trials. Tolerance studies have 1–64 trials and 1–8
parameters, with a recorded unsigned 32-bit seed. One record is limited to
250,000 selected samples and 8 MiB; history retains at most six studies,
500,000 selected samples and 16 MiB. Import checks deterministic parameter
generation, generated input and metric/statistical consistency, not physical
resimulation. Standalone JSON uses the format string
`CircuitBench analog experiment evidence`, `formatVersion: 1` and an
`experiment` field. Full details and CSV
semantics are in [analog-experiments.md](analog-experiments.md).

Older applications do not understand the new parts, solver selection or
evidence arrays. Use a 2.0 backup as the editable round-trip record; exporting
only SPICE cannot preserve native digital feedback, display state, continuous
history or study evidence.
