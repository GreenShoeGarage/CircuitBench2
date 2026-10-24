# Components, models, and provenance

All CircuitBench symbols, component definitions, example circuits, and `CB_*` model parameter sets are original educational material distributed under the application's MIT license. Model version: **`cb-models-1.0.0`**. The numerical implementation is ngspice. No bundled component is advertised as a characterized manufacturer part.

Each component retains pin definitions, parameter names/units/defaults, model binding, provenance, limitations, and a validation fixture. Exact model text and version are included in simulation snapshots. The manifest also has an FNV-1a content identifier for convenient change detection; it is not a cryptographic security signature. Release files have separate SHA-256 checksums.

## Library and pin mappings

| Part | Pins / ngspice order | Classification | Defaults and scope | Validation example |
| --- | --- | --- | --- | --- |
| Resistor | `1, 2` | Ideal lumped element | 10 kΩ; strictly positive resistance | Voltage divider, RC filter |
| Capacitor | `1, 2` | Ideal lumped element | 100 nF, initial voltage 0 V | RC step, rectifier |
| Inductor | `1, 2` | Ideal lumped element | 10 mH, initial current 0 A | RL step |
| Ground | `0` | Reference | All Ground symbols join SPICE node 0 | Every schematic example |
| Voltage source | `p, n` | Ideal independent source | 1 V DC, 1 V AC; DC/SIN/PULSE/PWL | Divider, filter, step |
| Current source | `p, n` | Ideal independent source | 1 mA DC/AC; positive current p → n | Current-source fixture in core validation |
| Diode | `a, k` | Generic junction | `CB_DIODE`, silicon-like | Rectifier |
| Red LED | `a, k` | Generic junction | `CB_LED`, approximate red forward-voltage behavior | LED driver |
| NPN | `c, b, e` | Generic BJT | `CB_NPN`, forward beta 100 | NPN driver |
| PNP | `c, b, e` | Generic BJT | `CB_PNP`, forward beta 80 | PNP driver |
| NMOS | `d, g, s`; body internally tied to `s` | Generic level-1 MOS | `CB_NMOS`, VTO 2 V; W/L 10 µm / 10 µm | MOSFET load |
| PMOS | `d, g, s`; body internally tied to `s` | Generic level-1 MOS | `CB_PMOS`, VTO −2 V; W/L 10 µm / 10 µm | PMOS driver |
| Controlled switch | `a, b, cp, cn` | Idealized voltage switch | `CB_SWITCH`; 1 Ω on, 1 GΩ off; 2.6 V on / 2.4 V off | Controlled switch |
| Op amp | `inp, inn, vp, vn, out` | Idealized supply-bounded amplifier | `CB_OPAMP`; nominal gain 100,000 V/V, output resistance 10 Ω, differential input resistance 1 GΩ | Non-inverting amplifier |

Current measurements use a stated direction. Native voltage-source and inductor branch currents follow their first terminal to their second terminal. A source delivering energy typically has negative current into its positive terminal. Resistor current is derived from the simulated complex or real terminal voltage difference divided by the configured resistance; it is not a separate solver. Differential voltage is the first selected node minus the second.

## Exact model cards

The authoritative cards are in `src/library.js`. These values are explicit assumptions, not fitted manufacturer data:

| Model | Significant parameters |
| --- | --- |
| `CB_DIODE` | IS 1e−14 A, N 1, RS 0.5 Ω, CJO 2 pF, TT 5 ns, BV 100 V |
| `CB_LED` | IS 1e−20 A, N 2, RS 8 Ω, CJO 10 pF, BV 5 V |
| `CB_NPN` | IS 1e−14 A, BF 100, VAF 100 V, IKF 0.1 A, CJE 10 pF, CJC 5 pF, TF 400 ps, TR 20 ns |
| `CB_PNP` | IS 1e−14 A, BF 80, VAF 80 V, IKF 0.1 A, CJE 10 pF, CJC 5 pF, TF 500 ps, TR 20 ns |
| `CB_NMOS` | Level 1, VTO 2 V, KP 0.02 A/V², LAMBDA 0.02 V⁻¹, RD/RS 0.5 Ω, CGSO/CGDO 100 pF/m, CBD/CBS 50 pF |
| `CB_PMOS` | Level 1, VTO −2 V, KP 0.01 A/V², LAMBDA 0.02 V⁻¹, RD/RS 0.5 Ω, CGSO/CGDO 100 pF/m, CBD/CBS 50 pF |
| `CB_SWITCH` | RON 1 Ω, ROFF 1 GΩ, VT 2.5 V, VH 0.1 V |
| `CB_OPAMP` | B-source tanh saturation between supplied rails; differential gain ~100,000 at small differential input; 1 GΩ differential input, 10 Ω output resistor |

Parameters omitted from these cards use the selected ngspice build's device defaults. Engine identification and exact card text travel with each run. Reproducible comparisons should retain both.

## Source excitation

DC determines operating-point excitation. AC amplitude and phase are separate settings used only by small-signal analysis. A SIN transient uses offset, amplitude, frequency, and delay. A PULSE transient uses low, high, delay, rise, fall, width, and period; rise/fall/width/period must be positive and the pulse must fit its period. PWL accepts 2–200 strictly increasing nonnegative time/value pairs such as `0,0; 1m,1; 2m,0`.

Capacitor voltage and inductor current initial values are meaningful when the transient **Start from initial conditions / UIC** option is enabled. The application records that choice and warns that it skips the DC operating point. Ordinary transient runs first establish their operating point.

## Known physical limitations

- Ideal R/C/L elements have no tolerance, thermal effects, leakage, ESR, dielectric behavior, winding resistance, magnetic saturation, or parasitic coupling unless explicitly represented by additional elements.
- Independent sources have no internal resistance or current/voltage compliance limit.
- Generic D/BJT models are instructional and have no package, safe-operating-area, or thermal characterization. A red-LED electrical model does not predict brightness, color shift, optical efficiency, or junction heating.
- Level-1 MOS models are simplified long-channel equations. They should not be used to sign off real power-device switching losses, gate charge, avalanche behavior, safe operating area, or thermal design.
- The switch has idealized instantaneous state change and hysteresis. It omits mechanical bounce, arcing, and contact aging.
- The op amp has explicit supply limits but omits finite bandwidth, slew rate, offset, bias current, supply current, common-mode limits, output current limit, and recovery from saturation. It is useful for low-frequency feedback topology exercises; it is not an identified op-amp model.

The simulator never silently replaces an unavailable or incompatible model. It stops before execution with a diagnostic and preserves the editable project.

## Import compatibility

Custom numeric `.model` cards are accepted only for D, NPN, PNP, level-1 NMOS/PMOS, and SW. The exact bundled op-amp subcircuit can round-trip, but arbitrary subcircuits and behavioral sources are outside the import subset. No external `.include` or `.lib` paths are loaded. Imported model text remains part of the user's project and snapshot; the user must establish redistribution permission for those imported cards. CircuitBench bundles no external manufacturer model files.

See `project-format.md` for the full import boundary and `evidence/example-validation.json` for measured fixture results, engine identification, and native-reference comparisons.

## Official technical references

- [ngspice documentation and user manual](https://ngspice.sourceforge.io/docs.html).
- [ngspice source and project](https://ngspice.sourceforge.io/).
- The original component/model definitions and defaults: `src/library.js`.
- The original worked circuits: `src/examples.js`.
