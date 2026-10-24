# Schematic workbench

The SVG editor reads the same authoritative project used by the electrical checks and netlist generator. Components carry stable pin identifiers. Wires connect endpoint identifiers, and their bends are drawing geometry only. Moving, rotating, or mirroring a connected component recalculates endpoint positions while preserving the original pin connections. Orthogonal pin approaches choose an elbow that avoids crossing either endpoint component's symbol. Deliberate bends remain; a bend that a moved or transformed endpoint symbol would cover is removed as part of the same undoable edit.

## Interaction model

- **Select:** click a part, wire, junction, net label, or annotation. Shift-click extends a selection. Drag empty space for a selection box. Drag selected parts to move on the 20-unit grid. A direct pin click adds a voltage probe.
- **Wire:** click a pin, optionally click bends, and click a destination pin. The visible ring confirms a snapped electrical endpoint. Clicking an existing wire intentionally inserts an explicit junction on that wire. Backspace removes the last provisional bend; Escape discards the provisional wire.
- **Junction:** click a wire or crossing. Only this explicit action joins all wire segments exactly through the inserted dot. A visual crossing without a junction remains electrically separate.
- **Probe:** click a pin, junction, or wire for voltage. Shift-click a second endpoint for the first node minus the second node. Probe identifiers appear on the schematic.
- **Pan:** drag the canvas. The wheel zooms about its pointer position. Fit uses the circuit, wire, and annotation bounds.
- **Label:** click a pin, junction, or wire to give a net a name. Equal labels intentionally join nets electrically.
- **Note:** click to add a drawing annotation. Double-click or keyboard Enter edits a label or annotation.

Selecting a wire and double-clicking it inserts an editable bend. Drag square handles or Tab to a handle and use arrow keys. Delete on a focused handle removes that bend only.

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

`exportSVG(project?)` renders the supplied immutable run snapshot, or the current authoritative project when omitted, with an explicit light palette, whitespace around its extents, and no selection overlays. Its SVG includes local styles and original MIT-licensed symbol paths; it has no remote assets or fonts. The application embeds this in its report output. A report of an older run can therefore reproduce its original circuit even after the current circuit changes.

## Known limits

The editor is a 2D schematic tool, not a PCB layout editor. Routing uses simple orthogonal segments and editable bends, with bounded avoidance of endpoint symbol bodies. It does not optimize the entire circuit or prevent a wire from crossing an unrelated component; edit the bends to resolve such overlaps. Net labels only accept a conservative SPICE-compatible identifier. Keyboard alternatives are available for core operations, while tablet stylus/touch ergonomics require real-device review beyond automated desktop emulation.
