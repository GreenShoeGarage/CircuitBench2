# Bus expansion and linked signal selection

## Inspecting a bus

Each bus in the Signals list has an explicit **Expand bits** control. Expanding keeps the original word lane and adds scalar lanes from most significant bit down to bit zero. **Collapse bits** returns to the word lane. Individual lanes retain the existing visibility checkboxes. Each derived lane is identified as a bit of its parent word; X and Z remain distinct states.

Expansion is a view of preserved data. No Slice component is inserted, no simulation is rerun, and no vectors are written into the saved run. Raw CSV and backup exports retain their original bus words, width and MSB-first metadata. The exported waveform SVG includes whichever word and bit lanes the user chose to display.

When a saved bus event history is available, derived bit lanes use those exact event times, including changes between sampled rows. Only events that leave that individual bit unchanged are omitted. The final state is held to the recorded end time, and a zoomed view begins with the known predecessor state. For a valid recorded bus with only values on its time axis, bits derive directly from those preserved words.

Bit cursors use right-continuous logic: a cursor at an event reports the settled state after that event. Expanded baseline lanes use the baseline's own times. A different width, bit ordering or signal type prevents an incompatible overlay.

## Linking a waveform to the schematic

Use **Locate** in the Signals list, select a timing-lane label with Enter/Space, or click an actual waveform stroke. The selected trace is emphasized and its corresponding schematic pins, wires and components can be highlighted and centered. Selecting a schematic pin can select its recorded voltage, logic or bus signal in the other direction. This is a view operation and creates no circuit-history entry.

Links resolve from the captured probe IDs, component IDs, net identities and explicit bit aliases. They do not guess from a display label. A derived bus bit can highlight the parent bus and the corresponding Slice/Join aliases. A current measurement identifies its component; a differential voltage identifies both endpoint nets.

The recorded project ID and revision must match the working schematic, including the captured snapshot. Viewing an older run does not replace the working project, select unrelated current pins, or relabel old evidence as current. The older waveform remains available, and the UI explains that a new run is needed to link current working pins.

## Integration

`PlotView.expandBus(id, expanded)` controls bit expansion. `displayTraces()` returns the raw and currently expanded view traces; `getRunTraces(run)` remains the raw trace catalog. `selectTrace(id, { notify })` selects a trace without moving the cursors or range. `onTraceSelect({ trace, run })` reports the selected recorded identity.

`traceSchematicTarget(run, trace, workingProject)` returns `{ ok, target }` or `{ ok: false, reason }`. A target contains component/wire IDs, endpoints and a label. `editor.selectSignal(target, { focus })` highlights it without a project mutation or a reverse `onEndpointFocus` callback, avoiding selection loops.

`plot.selectEndpoint(endpoint, { project, bit, notify: false })` performs the reverse lookup. The optional bit explicitly selects and expands a bus bit. By default, it chooses a voltage/logic signal before an incidental branch current. A mismatched historical revision returns an explanation and preserves the current plot selection.

`derivedBusBitTraces(run, trace)` and `logicTraceData(trace, axisValues)` expose the pure derivation used by plots. A same-session continuous batch keeps expansion; a different recorded run resets it. The expansion state does not enter the project or run schema.
