# Digital timing measurements

CircuitBench introduced timing measurements in 1.3 for completed transient
runs containing preserved digital events. Version 2.0 also supports completed
continuous windows with nonzero retained time bounds and independent live-input
provenance. The five supported measurements are delay,
pulse width, period, frequency and duty cycle. A scalar logic signal or an
explicitly selected bus bit can be measured. Bit 0 is the least significant,
rightmost bit of an MSB-first word.

Measurements use `result.digitalEvents`, the resolved change-only event records
saved by the simulation. They do not detect transitions in plotted pixels,
decimated traces, analog interpolation points or sampled-only legacy backups.
The time vector supplies the finite run boundary; its logic samples do not
supply edges. A legacy run without event records must be simulated again.

## Workflow and interpretation

Complete a transient run, open its timing measurements and select a measurement
kind, signal, edge polarity and time window. Delay also requires a target signal
and target polarity. Bus bits are independent choices; X/Z in another bit of
the same word does not contaminate the selected bit.

Each row retains the source/target event timestamps, original event indices,
states before and after the change, numeric result when one exists, and any
reason a value is unavailable. Saved evidence retains the selected complete
sparse event traces so the result can be reproduced without rerunning the
simulation or retaining a sampled waveform matrix.

For a continuous session, choose **Stop & keep results**, then **Timing**.
Pause preserves a live worker; it does not yet make that run a completed timing
source. The requested window must lie within the captured interval shown by
the timing form. Measurements cannot recover edges removed by rolling-window
retention. Reopened continuous snapshots are completed evidence and can be
measured without restarting their solver.

| Measurement | Pairing and value |
|---|---|
| Delay | For each selected source edge, choose the first target edge at or after it, strictly before the next selected source edge. Subtract the source time from the target time. |
| Pulse width | Rising begins a high pulse; falling begins a low pulse. The next change must be a known opposite edge. Its time minus the starting time is the width. |
| Period | Subtract consecutive source-edge times of the selected polarity. |
| Frequency | Take the reciprocal of each complete measured period. |
| Duty cycle | Divide known high-state duration by the complete cycle duration and multiply by 100. A cycle begins and ends on the selected polarity. |

The delay pairing is temporal correlation between the selected signals. It
does not prove a causal path or identify a transistor-level propagation delay.
Choose edges appropriate to the circuit and inspect reconvergent paths or
hazards in the timing view. The transport-delay simulation retains short
pulses, so a glitch may legitimately supply the first eligible target edge.

Frequency is computed per cycle. Its arithmetic mean can differ from the
reciprocal of the arithmetic mean period when cycle lengths vary. Duty cycle
always reports **percent high**, including when falling edges define the cycle.

## Edge and boundary rules

A rising edge is exactly `0 → 1`; a falling edge is exactly `1 → 0`. Changes
involving `X` or `Z` are not promoted to known edges. The first state at the
retained boundary is not an edge, including an initially high clock at zero
or a high pulse already in progress at a nonzero continuous-window start. The event simulator
resolves all changes at one timestamp together, so timing measurements operate
on that resolved state and do not reconstruct unrecorded delta-cycle changes.

Both endpoints of a requested measurement must lie inside the selected window.
The start and end of the window are inclusive. A closing edge exactly at the
window end can complete a measurement; an edge after it cannot. A pulse already
in progress at the left boundary is not reconstructed using an earlier edge.
A window of zero duration can still show a simultaneous zero-delay pair.

For delay, the next source edge is an exclusive boundary for the previous
candidate. A target at exactly that timestamp belongs to the new source edge,
so it cannot be reused. Equal source and target timestamps produce measured
zero delay when both are direct known edges and both selected states are known.

Event timestamps are validated against the declared 1 ps grid. Durations are
calculated from differences of integer grid positions, avoiding accumulated
floating-point subtraction drift. A mixed run can have a non-grid analog end
time; digital events must still be on their own declared grid and within that
finite result boundary.

## Unknown states and unavailable values

Rows have one of three statuses:

| Status | Meaning |
|---|---|
| `measured` | A complete eligible event pair has a numeric value. |
| `indeterminate` | X/Z interrupts or occurs within the required interval. The value is `null`. |
| `missing-edge` | A required known edge is absent inside the finite window. The value is `null`. |

A pulse that enters X/Z ends as an indeterminate observation at that exact
transition. It is not paired with a later edge after the signal recovers.
Period, frequency and duty cycle are indeterminate when their paired interval
contains X/Z. For delay, both selected signals must remain known from the
source timestamp through the target timestamp. An initially unknown target
therefore makes a later paired delay indeterminate if the unknown interval
extends past the selected source edge.

The result reports warnings when X/Z occurs in the window and counts
transitions involving X/Z that were excluded from edge selection. Later known
cycles can still be measured after the signal recovers. If no eligible source
edge exists, one `missing-edge` diagnostic row explains that absence and calls
out X/Z when present. It does not invent a zero value.

An unfinished final cycle normally produces a `missing-edge` row. If its
unclosed interval also contains X/Z, its status is `indeterminate` and the
reason states both limitations. Minima, maxima and means include only retained
`measured` rows; unavailable values are never treated as zero.

## Bounds and execution

One measurement selects at most two unique whole event traces, with at most
250,000 events across those traces. Selecting two bits from the same bus retains
the whole word event series once. Input validation checks names, widths, bit
order, literal states, finite ordered grid times, an initial value exactly at
the retained first time, and the change-only invariant. Normal bounded digital
and mixed sources begin at zero. Nonzero starts require matching continuous
window provenance in portable timing evidence.

At most 256 result rows are retained. If more candidates exist, the result
records the full candidate count, marks itself truncated, and explains that its
summary covers the retained measured rows. Narrowing the window selects later
events without changing the underlying saved run. With no eligible edge, the
single diagnostic row counts as one candidate.

Postprocessing is synchronous and bounded. It performs a linear scan of the
selected events, builds edge and cumulative interval indexes, then uses binary
searches for the retained candidates. It starts no simulator worker and
requires no new analog solve. Cancellation remains part of the simulation
workflow; this bounded postprocessing pass does not expose a misleading
same-thread cancellation button.

## API and reproducibility

The implementation is [src/timing.js](../src/timing.js). Its method identifier is
`cb-event-timing-1`.

- `getTimingSignals(run)` returns selectable signal/bit descriptors. Unsupported
  or missing runs return an empty list without scanning every event.
- `normalizeTimingSpec(run, spec)` returns a canonical selection or a descriptive
  validation error.
- `timingSourceForRun(run, spec)` captures independent copies of the selected
  complete sparse traces and the run's finite time bounds.
- `measureTiming(run, spec)` measures those events directly from a completed run.
- `measureTimingSource(source, spec)` reproduces the same result using captured
  event evidence alone.
- `normalizeTimingSourceSpec(source, spec)` validates/canonicalizes a selection
  against captured evidence.

A canonical specification has this shape:

```js
{
  kind: 'delay', // or pulse-width, period, frequency, duty-cycle
  source: { name: 'd(clock)' }, // bus choice: { name: 'b(count)', bit: 0 }
  edge: 'rising',
  target: { name: 'd(delayed)' }, // delay only
  targetEdge: 'rising',          // delay only
  window: { start: 0, end: 1e-6 }
}
```

The captured source contains `timeBounds: [start, end]`, selected `signals`,
`timeResolution: 1e-12` and
`eventSource: 'preserved-digital-events'`. Each signal includes its name, label,
kind, width, MSB-first bit order and complete `{time, value}` event list. Labels
prefer the authored probes in the run's captured project snapshot.

For a continuous source, `start` is the actual retained start and the first
event of every selected trace is its state at that time. The independent record
also copies `sourceRun.continuous`: origin, retained bounds, total/dropped
points, snapshot/stopped status and ordered live-input history. This provenance
remains with the measurement after removal of the full source run. Import
validates that history against eligible source IDs and widths in the captured
project; it does not try to reconstruct the discarded numerical state. A
missing solver choice in legacy 1.3 analysis is normalized to ngspice before
the snapshot and source settings are compared.

The result contains the canonical spec, unit (`s`, `Hz` or `%`), rows, summary,
candidate count, truncation flag, warnings, pairing description, method and
event-source identifiers. Every row records its one-based row index and its
original zero-based source/target event indices. Those event indices refer to
the retained whole-word trace even when only one bit is selected.

The tests in [tests/timing.test.mjs](../tests/timing.test.mjs) cover independent
event sequences, jitter, exact simultaneous edges, incomplete windows,
ambiguous states, bus-bit extraction, malformed evidence, size bounds and a
real reconvergent delayed-XOR glitch from the digital kernel.

## Model limits

The 1 ps grid describes event representation, not physical circuit accuracy.
ADC crossings in ngspice feed-forward mixed runs remain interpolated from saved
analog samples and rounded to the event grid. Coordinated scalar crossings use
trial analog solves, and multibit conversions use their periodic sample phase
and conversion delay. Neither method gains physical accuracy from the timing
postprocessor. Timing results retain the run's engine, sampling and bridge
assumptions; reduce the analog maximum step and compare convergence when
evaluating fast analog activity.

Setup/hold diagnostics are deferred until explicit user-specified constraints
have a separate contract. Measurements do not infer physical metastability,
drive strength or unrecorded event behavior. Coordinated feedback is a stated
solver feature, not something inferred by correlating two measured edges.
See [continuous-simulation.md](continuous-simulation.md) for window retention
and [multibit-converters.md](multibit-converters.md) for converter semantics.
