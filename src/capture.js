import { validateCoordinatedResult } from './coordinated-results.js';

export const CAPTURE_LIMITS = Object.freeze({ records: 6, recordBytes: 16 * 1024 * 1024, historyBytes: 32 * 1024 * 1024, duration: 9000 });
const copy = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const fail = message => { throw new Error(message); };
const grid = value => Math.round(value / 1e-12) * 1e-12;
const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;

/** A trigger is a declared measurement condition, not an electrical component. */
export function normalizeTrigger(input) {
  if (!input || !['analog', 'digital'].includes(input.kind) || typeof input.signal !== 'string' || !input.signal || input.signal.length > 200 || !['rising', 'falling', 'either'].includes(input.edge)) fail('Choose a signal, trigger kind and rising, falling or either edge.');
  const result = { kind: input.kind, signal: input.signal, edge: input.edge };
  if (input.kind === 'analog') {
    if (!finite(input.threshold) || Math.abs(input.threshold) > 1e12) fail('The analog trigger threshold must be a finite value.');
    result.threshold = input.threshold;
  } else if (input.bit !== undefined) {
    if (!Number.isInteger(input.bit) || input.bit < 0 || input.bit > 7) fail('Choose a digital bus bit from 0 to 7.');
    result.bit = input.bit;
  }
  return result;
}

export function triggerCrossed(trigger, before, after) {
  if (trigger.kind === 'analog') {
    if (!finite(before) || !finite(after)) return false;
    return (trigger.edge !== 'falling' && before < trigger.threshold && after >= trigger.threshold) || (trigger.edge !== 'rising' && before > trigger.threshold && after <= trigger.threshold);
  }
  return (trigger.edge !== 'falling' && before === '0' && after === '1') || (trigger.edge !== 'rising' && before === '1' && after === '0');
}

export function normalizeCaptureRequest(input) {
  if (!input || !['capture', 'until'].includes(input.mode ?? 'capture')) fail('Choose capture or run until event.');
  const trigger = normalizeTrigger(input.trigger);
  const mode = input.mode ?? 'capture', before = input.before ?? 0, after = mode === 'until' ? 0 : input.after ?? 0, search = input.search;
  for (const [name, value] of [['Pre-trigger duration', before], ['Post-trigger duration', after], ['Search duration', search]]) {
    if (!finite(value) || value < (name === 'Search duration' ? 1e-12 : 0) || value > CAPTURE_LIMITS.duration) fail(`${name} must fit the positive, bounded simulation timeline.`);
  }
  if (before + after > CAPTURE_LIMITS.duration) fail('The total capture window must be at most 9,000 seconds.');
  return { mode, trigger, before: grid(before), after: grid(after), search: grid(search) };
}

/** Keep accepted samples only, including the preceding sample needed to explain
 * a trigger edge. The requested and actual bounds remain separate. */
export function sliceCaptureResult(result, requestedStart) {
  const { axis, end } = validateCoordinatedResult(result), times = axis.values;
  let first = 0;
  while (first + 1 < times.length && times[first + 1] < requestedStart) first++;
  const start = times[first], vectors = result.vectors.map(vector => ({ ...copy(vector), values: vector.values.slice(first) }));
  const digitalEvents = result.digitalEvents.map(entry => {
    let value = entry.events[0].value;
    for (const event of entry.events) { if (event.time > start) break; value = event.value; }
    return { ...copy(entry), events: [{ time: start, value }, ...entry.events.filter(event => event.time > start).map(copy)] };
  });
  const totalPoints = result.continuous?.totalPoints ?? result.points;
  return { ...copy(result), points: times.length - first, vectors, digitalEvents, startTime: start,
    sampling: { ...copy(result.sampling), mode: 'continuous-window', analogSampleIndices: undefined, windowStart: start, windowEnd: end, timeBounds: [start, end] },
    continuous: { ...copy(result.continuous), formatVersion: 1, startedAtTime: 0, windowStart: start, currentTime: end, totalPoints, droppedPoints: totalPoints - (times.length - first), inputChanges: copy(result.continuous?.inputChanges ?? []), stateRetained: true, sessionStatus: 'snapshot' } };
}

export function captureCoverage(result, request, event) {
  const { start, end } = validateCoordinatedResult(result), requestedStart = grid(event.time - request.before), requestedEnd = grid(event.time + request.after);
  const missingBefore = Math.max(0, start - requestedStart), missingAfter = Math.max(0, requestedEnd - end);
  return { requestedStart, requestedEnd, actualStart: start, actualEnd: end, missingBefore, missingAfter,
    status: missingBefore > 1e-15 || missingAfter > 1e-15 ? 'partial' : 'complete',
    description: missingBefore > 1e-15 ? 'Requested pre-trigger history is unavailable before the retained window. No samples were invented.' : 'Accepted samples cover the requested pre-trigger window; a preceding original sample may extend the visible bounds.' };
}

export function createCaptureRecord(run, capture, { id = `capture_${crypto.randomUUID().replaceAll('-', '_')}`, createdAt = new Date().toISOString() } = {}) {
  if (capture?.status !== 'complete' || !capture.event || !capture.result) fail('A completed trigger event and retained capture are required.');
  const request = normalizeCaptureRequest(capture.request), event = copy(capture.event), result = copy(capture.result);
  const bounds = validateCoordinatedResult(result);
  result.continuous.sessionStatus = 'snapshot';
  result.continuous.inputChanges = result.continuous.inputChanges.filter(change => change.time <= bounds.end);
  const record = { formatVersion: 1, id, createdAt, sourceRunId: run.id, request, event, coverage: captureCoverage(result, request, event),
    run: { ...copy(run), id: `run_${id}`, sourceRunId: run.id, status: 'completed-with-warnings', completedAt: createdAt, engine: copy(result.engine), logs: copy(result.logs ?? []), label: 'Triggered capture', result } };
  record.run.result.warnings = [...new Set([...(result.warnings ?? []), 'Triggered capture is a non-resumable snapshot of the retained solver state.', ...(record.coverage.status === 'partial' ? [record.coverage.description] : [])])];
  return record;
}

function validateEvent(event, request) {
  const boundary = event?.method === 'live-input-boundary';
  if (!event || event.kind !== 'trigger' || !finite(event.time) || !finite(event.previousTime) || event.previousTime < 0 || (boundary ? event.time !== event.previousTime : event.time <= event.previousTime) || !same(normalizeTrigger(event.trigger), request.trigger) || !triggerCrossed(request.trigger, event.before, event.after)) fail('Saved trigger evidence does not establish the declared crossing.');
  if (!boundary && (request.trigger.kind === 'analog' && event.method !== 'accepted-step-threshold-localization' || request.trigger.kind === 'digital' && event.method !== 'settled-digital-event')) fail('Saved trigger localization method is invalid.');
  if (boundary && (!Array.isArray(event.updates) || !event.updates.length || event.updates.length > 64)) fail('Saved live-input trigger must retain its applied updates.');
  return copy(event);
}

export function validateCaptureRecords(input = [], validateRun) {
  if (!Array.isArray(input) || input.length > CAPTURE_LIMITS.records) fail('Keep at most six independent capture records.');
  let bytes = 0; const ids = new Set();
  return input.map(value => {
    const size = new TextEncoder().encode(JSON.stringify(value)).length; bytes += size;
    if (!value || value.formatVersion !== 1 || typeof value.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(value.id) || ids.has(value.id) || !Number.isFinite(Date.parse(value.createdAt)) || typeof value.sourceRunId !== 'string' || size > CAPTURE_LIMITS.recordBytes || bytes > CAPTURE_LIMITS.historyBytes) fail('Saved capture identity or size is invalid.');
    ids.add(value.id);
    const request = normalizeCaptureRequest(value.request), event = validateEvent(value.event, request), run = validateRun(value.run);
    if (run.id !== `run_${value.id}` || run.sourceRunId !== value.sourceRunId || !run.result?.continuous || event.time > run.result.continuous.currentTime) fail('Saved capture does not match its source run or retained timeline.');
    const coverage = captureCoverage(run.result, request, event);
    if (!same(coverage, value.coverage)) fail('Saved capture coverage disagrees with its raw history bounds.');
    const vector = run.result.vectors.find(vector => vector.name === request.trigger.signal), times = run.result.vectors.find(vector => vector.name === 'time').values;
    if (!vector || (request.trigger.kind === 'analog' ? vector.unit === 'logic' : !['logic', 'bus'].includes(vector.kind))) fail('Saved trigger signal is missing or has the wrong domain.');
    if (vector.kind === 'bus' && (request.trigger.bit === undefined || request.trigger.bit >= vector.width) || vector.kind === 'logic' && request.trigger.bit !== undefined) fail('Saved digital trigger requires an explicit valid bus bit.');
    const selected = value => vector.kind === 'bus' ? value[vector.width - 1 - request.trigger.bit] : value;
    if (event.method === 'live-input-boundary' && !run.result.continuous.inputChanges.some(change => change.time === event.time && same(change.updates, event.updates))) fail('Saved live-input trigger is absent from the source input history.');
    for (const [time, expected] of [...(event.method === 'live-input-boundary' ? [] : [[event.previousTime, event.before]]), [event.time, event.after]]) {
      const index = times.indexOf(time);
      if (index < 0 && time >= times[0] && time <= times.at(-1)) fail('Saved trigger witness time is absent from retained raw samples.');
      if (index >= 0 && selected(vector.values[index]) !== expected) fail('Saved trigger witness disagrees with retained raw samples.');
    }
    return { formatVersion: 1, id: value.id, createdAt: value.createdAt, sourceRunId: value.sourceRunId, request, event, coverage, run };
  });
}

export function retainCaptureRecords(records, record) {
  const kept = [...records, record]; let droppedCount = 0;
  if (bytes(record) > CAPTURE_LIMITS.recordBytes) fail('This capture exceeds the 16 MiB evidence bound; shorten the capture window.');
  while (kept.length > CAPTURE_LIMITS.records || bytes(kept) > CAPTURE_LIMITS.historyBytes) { kept.shift(); droppedCount++; }
  return { records: kept, droppedCount };
}

export const captureEvidenceJSON = record => JSON.stringify({ format: 'CircuitBench triggered capture evidence', formatVersion: 1, capture: record }, null, 2);
