# Release progress

**Current release: 2.2.0 · Runtime build: `53c8eee8280bd405` · October 25, 2026**

The authorized **v2.1 and v2.2 batches are implemented** in one cumulative 2.2.0
release. The accepted stable-2.0 foundation is retained, and its historical
acceptance remains under its own release identity.

**Final release gate status: Completed. Application and numerical gates passed; the accompanying release-integrity receipt records final package tests and exact archive/rebuild verification. Browser-output limits are explicit below.**

## Completed: 2.1 everyday workbench

- Pinned constant logic/bus and independent DC source controls, a dedicated
  digital source operation target, and reliable scalar momentary press/release.
  The workbench separates starting parameters, acknowledged live input state
  and recorded state at the viewed time.
- Compatible pin highlighting during wiring and explicit configured ADC/DAC,
  Slice/Join and decoder/display corrections. Each construction is one atomic
  undoable edit; domain, width and bit-state rules remain enforced.
- Practical indicator, bus-bit probe and working display shortcuts; diagnostics
  that navigate to the affected circuit location; whole-circuit compatibility
  checks before offering an alternative analysis.
- Goal-based example browsing and retained Latest/Cursor A observation context.

The detailed contracts are in [live controls](live-controls.md) and
[guided construction](guided-construction.md).

## Completed: 2.2 instruments and numerical comparisons

- Digital-edge and analog-threshold triggers in the retained coordinated
  session; pre/post-trigger captures, **Run until…** and **Next event**. Actual
  history coverage, command work limits and declared search limits remain
  visible. Same-boundary trigger-state supersession cancels an incomplete
  capture explicitly.
- View-only bus-bit expansion from preserved states/events and linked
  schematic/plot selection guarded by the captured project and revision.
- Rise/fall time, overshoot, finite-window settling, threshold delay,
  transient/AC gain and AC cutoff; digital setup/hold checks with declared
  requirements and explicit incomplete or ambiguous outcomes.
- Reusable measurement configurations and independent numerical evidence that
  remains inspectable after its ordinary source run leaves history.
- Time-step sensitivity studies with 2–4 fresh coordinated transient runs,
  exactly halved maximum steps, one declared scalar measurement and adjacent
  absolute/relative tolerance comparisons. Failed or unavailable trials remain
  part of the record.
- Backups and reports that preserve captures, measurements and studies with
  their original source runs, circuit revisions, selected raw inputs and
  available engine/plan provenance.

See [captures](triggered-capture.md), [linked signals](linked-signals.md),
[measurements](measurements.md), [step studies](step-study.md) and
[project format](project-format.md).

## Maintained foundation and boundaries

The catalog remains **43 parts, 37 model definitions and 41 examples**: 16
analog, 16 digital and 9 mixed. It includes the working seven-segment display,
Hex/BCD decoder, digital voltage source, red-HIGH logic indicators, multibit
converters, analog parameter studies, continuous batches and installation
diagnostics.

Coordinated analog support remains **R/C/L and independent V/I sources**. Its
backward-Euler integration has step-dependent error and damping; the 1 ps event
grid specifies scheduling resolution. Existing nonlinear analog models continue
to use ngspice's supported analyses. This release does not expand the
coordinated device subset.

Captures and saved continuous windows preserve bounded evidence, not resumable
worker state. Setup/hold measurements evaluate event-level constraints rather
than physical metastability. Smaller-step comparisons describe numerical
sensitivity and do not certify accuracy or convergence. Saved-evidence import
recomputes applicable arithmetic and checks consistency without rerunning or
authenticating the original simulation.

## Current verification and package record

| Gate | Final release record |
|---|---|
| Application tests | 868 passed / 0 failed cases across 61 files. |
| Numerical reference checks | 24 passed against analytic, pinned native-ngspice and bundled-WASM references; final source identity: all seven recorded source hashes match this release. |
| Browser and output workflows | 10 focused workflow checks passed; CSV/JSON/backup transfers and restore verified. HTML report download completion was not observed in the managed HTTP preview. |
| Built-package checks | 11 built-package cases plus exact manifest/source/runtime checks; final outcome is recorded in the accompanying release-integrity receipt. |
| Independent archive/rebuild audit | Both frozen archives receive independent CRC/hash checks and an isolated source rebuild compared byte-for-byte with the deploy ZIP; exact outcome and archive identities are in the accompanying release-integrity receipt. |

[VALIDATION.md](VALIDATION.md) links the current
evidence and explains each gate's scope. The exact deliverables are
`CircuitBench-2.2.0-deploy.zip` and `CircuitBench-2.2.0-source.zip`, accompanied
by `CircuitBench-2.2.0-release-integrity.json` and
`CircuitBench-2.2.0-SHA256SUMS.txt`.

The owner's October 25 confirmation that hosting and browser acceptance passed
belongs to **2.0**, as recorded in
[v200-owner-acceptance.json](../evidence/v200-owner-acceptance.json). It does not
establish acceptance or external deployment of 2.2. The earlier
[stable-2.0 progress](history/PROGRESS-2.0.0.md) and
[stable-2.0 validation](history/VALIDATION-2.0.0.md) are preserved unchanged.

## Next investigation

The next development task is the **nonlinear-engine architecture proof**:
compare extension of the coordinated solver with a synchronized ngspice/WASM
interface before choosing the device subset and implementation route. Expanded
continuous nonlinear mixed simulation follows that proof. Reusable subcircuits,
deeper physical models and targeted interchange remain later priorities in
[ROADMAP.md](../ROADMAP.md).
