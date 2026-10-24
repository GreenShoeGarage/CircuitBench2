# CircuitBench roadmap

## Finish the current release

Promote the release candidate only after the full RC-filter workflow, electrical
editing/persistence, numerical acceptance, failure/cancellation, portable
outputs, browser accessibility/layout and offline/subdirectory deployment gates
are verified. Resolve blockers before adding capabilities. Preserve the exact
tested source and runtime hashes in the packaged release.

## v1.x: strengthen the analog workbench

- Refine wiring ergonomics and touch interaction from real maker/engineer use.
- Expand numerical regression fixtures before expanding model coverage.
- Add selected, redistributable manufacturer models with verified pin mappings,
  model versions, provenance and clear operating limits.
- Improve model-aware measurement selection, plotting accessibility and
  comparison workflows where they reduce effort in common experiments.
- Add documented project-schema migrations when a genuine format change needs
  them; retain portable backups and explicit recovery.
- Maintain browser compatibility, offline update reliability and dependency
  notices without adding cloud requirements to the core.

## Later, as separately scoped capabilities

- More advanced analog analyses, parameter sweeps and uncertainty/tolerance
  studies, each with reference tests and clear numerical assumptions.
- Digital logic, mixed-signal systems, microcontroller/HDL simulation.
- PCB/layout exchange and richer import formats, with explicit distinction
  between connectivity import and reconstructing drawing/layout information.
- Classroom administration, collaborative editing and optional assistance.
- Continuous simulation with preserved state only after its state transitions,
  timing, cancellation and correctness can be independently validated.

Future features should extend the existing experiment workflow before adding
new screens, modes or infrastructure. No schedule or automatic implementation
commitment is implied by this list.
