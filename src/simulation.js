import { CircuitEngine, ENGINE_INFO } from './engine.js';
import { DigitalEngine, DIGITAL_ENGINE_INFO } from './digital-engine.js';
import { DIGITAL_LIMITS, analogToDigitalEvents, digitalToPWL, visibleDigitalTraces } from './digital.js';
import { generateNetlist } from './netlist.js';
import { CoordinatedEngine } from './coordinated-engine.js';
import { compileCoordinated } from './coordinated.js';

export const WORKBENCH_ENGINE_INFO = Object.freeze({ name: 'CircuitBench analog and event simulation',
  version: '1', analog: ENGINE_INFO, digital: DIGITAL_ENGINE_INFO,
  package: 'CircuitBench feed-forward coordinator', packageVersion: '1', build: 'cb-feedforward-1',
  execution: 'JavaScript events + ngspice WebAssembly · disposable workers · feed-forward replay',
  coupling: 'Feed-forward replay with explicit ADC/DAC boundaries; analog paths from a DAC output to any ADC input are rejected.' });
const fail = (message, code = 'SIMULATION_INVALID', status = 'failed') => Object.assign(new Error(message), { status, code, phase: 'workbench-simulation' });
const axisOf = result => result?.vectors?.find(vector => vector.name === 'time');

/** Preserve every original analog time/value. Only newly inserted event times
 * use linear interpolation. Logic takes the settled state at that timestamp.
 */
export function mergeEventResults(analog, digital) {
  const traces = visibleDigitalTraces(digital);
  const original = analog ? axisOf(analog)?.values : [];
  if (analog && (!Array.isArray(original) || !original.length || original[0] !== 0)) throw fail('Mixed simulation requires a native analog sample at time zero. Disable UIC and rerun.', 'MIXED_INITIAL_SAMPLE');
  if (original.some((time, i) => !Number.isFinite(time) || time < 0 || i && time <= original[i - 1])) throw fail('Analog sample times must be finite and strictly increasing.', 'MIXED_TIME_AXIS');
  const end = analog ? original.at(-1) : digital.duration;
  const unique = new Set([0, end, ...original]);
  for (const trace of traces) for (const event of trace.events) if (event.time <= end) unique.add(event.time);
  const times = [...unique].sort((a, b) => a - b), analogVectors = analog?.vectors.filter(vector => vector.name !== 'time') || [];
  const vectorCount = 1 + analogVectors.length + traces.length;
  if (times.length > DIGITAL_LIMITS.points || vectorCount > 256 || times.length * vectorCount > DIGITAL_LIMITS.samples) throw fail('Combined analog/digital result exceeds 250,000 rows, 256 vectors, or 2 million values. Shorten the run, slow the clock, or reduce saved signals.', 'SIMULATION_SAMPLE_LIMIT');
  const index = new Map(times.map((time, i) => [time, i])), originalIndex = new Map(original.map((time, i) => [time, i]));
  const vectors = [{ name: 'time', unit: 's', values: times }];
  for (const vector of analogVectors) {
    if (vector.values.length !== original.length || vector.imag) throw fail('Mixed replay requires complete real transient vectors.', 'MIXED_VECTOR_FORMAT');
    let right = 1;
    const values = times.map(time => {
      if (originalIndex.has(time)) return vector.values[originalIndex.get(time)];
      while (right < original.length - 1 && original[right] < time) right++;
      const left = right - 1, fraction = (time - original[left]) / (original[right] - original[left]);
      return vector.values[left] + fraction * (vector.values[right] - vector.values[left]);
    });
    if (values.some(value => !Number.isFinite(value))) throw fail('Mixed replay produced an invalid interpolated analog sample.', 'MIXED_VECTOR_FORMAT');
    vectors.push({ ...vector, values });
  }
  for (const trace of traces) {
    let current = 0;
    vectors.push({ name: trace.name, unit: 'logic', kind: trace.kind === 'bus' ? 'bus' : 'logic', ...(trace.kind === 'bus' ? { width: trace.width, bitOrder: 'msb-first' } : {}), values: times.map(time => { while (current + 1 < trace.events.length && trace.events[current + 1].time <= time) current++; return trace.events[current].value; }) });
  }
  return { points: times.length, vectors, digitalEvents: traces.map(trace => ({ name: trace.name, ...(trace.kind === 'bus' ? { kind: 'bus', width: trace.width, bitOrder: 'msb-first' } : {}), events: trace.events.filter(event => event.time <= end) })),
    sampling: { mode: analog ? 'event-union' : 'digital-events', analogSampleIndices: original.map(time => index.get(time)),
      analogInterpolation: analog ? 'linear' : 'none', logicContinuity: 'right', timeResolution: DIGITAL_ENGINE_INFO.timeResolution,
      description: analog ? 'All original ngspice sample times and values are preserved. Analog values at additional digital event times are linearly interpolated; logic states are right-continuous after simultaneous events settle.' : 'Change-only digital events plus time zero and run end; logic states are right-continuous after simultaneous events settle. Gate delays use 1 ps transport timing.' } };
}

function adcSources(result, adcs) {
  const times = axisOf(result)?.values;
  if (!times?.length || times[0] !== 0) throw fail('ADC replay requires an analog sample at time zero. Disable UIC and rerun.', 'MIXED_INITIAL_SAMPLE');
  const vector = name => {
    if (name === '0') return null;
    const found = result.vectors.find(v => v.name === name);
    if (!found || found.unit !== 'V' || found.values.length !== times.length) throw fail(`ADC measurement ${name} is missing from the analog results.`, 'ADC_VECTOR_MISSING');
    return found.values;
  };
  return adcs.map(adc => {
    const input = vector(adc.inputVector), reference = vector(adc.referenceVector || '0');
    const values = times.map((_, i) => (input?.[i] ?? 0) - (reference?.[i] ?? 0));
    return { id: adc.id, output: adc.output, kind: 'events', events: analogToDigitalEvents(times, values, adc.low, adc.high, { mode: adc.mode || 'threshold' }) };
  });
}

/** One Run action, with one global watchdog across every replay stage.
 * Analog-only requests delegate to the existing facade without changing it.
 * Mixed mode is deliberately feed-forward: compiler topology checks reject
 * DAC->ADC analog influence (common reference ground alone is not influence).
 * If both bridges exist: held-DAC analog input pass -> ADC -> event logic ->
 * known-state finite-edge DAC PWL -> final analog pass. This is not XSPICE or
 * lockstep analog/digital feedback simulation.
 */
export class WorkbenchEngine {
  constructor({ analogEngine = new CircuitEngine(), digitalEngine = new DigitalEngine(), coordinatedEngine = new CoordinatedEngine(), netlistGenerator = generateNetlist } = {}) {
    this.analog = analogEngine; this.digital = digitalEngine; this.coordinated = coordinatedEngine; this.generate = netlistGenerator; this.active = null;
  }
  get running() { return Boolean(this.active || this.analog.running || this.digital.running || this.coordinated.running); }
  stop() {
    if (this.active) { this.active.finish(fail('Cancelled. Active simulation workers and the remaining replay stages were terminated.', 'SIMULATION_CANCELLED', 'cancelled')); return true; }
    return this.analog.stop() || this.digital.stop() || this.coordinated.stop();
  }
  runTruthTable(generated, { inputIds, outputNames, timeoutMs = 15000, onLog = () => {} } = {}) {
    if (this.running) return Promise.reject(fail('A simulation is already running. Stop it before starting another.'));
    const errors = generated?.diagnostics?.filter(item => item.severity === 'error') || [];
    if (errors.length) return Promise.reject(fail(errors.map(item => item.message).join(' · '), 'SIMULATION_PREFLIGHT'));
    const plan = generated?.simulation;
    if (!plan || plan.mode !== 'digital' || plan.adcs?.length || plan.dacs?.length) return Promise.reject(fail('Truth tables require a pure combinational digital circuit without analog components or ADC/DAC bridges.', 'TRUTH_TABLE_UNSUPPORTED'));
    return this.digital.runTruthTable(plan.digital, { inputIds, outputNames, timeoutMs, onLog });
  }
  run(netlist, { project, generated, timeoutMs = 15000, onLog = () => {} } = {}) {
    if (this.running) return Promise.reject(fail('A simulation is already running. Stop it before starting another.'));
    const diagnostics = generated?.diagnostics?.filter(item => item.severity === 'error') || [];
    if (diagnostics.length) return Promise.reject(fail(diagnostics.map(item => item.message).join(' · '), 'SIMULATION_PREFLIGHT'));
    if (project?.analysis?.solver === 'coordinated') {
      try { return this.coordinated.run(compileCoordinated(project, generated), { timeoutMs, onLog }); }
      catch (error) { return Promise.reject(error); }
    }
    const plan = generated?.simulation;
    if (!plan) return this.analog.run(netlist, { timeoutMs, onLog });
    if (!['digital', 'mixed'].includes(plan.mode)) return Promise.reject(fail('Unsupported compiled simulation mode.'));
    if (!(Number.isFinite(plan.duration) && plan.duration > 0)) return Promise.reject(fail('A positive transient duration is required for event simulation.'));
    if (plan.mode === 'mixed' && !project) return Promise.reject(fail('Mixed replay requires its immutable project snapshot.'));
    const logs = [], analogNetlists = [], warnings = [], started = performance.now(), deadline = started + Math.max(100, Math.min(60000, Number(timeoutMs) || 15000));
    return new Promise((resolve, reject) => {
      const job = { timer: null, finish: null };
      job.finish = (error, result) => {
        if (this.active !== job) return;
        this.active = null; clearTimeout(job.timer); this.analog.stop(); this.digital.stop();
        if (error) { error.logs = [...logs, ...(error.logs || [])]; reject(error); } else resolve(result);
      };
      this.active = job;
      job.timer = setTimeout(() => job.finish(fail('Simulation exceeded its total time limit. Active workers and remaining replay stages were terminated.', 'SIMULATION_TIMEOUT', 'timed-out')), Math.max(1, deadline - performance.now()));
      const ensureActive = () => { if (this.active !== job) throw fail('Simulation was cancelled before its next stage.', 'SIMULATION_CANCELLED', 'cancelled'); };
      const announce = text => { logs.push(text); onLog(text); };
      const stageOptions = stage => ({ timeoutMs: Math.max(1, deadline - performance.now()), onLog: text => { ensureActive(); onLog(`${stage}: ${text}`); } });
      const analogRun = async (deck, stage) => {
        ensureActive(); if (typeof deck !== 'string' || deck.length > 256000) throw fail('An analog replay deck exceeds the 256 kB limit.', 'SIMULATION_DECK_LIMIT');
        analogNetlists.push(deck); announce(stage); ensureActive();
        const result = await this.analog.run(deck, stageOptions(stage)); ensureActive();
        logs.push(...result.logs); warnings.push(...(result.warnings || [])); return result;
      };
      const compile = waveforms => {
        const output = this.generate(project, { dacWaveforms: waveforms });
        const errors = output.diagnostics?.filter(item => item.severity === 'error') || [];
        if (errors.length) throw fail(errors.map(item => item.message).join(' · '), 'SIMULATION_PREFLIGHT');
        return output.netlist;
      };
      (async () => {
        const adcs = plan.adcs || [], dacs = plan.dacs || []; let inputAnalog = null, analog = null;
        if (plan.mode === 'mixed' && adcs.length) {
          const held = Object.fromEntries(dacs.map(dac => [dac.id, [[0, dac.initial ?? dac.low], [plan.duration, dac.initial ?? dac.low]]]));
          inputAnalog = await analogRun(compile(held), 'Analog input pass');
        }
        const sources = inputAnalog ? adcSources(inputAnalog, adcs) : [];
        ensureActive(); announce('Digital event pass'); ensureActive();
        const digital = await this.digital.run({ ...plan.digital, duration: plan.duration }, { ...stageOptions('Digital event pass'), sources });
        ensureActive(); logs.push(...digital.logs); warnings.push(...(digital.warnings || []));
        if (plan.mode === 'mixed') {
          if (dacs.length) {
            const waveforms = {};
            for (const dac of dacs) {
              const trace = digital.traces.find(trace => trace.node === dac.input);
              if (!trace) throw fail(`${dac.id}: DAC input has no digital trace.`, 'DAC_INPUT_MISSING');
              try { waveforms[dac.id] = digitalToPWL(trace.events, dac, plan.duration); }
              catch (error) { error.message = `${dac.id}: ${error.message}`; throw error; }
            }
            analog = await analogRun(compile(waveforms), 'Analog output pass');
          } else analog = inputAnalog || await analogRun(netlist, 'Analog pass');
          warnings.push('Mixed simulation uses feed-forward replay; analog-to-digital feedback paths are unsupported.');
          if (adcs.length) warnings.push('ADC crossing times are interpolated from saved analog samples and rounded to 1 ps. Reduce the transient maximum step to resolve faster analog activity.');
        }
        ensureActive(); const merged = mergeEventResults(analog, digital);
        const engine = analog ? { ...WORKBENCH_ENGINE_INFO, name: 'ngspice + CircuitBench event logic', mode: 'mixed', analog: analog.engine || ENGINE_INFO, digital: DIGITAL_ENGINE_INFO } : { ...DIGITAL_ENGINE_INFO, mode: 'digital', digital: DIGITAL_ENGINE_INFO };
        job.finish(null, { ...merged, logs, warnings: [...new Set(warnings)], engine, durationMs: performance.now() - started,
          analogNetlists, ...(analog ? { analogPoints: analog.points } : {}), bridgeAssumptions: plan.mode === 'mixed' ? [
            'ADC observes differential voltage without loading its input; threshold mode has an X band, Schmitt mode retains its known state inside that band.',
            'ADC timing is reconstructed from saved analog samples; it does not create analog solver breakpoints.',
            'DAC maps only known 0/1 to explicit voltages with finite piecewise-linear edges; it has no high-impedance or unknown-voltage model.',
            'The topology checker rejects analog DAC-to-ADC dependency paths; replay does not solve analog/digital feedback.'
          ] : [] });
      })().catch(error => { if (!error.status) error.status = 'failed'; job.finish(error); });
    });
  }
}
