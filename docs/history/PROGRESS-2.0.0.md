# Release progress

Current stable release: **2.0.0**, runtime build **`6cf7ae00d61a0f43`**.

**2.0 acceptance is complete.** On October 25, 2026, the user confirmed that
hosting and browser acceptance checks passed. The accepted rc.3 implementation
has been promoted to stable 2.0.0, with matching source/deploy archives, versioned
runtime assets, recovery entries, documentation and checksums.

## Delivered scope

The catalog remains **43 parts, 37 models and 41 examples**: 16 analog,
16 digital and 9 mixed. Stable 2.0 includes:

- Analog experiments and timed four-state digital logic.
- A digital voltage source and red-HIGH logic state indicators.
- A working seven-segment display and Hex/BCD decoder.
- Coordinated analog/digital feedback and closed-loop mixed simulation.
- Multibit ADC/DAC conversion.
- Parameter sweeps and seeded analog tolerance studies.
- Continuous simulation with retained state, live inputs, Pause/Step/Resume
  and bounded result history.
- Installation diagnostics and a persistent operation/display-time strip.

The stable promotion updates release metadata, documentation and exact archive
selection for checksums. It preserves
the accepted simulation, editor, storage and worker behavior, along with all
previously documented model limits.

## Verification and acceptance

**51 promotion cases pass:** 40 release-document/installation cases
and 11 final built-package cases, including a regression for excluding older
prerelease ZIPs from the current checksum list. The independent archive audit verifies
functional byte continuity from rc.3, complete versioned assets, preserved
historical evidence, ZIP integrity and an exact rebuild from the delivered
stable source archive. Final audit details are in the accompanying
`CircuitBench-2.0.0-release-integrity.json`.

The accepted rc.3 baseline retains its own identity: **676 application cases**,
**10 package cases**, **24 native/WASM numerical comparisons**, **80 captured
output checks**, and its earlier exact 437-file rebuild. These baseline counts
are not described as fresh stable executions.

The hosting/browser acceptance is recorded as the user's confirmation in
[v200-owner-acceptance.json](../evidence/v200-owner-acceptance.json). Earlier
managed-preview limitations remain in the historical record; they no longer
hold the accepted 2.0 milestone open. No new browser/device details or external
upload are inferred from the confirmation.

## Next milestone

**2.1 — Everyday workbench** is next: convenient live controls, momentary
inputs, guided construction and wiring, navigable circuit diagnostics, clearer
compatibility explanations and practical circuit-building shortcuts.

The subsequent sequence remains **2.2 instruments and numerical confidence**,
a **nonlinear-engine architecture proof**, and then validated expansion of
continuous nonlinear mixed simulation. See [ROADMAP.md](../ROADMAP.md).

[VALIDATION.md](VALIDATION.md) contains the complete acceptance and verification
provenance. The preceding [rc.3 progress](history/PROGRESS-2.0.0-rc.3.md) is
preserved.
