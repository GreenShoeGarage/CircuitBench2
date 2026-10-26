# Pinned and momentary source controls

CircuitBench v2.1 lets sources remain accessible beside the schematic. Select a digital voltage source, constant logic input, bus input, or DC voltage/current source and choose **Pin beside schematic**. The project remembers the pinned sources and the momentary preference for each one-bit digital source.

The digital voltage source also has a dedicated **Toggle** or **Hold HIGH** button on its schematic symbol. Ordinary selection, movement, rotation and wiring keep their existing meaning. The operation target works in Select mode and is reachable with Tab. Space and Enter operate it. Exported schematic SVGs omit this application control.

## Starting configuration and a retained session

| Readout | Meaning |
| --- | --- |
| Initial | The source setting saved in the circuit. A fresh experiment starts here. |
| Live drive | The last confirmed command in the active continuous session. It is a drive setting, not the resolved net or an analog measurement. |
| Recorded | The drive command belonging to the selected result time, including Cursor A when present. Earlier revisions are identified. |
| Queued | A requested command waiting for its turn or worker acknowledgement. It is not yet reported as a confirmed drive. |
| Awaiting Step or Resume | The paused session accepted the drive command, but has not computed a later circuit state. |

With no continuous session, the binary buttons and editable pinned inputs change the initial setting through the normal undoable project edit. During continuous simulation, the same controls change only the retained solver inputs. They leave the initial source parameters, circuit revision and captured starting circuit unchanged. The existing **Live inputs** dialog and inspector source buttons share the same command queue.

Changing a pin or momentary preference saves drawing preferences without stopping the continuous session or revising the electrical circuit. A circuit edit still stops the session before changing the model.

## Momentary operation

For a Digital voltage source or one-bit Logic input, enable **Momentary: hold HIGH, release LOW** in the inspector. Start continuous simulation, then hold its pinned button or supported schematic operation target. A confirmed press drives HIGH; release returns LOW. The initial project setting stays unchanged even if it was initially HIGH.

Releasing the pointer or key, cancelling the pointer, losing pointer capture, moving focus away from a pinned hold control, leaving the window, hiding the page, changing editor mode, or pressing Escape on the schematic releases the active operation. Stop disposes the retained session and invalidates its controls. An acknowledgement or release from that session cannot control a later session, including a restarted controller object.

The pinned buttons keep their DOM nodes across solver updates, preserving focus and pointer ownership. Keyboard repeat and another simultaneous surface cannot create a second hold on the same source. Commands serialize, so a release that arrives before the HIGH acknowledgement is sent after that HIGH command instead of being dropped.

**A wall-clock hold is not a specified simulation pulse width.** Continuous simulation advances in bounded solver batches. While paused, a press and release may occur at the same simulation time; Step or Resume computes what follows that final drive. To inspect HIGH and LOW separately while paused, use the inspector’s LOW/HIGH buttons and choose Step after each command. Use a timed source for a prescribed pulse duration.

## A first experiment

1. Open **Examples → Switch inputs and see states → Digital voltage source and red logic indicators**.
2. Select DV1 and pin it beside the schematic. Start **Continuous…**.
3. Toggle LOW and HIGH. One indicator shows the source and the other shows the inverter output; HIGH glows red.
4. Pause, set a different drive, and observe the awaiting-response label. Choose Step to compute the change.
5. Enable momentary operation. Hold HIGH and release LOW. Test release outside the control and after changing focus.
6. Set Cursor A to an earlier time. The recorded drive follows that time, while the live drive continues to describe the retained session. **Return to latest** changes only the displayed time.
7. Stop and save a backup. Reopen it: the source settings and drawing preferences return, and the recorded result remains inspectable. Reopening does not resume the private solver state.

## Implementation and validation

`src/live-controls.js` owns source eligibility, input parsing, the session-owned queue, momentary ownership, readout descriptions, stable pinned rendering and delegated interaction handlers. `src/app.js` routes the inspector, pinned controls, schematic operation callbacks and Live inputs dialog through that queue. The controller guards the project identity, revision, session object and session generation at dispatch and acknowledgement.

`project.workbench.pinnedSources` contains at most 32 distinct eligible component IDs. `momentarySources` contains at most 300 distinct scalar DVS/DIN IDs. Project validation removes preferences for components that no longer exist or are no longer eligible. These fields do not replace electrical source parameters.

Focused tests cover a delayed press followed by release, queue order across surfaces, duplicate holds, Stop, replacement and controller-generation changes, bad input rejection, acknowledgement failure, pointer/key cancellation and focus loss. An integration test uses the production continuous controller and coordinated numerical kernel to verify that a paused indicator changes only after a computed step and that momentary operation preserves the initial circuit. Existing source, continuous lifecycle and workbench-state app tests exercise the actual updated app handlers.
