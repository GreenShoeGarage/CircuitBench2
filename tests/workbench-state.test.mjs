import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, addComponent } from '../src/model.js';
import { describeWorkbenchState, workbenchStateHTML, bindWorkbenchState } from '../src/workbench-state.js';

function fixture() {
  const project = newProject('State clarity');
  project.analysis.type = 'tran'; project.analysis.solver = 'coordinated';
  const source = addComponent(project, 'DVS', 100, 100); source.params.state = '1';
  const run = { id: 'r-current', projectId: project.id, revision: project.revision, projectSnapshot: structuredClone(project),
    analysis: structuredClone(project.analysis), status: 'completed', result: { vectors: [
      { name: 'time', unit: 's', values: [0.001, 0.002, 0.003] },
      { name: 'd(input)', kind: 'logic', unit: 'logic', values: ['1', '0', '1'] }
    ] } };
  return { project, source, run };
}
function active(f, state = 'running') {
  const run = structuredClone(f.run); run.status = 'running';
  run.result.continuous = { inputChanges: [], windowStart: 0.001, currentTime: 0.003 };
  const session = { running: true, state, time: 0.003, inputChanges: [], plan: { controls: [{ id: f.source.id, type: 'DVS' }] } };
  return { run, session, options: { project: f.project, run, continuousSession: session, continuousRun: run, selectedSource: f.source } };
}

test('an unrun circuit says Editing and does not invent an observed LOW or running worker', () => {
  const f = fixture(), state = describeWorkbenchState({ project: f.project, selectedSource: f.source });
  assert.equal(state.label, 'Editing'); assert.equal(state.live, false);
  assert.equal(state.observation.label, 'No result'); assert.equal(state.observation.time, null);
  assert.equal(state.source.initialLabel, 'Initial HIGH (1)'); assert.equal(state.source.context, 'initial');
  assert.equal(state.returnToLatest, false);
});

test('a completed current run is Results ready and uses its actual last retained time', () => {
  const f = fixture(); f.run.result.sampling = { windowEnd: 9000 };
  const state = describeWorkbenchState({ project: f.project, run: f.run });
  assert.equal(state.label, 'Results ready'); assert.equal(state.live, false);
  assert.match(state.detail, /No simulation is running/);
  assert.equal(state.observation.time, 0.003); assert.equal(state.observation.label, 'Latest · 3 ms');
});

test('imported and autosave-restored results are identified without rerunning or mutating evidence', () => {
  const f = fixture(), before = structuredClone(f.run);
  assert.equal(describeWorkbenchState({ project: f.project, run: f.run, restored: true }).label, 'Showing saved result');
  assert.deepEqual(f.run, before);
  f.run.importedFromBackup = true;
  const state = describeWorkbenchState({ project: f.project, run: f.run });
  assert.equal(state.label, 'Showing saved result'); assert.match(state.detail, /Recorded evidence/);
  assert.equal(state.live, false);
});

test('old revision results keep their plot time while warning that current indicators are neutral', () => {
  const f = fixture(); f.project.revision++;
  const state = describeWorkbenchState({ project: f.project, run: f.run, cursorA: 0.002 });
  assert.equal(state.mode, 'saved'); assert.equal(state.runIsCurrent, false);
  assert.equal(state.observation.time, 0.002); assert.match(state.detail, /another project or revision/);
  assert.match(state.observation.detail, /current schematic indicators remain neutral/);
});

test('both run header and captured snapshot identity must match the current circuit', () => {
  for (const mismatch of ['run-project', 'run-revision', 'snapshot-project', 'snapshot-revision']) {
    const f = fixture();
    if (mismatch === 'run-project') f.run.projectId = 'another';
    if (mismatch === 'run-revision') f.run.revision++;
    if (mismatch === 'snapshot-project') f.run.projectSnapshot.id = 'another';
    if (mismatch === 'snapshot-revision') f.run.projectSnapshot.revision++;
    assert.equal(describeWorkbenchState({ project: f.project, run: f.run }).runIsCurrent, false, mismatch);
  }
});

test('Cursor A is exact, includes retained endpoints, and offers an explicit return action', () => {
  const f = fixture();
  for (const time of [0.001, 0.001481650892211237, 0.003]) {
    const state = describeWorkbenchState({ project: f.project, run: f.run, cursorA: time });
    assert.equal(state.observation.mode, 'cursor'); assert.equal(state.observation.time, time);
    assert.equal(state.returnToLatest, true);
    assert.ok(workbenchStateHTML(state).includes(`title="${time} seconds"`));
  }
});

test('a cursor outside the rolling window has no display observation and can return to latest', () => {
  const f = fixture();
  for (const time of [0, 0.003000001, NaN, Infinity, '0.002']) {
    const state = describeWorkbenchState({ project: f.project, run: f.run, cursorA: time });
    assert.equal(state.observation.mode, 'outside'); assert.equal(state.observation.time, null);
    assert.match(state.observation.detail, /Outside retained time/); assert.equal(state.returnToLatest, true);
  }
});

test('malformed axes cannot claim a retained display time from other metadata', () => {
  for (const malformed of ['empty', 'descending', 'duplicate', 'nonfinite', 'wrong-unit', 'logic', 'two-axes']) {
    const f = fixture(), axis = f.run.result.vectors[0];
    if (malformed === 'empty') axis.values = [];
    if (malformed === 'descending') axis.values = [0.003, 0.002];
    if (malformed === 'duplicate') axis.values = [0.001, 0.001];
    if (malformed === 'nonfinite') axis.values = [0.001, NaN];
    if (malformed === 'wrong-unit') axis.unit = 'V';
    if (malformed === 'logic') axis.kind = 'logic';
    if (malformed === 'two-axes') f.run.result.vectors.push(structuredClone(axis));
    f.run.result.continuous = { currentTime: 100, inputChanges: [] };
    const state = describeWorkbenchState({ project: f.project, run: f.run, cursorA: 0.002 });
    assert.equal(state.observation.time, null, malformed); assert.equal(state.returnToLatest, false, malformed);
  }
});

test('the live session lifecycle is distinct from the latest completed evidence', () => {
  const f = fixture();
  for (const [sessionState, label] of [['starting', 'Starting'], ['running', 'Running'], ['pausing', 'Pausing'], ['paused', 'Paused']]) {
    const a = active(f, sessionState), state = describeWorkbenchState(a.options);
    assert.equal(state.label, label); assert.equal(state.live, true);
    assert.equal(state.observation.time, 0.003); assert.equal(state.showingLiveRun, true);
    if (sessionState === 'pausing') assert.match(state.detail, /Finishing the active update/);
    if (sessionState === 'paused') assert.match(state.detail, /Step or Resume/);
  }
});

test('starting before a first result and preparing without a session never invent time zero evidence', () => {
  const f = fixture(), a = active(f, 'starting'); a.run.result = null;
  let state = describeWorkbenchState(a.options);
  assert.equal(state.observation.label, 'Awaiting completed result'); assert.equal(state.observation.time, null);
  state = describeWorkbenchState({ project: f.project, preparing: true, activity: 'continuous' });
  assert.equal(state.label, 'Running'); assert.equal(state.live, false);
  assert.equal(state.detail, 'Preparing continuous simulation.'); assert.equal(state.observation.time, null);
});

test('an active session can run while the user views a different completed result', () => {
  const f = fixture(), a = active(f); a.run.id = 'r-live';
  const state = describeWorkbenchState({ ...a.options, run: f.run, cursorA: 0.002 });
  assert.equal(state.label, 'Running'); assert.equal(state.showingLiveRun, false);
  assert.equal(state.observation.time, 0.002); assert.match(state.observation.detail, /separate continuous run is active/);
  assert.equal(state.source.context, 'live');
});

test('a historical cursor remains clearly historical when the retained session is paused', () => {
  const f = fixture(), a = active(f, 'paused'), state = describeWorkbenchState({ ...a.options, cursorA: 0.001 });
  assert.equal(state.label, 'Paused'); assert.equal(state.observation.mode, 'cursor');
  assert.match(state.observation.detail, /session is paused/);
  assert.doesNotMatch(state.observation.detail, /session continues/);
});

test('in-flight pause-step and input changes do not claim completed future state', () => {
  const f = fixture(), a = active(f, 'paused'); a.session.inFlight = Promise.resolve();
  let state = describeWorkbenchState(a.options);
  assert.match(state.detail, /Advancing one step/); assert.equal(state.observation.time, 0.003);
  a.session.inputInFlight = {};
  state = describeWorkbenchState(a.options);
  assert.match(state.detail, /waiting for confirmation/); assert.match(state.source.note, /last confirmed setting/);
  assert.equal(state.source.appliedValue, '1');
});

test('the source initial setting and confirmed live command remain separate from historical display time', () => {
  const f = fixture(), a = active(f, 'paused');
  a.session.inputChanges = [{ time: 0.0025, updates: [{ id: f.source.id, value: '0' }] }];
  const state = describeWorkbenchState({ ...a.options, cursorA: 0.0015 });
  assert.equal(state.source.initialValue, '1'); assert.equal(state.source.appliedValue, '0');
  assert.equal(state.source.appliedTime, 0.0025); assert.equal(state.observation.time, 0.0015);
  assert.match(state.source.note, /Step or Resume/); assert.equal(f.source.params.state, '1');
});

test('stopped and snapshot continuous windows are inspectable without promising solver resume', () => {
  for (const sessionStatus of ['stopped', 'snapshot', 'failed-after-window']) {
    const f = fixture(); f.run.result.continuous = { sessionStatus, inputChanges: [{ time: 0.002, updates: [{ id: f.source.id, value: '0' }] }] };
    const state = describeWorkbenchState({ project: f.project, run: f.run, selectedSource: f.source });
    assert.equal(state.label, 'Showing saved result'); assert.equal(state.live, false);
    assert.match(state.detail, /Start a new continuous session/); assert.doesNotMatch(state.detail, /Resume/);
    assert.equal(state.source.context, 'recorded'); assert.equal(state.source.appliedValue, '0');
  }
});

test('recorded drive readback is right-continuous and never looks ahead of Cursor A', () => {
  const f = fixture(); f.run.result.continuous = { inputChanges: [
    { time: 0.002, updates: [{ id: f.source.id, value: '0' }] },
    { time: 0.0025, updates: [{ id: f.source.id, value: '1' }] }
  ] };
  for (const [time, value] of [[0.0015, '1'], [0.002, '0'], [0.0024, '0'], [0.0025, '1']]) {
    const state = describeWorkbenchState({ project: f.project, run: f.run, selectedSource: f.source, cursorA: time });
    assert.equal(state.source.appliedValue, value);
  }
});

test('malformed or future input records show an unavailable command instead of guessing HIGH', () => {
  for (const invalid of [
    [{ time: 0.002, updates: [{ id: 'SOURCE', value: 'X' }] }],
    [{ time: 0.004, updates: [{ id: 'SOURCE', value: '0' }] }],
    [{ time: 0.002, updates: [{ id: 'SOURCE', value: '0' }, { id: 'SOURCE', value: '1' }] }],
    [{ time: 0.0025, updates: [{ id: 'SOURCE', value: '0' }] }, { time: 0.002, updates: [{ id: 'SOURCE', value: '1' }] }]
  ]) {
    const f = fixture(), a = active(f, 'paused');
    a.session.inputChanges = invalid.map(change => ({ ...change, updates: change.updates.map(update => ({ ...update, id: f.source.id })) }));
    const state = describeWorkbenchState(a.options);
    assert.equal(state.source.appliedValue, null); assert.match(state.source.appliedLabel, /unavailable/);
  }
});

test('a different active circuit cannot supply the selected source live state', () => {
  const f = fixture(), a = active(f); a.run.projectSnapshot.id = 'other-project';
  const state = describeWorkbenchState(a.options);
  assert.equal(state.source.context, 'initial'); assert.match(state.detail, /another circuit revision/);
});

test('worker liveness is never inferred from saved run status or inconsistent session metadata', () => {
  const f = fixture(); f.run.status = 'running';
  const detached = describeWorkbenchState({ project: f.project, run: f.run });
  assert.equal(detached.live, false); assert.equal(detached.label, 'Showing saved result');
  assert.match(detached.detail, /No active worker/);
  const a = active(f, 'stopped');
  const state = describeWorkbenchState(a.options);
  assert.equal(state.live, false); assert.equal(state.label, 'Showing saved result');
});

test('bounded experiments and analog analyses have useful states without fictitious time observations', () => {
  const f = fixture(); f.run.analysis.type = 'ac';
  f.run.result.vectors = [{ name: 'frequency', unit: 'Hz', values: [1, 10, 100] }];
  let state = describeWorkbenchState({ project: f.project, run: f.run });
  assert.equal(state.observation.label, 'Frequency response'); assert.equal(state.observation.time, null);
  state = describeWorkbenchState({ project: f.project, run: f.run, engineRunning: true, activity: 'study' });
  assert.equal(state.label, 'Running'); assert.equal(state.live, false); assert.match(state.detail, /analog study is running/);
});

test('failed, timed-out and cancelled experiments do not present successful completed evidence', () => {
  for (const status of ['failed', 'timed-out', 'cancelled']) {
    const f = fixture(); f.run.status = status;
    const state = describeWorkbenchState({ project: f.project, run: f.run });
    assert.equal(state.hasResult, false); assert.equal(state.observation.time, null); assert.equal(state.label, 'Editing');
    assert.match(state.detail, status === 'cancelled' ? /stopped/ : /diagnostics/);
  }
});

test('markup escapes user text and offers a native keyboard-operable latest-time button', () => {
  const f = fixture(); f.source.ref = '<img src=x onerror=alert(1)>';
  const html = workbenchStateHTML(describeWorkbenchState({ project: f.project, run: f.run, selectedSource: f.source, cursorA: 0.002 }));
  assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img'));
  assert.match(html, /<button type="button" data-workbench-latest aria-label="Return displays to the latest retained time">Return to latest<\/button>/);
});

test('latest-time binding delegates one explicit view action and cleanup removes it', () => {
  const listeners = new Map(), button = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } };
  let calls = 0;
  const cleanup = bindWorkbenchState({ querySelector: selector => selector === '[data-workbench-latest]' ? button : null }, { onReturnToLatest: () => { calls++; } });
  assert.equal(calls, 0); listeners.get('click')(); assert.equal(calls, 1);
  cleanup(); assert.equal(listeners.size, 0);
  assert.doesNotThrow(() => bindWorkbenchState(null)());
});
