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
| `analysis` | The selected analysis and its numeric settings, temperature, relative tolerance, and initial-condition choice. |
| `probes` | Selected node, differential, and supported branch-current measurements. |
| `workspace` | `schematic` or `netlist`; imported SPICE does not reconstruct a drawing. |
| `netlistText` | Original editable SPICE input for the netlist workspace. |

The application backup envelope stores the project and its saved runs together as `{ project, runs }`. A run contains its frozen project revision/snapshot, generated netlist, model manifest, engine identification, analysis settings, measurements, diagnostics, status, and raw vectors. Run arrays are separate from the editable electrical graph. Opening an envelope through the core project parser selects its `project`; the application restores the accompanying run history separately.

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

## Validation and limits

Imports are parsed as data, not executable JavaScript. The schema validator rejects unsupported versions, unknown component types, duplicate IDs/references, invalid geometry, missing endpoints, and malformed structural fields. Invalid numeric component values and missing models remain editable project data and produce actionable preflight errors before simulation.

The release bounds a schematic to 300 components, 1,600 connections, 600 junctions, 600 labels, 300 annotations, and 100 probes. JSON backups are limited to 256 MiB on import. The application limits retained result history separately and provides a visible notice when older unpinned runs are removed. Keep explicit downloadable backups for long-term archives.

Analysis preflight bounds AC to 20,000 points, DC to 20,000 intervals, transient duration/maximum-step to 200,000, and estimated data to 1.5 million samples. A practical vector budget is 240 nodes plus branch currents. Adaptive transient stepping can generate additional points, so the execution adapter also enforces timeout and returned-data limits. These are resource limits, not claims about circuit accuracy.

Autosave writes browser-local state. It never overwrites an imported file on disk. Downloading a project is an explicit portable backup operation. Browser storage and downloaded files serve different purposes.

## SPICE import boundary

The importer accepts the documented R/C/L/V/I/D/Q/M/S subset and the exact bundled `CB_OPAMP` subcircuit. Supported model cards are numeric D, NPN, PNP, level-1 NMOS/PMOS, and SW definitions. Generic bundled model names are reserved; a matching exported bundled definition is accepted, but an altered definition must use a different custom name.

Supported analyses are one `.op`, `.dc source start stop step`, `.ac dec points start stop`, or `.tran step stop [0 [maxstep]] [uic]`. Imported settings can initialize the experiment controls; those controls determine each subsequent run. Imported `.temp` and allowed numeric `.options` are superseded by the recorded experiment settings, with an explicit diagnostic. `.save all`, comments, and continuation lines are supported.

The subset rejects `.include`, `.lib`, `.control`/`.endc`, shell commands, `.param`, arbitrary behavioral sources, arbitrary subcircuits, external files, digital code models, manufacturer dialect extensions, Monte Carlo, `.step`, and arbitrary measurement commands. Native project JSON is the round-trip format for a full schematic. SPICE text is a separate netlist-oriented workspace and does not retain original drawing geometry.

## Primary references

- [ngspice official documentation](https://ngspice.sourceforge.io/docs.html) describes the underlying SPICE devices and analysis syntax.
- [ngspice shared-library interface](https://ngspice.sourceforge.io/shared.html) documents integration and callback concepts. CircuitBench's selected production path is the bundled WebAssembly adapter described in the architecture notes.
- Source of truth for this schema: `src/model.js`, `src/library.js`, `src/netlist.js`, and `tests/core.test.mjs`.
