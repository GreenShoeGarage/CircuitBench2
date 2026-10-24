# Digital and mixed-signal experiments

**Candidate: 2.0.0-rc.1.** The workbench includes four-state event simulation,
ngspice feed-forward mixed replay, coordinated analog/digital feedback,
stateful continuous sessions, 1–8-bit buses, sampled 2–8-bit converters and a
working seven-segment display. Timed patterns, registers, counters,
multiplexers, decoders and editable logic tables retain their existing
contracts. A separate truth-table experiment enumerates settled combinational
behavior, while analog parameter/tolerance studies run independent trials.

## One workbench

Place digital components from the Components drawer, or open a digital example.
Adding the first digital part selects transient analysis. Set the experiment
duration, run, and inspect the timing diagram. Adding a multibit converter
selects coordinated transient. Analog-only projects retain ngspice
operating-point, DC, AC and transient analyses; an R/C/L and independent-source
schematic can also select coordinated transient or continuous operation.

Digital pins carry logic states. Analog pins carry electrical quantities.
They cannot be joined directly, including by matching labels or junctions.
Use an explicit scalar ADC/DAC bridge or multibit converter at each boundary. A logic-only schematic
does not need an analog Ground symbol. Analog sections require their normal
reference and valid electrical return paths.

## Logic components and states

The scalar library includes logic inputs, clocks, buffers, inverters, two-input
AND, OR, XOR, NAND, NOR and XNOR gates, tri-state buffers and D flip-flops.
Bus components build on the same four-state rules.

| State | Meaning |
|---|---|
| 0 | Logic low |
| 1 | Logic high |
| X | Unknown value or conflicting active drivers |
| Z | High impedance / no active drive |

Multiple drivers resolve on their shared net: Z does not force a value,
agreeing known drivers retain that value, and conflicting known drivers give
X. Gates use four-state truth rules; for example, a known 0 determines an AND
output even if another input is unknown. Unknown is never silently treated
as false. A tri-state buffer releases its output when disabled.

The models are behavioral logic primitives. They do not represent a particular
74-series or CMOS IC, supply-current model, output-current rating, transistor
implementation, input capacitance or temperature response. Analog thresholds
and drive levels belong to explicit bridge parameters.

## Bus words and connections

Choose a width from **1 to 8 bits** in the component inspector. Displayed words
are **most-significant bit first**; bit 0 is the least-significant bit on the
right. For example, `10Z1` means bit 3 = 1, bit 2 = 0, bit 1 = Z and bit 0 = 1.
Leading zeros and unknown or released bits are retained in plots, cursors,
Values, backups and CSV.

Enter an exact-width word such as `10XZ`. For known numbers, `0b1010`, `0xA`
and `0d10` all give the four-bit word `1010`; shorter prefixed numbers are
zero-padded. A value that will not fit is rejected rather than truncated.
Initial register/counter words may contain X but not Z.

| Part | What it does |
|---|---|
| Bus input | Drives a constant word |
| Digital pattern | Applies timed words, with optional repetition |
| Slice | Exposes one selected bit or contiguous group of bits |
| Join | Combines A as the low bits and B as the high bits, up to 8 total |
| Bus register | Captures a word on a rising clock edge, with enable and synchronous reset |
| Binary counter | Increments on enabled rising edges, wrapping modulo its width |
| Bus multiplexer | Selects A or B with a scalar select input |
| Binary decoder | Turns a 1–3-bit address into 2, 4 or 8 one-hot outputs |
| Truth-table logic (LUT) | Maps every 1–4-bit input combination to a 1–8-bit output word |

Connected pins, labels and junctions must have matching widths and domains.
Use a Slice to connect a bus bit to a scalar gate or a one-bit DAC. There is
no implicit choice of a bus bit. For a Slice, the selected first bit becomes
output bit 0. For a Join, A = `01` and B = `10` produce `1001`.

Slice and Join are connections, with no extra buffering or delay. A released
Z remains released through them, and conflicting drivers on aliased bits
resolve to X. A bus can therefore contain both known and uncertain bits at
once. Probe the bus for a word lane, or add a Slice and a scalar probe to inspect
one bit. Width one uses the ordinary scalar logic lane.

### Pattern sequences

Enter time/word pairs separated by semicolons or newlines:

```text
0,0000; 1m,0100; 2m,0000
```

This four-bit sequence starts at zero, asserts bit 2 at 1 ms and clears it at
2 ms. Every sequence requires an explicit time-zero word. Up to 200 entries
are allowed; times must increase strictly on the 1 ps grid. X and Z are valid
stimulus bits.

Set **Repeat period** to `0` for a one-shot sequence; the last word then holds
through the run end. With Repeat = `3m`, the example starts again at 3 ms,
asserts bit 2 at 4 ms and clears it at 5 ms. A positive repeat period must be
later than the last entry. The compiler also bounds the total repeated work,
so a very short repeat period over a long run can be rejected.

## Timing contract

- Digital event times use a **1 ps resolution**. Parameters must be representable
  within the engine's bounded timing range.
- Gates use **transport delay**: an input transition is propagated after its
  configured delay. This is not an inertial pulse-rejection model.
- Initial combinational values settle at time zero. The initial trace therefore
  records the initialized logical state; it does not model power-up transients.
- A D flip-flop samples on a rising clock edge. Its initial Q is a component
  parameter. Simultaneous input/clock changes use the settled data for that
  timestamp; ambiguous clock edges propagate uncertainty.
- Setup/hold timing and analog metastability are not modeled. A successful
  digital run does not establish hardware timing closure.
- Combinational-only cycles are rejected. A flip-flop provides an explicit
  state boundary and permits digital feedback, such as a divide-by-two circuit.
- Each **Run experiment** starts a fresh bounded experiment. **Continuous…**
  instead keeps one coordinated worker and its state through updates and
  pauses. Stop terminates it; a subsequent new session starts from its recorded
  initial configuration.

A clock with start delay zero is already high at initialization; this does not
count as a rising edge. Its next rising edge is one period later. Set a positive
start delay when the first capture should occur at that delay.

### Register and counter controls

Both register and counter use rising-edge clocks. Enable and reset are
active high, and **reset is synchronous and takes priority over enable**.
Resetting requires a rising clock edge; changing reset alone does not
immediately change Q. On a normal enabled edge, the register captures its
input word and the counter increments. A four-bit counter wraps from `1111`
to `0000`. With enable 0 and reset 0, either part holds its state.

All bits capture together, and their visible change follows the configured
clock-to-output delay. Simultaneous data, enable, reset and clock changes are
resolved first, then sampled. Private state is independent of output-bus
contention: another driver can make Q appear X without changing what the
counter stores internally.

Unknown controls are handled conservatively, bit by bit. An uncertain enable
considers both holding and updating; only bits common to both outcomes stay
known. An uncertain reset also considers the all-zero outcome. A possible
but ambiguous rising clock edge includes the no-edge hold outcome. Unknown
register data is captured as X, and counter uncertainty propagates through
the affected carry bits. This is an explicit logic rule, not a model of
hardware metastability.

### Multiplexer, decoder and LUT uncertainty

MUX select 0 chooses A; select 1 chooses B. When select is X or Z, equal known
bits on A and B stay known and differing or unknown bits become X. A MUX uses
ordinary gate inputs, so selected Z becomes X; use Slice/Join for a connection
that must preserve release.

DECODER enable 0 makes every output 0. With enable 1 and a known address,
exactly that numbered output bit is 1. If an address or enable is unknown,
the decoder considers the compatible binary cases: impossible active outputs
stay 0, while genuinely ambiguous output bits become X.

Select a LUT and choose **Edit truth table…** to define every binary input
combination. The row editor accepts literal output words containing 0/1/X/Z.
All rows are required, with no wildcards or executable expressions. Unknown
input bits consider every compatible row; a bit keeps the value agreed by
all those rows, including an explicit Z, or becomes X. Changing dimensions
keeps the lowest-address rows and least-significant output bits, fills new
positions with zero, and asks you to review the rows before applying. Connected
pin widths must still agree.

## Generate a circuit truth table

The experiment-level **Truth table** action measures a combinational circuit;
the LUT component is one possible part within that circuit.

1. Open **Editable truth-table half adder**, or draw combinational logic driven
   by DIN/Bus input constants.
2. Choose **Truth table** and select the constant input components to vary.
   The selected groups may contain at most **8 input bits** in total.
3. Select up to **32 output columns**. A bus remains one literal-word column.
4. Choose **Generate truth table**. The worker evaluates all binary input
   combinations, up to **256 rows**, through the same timed event kernel.
5. Inspect the rows, then use **Download table CSV** or **Download table
   evidence** to retain the result. Stop terminates an in-progress table.

The first selected input group is the most significant part of the row key.
Unselected constant inputs keep their configured values, including X or Z.
Each row starts independently, applies its assignment at 1 ps, and waits for
the longest combinational propagation path to settle. The table uses the
actual gate delays; it does not depend on a short transient duration accidentally
ending before a signal arrives.

Clocks, patterns, flip-flops, registers, counters, analog components and bridges
are excluded from full truth-table generation. Use a transient run for those
experiments, and for glitches, hazards or timing comparisons. A completed
table establishes settled logic behavior only.

Each completed table keeps its circuit snapshot/revision, selected columns,
compiled plan, engine identity and timestamps. It is separate from transient
run history. The latest **four tables** are retained in autosave and project
backups; adding a fifth removes the oldest table with a notice. Editing the
project does not rewrite a recorded table. Imported tables remain restored
evidence from their recorded revision.

Digital samples are right-continuous: the value at an event time is the settled
state after that event. Timing lanes use steps, and X/Z remain explicitly
identified. Logic cursors read the state at or immediately before the chosen
time, without interpolation toward a future event.

## One-bit bridges

These remain single-bit logic/electrical interfaces. Use an explicit Slice for
one bus bit, or the separate multibit ADC/DAC parts to convert a whole word.

### Analog to digital (ADC)

Connect the analog input and reference, then connect the digital output to a
logic input. Set the low and high thresholds in volts.

- **Threshold mode:** a voltage in the uncertain threshold band produces X.
- **Schmitt mode:** once a low or high state is established, retain it while the
  input is between thresholds; change only when the opposite threshold is
  reached. An initial voltage in the band starts unknown.

The bridge observes simulated analog voltage relative to its reference. In
ngspice feed-forward mode, threshold events are located by linear interpolation
between saved analog samples; features absent between them cannot be recovered.
Coordinated transient uses trial analog solves to localize crossings before
accepting a shared event boundary. Reduce the maximum step and compare results
when transition timing matters. The 1 ps event grid does not establish analog
accuracy.

### Digital to analog (DAC)

Connect the digital input and analog output/reference. Set the low/high output
voltages and positive rise/fall times. Feed-forward replay produces a
piecewise-linear voltage source for ngspice. Coordinated transient updates the
same idealized finite-edge drive as digital events occur, so its effect can
return through an ADC in a closed loop.

The bridge is an ideal voltage driver with configured edge timing, not an
electrical IC output stage. Add explicit resistance/loading when needed.
X or Z at a DAC input stops the experiment with a diagnostic instead of
inventing an analog level. Resolve uncertain startup, conflicting drivers or
tri-state conditions before using that signal to drive an analog section.

## Select the mixed-signal engine

Under **Behavior over time · Transient**, choose the appropriate **Transient
engine**. Both paths use the same circuit, probes and **Run experiment** action.

| Engine | Analog scope | Boundary behavior |
|---|---|---|
| **ngspice · analog / feed-forward mixed** | Full curated analog library | Scalar ADC/DAC replay; analog input and output sections must be independent |
| **Coordinated · analog/digital feedback** | R/C/L and independent V/I sources | Incremental analog/digital state, scalar and multibit conversion, closed loops and continuous sessions |

The ngspice route supports logic → DAC → analog load, analog source → ADC →
logic, and independent input analog → logic → output analog paths. It first
obtains input waveforms, converts scalar ADC crossings to events, runs digital
logic and replays DAC output through ngspice. It retains each actual analog
deck. A conservative dependency check rejects a DAC-to-ADC analog path,
ignoring only common reference ground; replay does not iterate a feedback loop.

The coordinated route accepts those paths and mixed feedback within its stated
analog subset. It advances original modified nodal analysis and incremental
logic together, using backward Euler for capacitors/inductors. Source changes,
digital events, converter samples and DAC ramp ends create shared boundaries.
Normal startup computes a DC solution; UIC uses explicit stored analog
conditions. A pure combinational digital loop remains invalid.

Open **Closed-loop Schmitt RC oscillator**, run it, then halve its maximum step
and compare a measured digital period. **Sampled 4-bit feedback controller and
display** adds quantization and a periodic converter schedule to an RC feedback
loop. These examples illustrate the implemented contracts; they do not claim
device-specific PLL, transistor switching, noise or physical control-system
accuracy. Diodes, transistors, the controlled switch and op amps remain ngspice
features and are rejected in coordinated mode.

## Multibit conversion and a working display

**Multibit sampled ADC** (`ADCBUS`) observes `V(p) − V(n)`, samples at zero and
each absolute sample period, and produces a saturated unsigned nearest code
after conversion delay. Width is 2–8. Its first word is X until conversion
completes. The period and delay must each occupy at least one 1 ps tick, and
the rounded delay must be shorter than the rounded period.

**Multibit voltage DAC** (`DACBUS`) maps that whole known word to
`low + code/(2^width−1) × (high−low)` with finite linear edges. It holds an
explicit known startup code until the first known input. Subsequent X/Z is an
error. The part has no physical output resistance, current limit, noise or
glitch model. See [multibit-converters.md](multibit-converters.md).

**HEX7** takes a four-bit hexadecimal/BCD code and a scalar decimal-point input,
then outputs eight segment bits through timed logic. **SEG7** passively displays
those bits. Bit order is `a,b,c,d,e,f,g,dp` from bit 0 through bit 7. Match the
decoder and display active-high/active-low settings. The display follows the
matching captured run at cursor A or its final retained time; X, Z and absent
evidence are distinct. No electrical LED current or brightness is inferred.
See [seven-segment-display.md](seven-segment-display.md).

## Continuous state and live inputs

Choose **Continuous…**, set **Time per screen update** and **Recent history
window**, then **Start continuous simulation**. **Pause** retains analog state,
clock phase, digital memory and pending events; **Step** advances a bounded
update while paused; **Resume** continues the same timeline. **Live inputs…**
changes DIN/BUSIN or independent DC V/I values at a completed boundary, with an
exact input history. Circuit edits stop the session.

The recent window is bounded to 30,000 points, one million dense values and
250,000 sparse events. Times remain absolute when older intervals are removed.
The first retained logic state is not a new edge. The session pauses at the
9,000 s timeline limit. It advances as browser/solver scheduling allows,
without real-time hardware synchronization. **Stop & keep results** ends the
worker and permits timing measurements on the completed retained window.
Backups retain an inspectable snapshot, not resumable numerical state. See
[continuous-simulation.md](continuous-simulation.md).

## Measurements, provenance and portable files

Probe a digital pin to add a logic measurement. Probe analog pins for voltage
or differential voltage. Mixed results display voltage and digital timing on a
shared time axis; current retains its own units.

Digital-only results preserve event times. Ngspice feed-forward mixed results use the union of
the final analog pass's sample times and digital event times. Original samples
from that final analog pass are retained; voltage/current values at additional
digital timestamps are linearly interpolated and explicitly identified in
sampling provenance.
They are not relabeled as new raw ngspice samples. Logic is held constant
between events. Sparse event records retain each settled logic transition.

In ngspice replay with both scalar ADC and DAC bridges, ADC events come from an earlier
analog input pass with the DACs held at their initial low voltage. The final
analog pass includes the actual DAC transitions and can have a different
adaptive sample grid. Both executed analog decks are recorded; the shared
result vectors and original-sample index map describe the final pass. They do
not combine the two passes into one native ngspice event simulation.

Coordinated results instead contain actual accepted analog states at solver
and event boundaries, with `analogInterpolation: 'none'` in their sampling
contract. Joining adjacent commands does not fabricate analog samples. A
cursor placed between stored analog points may still show an explicitly
marked interpolated readout. Continuous windows retain only a bounded recent
interval and preserve complete sparse transitions within that interval.

Save backup preserves the project, captured circuit revision, result vectors,
logic/bus states, sampling provenance, executed analog decks or coordinated
plans, continuous input history, truth tables, timing records and analog
studies. CSV keeps literal 0/1/X/Z states and exact MSB-first bus words. Reports
list observed digital words without numeric minima or
maxima for X/Z. Imported results remain identified as restored evidence until
the circuit is rerun.

Digital/mixed projects export a CircuitBench simulation plan. Standalone SPICE
netlist import/export continues to cover the documented analog subset; the
current WASM binary does not contain XSPICE device support. Use a project
backup to move the complete mixed experiment between installations.

## Bus and table examples

| Example | Expected observation |
|---|---|
| Bus slices and bit ordering | `10Z1` splits into low `Z1` and high `10`, joins back to `10Z1`, and exposes scalar bit 1 = Z |
| Four-bit register with enable and reset | Q starts `0000`, captures `0001` at 0.5 ms and `0010` at 1.5 ms, holds through 3.5 ms, captures `1111` at 4.5 ms, and resets at 5.5 ms; output updates follow each edge by 10 ns |
| Counter wrap, reset and bit tap | Initial 14 counts to 15, wraps to 0, reaches 1 and 2, resets near 4.1 ms, then resumes 1, 2, 3; updates follow rising edges by 10 ns |
| Bus multiplexer and one-hot decoder | Selected word `01`, `10`, `XX`, `01` gives decoded `0010`, `0100`, `XXXX`, `0010`; later changes include 10 ns MUX and 10 ns decoder delays |
| Editable truth-table half adder | Inputs `00`, `01`, `10`, `11` produce Carry:Sum `00`, `01`, `01`, `10`; enumerate these four rows with the Truth table action |
| Bus bit → DAC → analog filter | Bit 2 rises at 1 ms and falls at 2 ms; a 1 kΩ / 100 nF RC output is above 4.5 V at 1.3 ms and below 0.5 V at 2.3 ms |

The existing seven scalar digital and mixed-signal examples remain available,
including the DFF divider, tri-state contention, ADC ramp and complete
Schmitt ADC → logic → DAC chain.

The 2.0 example set adds the following focused workflows. Together with the
retained analog, digital, mixed and timing examples, there are 38 examples:
16 analog, 14 digital and 8 mixed.

| Example | What to inspect |
|---|---|
| Hex counter with a working seven-segment display | Counter state, decoder delay and visible 0–F segment patterns |
| Seven-segment patterns, decimal point, X and Z | Direct segment mapping and explicit uncertain/released states |
| Closed-loop Schmitt RC oscillator | Analog voltage returning through ADC, logic and DAC to its own RC node |
| Sampled 4-bit feedback controller and display | Quantization, sampling delay and stored analog feedback |
| Multibit ADC, DAC and seven-segment readout | Sampled ramp, whole-word reconstruction and captured digit |
| Eight-bit counter through a voltage DAC | Full eight-bit path with live enable/reset in continuous mode |
| Continuous RC with live input changes | Capacitor state through Pause/Resume and DC source changes |

## Resource and scope limits

Runs are bounded by 200,000 scheduled digital events, 255 expanded scalar
bit nets and 600 scalar source/gate/state elements. A wider bus consumes one
scalar net per bit. Large repeated patterns and logic fanout can therefore
reach a limit before the component-count limit. The shared result is bounded
to 250,000 rows, 256 vectors and two million values. The compiler also limits
generated plan/deck text and gives a diagnostic when a circuit is too large.
Your authored circuit remains available for simplification.

The coordinated analog partition additionally limits its graph to 48 nodes,
80 matrix unknowns and 160 elements. Finite coordinated runs enforce a combined
two-million dense-value/sparse-event budget; continuous mode uses the smaller
window bounds stated above. Each path has explicit watchdog and command limits.

This candidate adds no HDL, CPU/microcontroller execution, asynchronous reset,
drive-strength model, setup/hold analysis or physical metastability simulation.
The full ngspice analog library and the documented feed-forward replay
assumptions remain available alongside the new bounded coordinated solver.

## Implementation and release evidence

The existing EEcircuit/ngspice WASM binary is unchanged. Its bundled build
recipe explicitly disables XSPICE, and an actual-engine probe rejected an
XSPICE bridge. Digital execution therefore uses CircuitBench's separate local
event engine. This distinction is recorded in run provenance.

Official background on native XSPICE scheduling is available at
[ngspice XSPICE](https://ngspice.sourceforge.io/xspice.html) and
[XSPICE usage](https://ngspice.sourceforge.io/xspiceusage.html).
Native XSPICE, ngspice feed-forward replay and CircuitBench's original
coordinated solver have different execution contracts and engine identities.

Current acceptance results and remaining browser gates are maintained in
[VALIDATION.md](VALIDATION.md) and [PROGRESS.md](PROGRESS.md). The digital/mixed priority does not claim that
previously unverified offline, update, printing or download gates have passed.
The actual-worker numerical record is
[digital-validation.json](../evidence/digital-validation.json); its source
hashes and worker counts identify what was exercised. See
[digital-engine.md](digital-engine.md) for the exact kernel, replay and
coordinated contracts. [Analog experiments](analog-experiments.md) describes
independent parameter/tolerance trials; those studies do not carry the
continuous session's state between trials.
