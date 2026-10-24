/** Numerical acceptance using the production WASM worker, not a mock solver. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';
import { EXAMPLES } from '../src/examples.js';
import { generateNetlist } from '../src/netlist.js';
import { uid } from '../src/model.js';
import { runExperiment, measureExperimentSource, validateExperimentRecords } from '../src/experiments.js';

const originalWorker = globalThis.Worker, lifecycle = { created: 0, terminated: 0, alive: 0 }, exits = [];
let stage, CircuitEngine;
before(async () => {
  stage = await fs.mkdtemp(path.join(os.tmpdir(), 'circuitbench-experiments-worker-'));
  await fs.mkdir(path.join(stage, 'src')); await fs.writeFile(path.join(stage, 'package.json'), '{"type":"module"}');
  for (const file of ['engine.js', 'engine-worker.js']) await fs.copyFile(new URL('../src/' + file, import.meta.url), path.join(stage, 'src', file));
  await fs.cp(new URL('../public/engine/', import.meta.url), path.join(stage, 'engine'), { recursive: true });
  globalThis.Worker = class {
    constructor(target) {
      lifecycle.created++; lifecycle.alive++;
      this.thread = new NodeWorker(new URL('../scripts/engine-node-worker.mjs', import.meta.url), { workerData: { target: String(target) } });
      this.thread.on('message', data => this.onmessage?.({ data })); this.thread.on('error', error => this.onerror?.({ message: error.message, preventDefault() {} }));
      exits.push(new Promise(resolve => this.thread.on('exit', () => { lifecycle.alive--; resolve(); })));
    }
    postMessage(message) { this.thread.postMessage(message); }
    terminate() { lifecycle.terminated++; return this.thread.terminate(); }
  };
  ({ CircuitEngine } = await import(pathToFileURL(path.join(stage, 'src', 'engine.js'))));
});
after(async () => { await Promise.all(exits); globalThis.Worker = originalWorker; if (stage) await fs.rm(stage, { recursive: true, force: true }); });
const project = id => EXAMPLES.find(example => example.id === id).create();
const close = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected} ± ${tolerance}`);
async function runTrial(p, { signal } = {}) {
  const generated = generateNetlist(p), errors = generated.diagnostics.filter(item => item.severity === 'error');
  assert.deepEqual(errors, [], 'The actual trial must compile before simulation.');
  const engine = new CircuitEngine(), cancel = () => engine.stop();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) throw Object.assign(new Error('Cancelled before worker creation'), { status: 'cancelled' });
    const result = await engine.run(generated.netlist, { timeoutMs: 15000 });
    return { id: uid('run'), projectId: p.id, revision: p.revision, projectSnapshot: structuredClone(p), analysis: structuredClone(p.analysis), status: result.warnings.length ? 'completed-with-warnings' : 'completed', netlist: generated.netlist, measurements: generated.measurements, engine: result.engine, result };
  } finally { signal?.removeEventListener('abort', cancel); engine.stop(); }
}

test('production WASM divider sweep agrees with the independent resistor-divider equation', async () => {
  const p = project('divider'), resistors = p.circuit.components.filter(item => item.type === 'R');
  const record = await runExperiment(p, { kind: 'sweep', target: { componentId: resistors[0].id, key: 'value' }, count: 3, spacing: 'linear', start: '10k', stop: '30k', measurement: { signal: 'node:mid', kind: 'final' } }, { runTrial });
  assert.equal(record.summary.measuredCount, 3);
  for (const [index, expected] of [5, 10 / 3, 2.5].entries()) close(record.trials[index].measurement.value, expected, 1e-8);
  assert.equal(record.trials[0].engine.name, 'ngspice');
  assert.deepEqual(validateExperimentRecords([JSON.parse(JSON.stringify(record))])[0], record);
});

test('production WASM tolerance study matches its exact reproducible resistor values', async () => {
  const p = project('divider'), resistors = p.circuit.components.filter(item => item.type === 'R');
  const record = await runExperiment(p, { kind: 'monte-carlo', count: 5, seed: 424242, targets: resistors.map(item => ({ componentId: item.id, key: 'value', tolerance: 10 })), measurement: { signal: 'node:mid', kind: 'final' } }, { runTrial });
  assert.equal(record.summary.measuredCount, 5);
  for (const trial of record.trials) { const [top, bottom] = trial.parameters.map(item => item.value); close(trial.measurement.value, 10 * bottom / (top + bottom), 1e-8); }
  assert.ok(record.summary.standardDeviation > 0);
});

test('production WASM RC AC sweep agrees with independent complex transfer-function magnitude and phase', async () => {
  const p = project('rc-filter'), resistor = p.circuit.components.find(item => item.type === 'R'), frequency = 1 / (2 * Math.PI * 10000 * 100e-9);
  const record = await runExperiment(p, { kind: 'sweep', target: { componentId: resistor.id, key: 'value' }, count: 3, spacing: 'log', start: '5k', stop: '20k', measurement: { signal: 'node:out', kind: 'ac-magnitude', frequency } }, { runTrial });
  assert.equal(record.summary.measuredCount, 3);
  for (const trial of record.trials) {
    const omegaRC = 2 * Math.PI * frequency * trial.parameters[0].value * 100e-9;
    close(trial.measurement.value, 1 / Math.sqrt(1 + omegaRC * omegaRC), .0003);
    const phase = measureExperimentSource(trial.source, { signal: 'node:out', kind: 'ac-phase', frequency });
    close(phase.value, -Math.atan(omegaRC) * 180 / Math.PI, .02);
  }
});

test('production WASM RC transient study preserves samples and independently expected final voltage', async () => {
  const p = project('rc-step'), resistor = p.circuit.components.find(item => item.type === 'R'), source = p.circuit.components.find(item => item.type === 'V'), capacitor = p.circuit.components.find(item => item.type === 'C');
  Object.assign(source.params, { waveform: 'dc', dc: '1', ac: '0' }); capacitor.params.value = '100n'; capacitor.params.ic = '0';
  Object.assign(p.analysis, { type: 'tran', step: '5u', duration: '5m', uic: true });
  const record = await runExperiment(p, { kind: 'sweep', target: { componentId: resistor.id, key: 'value' }, count: 2, spacing: 'linear', start: '10k', stop: '20k', measurement: { signal: 'node:out', kind: 'final' } }, { runTrial });
  assert.equal(record.summary.measuredCount, 2);
  for (const trial of record.trials) {
    assert.ok(trial.source.real.length > 500); assert.equal(trial.source.real.length, trial.source.axis.values.length);
    close(trial.measurement.value, 1 - Math.exp(-.005 / (trial.parameters[0].value * 100e-9)), .0001);
    assert.ok(trial.source.axis.values[0] > 0, 'UIC evidence retains its actual first sample; no invented time-zero sample.');
  }
});

test('all thirteen production trial workers are terminated after completion', async () => {
  await Promise.all(exits); assert.deepEqual(lifecycle, { created: 13, terminated: 13, alive: 0 });
});
