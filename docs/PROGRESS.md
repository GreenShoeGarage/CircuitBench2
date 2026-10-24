# Release progress

Current candidate: **1.0.0-rc.1**. This record separates implemented code from
completed verification. [Release validation](VALIDATION.md) controls promotion
to 1.0.0. The browser offline gate remains blocked by the available insecure
HTTP review origin; the candidate is not promoted.

| Batch | Implementation | Verification status |
|---|---|---|
| 1. Foundation | Pinned local WASM, reusable engine facade, actual termination, explicit licenses/source, native reference | 62 numerical/lifecycle checks passed; 56 workers disposed, repeated-run memory criterion passed; Unicode raw-header regression fixed and tested |
| 2. Complete RC experiment | RC example, value editing, run, plotting, pin baseline, save/open | Browser completed 501-point AC, 100 nF → 220 nF baseline comparison, undo/redo stale-state checks, backup export/import and reload |
| 3. Schematic workbench | Pin-based wires, junctions, labels, movement/rotation/mirror, selection, undo/redo, clipboard, keyboard alternatives | 25 core and 11 editor logic tests passed; browser moved/rotated/mirrored a connected C1, deleted/reconnected a wire and reran; crossing/junction/undo computed 5 V / 2 V → 3.5 V / 3.5 V → 5 V / 2 V |
| 4. Analysis tools | OP/DC/AC/transient, probes, complex results, cursors, plots/overlays | Engine analysis checks and 13 result/report/import tests passed; actual browser AC, baseline and cursor/delta readouts confirmed |
| 5. Practical library | 14 types, 8 explicit educational models, 13 worked examples, import diagnostics | All 13 examples plus current-source/PWL fixtures passed; 70 native vector comparisons and 16 behavior checks; model limitations explicit |
| 6. Durability and outputs | IndexedDB current/previous state, portable files, SPICE/SVG/CSV, designed print report | 4 autosave logic tests passed; browser backup export/import/reload, imported-evidence warning, full CSV and HTML preview confirmed; exact final report passed independent three-page A4 PDF layout review; native Chrome print and HTML/SPICE downloads remain unverified |
| 7. Release candidate | Local assets, themes, responsive UI, service-worker install/update, docs and release packaging | 6 package and 9 service-worker VM tests passed; browser themes, constrained phone/tablet viewports, Stop/recovery and subdirectory run confirmed; secure-context offline gate blocked by plain-HTTP review endpoint |
| 8. v1.0.0 | Reserved for the exact verified release | Not yet claimed by this candidate record |

## Evidence already recorded

`evidence/engine-validation.json` contains the actual numerical values, native
reference identity, tolerances, failure/recovery checks, worker lifecycle counts
and memory observations. The proof uses production WASM through a Node Worker
adapter; it is not a browser result.

`evidence/example-validation.json` adds actual generated-deck evidence for all
13 examples and two supplementary source fixtures, including the exact decks,
model identities and per-vector comparison tolerances.

The seven logic suites total 74 passed Node/VM tests, including six raw-parser
regressions. Source tests and example
validation scripts are shipped so their assertions can be inspected and
repeated. Actual browser observations are listed separately in
[VALIDATION.md](VALIDATION.md). A passing compilation is not treated as
functional verification. Any check blocked by the execution environment remains
explicitly unverified in the final handoff.

`evidence/report-layout.json` records visual review of the exact final browser
report HTML rendered to three A4 pages by WeasyPrint 66.0 and rasterized by
Poppler 26.05.0 at 110 dpi. This is separate from the untested native Chrome
print dialog. Final archive identities belong in the accompanying
`CircuitBench-1.0.0-rc.1-release-integrity.json` receipt, written only after
packaging and verification, outside the ZIPs.

## Browser verification limit

The available managed browser review URL is plain HTTP on a non-localhost host.
Its browser security context does not permit service-worker installation.
Consequently, successful browser offline reload and update activation cannot be
claimed from that review surface. `tests/package.test.mjs` verifies complete
local runtime assets, correct WASM filenames, module paths, scope-relative
precache entries, exact version and package hashes, but those deterministic
checks do not replace real secure-context browser offline verification. Keep
the release-candidate label while this required gate remains unverified.

## Architecture review

Reusing EEcircuit-engine was successful. Reusing the whole EEcircuit frontend
would require an unavailable sibling schematic dependency; CircuitBench instead
uses a small SVG editor with one authoritative electrical model. No native
production runner is required by the completed foundation evidence. There is no
new numerical solver and no demonstration waveform fallback.

The interface keeps the circuit, experiment settings and measurements together.
Future capability beyond the analog v1 scope is deferred to `ROADMAP.md`.
