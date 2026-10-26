# CircuitBench

**Version 2.2.0 — everyday workbench controls, instruments and numerical comparisons.**

CircuitBench is Green Shoe Garage's self-hosted electronics workbench. Draw a
circuit, configure an experiment, run it, measure the response, compare a
baseline and save the evidence. It is a static browser application with local
simulation and storage. No account, cloud API, telemetry or native runtime
installation is required for the deployed application.

The implemented foundation includes a working seven-segment display,
coordinated analog/digital feedback, closed-loop execution, multibit converters,
advanced analog experiments and stateful continuous simulation. The rc.2
release added the digital voltage source and red-HIGH logic indicators.
The library remains **43 parts, 37 model definitions and 41 examples**:
16 analog, 16 digital and 9 mixed-signal examples.

## Delivered in 2.1 and 2.2

This cumulative release completes both authorized development batches. The
accepted stable 2.0 installation and browser record remains preserved under its
original identity; current verification is recorded in [VALIDATION.md](docs/VALIDATION.md).

| Milestone | New workflow |
|---|---|
| 2.1 · Everyday workbench | Pin live sources beside the schematic; operate a digital source directly; use reliable momentary press/release; find compatible pins; insert explicit ADC/DAC, Slice/Join and decoder/display corrections; navigate diagnostics to the affected circuit location. |
| 2.2 · Instruments | Digital-edge and analog-threshold triggers; pre/post-trigger capture; Run until event; Next event; view-only bus-bit expansion and linked schematic/plot selection. |
| 2.2 · Measurements | Rise/fall time, overshoot, settling, threshold delay, transfer gain, AC cutoff and explicit digital setup/hold checks, with reusable configurations and independent evidence. |
| 2.2 · Numerical comparisons | Rerun a coordinated transient with 2–4 successively halved maximum steps, compare a declared scalar measurement and retain every trial, difference and tolerance. |

The [live-control guide](docs/live-controls.md), [guided construction guide](docs/guided-construction.md),
[capture guide](docs/triggered-capture.md), [measurement guide](docs/measurements.md)
and [time-step study guide](docs/step-study.md) describe the exact behavior.
The maintained catalog and analog model scope remain unchanged.

## Installation and state improvements introduced in 2.0.0-rc.3

- **Check installation:** open **Help → Check installation** to inspect the
  loaded release identity, release/recovery manifests and runtime assets.
  Separate disposable workers execute a digital logic fixture, retained
  coordinated feedback and a real ngspice WASM divider. The working circuit
  and saved projects are not used or changed. Download diagnostic JSON with
  per-check results and available stage/asset details.
- **Clear operation and observation:** a persistent strip separates Editing,
  Running, Paused, Results ready and Showing saved result from the time being
  observed. **Latest** and **Cursor A** identify the displayed time;
  **Return to latest** clears the historical cursor without starting or
  resuming a simulation.
- **Source-state context:** selecting a digital voltage source distinguishes
  its configured Initial drive from confirmed Live drive or Recorded drive
  at the viewed time. Indicators continue to observe the resolved net.
- **Completed-step feedback:** a paused Step reports its pending work, then
  returns to the retained-state explanation when complete. Pending commands
  disable Step; an obsolete session cannot overwrite the replacement
  session's status or attach a late error to it.
- **Consistent release identity:** operational guides and both recovery
  entries receive current version/path labels during the build. The shell
  records its loaded build identity so installation checks can identify a
  mismatched advertised release. Historical evidence keeps its original
  version.
- **Repeatable native reference:** a private, hash-pinned ngspice42 setup and
  explicit proof executable path restore the existing native comparison.
  The rc.3 numerical proof passed 24 checks using native42, the deployed
  ngspice45.2 WASM engine, analytic expectations and retained state. The
  [reference environment guide](docs/reference-environment.md) describes
  exact inputs, commands and verification limits.

An installation check establishes the connected asset and engine observations
it records. **Completed with limits** identifies unavailable verification,
such as SHA-256 on an insecure origin. Offline reload, upgrades, recovery and
actual output downloads have separate acceptance evidence. The checker leaves
caches and registrations unchanged; **Open cache repair** opens the existing
explicit recovery workflow. See [installation checks](docs/installation.md#check-this-installation)
and [viewing circuit state](docs/user-guide.md#know-which-circuit-state-you-are-viewing).

## Digital controls and displays introduced in 2.0.0-rc.2

- **Digital voltage source (DVS):** choose LOW (0) or HIGH (1) using its inspector buttons. The digital output connects directly to gates. Optional **Digital logic + voltage terminals** adds separate analog +/− terminals, defaulting to 0/5 V with configurable rise/fall times.
- **Logic state indicator (DLED):** the actual resolved HIGH glows red on the schematic. LOW is dark, X is amber and Z has a dashed blue outline. Cursor A reads the preserved state at a chosen time; missing or stale results remain neutral.
- **Live switching:** change the source with its inspector buttons or **Live inputs…** during a continuous session. The original circuit stays as the initial condition; recorded input changes preserve their simulation times. When paused, use **Step** or **Resume** to see the response.

Start with **Examples → Digital voltage source and red logic indicators**. DV1 starts HIGH: its direct indicator is red and the indicator after a NOT gate is dark. The mixed RC example demonstrates actual 0/5 V terminals and a delayed Schmitt response. A third example shows HIGH, LOW, X and Z together. See [digital sources and indicators](docs/logic-io.md).

## Features added in 2.0

| Capability | Delivered behavior |
|---|---|
| Working seven-segment display | `SEG7` observes an eight-bit segment bus at the selected simulated time. `HEX7` decodes a four-bit hexadecimal or BCD digit and a decimal-point input. Active-high/low operation and literal X/Z states are explicit. |
| Coordinated analog/digital feedback | One isolated worker advances the supported analog network, four-state logic, converter samples and pending events on a shared causal timeline. |
| Closed-loop mixed simulation | Analog voltage can change digital logic and return through a DAC to the same analog circuit. Schmitt RC and sampled four-bit feedback examples are included. |
| Multibit conversion | Unsigned 2–8-bit sampled ADCs and finite-edge voltage DACs preserve full bus words, differential references, conversion timing and declared startup conditions. |
| Advanced analog experiments | Linear/logarithmic parameter sweeps and deterministic seeded tolerance studies run independent trials with exact parameter values, explicit failures, saved measurements and CSV/JSON evidence. |
| Continuous simulation | Bounded worker commands continue the same circuit state. Pause, Resume, Step and live input changes operate with an explicitly bounded recent waveform window. |

## Choose the simulation mode

The transient inspector provides two engine choices:

| Engine choice | Supported work |
|---|---|
| **ngspice · analog / feed-forward mixed** | The established analog library, including diodes, transistors, switches and op amps; operating point, DC sweep, AC and transient analysis. Mixed experiments use the existing scalar ADC/DAC feed-forward replay. |
| **Coordinated · analog/digital feedback** | Transient simulation of resistors, capacitors, inductors and independent voltage/current sources together with digital logic, buses, displays and scalar or multibit converters. Supports closed-loop and continuous execution. |

Digital circuits use CircuitBench's four-state event logic. Width checks require
explicit Slice/Join parts when changing bus widths; sequential parts provide
state boundaries for digital feedback. Pure combinational digital cycles are
rejected. The coordinated solver also rejects unsupported nonlinear parts and
imported SPICE decks with an actionable diagnostic.

Coordinated analog integration uses backward Euler. Reduce **Maximum time
step** and compare the quantity of interest when checking numerical convergence.
The shared 1 ps event grid is a scheduling resolution, not a physical-accuracy
claim. Ngspice remains the engine for nonlinear analog device experiments and
its supported feed-forward mixed circuits. The bundled ngspice WASM still has
XSPICE disabled; the coordinated engine has its own recorded identity and
explicit model limits. See [the engine contract](docs/closed-loop-engine.md).

## Try the workbench workflows

### Display actual digital state

1. Open **Examples → Hex counter with a working seven-segment display**.
2. Choose **Run experiment**. The counter, decoder and display execute together.
3. Move waveform cursor A to inspect a saved time. The display reads the
   preserved segment events; without a selected time it shows the latest
   retained state.

Try **Seven-segment patterns, decimal point, X and Z** to inspect uncertain and
released segments. `SEG7` is a passive digital indicator; it has no LED current,
brightness or multiplex-persistence model. Its input is the eight-bit segment
word, while `HEX7` accepts the four-bit digit. See
[seven-segment displays](docs/seven-segment-display.md).

### Run a closed feedback loop or a multibit conversion

Open **Examples → Closed-loop Schmitt RC oscillator** and choose **Run
experiment**. The capacitor voltage crosses the ADC thresholds; the digital
inverter and DAC then change the drive on that same RC network. Compare a
second run with a smaller maximum time step.

For sampled feedback, choose **Sampled 4-bit feedback controller and display**.
For the converter transfer, choose **Multibit ADC, DAC and seven-segment
readout**. The latter samples a 0–5 V ramp into a four-bit code and reconstructs
it with a DAC. **Eight-bit counter through a voltage DAC** exercises a complete
eight-bit path.

The sampled ADC clips to its configured range and rounds to the nearest unsigned
code. It publishes after its conversion delay; the initial word is X. The
multibit DAC holds its explicit startup code until its first fully known word.
A later X/Z input stops the run with a diagnostic. Widths, references and
sample/delay rules are documented in [multibit converters](docs/multibit-converters.md).

### Sweep a component or study tolerance

1. Open **Examples → Resistor tolerance and divider sensitivity**.
2. Choose **Analog experiments…**, then **Parameter sweep**. Select `R1.value`,
   start `10k`, stop `30k`, three trials and linear spacing.
3. Select **Midpoint** and **Final value**, then **Run study**. The divider
   outputs are approximately 5 V, 3.333 V and 2.5 V for those three resistor values.
4. Export the study CSV or evidence JSON. To examine component variation,
   choose **Tolerance study · Monte Carlo**, select both resistors, set each
   to ±5%, and retain the seed when repeating the study.

**RC capacitance sweep and frequency response** demonstrates a logarithmic
capacitance sweep with AC magnitude or phase at a chosen frequency. Transient
studies also support final, minimum, maximum, peak-to-peak and time-weighted
RMS measurements, optionally within a specified time window.

Studies operate on analog-only schematics. Each trial starts a fresh isolated
simulation from the captured project and exact parameter changes. The working
circuit stays intact. Uniform relative tolerance draws are deterministic for
the chosen seed; they are not a manufacturing yield guarantee. Stop preserves
finished trials, and failed or cancelled trials retain their status without
entering measured-value statistics.

A study supports up to **64 trials and 8 tolerance parameters**. History retains
up to **6 study records** within the documented sample/byte limits. Backups and
reports retain the captured circuit revision and selected source data. See
[analog parameter studies](docs/analog-experiments.md) for measurement rules,
restored-record checks and limits.

### Continue the same circuit through batches

1. Open **Examples → Continuous RC with live input changes**.
2. Choose **Continuous…**, set the update interval and recent history window,
   then choose **Start continuous simulation**.
3. Open **Live inputs…**, set the independent DC voltage source to `5`, and
   apply it. The capacitor charges from its current voltage.
4. Choose **Pause**, change the live source to `0`, then choose **Step** or
   **Resume**. The capacitor discharges from its retained state.
5. Choose **Stop & keep results** before creating timing measurements or
   exporting a report from the completed window.

The same worker retains capacitor voltages, inductor currents, clock phase,
register/counter state and pending digital/conversion events across updates and
pauses. Live controls include binary `DVS`, four-state scalar `DIN`, `BUSIN` words and independent **DC**
voltage/current sources. Applied changes are recorded with absolute simulation
times. Circuit edits stop the session; changing topology or component parameters
starts a new experiment.

Continuous results keep a bounded rolling window: up to 30,000 points per
vector, one million dense values and 250,000 sparse events. Screen updates run
as fast as bounded computation and display scheduling allow. Each update is
limited to 2,000 accepted steps. Saved backups contain the retained waveform,
original project and live-input history; they cannot resume a live solver.
An active session can be saved as a completed window snapshot. See
[continuous simulation](docs/continuous-simulation.md).

## Existing workbench capabilities

Schematic editing includes explicit pin connections, junctions, labels,
transforms, clipboard and undo/redo. Results include voltage/current and complex
AC measurements, cursors, baselines, CSV and printable analysis reports. Local
autosave, previous-save recovery and dark, light and high-contrast themes remain
available.

Digital tools include timed 0/1/X/Z gates, clocks, tri-state driver resolution,
D flip-flops, 1–8-bit words, patterns, registers, counters, MUX/decoder/LUT parts,
and independent combinational truth-table experiments. **Timing** measures
propagation delay, pulse width, period, frequency and duty cycle from preserved
events on a scalar signal or selected bus bit. X/Z and incomplete observations
retain explanations instead of guessed measurements. Truth-table and timing
evidence remain available independently of the full source run.

For a first analog comparison, run **Examples → RC low-pass filter**, choose
**Pin baseline**, change C1 from `100n` to `200n`, and run again. Save a backup
and reopen it through **Project → Open project**. Generic semiconductor models
have educational limitations; see [component models](docs/component-models.md)
and [compatibility](docs/compatibility.md) when interpreting results.

## Install the prebuilt 2.2 release

Extract **CircuitBench-2.2.0-deploy.zip** and upload the complete contents to
the application's directory. Preserve `assets/`, `repair/`, manifests and root
files. Executable assets are under `assets/2.2.0/`; this includes the
complete `engine/` folder and its WASM binary. Every worker and engine asset
must be present.

For a local server, run this from the extracted deploy folder:

```sh
python3 -m http.server 8080
```

Open **http://localhost:8080/**. A source checkout needs the build below before
serving `dist/`. Opening `index.html` directly through `file://` is unsupported.

To upgrade an existing installation, save a backup, upload the complete release,
close other CircuitBench tabs and open `repair/?release=2.2.0`. Refresh
cached application files, return to the app and confirm the visible version.
Recovery preserves project storage and preferences. The versioned service
worker retains exact asset checks and a canonical application shell for hosts
that modify HTML responses.

Serve `.js` as JavaScript and preferably `.wasm` as `application/wasm`; the
buffered WASM loader also accepts valid generic binary responses. HTTPS or
localhost enables service-worker installation. Detailed host, MIME and recovery
instructions are in [installation and updates](docs/installation.md).

## Local data and offline operation

Autosave belongs to this browser and origin. Imported disk files are not
modified automatically. Download portable backups before clearing browser data
or moving hosts. The application displays **Session only** when durable storage
is unavailable.

This version reads existing schema-1 analog, scalar-digital and bus projects.
It adds display/converter parts, coordinated plans, continuous-window provenance
and analog-study records while retaining earlier truth-table and timing
evidence. Older application versions may reject new parts or omit new evidence
fields; keep the original backup when moving between versions. See
[project format](docs/project-format.md).

For installed offline use, visit over HTTPS or localhost and wait for
**Offline ready**. A downloaded release can also be served from a local web
server without internet access. The earlier v2.0 hosting and browser acceptance is
recorded as passed from the project owner's confirmation. **Help → Check installation**
provides the active installation's asset and engine observations.

## Source checkout

The analog engine is pinned and vendored. There is no npm dependency install.
Use Node.js 20 or newer and Python 3:

```sh
node scripts/build.mjs
node --test tests/*.test.mjs
python3 -m http.server 8080 --directory dist
```

The source ZIP excludes a duplicate `dist/` tree; the build recreates it.
Numerical proof scripts and their evidence are included under `scripts/` and
`evidence/`. Analog reference comparisons use the separately pinned native
ngspice42 development executable; it is not a deployed application dependency.
The [reference setup recipe](docs/reference-environment.md) extracts exact
verified packages into a private directory and records runtime-library
identities. Pass its executable explicitly to `prove-coordinated.mjs`; no
system installation or replacement of the bundled WASM is required.

## Release status and evidence

Version **2.2.0** contains the completed 2.1 workbench and 2.2 instrument
batches. [VALIDATION.md](docs/VALIDATION.md) and [PROGRESS.md](docs/PROGRESS.md)
record current automated, numerical, browser and package evidence. The user's
October 25 hosting/browser acceptance remains scoped to stable 2.0; it is
preserved in the historical records and does not imply a new external upload.

The release's `CircuitBench-2.2.0-release-integrity.json` and
`CircuitBench-2.2.0-SHA256SUMS.txt` identify the exact packaged source and deploy
archives. Upload the complete deploy contents to update the self-hosted app.

## Documentation

- [Digital voltage source and red logic indicators](docs/logic-io.md)

- [User guide](docs/user-guide.md)
- [Seven-segment display](docs/seven-segment-display.md)
- [Multibit converters](docs/multibit-converters.md)
- [Coordinated engine and closed-loop contract](docs/closed-loop-engine.md)
- [Continuous simulation](docs/continuous-simulation.md)
- [Analog parameter studies](docs/analog-experiments.md)
- [Digital and mixed-signal guide](docs/digital-mixed-signal.md)
- [Timing measurements and edge semantics](docs/timing-measurements.md)
- [Installation and updates](docs/installation.md)
- [Supported components and interchange](docs/compatibility.md)
- [Architecture](docs/architecture.md) and [project format](docs/project-format.md)
- [Component models](docs/component-models.md)
- [Analog engine evaluation](docs/engine-evaluation.md)
- [Repeatable native reference environment](docs/reference-environment.md)
- [Validation](docs/VALIDATION.md) and [progress](docs/PROGRESS.md)
- [Roadmap](ROADMAP.md) and [changelog](CHANGELOG.md)
- [Application license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md)
