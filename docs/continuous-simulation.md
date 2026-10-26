# Continuous simulation and coordinated feedback

CircuitBench 2.0 adds a stateful transient engine and a continuous run mode. One
worker advances analog and digital state on the same simulation timeline. A
screen update publishes another completed interval; it does not restart the
circuit. Pause retains the worker, capacitor voltage, inductor current, clock
phase, digital memory and pending events. Stop releases that state and keeps the
recent recorded waveform window.

Continuous simulation is available for schematics containing digital parts and
the coordinated analog subset: resistors, capacitors, inductors and independent
voltage/current sources. Scalar ADC/DAC bridges and the new 2–8-bit converters
can close an analog/digital feedback loop. The full analog component library,
including semiconductor, switch and op-amp models, remains available through
ngspice in bounded experiments. An unsupported coordinated part produces a
diagnostic; it is not replaced with a simpler model.

## Start with a working example

1. Open **Examples** and select **Continuous RC with live input changes**.
2. Choose **Continuous…**. The dialog selects coordinated transient execution
   when the session starts.
3. Set **Time per screen update (s)** and **Recent history window (s)**. The
   history window must be at least one positive update interval. Engineering
   values such as `500u` and `10m` are accepted.
4. Choose **Start continuous simulation**. The panel shows simulated time,
   retained points and whether the session is running or paused.
5. Choose **Live inputs…**, set the DC voltage source to `5`, and choose
   **Apply inputs**. The capacitor charges from its current voltage. The
   schematic's original source value remains the starting configuration.
6. Choose **Pause**, change the live source to `0`, then choose **Step** or
   **Resume**. The capacitor discharges from its retained voltage.
7. Choose **Stop & keep results** before exporting a report or creating timing
   measurements from a digital or mixed window. **Save backup** can also capture
   a non-resumable snapshot while a session remains active.

For digital state, try **Eight-bit counter through a voltage DAC**. Its live
enable and synchronous reset inputs demonstrate that source changes and pauses
preserve the counter's private state and clock phase. For feedback, use
**Closed-loop Schmitt RC oscillator** or **Sampled 4-bit feedback controller and
display**. The [converter guide](multibit-converters.md) describes the sampled
loop and its explicit startup code.

For a direct binary control, open **Digital voltage source and red logic
indicators**. Its DVS source starts HIGH, so the direct indicator glows red and
the inverted indicator stays dark. Change the source with its live controls
or **Live inputs…**. **Digital voltage source, RC response and logic indicators**
also enables explicit voltage terminals and shows the difference between the
immediate digital command and the capacitor's later threshold crossing. See
[logic-io.md](logic-io.md).

## What each control does

| Control | Behavior |
|---|---|
| **Pause** | Finishes an already active bounded command, publishes its accepted interval, then stops scheduling further work. The worker and circuit state remain alive. |
| **Resume** | Continues the same worker and absolute simulation time. It does not rerun the startup operating point. |
| **Step** | While paused, advances one bounded update and remains paused. A step may cover less than the requested screen interval when the accepted-step bound is reached. |
| **Live inputs…** | Changes eligible sources at the next completed solver boundary. A running session resumes after the change unless Pause was requested; a paused session stays paused. |
| **Stop & keep results** or **Stop** | Terminates the worker, including in-flight work, and retains the last completed window. Starting again creates a new initial state. |
| Edit, undo, or replace the circuit | Stops the continuous session before changing its captured circuit. Use live inputs for supported changes that should preserve state. |

The supported live controls are a scalar `DIN` value, a binary `DVS` value,
a `BUSIN` word of its configured width, and the value of an independent **DC**
voltage or current source. DVS accepts only `0` or `1`; DIN and BUSIN retain
`0`, `1`, `X` and `Z`. An uncertain word that reaches a DAC is still subject
to that converter's validity rules. A DVS voltage output follows its resolved
digital net through its configured finite edges; contention X is an error.
Live input is not a
topology editor or a way to change clock periods, source waveform types, part
values or converter widths. Those edits start a new experiment.

Each applied group is recorded with its absolute simulation time and exact
normalized values. DC source changes refresh algebraic voltages at that
boundary while preserving stored capacitor/inductor state. The next published
boundary contains the settled new state. The input timeline, original project
snapshot and compiled plan together describe the experiment.

## Shared time and numerical method

The coordinated worker uses original modified nodal analysis for the supported
analog elements and an incremental four-state digital event kernel. Capacitors
and inductors use **backward Euler** integration. The configured **Maximum time
step** is an upper bound on an accepted analog step. Source breakpoints, digital
events, converter samples and DAC ramp ends can require smaller steps.

Scalar ADC crossings are localized by trial analog solves between accepted
states, then scheduled on the 1 ps event grid. Sampled multibit ADCs observe the
actual analog state at their periodic sample times and publish after their
conversion delay. DAC updates return to the analog solve at the same shared
timeline. A capacitor or inductor can therefore carry state around a mixed
feedback loop instead of requiring a feed-forward replay.

The 1 ps grid is a scheduling resolution, **not a claim of 1 ps analog accuracy**.
Backward Euler introduces step-dependent numerical error and damping. Repeat a
bounded experiment with a smaller maximum step and compare the voltage,
period, overshoot or other quantity of interest. The ngspice temperature and
relative-tolerance controls do not apply to the coordinated method. This engine
does not add transistor, noise, jitter, thermal, setup/hold or metastability
models.

Normal startup computes a DC operating point for the supported analog network.
**Start from component initial conditions (transient UIC)** instead uses the
configured capacitor voltages and inductor currents. Singular or inconsistent
networks fail explicitly. An unknown scalar DAC input is an error; a multibit
DAC has only the documented, explicit startup-code exception.

The numerical engine can also run once: select **Behavior over time ·
Transient**, choose **Coordinated · analog/digital feedback** under **Transient
engine**, then **Run experiment**. This starts at zero and completes the
configured duration within the finite-run limits. It retains every accepted
point and event, then closes its worker. Continuous mode instead keeps the
worker alive and bounds the history shown and saved.

## Update interval, real time and retained history

**Time per screen update** is a requested simulated interval. Work is split into
commands of at most 2,000 accepted steps. When a command reaches that bound,
the published interval ends at the actual last accepted time; subsequent work
continues there. The program does not invent samples to fill an uncomputed gap.

Screen updates run as fast as the bounded solver and browser display scheduling
allow. Browser background throttling or a slow device changes wall-clock
progress, not the numerical time assigned to events. This is not a real-time
hardware simulator, and it does not run as an offline service-worker job after
the page closes.

Times remain absolute as the window moves. The first retained time may be well
after zero. Older samples are removed as whole intervals when the requested
history duration or a resource limit is reached. The actual retained duration
can therefore be shorter than the requested history window.

Analog vectors contain accepted solver samples; merging adjacent chunks adds no
analog interpolation. Each digital trace begins with its recorded state at the
retained boundary, followed by all retained transitions. That first state is
not a new edge. An edge or pulse that began before the retained window cannot
be reconstructed from missing history. Timing measurements respect this
boundary. The seven-segment display and scalar logic indicators follow Cursor A
when set within the retained interval, or their latest recorded states otherwise.
X/Z remain visible; only a known HIGH makes the scalar indicator glow red.

## Explicit resource limits

| Resource | Bound |
|---|---:|
| Retained continuous points per vector | 30,000 |
| Retained dense values across all vectors, including time | 1,000,000 |
| Retained sparse digital events, including boundary values | 250,000 |
| Accepted steps per continuous update command | 2,000 |
| Absolute continuous timeline | 9,000 s; the session pauses at the limit |
| Recorded groups of live input changes | 2,000 |
| Updates in one live-input group | 1–64 |
| Coordinated analog nodes, excluding reference | 48 |
| Coordinated matrix unknowns | 80 |
| Coordinated analog elements | 160 |
| Result vectors | 256 |

The shared digital graph is also bounded to 255 lowered scalar nets and 600
elements. Command event and worker watchdog limits remain in force. The
continuous controller uses a 15-second command watchdog; stalled, failed or
malformed worker replies stop the session. It never restarts a solver silently
or substitutes an example waveform. If a previous interval completed, that
window remains inspectable with the failure recorded as a warning; it does not
include a partially computed failed interval.

The finite **Run experiment** path uses at most 20,000 accepted steps per worker
command, a single overall run watchdog, 250,000 retained points and a combined
two-million dense-value/sparse-event budget. Those finite-run limits do not
replace the smaller rolling-window limits above.

## Saving and reopening

Autosave and **Save backup** preserve the ordinary run record with its original
project, solver identity, plan, retained samples, sparse events and live-input
timeline. `result.continuous` records the retained absolute bounds, total and
dropped point counts, and the session's snapshot/stopped status. There is no
separate resumable `continuousRun` object in the portable format.

A saved active session is a **completed window snapshot**, not a serialized
worker. Reopening it permits plots, CSV, reports and timing measurements; it
cannot resume capacitor state, private digital memory or pending events from
that file. **Continuous…** starts again from the captured starting configuration.
Before closing the page, export a backup if the current window or its input
history matters.

Timing records made from a stopped window copy the selected event streams,
nonzero time bounds and `sourceRun.continuous` provenance, including the input
history. Removing the full source run does not remove those independent timing
records. See [timing-measurements.md](timing-measurements.md) and
[project-format.md](project-format.md) for their validation contracts.
