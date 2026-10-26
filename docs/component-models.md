# Components, models, and provenance

All CircuitBench symbols, component definitions, example circuits, and `CB_*` models are original educational material distributed under the application's MIT license. CircuitBench 2.0.0-rc.2 has **43 parts and 37 model records**: 14 analog parts use ideal built-in elements or **8 unchanged analog model cards at `cb-models-1.0.0`**; the 12 scalar digital parts and 2 explicit bridges retain **14 definitions at `cb-digital-models-1.0.0`**; 9 bus/pattern/state/table parts retain **9 definitions at `cb-bus-models-1.0.0`**; 2 segment-display parts and 2 multibit converters use **2 definitions at `cb-display-models-1.0.0`** and **2 at `cb-converters-1.0.0`**; and the digital voltage source and scalar logic indicator add **2 definitions at `cb-logic-io-1.0.0`**. No bundled component is advertised as a characterized manufacturer part.

The full analog library uses ngspice WebAssembly. The separately selected coordinated transient engine supports ideal R/C/L and independent V/I sources with original backward-Euler modified nodal analysis, incremental digital events and explicit converter timing. Native logic uses literal `0`, `1`, `X`, and `Z` states. The bundled ngspice build has XSPICE disabled. Native digital definitions describe the application's own kernels and bridges; they are not ngspice code models or SPICE `.model` cards. Unsupported coordinated analog parts are rejected rather than replaced.

Each component retains pin definitions, parameter names/units/defaults, model binding, provenance, limitations, and a validation fixture. Exact model text and version are included in simulation snapshots. The manifest also has an FNV-1a content identifier for convenient change detection; it is not a cryptographic security signature. Release files have separate SHA-256 checksums.

## Library and pin mappings

| Part | Pins / ngspice order | Classification | Defaults and scope | Validation example |
| --- | --- | --- | --- | --- |
| Resistor | `1, 2` | Ideal lumped element | 10 kΩ; strictly positive resistance | Voltage divider, RC filter |
| Capacitor | `1, 2` | Ideal lumped element | 100 nF, initial voltage 0 V | RC step, rectifier |
| Inductor | `1, 2` | Ideal lumped element | 10 mH, initial current 0 A | RL step |
| Ground | `0` | Reference | All Ground symbols join SPICE node 0 | Analog and mixed schematic examples |
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

## Native digital parts and bridges

Pins carry trusted `domain` and `direction` metadata in `src/library.js`. Existing analog pin addresses are unchanged. A digital input is distinct from an analog voltage input even when both are drawn at the same position or have similarly named labels. Wires, junctions, and equal labels may only join compatible domains; conversion requires an ADC, DAC, or the digital voltage source's explicitly enabled voltage terminals.

| Type / model | Pin order and domains | Parameters and defaults | Exercised example |
| --- | --- | --- | --- |
| `DIN` / `CB_DIN` | Digital output `out` | `state`: `0`, `1`, `X`, or `Z`; default `0` | `logic-gates` |
| `DVS` / `CB_DVS` | Digital `out`; optional analog `p` (+), `n` (−) when voltage mode is enabled | `state` 0/1, default 0; `outputMode` `logic` (default) or `logic-voltage`; `low` 0 V, `high` 5 V, `rise`/`fall` 1 µs | `digital-voltage-source`, `digital-voltage-rc` |
| `DLED` / `CB_DLED` | Passive scalar digital input `in` | No parameters; red only at HIGH (1); LOW, X, Z and unavailable results are distinct | `logic-indicator-states` |
| `CLOCK` / `CB_CLOCK` | Digital output `out` | `period` 1 ms; `duty` 50%; `delay` 0 s | `digital-half-adder` |
| `BUF`, `NOT` / corresponding `CB_*` | Digital input `in`, output `out` | `delay` 10 ns | `logic-gates` |
| `AND`, `OR`, `XOR`, `NAND`, `NOR`, `XNOR` / corresponding `CB_*` | Digital inputs `a`, `b`; output `out` | `delay` 10 ns | `logic-gates`, `digital-half-adder` |
| `TRI` / `CB_TRI` | Digital data `in`, active-high enable `en`, output `out` | `delay` 10 ns | `tri-state-bus` |
| `DFF` / `CB_DFF` | Digital data `d`, rising-edge clock `clk`, output `q` | `delay` 10 ns; `initial` `X` (also `0` or `1`) | `dff-divider` |
| `ADC` / `CB_ADC` | Analog inputs `in`, `ref`; digital output `out` | `low` 1.5 V; `high` 3.5 V; `mode` `threshold` or `schmitt`, default `threshold` | `adc-ramp`, `mixed-chain` |
| `DAC` / `CB_DAC` | Digital input `in`; analog output `out`, reference `ref` | `low` 0 V; `high` 5 V; `rise` and `fall` 1 ns | `clock-dac-rc`, `mixed-chain` |

The manifest stores each native model's exact JSON definition, including port metadata, defaults, and state/timing semantics. Component parameters record deviations from defaults. Native `CB_*` names cannot be substituted into imported SPICE device cards.

### States and timing

All drivers on a digital net resolve together with equal strength. `Z` releases a driver. A net with no active drivers resolves to `Z`; opposing known drivers or any active unknown driver resolve to `X`. Ordinary gates treat a `Z` input as unknown. AND with a known `0` resolves to `0`, and OR with a known `1` resolves to `1`, even if the other input is unknown. XOR requires both inputs to be known. Inverted gate types invert these results. A tri-state buffer releases `Z` when enable is `0`, passes known data when enable is `1`, and otherwise drives `X`.

Native events use a deterministic **1 ps resolution** and transport delays: a short pulse is not removed merely because it is shorter than a gate delay. Times round to the event grid. Initial combinational states settle at time zero; this initialization is not a clock edge. A DFF begins at its explicit `initial` state, samples post-batch data on a rising clock edge, and updates Q after its delay. An ambiguous possible rising edge produces `X`. There is no setup/hold, metastability, supply current, drive-strength, or electrical-loading model.

`CLOCK.duty` is stored in **percent**, so `50` and `50%` both mean a 50% high duty cycle. The compiler converts it to the fractional `duty: 0.5` used by the kernel. High width is derived from the quantized period and duty; there is no independent `highWidth` parameter. Both high and low intervals must be at least 1 ps. With zero start delay the clock is high at t=0; with positive delay it starts low and first rises at that delay.

### Bridge behavior and replay boundary

The ADC observes `V(in) − V(ref)` with infinite input impedance. It does not connect its input and reference or provide a return path to ground. In threshold mode, values at or below `low` produce `0`, values at or above `high` produce `1`, and the intervening band produces `X`. Schmitt mode retains its previous known state inside the band; an initial value inside the band remains `X` until a threshold is reached. In ngspice feed-forward replay, crossing times are reconstructed between actual analog samples. Coordinated execution localizes crossings through trial analog solves before accepting a shared event boundary. Both methods depend on the analog maximum step; a 1 ps event grid does not assert that analog accuracy.

The DAC is an ideal voltage source between `out` and `ref`, driven from resolved logic with finite linear rise/fall edges. Interrupted edges continue from their current voltage. Every input state must be known `0` or `1`; an `X` or `Z` stops execution with a diagnostic. Ngspice replay generates its PWL drive in advance; coordinated execution updates that drive as events occur. The DAC has no output resistance, current limit, power rail, or physical converter behavior unless additional supported analog parts represent it.

With **ngspice · analog / feed-forward mixed** selected, mixed circuits run an analog input stage, native digital events, and an analog output stage as needed. The compiler conservatively rejects every analog dependency path from a DAC output or reference to an ADC input or reference, excluding only common node 0. It includes passive, semiconductor, and controlled-device paths; an apparently one-way or inactive analog device is not used to waive this restriction. Independent input and output blocks may share ground. The coordinated engine instead advances analog and digital state together and permits feedback within its R/C/L and independent-source subset.

Digital and mixed projects require transient analysis. The ngspice replay route requires normal t=0 startup; coordinated transient also supports explicit component initial conditions. Pure combinational digital feedback is rejected; an explicit DFF or register may break the cycle. The complete project JSON preserves the native experiment. A digital plan or one mixed analog pass cannot round-trip through the standalone SPICE importer.

## Bus and table parts introduced in 1.2

Bus widths are **1–8 bits**, derived from each part's trusted parameter rules by `getPins(component)`. Pins keep their identifiers and positions when their width changes. A width of one is a scalar signal; a wider bus is a collection of independently resolved four-state bits. Wires, equal labels, and junctions must agree in width. The editor rejects conflicting width edits before changing the component and requires an explicit slice/join to connect different widths.

| Type / model | Ports and width rule | Parameters and defaults | Exercised example |
| --- | --- | --- | --- |
| `BUSIN` / `CB_BUSIN` | Output `out`: `width` bits | `width` 4; `value` `0x0` | `bus-slice-join` |
| `PATTERN` / `CB_PATTERN` | Output `out`: `width` bits | `width` 4; `pattern` `0,0000; 1m,0001; 2m,0010; 3m,0011`; `repeat` 0 s (once) | `bus-register`, `bus-dac-bit` |
| `SLICE` / `CB_SLICE` | Passive `in`: `width`; passive `out`: `count` | `width` 4; `lsb` 0; `count` 1 | `bus-slice-join` |
| `JOIN` / `CB_JOIN` | Passive `a`: `aWidth`; `b`: `bWidth`; `out`: their sum, at most 8 | `aWidth` 2; `bWidth` 2 | `bus-slice-join` |
| `REGISTER` / `CB_REGISTER` | Input `d` and output `q`: `width`; scalar `clk`, `en`, `rst` | `width` 4; `initial` `0x0`; `delay` 10 ns | `bus-register` |
| `COUNTER` / `CB_COUNTER` | Output `q`: `width`; scalar `clk`, `en`, `rst` | `width` 4; `initial` `0x0`; `delay` 10 ns | `bus-counter` |
| `MUX` / `CB_MUX` | Inputs `a`, `b` and output `out`: `width`; scalar `sel` | `width` 4; `delay` 10 ns | `bus-mux-decoder` |
| `DECODER` / `CB_DECODER` | Input `in`: `inputBits` (1–3); scalar `en`; output `out`: 2^inputBits | `inputBits` 2; `delay` 10 ns | `bus-mux-decoder` |
| `LUT` / `CB_LUT` | Input `in`: `inputBits` (1–4); output `out`: `outputBits` (1–8) | `inputBits` 2; `outputBits` 2; `table` `00:00; 01:01; 10:01; 11:10`; `delay` 10 ns | `truth-table-adder` |

### Bit ordering and electrical aliases

Displayed and stored bus words are **MSB first**, so `1001` represents bits 3 through 0. Bit 0 is the least-significant bit. A slice maps `out[i] = in[lsb + i]`; first bit plus count must fit its input width. A join places A in the low bits and B in the upper bits. For example, joining A=`01` with B=`10` produces `1001`.

Slices and joins are bidirectional electrical aliases with zero delay. They do not evaluate a gate or create a driver, and they preserve `Z` and per-bit contention. Alias loops collapse to the same bit nets. Combinational-cycle checking runs after that collapse, so an apparent path through bus notation cannot conceal a feedback loop. A one-bit slice can connect a bus to the existing one-bit ADC/DAC and scalar gates; the bridge itself does not become a multibit converter.

### Word and pattern entry

Use an exact-width word containing `0`, `1`, `X`, and `Z`, or a known unsigned value with a `0b`, `0x`, or `0d` prefix. Numeric forms are padded with leading zeros and checked for overflow; bare words are never automatically extended or truncated. Thus `1010`, `0b1010`, `0xA`, and `0d10` all represent the same four-bit value. Use the lowercase **`0x`** marker for hexadecimal. An uppercase `X` inside an exact-width literal, such as the three-bit word `0X0`, remains an unknown bit. Register/counter initial words may contain `X` but not `Z`.

A pattern has 1–200 `time,word` entries separated by semicolons or newlines. The first entry must be at time zero. Subsequent times must remain distinct and increasing after rounding to the 1 ps grid. With repeat zero, the last word is held. A positive repeat period must be later than the last event; the first word is applied again at each repeat boundary. Repetition and all bit transitions count toward the shared event budget. No external file, executable expression, or HDL text is interpreted.

### State, selection, and complete tables

Registers and counters have private word state, captured atomically on a rising clock edge. A synchronous active-high reset sets the word to zero and wins over enable. With enable low, state is held. With enable high, a register captures its data and a counter increments modulo 2^width. Unknown enable/reset or an ambiguous possible rising edge merges the possible outcomes bit by bit: agreed bits remain known and differing bits become `X`. Output transport delay is separate from capture, so a fast subsequent clock or external contention on Q does not rewrite the internal state. These rules do not change the existing scalar DFF's more conservative ambiguous-clock behavior.

The multiplexer selects A for `sel=0` and B for `sel=1`. With an unknown selector it keeps only equal known input bits; other output bits become `X`. A selected `Z` is unknown logic at the mux input, unlike a passive slice/join. A disabled decoder drives zero on every output. An enabled decoder drives one at the addressed output and zero elsewhere; ambiguous address/enable retains only values agreed by every possible binary case.

The LUT requires every binary input address exactly once, with a fixed-width output word for each row. Its default two-input/two-output table is a half adder with output `Carry:Sum`. For an `X` or `Z` input bit, the kernel evaluates all compatible binary rows and retains a unanimous output value (`0`, `1`, `X`, or `Z`); otherwise it outputs `X`. LUT text is bounded row data, not executable JavaScript or a general behavioral language.

The separate truth-table experiment enumerates selected constant DIN, digital-only DVS, or BUSIN inputs through the timed event kernel and records the settled results. It supports up to 8 selected input bits and 32 selected outputs. Clocks, timed patterns, state elements, analog parts, and bridges require a transient run instead. A settled truth table does not describe hazards during transitions or physical setup/hold behavior.

## Digital voltage source and scalar indicator

DVS has a binary starting state and supports binary live changes in Continuous.
Its default `logic` output mode exposes only the digital `out` pin and needs no
analog reference. Selecting `logic-voltage` adds explicit analog `p` and `n`
terminals. Its voltage starts at the selected low/high value, then follows
the resolved digital output with finite linear edges. Contention that makes
the resolved output X stops voltage simulation. There is no guessed X/Z
voltage, drive resistance, current limit or supply model. Attached wires,
labels and probe endpoints must be removed before disabling voltage terminals.

DLED observes actual sparse events at Cursor A or the retained end time. A
known 1 glows red; 0 stays dark; X is amber and marked UNKNOWN; Z is outlined
and marked HIGH IMPEDANCE. Missing or stale results remain neutral. It adds
no digital driver or analog load. Its red glow is a display treatment, not
electrical LED brightness. Both parts use `cb-logic-io-1.0.0`; existing DIN and
BUSIN retain their four-state input contract. See [logic-io.md](logic-io.md).

## Display and multibit converter parts introduced in 2.0

| Type / model | Ports | Parameters and defaults | Exercised example |
|---|---|---|---|
| `SEG7` / `CB_SEG7` | Passive digital input `in`, fixed width 8 | `active` high | `seven-segment-counter`, `seven-segment-states` |
| `HEX7` / `CB_HEX7` | Digital input `in` width 4, scalar `dp`, output `out` width 8 | `mode` hex; `active` high; `delay` 10 ns | `seven-segment-counter` |
| `ADCBUS` / `CB_ADCBUS` | Analog input `p`, reference `n`; digital output `q`, width 2–8 | `width` 4; `vmin` 0 V; `vmax` 5 V; `period` 100 µs; `delay` 1 ns | `converter-ramp`, `closed-loop-sampled` |
| `DACBUS` / `CB_DACBUS` | Digital input `d`, width 2–8; analog output `p`, reference `n` | `width` 4; `low` 0 V; `high` 5 V; `rise`/`fall` 1 µs; `initial` `0x0` | `converter-staircase`, `closed-loop-sampled` |

### Segment decoding and observation

SEG7's bits 0–7 map to `a,b,c,d,e,f,g,dp`. Its selected active level determines
which known bits illuminate. X and Z have separate visual marks; no matching
captured run gives a neutral state. The display follows actual events from the
same project/revision snapshot at cursor A, or at the retained end when no
cursor is set. This is a passive logic indicator, without electrical LED load,
current, brightness, thermal behavior or persistence/multiplex averaging.

HEX7 is a separate combinational decoder with transport delay. Hexadecimal mode
shows `0–9, A, b, C, d, E, F`; BCD mode blanks codes 10–15. Decimal-point input
is logically active high before output-polarity selection, so decoder and
display should use matching polarity. Unknown numeral bits evaluate all
compatible input codes, keeping only unanimous segment results. The decoder
lowers to existing four-input LUT gates plus a BUF or NOT for the decimal
point. See [seven-segment-display.md](seven-segment-display.md).

### Whole-word conversion

For `N` bits, ADCBUS samples `V(p) − V(n)` at zero and each absolute sample
period. It produces `round(clamp((Vin−vmin)/(vmax−vmin),0,1) × (2^N−1))` after
conversion delay, with saturation at both range ends. Its first word is X
until that first conversion completes. App settings require period and delay
at least 1 ps, with delay shorter than period. There is no input loading,
aperture jitter, noise, nonlinearity, missing-code or metastability model.

DACBUS maps a known code to `low + code/(2^N−1) × (high−low)` with finite linear
edges. Its explicit known startup code is held until the first known input;
subsequent X/Z is an error. Interrupted ramps start from the voltage actually
reached. The ideal output has no resistance, current limit, noise or physical
glitch model. Both parts require coordinated transient. See
[multibit-converters.md](multibit-converters.md).

### Stateful numerical boundary

Coordinated transient preserves capacitor/inductor state, digital memory,
clock phase and pending events across continuous updates and pauses. It uses
backward Euler for the supported analog elements, not the ngspice numerical
method. Reduce the maximum step and compare results to check numerical
convergence; the event grid alone does not establish accuracy. The full analog
models below remain available in ngspice experiments. See
[continuous-simulation.md](continuous-simulation.md).

## Source excitation

DC determines operating-point excitation. AC amplitude and phase are separate settings used only by small-signal analysis. A SIN transient uses offset, amplitude, frequency, and delay. A PULSE transient uses low, high, delay, rise, fall, width, and period; rise/fall/width/period must be positive and the pulse must fit its period. PWL accepts 2–200 strictly increasing nonnegative time/value pairs such as `0,0; 1m,1; 2m,0`.

Capacitor voltage and inductor current initial values are meaningful when the transient **Start from initial conditions / UIC** option is enabled. The application records that choice and warns that it skips the DC operating point. Ordinary transient runs first establish their operating point.

## Known physical limitations

- Ideal R/C/L elements have no intrinsic statistical tolerance, thermal effects, leakage, ESR, dielectric behavior, winding resistance, magnetic saturation, or parasitic coupling unless explicitly represented by additional elements. The separate tolerance-study workflow varies stated parameter values across independent trials; it does not add these physical device effects.
- Independent sources have no internal resistance or current/voltage compliance limit.
- Generic D/BJT models are instructional and have no package, safe-operating-area, or thermal characterization. A red-LED electrical model does not predict brightness, color shift, optical efficiency, or junction heating.
- Level-1 MOS models are simplified long-channel equations. They should not be used to sign off real power-device switching losses, gate charge, avalanche behavior, safe operating area, or thermal design.
- The switch has idealized instantaneous state change and hysteresis. It omits mechanical bounce, arcing, and contact aging.
- The op amp has explicit supply limits but omits finite bandwidth, slew rate, offset, bias current, supply current, common-mode limits, output current limit, and recovery from saturation. It is useful for low-frequency feedback topology exercises; it is not an identified op-amp model.

The simulator never silently replaces an unavailable or incompatible model. It stops before execution with a diagnostic and preserves the editable project.

## Import compatibility

Custom numeric `.model` cards are accepted only for D, NPN, PNP, level-1 NMOS/PMOS, and SW. The exact bundled op-amp subcircuit can round-trip, but arbitrary subcircuits and behavioral sources are outside the import subset. No external `.include` or `.lib` paths are loaded. Imported model text remains part of the user's project and snapshot; the user must establish redistribution permission for those imported cards. CircuitBench bundles no external manufacturer model files.

See `project-format.md` for the full import boundary, `evidence/example-validation.json` for analog fixture results and native-reference comparisons, and `evidence/digital-validation.json` for real event-worker, truth-table, and mixed-WASM fixture results. `evidence/digital-model-tests.txt` records scalar-domain/compiler checks; `evidence/bus-model-tests.txt` records width, alias, ordering, parser, sequential-plan, and resource-validation checks.

These foundation evidence files retain their recorded scope and dates. The
current release's display, coordinated, continuous and study checks are indexed
in [VALIDATION.md](VALIDATION.md); this model catalog does not imply an
unrecorded browser or physical-device validation.

## Official technical references

- [ngspice documentation and user manual](https://ngspice.sourceforge.io/docs.html).
- [ngspice source and project](https://ngspice.sourceforge.io/).
- The original component/model definitions and defaults: `src/library.js`.
- The original worked circuits: `src/examples.js`.
