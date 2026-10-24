import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { DigitalEngine } from '../src/digital-engine.js';
import { simulateDigital } from '../src/digital.js';
import { WorkbenchEngine } from '../src/simulation.js';
const ns = 1e-9;
const simplePlan = { duration: 20 * ns, sources: [{ id: 'a', output: 'a', kind: 'constant', value: '1' }], gates: [{ id: 'n', type: 'NOT', inputs: ['a'], output: 'b', delay: ns }] };
const analogResult = () => ({ points: 3, vectors: [{ name: 'time', unit: 's', values: [0, 5 * ns, 10 * ns] }, { name: 'v(in)', unit: 'V', values: [0, 5, 0] }, { name: 'v(out)', unit: 'V', values: [0, 2, 0] }], logs: ['real-interface analog stub'], warnings: [], engine: { name: 'test analog' } });
class ImmediateDigital { constructor() { this.calls = []; } async run(plan, options = {}) { this.calls.push({ plan, options }); return simulateDigital(plan, { sources: options.sources }); } stop() { return false; } get running() { return false; } }
class ImmediateAnalog { constructor() { this.calls = []; } async run(deck, options = {}) { this.calls.push({ deck, options }); return analogResult(); } stop() { return false; } get running() { return false; } }
const mixedPlan = () => ({ mode: 'mixed', duration: 10 * ns, maxStep: ns, digital: { sources: [], gates: [{ id: 'b', type: 'BUF', inputs: ['adc'], output: 'drive', delay: ns }] }, adcs: [{ id: 'adc', inputVector: 'v(in)', referenceVector: '0', output: 'adc', low: 1, high: 4, mode: 'schmitt' }], dacs: [{ id: 'dac', input: 'drive', sourceName: 'V_CB_DAC', low: 0, high: 5, initial: 0, rise: ns, fall: ns }] });

test('actual digital Worker completes, fails, recovers, cancels and times out with physical termination', async () => {
  const previous = globalThis.Worker, threads = [], exits = [], counts = { created: 0, terminated: 0, alive: 0 };
  globalThis.Worker = class {
    constructor(target) { counts.created++; counts.alive++; const thread = this.thread = new NodeWorker(new URL('../scripts/engine-node-worker.mjs', import.meta.url), { workerData: { target: String(target) } }); threads.push(thread); thread.on('message', data => this.onmessage?.({ data })); thread.on('error', error => this.onerror?.({ message: error.message, preventDefault() {} })); exits.push(new Promise(resolve => thread.on('exit', () => { counts.alive--; resolve(); }))); }
    postMessage(message) { this.thread.postMessage(message); }
    terminate() { counts.terminated++; return this.thread.terminate(); }
  };
  try {
    const engine = new DigitalEngine(), result = await engine.run(simplePlan);
    assert.equal(result.traces.find(t => t.node === 'b').events[0].value, '0'); assert.equal(engine.running, false);
    await assert.rejects(engine.run({ ...simplePlan, gates: [{ ...simplePlan.gates[0], inputs: ['b'] }] }), error => error.status === 'failed' && error.code === 'DIGITAL_FEEDBACK');
    assert.equal((await engine.run(simplePlan)).traces.length, 2);
    const cancelled = engine.run(simplePlan, { onLog: () => engine.stop() });
    await assert.rejects(cancelled, error => error.status === 'cancelled');
    await assert.rejects(engine.run(simplePlan, { timeoutMs: 1 }), error => error.status === 'timed-out');
    assert.equal((await engine.run(simplePlan)).traces.length, 2);
    await Promise.all(exits); assert.equal(counts.created, 6); assert.equal(counts.terminated, 6); assert.equal(counts.alive, 0);
  } finally { globalThis.Worker = previous; await Promise.all(threads.map(thread => thread.terminate())); }
});
test('analog-only facade delegates the original deck and options without resampling', async () => {
  const analog = new ImmediateAnalog(), engine = new WorkbenchEngine({ analogEngine: analog, digitalEngine: new ImmediateDigital() });
  const result = await engine.run('unchanged deck', { timeoutMs: 1200 });
  assert.equal(analog.calls[0].deck, 'unchanged deck'); assert.equal(analog.calls[0].options.timeoutMs, 1200); assert.equal(result.sampling, undefined);
});
test('pure digital facade never starts an analog worker and retains event provenance', async () => {
  const analog = new ImmediateAnalog(), engine = new WorkbenchEngine({ analogEngine: analog, digitalEngine: new ImmediateDigital() });
  const result = await engine.run('digital plan', { generated: { simulation: { mode: 'digital', duration: simplePlan.duration, digital: simplePlan }, diagnostics: [] } });
  assert.equal(analog.calls.length, 0); assert.equal(result.engine.mode, 'digital'); assert.equal(result.sampling.mode, 'digital-events');
  assert.deepEqual(result.analogNetlists, []); assert.equal(result.digitalEvents.length, 2);
});
test('feed-forward replay executes held DAC analog input, ADC events, logic and final PWL analog output', async () => {
  const analog = new ImmediateAnalog(), digital = new ImmediateDigital(), overrides = [];
  const engine = new WorkbenchEngine({ analogEngine: analog, digitalEngine: digital, netlistGenerator: (project, options) => { overrides.push(options.dacWaveforms); return { netlist: 'deck ' + overrides.length, diagnostics: [] }; } });
  const result = await engine.run('initial plan', { project: {}, generated: { simulation: mixedPlan(), diagnostics: [] } });
  assert.equal(analog.calls.length, 2); assert.equal(digital.calls.length, 1); assert.deepEqual(overrides[0].dac, [[0, 0], [10 * ns, 0]]);
  assert.ok(overrides[1].dac.some(([, volts]) => volts === 5)); assert.deepEqual(result.analogNetlists, ['deck 1', 'deck 2']);
  assert.equal(result.engine.mode, 'mixed'); assert.equal(result.sampling.mode, 'event-union'); assert.equal(result.sampling.analogSampleIndices.length, 3);
  assert.ok(result.bridgeAssumptions.some(text => /feedback/.test(text))); assert.ok(result.warnings.some(text => /interpolated/.test(text)));
});
test('threshold ADC unknown band stops before any final DAC analog calculation', async () => {
  const analog = new ImmediateAnalog(), plan = mixedPlan(); plan.adcs[0].mode = 'threshold';
  const engine = new WorkbenchEngine({ analogEngine: analog, digitalEngine: new ImmediateDigital(), netlistGenerator: () => ({ netlist: 'held deck', diagnostics: [] }) });
  await assert.rejects(engine.run('plan', { project: {}, generated: { simulation: plan } }), error => error.code === 'DAC_UNKNOWN' && error.message.includes('dac'));
  assert.equal(analog.calls.length, 1); assert.equal(engine.running, false);
});
test('compiler topology errors prevent all worker stages', async () => {
  const analog = new ImmediateAnalog(), digital = new ImmediateDigital(), engine = new WorkbenchEngine({ analogEngine: analog, digitalEngine: digital });
  await assert.rejects(engine.run('plan', { project: {}, generated: { simulation: mixedPlan(), diagnostics: [{ severity: 'error', message: 'DAC-to-ADC feedback is unsupported.' }] } }), /feedback/);
  assert.equal(analog.calls.length, 0); assert.equal(digital.calls.length, 0);
});
test('failed digital compilation cannot fall through to the analog runner', async () => {
  const analog = new ImmediateAnalog(), digital = new ImmediateDigital(), engine = new WorkbenchEngine({ analogEngine: analog, digitalEngine: digital });
  await assert.rejects(engine.run('not SPICE', { generated: { simulation: null, diagnostics: [{ severity: 'error', message: 'Invalid digital delay.' }] } }), /Invalid digital delay/);
  assert.equal(analog.calls.length, 0); assert.equal(digital.calls.length, 0);
});
test('stop at a stage announcement cannot start a new worker after cancellation', async () => {
  const analog = new ImmediateAnalog(), digital = new ImmediateDigital(), engine = new WorkbenchEngine({ analogEngine: analog, digitalEngine: digital });
  await assert.rejects(engine.run('plan', { generated: { simulation: { mode: 'digital', duration: simplePlan.duration, digital: simplePlan } }, onLog: () => engine.stop() }), error => error.status === 'cancelled');
  assert.equal(digital.calls.length, 0); assert.equal(analog.calls.length, 0); assert.equal(engine.running, false);
});
test('cancellation during analog replay terminates the active stage and prevents later stages', async () => {
  let rejectPending, stopped = 0;
  const analog = { running: false, run() { this.running = true; return new Promise((_, reject) => { rejectPending = reject; }); }, stop() { if (!this.running) return false; this.running = false; stopped++; rejectPending(Object.assign(new Error('cancelled'), { status: 'cancelled' })); return true; } };
  const digital = new ImmediateDigital(), engine = new WorkbenchEngine({ analogEngine: analog, digitalEngine: digital, netlistGenerator: () => ({ netlist: 'held deck', diagnostics: [] }) });
  const promise = engine.run('plan', { project: {}, generated: { simulation: mixedPlan() } });
  assert.equal(engine.running, true); assert.equal(engine.stop(), true);
  await assert.rejects(promise, error => error.status === 'cancelled'); assert.equal(stopped, 1); assert.equal(digital.calls.length, 0);
});
test('one global watchdog bounds the entire mixed run and retains timeout status', async () => {
  let rejectPending, stopped = 0;
  const analog = { running: false, run() { this.running = true; return new Promise((_, reject) => { rejectPending = reject; }); }, stop() { if (!this.running) return false; this.running = false; stopped++; rejectPending(Object.assign(new Error('cancelled internally'), { status: 'cancelled' })); return true; } };
  const digital = new ImmediateDigital(), engine = new WorkbenchEngine({ analogEngine: analog, digitalEngine: digital, netlistGenerator: () => ({ netlist: 'held deck', diagnostics: [] }) });
  await assert.rejects(engine.run('plan', { project: {}, generated: { simulation: mixedPlan() }, timeoutMs: 100 }), error => error.status === 'timed-out');
  assert.equal(stopped, 1); assert.equal(digital.calls.length, 0); assert.equal(engine.running, false);
});
