# Multibit converters

CircuitBench 2.0 adds explicit **Multibit sampled ADC** (`ADCBUS`) and **Multibit
voltage DAC** (`DACBUS`) parts. Both use an unsigned 2–8-bit bus and require
**Coordinated · analog/digital feedback** transient execution. They can be used
in a bounded run or a continuous session, including a closed feedback loop
within the supported R/C/L and independent-source analog subset.

The original scalar `ADC` and `DAC` remain separate one-bit parts. A Slice
connected to a scalar DAC still selects just one bit; it does not convert the
whole word. The new converters retain literal bus words, including startup X,
and identify their idealized behavior in model version `cb-converters-1.0.0`.

## Wire and run an example

1. Open **Examples** → **Multibit ADC, DAC and seven-segment readout**.
2. Inspect the ADC: width `4`, zero-code voltage `0`, full-scale voltage `5`,
   sample period `100u`, conversion delay `1u`.
3. Inspect the DAC: width `4`, zero/full-scale `0`/`5`, rise/fall `2u`, startup
   code `0x0`. The analog positive and reference terminals are explicit.
4. Choose **Run experiment**. Compare the input ramp, the sampled word and the
   reconstructed voltage on the same time axis. Before the first conversion
   completes, the word is X and the DAC holds its configured startup code.
5. Move cursor A to inspect the seven-segment display at a recorded time. Its
   `HEX7` decoder converts the four-bit code into eight segment bits; `SEG7`
   displays those bits. The converter itself does not decode decimal digits.
6. Change the ADC sample period, rerun, and compare the sample-and-hold effect
   separately from the finite set of available output levels.

**Eight-bit counter through a voltage DAC** exercises the full eight-bit path.
**Sampled 4-bit feedback controller and display** places the converters in a
closed loop: the ADC measures an RC node, a LUT computes `15 − code`, and the
DAC drives that same RC network. Use **Continuous…** to preserve state between
screen updates and pauses. See [continuous-simulation.md](continuous-simulation.md).

## Ports and parameters

| Part | Port | Domain, direction and width |
|---|---|---|
| `ADCBUS` | `p` | Analog differential input, positive terminal |
| `ADCBUS` | `n` | Analog reference input, negative terminal |
| `ADCBUS` | `q` | Digital output, configured `width` bits |
| `DACBUS` | `d` | Digital input, configured `width` bits |
| `DACBUS` | `p` | Analog positive output of an ideal voltage source |
| `DACBUS` | `n` | Analog output reference |

| Part | Parameter | Default | Rule |
|---|---|---|---|
| Both | `width` | `4` | Integer 2–8; every connected bus must have matching width |
| ADC | `vmin`, `vmax` | `0`, `5` V | Finite range with `vmax > vmin` |
| ADC | `period` | `100u` s | Positive sample period, at least one 1 ps tick |
| ADC | `delay` | `1n` s | At least one 1 ps tick; rounded delay strictly shorter than rounded `period` |
| DAC | `low`, `high` | `0`, `5` V | Finite range with `high > low` |
| DAC | `rise`, `fall` | `1u`, `1u` s | Positive finite linear transition times, at least one tick |
| DAC | `initial` | `0x0` | Fully known unsigned startup word that fits `width` |

Displayed and saved words are MSB first. Bit 0 is the least-significant bit.
Known words can use an exact-width literal or `0b`, `0x`, `0d` notation; numeric
forms are padded and overflow is rejected. A connected width edit is rejected
if it would create a mismatch. Use an explicit Slice/Join when a change of bus
width is intended; the app never silently truncates or extends a connection.

## ADC transfer and timing

For `N = width`, `M = 2^N − 1`, and differential voltage
`Vin = V(p) − V(n)`, the sampled unsigned output is:

```text
normalized = clamp((Vin − vmin) / (vmax − vmin), 0, 1)
code       = round(normalized × M)
```

Inputs at or below `vmin` saturate to zero. Inputs at or above `vmax` saturate
to `M`; full-scale therefore maps exactly to the highest code. Values exactly
halfway between adjacent codes round upward. This is nearest-code quantization
over `M` intervals, not a claim to reproduce a particular manufacturer's ADC
transfer convention.

Samples occur at absolute times `0`, `period`, `2 × period`, and so on. The
sampled code appears after `delay`; it is then held until the next conversion
completes. The initial word is all X until the first conversion finishes.
Pause/resume and chunk boundaries preserve the sample phase and pending
conversion events. Project validation requires conversion delay to be shorter
than the sample period after both round to the 1 ps grid. The part does not model a busy pin or discarded
conversion.

The analog solve reaches each sample time. Conversion events share the digital
1 ps scheduling grid, but analog accuracy still depends on the coordinated
maximum step and numerical method. Changing sample period, conversion delay
and analog step changes three different aspects of the experiment; compare
them separately.

The ADC has infinite input impedance. It provides no analog return path and
does not short its positive and reference terminals. There is no aperture
jitter, input loading, noise, nonlinearity, missing-code, metastability or
device-specific acquisition model.

## DAC transfer and startup

For a fully known unsigned word with integer value `code`:

```text
target voltage = low + code / (2^width − 1) × (high − low)
```

The DAC controls `V(p) − V(n)`. A four-bit 0–5 V range has 16 available levels
spaced by `5/15 = 1/3 V`; an eight-bit range has 256 levels spaced by `5/255 V`.
It is an ideal voltage source with finite linear rise/fall transitions. A new
target that interrupts a transition begins from the actual voltage reached at
that time, rather than restarting from the preceding target.

The explicit `initial` code is held until the first fully known input word.
This supplies a stated startup condition while an ADC's first conversion is
pending. Once a known word has been accepted, a later X or Z in any input bit
stops the simulation with a diagnostic. An unknown input never becomes an
arbitrary analog voltage. The existing scalar DAC continues to require known
logic even at startup.

There is no output resistance, current limit, output noise, power-supply model
or physical DAC glitch model. Add supported explicit circuit elements when
their idealized loading is part of the experiment. Do not interpret a finite
edge as a characterized physical settling-time specification.

## Closed-loop use and numerical checks

The coordinated engine accepts analog feedback through these converters within
its supported analog library. Analog state, converter timing and digital
events advance causally in the same worker. Pure combinational digital cycles
remain invalid; connecting a feedback wire does not create an implicit digital
memory element.

Set initial analog conditions and the DAC startup word deliberately. A sampled
controller can show quantization, sample delay and finite-edge effects; the
result may depend on initial state. Reduce **Maximum time step**, rerun from
the same initial configuration, and compare the quantity of interest before
drawing a numerical conclusion. Sample period and conversion delay remain
part of the circuit model during that comparison.

The **ngspice · analog / feed-forward mixed** selection retains the existing
full analog model library and scalar bridge replay. It rejects multibit
converters and analog feedback with a message directing the user to coordinated
transient. Selecting coordinated does not make semiconductor or op-amp models
available in the new solver.

## Evidence and export

Project backups retain converter parameters, model definitions, plan identity,
engine identity, actual analog samples and literal digital events. Continuous
windows also retain absolute bounds and the applied live-input history. CSV
preserves words as strings, including leading zeros and X/Z; it does not turn
them into guessed decimal numbers.

A standalone analog SPICE deck cannot represent the native converter schedule,
digital logic or feedback coordinator. Use **Save backup** for an editable
experiment, and the simulation-plan/evidence exports for inspection. See
[project-format.md](project-format.md), [component-models.md](component-models.md)
and [seven-segment-display.md](seven-segment-display.md).
