# CircuitBench development roadmap

**Updated October 25, 2026 · Delivered release: 2.2.0 · Next: nonlinear engine architecture proof**

The authorized 2.1 and 2.2 batches are implemented in the cumulative 2.2.0
release. The stable 2.0 hosting/browser acceptance remains recorded under its
original release identity. Current tests, browser observations and package
checks are in [VALIDATION.md](docs/VALIDATION.md); completed work is in
[PROGRESS.md](docs/PROGRESS.md).

## Development sequence

| Status | Milestone | Outcome |
|---|---|---|
| Complete | Stable 2.0 | Accepted analog/digital/mixed foundation, displays, converters, studies, continuous batches and installation recovery. |
| Complete | 2.1 · Everyday workbench | Pinned/direct/momentary controls, guided typed wiring, explicit construction shortcuts, navigable diagnostics and goal-based examples. |
| Complete | 2.2 · Instruments and confidence | Triggered capture, actual event stepping, bus-bit views, linked selection, analog/setup-hold measurements, reusable setups and bounded time-step comparisons. |
| Next investigation | Nonlinear engine architecture proof | Compare a coordinated nonlinear solver extension with a synchronized ngspice/WASM interface before committing to a device subset. |
| After the proof | 3.0 · Expanded continuous mixed simulation | Validated nonlinear devices in stateful closed-loop execution, with clear convergence and retained-state contracts. |
| Following releases | Reuse and model depth | Reusable subcircuits, richer physical I/O, model provenance and targeted interchange. |
| Use-case driven | MCU/HDL and broader systems | A specific executable-device workflow, isolation contract and reference examples before implementation. |

No calendar commitments are assigned to the later milestones. The nonlinear
architecture proof and 3.0 implementation are separate future work.

## 1. Maintained foundation

The catalog contains **43 parts, 37 model definitions and 41 examples**: 16
analog, 16 digital and 9 mixed. It includes a working seven-segment display,
separate Hex/BCD decoder, digital voltage source, red-HIGH logic indicators,
coordinated closed-loop feedback, 2–8-bit converters, analog parameter studies
and continuous batches with retained state.

The coordinated analog subset remains **R/C/L and independent V/I sources**.
The broader nonlinear library runs through ngspice in its supported analog and
scalar feed-forward analyses. The coordinated solver uses backward Euler with
a fixed maximum step. Its 1 ps grid is event scheduling resolution; numerical
accuracy depends on model assumptions and the analog step.

Historical stable-2.0 acceptance is in
[VALIDATION-2.0.0.md](docs/history/VALIDATION-2.0.0.md). Earlier evidence is retained
without relabeling it as a new 2.2 execution.

## 2. Delivered: everyday workbench

- Pin frequently used constant logic/bus and DC analog inputs beside the
  schematic. Operate the dedicated digital source target directly.
- Momentary controls use explicit press/release semantics. Session-owned input
  queues handle cancellation, focus loss, Stop and replacement. Initial
  parameters remain separate from live input history.
- During wiring, show compatible destinations. When domains or widths differ,
  provide explicit configured ADC/DAC, Slice/Join or decoder/display actions.
  Each construction action is atomic and undoable.
- Attach an indicator, probe a selected bus bit, or build a matching
  decoder/display path without guessing signal domains or widths.
- Navigate diagnostics to components, pins and nets. Offer an analysis route
  only after compiling the complete candidate circuit; preserve the actual
  device models and feedback topology.
- Organize examples around operating goals and keep initial/live/recorded
  state and Latest/Cursor A observation visible.

The exit workflow is source → NOT → two indicators, continuous operation,
Pause/Step/Resume, earlier-time inspection, return to latest, Stop and portable
save/reopen. See [live controls](docs/live-controls.md) and
[guided construction](docs/guided-construction.md).

## 3. Delivered: instruments and confidence

- Digital-edge and declared analog-threshold triggers operate in the retained
  worker. Capture pre/post windows, Run until event and Next event expose their
  actual timeline and search/work limits. Missing requested history remains
  explicit rather than being synthesized.
- Expand bus bits in the waveform view using preserved sparse events. Linked
  schematic/plot selection checks project identity and revision so a saved
  trace cannot silently select a changed working circuit.
- Measure analog rise/fall, overshoot, finite-window settling, threshold delay,
  transfer gain and AC cutoff with declared levels, references and
  interpolation rules. Evaluate digital setup/hold requirements with explicit
  X/Z, boundary and incomplete-window outcomes. These are post-run constraints,
  not a physical metastability model.
- Save reusable measurement setups and independent raw evidence. Records keep
  source run, circuit revision, engine/input provenance and recomputed
  arithmetic on import, even after ordinary source runs leave history.
- Run 2–4 independent coordinated transient trials with exactly halved maximum
  steps. Retain configurations, selected numerical evidence, adjacent
  differences and user-declared absolute/relative tolerance decisions. The
  report describes sensitivity rather than assigning an unexplained accuracy
  rating.

The exit workflow captures a mixed ADC transition with its analog and digital
signals on one timeline, measures it, saves/reopens the evidence and compares a
quantity under smaller maximum steps. See [captures](docs/triggered-capture.md),
[linked signals](docs/linked-signals.md), [measurements](docs/measurements.md) and
[time-step studies](docs/step-study.md).

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
provenance. See the [current engine contract](docs/closed-loop-engine.md).

Deliver the chosen device subset through complete circuits: controlled
switching, a rectifier or LED driver, comparator feedback, a transistor/MOSFET
driver, and an energy-storage switching loop. Each device family needs declared
startup, transient, convergence and model-limit checks. Broader device graphics
alone do not complete this milestone.

## 5. Reuse and model depth

After the everyday workflow and engine direction are established, prioritize
named typed subcircuits, personal templates, reusable measurement collections,
model metadata, verified pin mappings and targeted interchange. Individual
measurement presets are already included in v2.2. Add source/output
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

The preceding [rc.3 roadmap](docs/history/ROADMAP-2.0.0-rc.3.md) and
[rc.2 roadmap](docs/history/ROADMAP-2.0.0-rc.2.md) are preserved for context.
Current release evidence remains authoritative about the source of each
acceptance result, independently of the planning targets above.
