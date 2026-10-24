# Release progress

Current candidate: **1.0.0-rc.3**, adapter **4**, runtime build
**`1fe544875c664ff7`**. This record separates implemented code from
completed verification. [Release validation](VALIDATION-1.0.0-rc.3.md) controls promotion
to 1.0.0. Secure-context browser offline behavior remains unverified for rc.3;
the candidate is not promoted. The supplied live HTTPS rc.2 site was inspected
read-only and observed failing offline installation. New rc.3 preview checks
are recorded on managed HTTP, which cannot close that offline gate.

Browser workflows and the three-page PDF review from rc.1, plus the focused
rc.2 browser records, are retained as dated historical evidence. They are not
presented as rc.3 browser reruns.

| Batch | Implementation | Verification status |
|---|---|---|
| 1. Foundation | Pinned local WASM, reusable engine facade, actual termination, explicit licenses/source, native reference | Adapter-4 numerical proof passed 62 checks; all 56 workers disposed; repeated-run memory criterion passed |
| 2. Complete RC experiment | RC example, value editing, run, plotting, pin baseline, save/open | rc.1 workflow and rc.2 root/subdirectory runs remain historical evidence; new rc.3 preview completed a fresh 501-point AC run with ready protocol 4 and versioned engine URLs |
| 3. Schematic workbench | Pin-based wires, junctions, labels, movement/rotation/mirror, selection, undo/redo, clipboard, keyboard alternatives | 25 core and 11 editor logic tests passed; rc.1 browser baseline moved/rotated/mirrored C1, deleted/reconnected a wire and reran; crossing/junction/undo computed 5 V / 2 V → 3.5 V / 3.5 V → 5 V / 2 V |
| 4. Analysis tools | OP/DC/AC/transient, probes, complex results, cursors, plots/overlays | Engine analysis checks and 14 result/report/import tests passed, including retained startup diagnostics; rc.1 browser baseline confirmed AC, comparison and cursors |
| 5. Practical library | 14 types, 8 explicit educational models, 13 worked examples, import diagnostics | All 13 examples plus current-source/PWL fixtures passed; 70 native vector comparisons and 16 behavior checks; model limitations explicit |
| 6. Durability and outputs | IndexedDB current/previous state, portable files, SPICE/SVG/CSV, designed print report | 4 autosave logic tests passed; rc.1 browser backup/CSV/preview and independent three-page A4 report layout are retained baselines; native Chrome print and HTML/SPICE downloads remain unverified |
| 7. Release candidate | Local assets, themes, responsive UI, service-worker install/update, docs and release packaging | Nine package and 22 service-worker VM tests passed on the coordinated rc.3 runtime; final packaging follows documentation freeze; secure-context browser offline remains unverified |
| 7a. Historical rc.2 checks | Catchable `.js` import, buffered WASM, response diagnostics and scoped cache recovery | Dated rc.2 browser records confirm root/subdirectory AC and failure diagnostics; later live inspection confirmed current executable bytes but failed offline installation and a redirected recovery 404 |
| 7b. rc.3 hosting and bootstrap | `assets/1.0.0-rc.3/`, versioned root service worker, canonical embedded HTML, `repair/` with HTTP-cache refresh, ready protocol and bounded startup inspection | Loader 24 and recovery 12 tests passed; stop/watchdog races preserve status and exactly-once termination; browser checks recorded fresh AC, a diagnosed legacy-worker response, folder recovery, and explicit preview-byte mismatch handling |
| 8. v1.0.0 | Reserved for the exact verified release | Not yet claimed by this candidate record |

## Evidence already recorded

`evidence/engine-validation.json` contains the actual numerical values, native
reference identity, tolerances, failure/recovery checks, worker lifecycle counts
and memory observations. The proof uses production WASM through a Node Worker
adapter; it is not a browser result.

`evidence/example-validation.json` adds actual generated-deck evidence for all
13 examples and two supplementary source fixtures, including the exact decks,
model identities and per-vector comparison tolerances.

The coordinated rc.3 suites passed **127 Node/VM tests**: core 25, editor 11,
results 14, package 9, offline 22, autosave 4, raw parser 6, loader 24 and
recovery 12. Final package checks repeat after documentation freeze; the
handoff receipt identifies the exact checked archives. The numerical proof is
dated **2026-10-24T05:37:57.798Z** and the example proof
**2026-10-24T05:37:43.177Z**, both with adapter 4. They record 62 engine checks,
56 disposed workers and 15 fixtures / 70 native vector comparisons / 16 behavior
checks. Cancellation was approximately 0.473 ms; mean RSS change over the
defined 40-run sequence was approximately −0.191 MiB, within its 64 MiB allowance.
These timings and memory figures are specific to that Node environment.

Source tests and example
validation scripts are shipped so their assertions can be inspected and
repeated. Actual browser observations are listed separately in
[VALIDATION.md](VALIDATION-1.0.0-rc.3.md). A passing compilation is not treated as
functional verification. Any check blocked by the execution environment remains
explicitly unverified in the final handoff.

`evidence/browser-validation.json` preserves the **rc.1** browser record dated
**2026-10-24T04:39:40.544Z**, build `804d39c2687b9a27`.
`evidence/report-layout.json` preserves the **rc.1** visual review dated
**2026-10-24T04:37:42Z** of exact browser report HTML rendered to three A4 pages by WeasyPrint 66.0 and rasterized by
Poppler 26.05.0 at 110 dpi. This is separate from the untested native Chrome
print dialog. Final archive identities belong in the accompanying
`CircuitBench-1.0.0-rc.3-release-integrity.json` receipt, written only after
packaging and verification, outside the ZIPs.

`evidence/rc2-engine-loading-browser.json`, dated
**2026-10-24T05:19:08Z**, records the focused rc.2 browser checks on build
`57b191103609fd22`. The original generic rc.1 error was reproduced with an
incorrect JavaScript MIME response. At that earlier review no deployment URL
had been supplied. Temporary browser fixtures are excluded from the final
clean build.

`evidence/live-host-rc2-inspection.json`, dated **2026-10-24T05:33:59Z**, records
the later read-only inspection of the supplied HTTPS site. Fresh and reloaded
Chrome completed 501-point calculations; non-HTML runtime bytes matched the
delivered rc.2 build. Executable files advertised a seven-day cache lifetime,
root HTML contained host-injected Cloudflare analytics, and `index.html` and
`repair.html` redirected to directory URLs ending in 404. The browser reported
offline installation failure. A stale worker is a plausible explanation for
the user's no-message bootstrap report, but that exact per-browser cause was
not reproduced or confirmed. No hosted files or settings were changed.

New rc.3 browser observations are recorded in
`evidence/rc3-hosting-browser.json`. The confirmed fresh 501-point preview run
does not establish secure offline installation or completion of the remaining
recovery and injected-failure checks. The actual recovery page correctly
reported a partial refresh, with 17 of 18 runtime assets refreshed: the managed
preview server injected WebSocket script into the decorative SVG icon, which
failed the strict size check. The inspected live rc.2 icon matched its expected
443 bytes. A complete production browser recovery pass has not been claimed.

## Browser verification limit

The new managed browser review URL is plain HTTP on a non-localhost host.
Its browser security context does not permit service-worker installation.
Consequently, successful browser offline reload and update activation cannot be
claimed from that review surface. `tests/package.test.mjs` verifies complete
local runtime assets, correct WASM filenames, module paths, scope-relative
precache entries, exact version and package hashes, but those deterministic
checks do not replace real secure-context browser offline verification. Keep
the release-candidate label while this required gate remains unverified.

The rc.2 live HTTPS inspection established an installation failure, not an
offline pass. rc.3 uses release-specific executable URLs and service-worker
filename, exact asset matching, and canonical embedded HTML to address the
observed caching/HTML mechanisms. Its recovery directory avoids relying on a
rewritten standalone `.html` URL and refreshes runtime HTTP-cache keys as well
as scoped application caches. Logic passes establish these code paths within
their test environments; they do not establish disconnected reload, real
browser secure cache removal/update activation, native print/PDF, or completion
of the still-unverified HTML-report and SPICE download events. Additional checks
must identify their own version, build and scope. This rc.3 package has not been
uploaded to the external site.

## Architecture review

Reusing EEcircuit-engine was successful. Reusing the whole EEcircuit frontend
would require an unavailable sibling schematic dependency; CircuitBench instead
uses a small SVG editor with one authoritative electrical model. No native
production runner is required by the completed foundation evidence. There is no
new numerical solver and no demonstration waveform fallback.

The interface keeps the circuit, experiment settings and measurements together.
Future capability beyond the analog v1 scope is deferred to `ROADMAP.md`.
