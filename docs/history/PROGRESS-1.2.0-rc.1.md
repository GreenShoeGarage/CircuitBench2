# Release progress

Current candidate: **1.2.0-rc.1**, runtime build **`7ad78c372946c614`**.
Digital and mixed-signal simulation remains the user's priority. This increment
adds bus words, larger digital building blocks and editable/generated truth
tables. The supplied public host has not been updated; it still displayed
1.0.0-rc.2 during this milestone's live check.

| Workstream | Delivered behavior | Verification |
|---|---|---|
| Analog foundation | Unchanged ngspice 45.2 WASM and disposable worker adapter 4 | 62 foundation checks; 15 analog fixtures, 70 native vector comparisons and 16 behavior checks |
| Bus model/compiler | 1–8 bit words, exact pin widths, Slice/Join aliases and compilation bounds | 72 core/domain/bus-model tests; all 26 examples compile and schema-round-trip |
| Digital building blocks | Patterns, private register/counter state, MUX, decoder and LUT | 43 kernel/expansion/truth-table tests; 149 actual-worker checks across 16 fixtures and one table |
| Typed schematic and timing | Bus wires/pins, exact word lanes/cursors/CSV, width-aware baselines | 27 editor tests; 26 plot/report tests; browser bus aliases, counter and mixed waveforms |
| Truth-table workflow | Row editor, numeric words, repair of incomplete imports, bounded enumeration | Browser enumeration/edit/history/repair; 17 app lifecycle tests and 10 evidence/UI tests |
| Durable evidence | Captured revisions/plans, literal bus words, latest four saved tables | 13 storage and 4 autosave tests; saved tables survived a refreshed browser build |
| Worker lifecycle | Independent digital/analog/table workers, cancellation, bounded work | 10 coordinator tests; 33/33 workers terminated in digital/mixed proof, 56/56 in analog foundation |
| Complete package | Versioned assets, one bundled WASM, recovery and source/deploy archives | Nine-test package gate plus exact manifest, source mapping, ZIP CRC and SHA-256 receipt |
| Remaining acceptance | Target HTTPS installation/update/recovery, output/browser matrix | Open; detailed evidence and limitations in VALIDATION.md |

The focused suite comprises **295 tests across 22 files**, including the final
package gate. The exact captured results and build chronology are in
[focused-test-summary.json](../../evidence/history/1.2.0-rc.1/focused-test-summary.json). Numerical
worker proof, browser observations and archive integrity are separate layers;
none substitutes for the others.

## Browser progress

The browser completed the authored half-adder table, accepted a LUT row edit,
retained earlier table snapshots, rejected a connected width change without
incrementing the revision, and preserved saved tables across a refreshed build.
Numeric LUT input and draft-preserving validation passed. The incomplete-LUT
repair UI preserved original text on Cancel and committed a correction only on
Apply. The final runtime loaded the versioned digital worker and analog WASM,
and completed the bus-bit/DAC/RC example with 635 shared positions.

A truth-table CSV download was inspected and matched all four expected rows.
A later table-evidence download timed out, and a reported project backup path
could not be read or reopened. These actions are not counted as successful
exports. Their cause is unassigned. The current candidate still needs the
portable-output acceptance checks on the target HTTPS build.

## Scope boundary and next increment

Bus words are 1–8 bits; LUTs have 1–4 input bits and 1–8 output bits. Independent
truth tables enumerate up to 8 selected constant input bits, 256 rows and 32
outputs. Clocks, patterns, stateful parts and mixed circuits require transient
runs. Digital timing uses explicit 1 ps transport events; it does not model
physical setup/hold or metastability.

Mixed-signal execution remains feed-forward through explicit one-bit bridges.
A bus reaches a bridge through a scalar Slice. DAC-to-ADC feedback and X/Z DAC
inputs are rejected. The next feature milestone is event-based digital timing
measurements, followed by coordinated feedback engine evaluation.

Before stable promotion, upload and verify the exact candidate on HTTPS,
including prior-version upgrade, offline reload/update, installation-scoped
recovery preserving projects, portable outputs and the browser/viewport matrix.
See [ROADMAP.md](../../ROADMAP.md), [VALIDATION.md](VALIDATION-1.2.0-rc.1.md) and the preserved
[1.1 progress record](PROGRESS-1.1.0-rc.1.md).
