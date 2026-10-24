# Release progress

Current candidate: **1.3.0-rc.1**, runtime build **`352ddfa1ccaa148b`**.
This increment delivers event-based digital timing measurements on the existing
analog, digital, bus and feed-forward mixed-signal workbench. No external host
was modified.

| Workstream | Delivered behavior | Verification |
|---|---|---|
| Timing core | Delay, pulse width, period, frequency and duty cycle; explicit scalar/bus-bit selection | 34 independent-event and kernel-fixture tests |
| Edge semantics | Direct binary edges, inclusive windows, simultaneous zero delay, X/Z ambiguity and missing edges | Core fixtures plus actual-worker proof and browser uncertainty example |
| Saved evidence | Immutable source circuit/run, selected sparse events, input/engine identity and assumptions | 19 evidence tests, arithmetic recomputation on import and browser backup/reopen/reload |
| Measurement workflow | Setup, engineering units, exact pair table, summaries, history and View pair cursors | 12 presentation tests, 15 actual-app integration tests and desktop browser checks |
| Portable outputs | Timing CSV and evidence JSON; project backups and report sections | All three JSON/CSV download paths inspected; project backup reopened; HTML report preview verified |
| Examples | Clock/delay, reconvergent hazard, and X/Z plus unfinished pulses | All 29 examples compile/round-trip; five fixtures in fresh actual-worker timing proof |
| Existing engine | Same analog WASM, event kernel, coordinator, compiler and part definitions | SHA-256 comparison with released 1.2 source; refreshed application regressions |
| Package | Complete versioned assets, bundled engine, recovery and source/deploy archives | Final manifest, source mapping, package tests and archive integrity receipt |
| Remaining release gates | Target HTTPS/offline/update/recovery, HTML report download, native print/PDF and browser matrix | Open; exact limitations in VALIDATION.md |

The release test total is **375 passing tests across 26 files**, comprising
366 application tests and the nine-test final package gate. The captured logs
and their timestamps are listed in
[focused-test-summary.json](../../evidence/history/1.3.0-rc.1/focused-test-summary.json).

Fresh timing proof passes **69 checks across five real-worker fixtures and 11
measurements**. All six simulation workers terminated: five digital and one
analog. The proof includes the real bus-to-DAC/RC example and retains source
hashes matching the implementation. See
[timing-validation.json](../../evidence/history/1.3.0-rc.1/timing-validation.json).

## Browser outcomes

All five measurement kinds were exercised on the authored clock example:
20 ns propagation delay, 25 ns high pulse, 100 ns period, 10 MHz frequency and
25% high duty cycle. The incomplete final cycle remained a missing-edge row.
An invalid time window produced an error without appending evidence.

The browser retained five measurement records after removing their full source
run. The downloaded project backup restored that run and all five records,
showed the restored-evidence notice, and survived another page reload. Timing
CSV and standalone evidence JSON were downloaded and inspected. The analysis
report displayed all retained timing records even without a full source run.

The uncertainty example measured one 40 ns pulse, retained two indeterminate
X/Z pulses and marked the final pulse missing its closing edge. Explicit bit 2
of the mixed bus/DAC run measured 1 ms. The reconvergent example measured both
20 ns hazard pulses; View pair showed the exact 115 ns and 135 ns cursors with
one selected hazard lane. Detailed observations are in
[rc130-timing-browser.json](../../evidence/history/1.3.0-rc.1/rc130-timing-browser.json).

The HTML report download timed out in this browser. Its preview worked; no
cause or successful download is claimed. Native print/PDF and the full
browser/viewport matrix remain unverified. The managed preview is HTTP on a
non-localhost origin, so target HTTPS offline acceptance also remains open.

## Next increment

The next milestone is coordinated mixed-signal feedback engine evaluation:
verify a viable XSPICE-enabled build or pause/resume interface, define analog
threshold/event synchronization, and prove small feedback fixtures before
exposing the new mode. Current mixed execution remains feed-forward through
explicit one-bit bridges; DAC-to-ADC feedback and X/Z DAC input are rejected.

Setup/hold diagnostics require explicit constraints and remain a separate
follow-up. The current 1 ps grid does not model physical metastability or
manufacturer timing accuracy. See [ROADMAP.md](../../ROADMAP.md),
[VALIDATION.md](VALIDATION-1.3.0-rc.1.md) and the preserved
[1.2 progress record](PROGRESS-1.2.0-rc.1.md).
