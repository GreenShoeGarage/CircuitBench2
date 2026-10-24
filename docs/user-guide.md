# CircuitBench operating guide

CircuitBench 2.0 combines analog, four-state digital, feed-forward and
coordinated mixed-signal experiments in one workbench. Digital parts include
1–8-bit buses, timed patterns, registers, counters, logic tables and a working
seven-segment display. Coordinated transient adds analog/digital feedback and
2–8-bit converters; continuous mode keeps circuit state through updates and
pauses. Analog sweeps and seeded tolerance studies capture independent trial
evidence. Saved timing measurements quantify digital edges, including a
completed continuous window. Start with an example, then see
[the digital/mixed guide](digital-mixed-signal.md) for timing, bridge thresholds
and supported circuit boundaries. The instructions below describe the current
UI; recorded browser checks and remaining verification work belong in
[release validation](VALIDATION.md).

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
for this analog experiment comes from the actual ngspice computation. Digital
logic is computed by CircuitBench's separate four-state event engine.

## Place and configure parts

Search the component drawer by name or category. Choose a part, then click the
grid. Placement remains active for additional parts; press Escape when done.
A selected part's inspector contains its reference, parameter values, physical
symbol position, rotate/mirror actions, model limitations and pin measurements.
Ordinary field edits commit when the field changes, such as when you leave it.
The circuit revision and autosave status then update. Structurally invalid
edits and conflicting width changes report the reason and preserve the previous
working project. Other invalid simulation values can remain editable and are
reported by the circuit diagnostics before a run. **Saved locally** confirms
persistence, not a passed simulation check. An edit does not rerun an existing
experiment or alter its saved evidence.

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
wire crossing to connect compatible lines through the new junction. Clicking
an existing wire while routing intentionally creates a junction on that wire.
Analog and digital domains must agree, as must digital widths. A rejected
destination leaves the provisional wire available so you can choose another
endpoint.

Equal net labels also join nets electrically and must have compatible domains
and widths. Ground symbols all refer to analog SPICE node 0; a purely digital
circuit does not need analog ground. Missing analog ground, open pins,
conflicting labels, width conflicts and invalid model bindings produce
diagnostics before simulation.

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

## Work with digital words and buses

Digital states are `0` (low), `1` (high), `X` (unknown or conflicting drivers)
and `Z` (high impedance). A word contains **1–8 bits**. It is written
**most-significant bit first**: bit 0 is the rightmost, least-significant bit.
For example, the four-bit word `1010` has bit 3 = 1 and bit 0 = 0.

Bus pins show their bit range, such as `[3:0]`, and bus wires are heavier with a
width marker where there is room. Every connected port must have the same
width. An ordinary wire or equal-name label never truncates a word, adds bits
or broadcasts a scalar to a bus. Changing a connected part's width is rejected
if the other ports would conflict. Disconnect or explicitly resize the
connected parts before making that change; existing pin identities remain
stable.

### Enter a word

The word field's configured width determines the accepted value:

| Entry for a four-bit field | Resulting logic word | Meaning |
|---|---|---|
| `0010` | `0010` | An exact-width literal; leading zeros matter |
| `10XZ` | `10XZ` | A literal with an unknown and a released bit |
| `0b10` | `0010` | Known binary number, padded on the left |
| `0xA` | `1010` | Known hexadecimal number |
| `0d10` | `1010` | Known decimal number |

An unprefixed literal must contain exactly the configured number of `0`, `1`,
`X` or `Z` characters. Bare `10` is a two-bit binary word, not decimal ten;
it is too short for a four-bit literal. Prefixed numbers must be unsigned and
fit the chosen width. Numeric forms cannot include X or Z. Register and Counter
initial words may contain X but cannot contain Z.

### Select, combine and drive bits

**Slice** selects a field from a bus. Set its input width, first bit (`lsb`) and
count. Output bit 0 is the input's first selected bit. For input `1101`, first
bit 1 and count 2 produce `10`. Set count to 1 and add a scalar probe to inspect
one bit as a stepped timing lane.

**Join** combines two fields: **A supplies the low bits and B the high bits**.
For A = `01` and B = `10`, the output is `1001`. Set each input width; their sum
must be at most eight. Slice and Join are passive bit aliases, so they preserve
Z and resolve competing drivers on each bit. They do not add a propagation
delay or convert voltage to logic. Analog connections require explicit
scalar ADC/DAC bridges or the coordinated multibit converter parts.

**Bus input** supplies a constant word. **Digital pattern** supplies successive
words using `time,word` pairs separated by semicolons or newlines, for example
`0,0000; 1m,0001; 2m,10XZ`. Supply the first state at time 0; times must increase
strictly on the 1 ps event grid. Up to 200 pairs are accepted. Set Repeat to 0
for a one-shot sequence, or to a period later than the last event.

**Bus register** samples its data word on a rising clock edge when enable is high.
**Binary counter** increments on an enabled rising edge. Their active-high reset is
synchronous, clears to zero and takes priority over enable. Configure the
initial word and output delay in the inspector. Clock, enable, reset and mux
select are scalar control pins even when the data ports are buses. A
**Multiplexer** chooses A for select 0 and B for select 1. A **Decoder** accepts
1–3 input bits and produces the corresponding 2–8 bit one-hot output when
enabled. The inspector states each part's ambiguity and delay assumptions.

### Edit a Truth-table logic (LUT) component

A LUT is a configurable combinational part with **1–4 input bits** and
**1–8 output bits**. It supplies every binary input row, from all zeros to all
ones; it is not a code or expression editor.

1. Select the **Truth-table logic (LUT)** component and choose **Edit truth table…**.
2. Choose Input bits and Output bits. Enter an exact-width output word or a
   known `0b`, `0x` or `0d` value for each row. Literal outputs may include X/Z.
3. Review all rows after changing either dimension. Resizing retains the
   lowest-address rows and the least-significant output bits, adds zero bits
   when widening and initializes new rows to zero. Invalid row values must be
   corrected before resizing; an error keeps the existing draft and dimensions.
4. Choose **Apply truth table**. All row values, dimensions and connected pin
   widths are validated before the circuit changes. An error leaves the dialog
   available for correction. **Cancel** discards the draft.

Applying creates one undoable circuit edit and schedules autosave. Run again
to compute new timing results, or use the experiment-level Truth table workflow
below to enumerate the surrounding combinational circuit.

If an imported LUT contains malformed or incomplete rows, **Edit truth table…**
opens a repair dialog that retains the original saved text. Correct the table
text and choose **Continue to row editor**, or choose **Reset local draft to
zeros** to prepare a fresh draft. Neither action changes the project. Only
**Apply truth table** in the row editor commits the repair; **Cancel** in either
dialog preserves the original component.

## Configure the experiment

| Analysis | Typical use | Main settings |
|---|---|---|
| Steady state / DC operating point | Settled bias voltages and supported currents | Source DC values; temperature in Advanced |
| Sweep an input / DC sweep | Output versus one independent source | Source reference, start, stop, step |
| Frequency response / AC | Filter response and small-signal behavior | Start/stop frequency, points per decade; source AC amplitude |
| Behavior over time / transient | Analog waveforms, digital timing and mixed-signal switching | Duration; analog maximum time step; source waveforms, clocks, patterns and component delays |

AC analysis linearizes around the DC operating point. A 1 V AC source makes
output dBV numerically equal voltage gain in dB for that input. The graph is
not automatically a transfer-function division by an arbitrary input source.

Digital and mixed-signal timing use transient analysis. Digital times are
quantized to 1 ps and use component transport delays. The analog maximum time
step does not set the digital event resolution.

Advanced exposes analog temperature, relative tolerance and transient
initial-condition mode. With ngspice selected, Easy and Advanced use the same
electrical model and solver; temperature and relative tolerance do not change
a purely digital event run. Coordinated transient instead exposes its maximum
step and initial conditions. Ngspice tolerance and temperature settings do not
apply to that solver.
Capacitor voltage and inductor current initial conditions are applied when
transient UIC is enabled. The example RC/RL step experiments select that mode
explicitly. Tolerance and initial conditions are captured in the run snapshot.

For a transient schematic, select its **Transient engine** deliberately:

| Selection | Supported work |
|---|---|
| **ngspice · analog / feed-forward mixed** | Full curated analog library; native digital events; scalar ADC/DAC replay with independent analog input/output paths |
| **Coordinated · analog/digital feedback** | R/C/L and independent V/I sources, digital parts, scalar bridges and multibit converters on one causal timeline; closed loops and continuous state |

Ngspice mixed replay requires normal startup and rejects a DAC-to-ADC analog
feedback path. Coordinated transient also supports stated component initial
conditions. Its analog subset does not include diode/LED, transistor, switch or
op-amp models. Unsupported parts fail with a diagnostic rather than receiving
a substitute model. Reduce the coordinated maximum step and compare results
to assess numerical convergence; the 1 ps digital grid is not analog accuracy.

**Run experiment** starts a fresh bounded simulation. Editing while it runs
changes the working project but not the captured run input. **Stop** terminates
the underlying worker. The UI's 30-second watchdog also terminates long jobs.
Every subsequent run receives fresh workers for its required computation
stages; registers and counters start from their configured initial state.

### Use a working seven-segment display

Open **Examples → Hex counter with a working seven-segment display**, then
**Run experiment**. The counter drives a `HEX7` decoder and the decoder drives
a separate `SEG7` part. Cursor A selects the recorded display time; with no
cursor it shows the final recorded state. The same display updates during a
continuous session and appears in the inspector's display readouts.

`SEG7` has one eight-bit input. Bits 0–6 are `a,b,c,d,e,f,g`; bit 7 is the
decimal point. `HEX7` accepts a four-bit code and a separate scalar decimal
point input, with hexadecimal or BCD mode. Set matching **active-high** or
**active-low** behavior on decoder and display. BCD values 10–15 blank the
numeral; hexadecimal shows `0–9, A, b, C, d, E, F`.

The display is an indicator of simulated bits, without an electrical LED or
brightness model. X is marked as unknown and Z as high impedance; an absent or
outdated run leaves a neutral display. **Seven-segment patterns, decimal point,
X and Z** demonstrates these states. See [seven-segment-display.md](seven-segment-display.md)
for the exact mapping and direct segment wiring.

### Run a closed-loop or multibit experiment

Open **Closed-loop Schmitt RC oscillator** to exercise a capacitor whose voltage
controls the logic that charges it. The scalar Schmitt ADC, inverter and DAC
return to the same RC network. The example selects coordinated transient. Run
once, inspect its thresholds and measure a digital period, then halve
**Maximum time step** and compare the result.

Open **Multibit ADC, DAC and seven-segment readout** to inspect a four-bit
sampled ramp. The sampled ADC maps its differential input to the nearest
unsigned code, clips outside its voltage range and publishes after conversion
delay. The DAC maps that whole word back to voltage with finite rise/fall
times. Its explicit startup code lasts until the first known word; later X/Z
stops conversion with a diagnostic. ADC period and conversion delay must each
be at least 1 ps, with delay shorter than period.

**Sampled 4-bit feedback controller and display** combines both converters,
an RC network, a LUT controller and the display in a closed loop. Changing
sample period, conversion delay or analog step affects different aspects of
that model. The [multibit converter guide](multibit-converters.md) gives exact
port names, equations, startup rules and limitations.

### Continue, pause and change live inputs

1. Open **Continuous RC with live input changes** or another supported
   coordinated schematic and choose **Continuous…**.
2. Set **Time per screen update (s)** and **Recent history window (s)**, then
   **Start continuous simulation**. The window must be at least one positive
   update interval. Starting continuous mode selects coordinated transient.
3. Use **Pause** to finish the current bounded update and retain numerical
   state. **Step** advances one bounded update while staying paused;
   **Resume** continues the same worker and absolute simulation time.
4. Use **Live inputs…** → **Apply inputs** to change DIN/BUSIN values or an
   independent DC voltage/current source. Changes take effect at a completed
   solver boundary and are recorded with their simulation times. The original
   schematic remains the starting configuration.
5. Use **Stop & keep results** to end the worker and inspect the final retained
   window. A new session initializes again; it does not resume a stopped one.

Capacitor voltage, inductor current, clock phase, private digital state and
pending events persist across updates and pauses. Circuit edits stop the
session. Update intervals describe simulated time; wall-clock speed depends on
the solver and browser. This mode is not synchronized to a hardware clock.

Continuous history retains at most **30,000 points**, **one million dense
values** and **250,000 sparse events**. The oldest complete intervals are
removed when the time or memory bound is reached. Times stay absolute, so the
visible window may begin after zero. The maximum timeline is **9,000 s**;
there are at most **2,000 live-input groups**. Saving captures the latest
completed window and its provenance, not a resumable solver checkpoint. See
[continuous-simulation.md](continuous-simulation.md) for limits and recovery.

### Compare analog parameter and tolerance trials

Choose **Analog experiments…** on an analog-only schematic. A prior run is
optional. Select a **Parameter sweep** for one parameter or a **Tolerance
study · Monte Carlo** for 1–8 eligible numeric parameters. Choose the output
signal, metric and applicable time/frequency interval, then **Run study**.

A sweep has 2–64 linearly or logarithmically spaced trials. A tolerance study
has 1–64 trials with independent uniform relative variation and a recorded
unsigned 32-bit seed. Eligible choices include R/C/L values and initial
conditions, numeric independent-source settings and MOS dimensions. Each trial
starts independently; the current circuit is not rewritten. **Stop study**
keeps completed trials and records unfinished work as cancelled.

Results include exact trial values, warnings/failures, numerical metrics and
summary statistics. Use **Download CSV** for the trial table, **Download
evidence JSON** for the full record, or **Save backup** to reopen studies in the
workbench. Up to six studies are retained within separate sample and byte
budgets. See [analog-experiments.md](analog-experiments.md) for metric formulas,
supported analyses, reproducible seeds and history limits.

### Enumerate an experiment truth table

The experiment's **Truth table** button computes the settled behavior of the
current combinational circuit. This is separate from defining a LUT component's
rows. Start with a purely digital circuit driven by **Logic input** or
**Bus input** constants, and correct any circuit diagnostics first.

1. Choose **Truth table**. Under **Inputs to vary**, select the constant input
   components to enumerate. Selecting a bus varies its whole word: all of that
   bus's bits count toward the limit of **1–8 selected input bits**. Other
   constant inputs keep their configured values.
2. Under **Outputs to inspect**, select **1–32 output columns**. One bus is one
   output column, with its width shown. Existing probes help choose the initial
   output selection.
3. Review the displayed row count, then choose **Generate truth table**. The
   table contains every binary combination: `2^N` rows for N selected bits,
   up to **256 rows**. The button stays disabled for an invalid selection.
4. Read the exact input and output words, warnings, settling interval and engine
   identity. Each row starts independently and is allowed to settle. Choose
   **Stop** to cancel generation, including while the execution-plan hash is
   being prepared before the digital worker starts. A failed or stopped
   operation is not saved as a completed table.

Clocks, timed patterns, D flip-flops, registers, counters, ADC/DAC bridges and
analog or mixed-signal circuits cannot use this enumeration workflow. Use a
transient run for these parts and for propagation delays or hazards between
changing input combinations. A settled truth table does not describe those
timing effects.

Each completed table is an immutable record of the captured circuit revision,
execution plan and hash, selected columns, literal results, warnings and engine
identity. Editing the circuit does not recompute it. Open **Truth table → Saved
truth tables** to revisit retained records; a notice identifies a table from a
changed working revision. Tables restored from a backup are labeled as restored
evidence and are not independently recomputed during import.

The latest **four** completed table records are kept in autosave and project
backups. Generating a fifth removes the oldest with a status notice. Choose
**Download table CSV** for the literal row data, or **Download table evidence**
for the complete JSON record, including its circuit snapshot and plan. Retain
a project backup to reopen those tables in the workbench. Table evidence is a
separate export, not a transient run or a waveform baseline.

### Recover an engine loading failure

**Netlist & diagnostics** retains the loading stage and requested
file. When the browser permits response inspection, it also shows the HTTP
status and content type. A missing file, HTML page returned instead of WASM,
and incorrect JavaScript MIME are different problems; use the recorded detail
to check the deployment.

1. Upload all extracted files from the **deploy ZIP**, preserving its folders.
   Confirm both ngspice engine files are under `assets/2.0.0-rc.1/engine/`
   and all versioned JavaScript modules, including the coordinated worker,
   are present.
   For a source checkout, build it and serve `dist/`; the source root is not a
   deployable installation.
2. If an older cached version remains, use **refresh cached application files**
   in the loading diagnostic or Help, or open `repair/?release=2.0.0-rc.1`
   below the app directory. Close other tabs for that installation.
3. Choose **Refresh cached application files**, read its completed or partial
   result, then choose **Return to CircuitBench**. Confirm v2.0.0-rc.1 and run
   the experiment again. If a step failed, the recovery page keeps the error
   visible and offers a retry.

This recovery removes only the installation's service-worker registration and
CircuitBench application caches, then refreshes its files through the browser
HTTP cache. Saved projects, preferences and other installations are preserved.
On ordinary HTTP, file refresh is still available; the page reports that
service-worker cleanup is unavailable. The recovery directory supports hosts
that redirect `.html` URLs. The open browser
offline/print/output verification gates are listed in
[release validation](VALIDATION.md).

## Probe and read results

Click a pin or use Probe mode to request its voltage, scalar logic state or
whole bus word. The inspector's **Pins & measurements** lists the appropriate
Voltage, Logic or Bus action and each bus pin's bit range. In Probe mode,
Shift-click a second analog endpoint for the first voltage minus the second.
The inspector's **Connect pins by name** section also offers a
keyboard-accessible A − B voltage measurement. Digital pins cannot be used for
differential voltage. The list of selected probes is saved with the project.

Supported current measurements are voltage-source branch current, inductor
branch current, and resistor current derived from the simulated terminal
voltage difference divided by resistance. Directions are shown with the
measurement. A supplying voltage source usually reports negative current into
its positive terminal. Other device currents are not exposed as curated branch
instruments in this release.

Waveforms supports multiple traces. Choose the view to display volts, amperes
or logic consistently. **Mixed** is selected automatically when voltage and
logic results coexist; voltage and logic lanes share one time axis. AC has
magnitude in dBV/dBA and phase in degrees.
Wheel zooms the horizontal range; **Click → Pan** enables drag panning;
**Reset view** restores the full range. Choose Cursor A or B, then click; or
Shift-click for B. Analog-only views snap readouts to stored samples. In Logic
or Mixed view, the cursor reads the settled state at its selected time and
holds the preceding event's value between transitions. It never interpolates a
logic word or chooses a future transition. Analog values interpolated at a
Mixed cursor are marked `≈` and identified as interpolated. Time differences
remain available; a logic word is not treated as a numeric voltage or delta.

Bus lanes retain exact words, including leading zeros and individual X/Z bits.
Unknown and released intervals have distinct shading. Short intervals retain
their transition geometry even when a word label would not fit; use the cursor
or CSV for the complete value. Logic transitions are not decimated. For an
individual bit view, add an explicit Slice with count 1 and a scalar probe.
Analog display simplification does not change the stored arrays.

**Values** provides numeric analog values and literal logic words.
**Results CSV** preserves all stored samples and word strings; bus headings
state the width and MSB-first order. Import those columns as text in a
spreadsheet to preserve leading zeros. A ngspice feed-forward mixed result
identifies original final-pass analog samples separately from values
interpolated at added event times. Coordinated results record accepted analog
states without interpolation during chunk joining; a cursor between samples
can still identify its displayed estimate as interpolated. **Netlist & diagnostics** shows the exact captured deck or digital/mixed
execution plan, warnings, model identities, hashes and engine log. A run can be
Running, Completed, Completed with warnings, Cancelled, Timed out or Failed.
An additional Outdated indicator means the working revision has since changed.
A warning is not silently discarded or turned into a clean result.

## Measure digital timing

The **Timing** button above the results measures the selected completed
transient run. It works with digital signals in digital or mixed-signal runs.
It uses the run's saved digital events, so changing the plot zoom, hiding a
trace or editing the working circuit does not change the measurement.
For continuous simulation, first choose **Stop & keep results**. The complete
measurement window must fit inside the retained absolute-time interval; an
earlier discarded edge cannot be reconstructed.

### Start with the clock and delay example

1. Open **Examples → Measure clock timing and gate delay**, then choose
   **Run experiment**.
2. Choose **Timing**, then **Propagation delay**. Select **Clock · 10 MHz** as
   the source and **After 20 ns** as the target, both with rising edges.
3. Keep the complete window, from `0` to `450n`, and choose **Measure timing**.
   The five observed pairs each measure 20 ns. The table includes each exact
   source and target time, and the summary includes only measured rows.
4. Choose **View pair** on a row. The app selects the original run, opens its
   waveforms, shows the relevant signals, and places Cursor A on the source
   edge and Cursor B on the target edge. The view zooms around that pair.
5. Return to **Timing** and choose another measurement. On the Clock signal,
   complete cycles measure 100 ns, 10 MHz and 25% duty; high pulses measure
   25 ns. The final period has no closing edge within this run and is listed
   as missing rather than assigned an estimated value.
6. Change a buffer delay, run again, and measure the new run. Earlier saved
   measurements keep their original circuit revision and event pairs. Open
   them under **Timing → Saved timing measurements** to compare the records.

### Choose what to measure

| Measurement | Signal and edge selection | Meaning of a measured row |
|---|---|---|
| Propagation delay | Source signal/edge and target signal/edge | First matching target edge at or after the source, strictly before the next matching source edge; target time minus source time |
| Pulse width | Signal and high or low pulse | Rising-to-falling time for a high pulse, or falling-to-rising time for a low pulse |
| Period | Signal and cycle-start polarity | Time between consecutive edges of that polarity |
| Frequency | Signal and cycle-start polarity | Reciprocal of each complete period, in hertz |
| Duty cycle | Signal and cycle-start polarity | Percentage of each complete cycle spent high, including when the chosen start edge is falling |

Choose a scalar signal or one explicit bus bit, such as `COUNT [0]`. Bit 0 is
the least-significant, rightmost bit. Measuring a bus bit does not require a
new Slice component or a rerun. **View pair** displays the existing full-word
lane; the measurement identifies which bit supplied its edges. Add a Slice
and scalar probe only when you want a separate bit waveform in a future run.

The time-window fields use seconds and accept engineering values, such as
`2 ns`, `500p`, `1u` or `1e-6 s`. Both observed edges must lie within the
window. Changing measurement kind keeps the window and signal draft available;
invalid inputs report the reason without creating a record. Changing the
window creates a new measurement when **Measure timing** is selected.

### Read incomplete and ambiguous results

Only direct `0 → 1` and `1 → 0` changes count as binary edges. Transitions
through unknown `X` or released `Z` states do not supply a guessed edge time.
The table distinguishes three outcomes:

- **Measured:** the selected pair and intervening states justify the numeric
  value under the stated pairing rule.
- **Indeterminate:** X/Z prevents a numeric result. The recorded event times
  and explanation remain available, including a pulse interrupted by X or Z.
- **Missing edge:** the required opening or closing edge was not observed in
  the window. The first state at time zero, or at a nonzero retained-window
  boundary, is an initial/boundary state rather than an opening edge.

Equal source and target timestamps can give a measured zero delay. Delay pairs
express a temporal relationship selected by you; they do not prove that one
signal physically caused the other. Summary minimum, maximum and mean exclude
indeterminate and missing-edge rows. Frequency is calculated per complete
cycle, rather than estimated by counting edges over the whole window.

The digital engine uses a **1 ps event time grid**. This is not a claim of
physical timing accuracy. Ngspice feed-forward ADC edges depend on analog
samples and crossing interpolation. Coordinated scalar crossings depend on
trial solves and the maximum step; sampled converters depend on their sample
phase and conversion delay. Bridge thresholds remain part of either model.
Their source-run assumptions stay with the measurement. Setup/hold constraints,
metastability and manufacturer timing characterization are outside this release.

Two other examples make these distinctions visible:

| Example | Suggested measurement | Expected result |
|---|---|---|
| Measure a reconvergent logic hazard | High pulse width on **Hazard pulse** | Two 20 ns pulses produced by unequal transport delays |
| Timing with unknown and unfinished pulses | High pulse width on the patterned signal | One complete 40 ns pulse, explicit indeterminate X/Z intervals, and an unfinished final pulse |

### Keep and export timing evidence

Each measurement records its source-run identity, circuit snapshot/revision,
selected signals or bits, edge polarities, window, exact event pairs, results,
source hashes, engine identity and assumptions. A measurement from a continuous
window also preserves its retained bounds and independent live-input history.
Editing the circuit or deleting
the full source run does not rewrite the saved measurement. **View pair** is
available while that source run remains in history; the table, CSV and saved
event evidence remain available after it is removed. **Remove measurement**
removes the chosen timing record without changing its source run.

**Download timing CSV** includes raw seconds, hertz or percentage points,
edge times and status for every retained row. Non-numeric outcomes have a
blank value, not zero. **Download timing evidence** exports the complete
standalone JSON record. Use **Save backup** and **Project → Open project** to
reopen measurements in the workbench. Import checks the saved numbers against
their retained events; it does not simulate the circuit again. A notice
identifies restored measurements and measurements newly made from a restored
source run. Reports include retained timing records with their original run
and revision identified separately from the report's selected run.

Each measurement shows at most **256 candidate occurrences**. A truncation
notice identifies omitted occurrences; narrow the window to examine later
events. Summary statistics cover only the displayed measured rows. Up to
**12 records** are retained, within a separate budget of **one million saved
events and 16 MiB**. Saving another record removes the oldest records when
necessary and reports that removal. A single measurement accepts at most
**250,000 selected events** across one or two signal streams. If this event
limit is reached, shorten the simulation; narrowing the measurement window
does not discard its original source streams. Export important evidence before
reaching a retention limit.

The detailed timing contract is in [Timing measurements](timing-measurements.md).

## Keep and compare runs

Choose **Pin baseline** on a completed run, change a parameter and run again.
The baseline remains associated with its original circuit snapshot. Compatible
named signals in the same analysis type and horizontal units appear as dashed
overlays. Logic signals must also have the same scalar/bus kind; bus baselines
must have the same width and bit order. An incompatible bus is not silently
resized to match, and the plot explains when it cannot be overlaid.

Run history lets you select and remove recorded runs. Up to twelve run
records are retained, with a pinned baseline protected from ordinary oldest-run
trimming. Download important evidence before removing it. Large numerical
exports are subject to the documented project/import size bounds.

## Projects, recovery and reports

Autosave displays Unsaved → Saving → Saved locally. It stores the working
project, retained run history, latest four truth-table records, timing
measurements and analog studies in IndexedDB. Refresh reopens that state.
A bounded run interrupted by closing the page is marked incomplete rather than
completed. A continuous session instead saves its last completed retained
window as a non-resumable snapshot; its worker does not survive refresh.
**Recover previous autosave** retrieves the immediately preceding stored
snapshot; it is not an unlimited history of every past session.

**Save backup** downloads a portable `.circuitbench.json` file. Autosave never
writes over an imported disk file. **New empty project** starts without sample
content. **Duplicate project** creates a new project identity and starts a new
run, truth-table, timing and analog-study history. Loading an example or another project asks before replacing
nonempty working content.

Available outputs:

| Output | Contents |
|---|---|
| Project JSON | Electrical model, layout, analysis settings, probes, retained runs/continuous windows, truth tables, timing measurements and analog studies |
| SPICE `.cir` | Analog-only generated deck with explicit models, options and selected analysis |
| Simulation plan JSON | Digital or mixed-signal execution plan, including its component and bridge assumptions |
| Schematic SVG | Independent vector drawing with values and local styles |
| Component CSV | References, types, parameters and model classification |
| Results CSV | Full stored samples; real/imaginary AC values; exact scalar/bus words and mixed-sample provenance |
| Truth-table CSV | Every enumerated row, with input/output widths, MSB-first words and literal X/Z states |
| Truth-table evidence JSON | Immutable table record, circuit snapshot, execution plan/hash, selections, warnings and engine identity |
| Timing CSV | Retained event-pair rows, raw time/value fields, statuses, signal/bit selections, window and source-run identity |
| Timing evidence JSON | Immutable timing record, circuit snapshot, selected original event streams, settings, results and source provenance |
| Analog-study CSV | Exact trial parameters, metrics, statuses and summary |
| Analog-study evidence JSON | Base project, deterministic trial sequence, executed inputs, engines, selected samples, metrics and failures |
| Analysis HTML / PDF | Designed report containing circuit, question, measurements, assumptions, interpretation, settings, provenance, warnings and exact deck or simulation plan |

Choose **Report / PDF** to preview the designed report. Download its
self-contained HTML or use **Print / save PDF** and your browser's PDF printer.
The circuit and numerical evidence belong to the selected run snapshot.
For a run from the current project, the report includes the interpretation
notes present when the report is generated, with an explicit caption. This lets
you write a conclusion after measuring the result. The numerical evidence,
circuit, analysis settings and assumptions remain those of the immutable run
snapshot. Rerun if the changed circuit or settings should supply new evidence.
Version-specific report preview, download and print evidence is listed in
[release validation](VALIDATION.md); instructions here do not imply those
browser checks have been completed for this candidate.

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
