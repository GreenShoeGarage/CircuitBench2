# Release progress

Current candidate: **2.0.0-rc.1**, runtime build **`7f06ecaf7e7b40be`**.
All six requested development batches are implemented together in this release.
The source and deploy packages contain the complete application, numerical
engines, documentation and reproducible evidence. Packaging does not update the
external Green Shoe Garage host.

| Requested batch | Delivered behavior | Verification |
|---|---|---|
| Working seven-segment part | SEG7 segment bus, HEX7 hex/BCD decoder, decimal point, active levels, explicit X/Z and cursor-linked schematic/readout | 17 display tests, two worked examples and actual browser counter/cursor/continuous runs |
| Coordinated analog/digital feedback | Stateful R/C/L and independent V/I MNA coupled to the event engine on a shared timeline | 31 engine tests, 14 facade tests and numerical reference comparisons |
| Closed-loop mixed simulation | Scalar Schmitt and sampled multibit feedback through ADC → logic → DAC → the same analog network | Both feedback examples run in Chrome; independent ngspice hysteretic reference |
| Multibit converters | Unsigned 2–8 bit sampled ADC and finite-edge voltage DAC with explicit startup, delay, range and unknown-state rules | Nine independent integration tests plus engine sampling/quantization tests |
| Advanced analog experiments | Linear/log sweeps, seeded Monte Carlo, selected measurements, immutable trial evidence, CSV/JSON/report history | 65 study tests; actual ngspice divider, tolerance and AC sweeps in Chrome |
| Continuous simulation in batches | One retained solver; Pause/Resume/Step, live DC and constant logic inputs, bounded absolute-time history and Stop with saved results | 21 controller, 17 app and nine storage/timing tests; live analog and digital browser workflows |

The catalog contains **41 parts, 35 model records and 38 examples**: 16 analog,
14 digital and eight mixed. Previous buses, LUT/truth tables, timing measurements,
analog models, autosave and deployment recovery remain available.

## Verification status

The integrated application sweep passes **550 tests across 36 directly executed
files**. The built-package gate adds **nine tests**, for **559 tests across 37
files**. Exact commands, counts, timestamps and transcripts are in
[rc200-test-summary.json](../../evidence/rc200-test-summary.json) and [the package gate](../../evidence/rc200-package-tests.json). The numerical proof separately passes **24 checks** against
actual pinned ngspice WASM and native reference runs. Browser-exported evidence
is independently revalidated and compared with divider, AC and discrete RC
expectations; see [VALIDATION.md](VALIDATION-2.0.0-rc.1.md).

The browser demonstrates a working display whose cursor-selected digit differs
from its final digit, a continuous counter held by its live enable input, a
trimmed window retaining its complete input history, and an independent 1 ms
clock-period measurement from that window. Both closed-loop examples produce
mixed waveforms. A live 5 V change in the RC example preserves capacitor charge
through successive batches. Divider sweep and seeded-tolerance records survive
project export/import, and the report preview includes both studies.

The release fixes cancellation during both asynchronous startup hashes, stale
preparation ownership, malformed/missing continuous provenance, migration of
real 1.3 timing backups, converter timing after 1 ps rounding, and unknown DAC
startup words at the compiler boundary. The corresponding regressions pass.

## Numerical and product boundaries

Coordinated transient supports **R/C/L, independent voltage/current sources,
native digital logic and explicit converters**. Its backward-Euler maximum
step is the accuracy control; it is not a general nonlinear SPICE replacement.
The full existing semiconductor library remains available through ngspice.

Pause preserves live numerical state. A stopped or downloaded continuous
window is inspectable evidence and cannot resume that private worker state.
History, input changes, trial counts and execution work are explicitly bounded.
The display is a digital indicator, without LED current or brightness physics.

The candidate still needs final **target-host HTTPS/offline/update acceptance**,
PDF/print and the full supported-browser/viewport matrix. Report preview was
verified; the cloud browser did not produce a downloadable HTML report, so that
output gate remains open. These are recorded acceptance limits, not omitted
feature batches. No external deployment or stable-release certification is
claimed.

See [ROADMAP.md](../../ROADMAP.md), the [user guide](../user-guide.md),
[closed-loop engine](../closed-loop-engine.md), [continuous simulation](../continuous-simulation.md),
[multibit converters](../multibit-converters.md) and [analog experiments](../analog-experiments.md).
The previous [1.3 progress](../history/PROGRESS-1.3.0-rc.1.md) and
[1.3 validation](../history/VALIDATION-1.3.0-rc.1.md) retain their original identities.
