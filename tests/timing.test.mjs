import test from 'node:test';
import assert from 'node:assert/strict';
import { getTimingSignals, normalizeTimingSpec, normalizeTimingSourceSpec, timingSourceForRun, measureTiming, measureTimingSource, TIMING_METHOD, TIMING_LIMITS } from '../src/timing.js';
import { simulateDigital } from '../src/digital.js';
import { mergeEventResults } from '../src/simulation.js';

const ps = 1e-12;
const trace = (name, values, width = 1, label = name) => ({ name, label, kind: width === 1 ? 'logic' : 'bus', width, bitOrder: 'msb-first', events: values.map(([time, value]) => ({ time: time * ps, value })) });
const source = (signals, end = 100) => ({ timeBounds: [0, end * ps], signals, timeResolution: ps, eventSource: 'preserved-digital-events' });
const spec = (kind, name = 'd(a)', extra = {}) => ({ kind, source: { name }, edge: 'rising', ...extra });
const run = input => ({ status: 'completed', analysis: { type: 'tran' }, measurements: input.signals.map(item => ({ vector: item.name, label: item.label })), result: { sampling: { timeResolution: ps }, vectors: [{ name: 'time', unit: 's', values: input.timeBounds }, ...input.signals.map(item => ({ name: item.name, kind: item.kind, width: item.width, bitOrder: item.bitOrder, unit: 'logic', values: [item.events[0].value, item.events.at(-1).value] }))], digitalEvents: input.signals.map(item => ({ name: item.name, kind: item.kind, width: item.width, bitOrder: item.bitOrder, events: item.events })) } });
const near = (actual, expected, tolerance = 1e-20) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const measured = result => result.rows.filter(row => row.status === 'measured').map(row => row.value);
const pulse = source([trace('d(a)', [[0, '0'], [10, '1'], [14, '0'], [30, '1'], [37, '0'], [60, '1'], [68, '0']])]);

test('timing choices expose scalar signals and explicit LSB-numbered bus bits with saved labels', () => {
  const input = source([trace('d(a)', [[0, '0']], 1, 'Clock'), trace('b(word)', [[0, '101']], 3, 'Word')]);
  assert.deepEqual(getTimingSignals(run(input)), [
    { name: 'd(a)', label: 'Clock', kind: 'logic', width: 1 },
    ...[0, 1, 2].map(bit => ({ name: 'b(word)', label: `Word [${bit}]`, kind: 'bus', width: 3, bit }))
  ]);
  for (const value of [undefined, {}, { status: 'running' }, { ...run(input), analysis: { type: 'ac' } }]) assert.deepEqual(getTimingSignals(value), []);
});

test('canonical specification fills window and edge defaults and discards unrelated controls', () => {
  const actual = normalizeTimingSpec(run(pulse), { kind: 'period', source: { name: 'd(a)' }, target: { name: 'nope' }, targetEdge: 'garbage' });
  assert.deepEqual(actual, { kind: 'period', source: { name: 'd(a)' }, edge: 'rising', window: { start: 0, end: 100 * ps } });
  assert.deepEqual(normalizeTimingSourceSpec(pulse, actual), actual);
});

test('authored probe labels take priority over generated vector names', () => {
  const saved = run(pulse);
  saved.projectSnapshot = { probes: [{ id: 'probe_clock' }] };
  saved.measurements = [{ id: 'generated', vector: 'd(a)', label: 'D(a)' }, { id: 'probe_clock', vector: 'd(a)', label: 'Clock · 10 MHz' }, { id: 'other', vector: 'd(a)', label: 'Other label' }];
  assert.equal(getTimingSignals(saved)[0].label, 'Clock · 10 MHz');
  assert.equal(timingSourceForRun(saved, spec('period')).signals[0].label, 'Clock · 10 MHz');
  delete saved.projectSnapshot;
  assert.equal(getTimingSignals(saved)[0].label, 'Other label');
});

test('measurements use preserved sparse events and do not infer edges from sampled logic', () => {
  const saved = run(pulse); saved.result.vectors[1].values = ['X', 'X'];
  const result = measureTiming(saved, spec('pulse-width'));
  assert.equal(result.method, TIMING_METHOD); assert.equal(result.eventSource, 'preserved-digital-events');
  assert.deepEqual(measured(result), [4 * ps, 7 * ps, 8 * ps]);
});

test('captured timing source copies only selected full traces and is independent of the run', () => {
  const saved = run(source([trace('d(a)', [[0, '0'], [10, '1'], [15, '0']]), trace('d(b)', [[0, '1']])]));
  const captured = timingSourceForRun(saved, spec('pulse-width'));
  assert.equal(captured.signals.length, 1); assert.equal(captured.signals[0].events.length, 3);
  saved.result.digitalEvents[0].events[1].value = 'X';
  assert.equal(captured.signals[0].events[1].value, '1');
  assert.equal(measureTimingSource(captured, spec('pulse-width')).rows[0].value, 5 * ps);
});

test('legacy sampled-only, incomplete and non-transient runs have explicit unavailable errors', () => {
  for (const mutate of [r => delete r.result.digitalEvents, r => r.status = 'cancelled', r => r.analysis.type = 'ac']) {
    const saved = run(pulse); mutate(saved);
    assert.throws(() => measureTiming(saved, spec('period')), error => error.code === 'TIMING_UNAVAILABLE');
    assert.deepEqual(getTimingSignals(saved), []);
  }
});

test('delay pairs each source with its first eligible target and reports a final missing edge', () => {
  const input = source([trace('d(a)', [[0, '0'], [10, '1'], [15, '0'], [30, '1'], [35, '0'], [50, '1']]), trace('d(b)', [[0, '0'], [13, '1'], [18, '0'], [34, '1'], [39, '0']])]);
  const result = measureTimingSource(input, spec('delay', 'd(a)', { target: { name: 'd(b)' } }));
  assert.deepEqual(measured(result), [3 * ps, 4 * ps]); assert.equal(result.rows[2].status, 'missing-edge');
  assert.deepEqual(result.rows[0].sourceEvent, { time: 10 * ps, from: '0', to: '1', index: 1 });
  assert.deepEqual(result.rows[0].targetEvent, { time: 13 * ps, from: '0', to: '1', index: 1 });
  assert.match(result.pairing, /does not establish physical causation/);
});

test('delay supports separately selected source and target polarity', () => {
  const input = source([trace('d(a)', [[0, '0'], [10, '1'], [20, '0']]), trace('d(b)', [[0, '1'], [13, '0'], [25, '1']])]);
  assert.deepEqual(measured(measureTimingSource(input, spec('delay', 'd(a)', { target: { name: 'd(b)' }, targetEdge: 'falling' }))), [3 * ps]);
  assert.deepEqual(measured(measureTimingSource(input, spec('delay', 'd(a)', { edge: 'falling', target: { name: 'd(b)' } }))), [5 * ps]);
});

test('simultaneous direct edges produce measured zero delay without inventing time-zero edges', () => {
  const input = source([trace('d(a)', [[0, '1'], [5, '0'], [10, '1']]), trace('d(b)', [[0, '1'], [5, '0'], [10, '1']])]);
  const result = measureTimingSource(input, spec('delay', 'd(a)', { target: { name: 'd(b)' } }));
  assert.deepEqual(measured(result), [0]); assert.equal(result.rows.length, 1); assert.equal(result.rows[0].start, 10 * ps);
});

test('a target at the next source timestamp belongs to that source and is never reused', () => {
  const input = source([trace('d(a)', [[0, '0'], [10, '1'], [15, '0'], [20, '1']]), trace('d(b)', [[0, '0'], [20, '1']])]);
  const result = measureTimingSource(input, spec('delay', 'd(a)', { target: { name: 'd(b)' } }));
  assert.equal(result.rows[0].status, 'missing-edge'); assert.equal(result.rows[1].value, 0);
  assert.equal(result.rows[0].details.observedUntil, 20 * ps);
});

test('target edges before a source are not paired backwards', () => {
  const input = source([trace('d(a)', [[0, '0'], [10, '1']]), trace('d(b)', [[0, '0'], [9, '1']])]);
  const result = measureTimingSource(input, spec('delay', 'd(a)', { target: { name: 'd(b)' } }));
  assert.deepEqual(measured(result), []); assert.equal(result.rows[0].end, null);
});

test('pulse width distinguishes complete high and low pulses', () => {
  assert.deepEqual(measured(measureTimingSource(pulse, spec('pulse-width'))), [4 * ps, 7 * ps, 8 * ps]);
  const low = measureTimingSource(pulse, spec('pulse-width', 'd(a)', { edge: 'falling' }));
  assert.deepEqual(measured(low), [16 * ps, 23 * ps]); assert.equal(low.rows[2].status, 'missing-edge');
  assert.equal(low.rows[0].details.level, '0');
});

test('an initial high value is not a rising edge or a complete high pulse', () => {
  const input = source([trace('d(a)', [[0, '1'], [10, '0'], [20, '1'], [25, '0']])]);
  assert.deepEqual(measured(measureTimingSource(input, spec('pulse-width'))), [5 * ps]);
});

test('X and Z interrupt a pulse without pairing it across a later recovery', () => {
  for (const unknown of ['X', 'Z']) {
    const input = source([trace('d(a)', [[0, '0'], [10, '1'], [12, unknown], [15, '0'], [20, '1'], [24, '0']])]);
    const result = measureTimingSource(input, spec('pulse-width'));
    assert.equal(result.rows[0].status, 'indeterminate'); assert.equal(result.rows[0].value, null);
    assert.equal(result.rows[0].targetEvent.to, unknown); assert.equal(result.rows[0].end, 12 * ps);
    assert.equal(result.rows[1].value, 4 * ps); assert.match(result.warnings.join(' '), /excluded from edge selection/);
  }
});

test('a closing edge exactly on the inclusive window end completes the pulse', () => {
  const result = measureTimingSource(pulse, spec('pulse-width', 'd(a)', { window: { start: 10 * ps, end: 14 * ps } }));
  assert.deepEqual(measured(result), [4 * ps]); assert.equal(result.rows.length, 1);
});

test('period and frequency preserve per-cycle jitter and summarize only complete cycles', () => {
  const period = measureTimingSource(pulse, spec('period')), frequency = measureTimingSource(pulse, spec('frequency'));
  assert.deepEqual(measured(period), [20 * ps, 30 * ps]);
  near(measured(frequency)[0], 1 / (20 * ps), 1e-5); near(measured(frequency)[1], 1 / (30 * ps), 1e-5);
  near(period.summary.mean, 25 * ps); assert.equal(period.summary.missingCount, 1); assert.equal(period.rows[2].value, null);
  assert.equal(frequency.unit, 'Hz'); assert.equal(period.unit, 's');
});

test('duty cycle measures percent high for both rising- and falling-bounded cycles', () => {
  const rising = measureTimingSource(pulse, spec('duty-cycle')), falling = measureTimingSource(pulse, spec('duty-cycle', 'd(a)', { edge: 'falling' }));
  near(rising.rows[0].value, 20); near(rising.rows[1].value, 7 / 30 * 100, 1e-12);
  near(falling.rows[0].value, 7 / 23 * 100, 1e-12); near(falling.rows[1].value, 8 / 31 * 100, 1e-12);
  assert.deepEqual(rising.rows[0].details, { elapsed: 20 * ps, cycleTime: 20 * ps, highTime: 4 * ps });
  assert.equal(rising.unit, '%');
});

test('period, frequency and duty cycle never give a number across X/Z', () => {
  const input = source([trace('d(a)', [[0, '0'], [10, '1'], [12, 'X'], [15, '0'], [20, '1'], [25, '0'], [30, '1']])]);
  for (const kind of ['period', 'frequency', 'duty-cycle']) {
    const result = measureTimingSource(input, spec(kind));
    assert.equal(result.rows[0].status, 'indeterminate'); assert.equal(result.rows[0].value, null);
    assert.equal(result.rows[1].status, 'measured'); assert.equal(result.summary.measuredCount, 1);
  }
});

test('an initially unknown target makes a later paired delay indeterminate', () => {
  const input = source([trace('d(a)', [[0, '0'], [10, '1']]), trace('d(b)', [[0, 'X'], [12, '0'], [15, '1']])]);
  const result = measureTimingSource(input, spec('delay', 'd(a)', { target: { name: 'd(b)' } }));
  assert.equal(result.rows[0].status, 'indeterminate'); assert.equal(result.rows[0].value, null);
  assert.deepEqual(result.rows[0].details.signals, ['d(b)']);
});

test('an X-to-one transition is never promoted to a rising edge', () => {
  const input = source([trace('d(a)', [[0, 'X'], [10, '1'], [15, '0'], [20, '1'], [24, '0']])]);
  const result = measureTimingSource(input, spec('pulse-width'));
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].start, 20 * ps); assert.equal(result.rows[0].value, 4 * ps);
  assert.match(result.warnings.join(' '), /1 transition involving X\/Z/);
});

test('an entirely unknown signal has an explicit missing-edge diagnostic and no statistics', () => {
  const result = measureTimingSource(source([trace('d(a)', [[0, 'X']])]), spec('period'));
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].status, 'missing-edge'); assert.match(result.rows[0].reason, /X\/Z is present/);
  assert.equal(result.summary.mean, null); assert.equal(result.candidateCount, 1); assert.equal(result.summary.measuredCount, 0);
});

test('left-clipped pulses are not reconstructed from an earlier edge', () => {
  const result = measureTimingSource(pulse, spec('pulse-width', 'd(a)', { window: { start: 11 * ps, end: 18 * ps } }));
  assert.equal(result.rows[0].status, 'missing-edge'); assert.equal(result.rows[0].sourceEvent, null);
});

test('measurements do not borrow a closing edge beyond a selected window', () => {
  const result = measureTimingSource(pulse, spec('period', 'd(a)', { window: { start: 10 * ps, end: 29 * ps } }));
  assert.equal(result.rows[0].status, 'missing-edge'); assert.equal(result.rows[0].end, null); assert.equal(result.rows[0].details.observedUntil, 29 * ps);
});

test('a single-timestamp window can measure simultaneous zero delay', () => {
  const input = source([trace('d(a)', [[0, '0'], [10, '1']])]);
  const result = measureTimingSource(input, spec('delay', 'd(a)', { target: { name: 'd(a)' }, window: { start: 10 * ps, end: 10 * ps } }));
  assert.deepEqual(measured(result), [0]);
});

test('explicit bus bit selection ignores unknown neighbors and preserves LSB numbering', () => {
  const input = source([trace('b(a)', [[0, 'X0'], [10, 'X1'], [15, 'Z1'], [20, 'Z0'], [30, 'Z1']], 2)]);
  const result = measureTimingSource(input, spec('pulse-width', 'b(a)', { source: { name: 'b(a)', bit: 0 } }));
  assert.equal(result.rows[0].value, 10 * ps); assert.deepEqual(result.warnings, []);
  assert.equal(result.rows[0].targetEvent.index, 3, 'event indices refer to original whole-word source');
  const unknown = measureTimingSource(input, spec('period', 'b(a)', { source: { name: 'b(a)', bit: 1 } }));
  assert.equal(unknown.rows[0].value, null); assert.match(unknown.warnings.join(' '), /X\/Z/);
});

test('the same bus can supply independently selected source and target bits', () => {
  const input = source([trace('b(a)', [[0, '00'], [10, '01'], [13, '11'], [20, '00']], 2)]);
  const result = measureTimingSource(input, spec('delay', 'b(a)', { source: { name: 'b(a)', bit: 0 }, target: { name: 'b(a)', bit: 1 } }));
  assert.deepEqual(measured(result), [3 * ps]);
  assert.equal(timingSourceForRun(run(input), result.spec).signals.length, 1);
});

test('retained rows are bounded and truncation never claims an all-cycle summary', () => {
  const values = Array.from({ length: 1201 }, (_, index) => [index, String(index % 2)]), input = source([trace('d(a)', values)], 1300);
  const result = measureTimingSource(input, spec('pulse-width'));
  assert.equal(result.rows.length, TIMING_LIMITS.rows); assert.equal(result.candidateCount, 600); assert.equal(result.truncated, true);
  assert.equal(result.summary.totalCount, 256); assert.equal(result.summary.measuredCount, 256); assert.match(result.warnings.join(' '), /summary covers retained measured rows only/);
});

test('selected event count is bounded across both traces, not separately per signal', () => {
  const values = Array.from({ length: 125001 }, (_, index) => [index, String(index % 2)]), input = source([trace('d(a)', values), trace('d(b)', values)], 130000);
  assert.throws(() => measureTimingSource(input, spec('delay', 'd(a)', { target: { name: 'd(b)' } })), error => error.code === 'TIMING_LIMIT');
});

test('malformed event times and noncanonical states are rejected before measurement', () => {
  for (const mutate of [
    s => s.signals[0].events[0].time = ps,
    s => s.signals[0].events[1].time = -ps,
    s => s.signals[0].events[1].time = 1000 * ps,
    s => s.signals[0].events[1].time = Infinity,
    s => s.signals[0].events[1].time = 10.5 * ps,
    s => s.signals[0].events[2].time = s.signals[0].events[1].time,
    s => s.signals[0].events[2].time = 9 * ps,
    s => s.signals[0].events[1].value = '0',
    s => s.signals[0].events[1].value = 'x',
    s => s.signals[0].events[1].value = 1,
    s => s.signals[0].events[1].value = '11',
    s => s.signals[0].events = []
  ]) {
    const input = structuredClone(pulse); mutate(input);
    assert.throws(() => measureTimingSource(input, spec('period')));
  }
});

test('source metadata rejects mismatched widths, duplicate traces and unsupported time grids', () => {
  for (const mutate of [
    s => s.timeResolution = 1e-9,
    s => s.eventSource = 'sampled',
    s => s.timeBounds = [ps, 100 * ps],
    s => s.timeBounds = [0, Infinity],
    s => s.signals[0].width = 2,
    s => s.signals[0].bitOrder = 'lsb-first',
    s => s.signals[0].label = '',
    s => s.signals.push(structuredClone(s.signals[0])),
    s => s.signals = []
  ]) {
    const input = structuredClone(pulse); mutate(input);
    assert.throws(() => measureTimingSource(input, spec('period')));
  }
});

test('invalid measurement kinds, polarity, windows and bit selections are rejected', () => {
  for (const request of [
    spec('setup'), spec('period', 'absent'), spec('period', 'd(a)', { edge: 'either' }),
    spec('period', 'd(a)', { window: { start: -1, end: 1 } }),
    spec('period', 'd(a)', { window: { start: 20 * ps, end: 10 * ps } }),
    spec('period', 'd(a)', { window: { start: 0, end: 101 * ps } }),
    spec('period', 'd(a)', { window: { start: 0, end: NaN } }),
    spec('period', 'd(a)', { source: { name: 'd(a)', bit: 0 } }),
    spec('delay', 'd(a)', { target: { name: 'd(a)' }, targetEdge: 'any' }),
    spec('delay')
  ]) assert.throws(() => measureTimingSource(pulse, request));
  const input = source([trace('b(a)', [[0, '00']], 2)]);
  for (const bit of [undefined, -1, 2, .5]) assert.throws(() => measureTimingSource(input, spec('period', 'b(a)', { source: { name: 'b(a)', ...(bit === undefined ? {} : { bit }) } })));
});

test('run adapter rejects event/trace metadata disagreement instead of coercing it', () => {
  for (const mutate of [r => r.result.digitalEvents[0].width = 2, r => r.result.vectors.push(structuredClone(r.result.vectors[1])), r => r.result.digitalEvents.push(structuredClone(r.result.digitalEvents[0]))]) {
    const saved = run(pulse); mutate(saved);
    assert.throws(() => measureTiming(saved, spec('period'))); assert.deepEqual(getTimingSignals(saved), []);
  }
  const saved = run(pulse); delete saved.result.sampling;
  assert.throws(() => measureTiming(saved, spec('period')), /declared 1 ps time grid/);
  saved.result.engine = { digital: { timeResolution: ps } };
  assert.equal(measureTiming(saved, spec('period')).summary.measuredCount, 2);
});

test('measurement is deterministic, leaves its source untouched and round-trips through JSON', () => {
  const original = JSON.stringify(pulse), request = spec('duty-cycle'), first = measureTimingSource(pulse, request);
  assert.deepEqual(measureTimingSource(JSON.parse(original), JSON.parse(JSON.stringify(request))), first);
  assert.equal(JSON.stringify(pulse), original); assert.deepEqual(request, spec('duty-cycle'));
  assert.ok(first.rows.every(row => row.status === 'measured' ? Number.isFinite(row.value) : row.value === null));
});

test('reconvergent delayed logic yields a measurable short transport glitch', () => {
  const digital = simulateDigital({ duration: 30 * ps, sources: [{ id: 'input', output: 'a', kind: 'events', events: [{ time: 0, value: '0' }, { time: 10 * ps, value: '1' }] }], gates: [
    { id: 'fast', type: 'BUF', inputs: ['a'], output: 'f', delay: 2 * ps },
    { id: 'slow', type: 'BUF', inputs: ['a'], output: 's', delay: 7 * ps },
    { id: 'xor', type: 'XOR', inputs: ['f', 's'], output: 'out', delay: 3 * ps }
  ] });
  const saved = { status: 'completed', analysis: { type: 'tran' }, result: mergeEventResults(null, digital) };
  const result = measureTiming(saved, spec('pulse-width', 'd(out)'));
  assert.equal(result.rows[0].start, 15 * ps); assert.equal(result.rows[0].end, 20 * ps); assert.equal(result.rows[0].value, 5 * ps);
});
