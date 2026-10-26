# CircuitBench development roadmap

## Current milestone: digital voltage source and red logic indicators

**2.0.0-rc.2 implements the working seven-segment display, coordinated
analog/digital feedback, closed-loop mixed execution, multibit converters,
advanced analog experiments and continuous simulation, plus the requested
digital voltage source and red-HIGH logic indicators.** The workbench now has
43 parts, 37 model definitions and 41 examples: 16 analog, 16 digital and 9 mixed.

The release remains a candidate. Implementation and final host acceptance are
separate: the exact external HTTPS installation, offline reload, upgrade and
recovery workflow still require acceptance. Current evidence and remaining
gates are recorded in [VALIDATION.md](../VALIDATION.md) and
[PROGRESS.md](../PROGRESS.md). No external-host deployment is implied by a
completed package or an implemented feature.

| Batch | Capability | Status in 2.0.0-rc.2 | Delivered result |
|---:|---|---|---|
| 1 | Working seven-segment display | Implemented | `SEG7` renders actual eight-bit segment events; `HEX7` decodes hexadecimal/BCD input and decimal point. Active level, X/Z and selected-time behavior are explicit. |
| 2 | Coordinated analog/digital feedback | Implemented | An isolated stateful worker coordinates analog solves, threshold localization, digital events, converter samples and DAC changes on a shared timeline. |
| 3 | Closed-loop mixed execution | Implemented | DAC outputs can influence the ADC inputs in the same supported analog circuit, with retained numerical/digital state, initial conditions, bounded commands and cancellation. |
| 4 | Multibit converters | Implemented | Explicit 2–8-bit unsigned sampled ADCs and finite-edge DACs, with width checks, differential references, conversion delay, saturation and startup semantics. |
| 5 | Advanced analog experiments | Implemented | Linear/log sweeps and deterministic seeded tolerance studies, immutable trial inputs, measured summaries, explicit failure/cancellation records and CSV/JSON evidence. |
| 6 | Continuous simulation in batches | Implemented | The same circuit continues across bounded updates, Pause/Resume/Step and live inputs; rolling history and backups preserve recorded evidence. |
| Digital interaction | Digital voltage source and logic indicators | Implemented | Binary LOW/HIGH controls, optional explicit voltage terminals, red-HIGH passive indicators, exact cursor states and continuous live switching. |
| Release gate | Exact external-host acceptance | Open | Fresh/upgraded HTTPS startup, worker/WASM responses, offline installation/reload/update, project-preserving recovery and portable outputs on supported browsers. |

## What the completed batches support

### Displays, words and converters

`DVS` drives a scalar 0/1 directly into the digital network. Its optional analog
terminals provide configured low/high voltages with finite edges. `DLED` glows
red only for an observed, resolved HIGH; LOW, X, Z and no result are distinct.
Both work in continuous runs, and the indicator follows Cursor A. See
[digital voltage sources and indicators](../logic-io.md).

The working display observes literal segment states at the selected simulation
time. Unknown and released segments remain distinguishable from known on/off
states. It is a digital indicator, with no electrical LED current, brightness or
multiplex-persistence model. The separate decoder has fixed four-bit digit and
eight-bit segment ports.

Multibit ADCs sample differential voltage periodically, clip to the configured
range and publish the nearest unsigned code after an explicit conversion delay.
The delay must remain positive and strictly shorter than the period on the
1 ps time grid. DACs apply the full unsigned word to their configured voltage
range with finite edges. Their declared startup code is held until the first
known input; subsequent X/Z stops the simulation. Width mismatches are rejected
without truncation or extension.

See [seven-segment displays](../seven-segment-display.md) and
[multibit converters](../multibit-converters.md). The new examples include
hexadecimal counting, direct segment patterns, a sampled analog ramp, an
eight-bit DAC staircase and a sampled feedback controller with a display.

### Coordinated and closed-loop simulation

The delivered engine uses original modified nodal analysis with backward Euler
for **R/C/L and independent voltage/current sources**, coordinated with the
native digital event kernel. It retains capacitor/inductor state, clock phase,
digital memory and pending events. Scalar ADC threshold crossings are localized
with trial solves; converter samples and digital changes create analog
breakpoints. The 1 ps grid defines scheduling precision, while numerical accuracy
depends on the analog step and model.

Schmitt-controlled RC and sampled four-bit feedback circuits are working
examples. The engine rejects singular networks and unsupported components with
diagnostics. The full nonlinear analog library remains available in **ngspice**
experiments and its supported scalar feed-forward mixed mode. The existing WASM
still disables XSPICE; selecting coordinated mode does not enable semiconductor
or op-amp models in that solver.

The decision, numerical method and constraints are documented in
[the closed-loop engine contract](../closed-loop-engine.md). Expanding that
analog subset requires a separate solver design and validation milestone.

### Advanced analog experiments

Analog-only schematic studies support up to **64 trials**, **8 independent
tolerance parameters**, and **6 retained study records** within explicit
sample/byte bounds. Linear and logarithmic sweeps retain their exact endpoints
and order. Seeded Monte Carlo studies draw independent uniform relative
tolerances, with the original project and complete applied parameter sequence
captured as evidence.

Measurements include DC/final values, transient extrema, peak-to-peak,
time-weighted RMS and AC magnitude/phase at a selected frequency. Every trial
uses a fresh isolated simulation. Completed trials survive cancellation;
failed, cancelled and unstarted trials remain distinguishable and do not enter
successful-result statistics. CSV, evidence JSON, autosave, project backups and
reports preserve the study. See [analog parameter studies](../analog-experiments.md).

### Continuous batches and live inputs

Continuous mode advances the same worker through bounded commands rather than
starting a fresh experiment for each update. Pause retains state; Resume and
Step continue absolute simulation time. Live controls cover binary `DVS`, four-state `DIN`, `BUSIN` and
independent DC voltage/current sources. Editing the circuit stops the session.

A bounded rolling window retains recent analog samples and digital events,
including the state at the retained boundary and the live-input timeline.
Stop keeps the last completed window and releases the worker. Backups preserve
inspectable evidence, including snapshots taken while active; they do not
serialize or resume a running solver. See
[continuous simulation](../continuous-simulation.md) for limits and controls.

## Earlier implemented foundations

| Milestone | Delivered capability |
|---|---|
| 1.0 candidates | Schematic editing, ngspice analog analyses, immutable results, baselines, portable projects/reports, versioned runtime assets and scoped recovery. |
| 1.1 candidate | Timed four-state logic, tri-state resolution, DFFs, typed pins and scalar ADC/DAC feed-forward replay. |
| 1.2 candidate | 1–8-bit words, patterns, slices/joins, registers/counters, MUX/decoder/LUT, truth-table experiments and exact word evidence. |
| 1.3 candidate | Delay, pulse width, period/frequency and duty cycle from preserved digital events, with explicit X/Z/boundary handling and independent saved timing evidence. |

These capabilities remain available. The current milestone adds to their
contracts and preserves historical validation under its original version.

## Remaining release acceptance

On the exact external HTTPS candidate, verify fresh startup and upgrade from a
previous installation, executable asset responses, worker/WASM initialization,
offline install/reload/update and scoped recovery while retaining projects.
Verify the complete edit → run → measure → save/reopen workflow and portable
outputs in the supported browser/viewport combinations. Check final package
integrity against the release manifests and preserve numerical/source identity.

This is the remaining release gate for the implemented scope. Local numerical,
worker, browser and archive checks establish their recorded observations;
external acceptance requires observations on that deployment. The authoritative
current checklist is [VALIDATION.md](../VALIDATION.md).

## Later capabilities

- **Nonlinear coordinated analog models.** Establish a convergent nonlinear
  solve, device-state handling, step/error control and independent reference
  comparisons before adding diodes, transistors, switches or op amps to
  coordinated feedback and continuous operation. A new XSPICE/shared-ngspice
  interface would also need reproducible build and redistribution evidence.
- **Timing constraints and richer measurements.** Add explicit setup/hold
  constraints, diagnostics and justified analog-threshold measurements. Device
  timing constraints do not imply a physical metastability model.
- **HDL or MCU execution.** Scope the language/device subset, clocks, memory,
  external interfaces, isolation limits and reproducible examples before
  introducing an executable device model.
- **Model coverage and interchange.** Expand numerical fixtures, consider
  redistributable manufacturer models with verified pin mappings and limits,
  and improve imports/PCB exchange while preserving connectivity provenance.
- **Workbench refinement.** Improve wiring and touch interaction from observed
  use, and retain backup/offline support through any future schema migrations.
  Collaboration or classroom administration remain separate product decisions.

Milestones follow capability dependencies and acceptance evidence. No calendar
schedule is assigned.
