import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateDigital, evaluateGate, resolveLogic, analogToDigitalEvents, digitalToPWL } from '../src/digital.js';
import { mergeEventResults } from '../src/simulation.js';
const ns = 1e-9;
const source = (id, output, events) => ({ id, output, kind: 'events', events: events.map(([t, value]) => ({ time: t * ns, value })) });
const constant = (id, output, value) => ({ id, output, kind: 'constant', value });
const gate = (id, type, inputs, output, delay = 2) => ({ id, type, inputs, output, delay: delay * ns });
const run = (sources, gates = [], duration = 50, options) => simulateDigital({ sources, gates, duration: duration * ns }, options);
const events = (result, node) => result.traces.find(trace => trace.node === node).events.map(event => [Math.round(event.time / 1e-12), event.value]);

test('four-state truth tables preserve controlling values and unknown inputs', () => {
  const states = ['0', '1', 'X', 'Z'];
  for (const a of states) for (const b of states) {
    const and = a === '0' || b === '0' ? '0' : a === '1' && b === '1' ? '1' : 'X';
    const or = a === '1' || b === '1' ? '1' : a === '0' && b === '0' ? '0' : 'X';
    const xor = ['0', '1'].includes(a) && ['0', '1'].includes(b) ? String(a !== b ? 1 : 0) : 'X';
    assert.equal(evaluateGate('AND', [a, b]), and); assert.equal(evaluateGate('OR', [a, b]), or); assert.equal(evaluateGate('XOR', [a, b]), xor);
    for (const [kind, value] of [['NAND', and], ['NOR', or], ['XNOR', xor]]) assert.equal(evaluateGate(kind, [a, b]), value === 'X' ? 'X' : value === '0' ? '1' : '0');
  }
  assert.equal(evaluateGate('NOT', ['Z']), 'X'); assert.equal(evaluateGate('BUF', ['X']), 'X');
});
test('net resolution distinguishes floating, contention and unknown drivers', () => {
  assert.equal(resolveLogic([]), 'Z'); assert.equal(resolveLogic(['Z', 'Z']), 'Z'); assert.equal(resolveLogic(['0', 'Z', '0']), '0');
  assert.equal(resolveLogic(['0', '1']), 'X'); assert.equal(resolveLogic(['X', 'Z']), 'X'); assert.throws(() => resolveLogic(['?']), /Invalid logic state/);
});
test('initial combinational state settles without an artificial delayed X pulse', () => {
  const r = run([constant('s', 'a', '0')], [gate('n', 'NOT', ['a'], 'b'), gate('m', 'NOT', ['b'], 'c')]);
  assert.deepEqual(events(r, 'b'), [[0, '1']]); assert.deepEqual(events(r, 'c'), [[0, '0']]);
});
test('transport delay preserves pulses shorter than propagation delay', () => {
  const r = run([source('s', 'a', [[0, '0'], [1, '1'], [2, '0']])], [gate('b', 'BUF', ['a'], 'out', 5)]);
  assert.deepEqual(events(r, 'out'), [[0, '0'], [6000, '1'], [7000, '0']]);
});
test('simultaneous input changes are atomic and do not invent an XOR glitch', () => {
  const a = source('a', 'a', [[0, '0'], [10, '1']]), b = source('b', 'b', [[0, '0'], [10, '1']]);
  const g = [gate('g', 'XOR', ['a', 'b'], 'out')];
  assert.deepEqual(events(run([a, b], g), 'out'), [[0, '0']]);
  assert.deepEqual(run([a, b], g).traces, run([b, a], g).traces);
});
test('simultaneous drivers resolve into explicit X and Z trace intervals', () => {
  const r = run([source('a', 'bus', [[0, '0'], [20, 'Z']]), source('b', 'bus', [[0, 'Z'], [10, '1'], [30, 'Z']])]);
  assert.deepEqual(events(r, 'bus'), [[0, '0'], [10000, 'X'], [20000, '1'], [30000, 'Z']]);
});
test('active-high tri-state buffer has genuine high-impedance and uncertain enable states', () => {
  const r = run([constant('d', 'd', '1'), source('e', 'e', [[0, '0'], [10, '1'], [20, 'X'], [30, '0']])], [gate('t', 'TRI', ['d', 'e'], 'out')]);
  assert.deepEqual(events(r, 'out'), [[0, 'Z'], [12000, '1'], [22000, 'X'], [32000, 'Z']]);
});
test('DFF samples post-batch D when D and rising clock change simultaneously', () => {
  const d = source('d', 'd', [[0, '0'], [10, '1']]), c = source('c', 'c', [[0, '0'], [10, '1']]);
  const gates = [{ ...gate('f', 'DFF', ['d', 'c'], 'q'), initial: '0' }];
  assert.deepEqual(events(run([d, c], gates), 'q'), [[0, '0'], [12000, '1']]);
  assert.deepEqual(run([d, c], gates).traces, run([c, d], gates).traces);
});
test('ambiguous possible clock edge propagates X and later known edge recovers', () => {
  const r = run([constant('d', 'd', '1'), source('c', 'c', [[0, '0'], [10, 'X'], [20, '1'], [25, '0'], [30, '1']])], [{ ...gate('f', 'DFF', ['d', 'c'], 'q'), initial: '0' }]);
  assert.deepEqual(events(r, 'q'), [[0, '0'], [12000, 'X'], [32000, '1']]);
});
test('explicit flip-flop state permits a feedback toggle circuit', () => {
  const r = run([{ id: 'clk', output: 'clk', kind: 'clock', period: 20 * ns, duty: .5, delay: 10 * ns }], [gate('n', 'NOT', ['q'], 'd', 1), { ...gate('f', 'DFF', ['d', 'clk'], 'q'), initial: '0' }], 60);
  assert.deepEqual(events(r, 'q'), [[0, '0'], [12000, '1'], [32000, '0'], [52000, '1']]);
});
test('combinational feedback is rejected independently of the schematic checker', () => {
  assert.throws(() => run([], [gate('a', 'NOT', ['y'], 'x'), gate('b', 'NOT', ['x'], 'y')]), /Combinational digital feedback/);
});
test('clock produces explicit duty and phase timing', () => {
  const r = run([{ id: 'clk', output: 'clk', kind: 'clock', period: 20 * ns, duty: .25, delay: 5 * ns }], [], 40);
  assert.deepEqual(events(r, 'clk'), [[0, '0'], [5000, '1'], [10000, '0'], [25000, '1'], [30000, '0']]);
});
test('timing resolution and explicit budgets reject unsupported requests', () => {
  assert.throws(() => run([constant('s', 'a', '0')], [{ ...gate('b', 'BUF', ['a'], 'b'), delay: .75e-12 }]), /at least 1 ps/);
  assert.throws(() => run([{ id: 'c', output: 'c', kind: 'clock', period: 2 * ns, duty: .5, delay: 0 }], [], 50, { maxEvents: 5 }), /event budget/);
  assert.throws(() => run([constant('s', 'a', '0'), constant('s', 'b', '1')]), /identifiers must be unique/);
});
test('threshold ADC emits an explicit X band at interpolated crossings', () => {
  const result = analogToDigitalEvents([0, 10 * ns, 20 * ns], [0, 5, 0], 1, 4);
  assert.deepEqual(result.map(e => [Math.round(e.time / 1e-12), e.value]), [[0, '0'], [2000, 'X'], [8000, '1'], [12000, 'X'], [18000, '0']]);
});
test('Schmitt ADC holds known state in the band and never invents a known initial state', () => {
  const result = analogToDigitalEvents([0, 10 * ns, 20 * ns, 30 * ns, 40 * ns], [2.5, 5, 2.5, 0, 2.5], 1, 4, { mode: 'schmitt' });
  assert.deepEqual(result.map(e => [Math.round(e.time / 1e-12), e.value]), [[0, 'X'], [6000, '1'], [26000, '0']]);
  assert.deepEqual(analogToDigitalEvents([0, 10 * ns], [0, 2.5], 1, 4, { mode: 'schmitt' }), [{ time: 0, value: '0' }]);
});
test('ADC refuses malformed traces and thresholds', () => {
  assert.throws(() => analogToDigitalEvents([0, 0], [0, 5], 1, 4), /strictly increasing/);
  assert.throws(() => analogToDigitalEvents([0, 1], [0, NaN], 1, 4), /finite/);
  assert.throws(() => analogToDigitalEvents([0, 1], [0, 5], 4, 1), /low threshold/);
});
test('DAC rejects unknown and high-impedance states explicitly', () => {
  for (const value of ['X', 'Z']) assert.throws(() => digitalToPWL([{ time: 0, value: '0' }, { time: ns, value }], { low: 0, high: 5, rise: ns, fall: ns }, 10 * ns), /requires known 0\/1/);
});
test('finite DAC edges preserve transition starts and interrupt an unfinished ramp', () => {
  const points = digitalToPWL([{ time: 0, value: '0' }, { time: ns, value: '1' }, { time: 3 * ns, value: '0' }], { low: 0, high: 5, rise: 10 * ns, fall: 5 * ns }, 10 * ns);
  assert.deepEqual(points.map(([t, v]) => [Math.round(t / 1e-12), Math.round(v * 1e9) / 1e9]), [[0, 0], [1000, 0], [3000, 1], [8000, 0], [10000, 0]]);
});
test('mixed union preserves every native time and value and identifies interpolated rows', () => {
  const analog = { points: 3, vectors: [{ name: 'time', unit: 's', values: [0, 2 * ns, 4 * ns] }, { name: 'v(out)', unit: 'V', values: [0, 2, 0] }] };
  const digital = run([source('s', 'a', [[0, '0'], [1, '1'], [3, '0']])], [], 4);
  const result = mergeEventResults(analog, digital);
  assert.deepEqual(result.sampling.analogSampleIndices, [0, 2, 4]);
  result.vectors[1].values.forEach((value, i) => assert.ok(Math.abs(value - [0, 1, 2, 1, 0][i]) < 1e-12));
  assert.deepEqual(result.vectors[2].values, ['0', '1', '1', '0', '0']);
  for (let i = 0; i < 3; i++) { const j = result.sampling.analogSampleIndices[i]; assert.equal(result.vectors[0].values[j], analog.vectors[0].values[i]); assert.equal(result.vectors[1].values[j], analog.vectors[1].values[i]); }
});
test('pure digital result has an explicit event axis, literal states and endpoint', () => {
  const result = mergeEventResults(null, run([constant('s', 'a', 'Z')], [], 10));
  assert.equal(result.sampling.mode, 'digital-events'); assert.deepEqual(result.sampling.analogSampleIndices, []); assert.equal(result.points, 2);
  assert.deepEqual(result.vectors[1], { name: 'd(a)', unit: 'logic', kind: 'logic', values: ['Z', 'Z'] });
});
test('mixed merging rejects missing initial sample instead of extrapolating a waveform', () => {
  assert.throws(() => mergeEventResults({ vectors: [{ name: 'time', values: [ns, 2 * ns] }] }, run([constant('s', 'a', '0')])), /native analog sample at time zero/);
});
test('fractional-picosecond analog duration clips a rounded-up digital event from sparse evidence', () => {
  const analog = { vectors: [{ name: 'time', unit: 's', values: [0, 1.6e-12] }, { name: 'v(out)', unit: 'V', values: [0, 5] }] };
  const digital = simulateDigital({ duration: 1.6e-12, sources: [{ id: 's', output: 'a', kind: 'events', events: [{ time: 0, value: '0' }, { time: 1.6e-12, value: '1' }] }], gates: [] });
  assert.equal(digital.traces[0].events.at(-1).time, 2e-12);
  const result = mergeEventResults(analog, digital);
  assert.deepEqual(result.digitalEvents, [{ name: 'd(a)', events: [{ time: 0, value: '0' }] }]);
  assert.deepEqual(result.vectors[2].values, ['0', '0']); assert.equal(result.vectors[0].values.at(-1), 1.6e-12);
});
