# Guided construction and navigable diagnostics

CircuitBench v2.1 makes electrical connection rules visible while preserving the same explicit circuit graph used by the simulators. In Wire mode, choose a pin: rings mark destinations that match its electrical domain and digital width. The source has a distinct ring. The existing invalid snap ring remains visible when pointing at an incompatible endpoint. Junctions inherit their connected net's domain and width; an unused junction may receive either domain.

## Explicit connection options

An incompatible click leaves both endpoints intact and offers corrective construction where a supported part can express the requested relationship. A construction dialog shows the settings before inserting any parts.

| Situation | Offered construction | Explicit choices |
| --- | --- | --- |
| Analog signal into an undriven digital input | Scalar ADC or matching multibit ADC | Reference node, voltage range/thresholds, threshold behavior or sampling period and conversion delay |
| Driven digital signal into an analog node | Scalar or matching multibit DAC | Reference node, low/high voltages, finite rise/fall; multibit startup word |
| Different digital widths | Slice or Join | Selected bit range, or A/B ordering and a visible additional word source |
| 4-bit word into an 8-bit seven-segment display | Matching Hex/BCD decoder | Encoding, decimal-point source, matching active level |

Each new connection passes `canConnect`. Slice and Join are genuine bidirectional electrical bit aliases; output bit zero of a Slice is the selected input least-significant bit. A Join puts A in its low bits and B in its high bits. The helper never truncates, extends, broadcasts or replaces X/Z implicitly. Any extra Join bits come from a visible Bus input whose complete word is shown in the dialog.

Converters always have an explicit reference connection, chosen as an existing analog net or a new Ground symbol. A DAC cannot be inserted with its output shorted to its reference. Scalar thresholds must increase; finite edges must be at least 1 ps. Sampled ADC conversion delay must be shorter than its sample period. A multibit DAC startup word must contain known binary bits. Converter numerical model limitations remain those documented in the part library.

## Useful shortcuts

Selecting or focusing a pin makes relevant construction actions available:

- **Attach logic state indicator** places a passive DLED on a scalar digital net. HIGH glows red after a valid result; the indicator adds no driver.
- **Probe a bus bit** asks for the bit number, inserts a one-bit Slice, and attaches a logic probe to the selected bit. Bit zero is the LSB.
- **Place a configured Slice** preserves an explicitly selected range and leaves an output available for further wiring.
- **Join with an explicit word** creates both a Join and the additional Bus input, including its chosen width and states.
- **Place decoder and seven-segment display** connects a 4-bit digit through HEX7 to SEG7 and adds a separate visible decimal-point input. The configured active levels match.
- **Attach seven-segment display** observes an 8-bit segment word directly. A decoder's active-level setting is offered as the display default.
- **Insert ADC/DAC** creates the explicit domain boundary and reference wiring. Standalone placement can leave the converted output available for further wiring.

The complete operation—parts, wires, additional source and probe—is one undoable edit. Invalid configuration is rejected before committing anything or adding an undo entry. Existing project schema limits, parameter checks, and net domain/width validation still apply. The selected operation never quietly repairs other incomplete wiring.

## Diagnostic navigation

Component, pin, physical net, expanded digital-bit net and probe diagnostics can select and center their relevant schematic objects. Unconnected-pin messages focus the exact pin, including when component references share a prefix, such as R1 and R10. Net errors select member components/junctions and the connecting wires. Expanded bit-net errors resolve through Slice/Join aliases back to visible pins. A settings-only diagnostic stays in the analysis panel instead of selecting an unrelated component.

The UI resolves navigation against its current project. Captured run diagnostics must only navigate directly when the working project is the corresponding revision; otherwise inspect the recorded schematic or rerun the current circuit. Snapshot geometry must never be confused with current working identities.

## Whole-circuit analysis compatibility

Coordinated transient supports R, C, L and independent V/I sources in its analog partition, plus supported native digital parts and explicit bridges. Nonlinear analog parts remain available through ngspice, but this does not establish that an entire mixed circuit can use ngspice replay.

Compatibility suggestions compile the complete candidate circuit. An alternative is offered only after its circuit checks, generated plan and, when applicable, coordinated compiler pass without errors. A nonlinear closed-loop mixed circuit therefore cannot receive a misleading “switch to ngspice” action: replay rejects DAC-to-ADC analog influence, while the coordinated partition rejects the nonlinear device. The diagnostic explains the unsupported part and requires an explicit circuit or engine decision.

A valid feed-forward or analog-only circuit may offer ngspice; a supported closed loop may offer Coordinated transient. Selecting an alternative is an explicit analysis edit. Unrelated missing connections, invalid sources or unsupported multibit converters prevent a premature engine recommendation.

## Source operation targets

DVS symbols have a dedicated keyboard-accessible operation button below their body. Selecting, moving, rotating and wiring the source continue to act on the symbol or pins. A click toggles only on release; dragging the operation target cancels a toggle. Momentary operation keeps one owner across live acknowledgements and SVG rerenders. Pointer-up, pointer cancellation, lost capture, key-up, window blur, hidden document and mode changes release or cancel that same owner. Auto-repeat cannot create extra presses. Printed and exported schematics contain the source symbol and initial values, without interactive buttons.

## Integration APIs

`constructionActions(project, endpoint)` and `connectionActions(project, start, end)` return action descriptors containing a title, explanation, request and explicit configuration fields. `constructionFormHTML(action)` renders the shared dialog body; `constructionConfig(form)` reads its fields.

`applyConstruction(project, request)` stages all changes on a clone, validates them, then updates the supplied project atomically. `editor.construct(request)` commits that result as one history entry. The return value includes inserted component IDs, connection IDs, the action label and the output endpoint.

`diagnosticTarget(project, diagnostic)` resolves a navigation target; `editor.navigateDiagnostic(diagnostic)` selects, fits and focuses it. `diagnosticHTML(project, diagnostics)` uses `data-diagnostic-index` attributes corresponding to the supplied array. `analysisCompatibility(project)` returns diagnostics, a supported flag and verified alternative analysis settings.

Editor callbacks `onEndpointFocus(endpoint)` and `onConnectionRejected({ start, end, message, actions })` connect the pin and correction UI. `getSourceOperation(component)` returns `{ enabled, momentary, value, label, pending }`; `onSourceOperation({ id, action, owner })` receives toggle, press, release or cancel. The application owns source/session policy and command acknowledgement; the editor owns gesture identity.

The existing worked-example catalog is unchanged. `EXAMPLE_GOALS` and `exampleGoals(example)` supply goal categories for switching inputs, reading buses/displays, measuring timing, exploring mixed-signal control and understanding analog behavior.
