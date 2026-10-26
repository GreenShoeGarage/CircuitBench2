# Digital voltage source and red logic indicators

**Digital voltage source (DVS)** supplies a switchable binary logic value.
**Logic state indicator (DLED)** observes a scalar digital wire and glows red
when its resolved state is **HIGH (1)**. Both work with gates, converters and
continuous simulation. The indicator also identifies LOW, unknown and released
states without guessing a voltage or a binary value.

## Start with the worked example

Open **Digital voltage source and red logic indicators** and run it. DV1 starts
at 1, so its direct indicator glows red and the indicator after the NOT gate is
dark. Select DV1, change its state to 0, and run again to reverse the indicators.

For ongoing interaction, start **Continuous**, then open **Live inputs** and
change DV1 between 0 and 1. A live change is applied at a completed simulation
boundary. Time and circuit state are retained. The direct indicator follows
the resolved source state immediately; the inverter's indicator changes after
the gate's configured propagation delay. Pause freezes the simulation, and
Step or Resume continues the same session.

An ordinary source edit changes the schematic revision and invalidates the old
display observation. A live input change belongs to the active simulation and
is recorded with its simulation time, while the captured initial schematic
remains unchanged.

## Source outputs

| Setting | Pins | Meaning |
|---|---|---|
| Digital output | `out`, one digital bit | Drives exactly 0 or 1. Connect directly to scalar digital gates and indicators. |
| Digital logic + voltage terminals | `out`, plus analog `p` and `n` | Provides the same digital bit and an explicit voltage between `p` (+) and `n` (−). |

The default digital output needs no ground or voltage supply. It stays in the
native digital domain. Enable **Digital logic + voltage terminals** when an actual
analog voltage is required. Connect the negative terminal to the intended
reference and wire the positive terminal into the analog network. Analog pins
and digital pins remain separate signal domains; they cannot be joined by an
ordinary wire.

Voltage mode defaults to **0 V LOW**, **5 V HIGH**, with **1 µs rise and fall
times**. These parameters can be changed explicitly. The initial voltage at
time zero matches the selected binary state. Subsequent live changes use the
configured finite voltage edges. The digital bit changes at the event boundary,
so its timing differs from the voltage ramp.

The voltage output follows the resolved digital `out` net. If another driver
creates contention and the resolved state becomes X, voltage simulation stops
with a diagnostic instead of inventing a voltage. DVS itself accepts only 0 or
1. Use the existing **Logic input**, **Digital pattern**, or tri-state parts to
generate X and Z deliberately.

Removing voltage pins while wires, labels or probes still use them is rejected.
Disconnect those references before switching the source back to digital-only
operation.

## What the indicator shows

| Resolved state | Appearance | Meaning |
|---|---|---|
| `1` | Red glow, **HIGH** label | A known logic high. |
| `0` | Dark lamp, **LOW** label | A known logic low. |
| `X` | Amber, **UNKNOWN** label | The value is unknown, including conflicting active drivers. |
| `Z` | Outlined or dashed, **HIGH IMPEDANCE** label | The net is released or has no active driver. |
| No suitable observation | Neutral, **NO RESULT** | Run the current revision or select a retained simulation time. This does not mean LOW. |

DLED has one scalar digital input, `in`. Use a **Bus slice** to select one bit
from a multibit bus before connecting it. It is a passive observer: adding more
indicators does not alter the resolved signal or introduce a gate delay.

The schematic and result readout use the selected run's preserved digital
events. **Cursor A** selects an exact time; with no cursor, the indicator shows
the last retained state. Event values are right-continuous, so an event at the
selected time has already taken effect. No analog or plotted-sample
interpolation determines the lamp state. An old run from another project or
revision cannot illuminate the current schematic.

In a rolling continuous window, the indicator can observe only the retained
time interval. Saved project backups retain the completed event window and
can reproduce its indicators after reopening. They do not resume the private
state of a stopped solver worker.

## Analog response example

**Digital voltage source, RC response and logic indicators** connects the
source's voltage terminals to a **1 kΩ / 1 µF** network. A Schmitt ADC observes
the capacitor with LOW and HIGH thresholds of **1.5 V** and **3.5 V**.

The source starts HIGH at 5 V while the capacitor starts at zero. The direct
logic indicator is red immediately; the sensed indicator stays LOW until the
capacitor reaches 3.5 V. The ideal RC time constant is 1 ms, and the threshold
crossing is near 1.21 ms at the example's 10 µs maximum step. The coordinated
solver uses backward Euler, so smaller maximum steps approach the ideal
continuous-time response.

During Continuous, change DV1 to 0. The direct digital indicator goes LOW at
the change boundary. The voltage output falls over its configured edge time,
and the capacitor then discharges from its stored voltage. The Schmitt
indicator remains HIGH until the capacitor drops below 1.5 V. This separates
digital state, source voltage, stored analog state and threshold detection.

The example explicitly selects **Coordinated transient**. Source-to-analog-to-
ADC paths use this coordinated solver; the existing ngspice replay path
requires independent analog input and output partitions.

## Inspect all four states

**Logic indicators: high, low, unknown and released** supplies four scalar
patterns. Each one-millisecond interval contains one HIGH, one LOW, one X and
one Z. Move Cursor A across a transition to see the same physical indicator
change its observed state. Only the HIGH state glows red.

## Model boundary

The source's optional analog output is an ideal differential voltage source
with finite edges. It has no output resistance, current limit, supply current
or power rail model. Its digital output uses the existing 0/1/X/Z resolver and
has no analog drive strength.

The red indicator is a digital display. Its glow does not model electrical LED
current, forward voltage, brightness or power. For those experiments, use an
electrical LED, a current-limiting resistor, a voltage source and the applicable
analog solver. The source and indicator models are original educational
definitions at `cb-logic-io-1.0.0`.
