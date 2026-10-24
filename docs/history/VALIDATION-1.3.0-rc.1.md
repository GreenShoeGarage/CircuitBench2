# Release validation and handoff

**Candidate: 1.3.0-rc.1 · Runtime build: `352ddfa1ccaa148b` · October 24, 2026**

This candidate adds digital timing measurements and independent saved timing
evidence. It preserves the pinned analog/digital engines, versioned runtime
asset layout and project-preserving recovery. It has not been deployed to the
supplied external host. The exact target-host and supported-browser acceptance
checks remain distinct from local tests and archive verification.

## Delivered scope

The workbench retains 37 parts and 31 model records. Its 29 examples comprise
13 analog, 12 digital and four feed-forward mixed-signal circuits. The three
new timing examples use existing components: a clock with two delayed buffers,
a reconvergent XOR hazard, and a pattern with X/Z plus unfinished pulses.

The new measurements are propagation delay, high/low pulse width, per-cycle
period, per-cycle frequency and percentage of a complete cycle spent high.
Users select a scalar signal or a particular bus bit, edge polarity and an
inclusive time window. Results retain exact event pairs, individual statuses,
summary statistics and an action that places waveform cursors on the original
run. Full-word bus lanes remain available when inspecting a bit measurement.

Only direct 0→1 and 1→0 transitions count as binary edges. Initial values at
zero do not become edges. X/Z interruptions produce indeterminate results;
missing closing edges and incomplete cycles retain an explanation and no
numeric value. Equal selected timestamps yield zero delay. Delay pairing is a
temporal relationship, not proof of a physical causal path.

The measurement method is `cb-event-timing-1`, using preserved events on the
declared 1 ps grid. This is not physical accuracy or a metastability model.
ADC-origin events retain the existing analog sampling/interpolation assumptions.
Analog threshold measurements, setup/hold constraints, negative-delay
correlation, coordinated mixed feedback and MCU/HDL execution are outside this
increment. Exact semantics are in
[timing-measurements.md](../timing-measurements.md).

## Refreshed regression tests

| Layer | Passing tests | Scope |
|---|---:|---|
| Core, digital model and bus compiler | 72 | Topology, domains, widths, parsers, aliases, state compilation and all 29 examples |
| Digital kernel, expansion and truth tables | 43 | Four-state resolution, event timing, private word state, patterns and enumeration |
| Simulation coordination | 10 | Worker isolation, exclusivity, cancellation, timeout, recovery and mixed staging |
| Editor and symbols | 27 | Wiring, transformations, junction/label checks and accessible port widths |
| Results, plots and bus reports | 26 | Exact transitions/words, cursor/CSV, baselines, report values and bounded summaries |
| Existing storage, table evidence/UI/app and autosave | 44 | Immutable snapshots, corruption rejection, literal states, LUT repair and cancellation |
| Engine loading and raw parser | 30 | Missing/invalid assets, protocol failures and raw result handling |
| Offline and repair logic | 34 | Content-verified caching and scoped recovery in controlled environments |
| New timing core | 34 | Independent known events, all five metrics, X/Z/boundaries, explicit bus bits, malformed sources and bounds |
| New timing evidence | 19 | Immutable sparse capture, source-run removal, repeat imports, metadata consistency, retention, CSV/JSON and reports |
| New timing presentation | 12 | Selection, engineering units, drafts, exact values, provenance, accessibility and escaped text |
| New timing app integration | 15 | Actual captured app functions, original-run closures, View pair, backups, history, imports and reports |
| Final built package | 9 | Complete assets, imports, source/runtime identity, precache and recovery manifests |
| **Total** | **375** | **26 directly executed test files** |

All 25 application suites were rerun against the frozen 1.3 implementation;
the package suite follows the final documentation/evidence build. The exact
commands, timestamps and transcripts are in
[focused-test-summary.json](../../evidence/history/1.3.0-rc.1/focused-test-summary.json).
Direct execution preserves individual Node test counts in this environment.

The app tests exercise actual extracted app functions with controlled DOM and
asynchronous boundaries. They do not substitute for browser rendering. The
service-worker/repair tests likewise do not establish an actual HTTPS install
or an upgrade on the external host.

## Fresh actual-worker timing proof

[timing-validation.json](../../evidence/history/1.3.0-rc.1/timing-validation.json) records **69/69
checks**, **five fixtures** and **11 timing records**. The fixtures execute the
production digital and analog workers through a Node worker_threads adapter;
timing calculation then consumes the actual returned sparse events.

| Fixture | Independently expected behavior verified |
|---|---|
| Clock and buffer chain | 20 ns rising/falling delay, 25 ns high pulse, 100 ns period, 10 MHz and 25% duty; final falling output outside the run remains missing |
| Reconvergent XOR | Two pulses at 115–135 ns and 265–285 ns, each 20 ns wide |
| X/Z pattern | One 40 ns complete pulse, two indeterminate interruptions and one unfinished pulse; an end at 225 ns clips a later closing edge |
| Counter bus bit 0 | Explicit bit selection and a complete 2 ms period before the reset interval |
| Bus bit 2 → DAC → RC | Real mixed simulation, retained original analog sample positions and a 1 ms digital high pulse with bridge assumptions |

The same proof checks backup round trips, repeated restoration flags,
independence from source-run retention, CSV/JSON content and rejection of
modified timing values. **All six simulation workers terminated**: five
digital and one analog; none remained alive. The seven source-file hashes
recorded by the proof match the shipped implementation.

The postprocessing itself is bounded and synchronous; it does not start a new
simulation or worker. Maximum-size Node core measurements over 250,000 selected
events took approximately 75–160 ms during development, with 256 returned rows.
A larger capture/validation/retention test completed in about one second in
this executor. These are observations, not browser latency promises.

## Preserved engine evidence

The analog engine remains EEcircuit-engine **1.8.0**, ngspice **45.2**, adapter
**4**. The WASM remains **6,133,055 bytes**, SHA-256:

`ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4`

The digital engine remains **CircuitBench event logic 2 / cb-digital-kernel-2**,
with worker protocol 2. The feed-forward coordinator, compiler, library and
both engine workers are byte-identical to the released 1.2 source archive.
[rc130-retained-runtime.json](../../evidence/history/1.3.0-rc.1/rc130-retained-runtime.json) records
all ten file comparisons and the reference ZIP hash.

The earlier analog foundation proof (62 checks, 56 workers), analog fixture
comparison (15 fixtures, 70 native vector comparisons, 16 behavior checks), and
digital/mixed proof (149 checks, 33 workers) retain their original timestamps
and identities. They were **not rerun as new 1.3 observations**. Their preserved
records and context are in
[the 1.2 validation archive](VALIDATION-1.2.0-rc.1.md). Fresh timing proof
and refreshed regressions supplement those unchanged-engine results.

## Browser verification

The managed Chrome preview used `http://terminal.local:4173/`. Its insecure
non-localhost origin cannot establish secure-context service-worker acceptance.
The browser observation record is
[rc130-timing-browser.json](../../evidence/history/1.3.0-rc.1/rc130-timing-browser.json).

Confirmed on the 1.3 runtime:

- The preceding 1.2 authored project loaded after refreshing into 1.3.
- All five clock metrics matched the values above. The final incomplete cycle
  remained a missing-edge row, and summary values excluded it.
- A window beginning after the run end produced an error without adding a
  sixth record. All five existing records remained available.
- All five records stayed readable after removing the full source run.
  View pair controls were absent when that source run was no longer retained.
- The report preview included all five timing records without a full source
  run, under a separate digital timing evidence section.
- Timing CSV downloaded and was inspected: four 25% rows and one missing-edge
  row with an empty value. The retained artifact is
  [rc130-timing-duty.csv](../../evidence/history/1.3.0-rc.1/rc130-timing-duty.csv).
- Standalone timing JSON downloaded and retained the full snapshot and 11
  selected source events; see
  [rc130-timing-duty.json](../../evidence/history/1.3.0-rc.1/rc130-timing-duty.json).
- The 102,087-byte complete project backup downloaded, reopened through the
  normal file chooser, restored one run plus all five measurement kinds, and
  survived another reload with the restored-evidence notice and local save
  status. See [the captured backup](../../evidence/history/1.3.0-rc.1/rc130-timing-project.circuitbench.json).
- The uncertainty example showed one 40 ns measured pulse, two indeterminate
  X/Z pulses and one missing closing edge.
- The mixed bus/DAC example completed with 635 shared positions. Explicit bus
  bit 2 measured a 1 ms pulse from 1 to 2 ms.
- The reconvergent hazard example showed two 20 ns pulses. View pair selected
  the single authored hazard lane, with A = 115 ns, B = 135 ns and Δt = 20 ns.
- Desktop layout was visually inspected in the existing dark theme. Long
  result tables use a scrollable region and retain exact values.

### Remaining browser and target-host gates

The **HTML report download timed out after 15 seconds**. The preview rendered,
and the link had a filename and blob URL. Browser-extension metadata errors
were also visible, but no causal explanation was established. No successful
HTML download is claimed for this candidate. Native print/save-PDF was not
exercised, and the full browser/phone/tablet matrix remains open.

The exact external HTTPS deployment still needs fresh/upgrade startup, worker
and WASM responses, offline install/reload/update, installation-scoped recovery
preserving project data, and portable output checks. The prior host observation
showing 1.0.0-rc.2 belongs to the 1.2 work; no new host inspection or deployment
is claimed in this increment.

## Packaging and handoff

The deploy ZIP contains the complete prebuilt application, one versioned WASM,
all 27 runtime assets, documentation and evidence. The source ZIP contains the
editable files, tests, proof scripts and vendored engine, without a duplicate
`dist/` tree or temporary QA fixtures. Versioned executable paths, source
mapping, file sizes and SHA-256 are verified before packaging. The release
receipt and SHA256SUMS identify the final archives; ZIP CRCs and contents are
checked separately.

Upload every extracted file from **CircuitBench-1.3.0-rc.1-deploy.zip**, retaining
`assets/1.3.0-rc.1/`, its engine directory, the root service worker and `repair/`.
For an existing installation, back up projects, close other app tabs, use
`repair/?release=1.3.0-rc.1`, return and confirm the visible version. Source
checkouts require `node scripts/build.mjs` and serving `dist/`.

For a first acceptance run, load **Measure clock timing and gate delay**, run,
measure all five metrics, save/reopen a backup, then exercise the mixed bus/DAC
example. See [installation.md](../installation.md), [user-guide.md](../user-guide.md)
and [ROADMAP.md](../../ROADMAP.md).
