# Release validation and handoff

**Candidate: 1.2.0-rc.1 · Runtime build: `7ad78c372946c614` · October 24, 2026**

This candidate delivers bus words, digital building blocks and truth-table
workflows on the existing analog/digital workbench. It preserves the pinned
analog WASM, versioned runtime assets and recovery design. It has not been
deployed to the supplied public host. Stable promotion remains conditional on
target-host, offline, portable-output and browser/viewport acceptance.

## Delivered scope

- **37 parts:** 14 analog parts, 12 original digital primitives, two explicit
  one-bit bridges and nine new bus/pattern/state/table parts.
- **26 authored examples:** 13 analog, nine digital and four mixed-signal.
- Four-state words from 1 to 8 bits, explicit port widths and MSB-first display.
  Bit 0 is least significant. Slice/Join are passive electrical aliases.
- Constant and timed/repeating words, registers, modulo counters, MUX, one-hot
  decoder and complete LUTs. State elements own private state and use
  synchronous active-high reset/enable, with reset priority.
- Row editing for LUTs with 1–4 input bits and 1–8 output bits. Incomplete
  imported tables have an explicit draft repair path; Cancel preserves data.
- Independent combinational truth tables through the real event kernel, with
  at most eight selected constant input bits, 256 rows and 32 output columns.
- Bus timing lanes/cursors, matching-width baselines, exact literal-word CSV,
  reports, typed project results and up to four immutable saved truth tables.
- Existing explicit ADC/DAC feed-forward mixed replay, with actual ngspice
  computation for analog stages. A Slice selects a bus bit for a one-bit bridge.

The compiler bounds expanded work to 255 scalar bit nets, 600 scalar elements,
220 kB formatted plans and 240 kB generated inputs. It returns actionable errors
and bounded failed-input records. Worker limits remain separately enforced.
Timing resolution is not a physical accuracy claim. Digital models omit drive
strengths, setup/hold behavior, physical metastability and supply current. Mixed
feedback and unknown/high-impedance DAC input remain unsupported. See
[digital-engine.md](../digital-engine.md) for the exact contract.

## Focused regression evidence

| Layer | Passing tests | Scope |
|---|---:|---|
| Core, digital model and bus model/compiler | 72 | Topology, domains, widths, parsers, aliases, state compilation and resource guards |
| Digital kernel, expansion and truth-table kernel | 43 | Four-state resolution, event timing, word state, patterns, logic and enumeration |
| Simulation coordination | 10 | Actual worker isolation, exclusivity, cancellation, timeout, recovery and mixed staging |
| Existing/digital/bus editor | 27 | Wiring, symbols, transforms, junction/label checks and accessible width information |
| Results, digital plots and bus reports | 26 | Exact transitions/words, cursor/CSV, baselines, report values and bounded summaries |
| Storage, table evidence/UI/app and autosave | 44 | Immutable snapshots, corruption rejection, literal values, repair, cancellation and data retention |
| Engine loading and raw parser | 30 | Missing/invalid assets, protocol failures, Unicode raw parsing and recovery |
| Offline logic and repair logic | 34 | Exact cache validation, scoped cleanup and recovery behavior in controlled test environments |
| Built package | 9 | Source/runtime identity, imports, complete local assets, precache and recovery manifests |
| **Total** | **295** | **22 directly executed test files** |

The individual direct-Node transcripts and exact counts are recorded in
[focused-test-summary.json](../../evidence/history/1.2.0-rc.1/focused-test-summary.json). The first 20
non-package suites ran on integration build `c8ef3ed4d77a1672`; the final 17-test
app suite covers the subsequent, scoped app-only cancellation/repair/retention
fixes on `7ad78c372946c614`. Their timestamps remain separate in the summary.
No numerical kernel, compiler or plot code changed after the corresponding
captured tests. The package gate is rerun against the complete final built tree.

The app tests exercise actual extracted application functions with controlled
DOM and asynchronous boundaries. They do not establish browser rendering.
Offline/service-worker VM tests likewise do not establish secure-browser
installation or an actual deployed update.

## Actual numerical and worker proof

### Analog foundation retained

The engine remains EEcircuit-engine **1.8.0**, ngspice **45.2**, wrapper adapter
**4**. The WASM is unchanged: **6,133,055 bytes**, SHA-256:

`ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4`

[engine-validation.json](../../evidence/history/1.2.0-rc.1/engine-validation.json), recorded at
**2026-10-24T06:50:11.631Z**, passes all **62 checks**. All **56 workers** were
created and terminated; none remained alive. Cancellation acknowledgment was
about **0.466 ms**, and the main thread recorded 39 heartbeat ticks during the
long-run responsiveness check. The defined 40-run memory check stayed within
its allowance. These observations belong to the recorded Node environment;
they are not promises for every browser or device.

The authored analog regression at **2026-10-24T06:53:59.503Z** passes **15
fixtures, 70 native vector comparisons and 16 analytic/behavior checks**. See
[example-validation.json](../../evidence/history/1.2.0-rc.1/example-validation.json). The separately
pinned native reference is ngspice **42+ds-3build1**, executable SHA-256:

`820658317b0b54035208da41936fd6871ce924036e5ea4113a4168b821b7fc45`

The native and WASM versions differ explicitly. Agreement establishes the
recorded fixture results within their stated tolerances. The proof runs the
production Worker facade and actual WASM through a Node worker_threads shim;
it does not substitute an analytic waveform generator. See
[engine-evaluation.md](../engine-evaluation.md) for the method and model limits.

### Digital, buses and mixed-signal replay

[digital-validation.json](../../evidence/history/1.2.0-rc.1/digital-validation.json), recorded at
**2026-10-24T06:53:51.366Z**, passes **149 checks across 16 transient fixtures
plus one actual-worker truth-table experiment**. The fixtures include all 13
authored digital/mixed examples and three focused mixed cases. All **33
workers** were terminated: 19 digital and 14 analog, leaving none alive.

Checks cover the existing four-state gates, DFFs and bridge chains, plus exact
bus alias/bit order, private register/counter timing and reset, MUX/decoder
uncertainty, complete LUT output words, bounded truth enumeration and the
bus-driven DAC/RC circuit. The latter measured **4.749923292 V at 1.3 ms** and
**0.250059087 V at 2.3 ms**, within its **2 mV** analytical tolerance.

A separate final-deck execution confirmed exact preservation of original
analog samples in mixed results. Interpolation applies only to newly inserted
digital-event positions. The proof records the exact source hashes of the
engine, coordinator, compiler and examples; those hashes match the shipped
source. Later changes were in the main UI lifecycle and documentation.

The bundled WASM still disables XSPICE. The separate event kernel is explicitly
identified as **CircuitBench event logic 2 / cb-digital-kernel-2**, using digital
worker protocol 2. See the retained actual capability probe in
[digital-engine-capability.json](../../evidence/history/1.2.0-rc.1/digital-engine-capability.json).

## Browser observations

The managed Chrome preview used **http://terminal.local:4173/**. It is HTTP on a
non-localhost origin, so it cannot establish secure-context offline acceptance.
The detailed observation log is
[rc120-buses-truth-browser.json](../../evidence/history/1.2.0-rc.1/rc120-buses-truth-browser.json).

### Confirmed workflows

- The existing 1.1 scalar-digital project and its recorded 16-position X/Z run
  survived the initial 1.2 refresh. The library showed all 37 parts.
- The authored LUT half-adder generated all four correct binary rows through
  the browser worker: Carry:Sum `00`, `01`, `01`, `10`.
- Changing a connected LUT output from two to four bits was rejected before
  mutation; the working project stayed at revision 0.
- Editing row 00 to `0X` created revision 1 and a new table with an X sum. The
  earlier table stayed unchanged and displayed the outdated-revision notice.
- Saved table revisions survived opening the refreshed build. Numeric LUT
  entries produced the expected exact-width values; a non-fitting entry
  preserved the draft and prior dimensions with a row-specific error.
- The imported incomplete table `00:00` opened the repair dialog on the final
  runtime. Resetting its local draft and cancelling retained the original text
  and revision 0. Correcting all rows and applying produced revision 1.
- Bus Slice/Join completed with two stored positions and exact `10Z1`, `Z1`,
  `10`, `10Z1` and scalar `Z` values. Its report preview retained literal words
  and used no numeric bus extrema.
- The counter completed with 28 positions and visible wrap/reset timing. A
  cursor at approximately 3.674 ms displayed `COUNT 0010` and scalar `Q0 0`.
  That saved run survived the final runtime refresh.
- On final build `7ad78c372946c614`, the bus-bit/DAC/RC example completed with
  **635 shared positions, all 635 original analog times**, and visible word
  `0000 → 0100 → 0000`, scalar bit and analog voltage lanes. Diagnostics showed
  digital protocol 2, analog protocol 4 and the complete versioned asset paths.
  The WASM response was HTTP 200, application/wasm, 6,133,055 bytes.
- The downloaded four-row truth-table CSV was inspected independently and
  matched every expected word, including leading zeros.

Initial table observations used build `95fb816ff55932ab`. Numeric-entry,
word-lane and counter observations used `c8ef3ed4d77a1672`. Final-runtime mixed,
repair and table observations use `7ad78c372946c614`. These identities are kept
explicit rather than relabeling earlier actions.

### Open or limited browser checks

- **Offline installation, reload and update are not browser-verified for this
  candidate.** The preview correctly reports that HTTPS/localhost is required.
- Web Crypto hashing is unavailable on this insecure origin; saved evidence
  explicitly records `unavailable-in-insecure-context`. Package and WASM hashes
  are verified independently.
- A table-evidence JSON download timed out. A later backup action returned a
  download path, but the file was not present in the shared workspace after
  the allowed wait and could not be reopened through the browser file chooser.
  Neither action is counted as a verified portable export. The cause is
  unassigned; no download-code change was made based only on these observations.
- Final-candidate HTML report download/native browser Print/PDF and a complete
  browser/phone/tablet matrix remain open. Report preview and data generation
  tests do not close these gates.
- Main-UI cancellation/empty-circuit retention edge cases have controlled
  asynchronous regression tests; the fast preparation race was not manually
  forced in the actual browser.

## Supplied HTTPS host

The read-only live check still displayed **1.0.0-rc.2**, completed a fresh
**501-point AC run**, and showed **Offline cache installation failed**. Its
HTML report downloaded successfully as a complete **55,188-byte** document.
That is a successful export observation of the older deployed version only.
It does not establish new-candidate hosting or output acceptance.

Direct command-line requests to the root and release manifest returned HTTP
403; no cause was inferred from that status. The browser could use the site.
The exact observations are in
[live-host-120-preflight.json](../../evidence/history/1.2.0-rc.1/live-host-120-preflight.json).
No host files, security settings or credentials were changed.

## Deployment and remaining release gates

Upload all extracted contents of **CircuitBench-1.2.0-rc.1-deploy.zip**, including
`assets/1.2.0-rc.1/`, its engine/WASM files, the root service worker and `repair/`.
Preserve the tree. A source checkout requires `node scripts/build.mjs`, then
serving `dist/`. Use HTTPS or localhost; opening `index.html` through file:// is
unsupported. See [installation.md](../installation.md).

Before stable promotion, verify the exact uploaded build: fresh and upgraded
startup, offline install/reload/update, installation-scoped recovery preserving
projects, report/CSV/JSON/backup/print outputs and supported browser/viewports.
Run representative digital and mixed examples on that same hosted build.
Coordinated feedback, multibit converters and MCU/HDL execution remain separate
feature milestones.

The release receipt records the exact final manifest and ZIP hashes, CRCs,
source mappings, versioned paths and unique WASM. It establishes content
integrity separately from numerical correctness and browser acceptance.

## Historical records

The [1.1 validation](VALIDATION-1.1.0-rc.1.md) and
[1.1 progress](PROGRESS-1.1.0-rc.1.md) documents are preserved with their
original evidence copied from that candidate's source archive under
`evidence/history/1.1.0-rc.1/`. Earlier analog/hosting/browser observations also
retain their original versions and dates. None has been relabeled as a test of
this release.
