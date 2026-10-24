# Third-party notices and model provenance

## Original CircuitBench work

CircuitBench's application modules, editor symbols, report design and educational
generic parameter sets are MIT-licensed; see `LICENSE`. The release does not
copy DesignSoft TINACloud's code, symbols, branding or commercial model library.
TINACloud was a functional reference only. CircuitBench is an independent
application and makes no affiliation claim.

## Numerical runtime

| Material | Exact identity | License / retained evidence |
|---|---|---|
| EEcircuit-engine | 1.8.0; gitHead `f4dab6458d3865a1db9766008480690d23410c3a` | MIT; `engine/LICENSE-EEcircuit.txt` |
| ngspice WASM | 45.2; build September 5, 2026; SHA-256 `ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4` | Mixed upstream notices; full `engine/COPYING-ngspice-45.2.txt` |
| Emscripten runtime material | Upstream compiler/runtime notices accompanying the WASM integration | `engine/LICENSE-Emscripten.txt` |
| ngspice source | Tag `ngspice-45.2`, tag ref `724dc77b9153dc75eaec474b1f7a44f1fcf5f362` | `engine/source/ngspice-45.2-source.tar.gz`, included notices |
| Upstream integration/build source | Selected files from the EEcircuit-engine package's exact gitHead | `engine/source/eecircuit-engine-1.8.0/` and source manifest |

In the source package, the corresponding paths begin with `public/engine/`.
Keep the license and source materials when redistributing the prebuilt release.

ngspice is **not exclusively BSD**. Its COPYING document identifies Modified BSD,
LGPL portions including numparam and KLU, sparse-code notices and other source
licenses. The included upstream license document is authoritative. The build
recipe disables XSPICE and OSDI and removes HICUM2 as documented by upstream.
The application places no restriction on replacing/modifying the runtime or
reverse engineering it to debug such modifications.

The upstream ESM bundle was adapted deterministically: two duplicate base64
WASM copies become one unchanged local binary; all implicit PDK preloads are
removed; binary header offsets use byte positions so Unicode titles are safe;
payload lengths are checked; parser failures propagate; diagnostics are bounded.
No numerical algorithm was changed. `scripts/vendor-engine.py`, the readable
`scripts/vendor-raw-parser.js` patch and `engine/manifest.json`
record the extraction and hashes. Upstream's moving Emscripten recipe does not
establish a byte-identical C-source rebuild; see the architecture decision for
this explicit reproducibility limit.

## Model cards

All curated runtime semiconductor cards are original CircuitBench educational
sets, version `cb-models-1.0.0`, under MIT:

`CB_DIODE`, `CB_LED`, `CB_NPN`, `CB_PNP`, `CB_NMOS`, `CB_PMOS`, `CB_SWITCH`,
`CB_OPAMP`.

The complete definitions, parameter descriptions, limitations and example
fixture bindings are in `src/library.js`. Generated decks include the required
model declarations. Each run records model definitions, source, version,
permission and a content hash when cryptographic hashing is available.

No manufacturer characterization or device approval is implied. Original
upstream source archives can contain their own examples/model files under
included upstream notices; those are source materials and are never implicitly
loaded into CircuitBench's runtime library. User-imported numeric model cards
are marked user-supplied; the importer is responsible for any redistribution
permission applicable to that content.

## Development reference

Native ngspice 42+ds-3build1 is used for validation, with executable SHA-256
`820658317b0b54035208da41936fd6871ce924036e5ea4113a4168b821b7fc45`. That system
binary is not part of the deployable application. Its differing version from
the WASM runtime is recorded with the numerical comparison evidence.
