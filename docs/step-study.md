# Time-step sensitivity studies

CircuitBench 2.2 can repeat a coordinated transient experiment with successively
halved maximum analog steps. Each case starts a fresh isolated simulation from
the same schematic initial conditions. A previously declared instrument
measurement is applied to each completed run, and adjacent scalar values are
compared using explicit absolute and relative tolerances.

This is an observation of numerical sensitivity. A small difference is not a
certified error estimate, proof of convergence, validation of the component
models or a physical-accuracy rating. The coordinated solver uses backward
Euler, which can introduce step-dependent damping. An apparently stable value
can still reflect a shared model, interpolation or discretization limitation.

## Workflow

1. Choose a schematic transient experiment and select the coordinated solver.
   The coordinated R/C/L and independent V/I subset must compile successfully.
2. Complete an instrument measurement or save a reusable measurement setup
   with explicit signal identities, thresholds/levels and a finite time window.
3. Open Time-step sensitivity. Select that configuration and 2–4 fresh trials.
   The trial count includes the initial maximum step; three trials use `h`,
   `h/2` and `h/4`.
4. Declare an absolute difference tolerance in the measurement's unit and a
   relative tolerance as a percentage. Zero is permitted; no tolerance is
   inferred from the results.
5. Run the study. Inspect each scalar and adjacent comparison. Open a trial's
   instrument evidence to examine its original samples and interpolation.
6. Export CSV for exact values/differences or evidence JSON for all retained
   trial inputs, snapshots, engine identities and original numerical evidence.

The starting maximum step comes from the captured schematic. Every requested
halving must be an exact positive multiple of the 1 ps event grid. For example,
8 ps supports 8/4/2/1 ps; 3 ps cannot be halved on that grid and is rejected.
The finest run is compiled and checked against existing simulation preflight
budgets before any case is started.

## What is held fixed

Every trial has the same circuit topology, components, source waveforms and
parameters, capacitor/inductor initial conditions, digital initial states,
analysis duration and measurement configuration. Only `analysis.step` changes.
The study captures the original project revision without editing the working
schematic. Each trial records its exact analysis settings separately.

Continuous-session windows and live-input histories are not trial inputs.
The study does not replay manual source changes or continue a paused solver.
A returned trial with retained-window sampling, nonempty live input history,
a changed initial project, inconsistent input hashes, incomplete time coverage
or sample spacing exceeding its declared maximum step is rejected explicitly.

Digital-only circuits are unavailable for this study because their event times
do not use the analog maximum step. AC analyses, imported netlist workspaces
and unsupported coordinated analog devices are also unavailable. There is no
automatic substitution of a simpler component or solver.

## Scalar and comparison semantics

Eligible configurations are analog rise time, fall time, overshoot, settling
time, threshold delay and transient amplitude gain. The same declared window
and interpolation settings apply to every case. A trial contributes a scalar
only if its instrument result contains exactly one complete numeric occurrence.
Multiple edges, missing crossings, insufficient settling observation and
ambiguous/incomplete results keep their raw evidence and reason, but do not
contribute a scalar. The study never silently averages repeated measurements.

For adjacent values `previous` and `new`, with `new` from the finer step:

```text
signed difference = new - previous
absolute difference = abs(new - previous)
allowed difference = absolute tolerance + relative tolerance × abs(new)
within tolerance = absolute difference <= allowed difference
```

The relative tolerance in stored evidence is a fraction: 0.01 means 1%.
Displayed relative difference is `abs(new - previous) / abs(new)`. If the finer
value is zero and the difference is nonzero, that relative difference is
undefined, while the absolute tolerance still gives a valid decision. If both
values are zero, relative difference is zero. Numeric overflow remains
explicitly unavailable.

Comparisons are strictly adjacent in the planned sequence. If the middle case
fails, the final case is not compared directly with the initial case. The
report shows every failed/cancelled or unstarted case and each unavailable
comparison. The final adjacent comparison is labeled individually; earlier
outside-tolerance comparisons are retained rather than hidden by a summary.

## Cancellation and failures

The application passes an AbortSignal to the independent trial runner and
stops its worker when the study is cancelled. A pending attempt retains its
captured exact inputs and a cancellation reason, with no invented numeric
result. Already completed cases remain inspectable. Cases not yet started
remain counted as unstarted.

A numerical or evidence-budget failure in one case remains a failed row; later
cases can still complete unless the user cancels. Completed simulations whose
measurement is unavailable have a separate status: their original measurement
evidence is kept, and the study completes with warnings rather than presenting
a fabricated scalar.

## Saved provenance and import verification

Every attempted trial retains its captured circuit, exact maximum step and
integer grid count, generated documentation netlist, compiled coordinated plan,
recorded SHA-256 identifiers and start/completion timestamps. Completed cases
also retain the engine identity and a complete independent instrument record
containing the selected original numerical inputs. Fresh trials have distinct
run and measurement identities.

On import, CircuitBench validates the original study and each trial project,
regenerates its declared netlist and coordinated plan, checks signal
definitions against the compiled schematic, recomputes instrument arithmetic
from the saved raw samples, and recomputes scalar availability, differences,
tolerance outcomes and summary counts. It rejects contradictory settings,
result values, run identity, provenance or trial order. It does not execute the
solver again or certify the authenticity of an externally edited backup.
Input hashes are retained as recorded identifiers; importing a study is not a
cryptographic proof that its numerical samples were produced by those inputs.

Removing an ordinary run or a separately saved instrument measurement does
not remove the evidence nested in a study. Restored studies remain inspectable
without a current solver session.

| Bound | Limit |
|---|---:|
| Fresh trials per study | 2–4 |
| Saved studies | 4 |
| Selected raw numeric values per study | 1,500,000 |
| Selected raw numeric values across study history | 3,000,000 |
| Evidence bytes per study | 24 MiB |
| Evidence bytes across study history | 48 MiB |

Before accepting a completed trial, the study reserves room for the exact
inputs and failure diagnostics of every remaining case. Oldest saved studies
are removed only when bounded retention requires it, with a removal count.

## Implementation and verification

`src/step-study.js` owns planning, exact step halving, fresh-run orchestration,
cancellation, independent evidence, recomputation, comparison, CSV/JSON and
report helpers. `src/step-study-ui.js` renders configuration, results and history
and reads engineering-value tolerances. The application owns worker lifecycle
and project persistence.

`tests/step-study.test.mjs` uses actual fresh `CoordinatedSession` simulations of
the RC step example at 100/50/25 µs. It checks decreasing error against the
analytic 10–90% exponential reference and verifies every saved adjacent
difference. Additional cases exercise exact-grid planning, preflight failure,
missing/multiple scalars, cancellation during a pending promise and after a
completed trial, a failed middle case, live-history rejection, contradictory
imports, bounded retention and escaped exports.
