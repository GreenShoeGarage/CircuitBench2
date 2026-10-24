# Release validation and handoff

**Candidate: 1.0.0-rc.3 · Adapter: 4 · Record date: October 24, 2026**

The rc.3 runtime build is **`1fe544875c664ff7`**. This update gives executable assets release-specific paths,
embeds the canonical offline HTML in a versioned service worker, improves
installation-scoped recovery, and adds an explicit worker-ready protocol plus
bounded inspection of an otherwise opaque startup failure. The pinned
numerical WASM binary remains unchanged.

The rc.1 and rc.2 browser records below are dated historical evidence. They
have not been relabeled as rc.3 observations. Current adapter-4 numerical and
loader checks have passed, together with the coordinated package,
service-worker and recovery suites. New managed-browser checks are recorded separately below. Archive integrity
is recorded in the release receipt after the final documentation/evidence build. This is a
**release candidate**, not a completed v1.0.0 release.

Secure-context browser offline behavior remains **unverified for rc.3**. A
read-only inspection of the supplied HTTPS deployment established that rc.2
could compute in a fresh browser but failed offline installation. Its HTML
mutation and redirect failures are documented below. The new rc.3 code has not
been deployed to that server; its managed HTTP preview has been reviewed, and
that insecure non-localhost origin cannot establish service-worker offline
reload or update behavior.

## Evidence layers

The layers below establish different things. Counts are kept separate because
an assertion about electrical connectivity, a native vector comparison and a
browser interaction are not interchangeable tests.

| Layer | Result | What it establishes |
|---|---|---|
| Core model/netlist tests | 25 passed | Authoritative topology, units, schema round trips, model binding, import rejection and analysis bounds |
| Editor logic tests | 11 passed | Explicit junctions, connection-preserving edits, isolated drag previews, clipboard, keyboard actions, transformed-part wire routing and historical SVG rendering |
| Result/report/import tests | 14 passed | Complex measurements, current direction, axes, descending sweeps, CSV, baseline compatibility, immutable saved evidence, escaped reports and preserved startup diagnostics |
| Package tests | 9 passed against the coordinated runtime build | Versioned runtime, manifest/source mappings, complete local assets, recovery files and release stamping; final package checks repeat after documentation freeze |
| Service-worker VM tests | 22 passed | Canonical-shell installation, strict executable integrity, exact asset matching, HTTP-cache behavior and installation-scope isolation |
| Autosave logic tests | 4 passed | Serialized writes, latest-revision status, rapid-edit coalescing and failure/recovery behavior |
| Raw-parser regression tests | 6 passed | UTF-8 titles, real/complex binary offsets, CRLF headers, typed-array offsets and explicit malformed-payload rejection |
| Engine-loading tests | 24 passed | Existing response/loading checks plus worker-ready acceptance, bounded exact-URL inspection, healthy-response uncertainty, cancellation/watchdog races and exactly-once termination |
| Standalone recovery tests | 12 passed | `repair/` route, exact installation scope, HTTP-cache refresh, preservation of project storage, bounded failures and explicit Return action |
| Actual WASM foundation | 62 checks passed | Real ngspice analyses, Unicode-title dividers, analytic references, native comparisons, failure/cancel/timeout recovery and disposable workers |
| Authored example circuits | 15 fixtures passed | All 13 project examples plus independent-current-source and PWL fixtures; 70 native vector comparisons and 16 analytic/behavior checks |
| rc.3 managed browser session | Scoped checks recorded below | Fresh 501-point AC, ready protocol 4, legacy-worker response inspection, folder recovery, honest modified-icon rejection and controlled critical-file refresh |
| Historical rc.2 live HTTPS inspection | Recorded below | Current non-HTML runtime bytes matched the delivered rc.2 build; fresh/reloaded Chrome computed, while offline installation and the recovery URL failed |
| Historical rc.2 managed browser session | Confirmed dated observations below | Healthy root-path AC computation and specific JavaScript/WASM response diagnostics; does not close current offline or output gates |
| Historical rc.1 managed browser session | Preserved baseline | Actual UI, browser module/worker loading, computation, plotting, backup import/reload and report preview on the recorded rc.1 build |
| Historical rc.1 independent report PDF layout | Passed, three A4 pages | Exact rc.1 browser-generated HTML rendered with WeasyPrint 66.0, rasterized with Poppler 26.05.0 at 110 dpi and visually reviewed on every page |

The coordinated rc.3 suites total **127 passed Node/VM tests**: core 25,
editor 11, results 14, package 9, service worker 22, autosave 4, raw parser 6,
loader 24 and recovery 12. These counts refer to their specific logic scopes;
they do not substitute for a browser offline pass. Final package integrity is
checked again after documentation is frozen and the handoff archives exist.

Source tests are shipped in the source package's `tests/` directory. The current
loader transcript is [engine-loading-tests.txt](../../evidence/engine-loading-tests.txt).
The final focused summary identifies the rc.3 version/build alongside these
suite counts. The numerical records include
their own timestamps, measured values, tolerances and pass/fail results:
[`engine-validation.json`](../../evidence/engine-validation.json) and
[`example-validation.json`](../../evidence/example-validation.json).

## Actual numerical results

The production engine is EEcircuit-engine **1.8.0**, containing ngspice **45.2**
WebAssembly, through CircuitBench **adapter 4**. The current foundation record
is dated **2026-10-24T05:37:57.798Z**; the example record is dated
**2026-10-24T05:37:43.177Z**. The test harness runs the production engine facade and worker
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
is described in the [engine evaluation](../engine-evaluation.md).

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
[model provenance](../component-models.md) and
[compatibility matrix](../compatibility.md). The engine's occasional redundant
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
0.473 ms in that environment; 45 main-thread heartbeat ticks were observed,
and the subsequent divider run returned 5 V.
Timeout and invalid-model failures also recovered through a new successful
run. These are Node worker measurements, not a browser responsiveness or
latency guarantee.

Forty repeated runs met the defined memory criterion: observed mean process
RSS change was approximately −0.191 MiB, below the 64 MiB growth allowance.
Process RSS can fluctuate with the operating system and allocator. The result
supports disposal for the measured sequence, not unlimited-duration or
all-device memory guarantees. The UI independently limits an ordinary run to
30 seconds and enforces documented analysis/output budgets.

## rc.3 hosting and bootstrap changes

Executable files now live under `assets/1.0.0-rc.3/`: application modules in
`src/`, the engine module and binary in `engine/`, and the stylesheet at that
release's asset root. The complete module graph therefore receives new URLs,
including the facade that creates the worker. Relative imports and the
worker's `../engine/` resolution remain intact. The root service worker is
`sw-1.0.0-rc.3.js`, registered from the document directory with HTTP-cache bypass
for its update check. No Blob, classic-worker or main-thread simulation
fallback was introduced.

Adapter 4 emits `circuitbench-worker-protocol-4` as a ready signal before glue
loading and records that acceptance. The existing caught `.js` import and
single validated WASM byte fetch remain in place. The numerical binary is
unchanged, and a real Node worker restricted to one generic-MIME WASM fetch
still computes the 5 V divider and terminates.

If the browser reports an opaque worker-startup error before any message, the
facade first terminates that worker. It then inspects the exact worker URL with
`cache: 'reload'` and same-origin credentials/mode, bounded to 1.8 seconds and a
64 KiB response prefix. Diagnostics record the observed HTTP status, MIME type,
HTML detection and presence of the current protocol marker. A healthy inspected
response leaves the original failure explicitly unknown and suggests retrying
or refreshing. Stop and the original run watchdog abort a pending inspection
and retain their own status; termination occurs exactly once. These paths are
covered by the 24 loader tests, including cancellation and timeout races.

The generated service worker embeds the build's canonical HTML and synthesizes
both the root and `index.html` cache entries from those bytes. Offline
installation therefore does not fetch a host-modified page or depend on the
host's `index.html` rewrite. The shell and executable files retain strict
size/SHA-256 validation; JavaScript and CSS also require their browser-usable
MIME types. Asset requests match exact release paths, rather than treating
different asset query strings as interchangeable. Explicit reload/no-store
asset requests go to the network; an ordinary offline navigation reload can
still recover the canonical cached shell. The 22 service-worker VM and nine
package tests passed for the coordinated rc.3 build; archive assembly is a
separate final gate.

The revised standalone recovery entry is `repair/`, with a generated
`repair/index.html` so a host's `.html`-to-directory redirect can reach a real
page. Its refresh covers this installation's exact service-worker
scope/application caches and the actual runtime HTTP-cache URLs. It preserves
IndexedDB projects and local preferences and reports partial/unavailable checks
before an explicit Return action. Twelve recovery tests passed. In the managed
HTTP browser preview, recovery refreshed 17 of 18 runtime assets and correctly
reported a partial result because the preview server injected WebSocket script
into the decorative `icon.svg`, making it larger than the expected asset. The
live rc.2 host's icon had matched the expected 443 bytes. This preview result
does not establish a complete production browser recovery pass. A controlled
fixture omitted only the optional decorative icon and completed all 17 listed
file checks, root refresh and explicit Return. The production manifest and its
strict integrity checks were unchanged.

## Scoped rc.3 managed-browser observations

The [rc.3 browser record](../../evidence/rc3-hosting-browser.json) identifies the
reviewed runtime and exact fixtures. Root execution completed a fresh 501-point
AC run and displayed the worker-ready protocol plus versioned worker/glue/WASM
URLs. An isolated fixture replacing only the worker with the exact rc.1 worker
reproduced an opaque bootstrap failure; response inspection then reported HTTP
200, JavaScript MIME and the missing current protocol marker. Returning to the
unmodified rc.3 root completed another 501-point run.

The `repair/` route correctly selected its parent application scope. The real
preview layout reported 17/18 because live-server injected JavaScript into the
SVG icon. A controlled fixture excluding only that optional icon completed
17/17 byte/type checks and a separate Return to the preserved project. HTTP
limitations were explicitly displayed; no SHA-256 or service-worker cleanup
success was claimed in the browser. Temporary fixtures are removed before
packaging. These observations do not establish complete recovery or disconnected
operation on the user's production server.

## Live inspection of the supplied rc.2 deployment

At **2026-10-24T05:33:59Z**, the supplied
[HTTPS deployment](https://greenshoegarage.com/projects/circuitbench2/) was
inspected read-only. It served **rc.2 build `57b191103609fd22`**. The complete
HTTP response comparisons and browser observations are in
[live-host-rc2-inspection.json](../../evidence/live-host-rc2-inspection.json).

| Observation | Recorded result |
|---|---|
| Worker, facade and other non-HTML runtime files | Returned HTTP 200 and matched the delivered rc.2 bytes; JavaScript used `application/javascript` |
| Numerical binary | Matched the pinned 6,133,055-byte WASM and used `application/octet-stream` |
| Fresh Chrome and reloaded page | Both completed a new 501-point RC AC calculation |
| Worker caching | `Cache-Control: public, max-age=604800`; Cloudflare cache HIT observed |
| Inspected response policies | No CSP response header was present in the inspected responses |
| Root HTML | Host-injected Cloudflare analytics changed the response, so rc.2's exact shell hash/length validation could not pass |
| Explicit `index.html` | Redirected to `index/`, which returned 404; this independently prevented the old precache install |
| Explicit `repair.html` | Redirected to `repair/`, which returned the site's page-not-found screen |
| Offline installation | Browser footer reported installation failure, including after reload |

The long cache lifetime makes a stale worker consistent with the user's
no-message startup report. That exact failure was not reproduced in the clean
review browser, so the user's per-browser root cause remains **unconfirmed**.
The verified HTML mutation, route redirects and offline-installation failure
are separate findings. No server files, hosting settings or external repository
were changed during this inspection, and rc.3 has not been uploaded there.

## Historical rc.2 managed-browser verification

The earlier generic rc.1 error was reproduced in a temporary fixture by serving
the engine glue with a non-JavaScript MIME type. Its static import failed before
useful loading diagnostics could run. This established one cause of that
message; it did not diagnose the later user's browser. At this earlier review,
the deployment URL had not yet been supplied. The later live inspection above
has its own dated record.

Focused managed-browser observations on rc.2 build `57b191103609fd22`, recorded
at **2026-10-24T05:19:08Z** in
[`rc2-engine-loading-browser.json`](../../evidence/rc2-engine-loading-browser.json):

| Workflow | Observed result |
|---|---|
| Root-path healthy RC AC run | Recovered the revision-7, 220 nF project and completed a fresh 501-point run with its 100 nF baseline overlay using adapter 3 |
| Engine JavaScript served as `text/plain` with HTTP 200 | Failure identified the exact JavaScript URL, HTTP 200 and `text/plain`; it did not invent a WASM cause |
| `spice.wasm` URL served an HTTP-200 HTML document | Failure identified HTML in place of the binary |
| Subdirectory with generic binary MIME | At `/qa/rc2-generic-wasm/`, the unchanged pinned binary was served as `.bin` with the fixture's worker URL adjusted; a fresh 501-point AC run completed and logs recorded 6,133,055 bytes, HTTP 200 and `application/octet-stream` |
| Recovery page on non-secure HTTP | Layout and exact-scope/filename guidance reviewed; refresh was disabled with an explicit unavailable/no-change result; Return recovered the revision-7 project and its completed 501-point result |

Only these completed rc.2 observations are asserted here. The failure-injection
and renamed-binary fixtures were temporary deployment copies; the final clean
build excludes them. Secure-context cache removal, offline reload and update
activation, native Chrome print/PDF, and the unresolved standalone HTML/SPICE
download checks remain open.

## Historical rc.1 browser workflows

These checks were performed through the actual managed browser surface on
**1.0.0-rc.1**, runtime build **`804d39c2687b9a27`**, and recorded at
**2026-10-24T04:39:40.544Z** in
[`browser-validation.json`](../../evidence/browser-validation.json). They are
preserved baseline evidence, not a complete rerun of the workflows on rc.3.

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

### Historical rc.1 report layout and interpretation

The rc.1 report, reviewed at **2026-10-24T04:37:42Z**, uses a fresh completed revision-7 AC run with 501 samples per
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
[report-layout.json](../../evidence/report-layout.json).

This is actual browser-generated report content plus independent PDF-renderer
layout verification. It does not establish operation of Chrome's native print
dialog, Chrome PDF export or a physical printer. The sample report uses a fresh
run; the imported-results warning was checked separately through the final
backup round trip.

### Parser regression found during rc.1 browser review

The crossing project exposed a real adapter defect: the upstream raw reader
located `Binary:` in a UTF-8-decoded string and used its character index as a
byte offset. The middle dot in the title shifted the binary location, causing
`Offset is outside the bounds of the DataView` after ngspice had correctly
computed a row. Changing only the title to ASCII made the same circuit pass,
which isolated the failure to parsing.

Adapter version 2 introduced the fix retained in adapter 4: search for the
marker in raw bytes, decode only the header, and check the declared binary
payload length before reading doubles. It
preserves the user's Unicode title and leaves the WASM binary unchanged. The
exact failing deck is now a permanent foundation fixture; six parser tests cover
the related boundary cases. The full numerical and example suites were rerun
successfully after this fix, followed by the successful browser Unicode run.

## rc.3 offline and deployment gates

The new build places the local engine module and `spice.wasm` under its
release-specific asset directory. Nine package and 22 service-worker VM checks
passed for the coordinated runtime build and canonical-shell behavior.
Deterministic assets and
simulated cache behavior do **not** establish real browser registration,
storage quotas, disconnected reload or update activation.

The live HTTPS rc.2 site was observed failing offline installation. The rc.3
changes address the observed host mutation and redirect mechanisms in code,
but no secure-context browser pass for that new code has been recorded. The
new managed preview review is in progress and runs at insecure non-localhost HTTP,
which cannot install the service worker. Its browser observations will be
recorded separately as `evidence/rc3-hosting-browser.json`; only its completed
observations should be treated as evidence, and its HTTP checks cannot close
the secure-context gate. The managed
hosting infrastructure was not replaced to bypass this boundary.

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

The package tests require `dist/` from the current source. If source changes
after a build, the source/build-byte test should fail until the distribution is
rebuilt. Final packaging enforces the built manifest and verifies the completed
ZIPs. The accompanying release receipt,
`CircuitBench-1.0.0-rc.3-release-integrity.json`, is generated only after the
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

Read [third-party notices](../../THIRD_PARTY_NOTICES.md) and the
[engine evaluation](../engine-evaluation.md) for exact versions, source URLs,
patches, licenses and the unavailable sibling schematic-dependency finding.
The user's existing hosted rc.2 site was inspected read-only; these changes
have not been externally deployed. The source and deployable packages have distinct
launch instructions in [installation](../installation.md).
