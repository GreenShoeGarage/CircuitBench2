/** Shared exact-boundary validation for bounded and continuous solver chunks. */
export const COORDINATED_RESULT_LIMITS = Object.freeze({ points: 250000, vectors: 256, values: 2000000, events: 250000, total: 2000000 });
const fail = (message, code = 'COORDINATED_RESULT') => Object.assign(new Error(message), { code, status: 'failed', phase: 'coordinated-simulation' });
const copy = value => structuredClone(value);
const digital = vector => vector.kind === 'logic' || vector.kind === 'bus';
const metadata = vector => [vector.name, vector.unit, vector.kind, vector.width, vector.bitOrder].join('\u0000');
const validState = (value, vector) => typeof value === 'string' && (vector.kind === 'bus' ? value.length === vector.width && /^[01XZ]+$/.test(value) : /^[01XZ]$/.test(value));

export function validateCoordinatedResult(result) {
  if (!result || !Number.isInteger(result.points) || result.points < 1 || result.points > COORDINATED_RESULT_LIMITS.points || !Array.isArray(result.vectors) || !result.vectors.length || result.vectors.length > COORDINATED_RESULT_LIMITS.vectors) throw fail('A coordinated result requires bounded numerical vectors and points.');
  const names = new Set(), values = result.points * result.vectors.length;
  if (values > COORDINATED_RESULT_LIMITS.values) throw fail('Coordinated result value budget exceeded.', 'COORDINATED_RESULT_LIMIT');
  for (const vector of result.vectors) {
    if (!vector || typeof vector.name !== 'string' || !vector.name || names.has(vector.name) || !Array.isArray(vector.values) || vector.values.length !== result.points || vector.imag !== undefined) throw fail('Coordinated vector names, lengths and real values must be consistent.');
    names.add(vector.name);
    if (digital(vector)) {
      if (vector.unit !== 'logic' || vector.kind === 'bus' && (!Number.isInteger(vector.width) || vector.width < 2 || vector.width > 8 || vector.bitOrder !== 'msb-first') || !vector.values.every(value => validState(value, vector))) throw fail('Coordinated logic vectors require exact literal 0/1/X/Z states and trusted bus widths.');
    } else if (vector.unit === 'logic' || !vector.values.every(value => typeof value === 'number' && Number.isFinite(value))) throw fail('Coordinated analog values must be finite numbers.');
  }
  const axis = result.vectors.find(vector => vector.name === 'time');
  if (!axis || axis.unit !== 's' || digital(axis) || axis.values.some((time, index) => time < 0 || index > 0 && time <= axis.values[index - 1])) throw fail('Coordinated timestamps must be finite and strictly increase.');
  const start = axis.values[0], end = axis.values.at(-1), series = result.digitalEvents ?? [], eventNames = new Set();
  if (!Array.isArray(series) || series.length > 255) throw fail('Coordinated sparse digital traces must be bounded.');
  let eventCount = 0;
  for (const entry of series) {
    const vector = result.vectors.find(vector => vector.name === entry?.name);
    if (!vector || !digital(vector) || eventNames.has(entry.name) || (entry.kind ?? 'logic') !== vector.kind || vector.kind === 'bus' && (entry.width !== vector.width || entry.bitOrder !== vector.bitOrder) || !Array.isArray(entry.events) || !entry.events.length || entry.events[0].time !== start) throw fail('Coordinated sparse traces need a matching vector and an exact boundary state.');
    eventNames.add(entry.name); eventCount += entry.events.length;
    if (eventCount > COORDINATED_RESULT_LIMITS.events) throw fail('Coordinated sparse event budget exceeded.', 'COORDINATED_RESULT_LIMIT');
    let prior = -Infinity, priorValue;
    for (const event of entry.events) {
      if (!event || !Number.isFinite(event.time) || event.time < start || event.time > end || event.time <= prior || !validState(event.value, vector) || event.value === priorValue) throw fail('Coordinated digital events must be ordered change-only literal states inside the chunk.');
      prior = event.time; priorValue = event.value;
    }
    let index = 0;
    for (let sample = 0; sample < axis.values.length; sample++) {
      while (index + 1 < entry.events.length && entry.events[index + 1].time <= axis.values[sample]) index++;
      if (vector.values[sample] !== entry.events[index].value) throw fail('Coordinated sparse events disagree with their saved logic samples.');
    }
  }
  if (result.vectors.filter(digital).some(vector => !eventNames.has(vector.name))) throw fail('Every coordinated digital vector needs preserved sparse events.');
  return { axis, start, end, values, events: eventCount };
}

/** Replace the shared timestamp with the new settled boundary. A live input may
 * change that value; no intervening time or interpolated state is invented. */
export function mergeCoordinatedChunks(previous, chunk, { maxPoints = COORDINATED_RESULT_LIMITS.points, maxValues = COORDINATED_RESULT_LIMITS.values, maxEvents = COORDINATED_RESULT_LIMITS.events, maxTotal = COORDINATED_RESULT_LIMITS.total } = {}) {
  const current = validateCoordinatedResult(chunk);
  let points = chunk.points, vectors = chunk.vectors, events = chunk.digitalEvents ?? [], start = current.start;
  if (previous) {
    const prior = validateCoordinatedResult(previous);
    if (prior.end !== current.start) throw fail('Coordinated chunks must share the exact state boundary; gaps and overlaps are not interpolated.', 'COORDINATED_BOUNDARY');
    if (previous.vectors.length !== vectors.length || vectors.some(vector => !previous.vectors.some(old => metadata(old) === metadata(vector)))) throw fail('The coordinated vector set or metadata changed. Restart after editing the circuit.');
    points = previous.points + chunk.points - 1; start = prior.start;
    if (points > maxPoints || points * vectors.length > maxValues) throw fail('Combined coordinated results exceed the point or value budget. Shorten the run or use Continuous.', 'COORDINATED_RESULT_LIMIT');
    vectors = vectors.map(vector => ({ ...copy(vector), values: [...previous.vectors.find(old => old.name === vector.name).values.slice(0, -1), ...vector.values] }));
    const oldEvents = new Map((previous.digitalEvents ?? []).map(entry => [entry.name, entry]));
    if (oldEvents.size !== events.length) throw fail('The coordinated digital trace set changed.');
    events = events.map(entry => {
      const old = oldEvents.get(entry.name);
      if (!old) throw fail('A coordinated digital trace is missing.');
      const merged = old.events.filter(event => event.time < current.start).map(copy);
      for (const event of entry.events) if (!merged.length || merged.at(-1).value !== event.value) merged.push(copy(event));
      return { ...copy(entry), events: merged };
    });
  } else { vectors = copy(vectors); events = copy(events); }
  const eventCount = events.reduce((sum, entry) => sum + entry.events.length, 0), values = points * vectors.length;
  if (points > maxPoints || values > maxValues || eventCount > maxEvents || values + eventCount > maxTotal) throw fail('Combined coordinated results exceed the sample/event budget. Shorten the run or use Continuous.', 'COORDINATED_RESULT_LIMIT');
  return { ...copy(chunk), points, vectors, digitalEvents: events, startTime: start,
    sampling: { ...copy(chunk.sampling ?? {}), timeBounds: [start, current.end], analogSampleIndices: Array.from({ length: points }, (_, index) => index) },
    logs: [...new Set([...(previous?.logs ?? []), ...(chunk.logs ?? [])])].slice(-1000),
    warnings: [...new Set([...(previous?.warnings ?? []), ...(chunk.warnings ?? [])])] };
}
