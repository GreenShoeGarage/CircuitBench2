# Schematic workbench

The SVG editor reads the same authoritative project used by the electrical checks and simulation-plan generator. Components carry stable pin identifiers. Wires connect endpoint identifiers, and their bends are drawing geometry only. Moving, rotating, or mirroring a connected component recalculates endpoint positions while preserving the original pin connections. Orthogonal pin approaches choose an elbow that avoids crossing either endpoint component's symbol. Deliberate bends remain; a bend that a moved or transformed endpoint symbol would cover is removed as part of the same undoable edit.

Version 1.2 adds width-aware digital ports and buses to this same workbench. `getPart(type)` supplies static drawer metadata; `getPins(component)` resolves each actual pin's domain, direction and width from the component parameters. Changing a width does not create new pin identifiers or change the number of ports. The project retains endpoint connections; the compiler expands bus bits internally for simulation.

## Interaction model

- **Select:** click a part, wire, junction, net label, or annotation. Shift-click extends a selection. Drag empty space for a selection box. Drag selected parts to move on the 20-unit grid. A direct pin click adds the appropriate voltage, scalar logic or bus measurement.
- **Wire:** click a pin, optionally click bends, and click a destination pin. The visible ring confirms a snapped electrical endpoint. Clicking an existing wire intentionally inserts an explicit junction on that wire. Backspace removes the last provisional bend; Escape discards the provisional wire.
- **Junction:** click a wire or crossing to join compatible segments exactly through the inserted junction. Domain and width checks reject incompatible joins before mutation. A visual crossing without a junction remains electrically separate.
- **Probe:** click a pin, junction, or wire for voltage or a literal logic state/word, according to its domain and width. Shift-click a second analog endpoint for the first node minus the second node. Digital endpoints cannot form a differential voltage measurement. Probe identifiers appear on the schematic.
- **Pan:** drag the canvas. The wheel zooms about its pointer position. Fit uses the circuit, wire, and annotation bounds.
- **Label:** click a pin, junction, or wire to give a net a name. Equal labels intentionally join nets electrically and must agree on domain and width.
- **Note:** click to add a drawing annotation. Double-click or keyboard Enter edits a label or annotation.

Selecting a wire and double-clicking it inserts an editable bend. Drag square handles or Tab to a handle and use arrow keys. Delete on a focused handle removes that bend only.

## Digital ports and buses

Digital words contain 1–8 bits. Printed words are most-significant bit first, with bit 0 at the right. A one-bit signal uses the scalar logic presentation. Wider ports show their `[N-1:0]` range, larger square pin targets and an accessible width description. Bus wires are heavier than scalar wires and show a slash and width marker where a segment is long enough; connected bus junctions are square. A conflicted imported net remains visible for repair and blocks simulation.

`canConnect(project,a,b)` checks both domain and width before a wire, split or crossing junction is committed. An incompatible destination retains the provisional wire and produces an invalid snap cue and status message. Equal-name label joins use the same restrictions. The inspector calls `setComponentParams` to validate width changes against connected wires and label aliases. A rejected edit restores the working project; there is no implicit truncation, padding, scalar broadcasting or analog/digital conversion in a wire.

Slice and Join are explicit, passive bit aliases. Slice output bit `i` refers to input bit `lsb+i`. Join A supplies the low bits and B the high bits, so the displayed result is `B:A`. These aliases preserve released bits and per-bit driver resolution. A Slice with count 1 and a scalar probe is the supported way to view a particular bit; the plot does not invent separate bit probes from a bus name. Analog/digital bridges remain explicit one-bit ADC and DAC parts.

The symbols cover Bus input, timed Pattern, Slice, Join, Register, Counter, Multiplexer, Decoder and Truth table (LUT). Pin placement follows the library rather than rendered label text. Component captions include relevant widths, selected bit ranges or configured words. Net-label text remains a conservative identifier; a label such as a bus name does not declare a width or select a bit.

## Parameter and truth-table integration

The application owns parameter forms and the LUT row editor. Selecting a LUT exposes **Edit truth table…** with 1–4 input bits and 1–8 output bits. The editor shows every binary input row. Rows accept exact-width literal words and known `0b`, `0x` or `0d` numbers, which are normalized before use. Dimension changes retain the lowest-address rows and least-significant output bits, adding zeros as needed. Invalid rows prevent resizing without discarding the draft. **Apply truth table** validates all rows and connected widths before one undoable commit; Cancel leaves the project unchanged. Ordinary parameter edits preserve editable simulation values for diagnostics; autosave success does not imply that circuit preflight has passed.

Malformed or incomplete imported LUT rows open an explicit repair dialog that retains the original saved text. Correcting that text and choosing **Continue to row editor**, or choosing **Reset local draft to zeros**, only prepares local rows. The project changes only after **Apply truth table** in the row editor; Cancel from either dialog preserves the original component.

The experiment-level **Truth table** workflow is separate from editing a LUT. `src/app.js` coordinates it with `src/truth-table-ui.js` and the digital engine. It enumerates 1–8 selected constant input bits, up to 256 independent settled rows and 32 output columns. The selection is by whole Logic input or Bus input component; unselected constants keep their configured values. Clocks, timed patterns, sequential parts and bridges are excluded. Invalid circuit diagnostics or invalid selections block generation. Stop also cancels during execution-plan hash preparation; cancellation is checked before starting the digital worker and before saving a completed record.

Completed table evidence captures the circuit revision, simulation plan and hash, input/output selection, engine identity, settling interval, literal rows and warnings. It does not enter waveform run history or become a transient baseline. The latest four immutable table records are retained separately in autosave and project backups. The table dialog provides CSV and full evidence JSON downloads, a captured-revision notice after edits, and a restored-evidence notice on backup import. Imported evidence is validated rather than recomputed.

## Timing-result presentation

`src/plots.js` renders scalar logic as stepped lanes and buses as word lanes. A bus result carries `kind:'bus'`, `unit:'logic'`, `width` and `bitOrder:'msb-first'`; its values are exact strings of `0`, `1`, `X` and `Z`. Width-one results retain `kind:'logic'`. Bus words keep leading zeros and partial X/Z values in the lane, cursor, Values view and CSV. Narrow intervals omit text that cannot fit, while retaining the transition geometry and full word in the SVG title and readouts. Logic transitions are not decimated.

Logic cursors use the settled state at the selected time, or the preceding event between transitions. They do not interpolate states or use a future event. Mixed view automatically combines analog voltage and logic lanes on one time axis. The original final-pass analog samples remain identifiable; analog values at added event times are linearly interpolated and marked as such. Baseline matching includes signal name, unit, logic kind, bus width and bit order as well as compatible analysis/axis units. Incompatible-width traces are not overlaid.

## Keyboard

The workspace and its components, pins, junctions, wires, annotations, and labels are keyboard reachable. Enter activates a focused pin in Wire, Label, or measurement mode; Tab moves between the actual electrical targets. Arrow keys move selected objects by one grid interval; Shift-arrow uses five intervals. With no selection, or in Pan mode, arrows pan the view. Keyboard commands are scoped to the schematic so ordinary form entry is unaffected.

| Key | Action |
| --- | --- |
| V / W / P / H | Select / Wire / Probe / Pan |
| J / L / N | Junction / Label / Note |
| R / M | Rotate / Mirror selected components |
| F / + / − | Fit / Zoom in / Zoom out |
| Escape | Cancel unfinished interaction and return to Select |
| Delete / Backspace | Delete selection; remove focused wire handle |
| Ctrl/Cmd+C, V, D | Copy, paste, duplicate |
| Ctrl/Cmd+A | Select the complete circuit, including explicit junctions, labels, wires, and annotations |

Selecting a component from the drawer activates placement. Enter places it at the center of the current view. Pointer placement supports repeated parts; Escape returns to Select. The application can also use `connectEndpoints(a,b)`, `moveSelection(dx,dy)`, and `setPosition(id,x,y)` for inspector-based keyboard alternatives.

## Undo, persistence, and export

Every complete edit is submitted through the application's `onChange(mutator,label)` callback. A drag is previewed in a private clone and committed once on release, producing one undo step. Pointer cancellation discards the preview. Clipboard copies retain a private project snapshot; pasting creates new IDs, preserves internal wiring, and resolves component reference conflicts in the target project. External wires are not silently reattached.

`exportSVG(project?)` renders the supplied immutable run snapshot, or the current authoritative project when omitted, with an explicit light palette, whitespace around its extents, and no selection overlays. Its SVG includes bus widths and bit ranges, local styles and original MIT-licensed symbol paths; it has no remote assets or fonts. The application embeds this in its report output. A report of an older run can therefore reproduce its original circuit even after the current circuit changes.

## Known limits

The editor is a 2D schematic tool, not a PCB layout editor. Routing uses simple orthogonal segments and editable bends, with bounded avoidance of endpoint symbol bodies. It does not optimize the entire circuit or prevent a wire from crossing an unrelated component; edit the bends to resolve such overlaps. Net labels only accept a conservative SPICE-compatible identifier. Bus support is bounded to eight bits and fixed-port educational blocks; it is not an HDL or arbitrary-width wiring language. Keyboard alternatives are available for core operations, while tablet stylus/touch ergonomics require real-device review beyond automated desktop emulation. This document describes implementation behavior; browser validation evidence and outstanding checks are recorded separately in [VALIDATION.md](VALIDATION.md).
