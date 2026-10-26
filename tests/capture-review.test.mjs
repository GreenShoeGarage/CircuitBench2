import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoordinatedSession } from '../src/coordinated.js';
import { ContinuousSimulation } from '../src/continuous.js';
import { createCaptureRecord, validateCaptureRecords, captureCoverage } from '../src/capture.js';
import { captureStatusHTML } from '../src/capture-ui.js';

const plan = () => ({ kind: 'coordinated-transient', version: 1, duration: .01, maxStep: 1e-6, analog: { nodes: [], elements: [], uic: true }, digital: { sources: [{ id: 'drive', output: 'in', kind: 'constant', value: '0' }, { id: 'aux', output: 'other', kind: 'constant', value: '0' }], gates: [], sequential: [], buses: [], probes: [], inputGroups: [], hiddenNodes: [] }, adcs: [], dacs: [], controls: [{ id: 'source', type: 'DVS', width: 1, sources: ['drive'], unit: 'logic' }, { id: 'other', type: 'DVS', width: 1, sources: ['aux'], unit: 'logic' }] });
const request = (after = 2e-6) => ({ mode: 'capture', trigger: { kind: 'digital', signal: 'd(in)', edge: 'rising' }, before: 3e-6, after, search: 50e-6 });
class LocalEngine {
  async start(p) { this.session = createCoordinatedSession(p); }
  async advanceTo(t, options) { return this.session.advanceTo(t, options); }
  async setInputs(updates, options) { const applied = this.session.setInputs(updates, options); return { applied, ...(options?.trigger ? { triggerState: applied.triggerState, snapshot: this.session.advanceTo(this.session.time) } : {}), ...(applied.triggerEvent ? { triggerEvent: applied.triggerEvent } : {}) }; }
  stop() {} close() {}
}
async function controller(p = plan(), callbacks = {}) {
  const c = new ContinuousSimulation({ engine: new LocalEngine(), intervalMs: 20, ...callbacks });
  await c.start(p, { autoRun: false, chunkDuration: 10e-6, windowDuration: .02 }); return c;
}
const record = c => createCaptureRecord({ id: 'run_source' }, c.capture, { id: 'capture_review' });
const validate = value => validateCaptureRecords([value], run => run);
const input = (value, id = 'source') => [{ id, value }];

test('same-boundary momentary release cancels a superseded post-trigger capture explicitly', async () => {
  const statuses = [], c = await controller(plan(), { onCapture: value => statuses.push(value.status) });
  try {
    await c.step(); c.armCapture(request()); await c.setInputs(input('1')); assert.equal(c.capture.status, 'post-trigger');
    await c.setInputs(input('0')); assert.equal(c.capture.status, 'cancelled'); assert.match(c.capture.reason, /superseded at the same simulation boundary/);
    assert.throws(() => record(c), /completed trigger event/);
    assert.equal(c.result.vectors.find(v => v.name === 'd(in)').values.at(-1), '0');
    await c.step(); assert.equal(c.capture.status, 'cancelled'); assert.ok(!statuses.includes('complete')); assert.match(captureStatusHTML(c.capture, c.lastEvent), /advance time between press\/release and rearm/);
  } finally { c.stop(); }
});

test('an unrelated same-boundary live update keeps the witness and completes a valid capture', async () => {
  const c = await controller();
  try {
    await c.step(); c.armCapture(request()); await c.setInputs(input('1')); await c.setInputs(input('1', 'other'));
    assert.equal(c.capture.status, 'post-trigger'); await c.step(); assert.equal(c.capture.status, 'complete');
    const saved = validate(record(c))[0]; assert.equal(saved.event.after, '1'); assert.equal(saved.run.result.continuous.inputChanges.length, 2);
  } finally { c.stop(); }
});

test('changing a trigger signal after advancing time preserves the earlier witness', async () => {
  const c = await controller();
  try {
    await c.step(); c.armCapture(request(20e-6)); await c.setInputs(input('1')); await c.step(); assert.equal(c.capture.status, 'post-trigger');
    await c.setInputs(input('0')); assert.equal(c.capture.status, 'post-trigger'); await c.step(); assert.equal(c.capture.status, 'complete');
    const saved = validate(record(c))[0], times = saved.run.result.vectors[0].values, values = saved.run.result.vectors.find(v => v.name === 'd(in)').values;
    assert.equal(values[times.indexOf(saved.event.time)], '1'); assert.equal(values.at(-1), '0');
  } finally { c.stop(); }
});

test('completed zero-post capture remains immutable after immediate same-time input release', async () => {
  const c = await controller();
  try {
    await c.step(); c.armCapture(request(0)); await c.setInputs(input('1')); assert.equal(c.capture.status, 'complete'); const before = JSON.stringify(c.capture);
    await c.setInputs(input('0')); await c.step(); assert.equal(JSON.stringify(c.capture), before); assert.equal(validate(record(c))[0].event.after, '1');
  } finally { c.stop(); }
});

test('analog same-boundary supersession cancels only when the selected raw voltage changes', async () => {
  const p = plan(); p.analog = { nodes: ['out'], uic: true, elements: [{ id: 'voltage', ref: 'V1', type: 'V', p: 'out', n: '0', wave: { kind: 'dc', dc: 0 } }] }; p.controls.push({ id: 'voltage', type: 'V', element: 'voltage', unit: 'V' });
  const c = await controller(p);
  try {
    await c.step(); c.armCapture({ ...request(), trigger: { kind: 'analog', signal: 'v(out)', threshold: .5, edge: 'rising' } });
    await c.setInputs(input(1, 'voltage')); assert.equal(c.capture.status, 'post-trigger'); await c.setInputs(input('1', 'other')); assert.equal(c.capture.status, 'post-trigger');
    await c.setInputs(input(0, 'voltage')); assert.equal(c.capture.status, 'cancelled');
  } finally { c.stop(); }
});

test('all trigger-observed input responses retain their boundary state even without a crossing', () => {
  const session = createCoordinatedSession(plan());
  const observed = session.setInputs(input('1', 'other'), { trigger: request().trigger }); assert.equal(observed.triggerState, '0'); assert.equal(observed.triggerEvent, undefined);
  const ordinary = session.setInputs(input('0', 'other')); assert.equal(Object.hasOwn(ordinary, 'triggerState'), false);
});

test('event-step work exhaustion names its partial search and a second search reaches the real event', async () => {
  const p = plan(); p.analog = { nodes: ['out'], uic: true, elements: [{ id: 'voltage', ref: 'V1', type: 'V', p: 'out', n: '0', wave: { kind: 'dc', dc: 0 } }] }; p.digital.sources[0] = { id: 'drive', output: 'in', kind: 'pattern', events: [{ time: 0, value: '0' }, { time: .003, value: '1' }] };
  const c = await controller(p);
  try {
    await c.stepToNextEvent({ searchDuration: .005 }); assert.equal(c.lastEvent.kind, 'work-limit'); assert.equal(c.lastEvent.searchedUntil, .002); assert.equal(c.lastEvent.requestedEnd, .005); assert.match(captureStatusHTML(null, c.lastEvent), /numerical work limit/);
    await c.stepToNextEvent({ searchDuration: .003 }); assert.equal(c.lastEvent.kind, 'event'); assert.equal(c.time, .003); assert.equal(c.lastEvent.searchedUntil, .003);
  } finally { c.stop(); }
});

test('full next-event search exhaustion reports its actual completed horizon', async () => {
  const c = await controller();
  try { await c.stepToNextEvent({ searchDuration: .001 }); assert.equal(c.lastEvent.kind, 'search-limit'); assert.equal(c.lastEvent.searchedUntil, c.lastEvent.requestedEnd); assert.match(c.lastEvent.reason, /declared search duration/); }
  finally { c.stop(); }
});

test('capture validation rejects a forged witness timestamp inside retained data gaps', async () => {
  const p = plan(); p.digital.sources[0] = { id: 'drive', output: 'in', kind: 'pattern', events: [{ time: 0, value: '0' }, { time: 6e-6, value: '1' }] }; const c = await controller(p);
  try {
    c.armCapture(request()); await c.step(); await c.step(); const saved = record(c); assert.equal(validate(saved).length, 1);
    const forged = structuredClone(saved); forged.event.time = 5e-6; forged.coverage = captureCoverage(forged.run.result, forged.request, forged.event); assert.throws(() => validate(forged), /witness time is absent/);
    const previous = structuredClone(saved); previous.event.previousTime = 1e-6; assert.throws(() => validate(previous), /witness time is absent/);
  } finally { c.stop(); }
});

test('automatic capture completion notifies paused only after the command owner is cleared', async () => {
  const p = plan(); p.digital.sources[0] = { id: 'drive', output: 'in', kind: 'pattern', events: [{ time: 0, value: '0' }, { time: 6e-6, value: '1' }] };
  let c, resolve, reject, timeout;
  const completed = new Promise((a, b) => { resolve = a; reject = b; });
  c = await controller(p, { onState: (state, error) => { if (state === 'failed') reject(error); if (state === 'paused' && c?.capture?.status === 'complete') { try { assert.equal(c.inFlight, null); resolve(); } catch (e) { reject(e); } } } });
  try { c.armCapture(request()); c.resume(); timeout = setTimeout(() => reject(new Error('Capture did not finish')), 2000); await completed; assert.equal(c.state, 'paused'); }
  finally { clearTimeout(timeout); c.stop(); }
});

test('live-input capture pause notifies again after its input owner clears', async () => {
  let c; const completeNotifications = []; c = await controller(plan(), { onState: state => { if (state === 'paused' && c?.capture?.status === 'complete') completeNotifications.push({ inFlight: c.inFlight, inputInFlight: c.inputInFlight }); } });
  try { await c.step(); c.armCapture(request(0)); await c.setInputs(input('1')); assert.deepEqual(completeNotifications, [{ inFlight: null, inputInFlight: null }]); }
  finally { c.stop(); }
});

test('a capture callback that stops ownership is never followed by a stale paused notification', async () => {
  const p = plan(); p.digital.sources[0] = { id: 'drive', output: 'in', kind: 'pattern', events: [{ time: 0, value: '0' }, { time: 6e-6, value: '1' }] };
  let c; const states = []; c = await controller(p, { onState: state => states.push(state), onCapture: capture => { if (capture.status === 'complete') c.stop(); } });
  c.armCapture(request(0)); await c.step(); assert.equal(states.at(-1), 'stopped'); assert.equal(c.inFlight, null);
});
