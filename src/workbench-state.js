/** Read-only workbench context. Execution state and the selected evidence are
 * deliberately separate: a completed run cannot make a worker look alive. */
import { escapeHTML as esc } from './storage.js';
import { formatNumber } from './plots.js';

const activeStates = new Set(['starting', 'running', 'pausing', 'paused']);
const resultStates = new Set(['completed', 'completed-with-warnings', 'running', 'paused']);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const timeText = value => formatNumber(value, 's', 8);
const logicText = value => value === '1' ? 'HIGH (1)' : value === '0' ? 'LOW (0)' : 'unavailable';

function sameCircuit(project, run) {
  return !!project && typeof project.id === 'string' && project.id.length > 0 &&
    Number.isInteger(project.revision) && project.revision >= 0 &&
    run?.projectId === project.id && run.revision === project.revision &&
    run.projectSnapshot?.id === project.id && run.projectSnapshot.revision === project.revision;
}

/** Match the display reader's strict time-axis contract. Sampling metadata or
 * the worker's current time never substitutes for a completed retained axis. */
function timeBounds(run) {
  if (run?.analysis?.type !== 'tran' || !resultStates.has(run.status) || !Array.isArray(run.result?.vectors)) return null;
  const axes = run.result.vectors.filter(vector => vector?.name === 'time');
  if (axes.length !== 1) return null;
  const axis = axes[0], values = axis.values;
  if (axis.unit !== 's' || ['logic', 'bus'].includes(axis.kind) || !Array.isArray(values) || !values.length ||
      values.some((value, index) => !finite(value) || value < 0 || index > 0 && value <= values[index - 1])) return null;
  return { start: values[0], end: values.at(-1) };
}

/** Read a drive command, never a resolved net value. A malformed history
 * becomes unavailable rather than silently falling back to the initial HIGH. */
function driveAt(initial, id, history, selectedTime, historyEnd) {
  if (!['0', '1'].includes(initial) || !Array.isArray(history) || history.length > 2000 || !finite(selectedTime) || !finite(historyEnd)) return null;
  let value = initial, time = null, previous = -Infinity;
  for (const change of history) {
    if (!change || !finite(change.time) || change.time < 0 || change.time < previous || change.time > historyEnd ||
        !Array.isArray(change.updates) || !change.updates.length || change.updates.length > 64) return null;
    previous = change.time;
    const updates = change.updates.filter(update => update?.id === id);
    if (updates.length > 1 || updates.some(update => !['0', '1'].includes(update.value))) return null;
    if (change.time <= selectedTime && updates.length) { value = updates[0].value; time = change.time; }
  }
  return { value, time };
}

function sourceContext({ project, run, selectedSource, session, continuousRun, live, runIsCurrent, observation }) {
  if (selectedSource?.type !== 'DVS') return null;
  const source = project?.circuit?.components?.find(component => component.id === selectedSource.id && component.type === 'DVS');
  if (!source) return null;
  const initial = ['0', '1'].includes(source.params?.state) ? source.params.state : null;
  const state = { id: source.id, ref: source.ref, initialValue: initial, initialLabel: `Initial ${logicText(initial)}`, context: 'initial', appliedValue: null, appliedTime: null, appliedLabel: '', note: 'Sets the starting drive. Run to compute its response.' };
  const liveSource = live && sameCircuit(project, continuousRun) && session.plan?.controls?.some(control => control.id === source.id && control.type === 'DVS') &&
    continuousRun.projectSnapshot.circuit?.components?.some(component => component.id === source.id && component.type === 'DVS');
  if (liveSource) {
    const captured = continuousRun.projectSnapshot.circuit.components.find(component => component.id === source.id);
    const applied = driveAt(captured.params?.state, source.id, session.inputChanges, session.time, session.time);
    Object.assign(state, { context: 'live', appliedValue: applied?.value ?? null, appliedTime: applied?.time ?? null,
      appliedLabel: `Live drive ${logicText(applied?.value)}${applied?.time !== null && applied?.time !== undefined ? ` · applied ${timeText(applied.time)}` : ''}`,
      note: session.inputInFlight ? 'Applying a change; the displayed drive is the last confirmed setting.' :
        session.state === 'paused' ? 'Drive setting. Step or Resume computes the response.' : 'Drive setting; indicators show resolved logic at the selected display time.' });
  } else if (runIsCurrent && run?.result?.continuous && observation.time !== null) {
    const captured = run.projectSnapshot.circuit?.components?.find(component => component.id === source.id && component.type === 'DVS');
    const applied = driveAt(captured?.params?.state, source.id, run.result.continuous.inputChanges, observation.time, observation.end);
    Object.assign(state, { context: 'recorded', appliedValue: applied?.value ?? null, appliedTime: applied?.time ?? null,
      appliedLabel: `Recorded drive ${logicText(applied?.value)}${applied?.time !== null && applied?.time !== undefined ? ` · applied ${timeText(applied.time)}` : ''}`,
      note: 'Command recorded at this display time. Indicators use the completed circuit response.' });
  }
  return state;
}

/**
 * Consume app-owned state without changing the circuit, cursor, run or worker.
 * `restored` lets the app mark an autosaved run without changing its schema.
 * `activity` may be 'study', 'truth-table', or 'continuous' during preparation.
 */
export function describeWorkbenchState({ project, run = null, cursorA = null, continuousSession = null, continuousRun = null,
  preparing = false, engineRunning = false, activity = null, selectedSource = null, restored = false } = {}) {
  const session = continuousSession, live = session?.running === true && activeStates.has(session.state);
  const hasResult = resultStates.has(run?.status) && Array.isArray(run?.result?.vectors) && run.result.vectors.some(vector => Array.isArray(vector?.values) && vector.values.length > 0);
  const runIsCurrent = sameCircuit(project, run), bounds = timeBounds(run), hasCursor = cursorA !== null && cursorA !== undefined;
  const selectedTime = bounds ? hasCursor ? cursorA : bounds.end : null;
  const timeAvailable = !!bounds && finite(selectedTime) && selectedTime >= bounds.start && selectedTime <= bounds.end;
  const showingLiveRun = live && !!continuousRun && run?.id === continuousRun.id;
  const detached = ['running', 'paused'].includes(run?.status) && !live && !engineRunning && !preparing;
  const saved = !!restored || run?.importedFromBackup === true || detached || !!run?.result?.continuous && !showingLiveRun;
  const state = { mode: 'editing', label: 'Editing', detail: 'Run an experiment to see the circuit response.', tone: 'neutral', live,
    runIsCurrent, hasResult, showingLiveRun, returnToLatest: !!bounds && hasCursor,
    observation: { mode: 'none', label: 'No result', detail: '', time: null, start: bounds?.start ?? null, end: bounds?.end ?? null, currentCircuit: runIsCurrent }, source: null };

  if (live) {
    state.mode = session.state === 'paused' ? 'paused' : 'running';
    state.label = { starting: 'Starting', running: 'Running', pausing: 'Pausing', paused: 'Paused' }[session.state];
    state.tone = session.state === 'paused' ? 'paused' : 'active';
    state.detail = session.inputInFlight ? 'Applying a live input change; waiting for confirmation.' :
      session.state === 'starting' ? 'Starting continuous simulation; waiting for the first completed window.' :
      session.state === 'pausing' ? 'Finishing the active update before pausing.' :
      session.state === 'paused' && session.inFlight ? 'Advancing one step; the session remains paused afterward.' :
      session.state === 'paused' ? 'Circuit state is retained. Step or Resume continues this session.' : 'Continuous simulation retains circuit state across updates.';
    if (!sameCircuit(project, continuousRun)) state.detail += ' The running session belongs to another circuit revision.';
  } else if (preparing || engineRunning) {
    state.mode = 'running'; state.label = 'Running'; state.tone = 'active';
    state.detail = preparing ? { study: 'Preparing an analog study.', 'truth-table': 'Preparing a truth-table experiment.', continuous: 'Preparing continuous simulation.' }[activity] ?? 'Preparing the experiment.' :
      activity === 'study' ? 'An analog study is running from its captured circuit.' : activity === 'truth-table' ? 'A truth-table experiment is running from its captured circuit.' : 'The experiment is running from its captured circuit.';
  } else if (hasResult) {
    state.mode = saved || !runIsCurrent ? 'saved' : 'completed';
    state.label = state.mode === 'saved' ? 'Showing saved result' : 'Results ready';
    state.detail = !runIsCurrent ? 'This result belongs to another project or revision. Run the current circuit to update its indicators.' :
      run.result.continuous ? 'This completed window is inspectable. Start a new continuous session to run again.' :
      detached ? 'Retained results are inspectable. No active worker owns this recorded run; start a new experiment to continue.' :
      saved ? 'Recorded evidence; run the experiment to compute a fresh result.' : 'The selected experiment is complete. No simulation is running.';
    state.tone = runIsCurrent ? 'complete' : 'warning';
  } else if (['failed', 'cancelled', 'timed-out'].includes(run?.status)) {
    state.detail = run.status === 'failed' || run.status === 'timed-out' ? 'The last experiment did not produce a completed result. Review its diagnostics.' : 'The experiment was stopped before a completed result was available.';
    state.tone = run.status === 'cancelled' ? 'neutral' : 'warning';
  }

  const observation = state.observation;
  if (bounds) {
    observation.mode = hasCursor ? timeAvailable ? 'cursor' : 'outside' : 'latest';
    observation.time = timeAvailable ? selectedTime : null;
    observation.label = hasCursor ? finite(cursorA) ? `Cursor A · ${timeText(cursorA)}` : 'Cursor A · unavailable' : `Latest · ${timeText(bounds.end)}`;
    observation.detail = !timeAvailable ? `Outside retained time ${timeText(bounds.start)}–${timeText(bounds.end)}. Indicators have no observation.` :
      !runIsCurrent ? 'Historical result time; current schematic indicators remain neutral.' :
      showingLiveRun && hasCursor ? session.state === 'paused' ? 'Showing the selected time; the continuous session is paused.' : 'Showing the selected time while the session continues.' :
      showingLiveRun ? 'Latest completed window; an in-progress update is not displayed.' : 'Time in the selected completed result.';
    if (live && !showingLiveRun) observation.detail += ' A separate continuous run is active.';
  } else if (hasResult && run?.analysis?.type !== 'tran') {
    observation.mode = 'analysis'; observation.label = { op: 'Operating point', ac: 'Frequency response', dc: 'Input sweep' }[run.analysis?.type] ?? 'Selected result';
    observation.detail = runIsCurrent ? 'Values belong to the selected experiment.' : 'Historical result; the working circuit has changed.';
  } else if (hasResult) {
    observation.label = 'Retained time unavailable'; observation.detail = 'A valid time axis is required to identify the displayed interval.';
  } else if (live || engineRunning || preparing) {
    observation.label = 'Awaiting completed result'; observation.detail = 'Indicators remain neutral until an eligible result is available.';
  }
  state.source = sourceContext({ project, run, selectedSource, session, continuousRun, live, runIsCurrent, observation });
  return state;
}

/** Compact semantic markup for a persistent strip. Parent owns layout/theme. */
export function workbenchStateHTML(state) {
  const observation = state.observation, source = state.source;
  return `<div class="workbench-state" role="group" aria-label="Simulation state and result time" data-workbench-mode="${esc(state.mode)}" data-tone="${esc(state.tone)}"><div class="workbench-state-summary"><strong class="workbench-state-label">${esc(state.label)}</strong><span class="workbench-state-detail">${esc(state.detail)}</span></div><div class="workbench-observation" data-observation="${esc(observation.mode)}"><span class="workbench-time"${observation.time !== null ? ` title="${esc(observation.time)} seconds"` : ''}>${esc(observation.label)}</span><span class="workbench-observation-detail">${esc(observation.detail)}</span>${state.returnToLatest ? '<button type="button" data-workbench-latest aria-label="Return displays to the latest retained time">Return to latest</button>' : ''}</div>${source ? `<div class="workbench-source" data-source-context="${esc(source.context)}"><strong>${esc(source.ref)}</strong><span>${esc(source.initialLabel)}</span>${source.appliedLabel ? `<span>${esc(source.appliedLabel)}</span>` : ''}<small>${esc(source.note)}</small></div>` : ''}</div>`;
}

/** Bind only the explicit view action. No project or simulation mutation. */
export function bindWorkbenchState(container, { onReturnToLatest = () => {} } = {}) {
  const button = container?.querySelector?.('[data-workbench-latest]');
  if (!button) return () => {};
  const listener = () => onReturnToLatest();
  button.addEventListener('click', listener);
  return () => button.removeEventListener('click', listener);
}
