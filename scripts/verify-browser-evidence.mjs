/** Validate downloaded browser exports with production import code and
 * independent arithmetic. This does not simulate a circuit or automate a UI.
 * Default: provisional, console-only; --finalize writes the hashed record once
 * all browser artifacts have been captured. No runtime source is modified. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { safeEnvelope } from '../src/storage.js';
import { validateProject, buildNets } from '../src/model.js';
import { parseValue } from '../src/library.js';
import { validateTimingRecords } from '../src/timing-evidence.js';
import { validateExperimentRecords } from '../src/experiments.js';
import { displayStatesForRun } from '../src/displays.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const final = process.argv.includes('--finalize');
if (process.argv.slice(2).some(arg => arg !== '--finalize')) throw new Error('Usage: node scripts/verify-browser-evidence.mjs [--finalize]');
const output = 'evidence/rc200-export-validation.json';
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const report = {
  format: 'CircuitBench browser export verification', formatVersion: 1,
  verifiedAt: new Date().toISOString(), hashesFinalized: final,
  scope: 'Production import validation of downloaded browser JSON, independent divider/RC arithmetic, exact sparse-event timing and preserved continuous input history. No circuit was resimulated; this record does not independently establish UI actions, HTML/PDF download, offline installation or physical-device accuracy.',
  reportedBrowserBuilds: { provenance: 'Build identities supplied by the browser-capture operator; they are not inferred from import validation.', earlier: { buildHash: '7de58c9b9e7b297b', artifacts: ['rc200-continuous-display.circuitbench.json', 'rc200-continuous-timing-evidence.json', 'rc200-closed-loop-oscillator.circuitbench.json'] }, final: { buildHash: '7f06ecaf7e7b40be', scope: 'Sampled feedback, divider studies/CSV, RC capacitance study and continuous RC exports after narrow converter-validation hardening.' } },
  artifacts: [], studies: [], timing: [], checks: []
};
function verify(name, condition, details = {}) {
  report.checks.push({ name, passed: Boolean(condition), details });
  if (!condition) throw new Error(name);
}
function attempt(name, callback) {
  try { return callback(); }
  catch (error) {
    if (!report.checks.some(check => !check.passed && check.name === error.message)) report.checks.push({ name, passed: false, details: { error: error.message } });
    return null;
  }
}
function vector(run, name) {
  const result = run.result?.vectors?.find(item => item.name === name);
  if (!result) throw new Error(`Missing vector ${name} in ${run.id}`);
  return result;
}
function finiteAnalog(run) {
  return run.result.vectors.filter(item => !['logic', 'bus'].includes(item.kind)).every(item => item.values.every(Number.isFinite) && (!item.imag || item.imag.every(Number.isFinite)));
}
function checkRecordedHash(label, recorded, content) {
  if (/^[a-f0-9]{64}$/.test(recorded ?? '')) verify(`${label}: recorded SHA-256 matches content`, sha(content) === recorded);
  else verify(`${label}: unavailable hash is explicit`, recorded === 'unavailable-in-insecure-context', { recorded });
}
function graph(project) {
  const mapping = buildNets(project).endpointToNet;
  return (component, pin) => mapping[`${component.id}:${pin}`];
}
function connects(node, part, a, b) {
  return node(part, '1') === a && node(part, '2') === b || node(part, '1') === b && node(part, '2') === a;
}
function simpleRC(project) {
  const parts = project.circuit.components, sources = parts.filter(part => part.type === 'V'), resistors = parts.filter(part => part.type === 'R'), capacitors = parts.filter(part => part.type === 'C');
  if (sources.length !== 1 || resistors.length !== 1 || capacitors.length !== 1 || parts.some(part => !['V', 'R', 'C', 'GND'].includes(part.type))) return null;
  const source = sources[0], resistor = resistors[0], capacitor = capacitors[0], node = graph(project);
  if (node(source, 'n') !== '0' || node(capacitor, '2') !== '0' || !connects(node, resistor, node(source, 'p'), node(capacitor, '1'))) return null;
  return { source, resistor, capacitor, signal: `v(${node(capacitor, '1')})`, tau: parseValue(resistor.params.value, 'Ω') * parseValue(capacitor.params.value, 'F') };
}
function rcResponse(circuit, frequency) {
  const amplitude = parseValue(circuit.source.params.ac, 'V'), phase = parseValue(circuit.source.params.phase) * Math.PI / 180;
  const real = amplitude * Math.cos(phase), imaginary = amplitude * Math.sin(phase);
  const x = 2 * Math.PI * frequency * circuit.tau, denominator = 1 + x * x;
  return { real: (real + imaginary * x) / denominator, imaginary: (imaginary - real * x) / denominator };
}
const loaded = new Map(), studies = new Map(), timings = new Map();
function collectStudy(record, file) {
  const previous = studies.get(record.id);
  if (previous) {
    verify(`${file}: duplicate study ${record.id} matches standalone/backup evidence`, same(record, previous.record));
    previous.files.push(file);
  } else studies.set(record.id, { record, files: [file] });
}
function collectTiming(record, file) {
  const previous = timings.get(record.id);
  if (previous) {
    verify(`${file}: duplicate timing record ${record.id} agrees`, same(record, previous.record));
    previous.files.push(file);
  } else timings.set(record.id, { record, files: [file] });
}
// This explicit capture inventory deliberately excludes browser-observation
// prose, screenshots and the generated validation record from import checks.
const names = ['rc200-continuous-display.circuitbench.json', 'rc200-continuous-timing-evidence.json', 'rc200-closed-loop-oscillator.circuitbench.json', 'rc200-sampled-feedback.circuitbench.json', 'rc200-divider-sweep-evidence.json', 'rc200-divider-tolerance-evidence.json', 'rc200-analog-studies.circuitbench.json', 'rc200-rc-capacitance-evidence.json', 'rc200-continuous-rc.circuitbench.json'].sort();
for (const name of names) {
  const file = `evidence/${name}`, bytes = await fs.readFile(path.join(root, file));
  let raw;
  try { raw = JSON.parse(bytes); }
  catch (error) { report.artifacts.push({ file, bytes: bytes.length, status: 'invalid-json', error: error.message }); report.checks.push({ name: `${file}: parses as JSON`, passed: false }); continue; }
  if (!['CircuitBench', 'CircuitBench timing evidence', 'CircuitBench analog experiment evidence'].includes(raw.format)) {
    report.artifacts.push({ file, status: 'outside-export-scope', format: raw.format ?? null });
    continue;
  }
  const artifact = { file, format: raw.format, bytes: bytes.length, ...(final ? { sha256: sha(bytes) } : {}) };
  report.artifacts.push(artifact);
  const checked = attempt(`${file}: production import validation`, () => {
    verify(`${file}: version-1 export wrapper`, raw.formatVersion === 1);
    let value;
    if (raw.format === 'CircuitBench') {
      value = safeEnvelope(raw, validateProject);
      value.analogExperiments.forEach(record => collectStudy(record, file));
      value.timingMeasurements.forEach(record => collectTiming(record, file));
      artifact.title = value.project.title;
      artifact.projectId = value.project.id;
      artifact.appVersion = raw.appVersion;
      artifact.runs = value.runs.map(run => ({ id: run.id, status: run.status, analysis: run.analysis.type, solver: run.analysis.solver, engine: run.engine?.name, points: run.result?.points ?? 0, vectorCount: run.result?.vectors?.length ?? 0, ...(run.result?.continuous ? { continuous: run.result.continuous } : {}) }));
      artifact.studyCount = value.analogExperiments.length;
      artifact.timingCount = value.timingMeasurements.length;
      for (const run of raw.runs) {
        checkRecordedHash(`${file}/${run.id}/netlist`, run.netlistHash, run.netlist);
        const plan = run.coordinatedPlan ?? run.simulation;
        if (plan && run.simulationHash) checkRecordedHash(`${file}/${run.id}/simulation`, run.simulationHash, JSON.stringify(plan));
      }
    } else if (raw.format === 'CircuitBench timing evidence') {
      value = validateTimingRecords([raw.measurement], validateProject)[0];
      collectTiming(value, file); artifact.id = value.id;
    } else {
      value = validateExperimentRecords([raw.experiment], validateProject)[0];
      collectStudy(value, file); artifact.id = value.id;
    }
    verify(`${file}: production import validation`, true);
    return value;
  });
  artifact.status = checked ? 'passed' : 'failed';
  if (checked) loaded.set(name, { raw, checked, artifact });
}

const required = names;
attempt('Required captured exports are present and valid', () => verify('Required captured exports are present and valid', required.every(file => loaded.has(file)), { required }));

// One direct voltage-divider equation per distinct captured trial. This is
// independent of the ngspice result, study metric and parameter generator.
for (const { record, files } of studies.values()) attempt(`${record.id}: independent study arithmetic`, () => {
  const project = record.projectSnapshot, node = graph(project), parts = project.circuit.components;
  const voltage = parts.filter(part => part.type === 'V'), resistors = parts.filter(part => part.type === 'R');
  const probe = project.probes.find(item => item.id === record.spec.measurement.signal);
  const out = probe && buildNets(project).endpointToNet[probe.a];
  if (project.analysis.type === 'ac' && simpleRC(project)) {
    const trials = record.trials.map(trial => {
      verify(`${record.id}/trial-${trial.index}: completed`, trial.status === 'completed');
      checkRecordedHash(`${record.id}/trial-${trial.index}/netlist`, trial.netlistHash, trial.netlist);
      const copy = structuredClone(project);
      for (const parameter of trial.parameters) copy.circuit.components.find(part => part.id === parameter.componentId).params[parameter.key] = String(parameter.value);
      const circuit = simpleRC(copy), frequency = trial.source.axis.values;
      verify(`${record.id}/trial-${trial.index}: measured output is the RC junction`, circuit.signal === `v(${out})` && probe.kind === 'voltage');
      let maximumTraceError = 0;
      for (let index = 0; index < frequency.length; index++) {
        const expected = rcResponse(circuit, frequency[index]);
        maximumTraceError = Math.max(maximumTraceError, Math.hypot(trial.source.real[index] - expected.real, trial.source.imag[index] - expected.imaginary));
      }
      verify(`${record.id}/trial-${trial.index}: every AC sample follows the independent RC transfer`, maximumTraceError <= 1e-9, { points: frequency.length, maximumTraceError, absoluteTolerance: 1e-9 });
      const requested = rcResponse(circuit, record.spec.measurement.frequency);
      const expected = record.spec.measurement.kind === 'ac-magnitude' ? Math.hypot(requested.real, requested.imaginary) : Math.atan2(requested.imaginary, requested.real) * 180 / Math.PI;
      const actual = trial.measurement.value, absoluteError = Math.abs(actual - expected);
      verify(`${record.id}/trial-${trial.index}: requested-frequency metric agrees with independent RC formula`, absoluteError <= 1e-9, { actual, expected, absoluteError, absoluteTolerance: 1e-9, metric: record.spec.measurement.kind });
      return { index: trial.index, capacitance: parseValue(circuit.capacitor.params.value, 'F'), timeConstant: circuit.tau, points: frequency.length, frequency: record.spec.measurement.frequency, actual, expected, absoluteError, maximumTraceError };
    });
    report.studies.push({ id: record.id, files, kind: record.spec.kind, trialCount: trials.length, formula: 'Vout(f) = Vin(f) / (1 + j·2πfRC)', absoluteTolerance: 1e-9, maximumAbsoluteError: Math.max(...trials.map(trial => trial.absoluteError)), maximumTraceError: Math.max(...trials.map(trial => trial.maximumTraceError)), summary: record.summary, trials });
    return;
  }
  if (project.analysis.type !== 'op' || voltage.length !== 1 || resistors.length !== 2 || parts.some(part => !['V', 'R', 'GND'].includes(part.type))) {
    report.studies.push({ id: record.id, files, kind: record.spec.kind, trialCount: record.trials.length, independentFormula: 'not a simple operating-point resistor divider' }); return;
  }
  const source = voltage[0], top = resistors.find(part => connects(node, part, node(source, 'p'), out)), bottom = resistors.find(part => connects(node, part, out, '0'));
  verify(`${record.id}: selected output is an unloaded grounded divider`, Boolean(top && bottom && top !== bottom && node(source, 'n') === '0' && probe.kind === 'voltage' && source.params.waveform === 'dc'));
  const applied = (part, key, unit, trial) => trial.parameters.find(parameter => parameter.componentId === part.id && parameter.key === key)?.value ?? parseValue(part.params[key], unit);
  const trials = record.trials.map(trial => {
    verify(`${record.id}/trial-${trial.index}: completed`, trial.status === 'completed');
    checkRecordedHash(`${record.id}/trial-${trial.index}/netlist`, trial.netlistHash, trial.netlist);
    const input = applied(source, 'dc', 'V', trial), upperResistance = applied(top, 'value', 'Ω', trial), lowerResistance = applied(bottom, 'value', 'Ω', trial);
    const expected = input * lowerResistance / (upperResistance + lowerResistance), actual = trial.measurement.value, absoluteError = Math.abs(actual - expected), absoluteTolerance = 1e-10;
    verify(`${record.id}/trial-${trial.index}: independent divider formula`, Number.isFinite(actual) && absoluteError <= absoluteTolerance, { actual, expected, absoluteError, absoluteTolerance });
    return { index: trial.index, inputVoltage: input, upperResistance, lowerResistance, actualVoltage: actual, expectedVoltage: expected, absoluteError };
  });
  report.studies.push({ id: record.id, files, kind: record.spec.kind, seed: record.spec.seed ?? null, trialCount: trials.length, formula: 'Vout = Vin × Rbottom / (Rtop + Rbottom)', absoluteTolerance: 1e-10, maximumAbsoluteError: Math.max(...trials.map(trial => trial.absoluteError)), summary: record.summary, trials });
});

for (const { record, files } of timings.values()) attempt(`${record.id}: independent timing arithmetic`, () => {
  const source = record.source.signals.find(signal => signal.name === record.spec.source.name);
  const [start, end] = record.source.timeBounds;
  const entry = { id: record.id, files, kind: record.spec.kind, timeBounds: [start, end], summary: record.result.summary, ...(record.sourceRun.continuous ? { continuous: record.sourceRun.continuous } : {}) };
  if (record.spec.kind === 'period' && record.spec.edge === 'rising' && source.kind === 'logic') {
    const edges = source.events.filter((event, index) => index > 0 && source.events[index - 1].value === '0' && event.value === '1' && event.time >= record.spec.window.start && event.time <= record.spec.window.end);
    const periods = edges.slice(1).map((edge, index) => (Math.round(edge.time / 1e-12) - Math.round(edges[index].time / 1e-12)) * 1e-12);
    const measured = record.result.rows.filter(row => row.status === 'measured');
    verify(`${record.id}: preserved direct edges reproduce every measured period`, measured.length === periods.length && measured.every((row, index) => row.start === edges[index].time && row.end === edges[index + 1].time && row.value === periods[index]));
    verify(`${record.id}: retained boundary state is not counted as an edge`, edges.every(event => event.time > start));
    entry.independentPeriods = periods; entry.risingEdges = edges.map(event => event.time);
  }
  report.timing.push(entry);
});

attempt('Continuous display and independent timing evidence', () => {
  const backup = loaded.get('rc200-continuous-display.circuitbench.json').checked;
  const timing = loaded.get('rc200-continuous-timing-evidence.json').checked;
  const run = backup.runs.find(item => item.id === timing.sourceRunId);
  verify('Continuous timing is independently valid without its source run', Boolean(timing && run && timing.sourceRun.continuous));
  validateTimingRecords([timing], validateProject, { runs: [run] });
  verify('Continuous timing matches its separately captured source run', true);
  verify('Earlier continuous backup predates timing creation and contains no fabricated timing record', backup.timingMeasurements.length === 0);
  verify('Independent timing preserves the complete continuous provenance and inputChanges', same(timing.sourceRun.continuous, run.result.continuous));
  const history = timing.sourceRun.continuous;
  verify('Continuous retained window is nonzero with earlier source changes preserved', history.windowStart > 0 && history.droppedPoints > 0 && history.inputChanges.length > 0 && history.inputChanges.some(change => change.time < history.windowStart));
  const count = vector(run, 'b(count)'), segments = vector(run, 'b(segments)');
  verify('Disabled counter remains 1011 throughout the exported window', count.values.every(word => word === '1011'));
  verify('Counter word 11 maps to the captured b segment pattern', segments.values.every(word => word === '01111100'));
  const displays = Object.values(displayStatesForRun(run.projectSnapshot, run));
  verify('Production display state helper reads the actual retained word', displays.length === 1 && displays[0].available && displays[0].word === '01111100' && displays[0].glyph === 'b');
  const continuousTiming = report.timing.find(item => item.id === timing.id);
  verify('All complete periods in the continuous window equal 1 ms', continuousTiming.independentPeriods.length === 14 && continuousTiming.independentPeriods.every(period => period === 0.001));
  report.continuousDisplay = { sourceRunId: run.id, points: run.result.points, timeBounds: timing.source.timeBounds, lastCount: count.values.at(-1), lastSegments: segments.values.at(-1), glyph: displays[0].glyph, inputChanges: history.inputChanges };
});

attempt('Sampled feedback exported values and display', () => {
  const envelope = loaded.get('rc200-sampled-feedback.circuitbench.json').checked, run = envelope.runs.at(-1);
  verify('Sampled feedback contains finite actual analog values', finiteAnalog(run));
  const code = vector(run, 'b(code)').values.at(-1), command = vector(run, 'b(command)').values.at(-1), voltage = vector(run, 'v(sense)').values.at(-1), drive = vector(run, 'v(drive)').values.at(-1);
  verify('Sampled feedback final code and command are known four-bit words', /^[01]{4}$/.test(code) && /^[01]{4}$/.test(command));
  verify('Sampled feedback final command is 15 minus captured ADC code', parseInt(command, 2) === 15 - parseInt(code, 2));
  const expectedDrive = 5 * parseInt(command, 2) / 15;
  verify('Sampled feedback final DAC voltage matches its settled command', Math.abs(drive - expectedDrive) <= 1e-12, { drive, expectedDrive });
  const displays = Object.values(displayStatesForRun(run.projectSnapshot, run));
  verify('Sampled feedback display retains code 7', code === '0111' && displays.length === 1 && displays[0].available && displays[0].glyph === '7' && displays[0].word === '00000111');
  report.sampledFeedback = { runId: run.id, points: run.result.points, finalTime: vector(run, 'time').values.at(-1), code, command, senseVoltage: voltage, dacVoltage: drive, segments: displays[0].word, glyph: displays[0].glyph };
});

attempt('Closed-loop oscillator exported result', () => {
  const envelope = loaded.get('rc200-closed-loop-oscillator.circuitbench.json').checked, run = envelope.runs.at(-1);
  verify('Closed-loop oscillator contains finite actual analog values', finiteAnalog(run));
  const timing = envelope.timingMeasurements.find(record => record.spec.kind === 'period');
  const measured = timing.result.rows.filter(row => row.status === 'measured');
  verify('Closed-loop oscillator has multiple complete recorded cycles', measured.length >= 5 && measured.every(row => row.value > 0));
  const r = run.projectSnapshot.circuit.components.find(part => part.type === 'R'), c = run.projectSnapshot.circuit.components.find(part => part.type === 'C');
  const tau = parseValue(r.params.value, 'Ω') * parseValue(c.params.value, 'F');
  const idealZeroDelayPeriod = 2 * tau * Math.log(3.5 / 1.5);
  report.oscillator = { runId: run.id, points: run.result.points, finalTime: vector(run, 'time').values.at(-1), measuredPeriods: measured.map(row => row.value), idealZeroDelayPeriod, differenceFromIdeal: measured[0].value - idealZeroDelayPeriod, modelDifference: 'Captured circuit includes 1 µs logic delay, 1 µs DAC edges and 5 µs maximum backward-Euler step. The zero-delay RC expression is context, not an exact expected numerical trace.' };
});

// Additional AC and live-RC browser backups are discovered automatically.
report.analogChecks = [];
for (const { checked: envelope, artifact } of loaded.values()) {
  if (!Array.isArray(envelope.runs)) continue;
  for (const run of envelope.runs) {
    const circuit = simpleRC(run.projectSnapshot);
    if (!circuit || !run.result) continue;
    if (run.analysis.type === 'ac') attempt(`${artifact.file}/${run.id}: independent RC frequency response`, () => {
      const frequency = vector(run, 'frequency').values, outputVector = vector(run, circuit.signal);
      let maximumAbsoluteError = 0;
      for (let index = 0; index < frequency.length; index++) {
        const expected = rcResponse(circuit, frequency[index]);
        maximumAbsoluteError = Math.max(maximumAbsoluteError, Math.hypot(outputVector.values[index] - expected.real, outputVector.imag[index] - expected.imaginary));
      }
      verify(`${artifact.file}/${run.id}: complex RC response matches every recorded frequency`, Number.isFinite(maximumAbsoluteError) && maximumAbsoluteError <= 1e-9, { points: frequency.length, maximumAbsoluteError, absoluteTolerance: 1e-9 });
      report.analogChecks.push({ file: artifact.file, runId: run.id, type: 'rc-ac', points: frequency.length, frequencyBounds: [frequency[0], frequency.at(-1)], timeConstant: circuit.tau, cutoffFrequency: 1 / (2 * Math.PI * circuit.tau), maximumAbsoluteError, absoluteTolerance: 1e-9 });
    });
    if (run.result.continuous && circuit.source.params.waveform === 'dc') attempt(`${artifact.file}/${run.id}: live RC retained state`, () => {
      const history = run.result.continuous, initialInput = parseValue(circuit.source.params.dc, 'V');
      const changes = history.inputChanges.flatMap(group => group.updates.filter(update => update.id === circuit.source.id).map(update => ({ time: group.time, value: update.value })));
      verify(`${artifact.file}/${run.id}: live DC changes are retained with finite analog samples`, changes.length > 0 && finiteAnalog(run));
      const initialVoltage = run.analysis.uic ? parseValue(circuit.capacitor.params.ic, 'V') : initialInput;
      const exact = time => { let t = 0, level = initialInput, voltage = initialVoltage; for (const change of changes) { if (change.time > time) break; voltage = level + (voltage - level) * Math.exp(-(change.time - t) / circuit.tau); t = change.time; level = change.value; } return level + (voltage - level) * Math.exp(-(time - t) / circuit.tau); };
      const time = vector(run, 'time').values, voltage = vector(run, circuit.signal).values;
      const totalExcitation = Math.abs(initialVoltage - initialInput) + changes.reduce((sum, change, index) => sum + Math.abs(change.value - (index ? changes[index - 1].value : initialInput)), 0);
      const absoluteTolerance = Math.max(1e-9, totalExcitation * Math.min(1, parseValue(run.analysis.step, 's') / circuit.tau));
      const maximumAbsoluteError = voltage.reduce((maximum, value, index) => Math.max(maximum, Math.abs(value - exact(time[index]))), 0);
      verify(`${artifact.file}/${run.id}: retained RC trajectory agrees with piecewise exponential state`, maximumAbsoluteError <= absoluteTolerance, { maximumAbsoluteError, absoluteTolerance, rationale: 'First-order step allowance: total excitation variation × maximum step / RC (capped at total variation).' });
      const ticks = time.map(value => Math.round(value / 1e-12));
      verify(`${artifact.file}/${run.id}: every retained source change has an accepted boundary`, changes.filter(change => change.time >= time[0]).every(change => ticks.includes(Math.round(change.time / 1e-12))));
      let level = initialInput, changeIndex = 0, prediction = time[0] === 0 ? initialVoltage : voltage[0];
      const predicted = [prediction];
      for (let index = 1; index < time.length; index++) {
        while (changeIndex < changes.length && Math.round(changes[changeIndex].time / 1e-12) <= ticks[index - 1]) level = changes[changeIndex++].value;
        const dt = (ticks[index] - ticks[index - 1]) * 1e-12;
        prediction = (circuit.tau * prediction + dt * level) / (circuit.tau + dt);
        predicted.push(prediction);
      }
      const backwardEulerMaximumError = voltage.reduce((maximum, value, index) => Math.max(maximum, Math.abs(value - predicted[index])), 0);
      verify(`${artifact.file}/${run.id}: every retained sample matches independent backward-Euler recurrence`, backwardEulerMaximumError <= 1e-10, { backwardEulerMaximumError, absoluteTolerance: 1e-10, recurrence: 'V[n] = (RC·V[n−1] + Δt·Vin[n−1]) / (RC + Δt); a live source change at the current endpoint affects the following step without changing capacitor voltage.' });
      const checkpoints = [];
      for (const change of changes) for (const multiples of [0, 1, 2]) {
        const tick = Math.round((change.time + multiples * circuit.tau) / 1e-12), index = ticks.indexOf(tick);
        if (index >= 0) checkpoints.push({ time: time[index], actualVoltage: voltage[index], backwardEulerVoltage: predicted[index], continuousTimeIdealVoltage: exact(time[index]) });
      }
      report.analogChecks.push({ file: artifact.file, runId: run.id, type: 'rc-live', points: time.length, timeBounds: [time[0], time.at(-1)], inputChanges: changes, finalVoltage: voltage.at(-1), analyticFinalVoltage: exact(time.at(-1)), maximumAbsoluteError, absoluteTolerance, backwardEulerMaximumError, backwardEulerTolerance: 1e-10, timeConstant: circuit.tau, checkpoints });
    });
  }
}

function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) { if (character === '"' && text[index + 1] === '"') { field += '"'; index++; } else if (character === '"') quoted = false; else field += character; }
    else if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n' || character === '\r') { if (character === '\r' && text[index + 1] === '\n') index++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += character;
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
{
  const file = 'evidence/rc200-divider-tolerance.csv', bytes = await fs.readFile(path.join(root, file));
  const artifact = { file, format: 'CircuitBench experiment CSV', bytes: bytes.length, ...(final ? { sha256: sha(bytes) } : {}) };
  report.artifacts.push(artifact);
  const validated = attempt(`${file}: independent CSV comparison`, () => {
    const [headings, ...rows] = parseCSV(bytes.toString('utf8')), record = loaded.get('rc200-divider-tolerance-evidence.json').checked;
    const expectedHeadings = ['Experiment', 'Project', 'Revision', 'Trial', 'Status', 'R1.value (Ω)', 'R2.value (Ω)', 'Measurement', 'Signal', 'Value', 'Unit', 'Input SHA-256', 'Error'];
    verify(`${file}: exact headings and completed row count`, same(headings, expectedHeadings) && rows.length === record.trials.length);
    rows.forEach((row, index) => {
      const trial = record.trials[index];
      verify(`${file}/row-${index + 1}: identities, applied values and numerical result agree with JSON`, row.length === headings.length && row[0] === record.id && row[1] === record.projectId && Number(row[2]) === record.revision && Number(row[3]) === index + 1 && row[4] === trial.status && Number(row[5]) === trial.parameters.find(parameter => parameter.ref === 'R1').value && Number(row[6]) === trial.parameters.find(parameter => parameter.ref === 'R2').value && row[7] === record.spec.measurement.kind && row[8] === record.spec.measurement.signal && Number(row[9]) === trial.measurement.value && row[10] === trial.measurement.unit && row[11] === trial.netlistHash && row[12] === '');
    });
    artifact.rows = rows.length; artifact.sourceStudyId = record.id; return true;
  });
  artifact.status = validated ? 'passed' : 'failed';
}

report.summary = { exportedArtifacts: report.artifacts.filter(artifact => artifact.status !== 'outside-export-scope').length, jsonExports: names.length, csvExports: 1, validatedArtifacts: report.artifacts.filter(artifact => artifact.status === 'passed').length, distinctStudies: report.studies.length, distinctTrials: report.studies.reduce((sum, study) => sum + study.trialCount, 0), timingRecords: report.timing.length, passedChecks: report.checks.filter(check => check.passed).length, failedChecks: report.checks.filter(check => !check.passed).length };
report.status = report.summary.failedChecks ? 'failed' : final ? 'passed' : 'passed-provisional';
if (final) {
  report.validators = {};
  const pending = ['src/storage.js', 'src/timing-evidence.js', 'src/experiments.js', 'src/displays.js'];
  while (pending.length) {
    const file = pending.pop(); if (report.validators[file]) continue;
    const source = await fs.readFile(path.join(root, file), 'utf8'); report.validators[file] = sha(source);
    for (const match of source.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)) pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));
  }
  report.verifier = { file: 'scripts/verify-browser-evidence.mjs', sha256: sha(await fs.readFile(fileURLToPath(import.meta.url))) };
  try { const manifest = JSON.parse(await fs.readFile(path.join(root, 'dist/release-manifest.json'), 'utf8')); report.localDistribution = { version: manifest.version, buildHash: manifest.buildHash, runtimeBase: manifest.runtimeBase }; } catch { /* An unbuilt source checkout still validates exports. */ }
  await fs.writeFile(path.join(root, output), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, summary: report.summary, studies: report.studies.map(({ trials, ...study }) => study), timing: report.timing.map(({ risingEdges, independentPeriods, ...timing }) => ({ ...timing, independentPeriodCount: independentPeriods?.length })), sampledFeedback: report.sampledFeedback, continuousDisplay: report.continuousDisplay, oscillator: report.oscillator, analogChecks: report.analogChecks, failures: report.checks.filter(check => !check.passed), ...(final ? { output } : { note: 'Provisional checks only; no validation file or final source/artifact hashes written. Run --finalize after all browser exports are complete.' }) }, null, 2));
if (report.summary.failedChecks) process.exitCode = 1;
