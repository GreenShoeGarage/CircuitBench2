# Release progress

Current candidate: **1.1.0-rc.1**, runtime build **`089964ae0aed2792`**.
The user's next priority is digital and mixed-signal simulation. This candidate
delivers the first usable milestone while keeping the previous stable-release
acceptance gates open. It has not been deployed to the supplied public host.

| Workstream | Implemented behavior | Verification |
|---|---|---|
| Analog foundation retained | ngspice 45.2 WASM, adapter 4, disposable workers and existing analyses | 62 foundation checks; 15 analog fixtures,70 native comparisons,16 behavior checks |
| Four-state digital | Inputs, clocks, BUF/NOT/AND/OR/XOR/NAND/NOR/XNOR, TRI, DFF; 1 ps transport events | 22 kernel tests; all 4 digital examples executed; browser half-adder,DFF and0/X/1/Z bus |
| Typed schematic | Analog/digital domains, square logic pins, logic probes, explicit bridges | 23 model/compiler and 6 digital-editor tests; browser direct-domain rejection |
| Feed-forward mixed replay | Threshold/Schmitt ADC, finite-edge DAC, real analog passes; rejects cross-domain feedback | 86 checks across 10 digital/mixed fixtures,24 workers terminated; browser DAC/RC and fullADC→logic→DAC runs |
| Timing and evidence | Mixed/Logic views, literal states, cursors, baseline, original/interpolated row provenance | 10 digital plot/report tests; browser 894-row mixed CSV and 16-position X/Z timing |
| Durable projects | Additive schema1, sparse events, captured plans/decks, bounded typed results | 8 storage tests; digital and mixed browser backup/reopen/reload |
| Reports | Digital timing configuration, separate recorded engines, exact plans/decks | 14 existing results tests plus new report fixtures; final browser previews; HTML download/native PDF gate open |
| Packaging and deployment | Complete local 22-asset runtime, release-specific paths, recovery,source/deployZIPs | 9 package, 22 service-worker and 12 recovery tests; exact archive hashes/CRCs in receipt |
| Next feature work | Buses/vectors, counters/registers and timing measurements; coordinated feedback evaluation | Roadmap only; not claimed as implemented |

The full focused suite is **206 passing tests**; exact counts and transcripts
are in [focused-test-summary.json](../../evidence/history/1.1.0-rc.1/focused-test-summary.json).
Numerical proof and browser observations remain separate evidence layers.
[VALIDATION.md](VALIDATION-1.1.0-rc.1.md) states their measured results, build identities
and practical limits.

## Scope boundary

This milestone is an event-driven digital simulator connected to the existing
analog engine by explicit one-bit bridges. Mixed execution is feed-forward
replay. Analog DAC-to-ADC influence is conservatively rejected, and X/Z cannot
be mapped to a DAC voltage. Initial gate settling, DFF edge interpretation,
transport timing and ADC sampling assumptions are documented in
[digital-engine.md](../digital-engine.md).

The final analog result grid preserves every original final-pass sample. Any
analog values added at digital event positions are labeled as interpolated.
The initial ADC input pass is retained as its executed deck and diagnostics;
its separate sample grid is not returned as the final waveform.

## Before stable promotion

- Verify the exact candidate on the target HTTPS deployment, including upgrades
  from the prior installed version and all versioned worker/engine responses.
- Verify browser offline reload/update and recovery preserving saved projects.
- Close HTML report/download/native print/PDF and browser/viewport acceptance.
- Keep the current limitations visible; coordinated feedback is future work.

See [ROADMAP.md](../../ROADMAP.md) for the reprioritized sequence and
[history/PROGRESS-1.0.0-rc.3.md](PROGRESS-1.0.0-rc.3.md) for the preserved
previous milestone record.
