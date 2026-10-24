# Release validation and handoff

**Candidate: 1.0.0-rc.1 · Record date: October 24, 2026**

CircuitBench has passed its numerical, data-model, editor-logic, result,
autosave, package and service-worker logic checks. The managed browser has also
completed the RC experiment, baseline comparison, portable-project round trip
and report-preview workflows described below. This is a **release candidate**,
not a declaration that every v1.0.0 release gate has passed.

The remaining secure-context browser offline gate is blocked by the supplied
review surface: it serves plain HTTP on `terminal.local`, which is not
localhost. The browser therefore cannot install a service worker there. Local
asset checks and a simulated service-worker environment passed; neither proves
real browser offline reload or update activation. The candidate label remains
until that required gate is actually verified on HTTPS or localhost.

## Evidence layers

The layers below establish different things. Counts are kept separate because
an assertion about electrical connectivity, a native vector comparison and a
browser interaction are not interchangeable tests.

| Layer | Result | What it establishes |
|---|---|---|
| Core model/netlist tests | 25 passed | Authoritative topology, units, schema round trips, model binding, import rejection and analysis bounds |
| Editor logic tests | 11 passed | Explicit junctions, connection-preserving edits, isolated drag previews, clipboard, keyboard actions, transformed-part wire routing and historical SVG rendering |
| Result/report/import tests | 13 passed | Complex measurements, current direction, axes, descending sweeps, CSV, baseline compatibility, immutable saved evidence and escaped reports |
| Package tests | 6 passed against the built candidate | Manifest hashes, matching source/build bytes, real WASM filename, complete local assets and relative module paths |
| Service-worker VM tests | 9 passed | Generated install/fetch/update logic with simulated CacheStorage and network; root and subdirectory scope isolation |
| Autosave logic tests | 4 passed | Serialized writes, latest-revision status, rapid-edit coalescing and failure/recovery behavior |
| Raw-parser regression tests | 6 passed | UTF-8 titles, real/complex binary offsets, CRLF headers, typed-array offsets and explicit malformed-payload rejection |
| Actual WASM foundation | 62 checks passed | Real ngspice analyses, Unicode-title dividers, analytic references, native comparisons, failure/cancel/timeout recovery and disposable workers |
| Authored example circuits | 15 fixtures passed | All 13 project examples plus independent-current-source and PWL fixtures; 70 native vector comparisons and 16 analytic/behavior checks |
| Managed browser session | Confirmed workflows below | Actual UI, browser module/worker loading, computation, plotting, backup import/reload and report preview |
| Independent report PDF layout | Passed, three A4 pages | Exact browser-generated HTML rendered with WeasyPrint 66.0, rasterized with Poppler 26.05.0 at 110 dpi and visually reviewed on every page |

The first seven rows total 74 Node/VM tests. Their source is shipped in the source
package's `tests/` directory. Captured logic output is provided for
[core](../evidence/core-tests.txt),
[autosave](../evidence/autosave-logic.txt) and
[offline logic](../evidence/offline-logic.txt). The numerical records include
their own timestamps, measured values, tolerances and pass/fail results:
[`engine-validation.json`](../evidence/engine-validation.json) and
[`example-validation.json`](../evidence/example-validation.json).

## Actual numerical results

The production engine is EEcircuit-engine **1.8.0**, containing ngspice **45.2**
WebAssembly. The test harness runs the production engine facade and worker
adapter using Node `worker_threads` through a small Worker API shim. The shim
supplies worker messaging and local WASM loading; it does not replace the
numerical solver or manufacture traces.

The development reference is native ngspice **42+ds-3build1**, with executable
SHA-256
`820658317b0b54035208da41936fd6871ce924036e5ea4113a4168b821b7fc45`.
The native and WASM versions differ. Agreement demonstrates the recorded
fixtures within their stated tolerances; it is not a claim that every possible
model or dialect is equivalent between versions.

### Analytic acceptance fixtures

| Fixture | Measured result | Reference and allowed absolute error |
|---|---:|---|
| Equal 10 kΩ divider, 10 V input | 5 V | 5 V; 1 nV |
| Divider source current | −0.0005 A | −0.0005 A into the source positive terminal; 1 pA |
| DC-sweep final midpoint | 5 V | 5 V; 1 nV |
| Independent dividers with a Unicode project title | 5 V and 2 V | 5 V and 2 V; 1 nV each |
| RC cutoff, R = 10 kΩ and C = 100 nF | 159.15494309189532 Hz | `1/(2πRC)`; 1 nHz for the direct frequency fixture |
| RC gain at that exact cutoff | −3.0102999566398116 dB | `20 log10(1/√2)`; 1e−8 dB |
| RC phase at that exact cutoff | −44.99999999999999° | −45°; 1e−8° |
| RC step after 1 ms | 0.63212040006794 V | `1 − exp(−1)` V; 20 µV |
| Bounded generic op-amp closed-loop gain | 10.998786728280285 V/V | 11 V/V; 0.01 V/V |

The precise cutoff fixture deliberately evaluates the analytic frequency. The
worked example instead uses a 501-point logarithmic sweep, so the example
suite interpolates around the cutoff and applies its separate 0.002 dB and
0.01° tolerances. The RC step fixture uses zero initial capacitor voltage, a
1 ns source rise, a 1 µs maximum step and `reltol=1e−6`; interpolation at 1 ms
is described in the [engine evaluation](engine-evaluation.md).

### Worked examples and model behavior

Every shipped example is executed from its real schema and generated netlist.
Coverage includes RC/RL response, the divider, rectification, an LED driver,
NPN/PNP and NMOS/PMOS switching, a controlled switch, an amplifier and sensor
conditioning. Two supplementary circuits cover an independent current source
and a PWL ramp. All 70 canonical native vector comparisons and 16 behavior
checks passed.

For that suite, the native comparison allowance is the greater of 2 mV and
0.5% of native peak for voltages, or 1 µA and 0.5% of native peak for currents.
Transient native samples are interpolated onto the WASM sample times. The
individual tolerances and exact generated decks are retained in the example
evidence. Analytic checks provide additional independent references.

Generic educational model behavior does not establish accuracy for any
specific manufactured diode, transistor, LED or op amp. See the
[model provenance](component-models.md) and
[compatibility matrix](compatibility.md). The engine's occasional redundant
single-node `v(all)` raw vector is retained and recorded separately; canonical
circuit measurements determine the displayed signals. No genuine node is
discarded by its name.

## Cancellation, failure and resource evidence

The recorded foundation sequence created **56 workers and terminated all 56**;
none remained alive. Each run uses a fresh worker, including runs after a
failed circuit, cancellation or timeout. Stop and the watchdog call the actual
worker termination API, and the test observes worker exit.

An intentionally long computation left the test harness's main-thread
heartbeat running. Cancellation rejection was acknowledged in approximately
0.312 ms in that environment; the subsequent divider run returned 5 V.
Timeout and invalid-model failures also recovered through a new successful
run. These are Node worker measurements, not a browser responsiveness or
latency guarantee.

Forty repeated runs met the defined memory criterion: observed mean process
RSS change was approximately +0.73 MiB, below the 64 MiB growth allowance.
Process RSS can fluctuate with the operating system and allocator. The result
supports disposal for the measured sequence, not unlimited-duration or
all-device memory guarantees. The UI independently limits an ordinary run to
30 seconds and enforces documented analysis/output budgets.

## Browser workflows already confirmed

These checks were performed through the actual managed browser surface, not
inferred from the Node shim or a successful build.

| Workflow | Observed result |
|---|---|
| Load RC low-pass example and run AC | Completed with 501 computed points; magnitude and phase displayed |
| Pin baseline, edit C1 from 100 nF to 220 nF, rerun | New computed response displayed with the earlier baseline overlay |
| Edit circuit and use undo/redo | Revision changes and stale-result state followed the edits |
| Move, rotate and mirror a connected component | C1 moved with ArrowRight, rotated with the toolbar and mirrored with the inspector; the rotated revision persisted after refresh |
| Delete a connection and run | Deleting the R1-to-C1 wire produced a Failed run with an unconnected R1 pin 2 diagnostic; the working project remained intact |
| Reconnect using the keyboard | Wire mode plus Enter on R1 pin 2 and C1 pin 1 snapped both endpoints and restored four connections |
| Run after reconnecting | The repaired revision completed another real 501-point AC run |
| Stop and recover | A requested long transient was cancelled with the worker-termination status; the subsequent AC run completed with 501 points |
| Unicode project title | The original `QA · Independent wire crossing` title ran successfully through adapter version 2 and returned 5 V / 2 V |
| Independent crossing, explicit junction and undo | Before joining: 5 V / 2 V and eight connections. Junction placement made ten connections and 3.5 V / 3.5 V with warnings preserved. Undo restored eight connections and 5 V / 2 V |
| SPICE subset import | A divider file opened in the separate netlist-oriented workspace and computed 5 V; no schematic reconstruction was implied |
| Save backup and reopen portable JSON | Export/import completed; working project and recorded evidence reopened |
| Final backup evidence round trip | Revision 7 and its 501-point run exported and reopened; the imported-results provenance warning appeared as expected |
| Reload after backup workflow | Stored project/run state returned in the browser |
| Numerical cursors | Cursor A read 114.8 Hz and B read 1.622 kHz; the displayed differences were 1.507 kHz and −488.5 mV |
| Results CSV download | Verified 502 lines: a header and all 501 data rows, with frequency plus twelve real/imaginary trace columns; raw output was not decimated |
| Open analysis report | Designed HTML preview displayed the circuit, numerical evidence and captured experiment details |
| Theme review | Dark, light and high-contrast screenshots reviewed |
| Phone/tablet viewport review | Same production app at a 390 px outer phone viewport (375 px document client width) and 768 px tablet viewport had no document horizontal overflow; component editing, plots, numerical Values and tablet drawer toggles were accessible |
| Run in the constrained phone viewport | C1 changed from 220 nF to 330 nF through its inspector; a fresh AC run completed with 501 points |
| Subdirectory loading | App, module worker and local WASM loaded at `/qa/circuitbench/`; a fresh Unicode-title OP run returned 5 V / 2 V |

The browser capacitor change above was **220 nF**. The introductory guide uses
**200 nF** to make the theoretical factor-of-two cutoff change easy to see;
the independent example proof also checks that factor-of-two experiment.
Those are separate experiments, and the baseline always belongs to its own
recorded parameter values.

The independent PDF layout check is described below. Native Chrome's Print /
Save as PDF dialog was not tested. **Standalone report HTML and SPICE `.cir` downloads have not
been verified in the managed browser:** their actions ran, but no download event
was observed. HTML was also tried with a native download anchor. JSON backup
and results CSV downloads did work. The cause is unresolved; this record does
not assume a browser policy caused it. Internal browser download inspection was
unavailable under the managed tool's navigation policy. The preview remains a
confirmed separate workflow.

Importing a saved run preserves the supplied record; it does not independently
recompute and certify that record. The app identifies such imported evidence
accordingly.

The responsive checks used constrained viewports in desktop Chrome, not a
physical phone/tablet or iOS Safari. No cross-browser or physical touch-device
certification is claimed. The browser-tested runtime build is
`804d39c2687b9a27`; documentation updates do not change that runtime identity.

### Report layout and interpretation

The final report uses a fresh completed revision-7 AC run with 501 samples per
vector, a 220 nF capacitor and the corrected approximately 72.34 Hz cutoff
interpretation. It retains the revision-0 baseline. The exact 83,424-character
HTML captured from the browser preview was rendered independently using
**WeasyPrint 66.0** into **three A4 pages**. Poppler `pdftoppm` **26.05.0**
rasterized each page at **110 dpi**, and every page was visually reviewed.

The schematic, component values, two-signal legend, baseline semantics,
magnitude/phase plot, measurements, assumptions, interpretation, configuration,
netlist, log and footer fit without clipping or an orphan page. The model/engine
provenance and exact run snapshot remain in the report. The detailed evidence
and sample artifact hashes are in
[report-layout.json](../evidence/report-layout.json).

This is actual browser-generated report content plus independent PDF-renderer
layout verification. It does not establish operation of Chrome's native print
dialog, Chrome PDF export or a physical printer. The sample report uses a fresh
run; the imported-results warning was checked separately through the final
backup round trip.

### Regression found and fixed during browser review

The crossing project exposed a real adapter defect: the upstream raw reader
located `Binary:` in a UTF-8-decoded string and used its character index as a
byte offset. The middle dot in the title shifted the binary location, causing
`Offset is outside the bounds of the DataView` after ngspice had correctly
computed a row. Changing only the title to ASCII made the same circuit pass,
which isolated the failure to parsing.

Adapter version 2 searches for the marker in raw bytes, decodes only the header
and validates the declared binary payload length before reading doubles. It
preserves the user's Unicode title and leaves the WASM binary unchanged. The
exact failing deck is now a permanent foundation fixture; six parser tests cover
the related boundary cases. The full numerical and example suites were rerun
successfully after this fix, followed by the successful browser Unicode run.

## Offline and deployment: completed logic versus unverified browser gate

The generated release contains the exact local JavaScript and `spice.wasm`
referenced by the engine. Package tests verify hashes, all precache entries,
relative imports and subdirectory resolution. The service-worker tests execute
the generated worker in a VM with simulated storage and network. They cover
installation, cached offline fetches, honest uncached failures, readiness only
after every essential asset is cached, ignored foreign/out-of-scope requests,
and updates that preserve sibling and nested installations.

This establishes deterministic asset availability and service-worker logic.
It does **not** establish registration, quota behavior, network-disconnected
reload or update activation in a real secure browser context. The managed
`http://terminal.local` review origin is not permitted to install the worker.
The managed hosting infrastructure was not replaced to bypass that boundary.

The pending browser gate is concrete:

1. Serve the complete final candidate over HTTPS or `http://localhost`.
2. Open it online and wait for **Offline ready**.
3. Disconnect the browser from the network, reload, open a project and run a
   fresh simulation that loads the local WASM.
4. Reconnect, install a changed build, close all tabs for that installation,
   reopen and confirm the visible new version and offline readiness.
5. Repeat offline reload and a fresh run at a subdirectory URL; confirm that
   another installation's cache was preserved.

A downloaded release can also be served by a local HTTP server without an
internet connection, because all runtime assets are included. That deployment
property is separate from a service worker continuing to serve the app after
its original web server becomes unavailable. `file://` is unsupported.

## Reproduce the developer checks

Use Node.js 20 or newer and Python 3. No npm dependency installation is needed.
From the source package:

```sh
node scripts/build.mjs
node --test tests/*.test.mjs
node --expose-gc scripts/prove-engine.mjs
node --expose-gc scripts/prove-examples.mjs
python3 -m http.server 8080 --directory dist
```

The numerical scripts require native ngspice. The foundation script verifies
the executable hash above and rejects a mismatch. The example script uses the
installed `ngspice`; run it in the same verified reference environment. If using
a different native build for development, establish and document a new
comparison baseline. Native ngspice is not a production dependency for the
browser application.

The six package tests require `dist/` from the current source. If source changes
after a build, the source/build-byte test should fail until the distribution is
rebuilt. Final packaging enforces the built manifest and verifies the completed
ZIPs. The accompanying release receipt,
`CircuitBench-1.0.0-rc.1-release-integrity.json`, is generated only after the
final archive checks pass and is delivered beside the ZIPs and `SHA256SUMS`.
It records the actual handoff archive identities; it is kept outside the
archives to avoid self-referential hashes. This document does not attest to an
archive before that receipt has been produced.

## Source, notices and reproducibility

The distribution must retain `engine/NOTICE.txt`, the EEcircuit MIT license,
full ngspice 45.2 COPYING and Emscripten notices. ngspice contains mixed upstream
licenses, including LGPL portions; it is not represented as exclusively BSD.
The full ngspice 45.2 source archive and the pinned upstream integration/build
sources are included under `engine/source/`. In the source checkout these
materials are under `public/engine/`.

The local WASM SHA-256 is
`ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4`.
The vendoring script verifies the published package integrity before its
deterministic extraction and adapter changes. Upstream's moving compiler
recipe does not supply a reproducible compiler environment, so a byte-identical
rebuild from C source is not claimed. The shipped published binary, extracted
runtime and release files are pinned and hash-verifiable. The source is present
for review, modification and rebuilding.

Read [third-party notices](../THIRD_PARTY_NOTICES.md) and the
[engine evaluation](engine-evaluation.md) for exact versions, source URLs,
patches, licenses and the unavailable sibling schematic-dependency finding.
No external repository, public domain or hosting destination is deployed by
these release artifacts. The source and deployable packages have distinct
launch instructions in [installation](installation.md).
