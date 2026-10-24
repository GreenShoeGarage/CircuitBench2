# Changelog

## 1.0.0-rc.1 — 2026-10-24

First reviewable CircuitBench release candidate.

### Added

- Versioned authoritative electrical project model separate from visual layout.
- Schematic editing, explicit pin connectivity/junctions/net labels, context
  properties, selection, copy/paste, rotation/mirror, undo/redo and SVG export.
- Real ngspice 45.2 WebAssembly execution through pinned EEcircuit-engine 1.8.0.
- Disposable worker isolation with physical cancellation, watchdog timeout,
  diagnostic preservation and fresh-run recovery.
- DC operating point, one-source DC sweep, logarithmic AC and transient analyses.
- Voltage/differential/current measurements, magnitude/phase, cursors, numerical
  CSV, immutable run records and baseline comparisons.
- Fourteen component types and thirteen worked examples with explicit generic
  educational models and limitations.
- Local autosave/recovery, portable project files, SPICE subset import/export,
  component CSV and designed printable analysis reports.
- Dark/light/high-contrast themes, responsive panels, keyboard alternatives,
  local runtime assets and offline-installation support.
- Reproducible package extraction, third-party notices/source, user/deployment
  guides, compatibility boundaries, numerical evidence and focused tests.

### Verification at candidate creation

The 62-check numerical/worker foundation suite passed against analytic cases and
a pinned native ngspice reference, with 56 workers created and terminated. All
13 worked examples plus two source fixtures passed 70 native vector comparisons
and 16 analytic/behavior checks. Another 74 Node/VM tests passed across the core,
editor, results/reports, autosave, package, service-worker and raw-parser suites.

The actual browser completed RC computation, changed-capacitor baseline
comparison, project backup export/import/reload and report preview, with further
editing and deployment checks recorded in [VALIDATION.md](docs/VALIDATION.md).
Real browser offline installation/reload/update remains unverified because the
managed review origin is insecure HTTP on a non-localhost host. Standalone
report HTML and SPICE-file downloads also remain unverified. This candidate is not promoted
to v1.0.0 while its required release gates remain open.

### Fixed during candidate review

- Corrected upstream raw-output parsing for Unicode project titles: locate
  binary data by byte position and validate payload lengths. The original
  two-divider failure now returns 5 V and 2 V in both the browser and numerical
  regression suite. The numerical WASM binary is unchanged; adapter version is 2.
- Corrected endpoint-body routing for moved, rotated and mirrored components,
  with the actual RC capacitor transformation retained as an editor regression.

### Scope

No external destination has been deployed. Digital logic, MCU/HDL simulation,
PCB layout, classroom administration, real-time collaboration and AI assistance
remain outside this release.
