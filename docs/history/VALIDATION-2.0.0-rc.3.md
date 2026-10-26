# Release validation and handoff

**Candidate: 2.0.0-rc.3 · Runtime build: `8a99d6d843d32aa6` · October 24, 2026**

This release completes the immediate roadmap batch: practical installation
checks, clearer simulation and display state, consistent release instructions,
and a repeatable pinned native reference environment. The catalog remains
**43 parts, 37 model definitions and 41 examples**: 16 analog, 16 digital and
9 mixed. The digital source, red-HIGH indicators, seven-segment displays,
closed-loop feedback, multibit converters, analog studies and continuous
simulation delivered in earlier candidates remain available.

The complete deploy and source packages are prepared for self-hosting. The
public Green Shoe Garage installation has not been changed. Exact HTTPS,
offline, update and remaining output acceptance still determine stable-release
readiness; this release remains a candidate.

## What changed and what was verified

| Addition | Verified behavior |
|---|---|
| Check installation | Help and engine-startup failures offer a read-only diagnostic for the loaded build, release/recovery manifests, runtime files and three independent workers. |
| Bounded response checks | Validate same-origin scoped paths, MIME type, response size, WASM header and SHA-256 when available; retain explicit unavailable or failed results instead of inventing a browser failure cause. |
| Actual worker checks | Digital source/inverter, coordinated Schmitt RC feedback across two retained updates, and an ngspice 10 V equal-resistor divider execute in disposable workers. |
| Diagnostic lifecycle | One owned task, cancellation, timeout and worker cleanup; closing or replacing the dialog prevents late progress from attaching to another dialog. Downloaded JSON excludes project contents. |
| Operation and time strip | Distinguishes editing, starting, running, pausing, paused, completed and restored evidence; labels Latest or Cursor A and provides Return to latest. |
| Source context | Separates configured initial state, acknowledged live drive and recorded drive at the selected historical time. A paused input change does not pretend that a new circuit response has been computed. |
| Paused Step completion | Refreshes the status after the owned step settles, disables overlapping steps and ignores late errors from a replaced session. |
| Release consistency | Generates operational guide and recovery-page versions from the release version; stamps a loaded build identity into the shell and checks it against the manifest. |
| Native reference setup | Verifies pinned official Ubuntu package bytes, extracts into a private directory and records the exact executable, initialization and resolved runtime libraries. |

Installation diagnostics do not edit the circuit, project storage, preferences,
service workers or caches. **Open cache repair** remains a separate operation.
The normal repair page preserves saved projects and preferences while refreshing
this installation's executable caches. See [installation](../installation.md),
[the user guide](../user-guide.md), and [the reference recipe](../reference-environment.md).

## Application regression

**676 cases pass across 46 application test files**, with zero failed,
cancelled, skipped or TODO cases in the final per-file results. The consolidated
record is [rc203-test-summary.json](../../evidence/rc203-test-summary.json), with
per-file transcripts in `evidence/rc203-tests/` and explicit follow-ups in
[rc203-test-followups.json](../../evidence/rc203-test-followups.json).

These totals combine the latest successful execution of each file. They do not
claim one complete rerun after the final fix. The initial 45-file sweep ran
667 cases; its only failures were 15 timing-app cases whose controlled VM
harness lacked two new application dependencies. The harness was corrected and
rerun. The new reference-environment suite adds seven cases. Browser testing
then exposed the stale Step status; two regressions demonstrated that defect
and a late old-session error before the application fix. Eight affected
application-handler suites, totaling 103 cases, passed after the fix. Original
failure transcripts and their explanations remain in the evidence.

Focused additions cover the installation checker and dialog lifecycle, operation
and display-time derivation, actual application event handlers, generated
release documents, and the native-reference recipe. Existing analog, digital,
mixed, display, timing, study, persistence, recovery and worker suites retain
their passing results. Source and test hashes identify what each record covers.

**Ten final built-package cases also pass: 686 Node cases across 47 files in
all.** The exact final package-gate result, independent ZIP audit and isolated
source-ZIP rebuild are recorded in the accompanying
`CircuitBench-2.0.0-rc.3-release-integrity.json`. Application, numerical and
browser results are separate evidence categories.

## Fresh numerical comparison

[rc203-coordinated-validation.json](../../evidence/rc203-coordinated-validation.json)
records **24 passing checks** against the actual pinned native ngspice42 and
bundled ngspice45.2 WASM engines, analytic expectations and retained-state
behavior. No numerical kernel or bundled WASM bytes changed in this release.

| Comparison | Observed maximum difference / result | Declared acceptance |
|---|---|---|
| RC trace, 100 ns maximum step | 18.394 µV against both native and WASM references | ≤25 µV |
| RL trace, 100 ns maximum step | 183.935 nA against both references | ≤250 nA |
| RLC trace, 50 ns maximum step | 1.519 mV against both references | ≤2 mV |
| Schmitt feedback mean period | 1.69544838 ms coordinated; 1.69537218 ms native/WASM reference | 0.3% allowance for the declared reference-topology differences and numerical error |

The native executable retains the previously pinned SHA-256
`820658317b0b54035208da41936fd6871ce924036e5ea4113a4168b821b7fc45`.
The proof now accepts an explicit `--native-executable` and runs that verified
path with `-n`, excluding a user's personal ngspice initialization. The successful
proof uses the exact private environment identified in
[rc203-native-reference-environment.json](../../evidence/rc203-native-reference-environment.json).
Its five setup checks pass and it fingerprints 32 resolved runtime libraries.
Both fixed-URL network setup and offline package reuse were exercised in fresh
private directories. No system installation was performed.

This is an auditable pinned distribution-binary reference environment. It is
not a hermetic toolchain or a fresh native C/C++ source rebuild. The application
still deploys the pinned ngspice45.2 WASM; native ngspice42 is a development
reference, not an application prerequisite. The preceding candidate's native
executable was unavailable, and its 19-check WASM-only evidence remains labeled
as rc.2 in [the historical record](VALIDATION-2.0.0-rc.2.md).

Backward Euler has step-dependent error and damping. The 1 ps event grid is a
scheduling resolution, not a physical-accuracy claim. Coordinated analog support
remains R/C/L and independent voltage/current sources. The existing nonlinear
analog library remains available through ngspice's supported analyses and
feed-forward mixed mode; this batch does not expand coordinated device support.

## Actual browser observations

The browser record is
[rc203-browser-validation.json](../../evidence/rc203-browser-validation.json).
Tests used managed Chrome at `http://terminal.local:4173/`. Initial workflow
observations identify build `a193c1048772c4f0`; the final Step retest,
installation check, bounded experiment and downloads identify final runtime
`8a99d6d843d32aa6`.

| Workflow | Observed result |
|---|---|
| Restored continuous window | Clearly labeled Showing saved result at 17.5 ms; the window is inspectable and cannot resume a stopped worker. |
| Paused live source | At 4.9 ms, Initial HIGH remained visible while Live drive changed to LOW. Lamps stayed at the last computed HIGH/LOW response until Step. |
| Step response | Advanced to 5 ms; the direct indicator became LOW and the inverter indicator HIGH. |
| Historical time | Cursor A at 3.918582375 ms showed the earlier HIGH/LOW pair while the acknowledged live drive remained LOW. |
| Return to latest | Restored LOW/HIGH at 5 ms without changing the paused simulated time or 22-point retained count. |
| Resume and Stop | Running resumed; Stop preserved the completed window at 10.1 ms and changed Live drive to Recorded drive. |
| Edited circuit | An older result was labeled as another revision, and current schematic indicators became neutral NO RESULT. |
| Final Step fix | Pause at 1.1 ms, Step to 1.2 ms, then immediate idle Paused explanation and enabled Step button. |
| Final bounded run | Revision 4, 2 ms, source HIGH: direct indicator red/HIGH, inverter indicator dark/LOW; Results ready. |
| Actual backup reopen | Reopened the downloaded JSON through the ordinary file chooser. Showing saved result, Latest 2 ms and the HIGH/LOW pair were preserved. |

Three actual downloads are included:
[diagnostic JSON](../../evidence/rc203-installation-browser.json),
[project backup](../../evidence/rc203-browser-project.json), and
[result CSV](../../evidence/rc203-browser-results.csv). The project contains both
older imported evidence and newly observed runs; a captured project's
`appVersion` is not an execution-build identifier. The independent checks of
these bytes are recorded in
[rc203-download-validation.json](../../evidence/rc203-download-validation.json):
**80 checks pass**, covering seven retained runs, three import/JSON round trips,
65 recorded samples, 130 independently reconstructed logic sample values,
18 sparse events and the two-row CSV. These checks inspect captured evidence;
they do not claim a new circuit simulation.

The final installation report records **5 passed, 1 failed and 44 unavailable**
checks. All three actual worker computations passed, as did loaded build identity
and release/recovery manifest consistency. The overall report correctly remains
failed in this preview environment:

- The preview server injects a live-reload script into `icon.svg`. The response
  declares 1,655 bytes while the packaged icon is 443 bytes, and the checker
  rejects it. The injected script was observed directly in the served SVG.
  Production code and integrity requirements were not relaxed for the preview.
- SHA-256 and service workers are unavailable on this insecure HTTP origin.
  The global hash check and 43 metadata-valid assets therefore remain unavailable
  for exact-byte browser verification. These are not reported as passes.

No application-origin console errors were observed in the captured checks.
Browser-extension metadata errors were identified separately. The final
workbench screenshot was captured and recovered successfully. An earlier
attempt to recover a diagnostic download failed; the final download succeeded
and its actual bytes are retained.

The SVG command displayed a success message, but no download event arrived
within 15 seconds. The HTML report iframe rendered its expected sections, but
both documented download routes timed out. Actual SVG and HTML report file
delivery is not claimed. Native print/PDF was not verified.

## Package integrity and reproducibility

The builder records copied source origins, generated-document inputs, the
release's runtime inventory, and exact SHA-256 hashes for served files. The
loaded shell carries the build identity used by installation diagnostics.
To avoid a circular self-hash, the build identity is calculated with the shell's
build-meta value normalized to `development`; the manifest separately
hashes the final stamped shell bytes. The packager independently reproduces
that transformation and every generated operational document.

The release includes one complete versioned engine folder and one WASM binary,
under `assets/2.0.0-rc.3/`. The source ZIP omits a redundant `dist/` tree and
recreates it with `node scripts/build.mjs`. The external integrity receipt records
final archive SHA-256 and CRC verification, complete file inventories, the final
package gate and an isolated rebuild from the delivered source archive.

## Remaining stable-release acceptance

A read-only request for the public host's release manifest returned **HTTP 403
Forbidden**, without an explanation. The currently installed public version
could not be verified; this result does not establish that the site is down or
why that request was rejected. No public host files were changed.

The following remain open: exact HTTPS worker/WASM responses, fresh offline
installation and reload, project-preserving update and recovery, an incomplete
upload exercised in staging, actual SVG/HTML report delivery, supported native
print/PDF, and the declared browser/platform/viewport and prolonged
background/foreground continuous-lifecycle matrix. The completed packages can
be used and reviewed while these stable-release gates remain explicit.

Historical results retain their identities:
[rc.2](VALIDATION-2.0.0-rc.2.md),
[rc.1](VALIDATION-2.0.0-rc.1.md), and
[1.3.0-rc.1](VALIDATION-1.3.0-rc.1.md).
The accepted next sequence is maintained in [ROADMAP.md](../../ROADMAP.md).
