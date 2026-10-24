import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { generateTruthTable } from '../src/digital.js';
import { WorkbenchEngine } from '../src/simulation.js';
const ns = 1e-9;
const constant = (id, output, value = '0') => ({ id, output, kind: 'constant', value });
function andPlan() { return { sources: [constant('a', 'a'), constant('b', 'b')], gates: [{ id: 'g', type: 'AND', inputs: ['a', 'b'], output: 'out', delay: 10 * ns }], inputGroups: [{ id: 'A', label: 'A', width: 1, sources: ['a'] }, { id: 'B', label: 'B', width: 1, sources: ['b'] }] }; }

test('truth table enumerates selected inputs in declared significance order through timed logic', () => {
  const result = generateTruthTable(andPlan(), { inputIds: ['A', 'B'], outputNames: ['d(out)'] });
  assert.equal(result.kind, 'truth-table'); assert.deepEqual(result.rows.map(row => [row.inputs.join(''), row.outputs[0]]), [['00', '0'], ['01', '0'], ['10', '0'], ['11', '1']]);
  assert.ok(Math.abs(result.settleTime - (10 * ns + 2e-12)) < 1e-20); assert.equal(result.outputs[0].width, 1);
});
test('truth table settles the longest reconvergent path and preserves fixed unknown drivers', () => {
  const plan = andPlan(); plan.sources[1].value = 'X'; plan.gates.push({ id: 'n', type: 'NOT', inputs: ['out'], output: 'inv', delay: 7 * ns });
  const result = generateTruthTable(plan, { inputIds: ['A'], outputNames: ['d(inv)'] });
  assert.deepEqual(result.rows.map(row => row.outputs[0]), ['1', 'X']); assert.ok(Math.abs(result.settleTime - (17 * ns + 2e-12)) < 1e-20);
});
test('eight selected bus bits produce at most 256 literal-word rows without exposing private bits', () => {
  const nodes = Array.from({ length: 8 }, (_, i) => `a${i}`), plan = { sources: nodes.map(node => constant(node, node)), gates: [], inputGroups: [{ id: 'A', label: 'Input word', width: 8, sources: nodes }], buses: [{ name: 'b(a)', width: 8, bits: nodes }], hiddenNodes: nodes };
  const result = generateTruthTable(plan, { inputIds: ['A'], outputNames: ['b(a)'] });
  assert.equal(result.rows.length, 256); assert.deepEqual(result.rows[0].outputs, ['00000000']); assert.deepEqual(result.rows[255].outputs, ['11111111']);
  assert.deepEqual(result.outputs[0], { name: 'b(a)', kind: 'bus', width: 8, bitOrder: 'msb-first' });
});
test('truth tables reject clocks, patterns, state and combinational cycles', () => {
  for (const mutate of [p => p.sources[0].kind = 'clock', p => p.sources[0].kind = 'pattern', p => p.sequential = [{}], p => p.gates[0].type = 'DFF']) { const p = andPlan(); mutate(p); assert.throws(() => generateTruthTable(p), /pure combinational/); }
  const p = andPlan(); p.gates[0].inputs[0] = 'out'; assert.throws(() => generateTruthTable(p), /feedback/);
});
test('truth-table input, output and shared work limits fail explicitly', () => {
  assert.throws(() => generateTruthTable(andPlan(), { inputIds: [] }), /Select one/);
  assert.throws(() => generateTruthTable(andPlan(), { inputIds: ['A', 'A'] }), /distinct/);
  assert.throws(() => generateTruthTable(andPlan(), { inputIds: ['missing'] }), /not a constant/);
  assert.throws(() => generateTruthTable(andPlan(), { outputNames: ['missing'] }), /not a visible/);
  assert.throws(() => generateTruthTable(andPlan(), { maxEvents: 2 }), /event budget|event-budget|event budget|event/);
  const p = andPlan(); for (let i = 0; i < 33; i++) p.sources.push(constant(`extra${i}`, `extra${i}`));
  assert.throws(() => generateTruthTable(p, { outputNames: Array.from({ length: 33 }, (_, i) => `d(extra${i})`) }), /1–32/);
});
test('workbench rejects mixed truth tables before starting a worker', async () => {
  const engine = new WorkbenchEngine();
  await assert.rejects(engine.runTruthTable({ simulation: { mode: 'mixed', digital: andPlan(), adcs: [{}] } }), /without analog components/);
  assert.equal(engine.running, false);
});
test('truth-table worker is exclusive, disposable, cancellable and recoverable', async () => {
  const previous = globalThis.Worker, exits = [], threads = []; let created = 0, terminated = 0, alive = 0;
  globalThis.Worker = class {
    constructor(target) { created++; alive++; this.thread = new NodeWorker(new URL('../scripts/engine-node-worker.mjs', import.meta.url), { workerData: { target: String(target) } }); threads.push(this.thread); this.thread.on('message', data => this.onmessage?.({ data })); this.thread.on('error', error => this.onerror?.({ message: error.message, preventDefault() {} })); exits.push(new Promise(resolve => this.thread.on('exit', () => { alive--; resolve(); }))); }
    postMessage(message) { this.thread.postMessage(message); }
    terminate() { terminated++; return this.thread.terminate(); }
  };
  try {
    const engine = new WorkbenchEngine(), generated = { diagnostics: [], simulation: { mode: 'digital', digital: andPlan(), adcs: [], dacs: [] } };
    const first = engine.runTruthTable(generated, { inputIds: ['A', 'B'], outputNames: ['d(out)'] }); assert.equal(engine.running, true);
    await assert.rejects(engine.run('other run'), /already running/); assert.equal((await first).rows.length, 4); assert.equal(engine.running, false);
    await assert.rejects(engine.runTruthTable(generated, { onLog: () => engine.stop() }), error => error.status === 'cancelled');
    await assert.rejects(engine.runTruthTable(generated, { timeoutMs: 1 }), error => error.status === 'timed-out');
    assert.equal((await engine.runTruthTable(generated, { outputNames: ['d(out)'] })).rows.length, 4);
    await Promise.all(exits); assert.equal(created, 4); assert.equal(terminated, 4); assert.equal(alive, 0);
  } finally { globalThis.Worker = previous; await Promise.all(threads.map(thread => thread.terminate())); }
});
