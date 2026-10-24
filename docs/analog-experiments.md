# Analog parameter studies

Analog experiments run a bounded series of independent simulations from a
captured schematic. They answer questions such as “How does this capacitor
change the filter response?” and “How much does the divider output vary when
both resistors have a 5% tolerance?” The study does not edit the working circuit.

## Using a study

1. Open an analog-only schematic and configure its operating-point, DC, AC or
   transient analysis as usual. Resolve circuit diagnostics first.
2. Open **Analog experiments…**. A previous simulation is optional; signal
   choices come from the circuit's generated measurements and probes.
3. Choose a **Parameter sweep** or **Tolerance study · Monte Carlo**.
4. Select a signal and a measurement. For an AC study, provide the frequency to
   inspect. For a transient study, optionally give both window endpoints.
5. Run the study. The table retains every attempted trial, its exact applied
   values, measurement or failure, and an aggregate summary of completed trials.
6. Export summary CSV, full evidence JSON, or a project backup. Saved studies
   remain attached to their original circuit revision.

**Stop** preserves completed trials. An unfinished trial has a cancelled status
and no numeric result; unstarted trials remain counted as not run. The app stops
the active engine worker and does not schedule the next trial. Resuming a stopped
study is a new explicitly configured experiment, rather than continuation of a
partially completed random sequence.

## Parameters and trial generation

The schematic's documented numeric analog parameters are eligible: resistor,
capacitor and inductor values/initial conditions, MOSFET geometry, and numeric
independent-source settings. Source waveform selection, PWL text, topology,
models, digital words and bus widths are not numeric study targets. A source
parameter affects only analyses or waveforms that actually use it. For example,
changing AC amplitude does not change a transient excitation.

### Parameter sweeps

A sweep varies one parameter over **2–64 trials**, including both endpoints.
Linear and logarithmic spacing are supported. Descending sweeps retain their
specified order. Both endpoints of a logarithmic sweep must be positive.
Engineering notation uses the selected parameter's ordinary units: `10k`,
`100n`, and explicit compatible units have the same meaning as in the inspector.
Each applied value is stored as a numerical value and the exact decimal text
written into that trial's circuit.

The ordinary circuit compiler checks every changed trial. A sweep that passes
through an invalid resistance or inconsistent pulse timing therefore records a
failed trial at that value, rather than modifying the requested sequence or
substituting an assumed value.

### Tolerance studies

A tolerance study varies **1–8 parameters** over **1–64 trials**. Each parameter
is drawn independently from its nominal value ± the specified relative
percentage. Tolerances must be greater than 0% and less than 100%. Zero nominal
values cannot vary by relative percentage; use a sweep for an offset around zero.

The generator is `mulberry32`, with an unsigned 32-bit seed. Each generator draw
is in `[0,1)`; a parameter value is `nominal × (1 + (2u − 1) × tolerance/100)`.
Targets retain their selected order, and each trial consumes one draw per target
in that order. The same snapshot, target order, seed and count reproduce the
same applied values. A normal distribution, correlated tolerances, manufacturer
statistics and worst-case optimization are not implied by this uniform model.
The finite trial set is not a manufacturing yield guarantee.

## Measurement definitions

| Measurement | Available analysis | Definition |
|---|---|---|
| Final value | Operating point, DC, transient | Last observed value in the selected range; for DC, last means acquisition order, including descending sweeps |
| Minimum / maximum | DC, transient | Extremum of the retained selected samples and any requested transient boundary values |
| Peak to peak | DC, transient | Maximum minus minimum over that same selection |
| Time-weighted RMS | Transient | Square root of the time average of the squared piecewise-linear sampled waveform |
| AC magnitude | AC | Magnitude of the selected complex voltage/current at the requested frequency |
| AC phase | AC | `atan2(imaginary, real)` in degrees, in the principal ±180° range; a zero-magnitude response has undefined phase and fails that trial's measurement |

Transient measurements use the complete selected sample array, not plotted or
simplified pixels. Blank window fields use the first and last returned samples.
The first actual sample may be later than zero when UIC is selected; the study
does not fabricate a time-zero sample. If a requested window begins before or
ends after the returned samples, the trial fails instead of extrapolating.
Between observed samples, window endpoints use linear interpolation.

For an interval of length Δt with endpoint values `a` and `b`, the contribution
to the RMS squared integral is `Δt × (a² + ab + b²) / 3`. The integral is divided
by elapsed time, not by sample count. This prevents adaptive solver sampling
density from weighting some parts of the waveform more heavily. It still
describes the sampled approximation; insufficient transient resolution can
miss real peaks or waveform changes.

AC frequency must lie within the configured sweep and actual returned data.
At an exact sample, the original complex values are used. Between samples, the
real and imaginary parts are interpolated linearly against logarithmic
frequency, then converted to magnitude or phase. Wrapped phase angles are not
interpolated. Exact negative-real-axis responses use +180°; signed zero is
normalized so JSON round trips cannot change that phase to −180°.
Use more AC points per decade when the response changes sharply.
Magnitude remains in the signal's physical unit, V or A; it is not an implied
transfer gain or dB ratio to an unselected input.

## Results and saved evidence

Every completed trial retains:

- The exact applied component values and trial index.
- Its original run identifier, engine identity, warnings, full generated input
  deck and SHA-256 when the browser provides cryptographic hashing.
- The selected signal's full axis and real/imaginary sample arrays.
- The measurement settings, result, units and interpolation details.

The record stores the immutable base project once. Applying a trial's recorded
parameter changes reconstructs its circuit. The surrounding study records start
and completion times, cancellation/failure counts, and a summary of completed
measurements. Mean, extrema, and population standard deviation exclude failed,
cancelled and unstarted trials. The scatter plot likewise shows only completed
trials; the table retains each attempted trial and its diagnostics.

Import validates the captured project and specification, regenerates the
deterministic parameter sequence, checks each completed input deck against its
captured circuit, recalculates measurement arithmetic from the saved sample
arrays, and recomputes aggregate statistics. It rejects inconsistent evidence.
This is an integrity check on the saved record, not independent resimulation or
proof that arbitrary imported sample arrays originated from a real instrument.
Restored records say that the circuits have not been simulated again.

The standalone JSON format is:

```json
{
  "format": "CircuitBench analog experiment evidence",
  "formatVersion": 1,
  "experiment": { "kind": "analog-experiment", "method": "cb-analog-experiments-1" }
}
```

The omitted record fields are present in the actual export. CSV contains one
row per attempted trial, with exact parameter values, status, measurement,
units, input hash and error text. A failed trial's value cell is empty rather
than zero. A complete project backup is the route for restoring a workbench
and all its retained studies together.

## Limits and execution

Each trial uses a fresh isolated simulation. No numerical state carries from
one sweep or tolerance trial to another. This is distinct from continuous
simulation, which preserves a running circuit's state.

The selected analysis solver is retained in the captured project. A coordinated
transient study therefore uses that solver's supported analog subset and
integration assumptions; an ngspice study uses the ordinary SPICE engine. The
saved engine identity identifies which one executed. For coordinated runs, the
retained SPICE deck describes the analog topology; the actual native input is
derived from the captured project and exact trial parameter changes.

| Bound | Limit |
|---|---:|
| Trials per study | 64 |
| Tolerance parameters per trial | 8 |
| Complete selected samples per study | 250,000 |
| Saved record size | 8 MiB |
| Retained studies | 6 |
| Total retained selected samples | 500,000 |
| Total saved study history | 16 MiB |

The existing engine's circuit, vector, timeout and numerical limits still apply
to each trial. Evidence exceeding a study budget produces an explicit failed
trial instead of silently decimating its samples. Space for later trial failure
diagnostics is reserved before accepting a large sample array, so a full record
does not discard earlier completed trials at finalization. Adding a new record removes
the oldest records if necessary to fit the shared history limits; the app
reports that eviction. Export valuable studies before replacing history.

## Integration API

`src/experiments.js` provides the model and arithmetic:

```js
const record = await runExperiment(projectSnapshot, spec, {
  runTrial: async (trialProject, { signal, index }) => {
    // Compile and run this trial with a fresh isolated simulation.
    // Connect signal.abort to the engine's stop method.
    // Return the application's normal completed immutable run record.
  },
  signal: controller.signal,
  onProgress: ({ completed, total, trial, summary }) => {}
});
```

`experimentChoices` exposes available parameters/signals before a previous run.
`normalizeExperimentSpec` validates and converts engineering inputs.
`experimentTrials` deterministically generates the complete sequence;
`experimentTrialProject` applies one trial to a copy. `measureExperimentSource`
implements arithmetic over retained samples. `validateExperimentRecords` is
the backup boundary; `retainExperimentRecords` returns `{records,droppedCount}`.
`experimentCSV` and `experimentEvidenceJSON` produce portable exports.

`src/experiments-ui.js` provides `experimentSetupHTML`, `bindExperimentForm`,
`readExperimentForm`, `experimentResultHTML` and `experimentHistoryHTML`.
The parent dialog supplies Run/Stop and export/history actions. The form binding
returns a listener cleanup function.

## Verification

The core tests cover parameter contracts, deterministic draws, independent
measurement mathematics, cancellation, incomplete trials, imported arithmetic,
input consistency, retention and export behavior. UI tests exercise the actual
form functions with a controlled DOM surface and verify accessible results,
escaping, stale/restored notices and navigation.

`tests/experiments-app.test.mjs` exercises the actual application handlers with
controlled DOM and asynchronous worker/hash boundaries. It covers cancellation
and late-result races, captured revisions during edits, project replacement,
history retention, exports, backup restoration and report inclusion.

`tests/experiments-engine.test.mjs` executes the production WebAssembly worker
through the existing Node Worker adapter. It compares a resistor sweep and
five tolerance draws with the independent voltage-divider equation, an RC AC
study with its complex transfer function, and an RC transient study with its
exponential step response. The suite also verifies that all thirteen created
trial workers terminate. These numerical tests do not substitute for browser
or target-host acceptance.
