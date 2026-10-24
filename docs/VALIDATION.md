# Release validation and handoff

**Candidate: 2.0.0-rc.1 · Runtime build: `7f06ecaf7e7b40be` · October 24, 2026**

All requested batches are implemented: a working seven-segment display,
coordinated analog/digital feedback, closed-loop execution, multibit converters,
advanced analog studies and continuous simulation in state-preserving batches.
The package includes 41 parts, 35 model records and 38 worked examples
(16 analog, 14 digital and eight mixed).

This is a release candidate prepared for self-hosting. No external website was
modified. Actual target-host installation, secure offline updates and the full
browser matrix remain separate acceptance gates.

## Delivered execution contract

| Capability | Contract |
|---|---|
| SEG7 / HEX7 | Eight actual digital segment bits, bit 0=a through bit 6=g and bit 7=decimal point; active-high/low; hex and BCD decoder; preserved X/Z; cursor or latest result state |
| Coordinated transient | Original stateful modified nodal analysis with backward Euler for R/C/L and independent V/I sources, coupled to incremental digital events |
| Feedback | ADC crossings or sample completions alter digital state; delayed logic alters a DAC; the resulting analog response feeds the same circuit |
| ADCBUS | Differential 2–8 bit unsigned quantizer; endpoint clipping and nearest-code rounding; samples at k×period, publishes after positive delay; rounded delay strictly below rounded period |
| DACBUS | 2–8 bit unsigned ideal voltage source, explicit initial code and finite linear rise/fall; initial code held until first known word; subsequent X/Z is an error |
| Continuous | One worker retains C/L history, clock phase, queued events and private word state; Pause/Resume/Step; boundary-timestamped live DC and DIN/BUSIN inputs |
| Studies | Up to 64 independent trials, linear/log sweep or seeded uniform-relative Monte Carlo over up to eight parameters; selected raw evidence, arithmetic validation and statistics excluding failed trials |
| Persistence | Existing schema-1 projects; independent timing/study evidence; complete stopped windows or non-resumable continuous snapshots; original circuit revision and input history |

The coordinated subset explicitly rejects diodes, transistors, opamps,
controlled switches and imported SPICE decks. Those existing analog models and
OP/DC/AC experiments remain available through the pinned ngspice engine.
The ngspice mixed path retains scalar feed-forward replay semantics. The new
engine is identified as `cb-coordinated-1`; it is not an XSPICE-enabled build.

The 1 ps digital grid is a representation and scheduling grid. Threshold
localization occurs on the backward-Euler trial-step solution and does not
imply 1 ps physical accuracy. Reducing the maximum time step and comparing
results is the appropriate numerical convergence check. The display/converters
are behavioral parts without characterized IC timing, LED loading, noise,
aperture jitter, glitches or physical metastability.

## Integrated tests

Every application test file was executed directly with Node. Direct execution
preserves the individual test-case counts in this environment. The final
summary is [rc200-test-summary.json](../evidence/rc200-test-summary.json), with
one transcript per suite in `evidence/rc200-tests/`.

| Layer | Passing tests | What is exercised |
|---|---:|---|
| Core, digital model and bus compiler | 72 | All examples, domain/width checks, model/source parsing and compilation |
| Digital kernel, expansion and truth tables | 43 | Four-state resolution, private state, transport events and enumeration |
| Coordinated numerical engine and facade | 45 | Analog equations, crossings, converters, exact boundaries, real worker protocol and bounded continuation |
| Converter integration | 9 | Differential references, output polarity, code order, zero loading, generated names, malformed values, rounded timing and backups |
| Continuous controller, app and storage/timing | 47 | Pause/Resume/Step, asynchronous cancellation, live inputs, rolling windows, worker failures and independent provenance |
| Displays | 17 | Segment mapping, decoder/BCD/active levels, X/Z, run identity, cursor reads, continuous states and rendering |
| Analog studies | 65 | Trial generation, seed reproducibility, numeric measurements, budgets, cancellation, actual WASM workers, UI and app persistence |
| Editor and symbols | 27 | Electrical wiring, transforms, aliases, accessible bus widths and new display/converter ports |
| Results, plots and reports | 26 | Raw values/events, cursor/CSV, exact words, comparisons and escaped output |
| Storage, truth-table evidence/UI/app and autosave | 44 | Snapshot integrity, corruption rejection, immutable histories and app workflows |
| Simulation coordination | 10 | Worker exclusivity, cancellation, timeout and existing mixed stages |
| Engine loading and raw parser | 30 | Missing/invalid assets, protocol failures and raw result parsing |
| Offline and repair logic | 34 | Content-verified assets and installation-scoped recovery in controlled tests |
| Timing core, evidence, presentation and app | 81 | All five metrics, preserved edges, X/Z, boundaries, legacy 1.3 migration, reports and original-run navigation |
| **Application subtotal** | **550** | **36 files** |
| Final built package | 9 | Exact asset/source identity, imports, precache, recovery manifests, WASM and versioned paths |
| **Total** | **559** | **37 files** |

All application processes exited zero, with no failures, cancellations, skipped
cases, TODOs or timeouts. Counts refer to Node test cases; individual assertion
calls were not counted. The [package gate](../evidence/rc200-package-tests.json) is captured separately
because its generated manifest also authenticates these documentation/evidence
bytes. The external integrity receipt records the repeated final package pass.

The app suites execute actual extracted application functions with controlled
DOM, hashing and asynchronous boundaries. They verify logic and ownership,
while browser observations below verify rendering and user actions. Controlled
service-worker tests do not substitute for an actual HTTPS installation.

### Concrete integration regressions closed

- Stop, editing or project replacement during either startup hash cannot launch
  a stale worker or append an old run to a replacement project. An older
  cancelled preparation cannot clear a newer preparation's state. Hash errors
  release controls without a half-started run.
- Full-window and independent timing imports require matching continuous
  bounds and complete live-input history. Removing provenance or pretending a
  clipped window is an ordinary zero-origin run is rejected.
- The actual 1.3 browser timing backup now normalizes the newly introduced
  solver default and survives repeated saves; genuine analysis mismatches are
  still rejected.
- ADC delay and period are checked after rounding to the actual 1 ps clock.
  Compiler entry points reject DAC startup words containing X/Z before integer
  parsing can truncate them.
- Study evidence budgets reserve space for all remaining worst-case failure
  rows. Invalid runner metadata fails its trial, and signed-zero AC phase is
  stable across JSON export/import.

## Fresh numerical comparison

[coordinated-validation.json](../evidence/coordinated-validation.json) records
**24/24 checks over four numerical fixtures**. It executes actual pinned
ngspice 45.2 WASM and native ngspice 42 references and records six source hashes
matching the shipped implementation.

| Fixture | Maximum step | Observed comparison | Acceptance |
|---|---:|---:|---:|
| RC step, 1 ms time constant | 100 ns | 18.394 µV maximum voltage difference | ≤25 µV |
| RL step, 1 ms time constant | 100 ns | 183.935 nA maximum current difference | ≤250 nA |
| Underdamped RLC | 50 ns | 1.519 mV maximum voltage difference | ≤2 mV |
| Schmitt-controlled RC feedback | See recorded fixture | Coordinated 1.69544838 ms; ngspice reference 1.69537218 ms mean period | Analytic within 2 µs; reference within 0.3% |

The feedback reference uses an independently implemented hysteretic ngspice
switch and explicit pull-up. Its topology differs from the coordinated
ADC/inverter/DAC implementation; the comparison allowance includes these
stated differences and maximum-step error. It is not a claim that unlike
circuits are byte-identical. See [closed-loop-engine.md](closed-loop-engine.md).

The study engine tests additionally run 13 real production workers and verify
that all 13 terminate. They compare divider sweeps/tolerance draws with the
resistor formula and RC AC/transient measurements with independent
expectations. The facade tests also exercise actual retained workers across
chunk limits, pause/resume and shutdown.

## Browser workflows and exported evidence

The managed Chrome preview is `http://terminal.local:4173/`. It is not a secure
localhost/HTTPS origin, so it cannot establish offline-install acceptance.
The browser record is [rc200-browser-validation.json](../evidence/rc200-browser-validation.json).

Early display and Schmitt observations used runtime `7de58c9b9e7b297b`; the final
converter-hardening build `7f06ecaf7e7b40be` was then used for sampled feedback,
analog studies, restoration and live analog operation. The early records are
not relabeled as later-build observations. All exported data are validated
again by the final production import code.

| Browser workflow | Observed result |
|---|---|
| Existing 1.3 project | Recovered its saved hazard run and timing record without resetting browser storage |
| Seven-segment counter | 66 event times; final digit 0 from `00111111`; selecting a waveform time changed the display to 8 from `01111111` |
| Continuous counter | Pause, Step and Resume retained state; changing enable to 0 held count `1011` and display b |
| Rolling window and timing | Stopped window 214.1–229.6 ms retained 48 points, with 664 earlier points dropped; its 10.4 ms live change remained recorded; 14 full clock periods measured 1 ms plus one unfinished cycle |
| Schmitt feedback example | 2,427 mixed points over 12 ms; five full periods measured 1.701678496 ms with the example's 5 µs maximum step |
| Sampled feedback example | 2,699 points over 10 ms; final ADC `0111`, command `1000`, sense 2.5038312595 V and display 7; backup reopened with the same data |
| Divider parameter sweep | Nine R1 values from 5 kΩ to 15 kΩ produced midpoint values from 6.6666666667 V to 4 V, including 5 V at 10 kΩ |
| Seeded tolerance study | Eight two-resistor ±5% trials, seed 20261024; mean 5.0152317969 V; exact inputs/results retained |
| Study persistence | Two studies restored from the downloaded project; restored-evidence notice correctly says import checks arithmetic without rerunning circuits; CSV and standalone JSON exported |
| AC capacitance sweep | 10 nF, 100 nF and 1 µF at 1 kHz produced 0.846733016, 0.1571767255 and 0.015913479 V |
| Continuous RC | Live DC input changed 0→5 V at 8 ms; successive completed batches gave 3.15144394 V at 9 ms and 4.3165681 V at 10 ms, preserving stored charge |
| Report preview | Included both saved analog studies with their captured circuit and statistics even without a selected full run |

The browser-generated JSON/CSV artifacts are included as `evidence/rc200-*`.
[scripts/verify-browser-evidence.mjs](../scripts/verify-browser-evidence.mjs)
uses production validators, checks repeated JSON round trips, independently
recomputes divider/AC/discrete RC expectations, and records file/source hashes
in [rc200-export-validation.json](../evidence/rc200-export-validation.json).
Its check count is reported in that generated record, not mixed into the Node
suite total.

One attempt to download a second continuous backup immediately before a page
reload yielded a browser path whose file was unavailable; it is not included
or counted as a successful artifact. The earlier complete continuous backup
and separately downloaded timing evidence were available and verified.

HTML report download did not produce a file in this cloud browser. Both its
existing link and a temporary use of the working generic download helper were
tried; no successful HTML download or cause is claimed. The unproven change was
reverted. The report preview worked. Native print/PDF remains unverified.

## Engine and historical evidence

The analog engine remains EEcircuit-engine **1.8.0**, ngspice **45.2**, adapter
**4**. The pinned WASM is **6,133,055 bytes**, SHA-256:

`ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4`

The original digital kernel remains `cb-digital-kernel-2`. Coordinated mode
adds its own incremental scheduler and explicitly identified solver; existing
batch/feed-forward paths remain available. Current tests exercise their
integration with the new compiler and schema defaults.

Previous analog, digital/mixed and timing proof files retain their original
versions and timestamps. They are historical evidence, not newly rerun 2.0
claims. The 1.3 source-era observations and test logs are preserved under
`evidence/history/1.3.0-rc.1/` and
[history/VALIDATION-1.3.0-rc.1.md](history/VALIDATION-1.3.0-rc.1.md).

## Packaging and remaining acceptance

The final deploy includes every module, both worker families, the pinned WASM,
versioned runtime assets, service-worker/recovery files and documentation.
Source packaging omits a duplicated dist tree; `node scripts/build.mjs`
reconstructs it without installing npm dependencies. The package gate checks
local imports at a nested URL, manifest hashes, original source mappings and
exact runtime/recovery lists. ZIP CRCs and complete archive SHA-256 values are
recorded in the accompanying release-integrity receipt and checksum file.

Unclosed acceptance gates are:

- Uploading the exact candidate to the intended HTTPS host, then checking fresh
  and upgraded startup, actual worker/CSP behavior, offline reload and scoped
  cache repair while preserving projects.
- HTML report download and native print/PDF in supported browsers.
- The complete browser/viewport/accessibility matrix, including touch devices.

These gates do not change the documented solver subset or silently defer a
requested feature batch. The work is delivered as a complete, tested candidate;
no public deployment or stable-release certification is implied.
