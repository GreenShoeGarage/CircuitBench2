import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateDigital, evaluateGate, visibleDigitalTraces } from '../src/digital.js';
import { mergeEventResults } from '../src/simulation.js';
const ns = 1e-9;
const constant = (id, output, value) => ({ id, output, kind: 'constant', value });
const source = (id, output, pairs) => ({ id, output, kind: 'events', events: pairs.map(([time, value]) => ({ time: time * ns, value })) });
const bits = (prefix, width) => Array.from({ length: width }, (_, i) => `${prefix}${i}`);
const wordSources = (prefix, word) => word.split('').reverse().map((value, i) => constant(`${prefix}_${i}`, `${prefix}${i}`, value));
const bus = (name, nodes) => ({ name: `b(${name})`, width: nodes.length, bits: nodes });
const events = (result, name) => visibleDigitalTraces(result).find(trace => trace.name === name).events.map(e => [Math.round(e.time / 1e-12), e.value]);
const run = plan => simulateDigital({ duration: 30 * ns, gates: [], ...plan });
function group(type, width = 2, extra = {}) { return { id: 'seq', type, ...(type === 'REGISTER' ? { inputs: bits('d', width) } : {}), clock: 'clk', enable: 'en', reset: 'rst', outputs: bits('q', width), initial: '0'.repeat(width), delay: 2 * ns, ...extra }; }
const controls = () => [constant('en', 'en', '1'), constant('rst', 'rst', '0')];

test('MUX uses known selected data and consensus under unknown select', () => {
  assert.equal(evaluateGate('MUX', ['0', '1', '0']), '0'); assert.equal(evaluateGate('MUX', ['0', '1', '1']), '1');
  assert.equal(evaluateGate('MUX', ['1', '1', 'X']), '1'); assert.equal(evaluateGate('MUX', ['0', '0', 'Z']), '0');
  assert.equal(evaluateGate('MUX', ['0', '1', 'X']), 'X'); assert.equal(evaluateGate('MUX', ['Z', '1', '0']), 'X');
});
test('LUT indexes LSB-first inputs and resolves ambiguous binary addresses by consensus', () => {
  const table = ['0', '0', '0', '1'];
  assert.equal(evaluateGate('LUT', ['X', '0'], { table }), '0'); assert.equal(evaluateGate('LUT', ['X', '1'], { table }), 'X');
  assert.equal(evaluateGate('LUT', ['1', '1'], { table }), '1'); assert.equal(evaluateGate('LUT', ['Z', 'X'], { table: ['Z', 'Z', 'Z', 'Z'] }), 'Z');
  assert.throws(() => evaluateGate('LUT', ['0', '1'], { table: ['0', '1'] }), /every binary address/);
});
test('decoder LUT keeps impossible lines low with a partially unknown address', () => {
  const output = target => Array.from({ length: 8 }, (_, address) => address >= 4 && (address & 3) === target ? '1' : '0');
  assert.equal(evaluateGate('LUT', ['X', '1', '1'], { table: output(0) }), '0');
  assert.equal(evaluateGate('LUT', ['X', '1', '1'], { table: output(2) }), 'X');
  assert.equal(evaluateGate('LUT', ['X', 'X', '0'], { table: output(2) }), '0');
});
test('bus aggregation preserves partial X/Z words and hides only private bits', () => {
  const nodes = bits('a', 4), result = run({ sources: wordSources('a', '01XZ'), buses: [bus('data', nodes)], hiddenNodes: nodes });
  assert.deepEqual(events(result, 'b(data)'), [[0, '01XZ']]); assert.equal(visibleDigitalTraces(result).length, 1);
  const merged = mergeEventResults(null, result);
  assert.deepEqual(merged.vectors[1], { name: 'b(data)', kind: 'bus', unit: 'logic', width: 4, bitOrder: 'msb-first', values: ['01XZ', '01XZ'] });
  assert.equal(merged.digitalEvents[0].width, 4); assert.equal(merged.digitalEvents[0].bitOrder, 'msb-first');
});
test('exposed scalar taps remain visible alongside the aggregate word', () => {
  const result = run({ sources: wordSources('a', '10'), buses: [bus('data', bits('a', 2))], hiddenNodes: ['a1'] });
  assert.deepEqual(visibleDigitalTraces(result).map(trace => trace.name), ['d(a0)', 'b(data)']);
});
test('register captures simultaneous data and clock atomically as one word', () => {
  const sources = [...controls(), source('clk', 'clk', [[0, '0'], [10, '1']]), ...bits('d', 4).map((node, bit) => source(node, node, [[0, '0011'[3 - bit]], [10, '1010'[3 - bit]]]))];
  const result = run({ sources, sequential: [group('REGISTER', 4)], buses: [bus('q', bits('q', 4))], hiddenNodes: bits('q', 4) });
  assert.deepEqual(events(result, 'b(q)'), [[0, '0000'], [12000, '1010']]);
});
test('synchronous reset waits for a rising edge and wins over disabled capture', () => {
  const sources = [...wordSources('d', '10'), constant('en', 'en', '0'), source('rst', 'rst', [[0, '0'], [15, '1']]), source('clk', 'clk', [[0, '0'], [10, '1'], [11, '0'], [20, '1']])];
  const result = run({ sources, sequential: [group('REGISTER', 2, { initial: '11' })], buses: [bus('q', bits('q', 2))] });
  assert.deepEqual(events(result, 'b(q)'), [[0, '11'], [22000, '00']]);
});
test('uncertain enable preserves only bits common to hold and capture', () => {
  const sources = [...wordSources('d', '01'), constant('en', 'en', 'X'), constant('rst', 'rst', '0'), source('clk', 'clk', [[0, '0'], [10, '1']])];
  assert.deepEqual(events(run({ sources, sequential: [group('REGISTER')], buses: [bus('q', bits('q', 2))] }), 'b(q)'), [[0, '00'], [12000, '0X']]);
});
test('register state and ambiguous clock policy do not turn a known hold into fabricated data', () => {
  const sources = [...wordSources('d', '11'), constant('en', 'en', '0'), constant('rst', 'rst', '0'), source('clk', 'clk', [[0, '0'], [10, 'X'], [15, '1']])];
  assert.deepEqual(events(run({ sources, sequential: [group('REGISTER')], buses: [bus('q', bits('q', 2))] }), 'b(q)'), [[0, '00']]);
});
test('counter private state is unaffected by contention on its output bus', () => {
  const sources = [...controls(), constant('external', 'q0', '1'), source('clk', 'clk', [[0, '0'], [1, '1'], [2, '0'], [5, '1'], [6, '0'], [9, '1'], [10, '0'], [13, '1']])];
  const result = run({ sources, sequential: [group('COUNTER')], buses: [bus('q', bits('q', 2))] });
  assert.deepEqual(events(result, 'b(q)'), [[0, '0X'], [3000, '01'], [7000, '1X'], [11000, '11'], [15000, '0X']]);
});
test('counter captures fast clock edges into private state before delayed outputs arrive', () => {
  const sources = [...controls(), { id: 'clk', output: 'clk', kind: 'clock', period: 2 * ns, duty: .5, delay: ns }];
  const result = run({ duration: 20 * ns, sources, sequential: [group('COUNTER', 2, { delay: 10 * ns })], buses: [bus('q', bits('q', 2))] });
  assert.deepEqual(events(result, 'b(q)'), [[0, '00'], [11000, '01'], [13000, '10'], [15000, '11'], [17000, '00'], [19000, '01']]);
});
test('counter increment preserves known bits that do not depend on an unknown carry', () => {
  const sources = [...controls(), source('clk', 'clk', [[0, '0'], [10, '1']])];
  const result = run({ sources, sequential: [group('COUNTER', 4, { initial: '10X0' })], buses: [bus('q', bits('q', 4))] });
  assert.deepEqual(events(result, 'b(q)'), [[0, '10X0'], [12000, '10X1']]);
});
test('pattern repeats exact four-state stimulus with an explicit period boundary', () => {
  const result = run({ duration: 12 * ns, sources: [{ id: 'p', output: 'p', kind: 'pattern', repeatPeriod: 5 * ns, events: [{ time: 0, value: 'Z' }, { time: 2 * ns, value: '1' }] }] });
  assert.deepEqual(events(result, 'd(p)'), [[0, 'Z'], [2000, '1'], [5000, 'Z'], [7000, '1'], [10000, 'Z'], [12000, '1']]);
});
test('pattern rejects absent initial value, overlapping repeats and same-tick entries', () => {
  const attempt = source => run({ sources: [{ id: 'p', output: 'p', kind: 'pattern', ...source }] });
  assert.throws(() => attempt({ events: [{ time: ns, value: '0' }] }), /time-zero/);
  assert.throws(() => attempt({ events: [{ time: 0, value: '0' }, { time: ns, value: '1' }], repeatPeriod: ns }), /exceed the last/);
  assert.throws(() => attempt({ events: [{ time: 0, value: '0' }, { time: .1e-12, value: '1' }] }), /distinct at 1 ps/);
});
