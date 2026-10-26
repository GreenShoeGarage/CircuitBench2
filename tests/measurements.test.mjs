import test from 'node:test';
import assert from 'node:assert/strict';
import {measureMeasurement, measureMeasurementSource, measurementSourceForRun, measurementScalar, normalizeMeasurementSpec, getMeasurementSignals, defaultMeasurementSpec} from '../src/measurements.js';

const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
function analog(times, values, {reference, imag, referenceImag, type = 'tran', sampling} = {}) {
  return {status: 'completed', analysis: {type}, measurements: [{id: 'out', label: 'Output', unit: 'V', vector: 'v(out)'}, ...(reference ? [{id: 'in', label: 'Input', unit: 'V', vector: 'v(in)'}] : [])], result: {points: times.length, vectors: [{name: type === 'ac' ? 'frequency' : 'time', unit: type === 'ac' ? 'Hz' : 's', values: times}, {name: 'v(out)', unit: 'V', values, ...(imag ? {imag} : {})}, ...(reference ? [{name: 'v(in)', unit: 'V', values: reference, ...(referenceImag ? {imag: referenceImag} : {})}] : [])], ...(sampling ? {sampling} : {})}};
}
const rise = (end, rest = {}) => ({kind: 'rise-time', signal: 'out', window: {start: 0, end}, levels: {mode: 'percent', initial: 0, final: 1}, ...rest});
test('RC 10–90% rise and declared 2% settling match analytic exponential references', () => {
  const tau = 1e-3, xs = Array.from({length: 1001}, (_, i) => i * 1e-5), run = analog(xs, xs.map(x => 1 - Math.exp(-x / tau)));
  const riseResult = measureMeasurement(run, rise(xs.at(-1)));
  near(measurementScalar(riseResult).value, tau * Math.log(9), 3e-8);
  const settling = measureMeasurement(run, {kind: 'settling-time', signal: 'out', window: {start: 0, end: xs.at(-1)}, initial: 0, final: 1, tolerance: {mode: 'percent', value: 2}, referenceTime: 0, minimumHold: 0.001});
  near(settling.value, -tau * Math.log(0.02), 3e-8);
  near(settling.rows[0].details.lowerBand, 0.98);
  assert.equal(settling.status, 'complete');
});
test('falling exponential and explicit thresholds use declared descending levels', () => {
  const xs = Array.from({length: 1001}, (_, i) => i / 100), run = analog(xs, xs.map(x => Math.exp(-x)));
  const result = measureMeasurement(run, {kind: 'fall-time', signal: 'out', window: {start: 0, end: 10}, levels: {mode: 'percent', initial: 1, final: 0}});
  near(result.value, Math.log(9), 3e-5);
  const explicit = measureMeasurement(run, {...result.spec, levels: {mode: 'absolute', start: 0.9, end: 0.1}});
  near(explicit.value, result.value);
  assert.throws(() => normalizeMeasurementSpec(run, {...result.spec, levels: {mode: 'absolute', start: 0.1, end: 0.9}}), /direction/);
});
test('overshoot uses directional declared-step amplitude; settling uses last band entry', () => {
  const run = analog([0, 1, 2, 3, 4, 5], [0, 1.2, 0.96, 1.01, 1, 1]);
  const base = {signal: 'out', window: {start: 0, end: 5}, initial: 0, final: 1};
  near(measureMeasurement(run, {...base, kind: 'overshoot'}).value, 20);
  const settled = measureMeasurement(run, {...base, kind: 'settling-time', tolerance: {mode: 'absolute', value: 0.02}, minimumHold: 2});
  near(settled.value, 2.4); near(settled.rows[0].details.observedHold, 2.6);
  const short = measureMeasurement(run, {...settled.spec, minimumHold: 3});
  assert.equal(short.rows[0].status, 'partial'); assert.equal(short.value, null);
  const down = analog([0, 1, 2], [5, -1, 0]);
  near(measureMeasurement(down, {kind: 'overshoot', signal: 'out', window: {start: 0, end: 2}, initial: 5, final: 0}).value, 20);
});
test('settling minimum hold equality tolerates only floating-point subtraction roundoff', () => {
  const run = analog([0, 0.1, 0.3], [0, 0.98, 1]), spec = {kind: 'settling-time', signal: 'out', window: {start: 0, end: 0.3}, initial: 0, final: 1, tolerance: {mode: 'absolute', value: 0.02}, minimumHold: 0.2};
  assert.equal(measureMeasurement(run, spec).status, 'complete'); assert.equal(measureMeasurement(run, {...spec, minimumHold: 0.20000001}).rows[0].status, 'partial');
});
test('crossing windows exclude pre-existing transitions and return crossings interrupt a rise', () => {
  const run = analog([0, 1, 2, 3, 4], [0, 0.5, 0, 0.5, 1]);
  const result = measureMeasurement(run, rise(4));
  assert.equal(result.status, 'partial'); assert.equal(result.rows.length, 2); assert.equal(result.rows[0].status, 'partial'); near(result.rows[1].value, 1.6);
  assert.equal(measurementScalar(result).value, null);
  const clipped = measureMeasurement(analog([0, 1, 2], [0, 0.5, 1]), rise(2, {window: {start: 0.5, end: 2}}));
  assert.equal(clipped.value, null); assert.match(clipped.rows[0].reason, /already in progress/);
});
test('threshold delay pairs within each input interval and does not reuse output crossings', () => {
  const xs = [0, 1, 2, 3, 4, 5, 6], run = analog(xs, [-1, -1, 1, 1, -1, -1, 1], {reference: [-1, 1, 1, -1, -1, 1, 1]});
  const result = measureMeasurement(run, {kind: 'threshold-delay', signal: 'out', reference: 'in', inputLevel: 0, outputLevel: 0, window: {start: 0, end: 6}});
  assert.deepEqual(result.rows.map(row => row.value), [1, 1]); assert.equal(result.value, null);
  const truncated = measureMeasurement(run, {...result.spec, window: {start: 0, end: 1}});
  assert.equal(truncated.value, null); assert.match(truncated.rows[0].reason, /No selected output/);
});
test('explicit interpolation limit, absent samples and incomplete complex evidence never fabricate values', () => {
  const run = analog([0, 1, 2], [0, 0.5, 1]);
  assert.equal(measureMeasurement(run, rise(2, {maxGap: 0.5})).value, null);
  run.result.vectors[1].values[1] = null;
  assert.throws(() => measureMeasurement(run, rise(2)), /incomplete or nonfinite/);
  const ac = analog([1, 10], [1, 0.5], {reference: [1, 1], type: 'ac', imag: [0, 0]});
  assert.throws(() => measureMeasurement(ac, {kind: 'transfer-gain', mode: 'ac', signal: 'out', reference: 'in', frequency: 1, window: {start: 1, end: 10}}), /complex samples/);
});
test('mixed event-union measurements select original analog rows and retain differential operands', () => {
  const run = analog([0, 0.25, 0.5, 1], [0, 100, 0.5, 1], {reference: [0, 100, 0, 0], sampling: {mode: 'event-union', analogSampleIndices: [0, 2, 3]}});
  run.measurements.push({id: 'diff', label: 'Differential', unit: 'V', a: 'v(out)', b: 'v(in)'});
  const spec = rise(1, {signal: 'diff'}), source = measurementSourceForRun(run, spec);
  assert.deepEqual(source.sampleIndices, [0, 2, 3]); assert.equal(source.vectors.length, 2);
  near(measureMeasurementSource(source, spec).value, 0.8);
  assert.equal(source.origin, 'original-analog-samples-from-event-union');
  const ground = structuredClone(run); ground.measurements = [{id: 'out', label: 'To ground', unit: 'V', a: 'v(out)', b: '0'}];
  near(measureMeasurement(ground, rise(1)).value, 0.8);
});
test('peak-to-peak and time-weighted total RMS gain use the same clipped window', () => {
  const run = analog([0, 1, 3], [0, 2, 6], {reference: [0, 1, 3]}), base = {kind: 'transfer-gain', signal: 'out', reference: 'in', window: {start: 0.5, end: 2.5}};
  near(measureMeasurement(run, {...base, mode: 'peak-to-peak'}).value, 2);
  const rms = measureMeasurement(run, {...base, mode: 'rms'}); near(rms.value, 2);
  near(rms.rows[0].details.inputAmplitude, Math.sqrt((2.5 ** 3 - 0.5 ** 3) / 6));
  run.result.vectors[2].values = [0, 0, 0]; assert.equal(measureMeasurement(run, {...base, mode: 'rms'}).value, null);
});
test('AC gain interpolates complex operands and cutoff interpolates dB against log frequency', () => {
  const run = analog([1, 10, 100, 1000], [2, 2, 1, 0.5], {reference: [2, 2, 2, 2], imag: [0, 0, 0, 0], referenceImag: [0, 0, 0, 0], type: 'ac'});
  const base = {signal: 'out', reference: 'in', window: {start: 1, end: 1000}};
  const gain = measureMeasurement(run, {...base, kind: 'transfer-gain', mode: 'ac', frequency: Math.sqrt(1000)});
  near(gain.value, 0.75); assert.equal(gain.rows[0].details.interpolation, 'linear-complex-versus-log-frequency');
  const cutoff = measureMeasurement(run, {...base, kind: 'ac-cutoff', referenceFrequency: 1});
  near(cutoff.value, Math.sqrt(1000), 1e-10); assert.equal(cutoff.rows[0].details.interpolation, 'linear-gain-decibels-versus-log-frequency');
  const exact = measureMeasurement(run, {...base, kind: 'ac-cutoff', referenceFrequency: 1, dropDb: 20 * Math.log10(2)}); near(exact.value, 100);
  const missing = measureMeasurement(run, {...base, kind: 'ac-cutoff', referenceFrequency: 1, dropDb: 100}); assert.equal(missing.value, null);
});
test('analytic RC low-pass AC gain and cutoff converge to the declared reference relationship', () => {
  const fc = 1000, xs = Array.from({length: 1001}, (_, i) => 10 ** (i / 200)), values = xs.map(f => 2 / (1 + (f / fc) ** 2)), imag = xs.map(f => -2 * f / fc / (1 + (f / fc) ** 2)), run = analog(xs, values, {reference: xs.map(() => 2), referenceImag: xs.map(() => 0), imag, type: 'ac'});
  const base = {signal: 'out', reference: 'in', window: {start: 1, end: xs.at(-1)}};
  const gain = measureMeasurement(run, {...base, kind: 'transfer-gain', mode: 'ac', frequency: fc}); near(gain.value, 1 / Math.SQRT2); near(gain.rows[0].details.phaseDegrees, -45);
  const cutoff = measureMeasurement(run, {...base, kind: 'ac-cutoff', referenceFrequency: 1}); near(cutoff.value, fc * Math.sqrt(1 + 2 / fc ** 2), 0.1);
});
test('AC phase on the negative real axis survives JSON zero normalization and zero output has no phase', () => {
  const run = analog([1, 10], [-1, -1], {reference: [1, 1], imag: [-0, -0], referenceImag: [0, 0], type: 'ac'}), spec = {kind: 'transfer-gain', mode: 'ac', signal: 'out', reference: 'in', frequency: 1, window: {start: 1, end: 10}}, source = measurementSourceForRun(run, spec);
  const before = measureMeasurementSource(source, spec), after = measureMeasurementSource(JSON.parse(JSON.stringify(source)), spec);
  assert.deepEqual(after, before); assert.equal(before.rows[0].details.phaseDegrees, 180);
  run.result.vectors[1].values = [0, 0]; const zero = measureMeasurement(run, spec); assert.equal(zero.value, 0); assert.equal(zero.rows[0].details.phaseDegrees, null); assert.equal(zero.rows[0].details.decibels, null);
});
test('unresolved intervals outside one visible edge pair prevent a complete scalar claim', () => {
  const run = analog([0, 0.1, 0.2, 10], [0, 0.5, 1, 1]), result = measureMeasurement(run, rise(10, {maxGap: 0.2}));
  assert.equal(result.rows[0].status, 'measured'); assert.equal(result.status, 'partial'); assert.equal(measurementScalar(result).value, null); assert.match(result.warnings[0], /Additional crossings/);
});
const ps = 1e-12;
function events(clock, data, {bus = false, end = 30} = {}) {
  const signal = (name, list, width) => ({name, label: name, kind: width > 1 ? 'bus' : 'logic', width, bitOrder: 'msb-first', events: list.map(([t, value]) => ({time: t * ps, value}))});
  return {domain: 'digital', eventSource: 'preserved-digital-events', timeResolution: ps, timeBounds: [0, end * ps], signals: [signal('clock', clock, 1), signal('data', data, bus ? 2 : 1)]};
}
const constraint = (rest = {}) => ({kind: 'setup-hold', clock: {name: 'clock'}, data: {name: 'data'}, edge: 'rising', setup: 3 * ps, hold: 2 * ps, window: {start: 0, end: 30 * ps}, ...rest});
test('setup/hold equality passes, shorter observed intervals violate, missing transitions are lower bounds', () => {
  const source = events([[0, '0'], [10, '1'], [15, '0'], [20, '1']], [[0, '0'], [7, '1'], [12, '0'], [18, '1'], [25, '0']]);
  const result = measureMeasurementSource(source, constraint());
  assert.deepEqual(result.rows.map(row => row.status), ['satisfied', 'violated']); near(result.rows[0].details.setupAvailable, 3 * ps); near(result.rows[0].details.holdAvailable, 2 * ps);
  const stable = measureMeasurementSource(events([[0, '0'], [10, '1']], [[0, '1']]), constraint());
  assert.equal(stable.rows[0].status, 'satisfied'); assert.equal(stable.rows[0].details.setupRelation, 'at-least'); assert.equal(stable.rows[0].details.holdRelation, 'at-least'); assert.equal(stable.value, null);
});
test('setup/hold requires selected bus bit; unrelated bit transitions do not become data changes', () => {
  const source = events([[0, '0'], [10, '1']], [[0, '00'], [9, '10'], [12, '11']], {bus: true});
  assert.throws(() => measureMeasurementSource(source, constraint()), /explicit bit/);
  const bit0 = measureMeasurementSource(source, constraint({data: {name: 'data', bit: 0}})), bit1 = measureMeasurementSource(source, constraint({data: {name: 'data', bit: 1}}));
  assert.equal(bit0.rows[0].status, 'satisfied'); assert.equal(bit1.rows[0].status, 'violated');
});
test('unknown clock/data, simultaneous updates and clipped boundary intervals stay explicit', () => {
  const clockUnknown = measureMeasurementSource(events([[0, 'X'], [10, '1']], [[0, '0']]), constraint());
  assert.equal(clockUnknown.rows[0].status, 'ambiguous');
  const dataUnknown = measureMeasurementSource(events([[0, '0'], [10, '1']], [[0, '0'], [8, 'Z'], [9, '1']]), constraint());
  assert.equal(dataUnknown.rows[0].status, 'ambiguous');
  const sameTime = events([[0, '0'], [10, '1']], [[0, '0'], [10, '1']]);
  assert.equal(measureMeasurementSource(sameTime, constraint()).rows[0].status, 'violated');
  assert.equal(measureMeasurementSource(sameTime, constraint({setup: 0, hold: 0})).rows[0].status, 'ambiguous');
  const partial = measureMeasurementSource(sameTime, constraint({window: {start: 9 * ps, end: 30 * ps}})); assert.equal(partial.rows[0].status, 'partial');
  assert.throws(() => measureMeasurementSource(sameTime, constraint({hold: 0.5 * ps})), /1 ps/);
});
test('default drafts declare levels and retain available signal identities', () => {
  const run = analog([0, 1], [0, 1], {reference: [0, 1]});
  assert.equal(getMeasurementSignals(run).analog.length, 2); const spec = defaultMeasurementSpec(run); assert.deepEqual(spec.levels, {mode: 'percent', initial: 0, final: 1, low: 10, high: 90});
});
