# Release progress

Current candidate: **2.0.0-rc.2**, runtime build **`672a6435dfd88d38`**.
The requested digital voltage source and red-HIGH logic state indicators are
implemented, integrated and verified. Complete deploy/source packages retain
all previously delivered 2.0 capabilities.

| Addition | Delivered behavior |
|---|---|
| Digital voltage source | LOW/HIGH buttons; direct scalar digital output; optional distinct analog +/− terminals with configurable voltage levels and finite edges |
| Red logic indicators | Actual HIGH glows red; LOW, X, Z and no result remain distinct in schematic, inspector and saved-time readback |
| Continuous interaction | Source buttons and the Live inputs selector update the same retained session; input times and original project state survive backup/import |
| Examples | Complementary indicators, real voltage/RC/Schmitt response and simultaneous four-state patterns |

The catalog now has **43 parts, 37 models and 41 examples**: 16 analog,
16 digital and 9 mixed. Seven-segment displays, feedback, converters,
analog studies, buses, timing tools, autosave and deployment recovery remain
available.

## Verification

- **595 application tests across 40 files** pass, with no failures, skips,
  cancellations, TODOs or timeouts.
- **Nine package tests** also pass: **604 total Node cases across 41 files**.
- **19 fresh numerical checks** pass against pinned ngspice WASM, analytic
  expectations and retained-state behavior. The native reference executable
  was unavailable; its older 24-check baseline is preserved explicitly.
- Browser checks verify binary control, actual 5 V and 3.3 V outputs, four
  distinct indicator states, cursor readback, continuous switching and reopening
  a downloaded project. The saved NOT transitions follow each source change
  by 10 ns.
- **101 independent checks** validate three actual browser downloads, their
  seven runs, exact edges, indicator states and all 1,508 RC samples.
- Packaging authenticates the complete versioned runtime, the bundled WASM,
  copied sources, documentation and evidence. Current records and package
  verification are linked from [VALIDATION.md](../VALIDATION.md).

The public host is unchanged. Exact HTTPS/offline/update acceptance, native
print/PDF and full browser/viewport acceptance remain separate gates. Saved
continuous windows preserve evidence and cannot resume a stopped worker.

See [digital sources and indicators](../logic-io.md), [ROADMAP.md](../../ROADMAP.md),
and the preceding [2.0.0-rc.1 progress](../history/PROGRESS-2.0.0-rc.1.md).
