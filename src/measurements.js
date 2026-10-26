import {getTimingSignals, timingSourceForRun, normalizeTimingSourceSpec} from './timing.js';

/** Measurements are arithmetic over saved numerical evidence, never plot pixels. */
export const MEASUREMENT_METHOD = 'cb-instrument-measurements-1';
export const MEASUREMENT_KINDS = Object.freeze(['rise-time', 'fall-time', 'overshoot', 'settling-time', 'threshold-delay', 'transfer-gain', 'ac-cutoff', 'setup-hold']);
export const MEASUREMENT_LIMITS = Object.freeze({points: 250000, values: 1500000, vectors: 4, signals: 2, events: 250000, rows: 256});
const Q = 1e-12;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max;
const fail = (message, code = 'MEASUREMENT_INVALID') => Object.assign(new Error(message), {code});
const check = (condition, message, code) => { if (!condition) throw fail(message, code); };
const binary = value => value === '0' || value === '1';
const norm = value => String(value).toLowerCase().replace(/\s/g, '');
const ground = value => value === '0' || norm(value) === 'v(0)';
const clone = value => structuredClone(value);
const polarity = (value, label) => { check(['rising', 'falling'].includes(value), `${label} must be rising or falling.`); return value; };
const signalRef = value => { check(text(value), 'Choose a saved analog signal.'); return value; };
function bitRef(value) {
  check(object(value) && text(value.name), 'Choose a saved digital signal or an explicit bus bit.');
  check(value.bit === undefined || Number.isInteger(value.bit) && value.bit >= 0 && value.bit < 8, 'Bus bit zero is the least significant bit; choose a bit from 0 to 7.');
  return {name: value.name, ...(value.bit === undefined ? {} : {bit: value.bit})};
}
function tickDuration(value, label) {
  check(finite(value) && value >= 0 && Number.isSafeInteger(Math.round(value / Q)) && Math.abs(value - Math.round(value / Q) * Q) <= Math.max(Q * 1e-6, Number.EPSILON * value * 4), `${label} must be a nonnegative duration on the 1 ps event grid.`);
  return Math.round(value / Q) * Q;
}

/** Source-independent, bounded grammar used by portable reusable presets. */
export function normalizeMeasurementPresetSpec(input) {
  check(object(input) && MEASUREMENT_KINDS.includes(input.kind), 'Choose a supported instrument measurement.');
  const kind = input.kind, spec = {kind};
  check(object(input.window) && finite(input.window.start) && finite(input.window.end) && input.window.start >= 0 && input.window.end > input.window.start, 'The measurement window must have a finite nonnegative start and a later end.');
  spec.window = {start: input.window.start, end: input.window.end};
  if (kind === 'setup-hold') {
    spec.clock = bitRef(input.clock); spec.data = bitRef(input.data); spec.edge = polarity(input.edge ?? 'rising', 'Clock edge');
    spec.setup = tickDuration(input.setup ?? 0, 'Setup requirement'); spec.hold = tickDuration(input.hold ?? 0, 'Hold requirement');
    return spec;
  }
  spec.signal = signalRef(input.signal);
  spec.maxGap = input.maxGap ?? null;
  check(spec.maxGap === null || finite(spec.maxGap) && spec.maxGap > 0, 'The maximum interpolation interval must be positive or left unrestricted.');
  if (kind === 'rise-time' || kind === 'fall-time') {
    const levels = input.levels;
    check(object(levels) && ['percent', 'absolute'].includes(levels.mode), 'Declare percent step levels or absolute start/end levels.');
    if (levels.mode === 'percent') {
      check(finite(levels.initial) && finite(levels.final) && finite(levels.final - levels.initial) && (kind === 'rise-time' ? levels.final > levels.initial : levels.final < levels.initial), 'The declared step levels must have a finite amplitude and follow the selected rise/fall direction.');
      const low = levels.low ?? 10, high = levels.high ?? 90;
      check(finite(low) && finite(high) && low >= 0 && high <= 100 && high > low, 'Step percentages must increase between 0 and 100.');
      spec.levels = {mode: 'percent', initial: levels.initial, final: levels.final, low, high};
    } else {
      check(finite(levels.start) && finite(levels.end) && (kind === 'rise-time' ? levels.end > levels.start : levels.end < levels.start), 'Absolute levels must follow the selected rise/fall direction.');
      spec.levels = {mode: 'absolute', start: levels.start, end: levels.end};
    }
  } else if (kind === 'overshoot' || kind === 'settling-time') {
    check(finite(input.initial) && finite(input.final) && finite(input.final - input.initial) && input.initial !== input.final, 'Declare distinct finite initial and final step levels with a finite step amplitude.');
    spec.initial = input.initial; spec.final = input.final;
    if (kind === 'settling-time') {
      const tolerance = input.tolerance ?? {mode: 'percent', value: 2};
      check(object(tolerance) && ['percent', 'absolute'].includes(tolerance.mode) && finite(tolerance.value) && tolerance.value > 0 && (tolerance.mode !== 'percent' || tolerance.value <= 100), 'The settling band needs a positive absolute tolerance or a step tolerance of up to 100 percent.');
      spec.tolerance = {mode: tolerance.mode, value: tolerance.value};
      spec.referenceTime = input.referenceTime ?? spec.window.start; spec.minimumHold = input.minimumHold ?? 0;
      check(finite(spec.referenceTime) && spec.referenceTime >= spec.window.start && spec.referenceTime < spec.window.end, 'The settling reference time must lie inside the window before its end.');
      check(finite(spec.minimumHold) && spec.minimumHold >= 0, 'Minimum observed settling hold must be nonnegative.');
    }
  } else if (kind === 'threshold-delay') {
    spec.reference = signalRef(input.reference);
    check(finite(input.inputLevel) && finite(input.outputLevel), 'Declare finite input and output thresholds.');
    spec.inputLevel = input.inputLevel; spec.outputLevel = input.outputLevel;
    spec.inputEdge = polarity(input.inputEdge ?? 'rising', 'Input edge'); spec.outputEdge = polarity(input.outputEdge ?? 'rising', 'Output edge');
  } else {
    spec.reference = signalRef(input.reference);
    if (kind === 'transfer-gain') {
      check(['ac', 'peak-to-peak', 'rms'].includes(input.mode), 'Transfer amplitude must use AC, peak-to-peak, or time-weighted total RMS.');
      spec.mode = input.mode;
      if (spec.mode === 'ac') { check(finite(input.frequency) && input.frequency > 0, 'Declare a positive AC measurement frequency.'); spec.frequency = input.frequency; }
    } else {
      check(finite(input.referenceFrequency) && input.referenceFrequency > 0, 'Declare a positive reference frequency for the cutoff amplitude.');
      spec.referenceFrequency = input.referenceFrequency; spec.dropDb = input.dropDb ?? 20 * Math.log10(Math.SQRT2);
      check(finite(spec.dropDb) && spec.dropDb > 0 && spec.dropDb <= 120, 'The cutoff amplitude drop must be greater than zero and at most 120 dB.');
      spec.edge = polarity(input.edge ?? 'falling', 'Cutoff crossing');
    }
  }
  return spec;
}

function findVector(vectors, name) {
  const n = norm(name), aliases = new Set([n, n.replace(/^i\((.+)\)$/, '$1#branch'), n.replace(/^v\((.+)\)$/, '$1')]);
  const exact = vectors.filter(vector => norm(vector?.name) === n);
  if (exact.length === 1) return exact[0];
  const matches = vectors.filter(vector => aliases.has(norm(vector?.name)));
  return matches.length === 1 ? matches[0] : null;
}
function analogMetadata(run) {
  if (!['completed', 'completed-with-warnings'].includes(run?.status) || !['tran', 'ac'].includes(run.analysis?.type) || !Array.isArray(run.result?.vectors)) return [];
  const vectors = run.result.vectors, type = run.analysis.type, axisName = type === 'ac' ? 'frequency' : 'time';
  const specifications = run.measurements?.length ? run.measurements : vectors.filter(v => norm(v.name) !== axisName && !['logic', 'bus'].includes(v.kind) && v.unit !== 'logic').map(v => ({id: v.name, label: v.name, vector: v.name, unit: v.unit || (/branch|^i\(/i.test(v.name) ? 'A' : 'V')}));
  const seen = new Set(), out = [];
  for (const m of specifications) {
    if (!m || !text(m.id) || seen.has(m.id) || !['V', 'A'].includes(m.unit)) continue;
    const resolve = name => ground(name) ? null : findVector(vectors, name);
    const names = m.vector ? [m.vector] : m.a && m.b !== undefined ? [m.a, m.b] : [];
    if (!names.length || names.some(name => !text(name) || !ground(name) && (!resolve(name) || ['logic', 'bus'].includes(resolve(name).kind) || resolve(name).unit === 'logic'))) continue;
    const divisor = m.resistance ?? 1;
    if (!finite(divisor) || divisor === 0) continue;
    seen.add(m.id); out.push({id: m.id, label: text(m.label) ? m.label : m.vector ?? m.id, unit: m.unit, ...(m.vector ? {vector: ground(m.vector) ? '0' : resolve(m.vector).name} : {a: ground(m.a) ? '0' : resolve(m.a).name, b: ground(m.b) ? '0' : resolve(m.b).name, divisor})});
  }
  return out;
}
export function getMeasurementSignals(run) {
  return {analog: analogMetadata(run).map(({id, label, unit}) => ({id, label, unit})), digital: getTimingSignals(run)};
}
function axisFor(run) {
  const type = run?.analysis?.type, name = type === 'ac' ? 'frequency' : 'time';
  const axes = run?.result?.vectors?.filter(v => norm(v?.name) === name) ?? [];
  check(['tran', 'ac'].includes(type) && axes.length === 1, 'Measurements require a saved transient time axis or AC frequency axis.', 'MEASUREMENT_UNAVAILABLE');
  check(axes[0].unit === (type === 'ac' ? 'Hz' : 's'), 'The saved axis unit does not match its analysis.');
  return axes[0];
}
/** Defaults are declared drafts; they never estimate a step amplitude from extrema. */
export function defaultMeasurementSpec(run, kind) {
  const choices = getMeasurementSignals(run), axis = axisFor(run), bounds = {start: axis.values[0], end: axis.values.at(-1)};
  kind ??= choices.analog.length ? run.analysis.type === 'ac' ? 'transfer-gain' : 'rise-time' : 'setup-hold';
  const base = {kind, window: bounds, signal: choices.analog[0]?.id, reference: choices.analog.find(s => s.id !== choices.analog[0]?.id)?.id ?? choices.analog[0]?.id, maxGap: null};
  if (kind === 'setup-hold') return normalizeMeasurementPresetSpec({kind, window: bounds, clock: choices.digital[0], data: choices.digital[1] ?? choices.digital[0], edge: 'rising', setup: 0, hold: 0});
  if (kind === 'rise-time' || kind === 'fall-time') return normalizeMeasurementPresetSpec({...base, levels: {mode: 'percent', initial: kind === 'rise-time' ? 0 : 1, final: kind === 'rise-time' ? 1 : 0, low: 10, high: 90}});
  if (kind === 'overshoot' || kind === 'settling-time') return normalizeMeasurementPresetSpec({...base, initial: 0, final: 1, referenceTime: bounds.start, minimumHold: 0, tolerance: {mode: 'percent', value: 2}});
  if (kind === 'threshold-delay') return normalizeMeasurementPresetSpec({...base, inputLevel: 0.5, outputLevel: 0.5, inputEdge: 'rising', outputEdge: 'rising'});
  return normalizeMeasurementPresetSpec({...base, mode: run.analysis.type === 'ac' ? 'ac' : 'peak-to-peak', frequency: Math.sqrt(bounds.start * bounds.end), referenceFrequency: bounds.start, dropDb: 20 * Math.log10(Math.SQRT2), edge: 'falling'});
}

/** Capture original selected vectors, including differential-probe operands. */
export function measurementSourceForRun(run, input) {
  check(['completed', 'completed-with-warnings'].includes(run?.status), 'Choose a completed run before measuring.', 'MEASUREMENT_UNAVAILABLE');
  const spec = normalizeMeasurementPresetSpec(input);
  if (spec.kind === 'setup-hold') {
    const source = {domain: 'digital', ...timingSourceForRun(run, {kind: 'delay', source: spec.clock, target: spec.data, edge: spec.edge, targetEdge: 'rising', window: spec.window})};
    normalizeMeasurementSourceSpec(source, spec); return source;
  }
  const axis = axisFor(run), metadata = analogMetadata(run), wanted = new Set([spec.signal, ...(spec.reference ? [spec.reference] : [])]);
  const signals = metadata.filter(item => wanted.has(item.id));
  check(signals.length === wanted.size, 'A selected analog signal is absent from this run.', 'MEASUREMENT_UNAVAILABLE');
  check(Array.isArray(axis.values) && axis.values.length >= 2 && axis.values.length <= MEASUREMENT_LIMITS.points && run.result.points === axis.values.length, 'The saved axis and point count are incomplete or too large.');
  let indices = Array.from({length: axis.values.length}, (_, i) => i), origin = 'saved-analog-samples';
  if (run.result.sampling?.mode === 'event-union') {
    indices = run.result.sampling.analogSampleIndices;
    check(Array.isArray(indices) && indices.length >= 2 && indices.every((v, i) => Number.isInteger(v) && v >= 0 && v < axis.values.length && (!i || v > indices[i - 1])), 'The mixed result has no trustworthy original analog sample indices.');
    origin = 'original-analog-samples-from-event-union';
  }
  const names = new Set(signals.flatMap(s => s.vector ? [s.vector] : [s.a, s.b]).filter(name => name !== '0'));
  const vectors = [...names].map(name => {
    const v = run.result.vectors.find(item => item.name === name);
    check(v && Array.isArray(v.values) && v.values.length === axis.values.length && v.values.every(finite), 'A selected raw vector is incomplete or nonfinite. Missing samples are not bridged.');
    check(run.analysis.type === 'ac' ? Array.isArray(v.imag) && v.imag.length === axis.values.length && v.imag.every(finite) : v.imag === undefined, 'Selected complex samples do not match the saved analysis.');
    return {name, values: indices.map(i => v.values[i]), ...(run.analysis.type === 'ac' ? {imag: indices.map(i => v.imag[i])} : {})};
  });
  const source = {domain: 'analog', analysis: run.analysis.type, axis: {name: axis.name, unit: run.analysis.type === 'ac' ? 'Hz' : 's', values: indices.map(i => axis.values[i])}, signals: clone(signals), vectors, sampleIndices: [...indices], originalPoints: axis.values.length, origin};
  normalizeMeasurementSourceSpec(source, spec); return source;
}
export function validateMeasurementSource(source) {
  check(object(source), 'Saved measurement evidence must be an object.');
  if (source.domain === 'digital') {
    check(Array.isArray(source.signals) && source.signals.length > 0, 'Preserved clock/data event streams are missing.');
    const ref = s => ({name: s.name, ...(s.kind === 'bus' ? {bit: 0} : {})});
    normalizeTimingSourceSpec(source, {kind: 'delay', source: ref(source.signals[0]), target: ref(source.signals.at(-1)), window: {start: source.timeBounds?.[0], end: source.timeBounds?.[1]}});
    return source;
  }
  check(source.domain === 'analog' && ['tran', 'ac'].includes(source.analysis) && ['saved-analog-samples', 'original-analog-samples-from-event-union'].includes(source.origin), 'The analog sample provenance is invalid.');
  const xs = source.axis?.values;
  check(text(source.axis?.name) && source.axis.unit === (source.analysis === 'ac' ? 'Hz' : 's') && Array.isArray(xs) && xs.length >= 2 && xs.length <= MEASUREMENT_LIMITS.points && xs.every((v, i) => finite(v) && (source.analysis === 'ac' ? v > 0 : v >= 0) && (!i || v > xs[i - 1])), 'The saved time/frequency axis must be finite, bounded, and strictly increasing.');
  check(Number.isInteger(source.originalPoints) && source.originalPoints >= xs.length && source.originalPoints <= MEASUREMENT_LIMITS.points && Array.isArray(source.sampleIndices) && source.sampleIndices.length === xs.length && source.sampleIndices.every((v, i) => Number.isInteger(v) && v >= 0 && v < source.originalPoints && (!i || v > source.sampleIndices[i - 1])), 'Original sample positions are invalid.');
  if (source.origin === 'saved-analog-samples') check(source.originalPoints === xs.length && source.sampleIndices.every((v, i) => v === i), 'Complete analog evidence cannot silently omit stored samples.');
  check(Array.isArray(source.vectors) && source.vectors.length <= MEASUREMENT_LIMITS.vectors && xs.length * (1 + source.vectors.length * (source.analysis === 'ac' ? 2 : 1)) <= MEASUREMENT_LIMITS.values, 'Selected raw evidence exceeds the sample budget.', 'MEASUREMENT_LIMIT');
  const names = new Set();
  for (const vector of source.vectors) {
    check(object(vector) && text(vector.name) && vector.name !== '0' && !names.has(vector.name), 'Raw vector names must be unique.'); names.add(vector.name);
    check(Array.isArray(vector.values) && vector.values.length === xs.length && vector.values.every(finite) && (source.analysis === 'ac' ? Array.isArray(vector.imag) && vector.imag.length === xs.length && vector.imag.every(finite) : vector.imag === undefined), 'Raw evidence has missing or nonfinite real/imaginary samples.');
  }
  check(Array.isArray(source.signals) && source.signals.length > 0 && source.signals.length <= 2, 'Retain one or two selected analog signals.');
  const ids = new Set(), used = new Set();
  for (const signal of source.signals) {
    check(object(signal) && text(signal.id) && text(signal.label) && ['V', 'A'].includes(signal.unit) && !ids.has(signal.id), 'Selected analog signal metadata is malformed.'); ids.add(signal.id);
    const refs = signal.vector !== undefined ? [signal.vector] : [signal.a, signal.b];
    check(refs.every(name => text(name) && (name === '0' || names.has(name))) && (signal.vector !== undefined ? signal.a === undefined && signal.b === undefined && signal.divisor === undefined : finite(signal.divisor) && signal.divisor !== 0), 'A differential or direct measurement has invalid saved operands.');
    refs.filter(name => name !== '0').forEach(name => used.add(name));
  }
  check(names.size === used.size, 'Saved evidence contains an unselected raw vector.');
  return source;
}
export function normalizeMeasurementSourceSpec(source, input) {
  validateMeasurementSource(source);
  const spec = normalizeMeasurementPresetSpec(input), digital = spec.kind === 'setup-hold';
  check((source.domain === 'digital') === digital, 'The measurement type does not match its saved evidence.');
  if (digital) {
    const normalized = normalizeTimingSourceSpec(source, {kind: 'delay', source: spec.clock, target: spec.data, edge: spec.edge, targetEdge: 'rising', window: spec.window});
    spec.clock = normalized.source; spec.data = normalized.target;
    const wanted = new Set([spec.clock.name, spec.data.name]);
    check(source.signals.length === wanted.size && source.signals.every(s => wanted.has(s.name)), 'Clock/data evidence has unselected or missing traces.');
  } else {
    const bounds = source.axis.values;
    check(spec.window.start >= bounds[0] && spec.window.end <= bounds.at(-1), 'The measurement window must lie inside the saved original analog samples.');
    const wanted = new Set([spec.signal, ...(spec.reference ? [spec.reference] : [])]);
    check(source.signals.length === wanted.size && source.signals.every(s => wanted.has(s.id)), 'Analog evidence has unselected or missing signals.');
    const ac = spec.kind === 'ac-cutoff' || spec.kind === 'transfer-gain' && spec.mode === 'ac';
    check((source.analysis === 'ac') === ac, ac ? 'This measurement requires a saved AC analysis.' : 'This measurement requires a saved transient analysis.');
    if (spec.kind === 'transfer-gain' || spec.kind === 'ac-cutoff') {
      const signal = source.signals.find(s => s.id === spec.signal), reference = source.signals.find(s => s.id === spec.reference);
      check(signal.unit === reference.unit, 'An amplitude gain requires input and output signals with the same unit.');
      const frequency = spec.frequency ?? spec.referenceFrequency;
      if (ac) check(frequency >= spec.window.start && frequency <= spec.window.end, 'The declared frequency must lie inside the selected AC window.');
    }
  }
  return spec;
}
export function normalizeMeasurementSpec(run, input) { return normalizeMeasurementSourceSpec(measurementSourceForRun(run, input), input); }

function lowerBound(xs, value) { let lo = 0, hi = xs.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (xs[m] < value) lo = m + 1; else hi = m; } return lo; }
function series(source, id) {
  const def = source.signals.find(s => s.id === id), n = source.axis.values.length;
  const operand = (name, key) => name === '0' ? new Array(n).fill(0) : source.vectors.find(v => v.name === name)[key];
  const result = key => { if (def.vector) return operand(def.vector, key); const a = operand(def.a, key), b = operand(def.b, key); return a.map((v, i) => (v - b[i]) / def.divisor); };
  const values = result('values'), imag = source.analysis === 'ac' ? result('imag') : undefined;
  check(values.every(finite) && (!imag || imag.every(finite)), 'Derived selected samples overflowed; no finite measurement can be computed.');
  return {...def, values, ...(imag ? {imag} : {})};
}
function sample(xs, ys, x, log = false, maxGap = null) {
  const right = lowerBound(xs, x);
  if (xs[right] === x) return {x, y: ys[right], indices: [right], interpolation: 'exact-sample', valid: true};
  const left = right - 1, gap = xs[right] - xs[left];
  if (left < 0 || right === xs.length || maxGap !== null && gap > maxGap) return {x, y: null, indices: [left, right], interpolation: 'unavailable', valid: false};
  const transform = v => log ? Math.log(v) : v, f = (transform(x) - transform(xs[left])) / (transform(xs[right]) - transform(xs[left]));
  return {x, y: ys[left] * (1 - f) + ys[right] * f, indices: [left, right], interpolation: log ? 'linear-complex-versus-log-frequency' : 'linear-between-original-samples', valid: true};
}
function windowPoints(xs, ys, window, maxGap = null) {
  const first = sample(xs, ys, window.start, false, maxGap), last = sample(xs, ys, window.end, false, maxGap), points = [first];
  for (let i = lowerBound(xs, window.start); i < xs.length && xs[i] < window.end; i++) if (xs[i] > window.start) points.push({x: xs[i], y: ys[i], indices: [i], interpolation: 'exact-sample', valid: true});
  points.push(last); return points;
}
function unresolved(points, maxGap) { return points.some((p, i) => !p.valid || i && maxGap !== null && p.x - points[i - 1].x > maxGap); }
function crossings(points, level, edge, maxGap) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (!a.valid || !b.valid || maxGap !== null && b.x - a.x > maxGap) continue;
    if (!(edge === 'rising' ? a.y < level && b.y >= level : a.y > level && b.y <= level)) continue;
    const numerator = level - a.y, denominator = b.y - a.y;
    const fraction = finite(numerator) && finite(denominator) ? numerator / denominator : (level / 2 - a.y / 2) / (b.y / 2 - a.y / 2);
    const time = b.y === level ? b.x : a.x * (1 - fraction) + b.x * fraction;
    out.push({time, level, edge, sampleIndices: [...new Set([...a.indices, ...b.indices])], interpolation: b.y === level ? 'exact-threshold-sample' : 'linear-between-original-samples'});
  }
  return out;
}
const row = (status, value, start, end, reason = '', details = {}) => ({status, value, start, end, reason, details});
const unavailable = reason => row('unavailable', null, null, null, reason);
function finish(spec, unit, rows, candidateCount, interpretation, warnings = []) {
  const truncated = candidateCount > MEASUREMENT_LIMITS.rows;
  if (truncated) warnings.push(`Only the first ${MEASUREMENT_LIMITS.rows} of ${candidateCount} occurrences are retained. Narrow the window; summaries cover retained rows only.`);
  const portable = value => value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value) || Array.isArray(value) && value.every(portable) || object(value) && Object.values(value).every(portable);
  rows = rows.slice(0, MEASUREMENT_LIMITS.rows).map((r, index) => ({index: index + 1, ...(portable(r) ? r : unavailable('Measurement arithmetic exceeded the finite numeric range. The selected raw evidence remains available.')), unit}));
  const measured = rows.filter(r => r.status === 'measured'), values = measured.map(r => r.value).filter(finite), determinate = rows.filter(r => ['measured', 'satisfied', 'violated'].includes(r.status)).length;
  const status = determinate === 0 ? rows.some(r => r.status === 'partial') ? 'partial' : 'unavailable' : determinate < rows.length || truncated ? 'partial' : 'complete';
  const mean = values.length ? values.reduce((total, v) => total + v / values.length, 0) : null;
  const result = {method: MEASUREMENT_METHOD, kind: spec.kind, spec, unit, status, value: status === 'complete' && rows.length === 1 && measured.length === 1 ? values[0] ?? null : null, rows, summary: {rowCount: rows.length, measuredCount: measured.length, satisfiedCount: rows.filter(r => r.status === 'satisfied').length, violatedCount: rows.filter(r => r.status === 'violated').length, unavailableCount: rows.length - determinate, minimum: values.length ? Math.min(...values) : null, maximum: values.length ? Math.max(...values) : null, mean}, candidateCount, truncated, interpretation, warnings};
  check(result.value === null || finite(result.value), 'Measurement arithmetic overflowed.');
  return result;
}
function timeMeasurements(source, spec) {
  const xs = source.axis.values, signal = series(source, spec.signal), points = windowPoints(xs, signal.values, spec.window, spec.maxGap), gap = unresolved(points, spec.maxGap);
  if (spec.kind === 'rise-time' || spec.kind === 'fall-time') {
    const levels = spec.levels, delta = levels.final - levels.initial, a = levels.mode === 'percent' ? levels.initial + delta * levels.low / 100 : levels.start, b = levels.mode === 'percent' ? levels.initial + delta * levels.high / 100 : levels.end;
    const edge = spec.kind === 'rise-time' ? 'rising' : 'falling', starts = crossings(points, a, edge, spec.maxGap), ends = crossings(points, b, edge, spec.maxGap), returns = crossings(points, a, edge === 'rising' ? 'falling' : 'rising', spec.maxGap), rows = [];
    let e = 0, r = 0;
    for (let i = 0; i < starts.length && rows.length < MEASUREMENT_LIMITS.rows; i++) {
      const start = starts[i]; while (e < ends.length && ends[e].time < start.time) e++; while (r < returns.length && returns[r].time <= start.time) r++;
      const end = ends[e], next = starts[i + 1]?.time ?? Infinity, back = returns[r]?.time ?? Infinity;
      if (!end || end.time >= next || end.time > back) rows.push(row('partial', null, start.time, null, back < next ? 'The response returned across its start level before reaching the end level.' : 'No complete end-level crossing occurs before the next start or window end.', {startCrossing: start, startLevel: a, endLevel: b}));
      else if (gap && unresolved(windowPoints(xs, signal.values, {start: start.time, end: end.time}, spec.maxGap), spec.maxGap)) rows.push(row('partial', null, start.time, end.time, 'An interval exceeds the declared interpolation limit.', {startCrossing: start, endCrossing: end}));
      else { rows.push(row('measured', end.time - start.time, start.time, end.time, '', {startCrossing: start, endCrossing: end, startLevel: a, endLevel: b})); e++; }
    }
    if (!rows.length) rows.push(unavailable(gap ? 'No complete crossing is supported; an interpolation interval is unresolved.' : 'No observed start-level crossing occurs in this window. A transition already in progress at its boundary is not inferred.'));
    const result = finish(spec, 's', rows, starts.length, 'Each directed start-level crossing pairs with the next end-level crossing before a return across the start level or a new start. Crossings use linear interpolation between adjacent original samples; declared step levels are not estimated from extrema.');
    if (gap) { result.warnings.push('An interval elsewhere in the selected window exceeds the interpolation limit. Additional crossings cannot be inferred there.'); if (result.status === 'complete') { result.status = 'partial'; result.value = null; } }
    return result;
  }
  if (spec.kind === 'threshold-delay') {
    const reference = series(source, spec.reference), inputs = windowPoints(xs, reference.values, spec.window, spec.maxGap), starts = crossings(inputs, spec.inputLevel, spec.inputEdge, spec.maxGap), ends = crossings(points, spec.outputLevel, spec.outputEdge, spec.maxGap), rows = []; let e = 0;
    for (let i = 0; i < starts.length && rows.length < MEASUREMENT_LIMITS.rows; i++) {
      const start = starts[i]; while (e < ends.length && ends[e].time < start.time) e++;
      const end = ends[e], next = starts[i + 1]?.time ?? Infinity;
      if (!end || end.time >= next) rows.push(row('partial', null, start.time, null, 'No selected output crossing occurs at or after this input and before the next input or window end.', {inputCrossing: start}));
      else if (unresolved(windowPoints(xs, signal.values, {start: start.time, end: end.time}, spec.maxGap), spec.maxGap) || unresolved(windowPoints(xs, reference.values, {start: start.time, end: end.time}, spec.maxGap), spec.maxGap)) rows.push(row('partial', null, start.time, end.time, 'An unresolved interpolation interval prevents a supported edge pair.', {inputCrossing: start, outputCrossing: end}));
      else { rows.push(row('measured', end.time - start.time, start.time, end.time, '', {inputCrossing: start, outputCrossing: end})); e++; }
    }
    if (!rows.length) rows.push(unavailable('No observed input-threshold crossing occurs inside the window.'));
    const result = finish(spec, 's', rows, starts.length, 'Pair each input crossing with the first selected output crossing at or after it and strictly before the next input crossing. Output crossings are not reused. Linear interpolation uses saved adjacent analog samples. This temporal pairing does not establish physical causation.');
    if (gap || unresolved(inputs, spec.maxGap)) { result.warnings.push('An interval elsewhere in the selected window exceeds the interpolation limit. Additional crossing pairs cannot be inferred there.'); if (result.status === 'complete') { result.status = 'partial'; result.value = null; } }
    return result;
  }
  if (gap) return finish(spec, spec.kind === 'overshoot' ? '%' : spec.kind === 'transfer-gain' ? 'ratio' : 's', [unavailable('The selected window contains an interpolation interval larger than its declared maximum; no value is guessed across it.')], 1, 'All selected intervals must be observed within the interpolation limit.');
  if (spec.kind === 'overshoot') {
    const direction = Math.sign(spec.final - spec.initial), peak = points.reduce((best, p) => direction * p.y > direction * best.y ? p : best), excess = Math.max(0, direction * (peak.y - spec.final)), value = 100 * excess / Math.abs(spec.final - spec.initial);
    return finish(spec, '%', [row('measured', value, spec.window.start, spec.window.end, '', {peak: peak.y, peakTime: peak.x, initial: spec.initial, final: spec.final, excursion: excess, stepAmplitude: Math.abs(spec.final - spec.initial)})], 1, 'Observed overshoot is the directional peak beyond the declared final level divided by the absolute declared step amplitude. It covers this finite window, with linear boundary interpolation; no later peak or settling is implied.');
  }
  if (spec.kind === 'settling-time') {
    const band = spec.tolerance.mode === 'percent' ? Math.abs(spec.final - spec.initial) * spec.tolerance.value / 100 : spec.tolerance.value, low = spec.final - band, high = spec.final + band, ps = windowPoints(xs, signal.values, {start: spec.referenceTime, end: spec.window.end}, spec.maxGap);
    const details = {lowerBand: low, upperBand: high, referenceTime: spec.referenceTime, observationEnd: spec.window.end, minimumHold: spec.minimumHold};
    const inside = value => value >= low && value <= high;
    if (!inside(ps.at(-1).y)) return finish(spec, 's', [row('partial', null, spec.referenceTime, spec.window.end, 'The response remains outside the settling band at the window end.', details)], 1, 'Settling is the last entry into the inclusive declared band followed by continuous observed residence through the window end. It makes no claim about later behavior.');
    let settledAt = spec.referenceTime;
    for (let i = ps.length - 2; i >= 0; i--) if (!inside(ps[i].y)) { const p = ps[i], q = ps[i + 1], limit = p.y < low ? low : high; settledAt = p.x + (q.x - p.x) * (limit - p.y) / (q.y - p.y); break; }
    const hold = spec.window.end - settledAt, rounding = Number.EPSILON * Math.max(Math.abs(spec.window.end), Math.abs(settledAt), spec.minimumHold) * 8, complete = hold + rounding >= spec.minimumHold;
    return finish(spec, 's', [row(complete ? 'measured' : 'partial', complete ? settledAt - spec.referenceTime : null, spec.referenceTime, settledAt, complete ? '' : 'The remaining observation window is shorter than the minimum settling hold.', {...details, settledAt, observedHold: hold})], 1, 'Settling is the last linearly interpolated entry into the inclusive declared tolerance band, relative to the declared stimulus time, with no subsequent exit through the finite window end. A response already in band at the reference time gives zero observed settling delay.');
  }
  const ref = series(source, spec.reference), rp = windowPoints(xs, ref.values, spec.window, spec.maxGap);
  if (unresolved(rp, spec.maxGap)) return finish(spec, 'ratio', [unavailable('The input reference has an unresolved interpolation interval.')], 1, 'The output and input use the same declared amplitude method and time window.');
  const amplitude = ps => {
    if (spec.mode === 'peak-to-peak') { let min = Infinity, max = -Infinity; for (const p of ps) { min = Math.min(min, p.y); max = Math.max(max, p.y); } return max - min; }
    let meanSquare = 0; const duration = spec.window.end - spec.window.start;
    for (let i = 1; i < ps.length; i++) { const a = ps[i - 1].y, b = ps[i].y; meanSquare += ((a * a + a * b + b * b) / 3) * ((ps[i].x - ps[i - 1].x) / duration); }
    return Math.sqrt(meanSquare);
  };
  const inputAmplitude = amplitude(rp), outputAmplitude = amplitude(points);
  if (!finite(inputAmplitude) || !finite(outputAmplitude) || inputAmplitude === 0) return finish(spec, 'ratio', [unavailable(inputAmplitude === 0 ? 'The input reference amplitude is zero; transfer gain is undefined.' : 'Amplitude arithmetic overflowed the finite range.')], 1, 'Both amplitudes use the same finite observation window.');
  const value = outputAmplitude / inputAmplitude;
  return finish(spec, 'ratio', [row('measured', value, spec.window.start, spec.window.end, '', {inputAmplitude, outputAmplitude, amplitudeUnit: signal.unit, decibels: value > 0 ? 20 * Math.log10(value) : null, mode: spec.mode})], 1, spec.mode === 'rms' ? 'Output total RMS divided by input total RMS, including DC. Time-weighted RMS integrates the square of the piecewise-linear saved waveform exactly over the declared window; it is not an AC-only gain or a phase measurement.' : 'Output peak-to-peak amplitude divided by input peak-to-peak amplitude over the same declared window. Extrema include linearly interpolated window boundaries. This amplitude ratio does not establish causation or phase.');
}
function acMeasurements(source, spec) {
  const xs = source.axis.values, output = series(source, spec.signal), input = series(source, spec.reference);
  const ratioAt = frequency => {
    const a = sample(xs, output.values, frequency, true, spec.maxGap), b = sample(xs, output.imag, frequency, true, spec.maxGap), c = sample(xs, input.values, frequency, true, spec.maxGap), d = sample(xs, input.imag, frequency, true, spec.maxGap);
    if (![a, b, c, d].every(p => p.valid)) return null;
    const inputAmplitude = Math.hypot(c.y, d.y), outputAmplitude = Math.hypot(a.y, b.y);
    if (!(inputAmplitude > 0) || !finite(inputAmplitude) || !finite(outputAmplitude)) return null;
    // JSON has one zero representation. Normalize signed zeros before atan2 so
    // a negative real-axis phase survives a portable export/import unchanged.
    const magnitude = outputAmplitude / inputAmplitude, phase = Math.atan2(b.y === 0 ? 0 : b.y, a.y === 0 ? 0 : a.y) - Math.atan2(d.y === 0 ? 0 : d.y, c.y === 0 ? 0 : c.y);
    return {frequency, magnitude, phaseDegrees: outputAmplitude === 0 ? null : (Math.atan2(Math.sin(phase), Math.cos(phase)) * 180 / Math.PI) || 0, inputAmplitude, outputAmplitude, amplitudeUnit: output.unit, sampleIndices: a.indices, interpolation: a.interpolation, decibels: magnitude > 0 ? 20 * Math.log10(magnitude) : null};
  };
  const reference = ratioAt(spec.frequency ?? spec.referenceFrequency);
  if (!reference || !finite(reference.magnitude)) return finish(spec, spec.kind === 'ac-cutoff' ? 'Hz' : 'ratio', [unavailable('The reference frequency has a zero input amplitude or an unresolved interpolation interval.')], 1, 'AC ratios use complex output and input values interpolated linearly versus log frequency.');
  if (spec.kind === 'transfer-gain') return finish(spec, 'ratio', [row('measured', reference.magnitude, spec.frequency, spec.frequency, '', reference)], 1, 'Complex output/input amplitude ratio at the declared frequency. Real and imaginary operands are linearly interpolated versus log frequency before taking amplitudes. Decibels are 20 log10 of the dimensionless magnitude ratio; phase is undefined for zero output amplitude.', reference.outputAmplitude === 0 ? ['Zero output amplitude has no defined phase.'] : []);
  if (!(reference.magnitude > 0)) return finish(spec, 'Hz', [unavailable('A zero reference transfer magnitude cannot define a relative cutoff.')], 1, 'Cutoff is relative to the explicitly selected reference-frequency transfer magnitude.');
  const frequencies = [spec.window.start, ...xs.filter(x => x > spec.window.start && x < spec.window.end), spec.window.end], curve = frequencies.map(ratioAt), targetDb = 20 * Math.log10(reference.magnitude) - spec.dropDb;
  if (curve.some(point => !point || point.decibels === null || !finite(point.decibels)) || spec.maxGap !== null && frequencies.some((x, i) => i && x - frequencies[i - 1] > spec.maxGap)) return finish(spec, 'Hz', [unavailable('A zero input/output amplitude or unresolved interval makes the cutoff curve undefined inside its search window.')], 1, 'The entire selected cutoff search window must have finite amplitude ratios; missing intervals are not bridged.');
  let crossing = null;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1], b = curve[i];
    if (spec.edge === 'falling' ? a.decibels > targetDb && b.decibels <= targetDb : a.decibels < targetDb && b.decibels >= targetDb) {
      const fraction = (targetDb - a.decibels) / (b.decibels - a.decibels), frequency = b.decibels === targetDb ? b.frequency : Math.exp(Math.log(a.frequency) + fraction * (Math.log(b.frequency) - Math.log(a.frequency)));
      crossing = {frequency, bracket: [a.frequency, b.frequency], bracketDb: [a.decibels, b.decibels], sampleIndices: [...new Set([...a.sampleIndices, ...b.sampleIndices])], targetDb, reference, interpolation: b.decibels === targetDb ? 'exact-threshold-sample' : 'linear-gain-decibels-versus-log-frequency'}; break;
    }
  }
  return finish(spec, 'Hz', crossing ? [row('measured', crossing.frequency, crossing.bracket[0], crossing.bracket[1], '', crossing)] : [row('unavailable', null, spec.window.start, spec.window.end, 'No directed relative-cutoff crossing is observed inside the window.', {targetDb, reference})], 1, 'First directed amplitude-ratio crossing of the declared dB drop below the explicit reference-frequency gain. Reference operands use linear complex interpolation versus log frequency; cutoff uses linear gain dB versus log frequency between adjacent retained samples. No filter type or passband is inferred.');
}
function projectEvents(source, ref) {
  const signal = source.signals.find(s => s.name === ref.name), events = [];
  for (let i = 0; i < signal.events.length; i++) { const e = signal.events[i], value = signal.kind === 'bus' ? e.value[signal.width - 1 - ref.bit] : e.value; if (!events.length || events.at(-1).value !== value) events.push({time: e.time, tick: Math.round(e.time / Q), value, index: i}); }
  return events;
}
function upperEvent(events, tick) { let lo = 0, hi = events.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (events[m].tick <= tick) lo = m + 1; else hi = m; } return lo; }
function setupHold(source, spec) {
  const clocks = projectEvents(source, spec.clock), data = projectEvents(source, spec.data), target = spec.edge === 'rising' ? '1' : '0', setupTicks = Math.round(spec.setup / Q), holdTicks = Math.round(spec.hold / Q), rows = []; let candidates = 0;
  const unknownPrefix = []; for (let i = 0; i < data.length; i++) unknownPrefix[i] = (unknownPrefix[i - 1] ?? 0) + (binary(data[i].value) ? 0 : 1);
  for (let i = 1; i < clocks.length; i++) {
    const clock = clocks[i], previous = clocks[i - 1];
    if (clock.time < spec.window.start || clock.time > spec.window.end || clock.value !== target) continue;
    candidates++; if (rows.length >= MEASUREMENT_LIMITS.rows) continue;
    const loTick = clock.tick - setupTicks, hiTick = clock.tick + holdTicks, lo = loTick * Q, hi = hiTick * Q;
    const details = {clockEvent: {time: clock.time, from: previous.value, to: clock.value, index: clock.index}, requiredSetup: spec.setup, requiredHold: spec.hold, interval: [lo, hi]};
    if (!binary(previous.value)) { rows.push(row('ambiguous', null, clock.time, clock.time, 'The clock entered the selected level from X/Z; no direct binary clock edge is established.', details)); continue; }
    if (lo < spec.window.start - Q * 1e-6 || hi > spec.window.end + Q * 1e-6) { rows.push(row('partial', null, clock.time, clock.time, 'The complete setup/hold interval is not retained inside the selected window.', details)); continue; }
    const first = upperEvent(data, loTick) - 1, last = upperEvent(data, hiTick) - 1;
    if (first < 0 || !binary(data[first].value) || unknownPrefix[last] > unknownPrefix[first]) { rows.push(row('ambiguous', null, clock.time, clock.time, 'The required data interval contains X/Z; binary stability and a constraint verdict are unavailable.', details)); continue; }
    const at = upperEvent(data, clock.tick) - 1, preceding = data[at], following = data[at + 1], simultaneous = at > 0 && preceding.tick === clock.tick;
    const earliest = Math.ceil(spec.window.start / Q), latest = Math.floor(spec.window.end / Q);
    const before = preceding && at > 0 && preceding.time >= spec.window.start ? preceding.tick : earliest, after = simultaneous ? clock.tick : following && following.time <= spec.window.end ? following.tick : latest;
    const setupAvailable = (clock.tick - before) * Q, holdAvailable = (after - clock.tick) * Q;
    Object.assign(details, {dataValue: preceding.value, setupAvailable, setupRelation: at > 0 && preceding.time >= spec.window.start ? 'exact' : 'at-least', holdAvailable, holdRelation: simultaneous || following && following.time <= spec.window.end ? 'exact' : 'at-least', setupMargin: (clock.tick - before - setupTicks) * Q, holdMargin: (after - clock.tick - holdTicks) * Q, simultaneous});
    if (simultaneous && !setupTicks && !holdTicks) rows.push(row('ambiguous', null, clock.time, clock.time, 'Clock and data change at the same resolved event time. Zero requirements do not establish their within-timestamp order.', details));
    else {
      const violated = clock.tick - before < setupTicks || after - clock.tick < holdTicks;
      rows.push(row(violated ? 'violated' : 'satisfied', null, clock.time, clock.time, violated ? 'The observed binary data stability interval is shorter than a declared requirement.' : 'The complete observed binary data interval meets both declared requirements.', details));
    }
  }
  if (!rows.length) rows.push(unavailable('No selected clock transition is preserved in this window.'));
  const hasClockUnknown = clocks.some((e, i) => !binary(e.value) && e.time <= spec.window.end && (clocks[i + 1]?.time ?? source.timeBounds[1]) >= spec.window.start);
  const result = finish(spec, 's', rows, candidates, 'Constraints check each resolved direct binary clock edge against the selected scalar data or bus bit. Equality at the setup/hold limits satisfies the constraint. Missing prior/next transitions produce explicit lower bounds, never invented edges. X/Z intervals and unresolved same-time ordering remain ambiguous. These digital event checks do not simulate physical metastability.', hasClockUnknown ? ['The clock contains X/Z inside the selected window; additional binary clock edges cannot be inferred.'] : []);
  if (hasClockUnknown && result.status === 'complete') result.status = 'partial';
  result.timeResolution = Q; return result;
}
export function measureMeasurementSource(source, input) {
  const spec = normalizeMeasurementSourceSpec(source, input);
  return spec.kind === 'setup-hold' ? setupHold(source, spec) : source.analysis === 'ac' ? acMeasurements(source, spec) : timeMeasurements(source, spec);
}
export function measureMeasurement(run, spec) { return measureMeasurementSource(measurementSourceForRun(run, spec), spec); }
/** A comparison must not silently average repeated or incomplete measurements. */
export function measurementScalar(result) {
  const valid = result?.status === 'complete' && result.rows?.length === 1 && result.rows[0].status === 'measured' && finite(result.rows[0].value);
  return {value: valid ? result.rows[0].value : null, unit: result?.unit ?? '', status: valid ? 'measured' : 'unavailable', reason: valid ? '' : result?.rows?.length > 1 ? 'The configuration produced multiple occurrences; select a window with one complete measurement.' : result?.rows?.[0]?.reason || 'A complete, unambiguous scalar measurement is unavailable.'};
}
