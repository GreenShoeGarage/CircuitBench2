# Digital engines, replay and coordinated transient

This document specifies the event and boundary semantics in
**2.0.0-rc.1**, retaining the scalar, bus, pattern, sequential-word and
truth-table contracts from earlier releases. Bounded native digital simulation
uses **CircuitBench event kernel 2** (`cb-digital-kernel-2`) in a separate
worker. The full analog library remains on pinned ngspice 45.2 WASM, including
the existing feed-forward scalar bridge replay. A separately identified
**CircuitBench coordinated transient** engine (`cb-coordinated-1`) adds
incremental digital events, original R/C/L modified nodal analysis, feedback,
multibit converters and stateful continuous sessions.

## Why a separate digital kernel

The bundled EEcircuit-engine 1.8.0 build recipe explicitly configures ngspice
with `--disable-xspice`. An actual probe using `adc_bridge`, `d_inverter` and
`dac_bridge` was rejected at the first A device with `unknown device type`.
The probe, binary identity and complete diagnostic are recorded in
[digital-engine-capability.json](../evidence/digital-engine-capability.json).
The shipped build recipe is under
`public/engine/source/eecircuit-engine-1.8.0/Docker/run.sh` in the source tree.

Upstream [ngspice XSPICE](https://ngspice.sourceforge.io/xspice.html) provides
an event engine coordinated with the analog solver, code-model libraries and
a richer digital state/strength representation. Those capabilities cannot be
assumed to exist in a binary built without XSPICE. CircuitBench does not claim
native XSPICE or HDL execution. Version 2.0 introduces its own explicitly
bounded analog solver for coordinated execution; it does not attribute that
solver's results to the unchanged ngspice binary.

A future XSPICE-enabled WASM build would need a pinned toolchain, working
code-model linkage/loading and digital-event export, followed by complete
numerical and browser validation. The foundation evaluation environment did not
have `emcc` installed. This release does not substitute an unverified rebuilt
binary for the already pinned analog engine.

## Digital states and electrical meaning

Digital vectors contain literal strings. Scalar metadata is
`kind: "logic", unit: "logic"`; bus metadata additionally carries the explicit
width and MSB-first order described below.

| State | Meaning |
|---|---|
| `0` | Known logical low |
| `1` | Known logical high |
| `X` | Unknown, ambiguous, or conflicting driven value |
| `Z` | No active drive on the digital net |

All drivers on a net resolve together. `Z` does not oppose a driven value;
opposing `0` and `1`, or an active `X`, resolve to `X`. A wholly released net
resolves to `Z`. This is logical resolution, not a current, impedance or
drive-strength model.

Ordinary gate inputs treat `X` and `Z` as unknown. AND still produces `0` if
any input is `0`, and OR produces `1` if any input is `1`. XOR requires known
inputs. Inverted gates invert a known result and preserve `X`. The active-high
tri-state buffer produces `Z` when disabled, passes known data when enabled,
and produces `X` for ambiguous enable/data conditions.

The scalar components remain logic inputs, clocks, BUF/NOT, AND/OR/XOR,
NAND/NOR/XNOR, an active-high tri-state buffer and a rising-edge D flip-flop.
The extension adds BUSIN, PATTERN, SLICE, JOIN, REGISTER, COUNTER, MUX,
DECODER and LUT. Analog and digital pins belong to explicit domains. A wire,
equal net label, junction or ground connection does not convert domains.

## Buses, aliases and word logic

Data widths are **1–8 bits**. Width one uses the existing scalar representation.
User-facing words are literal **MSB-first** strings: `10Z1` has bit 3 = `1`,
bit 2 = `0`, bit 1 = `Z`, and bit 0 = `1`. Bit zero is always the least
significant bit. Known numeric input may use `0b`, `0x` or `0d` prefixes and is
zero-padded to the configured width; a value that does not fit is rejected.
Unprefixed words must have the exact width and may contain `0`, `1`, `X`, `Z`.
Sequential initial words permit `0`, `1`, `X`, but not `Z`.

The compiler lowers buses to scalar bit nets in **LSB-first internal arrays**.
Every bit retains the scalar engine's driver resolution, timing and event
budget. Wires and labels must agree in width as well as domain. There is no
implicit truncation, widening or analog conversion.

SLICE and JOIN are bidirectional bit aliases, implemented by net equivalence
before simulation. They create no driver, buffer or delay. SLICE output bit 0
is the input bit selected by `lsb`; the remaining output bits follow in
increasing order. JOIN puts A in the low bits and B above it. A two-bit A and
two-bit B therefore produce the displayed word `B1 B0 A1 A0`. Aliases preserve
`Z` and propagate contention because the aliased bits are the same electrical
digital net.

| Component | Execution rule |
|---|---|
| BUSIN | One independent constant driver per bit |
| MUX | Per-bit selection: select `0` chooses A, select `1` chooses B; unknown select retains equal known A/B bits and produces `X` otherwise |
| DECODER | 1–3 address bits produce 2, 4 or 8 outputs; enabled address `n` asserts output bit `n`; enable `0` forces every output to `0` |
| LUT | 1–4 input bits and 1–8 output bits; one explicit output word for every binary address, with no missing or duplicate rows |

A MUX uses ordinary logic-input rules, so selected `Z` becomes `X`; it is not
an electrical pass switch. DECODER and LUT treat unknown input bits as all
compatible binary assignments. Each output bit retains a literal value only
when all candidate rows agree; otherwise it becomes `X`. An impossible
decoder output can therefore stay `0` while possible active outputs become
`X`. LUT rows may explicitly drive `Z`, and unanimous `Z` remains `Z`.
LUT input rows are bounded data, not expressions or executable code.

### Timed patterns

PATTERN accepts 1–200 `time,word` entries separated by semicolons or newlines,
for example `0,0000; 1m,0100; 2m,0000`. An explicit first word at time zero is
required. Times must increase strictly after conversion to the safe 1 ps
grid; two entries cannot collapse onto one tick. All bits of each word are
scheduled at the same timestamp, so downstream logic sees an atomic change.

Repeat period `0` means one shot, followed by holding the last word. A positive
period must lie strictly after the final entry on the tick grid. At each
period boundary, the initial word is applied again and the remaining entries
repeat at their original offsets. Repeated entries still count against the
shared event limit, including entries whose driver value ultimately does not
change. Patterns may contain `X` and `Z`.

## Timing, initialization and simultaneous changes

The kernel schedules events using safe-integer **1 ps ticks**. Source times
are rounded to the nearest tick. Gates have a positive delay of at least
1 ps. Clock period and high duration are quantized to ticks; both clock levels
must occupy at least one tick.

Gate delays are **transport delays**: a pulse shorter than the gate delay is
still propagated. The delay does not act as an inertial pulse filter.

All driver changes queued for one timestamp are applied together, then the
affected nets resolve, then gates evaluate those resolved inputs. Input order
does not invent intermediate glitches. Positive propagation delays schedule
their resulting output changes in the future. There is no unbounded sequence
of zero-delay delta cycles. Combinational feedback is rejected; explicit
flip-flops may break state feedback loops.

At time zero, sources establish their initial levels, flip-flops, registers
and counters use their explicit initial state, and combinational logic settles. This
initial settling does not create a clock edge. A zero-delay clock starts high;
its next rising edge is one period later. A positive clock start delay creates
a low-to-high event at that delay.

A DFF captures on a known `0` to `1` clock transition. If data and clock change
at the same timestamp, it samples the data after that batch of scheduled
driver changes resolves. A possible but ambiguous rising transition, such as
`0` to `X` or `X` to `1`, sets Q to `X`. The configured propagation delay
applies to Q. This policy does not model setup/hold time, analog metastability,
clock slew, power-up silicon behavior or device-specific timing corners.

### Register and counter state

REGISTER captures its whole input word; COUNTER increments its unsigned word
modulo `2^width`. Both have a rising-edge scalar clock, active-high enable,
and **synchronous active-high reset to zero**. Reset wins over enable. Reset
does not change a state merely because its pin changes; a rising clock edge
is required. Enable `0` holds the previous state.

Each component owns a private word state. That state changes atomically at
capture time; the corresponding output-bit changes are published together
after the positive clock-to-output transport delay. The next clock edge uses
the captured private state even if an earlier output change is still pending.
External contention on Q can make the resolved output `X` without corrupting
the private counter/register state.

Unknown register data becomes `X` on capture. An ambiguous enable takes the
bitwise consensus of holding and capturing/incrementing. An ambiguous reset
takes the consensus of resetting to zero and the enable-controlled outcome.
For a possible but uncertain rising edge (`0` to `X`/`Z`, or `X`/`Z` to `1`),
the kernel also considers the no-edge hold outcome. A bit stays known only
when every considered outcome agrees. For example, uncertain enable may
preserve unchanged bits rather than forcing the entire word to `X`. Counter
increment carries uncertainty only into bits that depend on an unknown carry.
This word-level policy is more informative than the scalar DFF's explicit
ambiguous-edge-to-`X` rule; neither models analog metastability.

## Bounded truth-table execution

The public coordinator API is:

```js
await workbench.runTruthTable(generated, {
  inputIds,       // selected DIN/BUSIN component IDs
  outputNames,    // visible scalar/bus trace names
  timeoutMs: 30000,
  onLog
});
```

The compiled plan must be pure combinational digital logic. Clocks, PATTERN,
DFF/REGISTER/COUNTER, analog components and ADC/DAC bridges are rejected.
There must be **1–8 selected input bits**, giving at most **256 rows**, and
**1–32 selected output columns**. A bus is one output column with its explicit
width. Selected DIN/BUSIN groups must map to distinct constant source drivers.
Unselected constants retain their configured values, including explicit X/Z.

Rows enumerate binary input words in ascending order; the first selected
input group supplies the most significant bits of the concatenated row key.
Each row is an independent timed experiment. Selected drivers start at `X`,
take the binary assignment at 1 ps, and run through the same transport-delay
kernel. The observation endpoint is two ticks plus the maximum total gate
delay along any combinational path. This includes one tick for input
excitation and a further endpoint tick after the longest path. It is not an
arbitrary user-selected transient duration. The entire table shares the
200,000 scheduled-event budget, rather than receiving a fresh budget per row.

The returned record has `kind: 'truth-table'`, descriptor arrays `inputs` and
`outputs`, and `rows: [{index, inputs: [word, ...], outputs: [word, ...]}]`.
Every descriptor includes width and `bitOrder: 'msb-first'`, including width
one. Output descriptors also specify `kind: 'logic'` or `kind: 'bus'`.
`settleTime`, engine identity, logs and warnings remain with the result.
The table is separate from transient run history and has no invented time
axis. Its purpose is settled combinational behavior; transient simulation is
still needed for hazards, glitches and propagation timing.

`DigitalEngine.runTruthTable` uses the disposable digital worker with
`type: 'truth-table'` and worker protocol `circuitbench-digital-worker-2`.
`WorkbenchEngine.running` and `stop()` cover tables and ordinary runs, with
mutual exclusion, physical worker termination and a watchdog. There is no
main-thread fallback calculation.

## Explicit ADC and DAC boundaries

### Scalar ADC: sampled differential voltage to replay events

An ADC observes `V(input) - V(reference)` without electrical loading. In
ngspice feed-forward replay, its initial state is derived from an actual analog
sample at time zero. That route rejects UIC configurations that could lack
the required sample. Coordinated startup and crossing localization are
specified separately below.

| ADC mode | Behavior |
|---|---|
| Threshold | At/below the low threshold is `0`; at/above the high threshold is `1`; the intervening band is `X` |
| Schmitt | A known previous state is retained inside the band; the high threshold sets `1`, the low threshold sets `0`; an initially ambiguous band value starts as `X` |

In the feed-forward route, crossing times are reconstructed by linear interpolation between saved
ngspice samples and rounded to 1 ps. Events express the state immediately
after the crossing; equal-time changes resolve to the settled state. The ADC
does not insert analog solver breakpoints or detect activity missing between
saved samples. Reduce the analog maximum step to resolve faster waveforms.
The 1 ps event quantum is not a claim of 1 ps analog measurement accuracy.

### DAC: known events to finite analog edges

A DAC maps known `0` and `1` states to the configured low/high voltage between
its output and reference. Its source is an ideal voltage source, with explicit
finite linear rise and fall times. A transition starts at its digital event
time. If another transition arrives before a ramp completes, the new ramp
starts from the voltage reached at that instant.

Any `X` or `Z` interval reaching the DAC stops the run with the component and
event time in the diagnostic. The DAC does not silently assign an unknown
voltage or pretend to implement an analog high-impedance output. There are no
output resistance, current limit, supply rails or load-dependent timing
parameters in this boundary model.

For replay, the generated analog stimulus uses ngspice's PWL voltage-source syntax; see
the [ngspice 45 manual](https://ngspice.sourceforge.io/docs/ngspice-45-manual.pdf),
section 4.1.4. This is an explicit model assumption, not a native XSPICE
`dac_bridge` device.

## Bounded feed-forward execution

With the ngspice engine selected, the schematic checker conservatively rejects every analog conductive or
dependency path from a DAC output/reference to an ADC input/reference.
Sharing reference ground alone does not count as such a path. This rule can
reject some circuits that a complete coupled simulator could handle; it
prevents replay from silently accepting analog/digital feedback. Selecting
coordinated transient enables a separate causal execution path within its
supported analog subset.

One Run action performs the required stages:

1. When ADCs exist, calculate the analog input circuit with any DACs held at
   their explicit initial low voltage.
2. Convert the recorded ADC inputs into events, then run the complete digital
   circuit in a fresh event worker.
3. When DACs exist, validate their resolved event histories, generate finite
   PWL stimuli and calculate the final analog circuit in a fresh WASM worker.

Digital-only projects use no analog worker. ADC-only mixed projects need one
analog pass; DAC-only projects run digital events followed by one analog pass.
Projects with both bridges need two analog passes. In this mode, the analog
input and output paths must satisfy the independence check; replay does not
perform feedback iteration or lockstep analog/event co-simulation.

The ADC events come from the input pass. The final analog pass can have a
different adaptive sample grid because it contains the actual DAC edges.
Both exact executed decks are preserved in `result.analogNetlists` so that
this distinction is reviewable. The initial and final passes are not presented
as one native ngspice event simulation.

## Coordinated transient execution

`coordinated.js` compiles and executes a versioned transient plan from the same
authoritative schematic. Its analog partition accepts resistors, capacitors,
inductors and independent V/I sources with DC/SIN/PULSE/PWL excitation.
`coordinated-digital.js` retains event-queue, driver and private sequential state
between advances while reusing the four-state gate and resolution functions.
Normal startup computes a DC solution; UIC applies the recorded capacitor
voltage and inductor current. Unsupported analog devices and singular networks
produce explicit errors.

Backward Euler advances stored analog state under the configured maximum step.
Pending digital events, source breakpoints, DAC ramp ends and converter sample
times subdivide that step. A possible scalar ADC crossing triggers trial solves
that localize the state change before accepting the next shared boundary.
Digital changes at that boundary settle, update DAC targets and influence the
following analog advance. This permits an analog/digital closed loop without
using a prerecorded final waveform. Pure combinational digital cycles remain
invalid.

ADCBUS samples at zero and each absolute sample period, quantizes a differential
voltage to a saturated unsigned 2–8-bit code and publishes after conversion
delay. Project settings require a positive delay shorter than the period.
DACBUS maps the whole known word to an ideal voltage source, retaining finite
linear edges and interrupted-ramp continuity. Its explicit startup code is
held only until the first known word; later X/Z is an error. The original
scalar DAC still requires known input at startup. See
[multibit-converters.md](multibit-converters.md).

The 1 ps event grid is scheduling precision, not analog numerical accuracy.
Backward Euler has step-dependent error and damping; reduce the maximum step
and compare the quantity being measured. The solver has no semiconductor,
op-amp, controlled-switch, noise, thermal or physical metastability model.
The wider analog library remains in ngspice.

`coordinated-worker.js` owns one session under protocol
`circuitbench-coordinated-worker-1`. `CoordinatedEngine.run` sends bounded
advance commands of at most 20,000 accepted steps, joins exact adjacent chunks,
enforces one run watchdog and closes the worker after completion. A partial
command reports its actual end and `done: false`; the next command continues
from that state. Joining never invents an uncomputed gap or linearly
interpolates analog values.

Continuous mode sends smaller advances of at most 2,000 accepted steps. Pause
retains the worker, clock/sample phase, private memory, stored analog state and
pending events. Live DIN/BUSIN or DC V/I changes apply at a completed boundary
and are recorded independently. Stop and circuit edits terminate the worker;
generation guards reject stale replies. Retention is an absolute-time recent
window, not a solver restart. See
[continuous-simulation.md](continuous-simulation.md).

## Seven-segment logic and observation

HEX7 is explicit combinational logic: seven four-input LUT outputs plus BUF/NOT
decimal-point logic, with the configured transport delay. Hex and BCD tables
use fixed eight-bit segment mapping; matching output/display active levels
control polarity. Unknown address bits use the existing LUT consensus rule.
SEG7 is a passive eight-bit input and contributes no digital driver. Its
rendered state comes from the matching captured bus events, with X/Z and a
missing observation represented distinctly. See
[seven-segment-display.md](seven-segment-display.md).

## Results and provenance

Pure digital results have a shared axis containing time zero, state-change
times and the run endpoint. Constant logic therefore still has a visible
duration. Each logic value is right-continuous: it is the settled state at
that timestamp and remains so until the next event.

Ngspice feed-forward mixed results use the union of the final analog sample times and digital event
times. Every original analog timestamp and value is retained exactly. Only
the analog rows added at digital event times are linearly interpolated.

`result.sampling` identifies this explicitly:

```js
{
  mode: 'event-union', // 'digital-events' for pure digital
  analogSampleIndices: [/* exact row positions of original final-pass samples */],
  analogInterpolation: 'linear', // 'none' for pure digital
  logicContinuity: 'right',
  timeResolution: 1e-12,
  description: '...'
}
```

`result.digitalEvents` retains change-only records shaped as
`{name: 'd(net)', events: [{time: 0, value: '0'}, ...]}`. Every signal has an
initial event. Sparse events are clipped to the returned axis endpoint,
including when a fractional-picosecond analog duration rounds upward in the
event kernel. Same-time changes have already been resolved into their settled
net state.

An aggregate bus vector is shaped as:

```js
{
  name: 'b(data)', kind: 'bus', unit: 'logic',
  width: 4, bitOrder: 'msb-first', values: ['00X1', '1010', /* ... */]
}
```

Its sparse event entry includes `name`, `kind`, `width`, `bitOrder` and the
literal-word `events` array. Same-time bit updates are aggregated into one
settled word; intermediate bit iteration order is not exposed as extra words.
Private bit traces are hidden from the public result, while explicit scalar
taps remain visible. Aggregate words preserve leading zeros and partial X/Z
states without numeric coercion. Their event times participate in the same
shared axis as visible scalar and analog traces.

Engine provenance identifies the JavaScript event kernel and, for ngspice
feed-forward mixed results, the unchanged ngspice binary separately. Ngspice
analog-only runs continue through the original `CircuitEngine` path with its
original result format.

Coordinated results use `sampling.mode: 'coordinated-events'`, actual accepted
analog rows, `analogInterpolation: 'none'` and the same literal, right-continuous
sparse logic contract. Continuous windows use
`sampling.mode: 'continuous-window'`, absolute `timeBounds`, and a boundary state at their
possibly nonzero start. The first retained value is not a newly observed edge.
`result.continuous` records the input history and window retention counts.
Portable snapshots preserve evidence, not a resumable worker. Timing evidence
can copy that continuous provenance independently of the full run.

## Limits and cancellation

The event kernel enforces at most 200,000 scheduled source/gate/state-bit
events, 255 expanded scalar nets and 600 scalar elements. Bus widths consume
the expanded bit budgets. The compiler applies conservative clock/pattern/gate
estimates and expansion guards before execution. Formatted simulation plans
are limited to 220,000 characters and generated text to 240,000 characters; oversized input produces a
bounded diagnostic instead of a partially executable plan. The combined result
is limited to 250,000 rows, 256 vectors including time, and two million values.
Analog replay decks are also checked against the 256 kB worker boundary.

Each bounded digital or ngspice replay stage uses a disposable worker. Successful, failed,
cancelled and timed-out workers are terminated. The coordinator applies one
watchdog across the complete run; Stop also prevents later replay stages from
starting. It does not merely hide the results of a continuing computation.

Coordinated analog bounds are 48 nodes, 80 matrix unknowns and 160 analog
elements. Finite coordinated results retain at most 250,000 points, 256 vectors,
250,000 sparse events and a combined two-million dense-value/event budget.
Continuous windows retain at most 30,000 points, one million dense values and
250,000 sparse events; the timeline is capped at 9,000 s. Their worker remains
alive while paused, and each command has a watchdog. Idle failure, malformed
messages, Stop and timeout close the session rather than silently restarting it.

## Verification and practical scope

[digital-validation.json](../evidence/digital-validation.json) records the
production modules, source hashes, actual calculations, tolerances and worker
counts for its stated foundation scope. The earlier 1.2 expansion proof covered
three focused mixed fixtures, its thirteen authored digital/mixed examples and
a separately executed LUT truth table. Its checks included half-adder truth tables,
unknown logic, flip-flop edge timing, tri-state contention/release, ADC
threshold timing, finite-edge DAC/RC response and a complete Schmitt
ADC → logic → DAC circuit. They also check bus alias bit ordering/X/Z, atomic
register hold/reset timing, counter wrap/reset, MUX/decoder uncertainty, exact
LUT enumeration, and a bus bit driving the analog RC filter. Source hashes in
the evidence identify the actual copied
modules used for that proof; they must be refreshed after compiler/runtime
edits, rather than inferred from an earlier run.

For the 1 kΩ / 1 nF RC fixture driven by a 5 V DAC edge starting at 1 µs with
a 10 ns rise, the measured 1.5 V crossing was approximately 1.361680960 µs
against the finite-ramp analytic reference 1.361679111 µs. The two-pass
Schmitt/logic/DAC fixture produced approximately 3.735796150 V at 4 µs against
3.735796753 V, within its 20 µV tolerance. A separate actual final-deck WASM
run confirmed exact preservation of every original sample in the union;
a fresh complete mixed replay produced identical vectors and event records.

Run the focused checks from the source tree:

```sh
node tests/digital.test.mjs
node tests/simulation.test.mjs
node tests/digital-expansion.test.mjs
node tests/truth-table.test.mjs
node scripts/prove-digital.mjs
```

The numerical proof uses the production browser modules through the existing
Node Worker API shim; the shim does not replace either simulator. These
results establish the recorded numerical and logic behavior, not browser UI,
physical-device accuracy, secure offline installation or production-host
acceptance. Those remain separately recorded release checks.

The current release's coordinated, display, continuous and advanced-study
checks are indexed in [VALIDATION.md](VALIDATION.md). Foundation observations
above retain their original numerical scope; they are not evidence that a
later source revision or new browser flow was tested without a corresponding
record.
