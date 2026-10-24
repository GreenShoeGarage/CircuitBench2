# CircuitBench

**Version 1.0.0-rc.1 — release candidate; secure-context browser offline verification remains blocked.**

CircuitBench is a self-hosted analog electronics workbench from Green Shoe
Garage. Draw a circuit, connect real pins, configure an experiment, run ngspice,
measure the response, change a value, compare a baseline, and save the evidence.

It is a static web application. The simulation engine runs locally in a Web
Worker. Core operation needs no account, cloud API, telemetry, or native ngspice
installation. The deployable ZIP contains the built application and its runtime
assets; you do not compile it to deploy it.

## Start the prebuilt release

Unzip the deployable package into a folder, open a terminal in that folder, and
run:

```sh
python3 -m http.server 8080
```

Open **http://localhost:8080/** in a modern browser. Keep that terminal running.
Opening `index.html` directly with `file://` is unsupported because browser
modules, Web Workers and offline installation require a web origin.

For static hosting, upload the complete folder containing `index.html` to the
chosen route. A subdirectory such as `/circuitbench/` works with relative asset
paths. Serve `.mjs` as JavaScript and `.wasm` as `application/wasm`. HTTPS is
recommended and enables service-worker offline installation.

## First experiment

1. Open **Examples → RC low-pass filter**, or use the empty-workbench RC button.
2. Choose **Run experiment**. Real ngspice results appear in Waveforms.
3. Choose **Pin baseline**.
4. Select C1 and change its capacitance from `100n` to `200n`.
5. Run again. The output cutoff moves from about 159.15 Hz to 79.58 Hz; the
   baseline remains dashed for comparison.
6. Choose **Save backup**, then **Project → Open project** to reopen the portable
   JSON project with its recorded runs.

These cutoff values follow `fc = 1/(2πRC)`; the numerical acceptance evidence is
in [engine-validation.json](evidence/engine-validation.json).

## Included capabilities

- A schematic editor with searchable parts, snapping, pin-based connections,
  explicit junctions and labels, movement, rotation, mirroring, wire bends,
  multiselection, copy/paste, undo/redo and keyboard alternatives.
- Operating point, one-source DC sweep, logarithmic AC analysis and transient
  analysis through ngspice 45.2 WebAssembly / EEcircuit-engine 1.8.0.
- Node and differential voltage probes; voltage-source and inductor branch
  currents; resistor current derived from the simulated voltage difference.
- Multiple traces, magnitude/phase plots, waveform zoom/pan, cursors, saved-run
  comparison, numerical tables and full-resolution CSV export.
- Fourteen component types and thirteen worked examples covering passive
  circuits, sensor conditioning, diodes/LEDs, BJTs, MOSFETs, switches and an
  educational bounded op amp.
- Local autosave and previous-save recovery; downloadable JSON projects,
  SPICE netlists, schematic SVG, component CSV and designed printable reports.
- Dark, light and high-contrast themes, collapsible panels, visible version,
  run status, diagnostics and stale-result indicators.

Semiconductor models are original **generic educational parameter sets**, not
identified manufacturer models. Their provenance, version, limitations and
validation fixtures are documented. The op amp omits finite bandwidth and slew
rate. The MOSFETs use level-1 models with body tied to source in the schematic.
See [compatibility](docs/compatibility.md) before interpreting practical device
behavior.

## Local storage and offline use

Autosave belongs to this browser and origin. It never changes a file you opened
from disk. Keep downloadable backups before clearing browser data, changing a
hostname, or moving to another device. The application shows **Session only**
if durable browser storage is unavailable.

For installed offline use, visit over HTTPS or localhost and wait for
**Offline ready**. Essential runtime assets are then cached. A downloaded
release served by a local web server also works without internet access.
Updates are described in [installation](docs/installation.md); save a backup and
close all CircuitBench tabs before opening an updated installation.

## Source checkout

The application source has no npm dependency installation step. Its runtime
engine is vendored and pinned.

```sh
node scripts/build.mjs
node --test tests/*.test.mjs
python3 -m http.server 8080 --directory dist
```

Use Node.js 20 or newer and Python 3. The source ZIP intentionally excludes a
second copy of `dist/`; `build.mjs` recreates it. Numerical development checks
also require the separately pinned native ngspice reference:

```sh
node --expose-gc scripts/prove-engine.mjs
node --expose-gc scripts/prove-examples.mjs
```

Those scripts execute the production WASM adapter in Node workers, check the
analytic reference cases and compare native ngspice. These checks are distinct
from browser workflow verification. The native executable pin is recorded in
[engine evaluation](docs/engine-evaluation.md).

## Verification and release status

The recorded foundation suite passed **62 numerical and lifecycle checks**,
including cancellation, timeout, failure recovery and repeated worker disposal:
56 workers created, 56 terminated. All thirteen authored examples plus
current-source and PWL fixtures passed actual WASM/native comparison, totaling
70 vector comparisons and 16 analytic/behavior checks. Another 74 Node/VM tests
cover the core model, editor logic, results/reports, autosave, package files and
service-worker logic, including six raw-parser regression checks.

The actual browser completed a 501-point RC AC run, a 100 nF → 220 nF capacitor
change with baseline overlay, undo/redo stale-state checks, backup JSON
export/import/reload and HTML report preview. It also verified keyboard wiring,
explicit crossing/junction behavior, cursor readouts, Stop/recovery, CSV download, themes,
constrained phone/tablet viewports and a fresh run at a subdirectory URL. A
Unicode-title parser defect found during review was fixed and regression-tested.
The exact final browser report also passed independent three-page A4 PDF layout
review using WeasyPrint and Poppler; Chrome's native print dialog was not tested.
The precise evidence layers, remaining browser checks and reproduction steps are recorded in
[release validation](docs/VALIDATION.md).

The provided browser review endpoint is plain HTTP on a non-localhost host, so
it cannot exercise secure-context service-worker installation, offline reload
or update activation. Deterministic asset and simulated service-worker checks
passed; they do not prove browser offline behavior. **This candidate is not a
completed v1.0.0 release.** Standalone HTML-report and SPICE-file browser downloads
also remain unverified. See [progress](docs/PROGRESS.md) and the `evidence/`
directory for the current status and numerical records.

The accompanying `CircuitBench-1.0.0-rc.1-release-integrity.json` receipt and
`SHA256SUMS` identify the final archives after packaging checks. The receipt is
produced only after those checks and stays outside the ZIPs.

## Documentation

- [User guide](docs/user-guide.md)
- [Installation, hosting and updates](docs/installation.md)
- [Components, analyses and import compatibility](docs/compatibility.md)
- [Architecture and data model](docs/architecture.md)
- [Exact project-format reference](docs/project-format.md)
- [Component model provenance](docs/component-models.md)
- [Engine evaluation and numerical evidence](docs/engine-evaluation.md)
- [Release validation and handoff](docs/VALIDATION.md)
- [Editor implementation](docs/editor-implementation.md)
- [Changelog](CHANGELOG.md)
- [Post-v1 roadmap](ROADMAP.md)
- [Application license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md)

No external repository, domain or hosting destination has been selected or
deployed as part of this package.
