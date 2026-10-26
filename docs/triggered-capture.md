# Triggers, captures and event navigation

CircuitBench 2.2 adds instruments to an existing continuous coordinated session.
The worker retains the same capacitor, inductor, digital and converter state
while it searches, pauses and captures. Saved captures retain numerical evidence;
they cannot recreate the private worker state for resumption.

## Capture a transition

1. Load a supported transient schematic and start **Continuous…**. Let at least
   one update complete so its signal list is available.
2. Choose **Capture…**. The workbench pauses at a completed boundary.
3. Select a raw analog voltage/current signal, a scalar digital signal, or an
   explicit bit of a bus. Bit 0 is the least significant bit.
4. Select rising, falling or either edge. For an analog signal, enter the
   threshold in that signal's units.
5. Declare pre-trigger history, post-trigger duration and the maximum search
   duration. Choose **Arm capture & run**.
6. The session pauses when the post-trigger interval is complete. Open
   **Captures** to inspect the saved event, history coverage, immutable circuit
   revision and raw waveform, or export its evidence JSON/CSV.

**Run until…** uses the same trigger but sets post-trigger duration to zero.
It pauses at the matching event. If no qualifying event appears within the
declared search duration, the status says so and no completed capture is
invented. Pause/Resume can interrupt and continue a search. Cancel trigger
removes the armed condition; Stop cancels it and releases the worker.

## What counts as an event

Digital triggers require a direct settled **0→1** or **1→0** transition.
Transitions involving X or Z do not establish a binary edge. Simultaneous
digital events settle before the captured value is recorded.

An analog trigger first finds a crossing bracket in an actual solver step,
then evaluates trial states inside that step on the 1 ps event grid. The
accepted state at the crossing becomes the worker's retained state and the
capture endpoint. This is localization on the numerical solution, not a
claim of physical accuracy to 1 ps. The model, maximum analog step and
backward-Euler damping still determine the response. Crossings that disappear
between coarse step endpoints can be missed; reduce the maximum step and
compare the measured result.

An armed trigger also observes an explicitly applied live source change at
its current simulation boundary. Its witness is marked `live-input-boundary`
and retains the input updates. Before and after values at that instant do not
imply a finite pulse duration. A momentary press and release while paused can
occur at the same time; advance the solver between them when duration matters.
If a later change at the trigger timestamp supersedes its observed state before
post-trigger collection advances, the capture is explicitly cancelled. The
workbench asks you to advance time between press/release and rearm. Unrelated
input changes remain valid; completed zero-post snapshots remain immutable.

## Step to the next event

**Next event** searches the worker's pending digital events, analog source
corners, converter sample times, DAC ramp ends and localized scalar ADC
threshold changes. It passes ordinary analog integration samples and pauses
at the first qualifying scheduled boundary. A scheduled digital event may
leave the resolved output unchanged; it is still a real scheduled operation.

Each command is bounded to 2,000 accepted steps and the declared search
interval. Reaching 2,000 steps before the horizon is a **work limit**; completing
the entire requested interval without an event is a **search limit**. The
workbench records the requested end and actual searched end, retains the
advanced state and allows another search. It never labels
the last numerical sample as an observed event. Cancel an armed capture before
using Next event to select a different stopping condition.

## Requested and retained windows

The capture records both the requested window and the actual original sample
bounds. It keeps a preceding original sample when needed to explain the
crossing; that may extend the visible window slightly. It never interpolates
an invented analog sample solely to make a requested history boundary exact.
Digital values at the left boundary are held states, not invented edges.

Pre-trigger data may be unavailable because the session began too recently,
its rolling history has already discarded it, or the evidence budget was
reached. The capture displays the unavailable duration and a **partial**
coverage status. Post-trigger data is also explicitly partial if the safe
9,000-second timeline ends before the requested interval.

The rolling buffers retain at most 30,000 positions, one million dense values
and 250,000 sparse digital events. Independent capture history keeps up to
six whole records, at most 16 MiB per record and 32 MiB in total. Old captures
are removed as whole records when needed; the workbench reports the count.
Save backup includes those records independently of the ordinary run history.

## Evidence and validation

Each record includes the trigger configuration, source run identity, circuit
snapshot and revision, exact simulation input and available hashes, engine
identity, input-change history, trigger witness and selected raw window.
Reopening validates the saved run, signal domain and bit width, event witness,
input-boundary history where applicable, and recomputed coverage. If the
witness samples remain inside the window, their values must agree exactly.

These checks establish internal consistency of saved evidence. They cannot
authenticate an externally edited standalone file. A report identifies each
capture's original run and revision; selecting a saved capture does not replace
the working schematic.
