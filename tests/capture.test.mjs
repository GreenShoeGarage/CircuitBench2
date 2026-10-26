import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoordinatedSession } from '../src/coordinated.js';
import { ContinuousSimulation } from '../src/continuous.js';
import { normalizeCaptureRequest, triggerCrossed, createCaptureRecord, validateCaptureRecords, retainCaptureRecords } from '../src/capture.js';
import { newProject, addComponent, validateProject } from '../src/model.js';
import { safeEnvelope } from '../src/storage.js';
import { captureSetupHTML, captureResultHTML } from '../src/capture-ui.js';
import { Worker as NodeWorker } from 'node:worker_threads';
import { CoordinatedEngine } from '../src/coordinated-engine.js';

const blank = () => ({ kind: 'coordinated-transient', version: 1, duration: 1e-3, maxStep: 1e-6, analog: { nodes: [], elements: [], uic: true }, digital: { sources: [], gates: [], sequential: [], buses: [], probes: [], inputGroups: [], hiddenNodes: [] }, adcs: [], dacs: [], controls: [] });
const rc = () => ({ ...blank(), analog: { nodes: ['in', 'out'], uic: true, elements: [{ id: 'v', ref: 'V1', type: 'V', p: 'in', n: '0', wave: { kind: 'dc', dc: 1 } }, { id: 'r', ref: 'R1', type: 'R', p: 'in', n: 'out', value: 1000 }, { id: 'c', ref: 'C1', type: 'C', p: 'out', n: '0', value: 1e-6, ic: 0 }] } });
const digitalPlan = () => { const p = blank(); p.digital.sources = [{ id: 'drive', output: 'in', kind: 'pattern', events: [{ time: 0, value: '0' }, { time: 2e-6, value: 'X' }, { time: 3e-6, value: '1' }, { time: 4e-6, value: '0' }, { time: 6e-6, value: '1' }] }]; return p; };
const request = (extra = {}) => ({ mode: 'capture', trigger: { kind: 'digital', signal: 'd(in)', edge: 'rising' }, before: 3e-6, after: 2e-6, search: 20e-6, ...extra });
class LocalEngine {
  async start(plan) { this.session = createCoordinatedSession(plan); }
  async advanceTo(time, options) { return this.session.advanceTo(time, options); }
  async setInputs(updates, options) { const applied = this.session.setInputs(updates, options); return { applied, ...(options?.trigger ? { triggerState: applied.triggerState, snapshot: this.session.advanceTo(this.session.time) } : {}), ...(applied.triggerEvent ? { triggerEvent: applied.triggerEvent } : {}) }; }
  stop() { this.session = null; }
  close() { this.session = null; }
}
async function controller(plan = digitalPlan(), options = {}) { const c = new ContinuousSimulation({ engine: new LocalEngine(), intervalMs: 60000 }); await c.start(plan, { autoRun: false, chunkDuration: 10e-6, windowDuration: 20e-6, ...options }); return c; }

test('digital trigger ignores X/Z transitions and stops on the first actual binary edge', () => {
  const session = createCoordinatedSession(digitalPlan()), result = session.advanceTo(20e-6, { trigger: request().trigger });
  assert.equal(result.halt.time, 6e-6); assert.equal(session.time, 6e-6); assert.equal(result.halt.before, '0'); assert.equal(result.halt.after, '1'); assert.equal(result.done, false);
  assert.equal(result.digitalEvents[0].events.at(-1).value, '1');
});

test('analog threshold stop is a retained solver state localized within its numerical step', () => {
  const p = rc(), session = createCoordinatedSession(p), result = session.advanceTo(.001, { trigger: { kind: 'analog', signal: 'v(out)', edge: 'rising', threshold: .5 } });
  assert.ok(Math.abs(session.time - Math.log(2) * .001) < 1e-6); assert.ok(result.halt.before < .5); assert.ok(result.halt.after >= .5);
  assert.equal(result.halt.method, 'accepted-step-threshold-localization'); assert.equal(result.vectors.find(v => v.name === 'v(out)').values.at(-1), result.halt.after);
  const later = session.advanceTo(.001); assert.ok(later.vectors.find(v => v.name === 'v(out)').values.at(-1) > result.halt.after);
});

test('next-event stepping passes analog integration samples and reaches a real scheduled boundary', () => {
  const p = rc(); p.digital.sources = [{ id: 'pattern', output: 'a', kind: 'pattern', events: [{ time: 0, value: '0' }, { time: 17e-6, value: '1' }] }];
  const result = createCoordinatedSession(p).advanceTo(50e-6, { stopOnEvent: true });
  assert.equal(result.time, 17e-6); assert.equal(result.halt.kind, 'event'); assert.equal(result.stats.acceptedSteps, 17);
});

test('a digital bus trigger requires and respects the explicit least-significant-bit index', () => {
  const p = blank(); p.digital.sources = [{ id: 'lo', output: 'low', kind: 'pattern', events: [{ time: 0, value: '0' }, { time: 9e-6, value: '1' }] }, { id: 'hi', output: 'high', kind: 'pattern', events: [{ time: 0, value: '0' }, { time: 3e-6, value: '1' }] }]; p.digital.buses = [{ name: 'b(word)', bits: ['low', 'high'], width: 2 }];
  assert.throws(() => createCoordinatedSession(p).advanceTo(20e-6, { trigger: { kind: 'digital', signal: 'b(word)', edge: 'rising' } }), /explicit bit/);
  const result = createCoordinatedSession(p).advanceTo(20e-6, { trigger: { kind: 'digital', signal: 'b(word)', bit: 0, edge: 'rising' } });
  assert.equal(result.halt.time, 9e-6); assert.equal(result.vectors.find(v => v.name === 'b(word)').values.at(-1), '11');
});

test('capture collects exact post-trigger end and reports requested versus retained history', async () => {
  const c = await controller(); c.armCapture(request()); await c.step(); assert.equal(c.capture.status, 'post-trigger'); assert.equal(c.time, 6e-6); await c.step();
  assert.equal(c.capture.status, 'complete'); assert.equal(c.state, 'paused'); assert.equal(c.time, 8e-6); assert.equal(c.capture.coverage.status, 'complete');
  assert.equal(c.capture.coverage.requestedStart, 3e-6); assert.ok(c.capture.result.vectors[0].values[0] <= 3e-6); c.stop();
});

test('missing pre-trigger history is an explicit partial capture, including before time zero', async () => {
  const c = await controller(); c.armCapture(request({ before: 20e-6, after: 0 })); await c.step();
  assert.equal(c.capture.status, 'complete'); assert.equal(c.capture.coverage.status, 'partial'); assert.ok(c.capture.coverage.missingBefore > 13.9e-6); assert.match(c.capture.coverage.description, /unavailable/); c.stop();
});

test('run-until-event pauses at the event and ignores the requested post-trigger value', async () => {
  const c = await controller(); c.armCapture(request({ mode: 'until', after: 10e-6 })); await c.step();
  assert.equal(c.time, 6e-6); assert.equal(c.capture.request.after, 0); assert.equal(c.capture.status, 'complete'); assert.equal(c.state, 'paused'); c.stop();
});

test('search exhaustion and next-event work caps never claim an observed event', async () => {
  const c = await controller(); c.armCapture(request({ search: 5e-6 })); await c.step(); assert.equal(c.capture.status, 'not-found'); assert.ok(Math.abs(c.time - 5e-6) < 1e-18); assert.equal(c.capture.event, null); c.stop();
  const a = await controller(rc(), { chunkDuration: 1e-6, windowDuration: .01 }); await a.stepToNextEvent({ searchDuration: .01 }); assert.equal(a.lastEvent.kind, 'work-limit'); assert.equal(a.lastEvent.searchedUntil, a.time); assert.equal(a.lastEvent.requestedEnd, .01); assert.ok(a.time <= .002000001); assert.equal(a.state, 'paused'); a.stop();
});

test('armed live input changes trigger at their applied boundary without a fabricated pulse width', async () => {
  const p = blank(); p.digital.sources = [{ id: 'drive', output: 'in', kind: 'constant', value: '0' }]; p.controls = [{ id: 'source', type: 'DVS', width: 1, sources: ['drive'], unit: 'logic' }];
  const c = await controller(p); await c.step(); c.armCapture(request({ mode: 'until' })); await c.setInputs([{ id: 'source', value: '1' }]);
  assert.equal(c.capture.status, 'complete'); assert.equal(c.capture.event.method, 'live-input-boundary'); assert.ok(Math.abs(c.capture.event.time - 10e-6) < 1e-18); assert.equal(c.capture.event.previousTime, c.capture.event.time); assert.equal(c.state, 'paused'); assert.equal(c.inputChanges.length, 1); c.stop();
});

test('Stop cancels an armed capture and a new session starts with no inherited trigger', async () => {
  const c = await controller(); c.armCapture(request()); c.stop(); assert.equal(c.capture.status, 'cancelled'); await c.start(digitalPlan(), { autoRun: false, chunkDuration: 10e-6, windowDuration: 20e-6 }); assert.equal(c.capture, null); await c.step(); assert.ok(Math.abs(c.time - 10e-6) < 1e-18); c.stop();
});

function sourceRun(result) { const p = newProject('Capture evidence'); p.analysis.type = 'tran'; p.analysis.solver = 'coordinated'; return { id: 'run_source', projectId: p.id, revision: p.revision, projectSnapshot: p, analysis: structuredClone(p.analysis), status: 'running', startedAt: '2026-10-25T00:00:00.000Z', netlist: '* captured fixture', netlistHash: 'fixture', simulationHash: 'fixture', measurements: [], models: [], diagnostics: [], logs: [], result }; }

test('saved capture survives run removal and a project backup round trip; coverage and witness are verified', async () => {
  const c = await controller(); c.armCapture(request()); await c.step(); await c.step(); const run = sourceRun(c.result), record = createCaptureRecord(run, c.capture, { id: 'capture_one', createdAt: '2026-10-25T00:01:00.000Z' });
  const restored = safeEnvelope({ project: run.projectSnapshot, runs: [], captureRecords: [record] }, validateProject);
  assert.equal(restored.captureRecords.length, 1); assert.equal(restored.captureRecords[0].event.time, 6e-6); assert.equal(restored.runs.length, 0);
  const changed = structuredClone(record); changed.coverage.missingBefore = 1; assert.throws(() => safeEnvelope({ project: run.projectSnapshot, captureRecords: [changed] }, validateProject), /coverage/);
  const forged = structuredClone(record); forged.event.after = '0'; assert.throws(() => safeEnvelope({ project: run.projectSnapshot, captureRecords: [forged] }, validateProject), /crossing/); c.stop();
});

test('live-boundary evidence retains the exact applied input change and validates after reopening', async () => {
  const p = blank(), project = newProject('Live trigger'), source = addComponent(project, 'DVS'); project.analysis.type = 'tran'; project.analysis.solver = 'coordinated';
  p.digital.sources = [{ id: 'drive', output: 'in', kind: 'constant', value: '0' }]; p.controls = [{ id: source.id, type: 'DVS', width: 1, sources: ['drive'], unit: 'logic' }];
  const c = await controller(p); await c.step(); c.armCapture(request({ mode: 'until' })); await c.setInputs([{ id: source.id, value: '1' }]);
  const run = { ...sourceRun(c.result), projectId: project.id, projectSnapshot: project, analysis: structuredClone(project.analysis) }, record = createCaptureRecord(run, c.capture, { id: 'capture_live', createdAt: '2026-10-25T00:01:00.000Z' });
  assert.equal(safeEnvelope({ project, captureRecords: [record] }, validateProject).captureRecords[0].event.method, 'live-input-boundary');
  record.event.updates[0].value = '0'; assert.throws(() => safeEnvelope({ project, captureRecords: [record] }, validateProject), /input history/); c.stop();
});

test('bounded retention drops whole old captures and UI names missing history and raw provenance', async () => {
  const c = await controller(); c.armCapture(request({ before: 20e-6, after: 0 })); await c.step(); const run = sourceRun(c.result), record = createCaptureRecord(run, c.capture, { id: 'capture_ui' });
  const retained = retainCaptureRecords(Array.from({ length: 6 }, (_, index) => ({ ...record, id: `capture_${index}` })), record); assert.equal(retained.records.length, 6); assert.equal(retained.droppedCount, 1);
  assert.match(captureResultHTML(record, run.projectSnapshot), /Unavailable history/); assert.match(captureSetupHTML(run, { session: c, records: [record] }), /Run until event/); assert.match(captureSetupHTML(null), /at least one completed update/); c.stop();
});

test('invalid time/threshold/edge configurations are rejected without silently normalizing ambiguity', () => {
  for (const bad of [{ search: 0 }, { before: -1 }, { after: Infinity }, { trigger: { kind: 'digital', signal: 'd(in)', bit: 8, edge: 'rising' } }, { trigger: { kind: 'analog', signal: 'v(out)', threshold: NaN, edge: 'rising' } }]) assert.throws(() => normalizeCaptureRequest(request(bad)));
  assert.equal(triggerCrossed(request().trigger, 'X', '1'), false); assert.equal(triggerCrossed({ kind: 'analog', threshold: 1, edge: 'rising' }, 1, 2), false);
});

function realEngine() {
  const threads = [], engine = new CoordinatedEngine({ workerFactory: target => {
    const thread = new NodeWorker(new URL('../scripts/engine-node-worker.mjs', import.meta.url), { workerData: { target: String(target) } }); threads.push(thread);
    const adapter = { postMessage: message => thread.postMessage(message), terminate: () => thread.terminate() };
    thread.on('message', data => adapter.onmessage?.({ data })); thread.on('error', error => adapter.onerror?.({ message: error.message, preventDefault() {} })); return adapter;
  } });
  return { engine, close: async () => { engine.close(); await Promise.all(threads.map(thread => thread.terminate())); } };
}

test('actual worker protocol carries event stopping and retained post-trigger state', async () => {
  const h = realEngine(), c = new ContinuousSimulation({ engine: h.engine });
  try { await c.start(digitalPlan(), { autoRun: false, chunkDuration: 10e-6, windowDuration: 20e-6 }); c.armCapture(request()); await c.step(); await c.step(); assert.equal(c.capture.status, 'complete'); assert.equal(c.time, 8e-6); assert.equal(c.capture.event.time, 6e-6); assert.ok(h.engine.running); }
  finally { c.stop(); await h.close(); }
});

test('actual worker live input response includes the triggered boundary snapshot', async () => {
  const p = blank(); p.digital.sources = [{ id: 'drive', output: 'in', kind: 'constant', value: '0' }]; p.controls = [{ id: 'source', type: 'DVS', width: 1, sources: ['drive'], unit: 'logic' }];
  const h = realEngine(), c = new ContinuousSimulation({ engine: h.engine });
  try { await c.start(p, { autoRun: false, chunkDuration: 10e-6, windowDuration: 20e-6 }); await c.step(); c.armCapture(request({ mode: 'until' })); await c.setInputs([{ id: 'source', value: '1' }]); assert.equal(c.capture.status, 'complete'); assert.equal(c.capture.event.method, 'live-input-boundary'); assert.equal(c.capture.result.vectors.find(v => v.name === 'd(in)').values.at(-1), '1'); }
  finally { c.stop(); await h.close(); }
});

test('actual worker returns a non-crossing boundary state so same-time release cancels post-trigger capture', async () => {
  const p = blank(); p.digital.sources = [{ id: 'drive', output: 'in', kind: 'constant', value: '0' }]; p.controls = [{ id: 'source', type: 'DVS', width: 1, sources: ['drive'], unit: 'logic' }];
  const h = realEngine(), c = new ContinuousSimulation({ engine: h.engine });
  try {
    await c.start(p, { autoRun: false, chunkDuration: 10e-6, windowDuration: 20e-6 }); await c.step(); c.armCapture(request());
    await c.setInputs([{ id: 'source', value: '1' }]); assert.equal(c.capture.status, 'post-trigger');
    const response = await c.setInputs([{ id: 'source', value: '0' }]); assert.equal(response.triggerEvent, undefined); assert.equal(response.triggerState, '0'); assert.equal(response.snapshot.vectors.find(v => v.name === 'd(in)').values[0], '0');
    assert.equal(c.capture.status, 'cancelled'); assert.match(c.capture.reason, /same simulation boundary/); assert.ok(h.engine.running);
  } finally { c.stop(); await h.close(); }
});
