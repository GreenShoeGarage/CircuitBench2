# CircuitBench

**Version 2.0.0-rc.1 — analog, digital and coordinated mixed-signal release candidate.**

CircuitBench is Green Shoe Garage's self-hosted electronics workbench. Draw a
circuit, configure an experiment, run it, measure the response, compare a
baseline and save the evidence. It is a static browser application with local
simulation and storage. No account, cloud API, telemetry or native runtime
installation is required for the deployed application.

This candidate implements all six requested batches: a working seven-segment
display, coordinated analog/digital feedback, closed-loop execution, multibit
converters, advanced analog experiments and stateful continuous simulation.
The library contains **41 parts, 35 model definitions and 38 examples**:
16 analog, 14 digital and 8 mixed-signal examples. External-host acceptance
remains a release gate; see [validation](docs/VALIDATION.md).

## New in 2.0

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

## Try the new workflows

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
pauses. Live controls include scalar `DIN`, `BUSIN` words and independent **DC**
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

## Install the prebuilt 2.0 release

Extract **CircuitBench-2.0.0-rc.1-deploy.zip** and upload the complete contents to
the application's directory. Preserve `assets/`, `repair/`, manifests and root
files. Executable assets are under `assets/2.0.0-rc.1/`; this includes the
complete `engine/` folder and its WASM binary. Every worker and engine asset
must be present.

For a local server, run this from the extracted deploy folder:

```sh
python3 -m http.server 8080
```

Open **http://localhost:8080/**. A source checkout needs the build below before
serving `dist/`. Opening `index.html` directly through `file://` is unsupported.

To upgrade an existing installation, save a backup, upload the complete release,
close other CircuitBench tabs and open `repair/?release=2.0.0-rc.1`. Refresh
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
server without internet access. Fresh installation, offline reload and upgrade
acceptance must still be verified on the exact external target build.

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
ngspice development executable; it is not a deployed application dependency.

## Release status and evidence

Version 2.0.0-rc.1 remains a release candidate. Current numerical results,
worker checks, browser observations, test totals and remaining acceptance gates
are recorded in [VALIDATION.md](docs/VALIDATION.md) and
[PROGRESS.md](docs/PROGRESS.md). Historical observations retain their original
build identities. Feature completion does not establish external-host
deployment or successful HTTPS/offline acceptance.

The release's `CircuitBench-2.0.0-rc.1-release-integrity.json` and
`CircuitBench-2.0.0-rc.1-SHA256SUMS.txt` identify the exact packaged source and
deploy archives. Uploading those deploy contents is a separate host operation.

## Documentation

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
- [Validation](docs/VALIDATION.md) and [progress](docs/PROGRESS.md)
- [Roadmap](ROADMAP.md) and [changelog](CHANGELOG.md)
- [Application license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md)
