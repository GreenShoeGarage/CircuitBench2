# Working seven-segment display

The **SEG7** part observes an eight-bit digital bus and lights the corresponding
segments from the selected run's actual preserved events. **HEX7** is a separate
decoder that converts a four-bit hexadecimal or BCD digit plus a decimal-point
input to that segment bus. Both parts are in **Displays** in the component library.

## Connect and run

1. Place **Seven-segment display**. Its input is always eight bits.
2. To show numbers, place **Hex / BCD seven-segment decoder** and connect its
   eight-bit output to the display. Connect a four-bit input or counter to the
   decoder's digit input and a scalar logic source to its decimal-point input.
3. Set the decoder and display to the same active level: `high` or `low`.
4. Run a transient experiment. The display reads the saved event state at the
   selected simulation time; without a selected time, it uses the last retained
   time. A display from a different project or revision remains neutral.

The **Hex counter with a working seven-segment display** example supplies a
complete clock → counter → decoder → display circuit. It starts at zero, counts
through `1–9, A, b, C, d, E, F`, and wraps to zero. Its 10 ns counter delay plus
10 ns decoder delay makes each display update occur 20 ns after the clock edge.
Initial combinational settling happens at time zero.

The **Seven-segment patterns, decimal point, X and Z** example drives segments
directly, without a decoder. It shows zero, one with the decimal point, unknown
states, released states, and a middle-segment-only pattern in successive windows.

## Segment wiring

Words are stored and shown most-significant bit first. Bit zero is on the right
of the word and drives segment **a** at the top of the digit.

| Bit | Segment | Position |
|---:|---|---|
| 0 | a | Top |
| 1 | b | Upper right |
| 2 | c | Lower right |
| 3 | d | Bottom |
| 4 | e | Lower left |
| 5 | f | Upper left |
| 6 | g | Middle |
| 7 | dp | Decimal point |

For active-high operation, `00111111` shows **0**, `00000110` shows **1**, and
`10000110` shows **1 with the decimal point**. `01000000` lights only the middle
segment. Active-low operation complements which binary state lights a segment.
An eight-bit pattern, bus register, LUT, or explicit slice/join network can drive
SEG7 directly. Width mismatches are errors; a four-bit digit cannot be connected
directly to an eight-bit segment input.

## Decoder behavior

HEX7 has fixed ports: a four-bit `in`, a one-bit `dp`, and an eight-bit `out`.
The decimal-point input is logically active-high before the configured output
polarity is applied. With matching active levels on HEX7 and SEG7, `dp = 1`
lights the decimal point in both active-high and active-low configurations.

- **Hex mode:** decodes all 16 input values using `0–9, A, b, C, d, E, F`.
- **BCD mode:** decodes 0–9 and blanks the seven numeral segments for values
  10–15. The decimal point remains independent.
- **Delay:** every output uses the configured positive transport delay, with
  the existing 1 ps event time grid. Pulses are not filtered by this delay.
- **Uncertain digit inputs:** each segment retains a known binary value only
  when every compatible binary digit agrees. Other segments become `X`.
- **Uncertain decimal point:** `X` or `Z` on the decoder's `dp` input becomes
  `X` on its driven decimal-point output, as for an ordinary logic buffer.

HEX7 compiles to the existing event engine's bounded lookup-table gates and a
decimal-point buffer or inverter. It introduces no separate numerical engine.

## Unknown, released, and unavailable states

SEG7 observes the resolved segment bus directly. Known active bits light red;
known inactive bits remain dark. **X** uses an amber segment with an X marker.
**Z** uses an outlined segment with a Z marker. Each segment has accessible text
identifying its name, bit number, and state; the readout also retains the literal
eight-bit word. A partially uncertain word is never presented as a guessed digit.

A neutral display means that no suitable current-revision run is available,
the selected time is outside the retained interval, or the preserved bus data
does not support the observation. It does not imply electrical zero. The display
uses right-continuous event values: an event at the selected time has already
taken effect. Dense plotted samples are not interpolated or used to infer a word.

## Model boundary

This is a **passive digital indicator**, with no drive current, supply pins,
common-anode/cathode electrical network, brightness, persistence, or multiplex
averaging. Active-low behavior describes logic polarity, not an electrical
common-anode LED model. For electrical LED experiments, use explicit LEDs,
resistors, drivers, and power sources. Rapid multiplex signals can be inspected
at a particular simulated time but are not averaged into apparent brightness.

The source project, resolved events, and fixed segment mapping determine every
displayed state. Saved runs and backups therefore reproduce the display without
requiring a retained live worker.
