# Release progress

Current candidate: **2.0.0-rc.3**, runtime build **`8a99d6d843d32aa6`**.

The immediate roadmap batch is implemented: installation checks, clear
simulation/display state, consistent operational release instructions and a
repeatable pinned native-reference environment. Complete deploy and source
packages preserve all previously delivered 2.0 capabilities.

| Addition | Delivered behavior |
|---|---|
| Check installation | Checks loaded build, manifest/asset responses and actual digital, coordinated-feedback and ngspice workers; cancellable and downloadable, without using or changing project data. |
| Persistent workbench state | Explains editing, running, pausing, paused and completed/restored evidence, with Latest or Cursor A time and Return to latest. |
| Source context | Distinguishes initial, acknowledged live and recorded source settings; a paused input change explicitly requires Step or Resume to compute the response. |
| Step completion fix | Clears the pending-step description after completion and prevents old-session completion/errors from changing a replacement session. |
| Release documentation | Builds current installation/user guides and both recovery entries from versioned templates, with a checked loaded-shell build identity. |
| Native reference recipe | Verifies exact official package bytes and a private native ngspice42 executable/environment; the proof uses that explicit verified path. |

The catalog remains **43 parts, 37 models and 41 examples**: 16 analog,
16 digital and 9 mixed. Digital voltage sources, red logic indicators,
seven-segment displays, coordinated feedback, multibit conversion, analog
studies and continuous batches remain available. No numerical kernel or
bundled WASM bytes changed in this batch.

## Verification

- **676 application cases across 46 files pass.** The final record combines
  the latest successful per-file runs, including targeted reruns after the
  browser-observed Step fix. Initial harness failures and pre-fix regressions
  remain preserved and explained.
- **10 built-package cases pass:** **686 Node cases across 47 files** in all.
- **24 fresh numerical checks pass** against the pinned native ngspice42 and
  bundled ngspice45.2 WASM references, analytic results and retained-state
  expectations. The native environment has five passing setup checks and
  fingerprints 32 resolved runtime libraries.
- Browser checks verify pause/live-input/step behavior, historical cursor
  readback, view-only Return to latest, Stop, stale-result neutrality and
  restored-result labels. The final installation diagnostic runs all three
  worker computations successfully.
- Actual diagnostic JSON, project JSON and CSV downloads are captured.
  **80 independent evidence checks pass** across the files, retained runs,
  logic samples and CSV. The actual project reopens through the normal file chooser.
- The final package receipt records exact source/deploy hashes, archive
  integrity, copied/generated input verification and an isolated source-ZIP
  rebuild.

The managed HTTP preview changes the icon response by injecting live-reload
code and does not provide secure SHA-256/service-worker APIs. The diagnostic
correctly reports **5 passed, 1 failed and 44 unavailable** there, rather than
claiming a successful complete installation check. SVG and HTML-report
file delivery timed out in this browser; the HTML report preview rendered.

The public host is unchanged. Its manifest request returned an unexplained
HTTP 403, so the installed public version is unverified. Exact HTTPS,
offline/update/recovery, native print/PDF and the remaining declared browser
and continuous-lifecycle acceptance remain open. The release stays a candidate.

See [VALIDATION.md](../VALIDATION.md) for exact evidence and limitations,
[installation](../installation.md) for deployment, and
[ROADMAP.md](../../ROADMAP.md) for the accepted next priorities: everyday controls,
instruments and numerical confidence, followed by a nonlinear-engine
architecture proof. The later milestones are not part of this rc.3 batch.

The preceding [rc.2 progress](PROGRESS-2.0.0-rc.2.md) is preserved.
