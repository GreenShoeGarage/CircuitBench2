/** Reproducible timing measurements over preserved, resolved digital events.
 * Logic samples and plotted/interpolated pixels are never an edge source.
 */
export const TIMING_METHOD = 'cb-event-timing-1';
export const TIMING_KINDS = Object.freeze(['delay', 'pulse-width', 'period', 'frequency', 'duty-cycle']);
export const TIMING_LIMITS = Object.freeze({ events: 250000, rows: 256, signals: 2 });
const Q = 1e-12;
const known = value => value === '0' || value === '1';
const fail = (message, code = 'TIMING_INVALID') => Object.assign(new Error(message), { code });
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = (value, limit = 200) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const pairings = Object.freeze({
  delay: 'For each source edge, use the first selected target edge at or after it and strictly before the next selected source edge. A target is never reused. Equal timestamps give zero delay. This temporal pairing does not establish physical causation.',
  'pulse-width': 'A rising source edge begins a high pulse; a falling source edge begins a low pulse. The next state change must be its known opposite edge. An X/Z transition interrupts the pulse without a numeric width.',
  period: 'Pair consecutive source edges of the selected polarity. Both edges and the complete intervening interval must be inside the selected window and known.',
  frequency: 'Use the reciprocal of each complete period between consecutive source edges of the selected polarity. This is a per-cycle frequency, not an edge-count estimate.',
  'duty-cycle': 'Between consecutive source edges of the selected polarity, divide the complete known high-state duration by the cycle duration. The result is always percent high, including cycles that begin on a falling edge.'
});

function runAvailable(run) {
  return ['completed', 'completed-with-warnings'].includes(run?.status) && run.analysis?.type === 'tran' && Array.isArray(run.result?.digitalEvents) && run.result.digitalEvents.length > 0;
}

function runMetadata(run) {
  if (!runAvailable(run)) throw fail('Choose a completed transient run with preserved digital events. Older sampled-only runs must be simulated again.', 'TIMING_UNAVAILABLE');
  const vectors = run.result.vectors;
  if (!Array.isArray(vectors) || vectors.length > 256 || run.result.digitalEvents.length > 256) throw fail('The run has invalid or oversized digital trace metadata.');
  const names = new Set(), metadata = [], probeIds = new Set((run.projectSnapshot?.probes ?? []).map(probe => probe.id));
  for (const entry of run.result.digitalEvents) {
    if (!entry || !text(entry.name) || names.has(entry.name)) throw fail('Digital event names must be unique and match their saved traces.');
    names.add(entry.name);
    const matches = vectors.filter(vector => vector?.name === entry.name);
    if (matches.length !== 1) throw fail('Digital event names must match exactly one saved trace.');
    const vector = matches[0], kind = vector.kind, width = kind === 'logic' ? 1 : vector.width;
    if (!['logic', 'bus'].includes(kind) || vector.unit !== 'logic' || !Number.isInteger(width) || width < 1 || width > 8 || kind === 'bus' && (width < 2 || vector.bitOrder !== 'msb-first') || kind === 'logic' && (vector.width !== undefined && vector.width !== 1 || vector.bitOrder !== undefined && vector.bitOrder !== 'msb-first')) throw fail('Timing measurements require scalar logic or an explicitly selected 2–8 bit bus bit.');
    if (entry.kind !== undefined && entry.kind !== kind || entry.width !== undefined && entry.width !== width || entry.bitOrder !== undefined && entry.bitOrder !== 'msb-first') throw fail('Digital event metadata disagrees with its saved trace.');
    const matching = run.measurements?.filter(item => item?.vector === entry.name) ?? [];
    const label = (matching.find(item => probeIds.has(item.id)) ?? matching.at(-1))?.label ?? entry.name;
    metadata.push({ name: entry.name, label: text(label) ? label : entry.name, kind, width, bitOrder: 'msb-first', events: entry.events });
  }
  return metadata;
}

/** Each word bit is a separate explicit choice. Bit zero is the rightmost bit. */
export function getTimingSignals(run) {
  if (!runAvailable(run)) return [];
  try {
    return runMetadata(run).flatMap(({ name, label, kind, width }) => kind === 'logic'
      ? [{ name, label, kind, width }]
      : Array.from({ length: width }, (_, bit) => ({ name, label: `${label} [${bit}]`, kind, width, bit })));
  } catch { return []; }
}

function reference(value, signals, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !text(value.name)) throw fail(`Select a ${label} digital signal.`);
  const signal = signals.find(item => item.name === value.name);
  if (!signal) throw fail(`The ${label} signal is absent from the preserved digital events.`);
  if (signal.kind === 'bus') {
    if (!Number.isInteger(value.bit) || value.bit < 0 || value.bit >= signal.width) throw fail(`Select an explicit bit from 0 to ${signal.width - 1} for ${signal.label}.`);
    return { name: signal.name, bit: value.bit };
  }
  if (value.bit !== undefined) throw fail('A scalar logic signal has no bus-bit selector.');
  return { name: signal.name };
}

function sourceFromRun(run, spec) {
  const metadata = runMetadata(run), axis = run.result.vectors.find(vector => vector.name === 'time');
  if (!axis || axis.unit !== 's' || !Array.isArray(axis.values) || !axis.values.length || axis.values.length > 250000 || !finite(axis.values[0]) || axis.values[0] < 0 || axis.values[0] > 0 && run.result.sampling?.mode !== 'continuous-window' || !finite(axis.values.at(-1))) throw fail('The run needs a saved transient time range with an explicit retained boundary.');
  const sourceRef = reference(spec?.source, metadata, 'source'), refs = [sourceRef];
  if (spec?.kind === 'delay') refs.push(reference(spec.target, metadata, 'target'));
  const selected = new Set(refs.map(item => item.name));
  return {
    timeBounds: [axis.values[0], axis.values.at(-1)],
    signals: metadata.filter(signal => selected.has(signal.name)),
    timeResolution: run.result.sampling?.timeResolution ?? run.result.engine?.digital?.timeResolution ?? run.result.engine?.timeResolution,
    eventSource: 'preserved-digital-events'
  };
}

function validateSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source) || source.eventSource !== 'preserved-digital-events' || source.timeResolution !== Q) throw fail('Timing evidence requires preserved digital events on the declared 1 ps time grid.');
  if (!Array.isArray(source.timeBounds) || source.timeBounds.length !== 2 || !finite(source.timeBounds[0]) || source.timeBounds[0] < 0 || !finite(source.timeBounds[1]) || source.timeBounds[1] <= source.timeBounds[0] || source.timeBounds[1] > Number.MAX_SAFE_INTEGER * Q) throw fail('Timing evidence has an invalid finite run boundary.');
  if (!Array.isArray(source.signals) || source.signals.length < 1 || source.signals.length > TIMING_LIMITS.signals) throw fail('A timing measurement retains one or two selected event traces.');
  let eventCount = 0;
  const names = new Set();
  for (const signal of source.signals) {
    if (!signal || !text(signal.name) || !text(signal.label) || names.has(signal.name) || !['logic', 'bus'].includes(signal.kind) || !Number.isInteger(signal.width) || signal.width < 1 || signal.width > 8 || signal.kind === 'logic' && signal.width !== 1 || signal.kind === 'bus' && signal.width < 2 || signal.bitOrder !== 'msb-first') throw fail('Timing event trace names, kinds, widths or bit order are invalid.');
    names.add(signal.name);
    if (!Array.isArray(signal.events) || !signal.events.length || signal.events.length > TIMING_LIMITS.events || (eventCount += signal.events.length) > TIMING_LIMITS.events) throw fail(`Timing measurements support at most ${TIMING_LIMITS.events.toLocaleString('en-US')} selected digital events in total. Select a shorter run.`, 'TIMING_LIMIT');
    let previousTime = -1, previousTick = -1, previousValue;
    for (let index = 0; index < signal.events.length; index++) {
      const event = signal.events[index], tick = event && Math.round(event.time / Q);
      if (!event || !finite(event.time) || event.time < source.timeBounds[0] || event.time > source.timeBounds[1] || event.time <= previousTime || index === 0 && event.time !== source.timeBounds[0] || !Number.isSafeInteger(tick) || tick <= previousTick || Math.abs(event.time - tick * Q) > Math.max(Q * 1e-6, Number.EPSILON * Math.abs(event.time) * 4)) throw fail('Digital events must begin at the retained boundary and have finite, strictly increasing times on the 1 ps grid within the run.');
      if (typeof event.value !== 'string' || event.value.length !== signal.width || !/^[01XZ]+$/.test(event.value) || event.value === previousValue) throw fail('Digital events must contain change-only literal 0, 1, X or Z states at the saved width.');
      previousTime = event.time; previousTick = tick; previousValue = event.value;
    }
  }
  return source;
}

function normalizeSpec(source, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !TIMING_KINDS.includes(input.kind)) throw fail('Choose delay, pulse width, period, frequency or duty cycle.');
  const edge = input.edge ?? 'rising';
  if (!['rising', 'falling'].includes(edge)) throw fail('Edge polarity must be rising or falling.');
  const spec = { kind: input.kind, source: reference(input.source, source.signals, 'source'), edge };
  if (input.kind === 'delay') {
    spec.target = reference(input.target, source.signals, 'target');
    spec.targetEdge = input.targetEdge ?? 'rising';
    if (!['rising', 'falling'].includes(spec.targetEdge)) throw fail('Target edge polarity must be rising or falling.');
  }
  const start = input.window?.start ?? source.timeBounds[0], end = input.window?.end ?? source.timeBounds[1];
  if (input.window !== undefined && (!input.window || typeof input.window !== 'object' || Array.isArray(input.window)) || !finite(start) || !finite(end) || start < source.timeBounds[0] || end > source.timeBounds[1] || start > end) throw fail('Choose a finite timing window inside the saved run, with its start no later than its end.');
  spec.window = { start, end };
  return spec;
}

/** Captures complete selected sparse traces without depending on logic samples. */
export function timingSourceForRun(run, spec) {
  const source = validateSource(sourceFromRun(run, spec));
  normalizeSpec(source, spec);
  return { ...source, timeBounds: [...source.timeBounds], signals: source.signals.map(signal => ({ ...signal, events: signal.events.map(event => ({ time: event.time, value: event.value })) })) };
}

export function normalizeTimingSpec(run, spec) {
  return normalizeSpec(validateSource(sourceFromRun(run, spec)), spec);
}

export function normalizeTimingSourceSpec(source, spec) {
  return normalizeSpec(validateSource(source), spec);
}

function upperBound(items, time) {
  let low = 0, high = items.length;
  while (low < high) { const middle = (low + high) >>> 1; if (items[middle].time <= time) low = middle + 1; else high = middle; }
  return low;
}
function lowerBound(items, time) {
  let low = 0, high = items.length;
  while (low < high) { const middle = (low + high) >>> 1; if (items[middle].time < time) low = middle + 1; else high = middle; }
  return low;
}
const publicEvent = event => event ? { time: event.time, from: event.from, to: event.to, index: event.index } : null;

function projectTrace(signal, ref) {
  const events = [], rising = [], falling = [], uncertain = [], unknownPrefix = [], highPrefix = [];
  for (let index = 0; index < signal.events.length; index++) {
    const input = signal.events[index], value = signal.kind === 'bus' ? input.value[signal.width - 1 - ref.bit] : input.value;
    if (events.length && events.at(-1).value === value) continue;
    const previous = events.at(-1), position = events.length, tick = Math.round(input.time / Q);
    const event = { time: input.time, tick, value, index, position, from: previous?.value ?? null, to: value };
    highPrefix.push(position ? highPrefix[position - 1] + (previous.value === '1' ? tick - previous.tick : 0) : 0);
    unknownPrefix.push((position ? unknownPrefix[position - 1] : 0) + (known(value) ? 0 : 1));
    events.push(event);
    if (!previous) continue;
    if (previous.value === '0' && value === '1') rising.push(event);
    else if (previous.value === '1' && value === '0') falling.push(event);
    else uncertain.push(event);
  }
  return { ...signal, ref, events, rising, falling, uncertain, unknownPrefix, highPrefix };
}

function hasUnknown(trace, start, end, exclusiveEnd = false) {
  const first = upperBound(trace.events, start) - 1;
  const last = (exclusiveEnd ? lowerBound(trace.events, end) : upperBound(trace.events, end)) - 1;
  if (last < first) return false;
  return !known(trace.events[first].value) || trace.unknownPrefix[last] > trace.unknownPrefix[first];
}

function measureSource(validSource, input) {
  const spec = normalizeSpec(validSource, input), projected = new Map();
  const traceFor = ref => {
    const key = `${ref.name}\u0000${ref.bit ?? ''}`;
    if (!projected.has(key)) projected.set(key, projectTrace(validSource.signals.find(signal => signal.name === ref.name), ref));
    return projected.get(key);
  };
  const source = traceFor(spec.source), target = spec.kind === 'delay' ? traceFor(spec.target) : null;
  const { start, end } = spec.window, allEdges = source[spec.edge], first = lowerBound(allEdges, start), afterLast = upperBound(allEdges, end), edgeCount = afterLast - first;
  const warnings = [], rows = [], candidateCount = edgeCount || 1, truncated = candidateCount > TIMING_LIMITS.rows;
  for (const trace of projected.values()) {
    const bitLabel = trace.ref.bit === undefined ? trace.label : `${trace.label} [${trace.ref.bit}]`;
    if (hasUnknown(trace, start, end)) warnings.push(`${bitLabel} contains X/Z in the selected window. Only direct known 0→1 or 1→0 changes count as edges; intervals containing X/Z have no numeric timing value.`);
    const uncertain = upperBound(trace.uncertain, end) - lowerBound(trace.uncertain, start);
    if (uncertain) warnings.push(`${bitLabel}: ${uncertain} transition${uncertain === 1 ? '' : 's'} involving X/Z ${uncertain === 1 ? 'was' : 'were'} excluded from edge selection.`);
  }
  if (truncated) warnings.push(`Showing the first ${TIMING_LIMITS.rows} of ${candidateCount} candidate measurements. The summary covers retained measured rows only. Narrow the time window to inspect later events.`);
  const makeRow = (event, targetEvent, status, value, reason, details = {}) => ({ index: rows.length + 1, status, value, start: event?.time ?? null, end: targetEvent?.time ?? null, sourceEvent: publicEvent(event), targetEvent: publicEvent(targetEvent), reason, details });
  const unknownSignals = (a, b, exclusive = false) => [...projected.values()].filter(trace => hasUnknown(trace, a, b, exclusive)).map(trace => trace.ref.bit === undefined ? trace.name : `${trace.name}[${trace.ref.bit}]`);
  if (!edgeCount) {
    const uncertain = hasUnknown(source, start, end);
    rows.push(makeRow(null, null, 'missing-edge', null, `No direct known ${spec.edge} source edge occurs in the selected window.${uncertain ? ' X/Z is present and cannot be treated as a known edge.' : ''} An initial value at time zero is not an edge.`, { observedUntil: end }));
  }
  for (let offset = 0; offset < Math.min(edgeCount, TIMING_LIMITS.rows); offset++) {
    const index = first + offset, event = allEdges[index];
    if (spec.kind === 'pulse-width') {
      const next = source.events[event.position + 1], level = spec.edge === 'rising' ? '1' : '0';
      if (!next || next.time > end) {
        rows.push(makeRow(event, null, 'missing-edge', null, `The ${level === '1' ? 'high' : 'low'} pulse has no closing known edge before the selected window ends.`, { level, observedUntil: end }));
      } else if (!known(next.value)) {
        rows.push(makeRow(event, next, 'indeterminate', null, `The pulse enters ${next.value} before a known opposite edge; its width is indeterminate.`, { level, observedUntil: next.time, signals: [spec.source.name] }));
      } else {
        const elapsed = (next.tick - event.tick) * Q;
        rows.push(makeRow(event, next, 'measured', elapsed, '', { elapsed, level }));
      }
      continue;
    }
    let next, observedUntil = end, exclusiveEnd = false;
    if (spec.kind === 'delay') {
      const nextSource = allEdges[index + 1];
      if (nextSource && nextSource.time <= end) { observedUntil = nextSource.time; exclusiveEnd = true; }
      const candidate = target[spec.targetEdge][lowerBound(target[spec.targetEdge], event.time)];
      if (candidate && candidate.time <= end && (!nextSource || candidate.time < nextSource.time)) next = candidate;
    } else {
      const candidate = allEdges[index + 1];
      if (candidate && candidate.time <= end) next = candidate;
    }
    if (!next) {
      const signals = unknownSignals(event.time, observedUntil, exclusiveEnd);
      const reason = spec.kind === 'delay'
        ? `No selected target edge occurs at or after this source edge ${exclusiveEnd ? 'and before the next selected source edge' : 'before the selected window ends'}.`
        : 'No next source edge of the selected polarity closes this cycle inside the window.';
      rows.push(makeRow(event, null, signals.length ? 'indeterminate' : 'missing-edge', null, reason + (signals.length ? ' X/Z also makes the interval indeterminate.' : ''), { observedUntil, ...(signals.length ? { signals } : {}) }));
      continue;
    }
    const elapsed = (next.tick - event.tick) * Q, signals = unknownSignals(event.time, next.time);
    if (signals.length) {
      rows.push(makeRow(event, next, 'indeterminate', null, 'The paired interval contains X/Z; no numeric timing value is assigned.', { elapsed, signals }));
      continue;
    }
    let value = elapsed, details = { elapsed };
    if (spec.kind === 'frequency') value = 1 / elapsed;
    if (spec.kind === 'duty-cycle') {
      const highTime = (source.highPrefix[next.position] - source.highPrefix[event.position]) * Q;
      value = highTime / elapsed * 100; details = { elapsed, cycleTime: elapsed, highTime };
    }
    rows.push(makeRow(event, next, 'measured', value, '', details));
  }
  const measured = rows.filter(row => row.status === 'measured').map(row => row.value);
  return {
    kind: 'timing', method: TIMING_METHOD, spec,
    unit: spec.kind === 'frequency' ? 'Hz' : spec.kind === 'duty-cycle' ? '%' : 's', rows,
    summary: { measuredCount: measured.length, indeterminateCount: rows.filter(row => row.status === 'indeterminate').length, missingCount: rows.filter(row => row.status === 'missing-edge').length, totalCount: rows.length, minimum: measured.length ? Math.min(...measured) : null, maximum: measured.length ? Math.max(...measured) : null, mean: measured.length ? measured.reduce((sum, value) => sum + value, 0) / measured.length : null },
    truncated, candidateCount, warnings, pairing: pairings[spec.kind], timeResolution: Q, eventSource: 'preserved-digital-events'
  };
}

export function measureTimingSource(source, spec) {
  return measureSource(validateSource(source), spec);
}

export function measureTiming(run, spec) {
  return measureSource(validateSource(sourceFromRun(run, spec)), spec);
}
