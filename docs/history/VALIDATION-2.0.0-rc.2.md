# Release validation and handoff

**Candidate: 2.0.0-rc.2 · Runtime build: `672a6435dfd88d38` · October 24, 2026**

This update delivers the requested digital voltage source and red-HIGH logic
state indicators. The catalog contains **43 parts, 37 model records and 41
examples**: 16 analog, 16 digital and 9 mixed. All six earlier 2.0 feature
batches remain implemented: seven-segment displays, coordinated analog/digital
feedback, closed-loop execution, multibit converters, analog studies and
continuous simulation.

The deploy package is prepared for self-hosting. The public Green Shoe Garage
installation has not been modified. Secure offline/update acceptance on that
exact host remains a separate release gate.

## New parts and controls

| Capability | Verified contract |
|---|---|
| DVS digital source | Native scalar 0/1 output, LOW/HIGH inspector buttons and binary live controls; works with gates and truth tables without an analog ground |
| DVS optional voltage | Separate analog +/− terminals, default 0/5 V and 1 µs edges; configurable levels and rise/fall; initial voltage matches selected starting state |
| DLED indicator | Passive scalar observation; red glow only for resolved 1, dark 0, amber X, dashed blue Z and neutral unavailable data |
| Readback | Actual sparse events from the selected run/revision and Cursor A; stale, malformed, contradictory and out-of-window evidence cannot light a lamp |
| Continuous changes | Applied at the retained solver boundary, recorded with time, preserve capacitor/digital state and the original project snapshot; paused sessions require Step or Resume |
| Safe wiring | Analog/digital domains remain explicit; removing voltage pins while wires, labels or probes use them is rejected; unresolved voltage-drive X/Z produces a diagnostic |

The source voltage is ideal, without current limit, output impedance or supply
rails. The indicator's glow is a logic readout, not a current/brightness model
for a physical LED. See [the complete guide](../logic-io.md).

## Application regression

**595 individual tests passed across 40 application files**, with zero failures,
cancellations, skipped cases, TODOs or timeouts. Every file was executed directly
with Node so individual cases remain visible in this environment. The record is
[rc202-test-summary.json](../../evidence/rc202-test-summary.json), with matching
per-file transcripts in `evidence/rc202-tests/`.

This includes 45 new focused cases: 15 source/voltage cases, 14 indicator cases,
10 application-control cases and 6 example integration cases. They exercise
actual source levels through pinned WASM workers, finite live edges, differential
references, retained RC state, signal contention, exact event boundaries,
passive loading, source-name collisions, input rejection, malformed evidence,
backup round trips, asynchronous ownership and accessible inline SVG rendering.
The earlier analog, digital, mixed, display, timing, study, storage and recovery
suites also pass.

The first sweep found a stale example-count assertion. The assertion now reflects
the real 41-example catalog, and its 25-case file was rerun successfully. The
original transcript is retained as superseded evidence. No runtime change was
needed to correct that assertion.

**Nine built-package tests also pass, for 604 Node test cases across 41 files.**
The built-package gate is captured separately in
[rc202-package-tests.json](../../evidence/rc202-package-tests.json); the external
release-integrity receipt records the final package check and archive hashes.

## Fresh numerical comparison

[rc202-coordinated-validation.json](../../evidence/rc202-coordinated-validation.json)
records **19 passing checks** using the actual pinned ngspice 45.2 WASM engine,
analytic references and retained-state checks.

| Comparison | Maximum difference / result | Acceptance |
|---|---|---|
| RC trace, 100 ns maximum step | 18.394 µV | ≤25 µV |
| RL trace, 100 ns maximum step | 183.935 nA | ≤250 nA |
| RLC trace, 50 ns maximum step | 1.519 mV | ≤2 mV |
| Schmitt feedback mean period | 1.69544838 ms coordinated; 1.69537218 ms WASM reference | 0.3% declared topology allowance |

The current environment does not contain the previously pinned native ngspice42
executable. The default native/WASM proof stopped with ENOENT before numerical
checks; the explicit `--wasm-only` mode then ran the 19 checks above. This update
does not claim a fresh native comparison. The preceding 24-check native/WASM
baseline is preserved under its original release identity in
[2.0.0-rc.1 validation](../history/VALIDATION-2.0.0-rc.1.md).

The analog maximum step controls backward-Euler numerical accuracy. The 1 ps
digital scheduling grid does not imply 1 ps physical accuracy. The coordinated
analog subset remains R/C/L and independent V/I sources; ngspice remains
available for the established nonlinear analog devices.

## Actual browser workflows

The browser record is
[rc202-browser-validation.json](../../evidence/rc202-browser-validation.json).
Tests used the managed Chrome preview at `http://terminal.local:4173/`.

| Workflow | Observed result |
|---|---|
| Source through NOT | Changing the source and rerunning reverses the red and dark indicators |
| Continuous LOW/HIGH | LOW applied at 17.3 ms, HIGH at 17.4 ms; the inverter changes 10 ns later; original source state remains HIGH |
| Rolling evidence | Retained 15.5–17.5 ms, 23 points from 178 total; both live input changes remain recorded |
| Voltage mode at 5 V | 503 points over 5 ms; direct and Schmitt-sensed indicators both HIGH at the end |
| Voltage mode at 3.3 V | 502 points over 5 ms; direct indicator HIGH and sensed indicator LOW, consistent with the 3.5 V upper threshold |
| Four states | At 4.5 ms, indicators read 1,0,X,Z; Cursor A at 1.481650892 ms changes them to 0,X,Z,1 |
| Backup import | The downloaded live project reopened through the actual file chooser, restoring its 23-point result and final HIGH/LOW lamps |

The three actual downloaded project files are retained as evidence. **101
independent checks pass** over seven captured runs and nine repeated import/JSON
round trips. Every one of the 1,508 captured RC samples satisfies the independent
backward-Euler recurrence to within 2.576 × 10⁻¹⁴ V. Import, event, indicator
and numerical checks are recorded in
[rc202-export-validation.json](../../evidence/rc202-export-validation.json) and can
be repeated with `node scripts/verify-logic-io-evidence.mjs`.

No application-origin console error was observed during these workflows.
Extension metadata errors were excluded. The schematic SVG control reported
success, but obtaining its downloaded path timed out in the cloud browser;
actual SVG file delivery is therefore not claimed. Inline export paint is
covered by application tests.

## Remaining acceptance scope

The target HTTPS host's worker/WASM responses, offline installation and update,
project-preserving recovery, native print/PDF and full browser/viewport matrix
remain open. The preceding candidate's HTML report download limitation remains
recorded; this request did not change that output path. These limits do not
prevent using the completed source and deploy packages.

Historical results retain their original identities:
[2.0.0-rc.1](../history/VALIDATION-2.0.0-rc.1.md) and
[1.3.0-rc.1](../history/VALIDATION-1.3.0-rc.1.md).
