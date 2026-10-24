# Coordinated transient and closed-loop mixed simulation

## Choosing the solver

**Coordinated transient** is CircuitBench's stateful analog/digital solver. It
advances the analog circuit and event logic together on one causal timeline.
An ADC event can change digital logic, the logic can change a DAC, and that DAC
can change the analog voltage subsequently observed by the ADC. This is a real
closed loop: a later chunk continues the same capacitor voltages, inductor
currents, clock phases, pending gate events, and private register/counter state.

The existing **ngspice** choice remains the full analog device solver and the
legacy feed-forward bridge mode. The coordinated solver supports **R, C, L,
independent voltage/current sources, and the explicit one-bit and multibit
converters**. It also supports the native digital parts, buses, and displays.
It rejects diodes, transistors, opamps, controlled switches, and imported SPICE
decks. Selecting a mode never substitutes a simplified semiconductor model.

Use ngspice for semiconductor/device experiments, AC analysis, operating-point
studies, or DC sweeps. Use coordinated transient for supported closed-loop
circuits and stateful continuous operation. A coordinated schematic must use
transient analysis and a finite positive maximum time step.

## Engine decision and provenance

The pinned EEcircuit-engine 1.8.0 build recipe explicitly passes
`--disable-xspice`; see the bundled source recipe
`public/engine/source/eecircuit-engine-1.8.0/Docker/run.sh` in the source ZIP
(or `engine/source/eecircuit-engine-1.8.0/Docker/run.sh` in the deploy ZIP).
The current adapter exposes complete deck execution through a command sequence
that sources a circuit, runs it, and writes the results. It does not expose the
shared-ngspice synchronization callback interface.

The upstream [ngspice shared-library interface](https://ngspice.sourceforge.io/shared.html)
is a separate integration route providing callbacks and stop/alter/resume
control. A newly compiled WASM/shared interface would need its own reproducible
build and numerical validation. This release instead adds the original,
explicitly scoped `cb-coordinated-1` engine while retaining the pinned ngspice
binary for its established role. The original code is under the project's MIT
license. It is not an XSPICE build or a replacement implementation of ngspice.

## Analog numerical method

The analog partition uses modified nodal analysis. Node voltages and the
currents through independent voltage sources and inductors are the unknowns.
Resistors use their ordinary conductance stamp. Capacitor and inductor history
are retained between accepted steps:

- Capacitor current is `C × (Vnew − Vprevious) / h`.
- Inductor voltage is `L × (Inew − Iprevious) / h`.
- `h` is the actual accepted interval, which can be smaller than the configured
  maximum step at a digital event, source corner, converter sample, DAC-ramp
  endpoint, or scalar ADC crossing.

This is **backward Euler**, a first-order integration method with numerical
damping. It has no adaptive local-error controller. Reducing the maximum step
is the primary accuracy/convergence control. The engine identifies itself in
every result; the ngspice `reltol` control does not become a fictitious tolerance
setting for this solver.

A scaled, pivoted dense linear solve handles the bounded matrix. Floating or
contradictory ideal circuits, ill-conditioned matrices, and non-finite or
out-of-bound solutions produce explicit errors. No hidden conductance or
invented leakage path is inserted to make a singular circuit pass.

With **Use initial conditions** enabled, the initial capacitor voltages and
inductor currents come from the component parameters. Without it, the initial
DC solution treats capacitors as open circuits and inductors as shorts; those
resulting states seed the transient. Initial conditions inconsistent with ideal
source constraints are rejected.

## Shared timeline and scalar ADC crossings

All scheduled times use the same declared **1 ps grid** as native logic. This
is a representation grid, not a claim of 1 ps physical or numerical accuracy.

Each advancement chooses the earliest of the requested endpoint, the maximum
analog step, the next digital event, a source breakpoint, a sampled-converter
clock, and a DAC-ramp endpoint. It tentatively solves the analog interval.
When a scalar ADC would change state, bounded bisection finds the earliest
1 ps tick whose trial endpoint crosses that ADC's threshold. The shorter step
is solved and accepted before that event is published to logic. Digital
transport delays then schedule future events rather than changing the past.

The trial solution is a numerical backward-Euler endpoint from the previous
accepted state. Bisection localizes the crossing in that approximation; it
does not create accuracy absent from the analog integration. Features that
rise and fall entirely between sampled endpoints can still be missed. Use a
maximum step appropriate to the fastest analog activity and compare a smaller
step before relying on a result.

For one-bit ADCs, the observed value is `V(input) − V(reference)` with ideal
infinite input impedance:

- **Threshold:** at or below the low threshold is `0`; at or above the high
  threshold is `1`; the intervening band is `X`.
- **Schmitt:** thresholds have the same values, but a prior known state is held
  within the band. An initial voltage in the band remains `X`.

The scalar DAC accepts resolved `0`/`1` only. `X` or `Z` is an error, including
an unresolved startup. Choose consistent source or capacitor initial conditions
for a feedback experiment. A DAC output changes through its configured finite
linear rise/fall interval. If a new code arrives before the ramp ends, the new
ramp starts at the actual current voltage.

## Multibit converters

### Sampled ADC

`ADCBUS` observes its differential input at `0, period, 2 × period, ...`.
Each observed voltage is held as a pending conversion and published atomically
after the specified conversion delay. Sampling continues at its original phase
across pauses and chunk boundaries. Until the first conversion completes,
the digital output is an explicit `X` word.

For width `N` from 2 through 8, the unsigned code is:

```text
round(clamp((Vin − Vmin) / (Vmax − Vmin), 0, 1) × (2^N − 1))
```

The range saturates rather than wraps. The zero and full-scale endpoints map
to `0` and `2^N − 1`. Quantization ties round upward. There is no loading,
aperture jitter, noise, missing-code, or physical metastability model.

### Voltage DAC

`DACBUS` consumes an unsigned 2–8 bit word and drives:

```text
Vlow + code / (2^N − 1) × (Vhigh − Vlow)
```

Its explicit startup code is applied until the first fully known input word.
This permits a sampled ADC's first conversion to finish without inventing a
voltage for its temporary `X` output. After a known word has arrived, **any
subsequent X/Z bit stops the simulation**. The startup policy is retained in
warnings and bridge assumptions. The output is an ideal voltage source with
finite linear edges, without output resistance, current limiting, physical
switching glitches, or power rails.

## Continuous sessions and live inputs

The stateful API is:

```javascript
const plan = compileCoordinated(project, generated);
const session = createCoordinatedSession(plan);
const first = session.advanceTo(0.001, { maxSteps: 2048 });
session.setInputs([{ id: inputComponentId, value: '0xA' }]);
const next = session.advanceTo(0.002, { maxSteps: 2048 });
```

An advancement returns `done: false` when its chunk step budget is consumed;
the caller continues toward the same endpoint. The session retains state and
the future event queue. A pure digital session jumps directly between events,
without fabricating analog sampling steps. The UI/worker controller owns
scheduling, cancellation, pause/resume, and its bounded rolling history.

Chunks have **absolute timestamps** and include the current state at their
starting boundary. That boundary state is not a newly invented edge. The
caller merges overlapping boundaries and preserves a full-run or rolling
window's explicit bounds. Every chunk includes engine identity, sampling rules,
bridge assumptions, statistics, and the timestamped live-input history.

Live controls support constant `DIN`/`BUSIN` and independent **DC** voltage or
current sources. Updates take effect at the current accepted time. A digital
change travels through the normal gate delays. A DC source update refreshes
the algebraic node solution while preserving capacitor/inductor state, then
notifies scalar ADCs of any immediate crossing. A change requiring an impulse
through contradictory ideal source/capacitor constraints is rejected. Editing
topology or other component parameters requires a new session.

Pending source patterns, clock phase, output transport events, converter
sampling phase, and conversions already in flight survive continuation. Live
changes are recorded as data; a resumed session is not a freshly solved
operating point or a replay of an earlier completed run.

## Numerical verification

`tests/coordinated.test.mjs` covers independent RC/RL/RLC expectations, step
convergence, initial states, current sign, singular circuits, pure-digital
agreement with the established kernel, private counter state, future transport
events, closed-loop oscillation, converter sampling/delay, unknown words,
interrupted DAC ramps, and live changes.

`scripts/prove-coordinated.mjs` executes actual **ngspice 45.2 WASM** and pinned
**native ngspice 42** reference circuits. Its dated record is
[coordinated-validation.json](../evidence/coordinated-validation.json).
The current proof has 24 passing checks over four fixtures:

| Fixture | Acceptance criterion | Observed maximum difference |
|---|---|---|
| RC, 1 ms time constant, 100 ns step | ≤25 µV across the transient | 18.394 µV against both ngspice references |
| RL, 1 ms time constant, 100 ns step | ≤250 nA across the transient | 183.935 nA against both references |
| Underdamped RLC, 50 ns step | ≤2 mV across the transient | 1.519 mV against both references |
| Schmitt-controlled RC feedback | Analytic period within 2 µs; reference period within 0.3% | Coordinated mean 1.69544838 ms; reference mean 1.69537218 ms |

The feedback reference is independently implemented using a hysteretic ngspice
switch, a 1 Ω pull-up, 1 µΩ on resistance and 1 TΩ off resistance. The coordinated
loop instead uses an explicit ADC, delayed inverter and finite-edge DAC. The
0.3% comparison allowance includes those declared topology differences and
maximum-step error. It is not a byte-identical circuit equivalence claim.

These numerical checks do not claim browser rendering, production-worker
cancellation, HTTPS installation or offline operation; the release validation
record reports those separately.

## Bounds

- At most 48 non-ground analog nodes, 160 analog elements, and 80 matrix
  unknowns, including temporary initial-condition constraints.
- At most 255 scalar digital nets and 600 expanded digital elements, consistent
  with the native event engine.
- At most 20,000 accepted steps per requested chunk, with a default of 2,048;
  at most 200,000 digital events processed/scheduled per chunk.
- At most 256 result vectors and two million values per chunk.
- At most 10,000 retained live-input changes in one session.

A limit produces a diagnostic or an unfinished bounded chunk as described
above. It never silently discards a circuit component, unknown state, or pending
logical transition.
