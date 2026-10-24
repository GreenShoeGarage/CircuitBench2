# CircuitBench operating guide

## The workbench

CircuitBench follows one loop: **place → connect → configure → run → measure →
change → compare → save**. The center is the schematic. Components are on the
left, properties and experiment settings on the right, and measurements below.
The secondary panels collapse to make room for the circuit.

A new project is empty. Examples load only when requested. They are complete
working circuits with a question, expected behavior and suggested experiment.

## Your first minute: an RC filter

1. Choose **Examples → RC low-pass filter**.
2. Choose **Run experiment**. Wait for Completed. The upper plot is magnitude;
   the lower plot is phase.
3. Choose **Pin baseline** to retain this exact run.
4. Select C1, enter `200n`, and leave the input field to commit the change.
5. Run again. Keep **Overlay baseline** checked. The dashed earlier response
   belongs to 100 nF; the new 200 nF response has half the cutoff frequency.
6. Choose **Save backup**. Open that file with **Project → Open project** to
   confirm portability.

With R = 10 kΩ and C = 100 nF, `τ = RC = 1 ms` and `fc = 1/(2πRC) ≈ 159.15 Hz`.
See the included numerical validation record for the solver's measured values
and tolerances. Example explanations describe expected behavior; waveform data
always comes from the actual ngspice computation.

## Place and configure parts

Search the component drawer by name or category. Choose a part, then click the
grid. Placement remains active for additional parts; press Escape when done.
A selected part's inspector contains its reference, parameter values, physical
symbol position, rotate/mirror actions, model limitations and pin measurements.

Values accept scientific notation and engineering prefixes. Schematic entry
uses `M` for mega and `m` for milli. For example, `1M` is one million ohms,
`1m` is one milliohm, `100n` is 100 nF in a capacitor value field, and `10u` is
10 µH in an inductor value field. The unit label identifies the field's base
unit. Generated SPICE uses explicit scientific notation to remove ambiguity.
Imported SPICE follows its own convention: **both M and m mean milli; Meg means
mega**.

For sources, the DC setting controls the operating point, AC amplitude and
phase control small-signal analysis, and the selected waveform controls
transient excitation. These settings have distinct purposes. PWL uses
semicolon-separated time,value pairs, such as `0,0; 1m,1; 2m,0`.

## Connect the actual circuit

Select **Wire**, click a pin, optionally click empty grid positions for bends,
then click the destination pin. A visible snap ring confirms the endpoint.
An unfinished wire is provisional; Escape cancels it.

Geometry does not create electrical connections. Crossing wires remain
separate until an explicit junction joins them. Choose **Junction** and click a
wire crossing to connect the lines through the new dot. Clicking an existing
wire while routing intentionally creates a junction on that wire.

Equal net labels also join nets electrically. Ground symbols all refer to
SPICE node 0. Missing ground, open pins, conflicting labels and invalid model
bindings produce diagnostics before simulation.

Move, rotate or mirror connected parts freely: wires retain their pin identity
and endpoint positions are recomputed. This does not silently reconnect a pin
to another nearby wire. Routing is simple and editable rather than an automatic
wire-layout optimizer.

To edit a wire, select it. Square handles identify bends; drag them, or Tab to a
handle and use the arrow keys. Double-click a selected wire to add a bend.
Delete on a focused bend removes that bend. Select a wire and delete it to
remove the whole electrical connection.

Shift-click extends selection. A drag on empty space in Select mode creates a
selection box. Copy/paste and duplicate create fresh component identifiers and
preserve wiring within the copied selection. They do not silently attach the
copy to the originals' external wires.

Use **Note** for annotations. Labels and notes can be edited by double-clicking
or focusing them and pressing Enter. Undo/redo restores the whole electrical
and visual edit, not just a drawn shape. A completed drag is one undo step.

## Configure the experiment

| Analysis | Typical use | Main settings |
|---|---|---|
| Steady state / DC operating point | Settled bias voltages and supported currents | Source DC values; temperature in Advanced |
| Sweep an input / DC sweep | Output versus one independent source | Source reference, start, stop, step |
| Frequency response / AC | Filter response and small-signal behavior | Start/stop frequency, points per decade; source AC amplitude |
| Behavior over time / transient | Charge/discharge, waveforms and switching | Duration, maximum time step; source waveform |

AC analysis linearizes around the DC operating point. A 1 V AC source makes
output dBV numerically equal voltage gain in dB for that input. The graph is
not automatically a transfer-function division by an arbitrary input source.

Advanced exposes temperature, relative tolerance and transient initial-condition
mode. It uses the same electrical model and ngspice solver as Easy mode.
Capacitor voltage and inductor current initial conditions are applied when
transient UIC is enabled. The example RC/RL step experiments select that mode
explicitly. Tolerance and initial conditions are captured in the run snapshot.

**Run experiment** starts a fresh bounded simulation. Editing while it runs
changes the working project but not the captured run input. **Stop** terminates
the underlying worker. The UI's 30-second watchdog also terminates long jobs.
Every subsequent run receives a fresh solver instance.

## Probe and read results

Click a pin or use Probe mode to request its voltage. In Probe mode, Shift-click
a second endpoint for the first voltage minus the second. The inspector's
**Connect pins by name** section also offers a keyboard-accessible A − B
measurement. The list of selected probes is saved with the project.

Supported current measurements are voltage-source branch current, inductor
branch current, and resistor current derived from the simulated terminal
voltage difference divided by resistance. Directions are shown with the
measurement. A supplying voltage source usually reports negative current into
its positive terminal. Other device currents are not exposed as curated branch
instruments in this release.

Waveforms supports multiple traces. Choose the vertical unit to display volts
or amperes consistently. AC has magnitude in dBV/dBA and phase in degrees.
Wheel zooms the horizontal range; **Click → Pan** enables drag panning;
**Reset view** restores the full range. Choose Cursor A or B, then click; or
Shift-click for B. Readouts snap to stored numerical samples and show x/value
differences. Raw arrays are preserved independently of display simplification.

**Values** provides a numeric view. **Netlist & diagnostics** shows the exact
captured input, warnings, model identities, hashes and engine log. A run can be
Running, Completed, Completed with warnings, Cancelled, Timed out or Failed.
An additional Outdated indicator means the working revision has since changed.
A warning is not silently discarded or turned into a clean result.

## Keep and compare runs

Choose **Pin baseline** on a completed run, change a parameter and run again.
The baseline remains associated with its original circuit snapshot. Compatible
named signals in the same analysis type appear as dashed overlays.

Run history lets you select, name and remove recorded runs. Up to twelve run
records are retained, with a pinned baseline protected from ordinary oldest-run
trimming. Download important evidence before removing it. Large numerical
exports are subject to the documented project/import size bounds.

## Projects, recovery and reports

Autosave displays Unsaved → Saving → Saved locally. It stores the working
project and retained run history in IndexedDB. Refresh reopens that state. A run
interrupted by closing the page is marked incomplete rather than completed.
**Recover previous autosave** retrieves the immediately preceding stored
snapshot; it is not an unlimited history of every past session.

**Save backup** downloads a portable `.circuitbench.json` file. Autosave never
writes over an imported disk file. **New empty project** starts without sample
content. **Duplicate project** creates a new project identity and starts a new
run history. Loading an example or another project asks before replacing
nonempty working content.

Available outputs:

| Output | Contents |
|---|---|
| Project JSON | Electrical model, layout, analysis settings, probes and retained run evidence |
| SPICE `.cir` | Generated deck with explicit models, options and selected analysis |
| Schematic SVG | Independent vector drawing with values and local styles |
| Component CSV | References, types, parameters and model classification |
| Results CSV | Full stored samples; real and imaginary values for AC |
| Analysis HTML / PDF | Designed report containing circuit, question, measurements, assumptions, interpretation, settings, provenance, warnings and exact netlist |

Choose **Report / PDF** to preview the designed report. Download its
self-contained HTML or use **Print / save PDF** and your browser's PDF printer.
The circuit and numerical evidence belong to the selected run snapshot.
For a run from the current project, the report includes the interpretation
notes present when the report is generated, with an explicit caption. This lets
you write a conclusion after measuring the result. The numerical evidence,
circuit, analysis settings and assumptions remain those of the immutable run
snapshot. Rerun if the changed circuit or settings should supply new evidence.
The candidate's verified report preview and remaining download/print checks are
listed in [release validation](VALIDATION.md).

## SPICE input workspace

Use **Project → Import SPICE netlist** for the documented analog subset. Import
creates a text-oriented workspace; it does not reconstruct a schematic. The
imported analysis initializes the experiment settings. Subsequent settings in
the inspector determine each run; imported analysis and permitted solver-option
lines are replaced with the explicitly recorded application settings.

Missing models and unsupported directives produce useful diagnostics before
replacing your working project. See [compatibility](compatibility.md) for syntax,
allowed model parameters, exclusions and limits.

## Keyboard and responsive use

| Shortcut | Action |
|---|---|
| 1 / 2 / 3 / 4 | Select / Wire / Pan / Probe |
| Escape | Cancel the active interaction |
| R / M in schematic | Rotate / mirror selection |
| F in schematic | Fit the circuit |
| Arrow keys in schematic | Move selected objects; otherwise pan |
| Shift + arrow | Larger move |
| Ctrl/Cmd+C, V, D | Copy, paste, duplicate selected schematic objects |
| Delete / Backspace | Delete selected object or focused wire bend |
| Ctrl/Cmd+Z / Shift+Z | Undo / redo |
| Ctrl/Cmd+Enter | Run experiment |
| Ctrl/Cmd+S | Save downloadable backup |
| ? | Contextual operating guide |

Tab reaches controls, circuit objects and pins. Enter places a selected drawer
part at the view center or activates a focused electrical endpoint. The
inspector supplies numeric position fields and connection choices when precise
pointer placement is inconvenient. Shortcuts do not replace normal text entry
inside value and note fields.

Desktop is the primary authoring environment. On narrow screens, collapse the
parts drawer and use the inspector to view/change values, choose analyses, run
and inspect results. Touch-device ergonomics beyond the recorded browser tests
remain subject to actual-device validation. Themes are available in the header;
focus indicators and text accompany status colors.
