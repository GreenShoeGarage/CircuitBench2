# Supported components, analyses and interchange

This matrix defines CircuitBench 2.0.0-rc.2's analog, digital, display, converter,
timing, independent-study and continuous mixed-signal scope. ngspice itself
has additional capabilities; their presence in the numerical engine does not
make them supported in the schematic editor or import subset.

## Curated schematic library

| Type | Pin order / identifiers | Model | Adjustable fields | Principal limitation |
|---|---|---|---|---|
| Resistor | 1, 2 | Ideal R | Resistance | No parasitics, temperature coefficient or tolerance model |
| Capacitor | 1, 2 | Ideal C | Capacitance, initial voltage | No ESR, leakage, dielectric absorption or voltage coefficient |
| Inductor | 1, 2 | Ideal L | Inductance, initial current | No winding resistance, core loss or saturation |
| Ground | 0 | SPICE reference node 0 | None | Reference only; not protective-earth or grounding impedance |
| Voltage source | p (+), n (−) | Ideal independent V | DC/AC values; sine, pulse or PWL fields | No source impedance or power limitation unless explicitly added |
| Current source | p, n | Ideal independent I | DC/AC values; sine, pulse or PWL fields | Requires a valid return path; no compliance-voltage model |
| Diode | a, k | `CB_DIODE` | Fixed curated parameter card | Generic silicon behavior; no selected manufacturer's characterization |
| Red LED | a, k | `CB_LED` | Fixed curated parameter card | Electrical junction only; no brightness, thermal or optical prediction |
| NPN | c, b, e | `CB_NPN` | Fixed curated parameter card | Educational small-signal BJT; no thermal or SOA model |
| PNP | c, b, e | `CB_PNP` | Fixed curated parameter card | Educational small-signal BJT; no thermal or SOA model |
| NMOS | d, g, s | `CB_NMOS`, level 1 | Width and length | Body tied to source; unsuitable for characterized power-switching losses |
| PMOS | d, g, s | `CB_PMOS`, level 1 | Width and length | Body tied to source; same limitations as NMOS |
| Controlled switch | a, b, cp, cn | `CB_SWITCH` | Fixed curated parameter card | 1 Ω on, 1 GΩ off, 2.5 V threshold ±0.1 V hysteresis; no physical contacts |
| Operational amplifier | inp, inn, vp, vn, out | `CB_OPAMP` | External circuit and supplies | 100,000 V/V bounded static gain, 1 GΩ differential input, 10 Ω output; no finite bandwidth, slew, supply current or common-mode limits |

Model set version is `cb-models-1.0.0`. These are original CircuitBench
educational parameter sets under MIT, described in `src/library.js`. Each
bundled model identifies a worked-example fixture. All model assignments and
pin mappings are explicit. Missing or incompatible models are errors, never
silently replaced by an ideal element.

The word “generic” is consequential: a simulated circuit may illustrate a
principle without predicting a purchased component's measured behavior. Model
limitations appear in the inspector and run diagnostics. Circuit/property edits
require a fresh experiment and stop an active continuous session. The explicit
Live inputs control can instead change eligible sources while retaining state.

### Analog solver availability

| Component or behavior | ngspice route | Coordinated transient |
|---|---|---|
| R/C/L, reference and independent V/I | Supported | Supported |
| DC/SIN/PULSE/PWL transient excitation | Supported | Supported |
| Diode/LED, BJT, MOS, controlled switch, op amp | Curated models supported | Rejected; no substitute model |
| Operating point, DC sweep, small-signal AC | Supported analyses | Transient only; a startup DC solution is not an exposed separate analysis |
| Scalar bridges | Feed-forward replay | Causal shared analog/digital time |
| Multibit conversion and mixed feedback | Rejected by replay preflight | Supported within the R/C/L and independent-source subset |
| Continuous state, pause/step/live sources | Not exposed through the ngspice facade | Supported with bounded rolling history |

The coordinated engine uses backward Euler and a fixed maximum analog step,
subdivided by events and breakpoints. Check numerical convergence by reducing
that step. Its 1 ps event grid is not a statement of analog physical accuracy.

## Digital and mixed-signal schematic library

| Type | Pins | Adjustable behavior | Scope |
|---|---|---|---|
| Logic input (DIN) | out | Literal 0/1/X/Z | Constant logic driver |
| Digital voltage source (DVS) | Digital out; optional analog p/n | Binary state; digital-only or digital + voltage; low/high voltage, finite rise/fall | Direct scalar logic and optional explicit ideal voltage drive; X/Z contention stops voltage output |
| Logic state indicator (DLED) | Scalar digital in | None | Passive red HIGH lamp; dark LOW, amber X, outlined Z, neutral unavailable result; no LED current model |
| Clock | out | Period, high duty cycle (%), start delay | Event-driven binary clock |
| BUF / NOT | in, out | Propagation delay | Four-state buffer/inverter |
| AND / OR / XOR / NAND / NOR / XNOR | a, b, out | Propagation delay | Two-input four-state logic |
| TRI | in, en, out | Propagation delay | Active-high tri-state enable |
| DFF | d, clk, q | Clock-to-Q delay, initial state | Rising-edge storage; no setup/hold or metastability |
| ADC | in, ref (analog), out (digital) | Low/high thresholds, threshold/Schmitt mode | One-bit sensing; ngspice sampled interpolation or coordinated trial-step crossings |
| DAC | in (digital), out/ref (analog) | Low/high voltage, rise/fall time | One-bit ideal PWL voltage drive; X/Z inputs rejected |
| BUSIN | out | Width 1–8, literal or numeric word | Independently resolved four-state bits |
| PATTERN | out | Width 1–8, 1–200 timed words, optional repeat period | Explicit t=0; distinct 1 ps event times; shared event budget |
| SLICE | in, out | Input width, first bit, bit count | Passive bidirectional aliases; no delay, truncation, or state conversion |
| JOIN | a, b, out | A/B widths totaling at most 8 | A forms low bits; B forms upper bits; passive electrical aliases |
| REGISTER | d, clk, en, rst, q | Width 1–8, initial word, output delay | Atomic rising-edge capture; synchronous reset wins over enable |
| COUNTER | clk, en, rst, q | Width 1–8, initial word, output delay | Unsigned modulo-2^width; private synchronous state |
| MUX | a, b, sel, out | Width 1–8, propagation delay | Two data inputs; scalar selection; conservative unknown bits |
| DECODER | in, en, out | Input width 1–3, propagation delay | Enabled 2/4/8-output one-hot decoder |
| LUT | in, out | 1–4 input bits, 1–8 output bits, every table row, delay | Complete bounded row data; no expressions, wildcards, or executable code |
| HEX7 | in (4 bits), dp (1 bit), out (8 bits) | Hex/BCD, active-high/low, delay | Explicit timed decoder; BCD 10–15 blank; decimal point independent |
| SEG7 | in (8 bits) | Active-high/low | Passive segment indicator; bits a–g,dp map to 0–7; X/Z distinct; no LED electrical model |
| ADCBUS | p/n (analog), q (digital) | Width 2–8, range, sample period, conversion delay | Coordinated only; unsigned nearest-code sampling, saturation, startup X |
| DACBUS | d (digital), p/n (analog) | Width 2–8, range, rise/fall, startup code | Coordinated only; whole-word finite-edge voltage drive; later X/Z rejected |

Logic requires transient analysis and uses literal states 0, 1, X and Z.
Logic-only circuits do not require analog ground. Direct analog/digital wire,
label or junction joins are rejected. Digital widths must match at every direct
wire, junction, and label alias; use explicit slices/joins for bit mapping.
Widths come from trusted part parameters and cannot be changed by importing
custom pin metadata. A combinational-only cycle is rejected after bit aliases
collapse; a DFF or register can close a digital state loop. Ngspice mixed replay
rejects analog paths from DAC output back to ADC input. Coordinated transient
accepts mixed feedback within its separate supported analog subset. Read [the digital/mixed guide](digital-mixed-signal.md)
for exact timing and bridge assumptions. These are educational behavioral
models, not characterized manufacturer logic ICs or physical converters.

The scalar/bridge model set remains `cb-digital-models-1.0.0`; the nine bus and
table models use `cb-bus-models-1.0.0`. The two display models use
`cb-display-models-1.0.0` and the two multibit converters use
`cb-converters-1.0.0`. DVS and DLED add `cb-logic-io-1.0.0`. Together with the analog library there
are 43 parts and 37 explicit model records. Words are stored and displayed
MSB first; bit zero is least significant. A word of width one remains a scalar
logic signal. Existing ADC/DAC parts remain one-bit bridges.

## Sources and analysis

| Capability | Supported |
|---|---|
| Operating point | Analog `.op`, node voltages and supported branch currents |
| DC sweep | Analog; one independent voltage/current source; numeric start, stop and step |
| AC | Analog decade-spaced small-signal sweep; complex results, magnitude and phase |
| Transient | Fresh bounded run, maximum time step and duration; ngspice analog-only UIC and coordinated component initial conditions |
| Continuous transient | One coordinated worker; Pause/Resume/Step, live DIN/DVS/BUSIN/DC V/I, absolute-time recent window; DVS accepts only 0/1 |
| Source DC | Constant DC value; also sets the bias value for non-DC waveform sources |
| Source AC | Amplitude and phase around the operating point |
| Sine | Offset, amplitude, positive frequency, optional nonnegative delay |
| Pulse | Low/high, delay, positive rise/fall times, width and period |
| PWL | 2–200 strictly increasing nonnegative time/value pairs |
| Voltage measurement | Node-to-ground and differential A − B |
| Current measurement | Voltage-source and inductor branch currents; resistor current from terminal voltage / resistance |
| Logic measurement | Literal 0/1/X/Z with stepped lanes and state-at-time cursors |
| Bus measurement | Explicit 2–8 bit MSB-first words with width metadata and X/Z retained |
| Truth-table experiment | Pure combinational circuit; enumerate selected DIN/digital-only DVS/BUSIN inputs, up to 8 bits and 32 output traces |
| Mixed comparison | Analog voltage and logic lanes on a shared time axis |
| Comparison | One pinned baseline; matching named signals of the same analysis type |
| Analog parameter sweep | Independent analog-only schematic trials, one eligible parameter, 2–64 linear/log values |
| Analog tolerance study | 1–64 independent trials, 1–8 eligible parameters, uniform relative variation, recorded 32-bit seed |

Capacitor/inductor initial values are used with transient UIC. Without UIC,
ngspice finds an operating point first. Solver assistance, including gmin or
source stepping when reported, remains in the immutable run log and warning
state. The ngspice/native digital and mixed replay route requires normal t=0
startup and rejects UIC. Coordinated transient supports UIC and carries state
across continuous updates and pauses. Stop ends that worker; saved continuous
windows are inspectable results, not resumable execution checkpoints.

Digital-only DVS exposes no analog terminals and needs no ground. Its voltage
mode adds explicit `p`/`n` pins with a default 0/5 V range and 1 µs edges. The
initial voltage matches the starting state. Live DVS changes retain analog
state and follow the configured edges; DIN and BUSIN keep their 0/1/X/Z rules.
DLED observes the current revision's saved events at Cursor A or the latest
retained time. No result is distinct from LOW. See [logic-io.md](logic-io.md).

The truth-table experiment runs each binary assignment through the timed event
kernel with a settling interval covering the longest combinational path.
Unselected constant inputs retain their explicit project values. Clocks,
patterns, flip-flops, registers, counters, analog parts and bridges are outside
this experiment. The table is immutable evidence with its own captured circuit,
plan, selections, engine identity and export. It does not replace transient
hazard, clock-domain, setup/hold, or physical metastability analysis.

## Project format

The native extension is `.circuitbench.json`. A portable envelope contains
`format: "CircuitBench"`, `formatVersion: 1`, an authoritative schema-version-1
`project`, saved `runs`, optional `truthTables`, `timingMeasurements` and
`analogExperiments`, active-run identity and optional baseline identity.
The source model parser can also read a bare schema-version-1 project.

Electrical objects and layout are separate within that same project. Component
pin IDs, explicit connections, junctions, labels, analysis and probes are the
simulation authority. Wire crossing coordinates have no independent electrical
meaning. Project validation rejects malformed IDs, missing endpoints, invalid
positions, unsupported schema versions and oversized lists. Schema 1 is retained
across 1.0, 1.1, 1.2, 1.3 and 2.0: old analog/scalar projects retain their
topology. A missing `analysis.solver` normalizes to `ngspice`. Bus pins
derive their widths from new part parameters and keep fixed pin addresses.
Older builds do not understand the new component types. Unknown future schemas
are rejected while preserving the original file.

Continuous window provenance is nested in a normal saved run's
`result.continuous`; it is not a top-level resumable session object. Timing
records can copy that provenance and live-input history independently.
See [project-format.md](project-format.md) for bounds and import checks.

## SPICE import subset

Files `.cir`, `.sp`, `.spice` and `.txt` are accepted as text, subject to the
syntax checks below. A conventional first-line title, `*` comments, `$` trailing
comments, blank lines and `+` continuations are supported. Names use letters,
digits and underscores; node `0` is required as ground.

| Syntax | Boundary |
|---|---|
| `Rname n1 n2 value` | Positive numeric resistance |
| `Cname n1 n2 value [IC=value]` | Positive numeric capacitance |
| `Lname n1 n2 value [IC=value]` | Positive numeric inductance |
| `Vname` / `Iname` | Two nodes; numeric DC, AC amplitude/phase, one supported waveform |
| `SIN(offset amplitude frequency [delay])` | No damping or additional vendor fields |
| `PULSE(low high delay rise fall width period)` | Exactly seven numeric arguments; positive rise/fall/width and valid period |
| `PWL(t0 v0 t1 v1 …)` | Numeric pairs with increasing times; no repeat/file expressions |
| `Dname a k model` | Declared numeric diode model or a bundled diode/LED card |
| `Qname c b e model` | Declared NPN/PNP model; no extra substrate node or multiplicity |
| `Mname d g s body model W=… L=…` | Explicit positive W/L; level-1 NMOS/PMOS only |
| `Sname a b cp cn model` | Declared SW or bundled switch |
| `Xname inp inn vp vn out CB_OPAMP` | Only the exact bundled op-amp subcircuit |
| `.model name TYPE(parameters)` | D, NPN, PNP, NMOS, PMOS or SW with allowlisted numeric parameters |
| `.op` | No arguments |
| `.dc source start stop step` | One independent source |
| `.ac dec points start stop` | Decade sweep only; not linear or octave import |
| `.tran step stop [0 [maxstep]] [uic]` | Nonzero output-start time unsupported |
| `.save all` | Arbitrary save expressions unsupported |
| `.temp number` | Parsed, then superseded by the experiment temperature control with a diagnostic |
| `.options` / `.option` | Only numeric positive reltol, abstol, vntol, itl1, itl4; superseded by the recorded experiment settings with a diagnostic |
| `.end` | Accepted |

Only one imported analysis is allowed. It initializes the controls. The
recorded controls subsequently determine the executed analysis, avoiding hidden
conflicts between text and settings. The exact generated deck is visible before
and after a run.

Bundled model names are reserved: importing a definition with a reserved name
requires the exact bundled definition. User-defined numeric cards use their own
name and are identified as user-supplied in run provenance. The importer records
the card but cannot infer permission to redistribute somebody else's model.

Native digital, bridge, bus, LUT, display and multibit `CB_*` names are not SPICE device cards and
cannot be substituted into these bindings. Digital plans and marked mixed
replay passes are rejected by the standalone importer with guidance to open
the native project JSON. This retains explicit widths, timing, state, and
bridge semantics instead of silently dropping them. A standalone deck also
cannot preserve the coordinated converter schedule or closed-loop execution.

### Allowed numeric model parameters

| Model type | Parameter names |
|---|---|
| D | IS, N, RS, CJO, VJ, M, TT, BV, IBV, EG, XTI, FC, TNOM |
| NPN/PNP | IS, BF, BR, VAF, VAR, IKF, IKR, ISE, NE, ISC, NC, RB, RC, RE, CJE, VJE, MJE, CJC, VJC, MJC, TF, TR, XTB, EG, XTI, TNOM |
| NMOS/PMOS | LEVEL=1, VTO, KP, GAMMA, PHI, LAMBDA, RD, RS, CBD, CBS, CGSO, CGDO, CGBO, PB, MJ, MJSW, CJ, CJSW, TOX, TNOM |
| SW | RON, ROFF, VT, VH |

Plain SPICE suffixes T, G, Meg, k, m, u, n, p and f are accepted in imported
numbers. SPICE is case-insensitive here: M means milli. Schematic fields use
human-facing case-sensitive M/mega semantics instead. Export normalizes to
scientific notation so the distinction cannot change exported values.

## Unsupported import and design domains

- `.include`, `.lib`, external files, control blocks, shell commands and arbitrary
  command scripts.
- Arbitrary `.subckt`, `.param`, behavioral expressions, dependent sources,
  named vendor dialects, BSIM/process-kit models or plugin model code.
- PCB layout, Gerber, KiCad/Eagle project import, TINA design files, HDL,
  microcontroller programs or external digital/HDL netlist formats.
- Arbitrary bus widths, implicit bit truncation/extension, asynchronous
  register/counter reset and device-specific converter physics. The current
  state elements use synchronous active-high reset; multibit converters are
  unsigned 2–8-bit ideal models.
- Reconstructing a schematic layout from a SPICE deck. Imported text opens a
  separate netlist-oriented workspace.
- Noise, distortion, sensitivity, pole-zero, multitone, swept-temperature or
  heterogeneous multi-analysis batches. The analog-study UI supports the
  documented independent parameter/tolerance trials; imported `.step`,
  `.param` and Monte Carlo directives remain outside the SPICE subset.

An unsupported file produces a diagnostic; no demonstration data or alternate
solver is substituted.

## Resource boundaries

| Resource | Limit |
|---|---:|
| Schematic or imported components | 300 |
| Explicit connections | 1,600 |
| Junctions / labels | 600 each |
| Annotations | 300 |
| Selected probes | 100 |
| Portable JSON import | 256 MiB |
| SPICE text import | 200 kB |
| Saved runs | 12 |
| Saved truth-table records | 4 |
| Saved timing records | 12; one million selected events and 16 MiB total |
| One timing measurement | 250,000 selected events; 256 reported occurrences |
| Saved analog studies | 6; 500,000 selected samples and 16 MiB total |
| One analog study | At most 64 trials; 8 tolerance parameters; 250,000 selected samples and 8 MiB |
| Imported saved numerical samples | 4 million |
| Bus width | 1–8 bits; width 1 is scalar |
| Multibit converter width | 2–8 bits |
| ADCBUS schedule | Period and delay ≥1 ps; rounded delay strictly shorter than rounded period |
| LUT dimensions | 1–4 input bits, 1–8 output bits, all binary rows required |
| Timed pattern | 1–200 time/word entries per source |
| Expanded digital graph | 255 distinct scalar bit nets, 600 scalar elements |
| Digital execution | 200,000 scheduled events; 1 ps resolution |
| Formatted native plan | 220 kB |
| Generated simulation input | 240 kB |
| Truth-table experiment | 8 selected input bits / 256 rows; 32 output traces; shared event budget |
| AC density | 1–1,000 points per decade; total request at most 20,000 |
| DC sweep request | 20,000 intervals |
| Analog transient requested duration / maximum step | 200,000 |
| Analog preflight estimated output budget | 1.5 million samples |
| Engine returned output | 250,000 points, 256 vectors and 2 million samples |
| Coordinated analog graph | 48 nodes, 80 matrix unknowns, 160 elements |
| Coordinated finite advance | At most 20,000 accepted steps per command; exact adjacent result joining |
| Coordinated finite run output | 250,000 points, 256 vectors, 250,000 sparse events; 2 million dense values + events combined |
| Continuous retained output | 30,000 points, one million dense values, 250,000 sparse events |
| Continuous advance and timeline | 2,000 accepted steps per command; absolute time at most 9,000 s |
| Continuous input history | 2,000 groups of 1–64 source updates |
| UI finite-run watchdog | 30 seconds for the complete run |
| Continuous command watchdog | 15 seconds |

Adaptive transient stepping can produce more samples than the simple requested
interval count. If it exceeds the engine limit, the run is rejected explicitly.
Reducing experiment scope or increasing a time step can make a bounded run
practical, but choose settings adequate for the behavior being measured.
Pure digital runs advance by events rather than by the analog maximum-step
setting. Bus expansion is charged against the scalar bit/element limits;
displaying a word in one lane does not bypass those bounds. Oversized plans
fail compilation with a bounded diagnostic record, preserving the original
project and parameters.

Browser memory/storage quotas and installed-device performance remain additional
limits. CSV and JSON exports retain stored results and identify ngspice
mixed-grid interpolation. Coordinated chunk joining uses actual accepted
analog states without interpolation; continuous retention removes old complete
intervals and keeps all events within the remaining window.
Original analog sample positions and sparse digital events remain recorded.
SVG plotting may simplify analog drawing without changing stored arrays.

## Digital timing measurements

Five event-based measurements are available on completed digital/mixed
transient runs with preserved event streams: delay, pulse width, period,
frequency and duty cycle. Scalar signals and explicitly selected bus bits are
supported, including completed continuous windows whose absolute first time
is nonzero. Their first boundary state is not an edge. Analog threshold measurements, setup/hold constraints, physical
metastability, negative-delay correlation and arbitrary bus-word numeric edges
are outside this release. See [timing-measurements.md](timing-measurements.md)
for exact X/Z, boundary, pairing, resolution and storage rules.

The focused guides give the complete user-facing contracts for
[continuous simulation](continuous-simulation.md),
[multibit converters](multibit-converters.md),
[digital voltage sources and red logic indicators](logic-io.md),
[seven-segment displays](seven-segment-display.md) and
[advanced analog experiments](analog-experiments.md).
