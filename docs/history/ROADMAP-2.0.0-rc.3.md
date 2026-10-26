# CircuitBench development roadmap

**Reassessed October 24, 2026 · Current candidate: 2.0.0-rc.3**

The next priority is dependable installation and clear everyday operation,
followed by better instruments and a deliberate expansion of the coordinated
analog engine. The application already implements the requested digital,
display, mixed-feedback, converter, study and continuous-simulation batches.
Current delivery and acceptance results are recorded in
[PROGRESS.md](../PROGRESS.md) and [VALIDATION.md](../VALIDATION.md).

## Implemented foundation

The workbench has **43 parts, 37 model definitions and 41 examples**: 16 analog,
16 digital and 9 mixed. These capabilities remain the maintained baseline:

| Capability | Delivered behavior | Important boundary |
|---|---|---|
| Analog experiments | ngspice operating point, DC sweep, AC and transient analyses | Device behavior follows the selected declared model. |
| Timed digital logic | Four-state logic, gates, clocks, tri-state resolution, registers, counters, buses, patterns and timing measurements | Explicit propagation delays, pin widths and bounded execution. |
| Digital source and indicators | Binary LOW/HIGH control, optional voltage terminals and red-HIGH observation | Voltage output is ideal; indicator glow represents logic, without LED current or brightness physics. |
| Seven-segment display | Actual segment-event observation, separate hexadecimal/BCD decoder, decimal point and polarity | Passive digital display; no electrical common-anode/cathode or multiplex-persistence model. |
| Coordinated mixed feedback | ADC, digital events, DAC and analog state advance on one causal timeline | Coordinated analog support is R/C/L and independent voltage/current sources. |
| Multibit conversion | Periodic 2–8-bit unsigned ADC and finite-edge DAC | Declared sampling, conversion delay, saturation, startup and X/Z handling. |
| Analog studies | Linear/log sweeps and seeded independent tolerance trials with saved measurements | Analog-only studies, up to 64 trials and eight tolerance parameters within explicit evidence bounds. |
| Continuous batches | Retained state, live inputs, Pause/Resume/Step and bounded rolling history | A backup preserves completed evidence; it cannot resume a stopped worker. |

The full nonlinear analog library remains available through ngspice in its
supported analyses and scalar feed-forward mode. Selecting coordinated
execution does not enable those devices in the coordinated solver. Its
backward-Euler method has step-dependent error and damping, and no adaptive
local-error controller. The 1 ps digital grid represents event time; numerical
accuracy depends on the model and analog step.

See [logic I/O](../logic-io.md), [seven-segment displays](../seven-segment-display.md),
[converters](../multibit-converters.md), [closed-loop engine](../closed-loop-engine.md),
[analog studies](../analog-experiments.md), and
[continuous simulation](../continuous-simulation.md).

## Revised sequence

Version labels below are planning targets. Release decisions follow explicit
acceptance evidence; no calendar schedule is assigned.

| Priority | Target | Outcome and dependencies |
|---:|---|---|
| 1 | 2.0.0-rc.3 → stable 2.0.0 | Complete release acceptance, consistent installation/recovery instructions, practical installation diagnostics and understandable simulation state. |
| 2 | 2.1 · Everyday workbench | Convenient live controls, guided construction, actionable circuit diagnostics and clear current-versus-historical observations. |
| 3 | 2.2 · Instruments and confidence | Triggered capture, event navigation, richer measurements and time-step comparison. |
| Parallel investigation | Nonlinear engine architecture proof | Compare extending the coordinated solver with a synchronized ngspice/WASM interface before committing to broader device coverage. |
| 4 | 3.0 · Expanded continuous mixed simulation | Deliver a validated nonlinear device subset in stateful closed-loop operation after the architecture proof. |
| 5 | Following releases · Reuse and model depth | Reusable subcircuits, measurement setups, explicit physical I/O models and targeted interchange. |
| Later, use-case driven | MCU/HDL and broader systems | Scope a particular executable-device workflow, isolation contract and reference examples before implementation. |

## 1. Complete the existing release scope

The rc.3 batch brings installation checks and simulation-state explanations
into the workbench and generates operational version references from the release
version. Earlier startup response validation, versioned executable assets,
content-verified offline caching and scoped repair already exist. Acceptance
must exercise them on the installation being released.

The current validation record identifies each observation as passed, failed,
unavailable, or outside the declared supported scope. A prepared package or a
local check does not imply an external deployment or a completed offline test.

### Stable-release exit criteria

- **Fresh installation and upgrade:** the exact supported HTTPS installation
  completes one ngspice analog run, one digital run and one coordinated
  feedback run. An upgrade retains saved projects and loads one consistent
  version/build.
- **Offline and recovery:** reload and run after offline installation; exercise
  project-preserving repair; test an incomplete upload in staging and retain
  the resulting actionable diagnostic. Digital execution alone does not verify
  the WASM installation.
- **Delivered outputs:** capture and inspect real project, CSV, SVG and HTML
  report downloads, plus supported native print/PDF output. Verify captured
  circuit revision, values, states and labels in the exported files.
- **Declared browser workflows:** edit → wire → run → measure → save/reopen →
  export on the stated browser/platform combinations. Include keyboard use;
  promise touch support only with corresponding observed acceptance.
- **Continuous lifecycle:** exercise bounded prolonged updates, live changes,
  Pause/Step/Resume, background/foreground transitions, history limits, Stop
  and edits without stale result attachment, lost input history or unbounded
  worker/data growth.
- **Repeatable verification:** preserve release/build identity with evidence;
  pin the reference environment for fresh numerical comparisons. Older native
  evidence retains its original release label when a new reference cannot run.
- **Consistent release instructions:** shell, recovery page, ZIP names,
  operational guides, runtime paths and manifests describe the same release.
  Preserve historical records separately.

Installation diagnostics should identify the stage and asset that failed when
the available evidence supports that diagnosis. An opaque browser rejection
remains unexplained when response checks cannot establish its cause. Checking
assets and engines does not itself prove offline reload or update behavior.

## 2. Make everyday operation easier

This milestone builds on the existing typed wiring model, editor safeguards,
source controls and run evidence.

- Keep **Editing / Running / Paused / Showing saved result** understandable,
  with the displayed time labeled as Latest or Cursor A and a direct return to
  latest observation. Distinguish configured initial input from applied live
  input and from an older captured result.
- Pin frequently used live controls near the schematic. Make parameter commit
  behavior consistent and visible. Introduce momentary inputs with explicit
  press/release semantics; support direct part operation where it is clear
  whether the action operates the circuit or edits its definition.
- Turn circuit diagnostics into navigable component, pin and net explanations.
  Highlight compatible wire destinations and suggest explicit ADC/DAC,
  Slice/Join or decoder components for domain/width corrections. Preserve
  explicit connectivity and undoable actions.
- Explain analysis/continuous compatibility before execution. Identify an
  unsupported part and offer a supported analysis route without replacing its
  model silently.
- Add practical actions such as attaching an indicator, probing a bit or
  placing a matching decoder/display. Organize examples by the goal, with
  what to operate, what to observe and what to change.

**Exit scenario:** construct the source → NOT → two-indicator circuit, operate
it continuously, pause and step, inspect an earlier time, return to latest,
stop, save and reopen. At every stage, the user can identify the initial input,
applied live state, observed time and captured circuit revision.

## 3. Improve instruments and confidence

Existing plots, cursors, timing measurements, baselines and studies remain the
foundation. Priorities are:

- Digital-edge and declared analog-threshold triggers, explicit capture windows
  and pre-trigger history, Run until event and Step to next event.
- Bus-bit expansion and linked schematic/plot selection, preserving exact
  sparse event semantics.
- Analog rise/fall time, overshoot, settling time, threshold delay, transfer
  gain and cutoff measurements with declared interpolation/window rules.
- Reusable measurement configurations and explicit setup/hold constraints
  where supported by a device contract. Timing constraints do not imply a
  physical metastability model.
- A time-step-sensitivity experiment that reruns a bounded circuit with smaller
  maximum steps and compares a selected measurement. Retain the settings,
  runs, numerical differences and chosen acceptance tolerance.

**Exit scenario:** capture an ADC threshold transition with its analog input,
digital output and display state on the same time axis, measure it and reopen
its evidence. Report unavailable pre-trigger history explicitly. Numerical
comparison describes the observed change rather than assigning an unexplained
accuracy rating.

## 4. Choose and extend the nonlinear engine deliberately

The architecture proof compares two routes:

| Route | Advantage | Required work |
|---|---|---|
| Extend the original coordinated engine | Reuse existing retained state, live controls and digital event integration | Nonlinear residual/Jacobian handling, convergence strategy, device history, rejected-step rollback and error control. |
| Synchronize ngspice through a new WASM interface | Reuse established analog device infrastructure | Reproducible browser build, synchronization callbacks, retained operation, cancellation and integration with native digital events. |

The bundled engine recipe disables XSPICE and the adapter currently executes
complete decks. A new shared/synchronized interface is a separate engineering
project. Reuse of ngspice's nonlinear infrastructure should be evaluated before
committing to a broad custom nonlinear implementation; the browser proof must
establish whether that route meets the requirements.

The proof must demonstrate real nonlinear analog/digital feedback, retained
state across bounded updates, finite transitions and correct event ordering,
pause/resume/live changes, cancellation, useful convergence diagnostics,
independent numerical comparisons, and reproducible build/redistribution
provenance. See the [current engine contract](../closed-loop-engine.md).

Deliver the chosen device subset through complete circuits: controlled
switching, a rectifier or LED driver, comparator feedback, a transistor/MOSFET
driver, and an energy-storage switching loop. Each device family needs declared
startup, transient, convergence and model-limit checks. Broader device graphics
alone do not complete this milestone.

## 5. Reuse and model depth

After the everyday workflow and engine direction are established, prioritize
named typed subcircuits, personal templates, saved measurement setups, model
metadata, verified pin mappings and targeted interchange. Add source/output
impedance, loading, rails, current limits or converter effects only with
explicit model contracts and reference circuits.

A future multiplex display visualization needs a documented averaging model.
An electrical LED/display model additionally needs current paths, drivers and
supply behavior. The existing passive segment indicator remains useful for
exact logic observation.

Resumable simulation checkpoints require a versioned format covering analog
state, digital memory, pending events and compatible solver/model identity.
Treat that as a separate execution feature; the current backup already preserves
completed inspectable evidence.

MCU/HDL execution, full PCB layout, classroom administration and live
collaboration follow specific use cases and their own scope decisions.

## Reference acceptance workflows

| Circuit | What it establishes |
|---|---|
| Digital source → NOT → two indicators | Source operation, propagation delay, visible states and cursor readback. |
| Clock → counter → decoder → seven-segment display | Typed bus wiring, sequential state and display mapping. |
| Voltage source → RC → Schmitt ADC → indicator | Stored analog state, threshold conversion and live changes. |
| ADC → controller → DAC → analog plant | Closed-loop causality, converter timing and retained state. |
| Nonlinear driver and load, when supported | Device coverage, current measurement and convergence behavior. |

Each workflow should be built or modified through the normal UI, operated,
measured, saved, reopened and exported. Numerical/model tolerances and
browser/deployment observations remain separate evidence categories. Aggregate
test counts support these decisions; they are not a substitute for the declared
workflow exit criteria.

The preceding [rc.2 roadmap](ROADMAP-2.0.0-rc.2.md) is preserved for
context. Current release evidence remains authoritative about what was actually
observed, independently of the planning targets above.
