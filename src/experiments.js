/** Bounded, reproducible analog parameter studies. Original implementation, MIT. */
import { getPart, parseValue } from './library.js';
import { validateProject as defaultValidateProject, uid } from './model.js';
import { generateNetlist } from './netlist.js';

export const EXPERIMENT_METHOD = 'cb-analog-experiments-1';
export const EXPERIMENT_LIMITS = Object.freeze({ trials: 64, targets: 8, records: 6, selectedSamples: 250000, historySamples: 500000, recordBytes: 8 * 1024 * 1024, historyBytes: 16 * 1024 * 1024 });
export const EXPERIMENT_MEASUREMENTS = Object.freeze({ final: 'Final value', minimum: 'Minimum', maximum: 'Maximum', 'peak-to-peak': 'Peak to peak', rms: 'Time-weighted RMS', 'ac-magnitude': 'AC magnitude', 'ac-phase': 'AC phase' });
const SOURCE_KEYS = new Set(['dc', 'ac', 'phase', 'offset', 'amplitude', 'frequency', 'delay', 'low', 'high', 'rise', 'fall', 'width', 'period']);
const fail = (message, code = 'EXPERIMENT_INVALID') => Object.assign(new Error(message), { code });
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = (value, max = 200) => typeof value === 'string' && value.length <= max;
const clone = value => structuredClone(value);
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const check = (condition, message) => { if (!condition) throw fail(message); };
const identifier = value => text(value, 100) && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
const hashText = async value => globalThis.crypto?.subtle ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('') : 'unavailable-in-insecure-context';

export function experimentMeasurementKinds(analysisType) {
  if (analysisType === 'ac') return ['ac-magnitude', 'ac-phase'];
  if (analysisType === 'tran') return ['final', 'minimum', 'maximum', 'peak-to-peak', 'rms'];
  if (analysisType === 'dc') return ['final', 'minimum', 'maximum', 'peak-to-peak'];
  return ['final'];
}

/** Only documented numeric analog parameters can be varied; topology is fixed. */
export function experimentParameters(project) {
  if (project?.workspace !== 'schematic') return [];
  return project.circuit.components.flatMap(component => {
    const part = getPart(component.type);
    if (part.domain !== 'analog') return [];
    const fields = part.params.filter(parameter => !parameter.options && parameter.type !== 'text' &&
      (['R', 'C', 'L', 'NMOS', 'PMOS'].includes(component.type) || ['V', 'I'].includes(component.type) && SOURCE_KEYS.has(parameter.key)));
    return fields.flatMap(parameter => {
      let nominal;
      try { nominal = parseValue(component.params[parameter.key], parameter.unit); } catch { return []; }
      if (!finite(nominal)) return [];
      return [{ componentId: component.id, ref: component.ref, key: parameter.key, label: `${component.ref} · ${parameter.label}`, unit: parameter.unit, nominal }];
    });
  });
}

export function experimentChoices(project, generated = generateNetlist(project)) {
  const errors = generated.diagnostics?.filter(item => item.severity === 'error') ?? [];
  let reason = project.workspace !== 'schematic' ? 'Analog experiments vary component parameters in a schematic. Open a schematic example first.' : '';
  if (!reason && (generated.simulation || project.circuit.components.some(component => getPart(component.type).domain !== 'analog'))) reason = 'Parameter studies require an analog-only circuit. Digital and mixed circuits use their transient simulation controls.';
  if (!reason && errors.length) reason = errors.map(item => item.message).join(' ');
  const parameters = experimentParameters(project), seen = new Set();
  const signals = (generated.measurements ?? []).filter(item => ['V', 'A'].includes(item.unit) && !seen.has(item.id) && seen.add(item.id)).map(item => ({ id: item.id, label: item.label ?? item.vector ?? item.id, unit: item.unit, preferred: Boolean(item.selected) }));
  if (!reason && !parameters.length) reason = 'Add a component with an editable analog value, such as a resistor, capacitor, inductor or source.';
  if (!reason && !signals.length) reason = 'The circuit has no analog result to measure. Connect a circuit and add a voltage or current probe.';
  return { reason, parameters, signals, measurementKinds: experimentMeasurementKinds(project.analysis.type) };
}

export function normalizeExperimentSpec(project, input, generated = generateNetlist(project)) {
  const choices = experimentChoices(project, generated);
  check(!choices.reason, choices.reason);
  check(input && ['sweep', 'monte-carlo'].includes(input.kind), 'Choose a parameter sweep or a tolerance study.');
  const count = Number(input.count);
  check(Number.isInteger(count) && count >= (input.kind === 'sweep' ? 2 : 1) && count <= EXPERIMENT_LIMITS.trials, `Choose ${input.kind === 'sweep' ? '2' : '1'}–${EXPERIMENT_LIMITS.trials} trials.`);
  const parameter = value => {
    const found = choices.parameters.find(item => item.componentId === value?.componentId && item.key === value?.key);
    check(found, 'Choose a documented numeric analog component parameter.');
    return { componentId: found.componentId, ref: found.ref, key: found.key, unit: found.unit, nominal: found.nominal };
  };
  const spec = { kind: input.kind, count };
  if (input.kind === 'sweep') {
    const target = parameter(input.target), start = parseValue(input.start, target.unit), stop = parseValue(input.stop, target.unit);
    check(finite(start) && finite(stop) && start !== stop, 'Sweep start and stop must be different finite values.');
    check(['linear', 'log'].includes(input.spacing), 'Sweep spacing must be linear or logarithmic.');
    if (input.spacing === 'log') check(start > 0 && stop > 0, 'Logarithmic sweep endpoints must both be positive.');
    Object.assign(spec, { target, spacing: input.spacing, start, stop });
  } else {
    check(input.distribution === undefined || input.distribution === 'independent-uniform-relative', 'Only independent uniform relative tolerances are supported.');
    check(input.generator === undefined || input.generator === 'mulberry32', 'The supported deterministic generator is mulberry32.');
    check(Array.isArray(input.targets) && input.targets.length >= 1 && input.targets.length <= EXPERIMENT_LIMITS.targets, `Select 1–${EXPERIMENT_LIMITS.targets} tolerance parameters.`);
    const seen = new Set();
    spec.targets = input.targets.map(value => {
      const target = parameter(value), key = target.componentId + ':' + target.key, tolerance = Number(value.tolerance);
      check(!seen.has(key), 'A tolerance parameter may be selected only once.'); seen.add(key);
      check(finite(tolerance) && tolerance > 0 && tolerance < 100, 'Each relative tolerance must be greater than 0% and less than 100%.');
      check(target.nominal !== 0, `${target.ref} ${target.key} has a zero nominal value. Relative tolerance cannot vary zero; choose another parameter or use a sweep.`);
      return { ...target, tolerance };
    });
    const seed = Number(input.seed);
    check(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'The random seed must be an integer from 0 to 4294967295.');
    spec.seed = seed; spec.distribution = 'independent-uniform-relative'; spec.generator = 'mulberry32';
  }
  const measurement = input.measurement;
  check(measurement && choices.measurementKinds.includes(measurement.kind), 'Choose a measurement supported by this analysis.');
  check(choices.signals.some(item => item.id === measurement.signal), 'Choose an analog signal from this circuit.');
  spec.measurement = { signal: measurement.signal, kind: measurement.kind };
  if (project.analysis.type === 'ac') {
    const frequency = parseValue(measurement.frequency, 'Hz'), start = parseValue(project.analysis.start, 'Hz'), stop = parseValue(project.analysis.stop, 'Hz');
    check(finite(frequency) && frequency >= start && frequency <= stop, 'The measurement frequency must be within the AC analysis range.');
    spec.measurement.frequency = frequency;
  }
  if (project.analysis.type === 'tran' && measurement.window) {
    const start = parseValue(measurement.window.start, 's'), end = parseValue(measurement.window.end, 's'), duration = parseValue(project.analysis.duration, 's');
    check(finite(start) && finite(end) && start >= 0 && end > start && end <= duration, 'The measurement window must have 0 ≤ start < end ≤ transient duration.');
    spec.measurement.window = { start, end };
  }
  return spec;
}

/** Deterministic uniform samples in [0,1), with a documented generator. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => { state = (state + 0x6D2B79F5) >>> 0; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}

export function experimentTrials(project, input) {
  const spec = normalizeExperimentSpec(project, input), random = spec.kind === 'monte-carlo' ? mulberry32(spec.seed) : null;
  const trials = Array.from({ length: spec.count }, (_, index) => {
    const values = spec.kind === 'sweep' ? [index === 0 ? spec.start : index === spec.count - 1 ? spec.stop : spec.spacing === 'log' ? Math.exp(Math.log(spec.start) + index / (spec.count - 1) * (Math.log(spec.stop) - Math.log(spec.start))) : spec.start + (spec.stop - spec.start) * index / (spec.count - 1)] : spec.targets.map(target => target.nominal * (1 + (2 * random() - 1) * target.tolerance / 100));
    check(values.every(finite), 'The requested parameter range exceeds finite numerical values.');
    const targets = spec.kind === 'sweep' ? [spec.target] : spec.targets;
    return { index, parameters: targets.map((target, i) => ({ componentId: target.componentId, ref: target.ref, key: target.key, unit: target.unit, value: values[i], text: String(values[i]) })) };
  });
  if (spec.kind === 'sweep') check(new Set(trials.map(trial => trial.parameters[0].value)).size === spec.count, 'The sweep spacing is too small to distinguish all requested values.');
  return trials;
}

export function experimentTrialProject(project, trial) {
  const out = clone(project);
  for (const parameter of trial.parameters) {
    const component = out.circuit.components.find(item => item.id === parameter.componentId);
    check(component && Object.hasOwn(component.params, parameter.key), 'An experiment parameter no longer belongs to its captured project.');
    component.params[parameter.key] = parameter.text;
  }
  return out;
}

function findVector(vectors, name) {
  const normalize = value => String(value).toLowerCase().replace(/\s/g, '');
  const needle = normalize(name);
  return vectors.find(vector => normalize(vector.name) === needle) || vectors.find(vector => normalize(vector.name) === needle.replace(/^i\((.+)\)$/, '$1#branch')) || vectors.find(vector => normalize(vector.name) === needle.replace(/^v\((.+)\)$/, '$1'));
}

export function captureExperimentSource(run, selection) {
  check(['completed', 'completed-with-warnings'].includes(run?.status), 'The trial did not produce a completed simulation.');
  const vectors = run.result?.vectors, type = run.analysis?.type;
  check(Array.isArray(vectors) && vectors.length > 0, 'The trial returned no numerical vectors.');
  const definition = run.measurements?.find(item => item.id === selection.signal);
  check(definition && ['V', 'A'].includes(definition.unit), 'The selected analog measurement was not produced by the trial.');
  const axisVector = type === 'ac' ? vectors.find(item => item.name.toLowerCase() === 'frequency') : type === 'tran' ? vectors.find(item => item.name.toLowerCase() === 'time') : type === 'dc' ? vectors.find(item => /sweep/i.test(item.name)) : null;
  check(type === 'op' || axisVector, 'The trial result is missing its analysis axis.');
  const axis = type === 'op' ? [0] : axisVector.values;
  const zeros = () => ({ values: new Array(axis.length).fill(0), ...(type === 'ac' ? { imag: new Array(axis.length).fill(0) } : {}) });
  const vector = name => !name || name === '0' || name.toLowerCase() === 'v(0)' ? zeros() : findVector(vectors, name);
  let real, imag;
  if (definition.vector) {
    const found = vector(definition.vector); check(found, 'The selected analog vector is missing.');
    if (type === 'ac') check(Array.isArray(found.imag) && found.imag.length === axis.length, 'The selected AC vector is missing its complete imaginary samples.');
    real = found.values; imag = found.imag;
  } else {
    const a = vector(definition.a), b = vector(definition.b), divisor = definition.resistance ?? 1;
    check(a && b && finite(divisor) && divisor !== 0, 'The differential/current measurement has invalid inputs.');
    check(a.values.length === axis.length && b.values.length === axis.length, 'The selected measurement inputs have incomplete sample arrays.');
    if (type === 'ac') check(Array.isArray(a.imag) && Array.isArray(b.imag) && a.imag.length === axis.length && b.imag.length === axis.length, 'The AC measurement inputs are missing their complete imaginary samples.');
    real = a.values.map((value, index) => (value - b.values[index]) / divisor);
    if (type === 'ac') imag = a.values.map((_, index) => ((a.imag?.[index] ?? 0) - (b.imag?.[index] ?? 0)) / divisor);
  }
  const source = { analysis: type, signal: { id: definition.id, label: definition.label ?? definition.vector ?? definition.id, unit: definition.unit }, axis: { name: axisVector?.name ?? 'operating-point', unit: type === 'ac' ? 'Hz' : type === 'tran' ? 's' : type === 'dc' ? (String(run.analysis.source).startsWith('I') ? 'A' : 'V') : '', values: [...axis] }, real: [...real], ...(type === 'ac' ? { imag: imag ? [...imag] : new Array(axis.length).fill(0) } : {}), sampling: 'complete-selected-trial-samples' };
  validateSource(source);
  check(run.result.points === axis.length, 'The selected sample count disagrees with the trial result.');
  return source;
}

function validateSource(source) {
  check(source && ['op', 'dc', 'ac', 'tran'].includes(source.analysis) && source.sampling === 'complete-selected-trial-samples', 'Saved experiment sample metadata is invalid.');
  check(text(source.signal?.id) && source.signal.id && text(source.signal.label) && ['V', 'A'].includes(source.signal.unit), 'Saved experiment signal metadata is invalid.');
  const axis = source.axis?.values;
  check(Array.isArray(axis) && axis.length > 0 && axis.length <= EXPERIMENT_LIMITS.selectedSamples && axis.every(finite), 'Saved experiment axis is invalid or too large.');
  check(text(source.axis.name) && source.axis.unit === (source.analysis === 'ac' ? 'Hz' : source.analysis === 'tran' ? 's' : source.analysis === 'op' ? '' : source.axis.unit) && (source.analysis !== 'dc' || ['A', 'V'].includes(source.axis.unit)), 'Saved experiment axis metadata is invalid.');
  if (source.analysis === 'op') check(axis.length === 1 && axis[0] === 0, 'An operating-point experiment must retain one sample.');
  else if (source.analysis === 'dc') {
    const direction = Math.sign(axis.at(-1) - axis[0]);
    check(axis.length === 1 || direction && axis.every((value, index) => index === 0 || direction * (value - axis[index - 1]) > 0), 'A DC experiment axis must be strictly monotonic.');
  } else check(axis.every((value, index) => (source.analysis === 'ac' ? value > 0 : value >= 0) && (index === 0 || value > axis[index - 1])), 'Saved experiment times/frequencies must increase strictly.');
  check(Array.isArray(source.real) && source.real.length === axis.length && source.real.every(finite), 'Saved experiment values are incomplete or nonfinite.');
  check(source.analysis === 'ac' ? Array.isArray(source.imag) && source.imag.length === axis.length && source.imag.every(finite) : source.imag === undefined, 'Saved experiment complex values do not match the analysis.');
}

function interpolate(axis, values, value, logarithmic = false) {
  check(value >= axis[0] && value <= axis.at(-1), 'The requested measurement is outside the returned sample range.');
  let lo = 0, hi = axis.length - 1;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (axis[mid] < value) lo = mid + 1; else hi = mid; }
  if (axis[lo] === value) return { value: values[lo], indices: [lo], interpolated: false };
  const left = lo - 1, coordinate = x => logarithmic ? Math.log(x) : x;
  const fraction = (coordinate(value) - coordinate(axis[left])) / (coordinate(axis[lo]) - coordinate(axis[left]));
  return { value: values[left] + fraction * (values[lo] - values[left]), indices: [left, lo], interpolated: true };
}

/** Reproducible arithmetic over the saved samples, never over plot pixels. */
export function measureExperimentSource(source, measurement) {
  validateSource(source);
  check(measurement && measurement.signal === source.signal.id && experimentMeasurementKinds(source.analysis).includes(measurement.kind), 'The saved experiment measurement does not match its sample source.');
  const axis = source.axis.values, values = source.real, kind = measurement.kind;
  let value, details, unit = source.signal.unit;
  if (source.analysis === 'ac') {
    check(finite(measurement.frequency), 'An AC measurement needs a finite frequency.');
    const real = interpolate(axis, values, measurement.frequency, true), imaginary = interpolate(axis, source.imag, measurement.frequency, true);
    // JSON preserves numerical zero but not its sign. Use one phase convention
    // at the negative real axis so a saved -0 imaginary part cannot flip ±180°.
    if (real.value === 0) real.value = 0;
    if (imaginary.value === 0) imaginary.value = 0;
    if (kind === 'ac-phase') { check(real.value !== 0 || imaginary.value !== 0, 'Phase is undefined for a zero-magnitude response.'); value = Math.atan2(imaginary.value, real.value) * 180 / Math.PI; unit = '°'; }
    else value = Math.hypot(real.value, imaginary.value);
    details = { frequency: measurement.frequency, real: real.value, imaginary: imaginary.value, sampleIndices: real.indices, interpolation: real.interpolated ? 'linear-complex-versus-log-frequency' : 'exact-sample' };
  } else {
    let xs = axis, ys = values;
    if (source.analysis === 'tran') {
      const start = measurement.window?.start ?? axis[0], end = measurement.window?.end ?? axis.at(-1);
      check(finite(start) && finite(end) && start < end, 'Transient measurements require a nonzero observed interval.');
      const left = interpolate(axis, values, start), right = interpolate(axis, values, end);
      xs = [start]; ys = [left.value];
      for (let i = 0; i < axis.length; i++) if (axis[i] > start && axis[i] < end) { xs.push(axis[i]); ys.push(values[i]); }
      xs.push(end); ys.push(right.value);
      details = { start, end, pointsUsed: xs.length, boundaryInterpolation: left.interpolated || right.interpolated ? 'linear' : 'none', interpretation: kind === 'rms' ? 'Exact integral of the squared piecewise-linear sampled waveform, divided by observed time.' : 'Complete selected samples with linearly interpolated requested window endpoints.' };
    } else details = { pointsUsed: ys.length, interpretation: source.analysis === 'dc' ? 'Final means the final point in acquisition order, including a descending sweep.' : 'Single operating-point sample.' };
    if (kind === 'final') value = ys.at(-1);
    else if (kind === 'minimum') value = ys.reduce((a, b) => Math.min(a, b), Infinity);
    else if (kind === 'maximum') value = ys.reduce((a, b) => Math.max(a, b), -Infinity);
    else if (kind === 'peak-to-peak') value = ys.reduce((a, b) => Math.max(a, b), -Infinity) - ys.reduce((a, b) => Math.min(a, b), Infinity);
    else {
      let integral = 0;
      for (let i = 1; i < xs.length; i++) integral += (xs[i] - xs[i - 1]) * (ys[i - 1] * ys[i - 1] + ys[i - 1] * ys[i] + ys[i] * ys[i]) / 3;
      value = Math.sqrt(integral / (xs.at(-1) - xs[0]));
    }
  }
  check(finite(value), 'The selected measurement exceeded finite numerical range.');
  return { method: EXPERIMENT_METHOD, kind, signal: source.signal.id, value, unit, details };
}

export function experimentSummary(trials, requestedCount) {
  const measured = trials.filter(trial => trial.status === 'completed').map(trial => trial.measurement.value), failedCount = trials.filter(trial => trial.status === 'failed').length, cancelledCount = trials.filter(trial => trial.status === 'cancelled').length;
  let mean = null, standardDeviation = null;
  if (measured.length) {
    // Welford accumulation avoids unnecessary cancellation in tolerance studies.
    const scale = measured.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0) || 1;
    let m = 0, square = 0, n = 0;
    for (const value of measured) { const normalized = value / scale, delta = normalized - m; m += delta / ++n; square += delta * (normalized - m); }
    mean = m * scale; standardDeviation = Math.sqrt(Math.max(0, square / measured.length)) * scale;
  }
  return { requestedCount, attemptedCount: trials.length, measuredCount: measured.length, failedCount, cancelledCount, notRunCount: requestedCount - trials.length, minimum: measured.length ? measured.reduce((a, b) => Math.min(a, b), Infinity) : null, maximum: measured.length ? measured.reduce((a, b) => Math.max(a, b), -Infinity) : null, mean, standardDeviation, standardDeviationDefinition: 'population of completed trials only' };
}

function abortError() { return Object.assign(fail('Experiment cancelled. Completed trials are retained; unfinished trials have no numeric result.', 'EXPERIMENT_CANCELLED'), { status: 'cancelled' }); }
function withAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** runTrial must run a fresh isolated simulation and stop its worker on abort.
 * It returns the application's normal immutable completed run record.
 */
export async function runExperiment(project, input, { runTrial, signal, onProgress = () => {}, hash = hashText, id = uid('experiment'), createdAt = new Date().toISOString() } = {}) {
  check(typeof runTrial === 'function', 'An isolated trial runner is required.');
  const snapshot = defaultValidateProject(clone(project)), spec = normalizeExperimentSpec(snapshot, input), planned = experimentTrials(snapshot, spec);
  check(identifier(id) && text(createdAt, 80) && finite(Date.parse(createdAt)), 'Experiment identity or timestamp is invalid.');
  const record = { id, kind: 'analog-experiment', method: EXPERIMENT_METHOD, projectId: snapshot.id, revision: snapshot.revision, createdAt, startedAt: createdAt, completedAt: null, status: 'running', projectSnapshot: snapshot, spec, trials: [], summary: null, warnings: [] };
  // Reserve enough room for every later failure before accepting sample data.
  // UTF-8 error text can use three bytes per retained UTF-16 code unit.
  const failureReserve = new Array(planned.length + 1).fill(4096);
  for (let i = planned.length - 1; i >= 0; i--) failureReserve[i] = failureReserve[i + 1] + bytes({ ...planned[i], status: 'failed', startedAt: 'x'.repeat(80), completedAt: 'x'.repeat(80), error: '\u0800'.repeat(4000), code: '\u0800'.repeat(100) }) + 1;
  check(bytes(record) + failureReserve[0] <= EXPERIMENT_LIMITS.recordBytes, 'This circuit snapshot and its trial metadata exceed the 8 MiB study budget. Reduce the circuit or trial count before running.');
  let samples = 0;
  for (const trial of planned) {
    if (signal?.aborted) break;
    const trialProject = experimentTrialProject(snapshot, trial), startedAt = new Date().toISOString();
    let row;
    try {
      const run = await withAbort(Promise.resolve().then(() => { if (signal?.aborted) throw abortError(); return runTrial(clone(trialProject), { signal, index: trial.index }); }), signal);
      if (signal?.aborted) throw abortError();
      check(same(defaultValidateProject(run.projectSnapshot), trialProject), 'A trial returned results for a different circuit or parameter set.');
      check(same(run.analysis, trialProject.analysis), 'A trial returned results for different analysis settings.');
      check(text(run.netlist, 240000) && run.netlist.length > 0, 'A trial must retain its complete bounded simulation input.');
      const compiled = generateNetlist(trialProject);
      check(run.netlist === compiled.netlist, 'A trial input deck does not match its captured circuit and applied values.');
      const engine = clone(run.engine ?? run.result?.engine), warnings = clone(run.result?.warnings ?? []);
      check(identifier(run.id), 'A trial returned an invalid run identifier.');
      check(engine && typeof engine === 'object' && !Array.isArray(engine) && text(engine.name) && engine.name && text(engine.version) && engine.version && bytes(engine) <= 16000, 'A trial must retain a bounded engine name and version.');
      check(Array.isArray(warnings) && warnings.length <= 100 && warnings.every(value => text(value, 4000)), 'A trial returned malformed or excessive warning metadata.');
      const source = captureExperimentSource(run, spec.measurement), measurement = measureExperimentSource(source, spec.measurement);
      const definition = compiled.measurements.find(item => item.id === spec.measurement.signal);
      check(definition && source.signal.label === (definition.label ?? definition.vector ?? definition.id) && source.signal.unit === definition.unit, 'A trial signal does not match its captured circuit measurement.');
      check(samples + source.real.length <= EXPERIMENT_LIMITS.selectedSamples, `This experiment exceeds ${EXPERIMENT_LIMITS.selectedSamples.toLocaleString()} retained selected samples. Reduce trial count or analysis duration/resolution.`);
      const netlistHash = await hash(run.netlist);
      check(/^[a-f0-9]{64}$/.test(netlistHash) || netlistHash === 'unavailable-in-insecure-context', 'A trial input hash is invalid.');
      row = { ...trial, status: 'completed', startedAt, completedAt: new Date().toISOString(), sourceRunId: run.id, engine, netlist: run.netlist, netlistHash, warnings, source, measurement };
      check(bytes(row) <= EXPERIMENT_LIMITS.recordBytes && bytes({ ...record, trials: [...record.trials, row] }) + failureReserve[trial.index + 1] <= EXPERIMENT_LIMITS.recordBytes, 'The saved experiment exceeds its 8 MiB evidence budget, including space for later trial diagnostics. Reduce trial count or sample count.');
      samples += source.real.length;
    } catch (error) {
      const cancelled = signal?.aborted || error?.status === 'cancelled' || error?.code === 'EXPERIMENT_CANCELLED';
      row = { ...trial, status: cancelled ? 'cancelled' : 'failed', startedAt, completedAt: new Date().toISOString(), error: String(error?.message ?? error).slice(0, 4000), code: String(error?.code ?? 'EXPERIMENT_TRIAL_FAILED').slice(0, 100) };
    }
    record.trials.push(row);
    onProgress({ completed: record.trials.length, total: spec.count, trial: clone(row), summary: experimentSummary(record.trials, spec.count) });
    if (row.status === 'cancelled') break;
  }
  record.status = signal?.aborted || record.trials.some(trial => trial.status === 'cancelled') || record.trials.length < spec.count ? 'cancelled' : record.trials.some(trial => trial.status === 'failed') ? 'completed-with-errors' : 'completed';
  record.completedAt = new Date().toISOString(); record.summary = experimentSummary(record.trials, spec.count);
  if (record.summary.failedCount) record.warnings.push(`${record.summary.failedCount} failed trial(s) have no numeric measurement and are excluded from summary statistics.`);
  if (record.status === 'cancelled') record.warnings.push('Cancelled study: completed trials are retained. Unfinished and unstarted trials are excluded from summary statistics.');
  if (spec.kind === 'monte-carlo') record.warnings.push('Independent uniform relative tolerances are a user-selected model. This finite sample is not a manufacturing yield or worst-case guarantee.');
  return validateExperimentRecords([record], defaultValidateProject)[0];
}

export function validateExperimentRecords(records, validateProject = defaultValidateProject) {
  if (records === undefined) return [];
  check(Array.isArray(records) && records.length <= EXPERIMENT_LIMITS.records, `A backup may contain at most ${EXPERIMENT_LIMITS.records} analog experiment records.`);
  check(bytes(records) <= EXPERIMENT_LIMITS.historyBytes, 'Saved analog experiment history exceeds 16 MiB.');
  const ids = new Set(); let totalSamples = 0;
  return records.map(record => {
    check(record && identifier(record.id) && !ids.has(record.id) && record.kind === 'analog-experiment' && record.method === EXPERIMENT_METHOD, 'A saved analog experiment identity is malformed or duplicated.'); ids.add(record.id);
    check(['completed', 'completed-with-errors', 'cancelled'].includes(record.status) && bytes(record) <= EXPERIMENT_LIMITS.recordBytes, 'A saved analog experiment status or size is invalid.');
    const snapshot = validateProject(record.projectSnapshot);
    check(snapshot.id === record.projectId && snapshot.revision === record.revision, 'A saved analog experiment does not match its captured project.');
    for (const key of ['createdAt', 'startedAt', 'completedAt']) check(text(record[key], 80) && finite(Date.parse(record[key])), 'A saved analog experiment timestamp is invalid.');
    check(Date.parse(record.completedAt) >= Date.parse(record.startedAt), 'A saved analog experiment finishes before it starts.');
    const spec = normalizeExperimentSpec(snapshot, record.spec), expected = experimentTrials(snapshot, spec);
    check(same(spec, record.spec), 'A saved experiment specification changed or contains inconsistent parameter metadata.');
    check(Array.isArray(record.trials) && record.trials.length <= expected.length, 'Saved experiment trial count is invalid.');
    let samples = 0;
    for (let i = 0; i < record.trials.length; i++) {
      const trial = record.trials[i];
      check(trial && trial.index === i && same(trial.parameters, expected[i].parameters) && ['completed', 'failed', 'cancelled'].includes(trial.status), 'Saved experiment trials or applied parameter values are inconsistent.');
      check(text(trial.startedAt, 80) && finite(Date.parse(trial.startedAt)) && text(trial.completedAt, 80) && finite(Date.parse(trial.completedAt)) && Date.parse(trial.completedAt) >= Date.parse(trial.startedAt), 'A saved trial timestamp is invalid.');
      if (trial.status === 'completed') {
        check(identifier(trial.sourceRunId) && text(trial.netlist, 240000) && trial.netlist.length > 0 && (/^[a-f0-9]{64}$/.test(trial.netlistHash) || trial.netlistHash === 'unavailable-in-insecure-context'), 'Saved trial input identity is invalid.');
        check(trial.engine && typeof trial.engine === 'object' && !Array.isArray(trial.engine) && text(trial.engine.name) && trial.engine.name && text(trial.engine.version) && trial.engine.version && bytes(trial.engine) <= 16000, 'Saved trial engine metadata is invalid.');
        check(Array.isArray(trial.warnings) && trial.warnings.length <= 100 && trial.warnings.every(value => text(value, 4000)), 'Saved trial warnings are invalid.');
        check(trial.source?.analysis === snapshot.analysis.type, 'Saved trial samples belong to a different analysis.');
        const generated = generateNetlist(experimentTrialProject(snapshot, expected[i])), definition = generated.measurements.find(item => item.id === spec.measurement.signal);
        check(generated.netlist === trial.netlist, 'A saved trial input deck does not match its captured circuit and applied values.');
        check(definition && trial.source.signal.label === (definition.label ?? definition.vector ?? definition.id) && trial.source.signal.unit === definition.unit, 'Saved trial signal metadata disagrees with its captured circuit.');
        const result = measureExperimentSource(trial.source, spec.measurement);
        check(same(result, trial.measurement), 'A saved experiment measurement does not match its preserved samples.');
        samples += trial.source.real.length;
      } else check(trial.source === undefined && trial.measurement === undefined && text(trial.error, 4000) && text(trial.code, 100), 'An incomplete trial cannot contain numeric evidence.');
      if (trial.status === 'cancelled') check(i === record.trials.length - 1 && record.status === 'cancelled', 'A cancelled trial must be the final attempted trial.');
    }
    check(samples <= EXPERIMENT_LIMITS.selectedSamples, 'A saved experiment exceeds 250,000 retained samples.'); totalSamples += samples;
    check(totalSamples <= EXPERIMENT_LIMITS.historySamples, 'Saved experiment history exceeds 500,000 retained samples.');
    const summary = experimentSummary(record.trials, spec.count);
    check(record.summary && Object.keys(summary).every(key => record.summary[key] === summary[key]) && same(summary, record.summary), 'A saved experiment summary does not match its completed trial results.');
    if (record.status !== 'cancelled') check(record.trials.length === spec.count && !summary.cancelledCount && record.status === (summary.failedCount ? 'completed-with-errors' : 'completed'), 'A completed experiment has missing or inconsistent trial statuses.');
    check(Array.isArray(record.warnings) && record.warnings.length <= 100 && record.warnings.every(value => text(value, 4000)) && (record.importedFromBackup === undefined || typeof record.importedFromBackup === 'boolean'), 'Saved experiment provenance is malformed.');
    const out = clone(record); out.projectSnapshot = snapshot; return out;
  });
}

export function retainExperimentRecords(records, record) {
  const checked = validateExperimentRecords([record])[0], out = [...(records ?? []).filter(item => item.id !== checked.id), checked];
  let droppedCount = 0;
  const sampleCount = () => out.reduce((total, item) => total + item.trials.reduce((n, trial) => n + (trial.source?.real.length ?? 0), 0), 0);
  while (out.length > EXPERIMENT_LIMITS.records || bytes(out) > EXPERIMENT_LIMITS.historyBytes || sampleCount() > EXPERIMENT_LIMITS.historySamples) { check(out.length > 1, 'This experiment cannot fit in saved history.'); out.shift(); droppedCount++; }
  return { records: out, droppedCount };
}

export function experimentCSV(record) {
  const targets = record.spec.kind === 'sweep' ? [record.spec.target] : record.spec.targets, q = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const rows = [['Experiment', 'Project', 'Revision', 'Trial', 'Status', ...targets.map(target => `${target.ref}.${target.key} (${target.unit})`), 'Measurement', 'Signal', 'Value', 'Unit', 'Input SHA-256', 'Error'], ...record.trials.map(trial => [record.id, record.projectId, record.revision, trial.index + 1, trial.status, ...trial.parameters.map(parameter => parameter.value), record.spec.measurement.kind, record.spec.measurement.signal, trial.measurement?.value ?? '', trial.measurement?.unit ?? '', trial.netlistHash ?? '', trial.error ?? ''])];
  return rows.map(row => row.map(q).join(',')).join('\r\n');
}

export function experimentEvidenceJSON(record) { return JSON.stringify({ format: 'CircuitBench analog experiment evidence', formatVersion: 1, experiment: record }, null, 2); }
