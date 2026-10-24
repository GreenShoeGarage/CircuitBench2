import { CoordinatedEngine } from './coordinated-engine.js';
import { mergeCoordinatedChunks, validateCoordinatedResult } from './coordinated-results.js';

export const CONTINUOUS_LIMITS = Object.freeze({ points: 30000, values: 1000000, events: 250000, inputChanges: 2000, commandSteps: 2000, time: 9000 });
const fail = (message, code = 'CONTINUOUS_INVALID') => Object.assign(new Error(message), { code });
const copy = value => structuredClone(value);

/** Merge actual solver chunks and retain a bounded absolute-time window.
 * The first sparse event is a window-boundary value, never an invented edge.
 */
export function appendContinuousResult(previous, chunk, { maxPoints = CONTINUOUS_LIMITS.points, maxValues = CONTINUOUS_LIMITS.values, maxEvents = CONTINUOUS_LIMITS.events, windowDuration = Infinity, inputChanges = [] } = {}) {
  validateCoordinatedResult(chunk);
  if (!Number.isInteger(maxPoints) || maxPoints < 2 || !Number.isInteger(maxValues) || maxValues < chunk.vectors.length * 2 || !Number.isInteger(maxEvents) || maxEvents < 2 || !(windowDuration > 0)) throw fail('Continuous history bounds are invalid.');
  if (!Array.isArray(inputChanges) || inputChanges.length > CONTINUOUS_LIMITS.inputChanges) throw fail('Continuous input history exceeds its bound.');
  const merged = mergeCoordinatedChunks(previous, chunk, { maxPoints: 500000, maxValues: 4000000, maxEvents: 500000, maxTotal: 4500000 });
  let vectors = merged.vectors, events = merged.digitalEvents;
  const totalPoints = previous ? (previous.continuous?.totalPoints ?? previous.points) + chunk.points - 1 : chunk.points;
  const axis = vectors.find(vector => vector.name === 'time').values, end = axis.at(-1);
  const pointLimit = Math.min(maxPoints, Math.floor(maxValues / vectors.length));
  let first = Math.max(0, axis.length - pointLimit);
  while (first < axis.length - 1 && axis[first] < end - windowDuration) first++;
  // Sparse transitions are also bounded. Move the window boundary forward
  // rather than dropping individual edges inside a retained interval.
  const allEventTimes = events.flatMap(entry => entry.events.map(event => event.time)).sort((a, b) => a - b);
  if (allEventTimes.length + events.length > maxEvents) {
    const threshold = allEventTimes[Math.min(allEventTimes.length - 1, allEventTimes.length + events.length - maxEvents)];
    while (first < axis.length - 1 && axis[first] < threshold) first++;
  }
  const start = axis[first];
  vectors = vectors.map(vector => ({ ...vector, values: vector.values.slice(first) }));
  events = events.map(entry => {
    let state = entry.events[0]?.value;
    for (const event of entry.events) { if (event.time > start) break; state = event.value; }
    if (state === undefined) throw fail('A continuous digital trace has no boundary state.');
    return { ...entry, events: [{ time: start, value: state }, ...entry.events.filter(event => event.time > start)] };
  });
  if (events.reduce((sum, entry) => sum + entry.events.length, 0) > maxEvents) throw fail('Too many simultaneous digital traces for the continuous history budget.');
  return { ...merged, vectors, points: vectors.find(vector => vector.name === 'time').values.length, digitalEvents: events,
    sampling: { ...copy(chunk.sampling ?? {}), mode: 'continuous-window', analogSampleIndices: undefined,
      windowStart: start, windowEnd: end, timeBounds: [start, end], timeResolution: 1e-12,
      description: 'Stateful coordinated transient. Absolute simulation times; only the bounded recent window is retained. Its first digital value is a boundary state, not a new transition. Capacitor, inductor, clock and digital state continue across chunks and pauses.' },
    continuous: { formatVersion: 1, startedAtTime: 0, windowStart: start, currentTime: end, totalPoints, droppedPoints: totalPoints - vectors[0].values.length, inputChanges: copy(inputChanges), stateRetained: true },
    logs: [...new Set([...(previous?.logs ?? []), ...(chunk.logs ?? [])])].slice(-1000),
    warnings: [...new Set([...(previous?.warnings ?? []), ...(chunk.warnings ?? []), ...(start > 0 ? ['Earlier samples were removed from the bounded continuous history; all retained times are absolute.'] : [])])] };
}

/** Pausing preserves the worker and its complete numerical state. Stop disposes it. */
export class ContinuousSimulation {
  constructor({ engine = new CoordinatedEngine(), onUpdate = () => {}, onState = () => {}, intervalMs = 80 } = {}) {
    this.engine = engine; this.onUpdate = onUpdate; this.onState = onState; this.intervalMs = Number.isFinite(intervalMs) ? Math.max(20, intervalMs) : 80; this.state = 'stopped'; this.time = 0; this.result = null; this.generation = 0; this.inputChanges = [];
  }
  get running() { return ['starting', 'running', 'pausing', 'paused'].includes(this.state); }
  notify(state, error) { this.state = state; this.onState(state, error); }
  handleFailure(generation, error) { if (generation !== this.generation || this.state === 'failed') return; clearTimeout(this.timer); this.engine.close(); this.notify('failed', error); }
  async start(plan, { chunkDuration = plan.duration / 20, windowDuration = plan.duration, timeoutMs = 15000, autoRun = true } = {}) {
    if (this.running) throw fail('Stop the current continuous session first.');
    if (!(Number.isFinite(chunkDuration) && chunkDuration >= 1e-12 && Number.isFinite(windowDuration) && windowDuration >= chunkDuration)) throw fail('Choose a positive chunk duration and a history window at least that long.');
    const generation = ++this.generation;
    this.plan = copy(plan); this.chunkDuration = chunkDuration; this.windowDuration = windowDuration; this.time = 0; this.result = null; this.inputChanges = []; this.inputInFlight = null; this.inFlight = null; this.pauseIntent = 0; this.startPaused = !autoRun; this.notify('starting');
    try {
      if (generation !== this.generation || this.state !== 'starting') return;
      await this.engine.start(this.plan, { timeoutMs, onFailure: error => this.handleFailure(generation, error) });
      if (generation !== this.generation) return;
      this.notify(this.startPaused ? 'paused' : 'running');
      if (!this.startPaused) this.schedule();
    } catch (error) { this.handleFailure(generation, error); throw error; }
  }
  schedule() {
    clearTimeout(this.timer);
    if (this.state !== 'running') return;
    const generation = this.generation;
    this.timer = setTimeout(() => { if (generation === this.generation && this.state === 'running') this.advance().catch(() => {}); }, this.intervalMs);
  }
  async advance() {
    if (!['running', 'paused'].includes(this.state) || this.inFlight || this.inputInFlight) return;
    const generation = this.generation, next = Math.min(CONTINUOUS_LIMITS.time, Math.round((this.time + this.chunkDuration) / 1e-12) * 1e-12);
    if (next <= this.time) { await this.pause(); return; }
    const task = Promise.resolve().then(async () => {
      try {
        if (generation !== this.generation || !['running', 'paused', 'pausing'].includes(this.state)) return;
        const chunk = await this.engine.advanceTo(next, { maxSteps: CONTINUOUS_LIMITS.commandSteps });
        if (generation !== this.generation) return;
        const bounds = validateCoordinatedResult(chunk), end = bounds.end;
        if (bounds.start !== this.time || !(end > this.time) || end > next || chunk.done !== (end === next)) throw fail('The coordinated solver returned an inconsistent or nonadvancing chunk; the session was stopped.', 'CONTINUOUS_STALLED');
        this.result = appendContinuousResult(this.result, chunk, { windowDuration: this.windowDuration, inputChanges: this.inputChanges });
        this.time = end; this.onUpdate(this.result);
        if (this.state === 'pausing' || this.time >= CONTINUOUS_LIMITS.time) this.notify('paused');
      } catch (error) {
        this.handleFailure(generation, error);
        throw error;
      } finally {
        if (generation === this.generation) { this.inFlight = null; if (this.state === 'running') this.schedule(); }
      }
    });
    this.inFlight = task;
    return task;
  }
  async pause({ internal = false } = {}) {
    if (!internal) this.pauseIntent = (this.pauseIntent ?? 0) + 1;
    clearTimeout(this.timer);
    if (this.state === 'starting') this.startPaused = true;
    if (this.state === 'running') this.notify(this.inFlight ? 'pausing' : 'paused');
    if (this.inFlight) { try { await this.inFlight; } catch {} }
    if (this.state === 'pausing') this.notify('paused');
  }
  resume() { if (this.state !== 'paused') return; if (this.inputInFlight) throw fail('Wait for the live input change before resuming.'); if (this.time >= CONTINUOUS_LIMITS.time) throw fail('The safe continuous timeline is complete. Stop and start a new session.'); this.notify('running'); this.schedule(); }
  async step() { if (this.inputInFlight) throw fail('Wait for the live input change before stepping.'); if (this.state === 'running' || this.state === 'pausing') await this.pause(); if (this.state === 'paused') return this.advance(); }
  async setInputs(updates) {
    if (!this.running) throw fail('Start a continuous session before adjusting its inputs.');
    if (this.inputInFlight) throw fail('Wait for the current live input change to finish.');
    if (!Array.isArray(updates) || updates.length < 1 || updates.length > 64) throw fail('Choose 1–64 live input updates.');
    if (this.inputChanges.length >= CONTINUOUS_LIMITS.inputChanges) throw fail('This session has reached 2,000 recorded input changes. Stop and start a new session.');
    const resume = this.state === 'running', generation = this.generation, changes = copy(updates), pauseIntent = this.pauseIntent;
    const operation = { generation }; this.inputInFlight = operation;
    try {
      await this.pause({ internal: true });
      if (generation !== this.generation || this.state !== 'paused') throw fail('The continuous session ended before inputs could change.', 'CONTINUOUS_CANCELLED');
      const response = await this.engine.setInputs(changes);
      if (generation !== this.generation || this.state !== 'paused') throw fail('The continuous session ended before inputs could change.', 'CONTINUOUS_CANCELLED');
      this.inputChanges.push({ time: this.time, updates: changes });
      if (this.result) this.result.continuous.inputChanges = copy(this.inputChanges);
      return response;
    } catch (error) {
      this.handleFailure(generation, error);
      throw error;
    } finally {
      if (this.inputInFlight === operation) this.inputInFlight = null;
      if (generation === this.generation && this.state === 'paused' && resume && this.pauseIntent === pauseIntent) this.resume();
    }
  }
  stop() { clearTimeout(this.timer); ++this.generation; this.engine.stop(); this.inFlight = null; this.inputInFlight = null; if (this.state !== 'stopped') this.notify('stopped'); return this.result; }
}
