import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { CoordinatedEngine } from '../src/coordinated-engine.js';
import { compileCoordinated } from '../src/coordinated.js';
import { generateNetlist } from '../src/netlist.js';
import { DISPLAY_EXAMPLES } from '../src/examples-displays.js';

const protocol = 'circuitbench-coordinated-worker-1';
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const plan = { duration: 3 };
const chunk = (start, end, done = true) => ({ points: 2, vectors: [{ name: 'time', unit: 's', values: [start, end] }, { name: 'v(out)', unit: 'V', values: [start, end] }, { name: 'd(bit)', unit: 'logic', kind: 'logic', values: [String(start % 2), String(end % 2)] }], digitalEvents: [{ name: 'd(bit)', events: start % 2 === end % 2 ? [{ time: start, value: String(start % 2) }] : [{ time: start, value: String(start % 2) }, { time: end, value: String(end % 2) }] }], done, sampling: { mode: 'coordinated-events', analogInterpolation: 'none', timeResolution: 1e-12 }, logs: [], warnings: [] });
class FakeWorker {
  constructor(handler, ready = true) { this.messages = []; this.terminated = 0; this.handler = handler; if (ready) queueMicrotask(() => this.emit({ type: 'ready', protocol })); }
  emit(data) { this.onmessage?.({ data }); }
  result(message, result) { this.emit({ type: 'result', id: message.id, result }); }
  postMessage(message) { this.messages.push(message); this.handler?.(message, this); }
  terminate() { this.terminated++; }
}
function fake(handler, ready = true) {
  const workers = [], engine = new CoordinatedEngine({ workerFactory: () => { const worker = new FakeWorker(handler ?? ((message, worker) => worker.result(message, message.type === 'initialize' ? { time: 0 } : chunk(0, 3))), ready); workers.push(worker); return worker; } });
  return { engine, workers };
}

test('a bounded run joins partial commands exactly and respects the worker step limit', async () => {
  let at = 0;
  const { engine, workers } = fake((message, worker) => {
    if (message.type === 'initialize') worker.result(message, { time: 0 });
    else { assert.equal(message.maxSteps, 20000); const next = at + 1; worker.result(message, chunk(at, next, next === 3)); at = next; }
  });
  const result = await engine.run(plan);
  assert.deepEqual(result.vectors[0].values, [0, 1, 2, 3]); assert.deepEqual(result.digitalEvents[0].events, [{ time: 0, value: '0' }, { time: 1, value: '1' }, { time: 2, value: '0' }, { time: 3, value: '1' }]);
  assert.deepEqual(result.sampling.timeBounds, [0, 3]); assert.deepEqual(result.sampling.analogSampleIndices, [0, 1, 2, 3]); assert.equal(workers[0].messages.length, 4); assert.equal(workers[0].terminated, 1); assert.equal(engine.running, false);
});

test('a failed BUSY run cannot close an existing paused stateful session', async () => {
  const { engine, workers } = fake(); await engine.start(plan); assert.equal(engine.running, true); assert.equal(engine.busy, false);
  await assert.rejects(engine.run(plan), error => error.code === 'COORDINATED_BUSY'); assert.equal(engine.running, true); assert.equal(workers[0].terminated, 0); engine.close(); assert.equal(workers[0].terminated, 1);
});

test('cancelled old-run cleanup cannot terminate a replacement session', async () => {
  const { engine, workers } = fake((message, worker) => { if (message.type === 'initialize') worker.result(message, { time: 0 }); });
  const first = engine.run(plan); await settle(); assert.equal(workers[0].messages.at(-1).type, 'advance'); engine.stop(); const second = engine.start(plan);
  await assert.rejects(first, error => error.status === 'cancelled'); await second; assert.equal(engine.running, true); assert.equal(workers[0].terminated, 1); assert.equal(workers[1].terminated, 0); engine.close();
});

test('a Stop after a result is delivered still prevents publication and preserves the replacement', async () => {
  const { engine, workers } = fake((message, worker) => { if (message.type === 'initialize') worker.result(message, { time: 0 }); });
  const first = engine.run(plan); await settle(); workers[0].result(workers[0].messages.at(-1), chunk(0, 3)); engine.stop(); const second = engine.start(plan);
  await assert.rejects(first, error => error.code === 'COORDINATED_CANCELLED'); await second; assert.equal(workers[1].terminated, 0); engine.close();
});

test('ready handshake is mandatory and malformed idle messages cannot dereference a pending command', async () => {
  const { engine, workers } = fake(undefined, false), initializing = engine.start(plan);
  workers[0].emit({ type: 'result', id: 1, result: {} }); await assert.rejects(initializing, error => error.code === 'COORDINATED_PROTOCOL'); assert.equal(workers[0].terminated, 1);
  const next = fake(); await next.engine.start(plan); assert.doesNotThrow(() => next.workers[0].emit({ type: 'result', result: {} })); assert.doesNotThrow(() => next.workers[0].emit({ type: 'error', message: 'No id' })); assert.equal(next.engine.running, true); next.engine.close();
});

test('protocol mismatch, worker startup error and transfer error terminate exactly once', async () => {
  for (const mode of ['protocol', 'startup', 'transfer']) {
    const { engine, workers } = fake(undefined, false), pending = engine.start(plan);
    if (mode === 'protocol') workers[0].emit({ type: 'ready', protocol: 'wrong' });
    if (mode === 'startup') workers[0].onerror({ message: 'module refused', filename: 'asset.js', preventDefault() {} });
    if (mode === 'transfer') workers[0].onmessageerror();
    await assert.rejects(pending, error => error.status === 'failed'); assert.equal(engine.running, false); assert.equal(workers[0].terminated, 1); engine.stop(); assert.equal(workers[0].terminated, 1);
  }
});

test('synchronous request-transfer failures reject and dispose the owned worker', async () => {
  const { engine, workers } = fake(() => { throw new Error('clone failed'); }); await assert.rejects(engine.start(plan), error => error.code === 'COORDINATED_TRANSFER'); assert.equal(workers[0].terminated, 1); assert.equal(engine.running, false);
});

test('Stop or a thrown log callback during startup cannot post initialization afterward', async () => {
  for (const throws of [false, true]) { const { engine, workers } = fake(); const pending = engine.start(plan, { onLog: () => { if (throws) throw new Error('UI gone'); engine.stop(); } }); await assert.rejects(pending, error => throws ? error.code === 'COORDINATED_CALLBACK' : error.status === 'cancelled'); assert.equal(workers[0].messages.length, 0); assert.equal(workers[0].terminated, 1); }
});

test('idle worker failures notify the owner so a paused controller cannot remain falsely usable', async () => {
  const { engine, workers } = fake(), failures = []; await engine.start(plan, { onFailure: error => failures.push(error) }); workers[0].onerror({ message: 'worker disappeared', preventDefault() {} });
  assert.equal(failures.length, 1); assert.equal(failures[0].code, 'COORDINATED_WORKER_ERROR'); assert.equal(engine.running, false); assert.equal(workers[0].terminated, 1);
});

test('a single total timeout bounds all partial commands, not each command independently', async () => {
  let at = 0;
  const { engine, workers } = fake((message, worker) => { if (message.type === 'initialize') worker.result(message, { time: 0 }); else setTimeout(() => { const next = ++at; worker.result(message, chunk(next - 1, next, next === 3)); }, 20); });
  await assert.rejects(engine.run(plan, { timeoutMs: 35 }), error => error.status === 'timed-out'); assert.equal(workers[0].terminated, 1); assert.equal(engine.running, false);
});

test('nonadvancing, gapped, overshot or false-done chunks never count as a completed run', async () => {
  for (const returned of [chunk(1, 3), chunk(0, 4), chunk(0, 2, true), chunk(0, 3, false)]) {
    const { engine, workers } = fake((message, worker) => worker.result(message, message.type === 'initialize' ? { time: 0 } : returned));
    await assert.rejects(engine.run(plan), error => error.code === 'COORDINATED_STALLED'); assert.equal(workers[0].terminated, 1);
  }
});

test('a worker-reported numerical failure keeps its diagnostic and terminates before a later step', async () => {
  const { engine, workers } = fake((message, worker) => message.type === 'initialize' ? worker.result(message, { time: 0 }) : worker.emit({ type: 'error', id: message.id, code: 'COORDINATED_SINGULAR', message: 'Floating node', phase: 'coordinated-simulation' }));
  await assert.rejects(engine.run(plan), error => error.code === 'COORDINATED_SINGULAR' && error.message === 'Floating node'); assert.equal(workers[0].terminated, 1); assert.equal(workers[0].messages.length, 2);
});

test('actual coordinated Worker preserves counter/display phase over paused advances and then terminates', async () => {
  const threads = [], exits = [], counts = { created: 0, terminated: 0, alive: 0 };
  const workerFactory = target => {
    counts.created++; counts.alive++; const thread = new NodeWorker(new URL('../scripts/engine-node-worker.mjs', import.meta.url), { workerData: { target: String(target) } }); threads.push(thread);
    const adapter = { postMessage: message => thread.postMessage(message), terminate: () => { counts.terminated++; return thread.terminate(); } };
    thread.on('message', data => adapter.onmessage?.({ data })); thread.on('error', error => adapter.onerror?.({ message: error.message, preventDefault() {} })); exits.push(new Promise(resolve => thread.on('exit', () => { counts.alive--; resolve(); })));
    return adapter;
  };
  const engine = new CoordinatedEngine({ workerFactory });
  try {
    const project = DISPLAY_EXAMPLES[0].create(), compiled = compileCoordinated(project, generateNetlist(project)); await engine.start(compiled);
    const first = await engine.advanceTo(.0006, { maxSteps: 2000 }); assert.equal(first.digitalEvents.find(entry => entry.name === 'b(segments)').events.at(-1).value, '00000110');
    assert.equal(engine.running, true); assert.equal(engine.busy, false); assert.equal(counts.terminated, 0);
    const second = await engine.advanceTo(.0016, { maxSteps: 2000 }); assert.equal(second.vectors[0].values[0], first.vectors[0].values.at(-1)); assert.equal(second.digitalEvents.find(entry => entry.name === 'b(segments)').events.at(-1).value, '01011011');
    engine.close(); await Promise.all(exits); assert.deepEqual(counts, { created: 1, terminated: 1, alive: 0 });
  } finally { engine.close(); await Promise.all(threads.map(thread => thread.terminate())); }
});

test('actual bounded Worker run spans more than 20,000 accepted steps without restarting state', async () => {
  const counts = { created: 0, terminated: 0 }, exits = [];
  const engine = new CoordinatedEngine({ workerFactory: target => {
    counts.created++; const thread = new NodeWorker(new URL('../scripts/engine-node-worker.mjs', import.meta.url), { workerData: { target: String(target) } });
    const adapter = { postMessage: message => thread.postMessage(message), terminate: () => { counts.terminated++; return thread.terminate(); } };
    thread.on('message', data => adapter.onmessage?.({ data })); thread.on('error', error => adapter.onerror?.({ message: error.message, preventDefault() {} })); exits.push(new Promise(resolve => thread.on('exit', resolve))); return adapter;
  } });
  const analog = { kind: 'coordinated-transient', version: 1, duration: .021, maxStep: 1e-6, analog: { nodes: ['in', 'out'], elements: [{ id: 'v', ref: 'V1', type: 'V', p: 'in', n: '0', wave: { kind: 'dc', dc: 1 } }, { id: 'r', ref: 'R1', type: 'R', p: 'in', n: 'out', value: 1000 }, { id: 'c', ref: 'C1', type: 'C', p: 'out', n: '0', value: 1e-6, ic: 0 }], uic: true }, digital: {}, adcs: [], dacs: [], controls: [] };
  try { const result = await engine.run(analog, { timeoutMs: 15000 }); assert.equal(result.points, 21001); assert.equal(result.stats.chunks, 2); assert.equal(result.sampling.timeBounds[0], 0); assert.ok(Math.abs(result.vectors[0].values.at(-1) - .021) < 1e-15); assert.ok(result.vectors.find(vector => vector.name === 'v(out)').values.at(-1) > .99999); await Promise.all(exits); assert.deepEqual(counts, { created: 1, terminated: 1 }); }
  finally { engine.close(); }
});
