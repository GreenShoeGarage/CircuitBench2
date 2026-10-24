import test from 'node:test';
import assert from 'node:assert/strict';
import { appendContinuousResult, ContinuousSimulation, CONTINUOUS_LIMITS } from '../src/continuous.js';
import { mergeCoordinatedChunks, validateCoordinatedResult } from '../src/coordinated-results.js';
import { createCoordinatedSession } from '../src/coordinated.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
function chunk(times, words = times.map(time => time % 2 ? '1' : '0'), extra = {}) {
  const events = times.flatMap((time, index) => !index || words[index] !== words[index - 1] ? [{ time, value: words[index] }] : []);
  return { points: times.length, vectors: [{ name: 'time', unit: 's', values: times }, { name: 'v(out)', unit: 'V', values: times.map(time => time * 2) }, { name: 'd(bit)', unit: 'logic', kind: 'logic', values: words }], digitalEvents: [{ name: 'd(bit)', events }], done: true, sampling: { mode: 'coordinated-events', timeResolution: 1e-12 }, logs: [], warnings: [], ...extra };
}
class DeferredEngine {
  constructor() { this.starts = []; this.advances = []; this.inputs = []; this.stops = 0; this.closes = 0; }
  async start(plan) { this.starts.push(plan); }
  advanceTo(end, options) { const request = { end, options, ...deferred() }; this.advances.push(request); return request.promise; }
  setInputs(updates) { const request = { updates, ...deferred() }; this.inputs.push(request); return request.promise; }
  stop() { this.stops++; }
  close() { this.closes++; }
}
const plan = { duration: 4 };
const create = (options = {}) => { const engine = new DeferredEngine(), states = [], results = []; const controller = new ContinuousSimulation({ engine, intervalMs: 60000, onState: state => states.push(state), onUpdate: result => results.push(result), ...options }); return { engine, states, results, controller }; };

test('rolling history retains actual absolute sample positions and a sparse boundary state', () => {
  const retained = appendContinuousResult(null, chunk([0, 1, 2, 3, 4, 5], ['0', '0', '1', '1', '1', '0']), { maxPoints: 4 });
  assert.deepEqual(retained.vectors[0].values, [2, 3, 4, 5]); assert.deepEqual(retained.digitalEvents[0].events, [{ time: 2, value: '1' }, { time: 5, value: '0' }]);
  assert.equal(retained.continuous.totalPoints, 6); assert.equal(retained.continuous.droppedPoints, 2); assert.deepEqual(retained.sampling.timeBounds, [2, 5]); assert.equal(retained.sampling.analogInterpolation, undefined);
});

test('a new chunk replaces the shared settled boundary without a duplicated time or gap', () => {
  const first = appendContinuousResult(null, chunk([0, 1, 2], ['0', '0', '0']));
  const next = appendContinuousResult(first, chunk([2, 3, 4], ['1', '1', '0']));
  assert.deepEqual(next.vectors[0].values, [0, 1, 2, 3, 4]); assert.deepEqual(next.vectors[2].values, ['0', '0', '1', '1', '0']);
  assert.deepEqual(next.digitalEvents[0].events, [{ time: 0, value: '0' }, { time: 2, value: '1' }, { time: 4, value: '0' }]); assert.equal(next.continuous.totalPoints, 5);
});

test('window duration advances to a stored sample rather than inventing an interpolated boundary', () => {
  const result = appendContinuousResult(null, chunk([0, 1, 2, 3, 4, 5]), { windowDuration: 2.5 });
  assert.deepEqual(result.vectors[0].values, [3, 4, 5]); assert.equal(result.continuous.windowStart, 3);
});

test('sample and event retention bounds move the whole window without losing interior edges', () => {
  const source = chunk([0, 1, 2, 3, 4, 5, 6, 7]), result = appendContinuousResult(null, source, { maxValues: 12, maxEvents: 3 });
  assert.ok(result.points * result.vectors.length <= 12); assert.ok(result.digitalEvents[0].events.length <= 3);
  assert.deepEqual(result.digitalEvents[0].events.map(event => event.time), result.vectors[0].values);
  assert.doesNotThrow(() => validateCoordinatedResult(result));
});

test('gaps, overlaps, changed widths, inconsistent sparse data and pseudo-logic are rejected', () => {
  const first = chunk([0, 1, 2]);
  for (const times of [[3, 4], [1, 2]]) assert.throws(() => appendContinuousResult(first, chunk(times)), /exact state boundary/);
  for (const mutate of [result => result.vectors[2].values[1] = 1, result => result.digitalEvents[0].events[1].value = '0', result => result.digitalEvents[0].events[0].time = .1, result => result.vectors.push(structuredClone(result.vectors[1])), result => result.vectors[1].values[1] = NaN]) { const bad = chunk([0, 1, 2]); mutate(bad); assert.throws(() => appendContinuousResult(null, bad)); }
  const bad = chunk([2, 3]); bad.vectors[1].unit = 'A'; assert.throws(() => appendContinuousResult(first, bad), /metadata changed/);
});

test('bounded finite-result merging fails before discarding any point or event', () => {
  const first = chunk([0, 1, 2]), next = chunk([2, 3, 4]);
  assert.throws(() => mergeCoordinatedChunks(first, next, { maxPoints: 4 }), /point or value budget/);
  assert.throws(() => mergeCoordinatedChunks(first, next, { maxTotal: 19 }), /sample\/event budget/);
  const merged = mergeCoordinatedChunks(first, next, { maxTotal: 20 }); assert.equal(merged.points, 5); assert.deepEqual(merged.sampling.analogSampleIndices, [0, 1, 2, 3, 4]);
});

test('pause waits for an active command and retains its worker and last numerical state', async () => {
  const { controller, engine, states } = create(); await controller.start(plan, { chunkDuration: 1, autoRun: true });
  const advance = controller.advance(); await settle(); const pause = controller.pause(); assert.equal(controller.state, 'pausing');
  engine.advances[0].resolve(chunk([0, 1])); await advance; await pause;
  assert.equal(controller.state, 'paused'); assert.equal(controller.time, 1); assert.equal(engine.closes, 0); assert.equal(engine.stops, 0); assert.ok(states.includes('pausing'));
  controller.stop();
});

test('single-step advances a paused session without enabling automatic execution', async () => {
  const { controller, engine } = create(); await controller.start(plan, { chunkDuration: 1, autoRun: false });
  const advance = controller.step(); await settle(); assert.equal(engine.advances[0].options.maxSteps, CONTINUOUS_LIMITS.commandSteps); engine.advances[0].resolve(chunk([0, 1])); await advance;
  assert.equal(controller.state, 'paused'); assert.equal(controller.time, 1); assert.equal(engine.starts.length, 1); controller.stop();
});

test('Stop before a scheduled command starts cannot touch a replacement session', async () => {
  const { controller, engine, results } = create(); await controller.start(plan, { chunkDuration: 1, autoRun: false });
  const old = controller.advance(); controller.stop(); await controller.start(plan, { chunkDuration: 1, autoRun: false }); await old;
  assert.equal(engine.advances.length, 0); assert.equal(controller.time, 0); assert.equal(results.length, 0); controller.stop();
});

test('a completed old command after Stop and restart cannot overwrite new results or state', async () => {
  const { controller, engine, results } = create(); await controller.start(plan, { chunkDuration: 1, autoRun: false });
  const old = controller.advance(); await settle(); controller.stop(); await controller.start(plan, { chunkDuration: 1, autoRun: false });
  engine.advances[0].resolve(chunk([0, 1])); await old;
  assert.equal(controller.time, 0); assert.equal(controller.state, 'paused'); assert.equal(results.length, 0); assert.equal(controller.inFlight, null); controller.stop();
});

test('Stop in the starting-state callback prevents even initialization', async () => {
  const engine = new DeferredEngine(); let controller;
  controller = new ContinuousSimulation({ engine, onState: state => { if (state === 'starting') controller.stop(); } });
  await controller.start(plan, { chunkDuration: 1 }); assert.equal(engine.starts.length, 0); assert.equal(controller.state, 'stopped');
});

test('live inputs pause safely, capture a copy, record exact simulation time and resume', async () => {
  const { controller, engine } = create(); await controller.start(plan, { chunkDuration: 1 });
  const changes = [{ id: 'input', value: '1' }], setting = controller.setInputs(changes); changes[0].value = '0'; await settle();
  assert.equal(controller.state, 'paused'); assert.deepEqual(engine.inputs[0].updates, [{ id: 'input', value: '1' }]);
  engine.inputs[0].resolve({ applied: true }); await setting;
  assert.equal(controller.state, 'running'); assert.deepEqual(controller.inputChanges, [{ time: 0, updates: [{ id: 'input', value: '1' }] }]); controller.stop();
});

test('a stale input response after Stop cannot append into a replacement session', async () => {
  const { controller, engine } = create(); await controller.start(plan, { chunkDuration: 1, autoRun: false });
  const setting = controller.setInputs([{ id: 'input', value: '1' }]); await settle(); controller.stop(); await controller.start(plan, { chunkDuration: 1, autoRun: false }); engine.inputs[0].resolve({ applied: true });
  await assert.rejects(setting, error => error.code === 'CONTINUOUS_CANCELLED'); assert.deepEqual(controller.inputChanges, []); assert.equal(controller.state, 'paused'); assert.equal(engine.closes, 0); controller.stop();
});

test('concurrent input edits and steps cannot race an input command', async () => {
  const { controller, engine } = create(); await controller.start(plan, { chunkDuration: 1, autoRun: false });
  const setting = controller.setInputs([{ id: 'input', value: '1' }]); await settle();
  await assert.rejects(controller.setInputs([{ id: 'input', value: '0' }]), /current live input/); await assert.rejects(controller.step(), /before stepping/); assert.throws(() => controller.resume(), /before resuming/); assert.equal(engine.advances.length, 0);
  engine.inputs[0].resolve({}); await setting; assert.equal(controller.state, 'paused'); controller.stop();
});

test('an explicit pause during a live input change is not undone by automatic resume', async () => {
  const { controller, engine } = create(); await controller.start(plan, { chunkDuration: 1 });
  const setting = controller.setInputs([{ id: 'input', value: '1' }]); await settle(); await controller.pause(); engine.inputs[0].resolve({}); await setting;
  assert.equal(controller.state, 'paused'); controller.stop();
});

test('pause during worker initialization is honored after startup completes', async () => {
  const engine = new DeferredEngine(), startup = deferred(); engine.start = () => startup.promise;
  const controller = new ContinuousSimulation({ engine, intervalMs: 60000 }), starting = controller.start(plan, { chunkDuration: 1 });
  await controller.pause(); startup.resolve({ time: 0 }); await starting; assert.equal(controller.state, 'paused'); assert.equal(engine.advances.length, 0); controller.stop();
});

test('an idle paused-worker failure is reflected immediately in controller state', async () => {
  const engine = new DeferredEngine(); let rejectWorker;
  engine.start = async (_, options) => { rejectWorker = options.onFailure; };
  const controller = new ContinuousSimulation({ engine }); await controller.start(plan, { chunkDuration: 1, autoRun: false }); rejectWorker(new Error('Worker lost'));
  assert.equal(controller.state, 'failed'); assert.equal(controller.running, false); assert.equal(engine.closes, 1);
});

test('an input failure closes the worker and reports failed rather than a false paused session', async () => {
  const { controller, engine } = create(); await controller.start(plan, { chunkDuration: 1 });
  const setting = controller.setInputs([{ id: 'missing', value: '1' }]); await settle(); engine.inputs[0].reject(new Error('Unknown input'));
  await assert.rejects(setting, /Unknown input/); assert.equal(controller.state, 'failed'); assert.equal(controller.running, false); assert.equal(engine.closes, 1); assert.deepEqual(controller.inputChanges, []);
});

test('stalled, gapped or overshot solver chunks fail and close without publishing results', async () => {
  for (const returned of [chunk([0], ['0'], { done: false }), chunk([.5, 1]), chunk([0, 2])]) {
    const { controller, engine, results } = create(); await controller.start(plan, { chunkDuration: 1, autoRun: false }); const advancing = controller.advance(); await settle(); engine.advances[0].resolve(returned);
    await assert.rejects(advancing, error => error.code === 'CONTINUOUS_STALLED'); assert.equal(engine.closes, 1); assert.equal(controller.state, 'failed'); assert.equal(results.length, 0); assert.equal(controller.inFlight, null);
  }
});

test('partial chunks continue from their actual end while preserving the absolute timeline', async () => {
  const { controller, engine } = create(); await controller.start(plan, { chunkDuration: 1, autoRun: false });
  const first = controller.step(); await settle(); engine.advances[0].resolve(chunk([0, .5], ['0', '0'], { done: false })); await first; assert.equal(controller.time, .5);
  const second = controller.step(); await settle(); assert.equal(engine.advances[1].end, 1.5); engine.advances[1].resolve(chunk([.5, 1, 1.5], ['0', '1', '1'])); await second; assert.deepEqual(controller.result.vectors[0].values, [0, .5, 1, 1.5]); controller.stop();
});

test('real RC numerical state and live source changes survive pause and resume without restart', async () => {
  const actualPlan = { kind: 'coordinated-transient', version: 1, duration: .001, maxStep: .00001, analog: { nodes: ['in', 'out'], uic: false, elements: [{ id: 'v', ref: 'V1', type: 'V', p: 'in', n: '0', wave: { kind: 'dc', dc: 0 } }, { id: 'r', ref: 'R1', type: 'R', p: 'in', n: 'out', value: 1000 }, { id: 'c', ref: 'C1', type: 'C', p: 'out', n: '0', value: 1e-6, ic: 0 }] }, digital: {}, adcs: [], dacs: [], controls: [{ id: 'v', type: 'V', element: 'v', unit: 'V' }] };
  const engine = { starts: 0, closed: 0, async start(plan) { this.starts++; this.session = createCoordinatedSession(plan); }, async advanceTo(time, options) { return this.session.advanceTo(time, options); }, async setInputs(updates) { return this.session.setInputs(updates); }, close() { this.closed++; }, stop() { this.closed++; } };
  const controller = new ContinuousSimulation({ engine, intervalMs: 60000 }); await controller.start(actualPlan, { chunkDuration: .0001, windowDuration: .001, autoRun: false }); const session = engine.session;
  await controller.setInputs([{ id: 'v', value: 1 }]); await controller.step(); const first = controller.result.vectors.find(vector => vector.name === 'v(out)').values.at(-1);
  controller.resume(); await controller.pause(); await controller.step(); const second = controller.result.vectors.find(vector => vector.name === 'v(out)').values.at(-1);
  assert.ok(first > .09 && first < .10); assert.ok(second > .17 && second < .19); assert.equal(engine.session, session); assert.equal(engine.starts, 1); assert.equal(engine.closed, 0); assert.ok(Math.abs(controller.time - .0002) < 1e-16); controller.stop(); assert.equal(engine.closed, 1);
});
