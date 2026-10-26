# Instrument measurements

CircuitBench 2.2 measures completed transient and AC runs without re-running
their circuits. The instrument workspace adds rise/fall time, overshoot,
settling time, analog threshold delay, amplitude gain, AC cutoff and digital
setup/hold constraints. The earlier Digital timing workspace remains available
for pulse width, period, frequency, duty cycle and resolved digital delay.

## Workflow

1. Complete a run, or stop a continuous session and retain its window.
2. Open Instrument measurements and choose the captured run's signal(s).
3. Declare levels, reference amplitude, interpolation limits and a measurement
   window. Baseline/final levels are explicit inputs, not guessed plot extrema.
4. Measure and inspect each row, including incomplete or ambiguous outcomes.
5. Save a reusable setup when the same signal identities and settings should
   be applied to later runs. A setup preserves its exact window; it does not
   silently resize to fit another run.
6. Export CSV for numeric rows or evidence JSON for the configuration, circuit
   snapshot and selected raw input samples/events. Project backups retain both
   saved setups and independent measurement records.

Deleting a source run does not delete its measurement's selected evidence.
Measurements from earlier revisions remain labeled with their captured project,
revision and source run. Reusing a setup calculates new evidence; it never
changes the old record.

## Analog evidence and interpolation

The source contains the complete original time/frequency axis and the raw
vectors required by the selected signals. Differential voltage and derived
resistor-current probes retain both original operands and the declared divisor.
Ground is the explicit exact zero reference. Missing operands, inconsistent
lengths, nonfinite values, duplicate/nonmonotonic axes and incomplete complex
arrays are rejected. No missing values are replaced or extrapolated.

For a mixed feed-forward result, only indices marked as original analog
samples are retained. Extra times introduced for digital plotting are excluded
from analog measurement evidence. Coordinated and retained continuous windows
use their actual saved analog sample grid.

Transient boundaries and thresholds use linear interpolation between adjacent
original samples. AC point measurements interpolate real and imaginary operands
linearly against log frequency before taking a ratio. The form can impose a
maximum interpolation interval, in seconds or hertz as appropriate. When a
required original interval exceeds it, the affected measurement is unavailable
or incomplete. A blank limit explicitly permits adjacent-sample interpolation;
it does not establish a continuous-time error bound.

The requested window must lie inside the original saved analog range. A
crossing already in progress at the left boundary is not invented. An observed
crossing exactly at the right boundary can finish a measurement. A first sample
already equal to the threshold does not establish an earlier directed crossing.

## Definitions

| Measurement | Declared settings and calculation |
|---|---|
| Rise/fall time | For percent mode, a threshold at progress `p` is `initial + (final - initial) × p / 100`; defaults are 10% and 90%. For fall time the final level is lower, so these thresholds descend. Absolute mode accepts explicit directed start/end levels. The next end crossing must occur before a return across the start level or another selected start. |
| Overshoot | Let `d = sign(final - initial)`. Find the directional peak in the window, then report `100 × max(0, d × (peak - final)) / abs(final - initial)`. The result describes only the observed window and does not imply that the response reached its final level or settled. |
| Settling time | The inclusive band is `final ± tolerance`, where percent tolerance is relative to the absolute declared step amplitude. Find the last entry into the band after the declared stimulus reference time, with no later exit through the observation end. Report elapsed time from that reference. A minimum observed hold can be required after entry. A response already in band at the reference has zero observed settling delay. |
| Analog threshold delay | For each input crossing, use the first output crossing at or after it and strictly before the next selected input crossing. Do not reuse output crossings. Equal timestamps give zero delay. This states a temporal pairing and does not establish causation. |
| Transient gain, peak to peak | Divide output peak-to-peak amplitude by input peak-to-peak amplitude over the same window, including interpolated boundary values. Signals must have the same unit. |
| Transient gain, total RMS | Divide total output RMS by total input RMS over the same window. DC is included. For each piecewise-linear interval, the integral of squared amplitude is `dt × (a² + a×b + b²) / 3`; divide the total by the window duration before taking the square root. |
| AC gain | At the declared frequency, divide output complex magnitude by input complex magnitude. Also retain amplitudes, principal phase difference and `20 log10(gain)` when defined. Zero input amplitude is undefined. Zero output magnitude has no phase or finite dB value. |
| AC cutoff | At an explicit reference frequency, measure the transfer magnitude. Search for the first selected rising/falling crossing of `reference gain dB - declared drop dB`. The default drop is `20 log10(sqrt(2))`, approximately 3.0103 dB. Interpolate gain dB against log frequency between adjacent retained samples. No filter type, passband or DC gain is inferred. |

Settling is a finite-window observation. It does not guarantee that the
waveform stays in band after that window. Overshoot can be missed between
simulation samples, and interpolation does not repair an insufficient solver
step. Use the time-step sensitivity study to inspect how a declared scalar
changes under independent smaller-step simulations.

The minimum-hold equality comparison allows only floating-point subtraction
roundoff (eight machine epsilons scaled by the relevant timestamps/duration).
This arithmetic allowance is not an additional physical settling tolerance.

Repeated rise/fall and threshold-delay results retain up to 256 occurrences.
Truncation is explicit and summaries describe only the retained rows. The
scalar comparison helper accepts exactly one complete numeric occurrence;
it does not silently average multiple transitions.

## Setup/hold constraint semantics

The clock and data come from preserved, resolved sparse digital events on the
1 ps event grid. A bus selection always names one bit: bit zero is the rightmost
least-significant bit of an MSB-first word. Changes and X/Z in other bus bits do
not contaminate the selected bit.

Only direct `0 → 1` or `1 → 0` transitions establish known clock edges. An entry
into the selected clock level from X/Z produces an ambiguous row. Any clock
X/Z inside the window also warns that additional clock edges cannot be inferred.
The initial retained state is not an edge.

For a clock edge at `tc`, the required interval is
`[tc - setup, tc + hold]`. Both requirements must be nonnegative exact multiples
of 1 ps. If that complete interval is not inside the selected retained window,
the row is incomplete. If the selected data bit is X/Z anywhere in that
inclusive interval, the row is ambiguous. State at an interval's start is
right-continuous after the event at that time.

Known data changes exactly at the setup or hold limit satisfy equality.
Shorter known intervals violate the stated requirement. If no previous or next
data transition is retained, available setup/hold is explicitly a lower bound
on observed stability, not an invented edge. That lower bound can establish
that a fully observed requirement is satisfied.

A data change at the same resolved timestamp as the clock has zero observed
separation. A positive setup or hold requirement is violated. If both
requirements are zero, within-timestamp ordering is unavailable and the row
stays ambiguous. These are event-level stability constraints. They do not model
analog apertures, transistor behavior, physical metastability or MTBF.

## Preservation, import checks and limits

Each record captures its source-run status/timestamps, circuit snapshot,
project revision, engine metadata, input hashes as recorded, sampling method,
continuous input-change provenance when present, selected raw inputs,
configuration, result rows and reasons. Import validates the structures and
recomputes all measurement arithmetic from the selected evidence. If the source
run is also retained, its selected data, snapshot, labels and provenance must
agree with the independent record.

This checks internal consistency, not the authenticity of an externally
modified backup. Without the original run, a person could edit raw inputs and
recompute consistent results. Recorded hashes identify inputs; measurement
import does not re-simulate them or certify a physical circuit.

| Bound | Limit |
|---|---:|
| Saved measurement configurations per project | 16 |
| Configuration size | 4 KiB |
| Saved instrument records | 12 |
| Original analog positions per record | 250,000 |
| Selected analog signals / raw operand vectors | 2 / 4 |
| Raw numeric values including axis per record | 1,500,000 |
| Raw numeric values across instrument history | 2,000,000 |
| Selected digital events per record / history | 250,000 / 1,000,000 |
| Retained occurrence rows per measurement | 256 |
| Evidence bytes per record / history | 20 MiB / 32 MiB |

Retention removes oldest records when necessary and reports the number removed;
the new record is not silently discarded. A source that exceeds its individual
budget must be shortened. Pure calculations are synchronous, bounded passes
over the selected arrays; they create no background simulation worker.

## Public modules and verification

`src/measurements.js` provides the pure calculation/source/preset grammar and
`measurementScalar`. `src/measurement-evidence.js` supplies independent saved
records, bounded retention, import recomputation, CSV/JSON and report sections.
`src/measurements-ui.js` renders the setup/result/history interface and reads
engineering-value form inputs. It leaves modal lifecycle and persistence to
the application.

`tests/measurements.test.mjs` checks analytic RC rise/fall/settling, directional
overshoot, threshold pairing, retained sample provenance, complex AC gain,
RC cutoff, RMS integration, explicit window/gap limits and setup/hold ambiguity.
`tests/measurement-evidence.test.mjs` checks independent retention, contradictory
imports, malformed evidence, preset bounds and escaped exports/presentation.
