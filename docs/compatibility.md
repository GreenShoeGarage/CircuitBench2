# Supported components, analyses and interchange

This matrix defines CircuitBench's first-release analog scope. ngspice itself
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
limitations appear in the inspector and run diagnostics. Parameter changes
always start a fresh bounded simulation.

## Sources and analysis

| Capability | Supported |
|---|---|
| Operating point | `.op`, node voltages and supported branch currents |
| DC sweep | One independent voltage/current source; numeric start, stop and step |
| AC | Decade-spaced small-signal sweep; complex results, magnitude and phase |
| Transient | Fresh run, maximum time step, duration, optional explicit UIC |
| Source DC | Constant DC value; also sets the bias value for non-DC waveform sources |
| Source AC | Amplitude and phase around the operating point |
| Sine | Offset, amplitude, positive frequency, optional nonnegative delay |
| Pulse | Low/high, delay, positive rise/fall times, width and period |
| PWL | 2–200 strictly increasing nonnegative time/value pairs |
| Voltage measurement | Node-to-ground and differential A − B |
| Current measurement | Voltage-source and inductor branch currents; resistor current from terminal voltage / resistance |
| Comparison | One pinned baseline; matching named signals of the same analysis type |

Capacitor/inductor initial values are used with transient UIC. Without UIC,
ngspice finds an operating point first. Solver assistance, including gmin or
source stepping when reported, remains in the immutable run log and warning
state. Continuous simulation with carried state is not implemented.

## Project format

The native extension is `.circuitbench.json`. A portable envelope contains
`format: "CircuitBench"`, `formatVersion: 1`, an authoritative schema-version-1
`project`, saved `runs`, active-run identity and optional baseline identity.
The source model parser can also read a bare schema-version-1 project.

Electrical objects and layout are separate within that same project. Component
pin IDs, explicit connections, junctions, labels, analysis and probes are the
simulation authority. Wire crossing coordinates have no independent electrical
meaning. Project validation rejects malformed IDs, missing endpoints, invalid
positions, unsupported schema versions and oversized lists. This is the first
public schema; no legacy version migration is needed. Unknown future schemas
are rejected while preserving the original file.

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
  microcontroller programs or digital logic simulation.
- Reconstructing a schematic layout from a SPICE deck. Imported text opens a
  separate netlist-oriented workspace.
- Noise, distortion, Monte Carlo, parameter stepping, sensitivity, pole-zero,
  multitone, swept-temperature or multi-analysis batches as first-release UI
  analyses.

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
| Portable JSON import | 40 MiB |
| SPICE text import | 200 kB |
| Saved runs | 12 |
| Imported saved numerical samples | 4 million |
| AC density | 1–1,000 points per decade; total request at most 20,000 |
| DC sweep request | 20,000 intervals |
| Transient requested duration / maximum step | 200,000 |
| Preflight estimated output budget | 1.5 million samples |
| Engine returned output | 250,000 points, 256 vectors and 2 million samples |
| UI watchdog | 30 seconds |

Adaptive transient stepping can produce more samples than the simple requested
interval count. If it exceeds the engine limit, the run is rejected explicitly.
Reducing experiment scope or increasing a time step can make a bounded run
practical, but choose settings adequate for the behavior being measured.

Browser memory/storage quotas and installed-device performance remain additional
limits. CSV and JSON exports retain raw numerical results; SVG plotting may
simplify drawing points without changing those stored arrays.
