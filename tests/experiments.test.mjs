import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, addComponent, uid, validateProject } from '../src/model.js';
import { generateNetlist } from '../src/netlist.js';
import { experimentChoices, experimentParameters, normalizeExperimentSpec, experimentTrials, experimentTrialProject, measureExperimentSource, captureExperimentSource, runExperiment, validateExperimentRecords, retainExperimentRecords, experimentCSV, experimentEvidenceJSON, experimentSummary, EXPERIMENT_LIMITS } from '../src/experiments.js';

function divider(type = 'op') {
  const p = newProject('Analog experiment fixture'), v = addComponent(p, 'V'), r1 = addComponent(p, 'R'), r2 = addComponent(p, 'R'), g = addComponent(p, 'GND');
  v.params.dc = '10'; r1.params.value = r2.params.value = '1k';
  const wire = (a, b) => { const id = uid('w'); p.circuit.connections.push({ id, a, b }); p.layout.wires[id] = { points: [] }; };
  wire(v.id + ':p', r1.id + ':1'); wire(r1.id + ':2', r2.id + ':1'); wire(r2.id + ':2', g.id + ':0'); wire(v.id + ':n', g.id + ':0');
  p.circuit.labels.push({ id: uid('label'), name: 'out', target: r2.id + ':1' }); p.analysis.type = type;
  return p;
}
const resistor = p => p.circuit.components.find(c => c.type === 'R');
const spec = p => ({ kind: 'sweep', target: { componentId: resistor(p).id, key: 'value' }, spacing: 'linear', start: '1k', stop: '3k', count: 3, measurement: { signal: 'node:out', kind: 'final' } });
function source(type, xs, values, imag) {
  return { analysis: type, signal: { id: 'node:out', label: 'V(out)', unit: 'V' }, axis: { name: type === 'tran' ? 'time' : type === 'ac' ? 'frequency' : type === 'dc' ? 'v-sweep' : 'operating-point', unit: type === 'tran' ? 's' : type === 'ac' ? 'Hz' : type === 'dc' ? 'V' : '', values: xs }, real: values, ...(imag ? { imag } : {}), sampling: 'complete-selected-trial-samples' };
}
function fakeRun(p, value = 5) {
  const generated = generateNetlist(p);
  return { id: uid('run'), projectSnapshot: structuredClone(p), projectId: p.id, revision: p.revision, status: 'completed', analysis: structuredClone(p.analysis), netlist: generated.netlist, measurements: generated.measurements, engine: { name: 'Analytic fixture, not a circuit engine', version: '1' }, result: { points: 1, vectors: [{ name: 'v(out)', unit: 'V', values: [value] }], warnings: [] } };
}
const analyticRunner = async p => { const resistors = p.circuit.components.filter(c => c.type === 'R'); return fakeRun(p, 10 * Number(resistors[1].params.value.replace('k', '000')) / (Number(resistors[0].params.value) + Number(resistors[1].params.value.replace('k', '000')))); };
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('choices expose numeric analog parameters and probes without a previous run', () => {
  const p = divider(), choices = experimentChoices(p);
  assert.equal(choices.reason, ''); assert.ok(choices.parameters.some(item => item.key === 'value' && item.unit === 'Ω'));
  assert.ok(choices.signals.some(item => item.id === 'node:out')); assert.deepEqual(choices.measurementKinds, ['final']);
  assert.ok(!experimentParameters(p).some(item => item.key === 'waveform' || item.key === 'pwl'));
});

test('netlist workspaces and digital studies are explicitly rejected', () => {
  const p = divider(); p.workspace = 'netlist'; assert.match(experimentChoices(p).reason, /schematic/);
  p.workspace = 'schematic'; addComponent(p, 'DIN'); assert.match(experimentChoices(p).reason, /analog-only/);
});

test('linear sweep includes exact endpoints and never changes the base project', () => {
  const p = divider(), before = JSON.stringify(p), trials = experimentTrials(p, spec(p));
  assert.deepEqual(trials.map(trial => trial.parameters[0].value), [1000, 2000, 3000]);
  const trial = experimentTrialProject(p, trials[1]); assert.equal(resistor(trial).params.value, '2000');
  assert.equal(JSON.stringify(p), before); assert.equal(trial.revision, p.revision);
});

test('descending and logarithmic sweeps preserve requested order', () => {
  const p = divider(); assert.deepEqual(experimentTrials(p, { ...spec(p), start: '3k', stop: '1k' }).map(t => t.parameters[0].value), [3000, 2000, 1000]);
  const values = experimentTrials(p, { ...spec(p), spacing: 'log', start: '100', stop: '10k' }).map(t => t.parameters[0].value);
  close(values[0], 100); close(values[1], 1000, 1e-9); close(values[2], 10000);
  assert.throws(() => experimentTrials(p, { ...spec(p), spacing: 'log', start: '-1' }), /positive/);
});

test('spec validation rejects invalid counts, keys, signals, and incompatible metrics', () => {
  const p = divider();
  for (const change of [{ count: 1 }, { count: 65 }, { count: 2.5 }, { target: { componentId: resistor(p).id, key: 'constructor' } }, { start: 'NaN' }, { start: '1k', stop: '1k' }, { spacing: 'invented' }, { measurement: { signal: 'missing', kind: 'final' } }, { measurement: { signal: 'node:out', kind: 'rms' } }]) assert.throws(() => normalizeExperimentSpec(p, { ...spec(p), ...change }));
});

test('Monte Carlo draws are reproducible, independent, bounded and seed sensitive', () => {
  const p = divider(), rs = p.circuit.components.filter(c => c.type === 'R');
  const mc = { kind: 'monte-carlo', count: 8, seed: 12345, targets: rs.map(c => ({ componentId: c.id, key: 'value', tolerance: 5 })), measurement: spec(p).measurement };
  const one = experimentTrials(p, mc), two = experimentTrials(p, mc);
  assert.deepEqual(one, two); assert.notDeepEqual(one, experimentTrials(p, { ...mc, seed: 12346 }));
  assert.ok(one.every(t => t.parameters.every(item => item.value >= 950 && item.value < 1050)));
  assert.ok(one.some(t => t.parameters[0].value !== t.parameters[1].value));
  close(one[0].parameters[0].value, 1047.9728267760947, 1e-10);
});

test('relative tolerances reject zero nominal, duplicates and unsupported distributions', () => {
  const p = divider(), target = spec(p).target, mc = { kind: 'monte-carlo', count: 2, seed: 0, targets: [{ ...target, tolerance: 5 }], measurement: spec(p).measurement };
  for (const tolerance of [0, 100, -1, NaN]) assert.throws(() => normalizeExperimentSpec(p, { ...mc, targets: [{ ...target, tolerance }] }));
  assert.throws(() => normalizeExperimentSpec(p, { ...mc, targets: [...mc.targets, ...mc.targets] }), /once/);
  assert.throws(() => normalizeExperimentSpec(p, { ...mc, seed: -1 }), /seed/);
  assert.throws(() => normalizeExperimentSpec(p, { ...mc, distribution: 'gaussian' }), /uniform/);
  const voltage = p.circuit.components.find(c => c.type === 'V');
  assert.throws(() => normalizeExperimentSpec(p, { ...mc, targets: [{ componentId: voltage.id, key: 'offset', tolerance: 5 }] }), /zero nominal/);
});

test('transient RMS uses elapsed time and exact piecewise-linear squared integration', () => {
  const a = source('tran', [0, .1, 1], [0, .1, 1]);
  close(measureExperimentSource(a, { signal: 'node:out', kind: 'rms' }).value, Math.sqrt(1 / 3));
  assert.notEqual(measureExperimentSource(a, { signal: 'node:out', kind: 'rms' }).value, Math.sqrt((0 + .01 + 1) / 3));
});

test('transient windows interpolate endpoints and exclude samples outside the window', () => {
  const a = source('tran', [0, 1, 2], [0, 2, 0]), selection = { signal: 'node:out', window: { start: .25, end: .75 } };
  close(measureExperimentSource(a, { ...selection, kind: 'minimum' }).value, .5);
  close(measureExperimentSource(a, { ...selection, kind: 'maximum' }).value, 1.5);
  close(measureExperimentSource(a, { ...selection, kind: 'peak-to-peak' }).value, 1);
  close(measureExperimentSource(a, { ...selection, kind: 'final' }).value, 1.5);
  close(measureExperimentSource(a, { ...selection, kind: 'rms' }).value, Math.sqrt(13 / 12));
});

test('unobserved transient ranges are rejected rather than extrapolated', () => {
  const a = source('tran', [.01, .1, 1], [0, .5, 1]);
  for (const window of [{ start: 0, end: .5 }, { start: .5, end: 2 }, { start: .5, end: .5 }]) assert.throws(() => measureExperimentSource(a, { signal: 'node:out', kind: 'final', window }));
});

test('AC interpolation uses complex real/imaginary values on log frequency', () => {
  const a = source('ac', [10, 1000], [1, 0], [0, -1]);
  const magnitude = measureExperimentSource(a, { signal: 'node:out', kind: 'ac-magnitude', frequency: 100 });
  close(magnitude.value, Math.sqrt(.5)); assert.equal(magnitude.details.interpolation, 'linear-complex-versus-log-frequency');
  close(measureExperimentSource(a, { signal: 'node:out', kind: 'ac-phase', frequency: 100 }).value, -45);
  assert.equal(measureExperimentSource(a, { signal: 'node:out', kind: 'ac-magnitude', frequency: 10 }).details.interpolation, 'exact-sample');
});

test('AC zero magnitude keeps magnitude zero but rejects undefined phase', () => {
  const a = source('ac', [10, 100], [0, 0], [0, 0]);
  assert.equal(measureExperimentSource(a, { signal: 'node:out', kind: 'ac-magnitude', frequency: 10 }).value, 0);
  assert.throws(() => measureExperimentSource(a, { signal: 'node:out', kind: 'ac-phase', frequency: 10 }), /undefined/);
});

test('negative-zero AC phase uses a JSON-stable negative-real-axis convention', () => {
  const a = source('ac', [10, 100], [-1, -1], [-0, -0]), measurement = { signal: 'node:out', kind: 'ac-phase', frequency: 10 };
  const result = measureExperimentSource(a, measurement); assert.equal(result.value, 180);
  assert.deepEqual(measureExperimentSource(JSON.parse(JSON.stringify(a)), measurement), result);
});

test('DC final follows acquisition order, including descending sweeps', () => {
  const a = source('dc', [10, 5, 0], [5, 2.5, 0]);
  assert.equal(measureExperimentSource(a, { signal: 'node:out', kind: 'final' }).value, 0);
  assert.equal(measureExperimentSource(a, { signal: 'node:out', kind: 'maximum' }).value, 5);
});

test('malformed, duplicate, nonfinite and mismatched sample arrays are rejected', () => {
  const a = source('tran', [0, 1, 2], [1, 2, 3]);
  for (const change of [s => s.axis.values[1] = 0, s => s.real.pop(), s => s.real[1] = Infinity, s => s.axis.values[0] = -1, s => s.imag = [0, 0, 0], s => s.signal.unit = 'logic']) { const bad = structuredClone(a); change(bad); assert.throws(() => measureExperimentSource(bad, { signal: 'node:out', kind: 'final' })); }
});

test('sample capture supports differential voltage and current without mutating raw results', () => {
  const p = divider(), run = fakeRun(p), current = generateNetlist(p).measurements.find(item => item.id === 'current:' + resistor(p).id);
  run.result.vectors = [{ name: current.a, values: [10], unit: 'V' }, { name: current.b, values: [5], unit: 'V' }];
  const before = JSON.stringify(run), captured = captureExperimentSource(run, { signal: current.id });
  close(captured.real[0], .005); assert.equal(captured.signal.unit, 'A'); assert.equal(JSON.stringify(run), before);
});

test('missing AC imaginary samples are rejected rather than replaced with zero phase', () => {
  const p = divider('ac'), run = fakeRun(p);
  run.result.points = 2; run.result.vectors = [{ name: 'frequency', unit: 'Hz', values: [10, 100] }, { name: 'v(out)', unit: 'V', values: [1, .5] }];
  assert.throws(() => captureExperimentSource(run, { signal: 'node:out' }), /imaginary/);
});

test('trial runner is sequential, preserves snapshot and captures exact applied values', async () => {
  const p = divider(), original = JSON.stringify(p); let live = 0, peak = 0, calls = 0;
  const record = await runExperiment(p, spec(p), { runTrial: async trialProject => { live++; peak = Math.max(peak, live); calls++; await new Promise(resolve => setTimeout(resolve, 1)); const run = await analyticRunner(trialProject); live--; return run; } });
  assert.equal(calls, 3); assert.equal(peak, 1); assert.equal(record.status, 'completed');
  assert.deepEqual(record.trials.map(t => t.parameters[0].text), ['1000', '2000', '3000']);
  record.trials.forEach((trial, i) => close(trial.measurement.value, [5, 10 / 3, 2.5][i]));
  assert.equal(JSON.stringify(p), original); assert.equal(record.projectSnapshot.revision, p.revision);
});

test('failed trials have no numeric value and are excluded from summary', async () => {
  const p = divider(), record = await runExperiment(p, spec(p), { runTrial: async (trialProject, { index }) => { if (index === 1) throw new Error('Fixture convergence failure'); return analyticRunner(trialProject); } });
  assert.equal(record.status, 'completed-with-errors'); assert.equal(record.summary.failedCount, 1); assert.equal(record.summary.measuredCount, 2);
  assert.equal(record.trials[1].measurement, undefined); close(record.summary.mean, 3.75); close(record.summary.standardDeviation, 1.25);
});

test('cancellation preserves completed trials, marks the in-flight trial and stops scheduling', async () => {
  const p = divider(), controller = new AbortController(); let calls = 0;
  const record = await runExperiment(p, spec(p), { signal: controller.signal, runTrial: async (trialProject, { index }) => { calls++; if (index === 1) { controller.abort(); throw new Error('Stopped worker'); } return analyticRunner(trialProject); } });
  assert.equal(calls, 2); assert.equal(record.status, 'cancelled'); assert.equal(record.summary.measuredCount, 1); assert.equal(record.summary.cancelledCount, 1); assert.equal(record.summary.notRunCount, 1);
  assert.equal(record.trials[1].measurement, undefined); assert.equal(record.trials[1].status, 'cancelled');
});

test('pre-cancelled studies never call the runner and retain an honest empty record', async () => {
  const p = divider(), controller = new AbortController(); controller.abort();
  const record = await runExperiment(p, spec(p), { signal: controller.signal, runTrial: () => { throw new Error('Must not run'); } });
  assert.equal(record.status, 'cancelled'); assert.equal(record.summary.attemptedCount, 0); assert.equal(record.summary.notRunCount, 3); assert.equal(record.summary.mean, null);
});

test('a returned run from another circuit is rejected as a failed trial', async () => {
  const p = divider(), record = await runExperiment(p, spec(p), { runTrial: async trialProject => { const run = fakeRun(trialProject); run.projectSnapshot.revision++; return run; } });
  assert.equal(record.summary.failedCount, 3); assert.equal(record.summary.measuredCount, 0); assert.match(record.trials[0].error, /different circuit/);
});

test('malformed returned provenance fails its trial without losing earlier measured evidence', async () => {
  const p = divider(), record = await runExperiment(p, { ...spec(p), count: 5 }, { runTrial: async (trialProject, { index }) => {
    const run = await analyticRunner(trialProject);
    if (index === 1) run.engine = {};
    if (index === 2) run.netlist += '* different input\n';
    if (index === 3) run.result.warnings = new Array(101).fill('Warning');
    if (index === 4) run.measurements.find(item => item.id === 'node:out').label = 'Wrong source label';
    return run;
  } });
  assert.equal(record.summary.measuredCount, 1); assert.equal(record.summary.failedCount, 4); assert.equal(record.trials[0].measurement.value, 5);
  assert.ok(record.trials.slice(1).every(trial => trial.measurement === undefined)); assert.doesNotThrow(() => validateExperimentRecords([record]));
});

test('backup validation recomputes arithmetic and the deterministic parameter sequence', async () => {
  const p = divider(), record = await runExperiment(p, spec(p), { runTrial: analyticRunner });
  const saved = validateExperimentRecords(JSON.parse(JSON.stringify([record])), validateProject)[0];
  assert.deepEqual(saved, record); assert.notEqual(saved.projectSnapshot, record.projectSnapshot);
  for (const change of [r => r.trials[0].measurement.value++, r => r.summary.mean++, r => r.trials[1].parameters[0].value++, r => r.trials[0].source.real[0]++, r => r.trials[0].netlist += '* modified\n', r => r.trials[0].source.signal.unit = 'A', r => r.trials[0].sourceRunId = '<bad>', r => r.spec.target.nominal++, r => r.trials[0].status = 'failed']) { const bad = structuredClone(record); change(bad); assert.throws(() => validateExperimentRecords([bad])); }
});

test('restored evidence can be saved and imported again without resimulation', async () => {
  const p = divider(), record = await runExperiment(p, spec(p), { runTrial: analyticRunner }); record.importedFromBackup = true;
  const restored = validateExperimentRecords([record])[0]; assert.equal(restored.importedFromBackup, true); assert.deepEqual(validateExperimentRecords([restored])[0], restored);
});

test('retention removes oldest studies and preserves a bounded newest result', async () => {
  const p = divider(), record = await runExperiment(p, spec(p), { runTrial: analyticRunner }); let records = [], dropped = 0;
  for (let i = 0; i < 8; i++) { const next = structuredClone(record); next.id = 'experiment_' + i; const result = retainExperimentRecords(records, next); records = result.records; dropped += result.droppedCount; }
  assert.equal(records.length, EXPERIMENT_LIMITS.records); assert.equal(dropped, 2); assert.equal(records[0].id, 'experiment_2'); assert.equal(records.at(-1).id, 'experiment_7');
});

test('record import rejects duplicate IDs, oversized history and malformed timestamps', async () => {
  const p = divider(), record = await runExperiment(p, spec(p), { runTrial: analyticRunner });
  assert.throws(() => validateExperimentRecords([record, record]), /duplicated/);
  const bad = structuredClone(record); bad.completedAt = 'not-a-date'; assert.throws(() => validateExperimentRecords([bad]), /timestamp/);
  bad.completedAt = record.completedAt; bad.notes = 'x'.repeat(EXPERIMENT_LIMITS.recordBytes); assert.throws(() => validateExperimentRecords([bad]), /size/);
});

test('near-limit sample evidence reserves later failure diagnostics without losing completed trials', async () => {
  const p = divider('tran'); Object.assign(p.analysis, { duration: '1', step: '10u' });
  const count = 210000, times = Array.from({ length: count }, (_, i) => i / (count - 1)), values = new Array(count).fill(1.1234567890123456);
  const record = await runExperiment(p, { ...spec(p), count: 64 }, { runTrial: async (trialProject, { index }) => {
    if (index > 1) throw new Error('文'.repeat(4000));
    const run = fakeRun(trialProject); run.result.points = index === 0 ? 2 : count;
    run.result.vectors = [{ name: 'time', unit: 's', values: index === 0 ? [0, 1] : times }, { name: 'v(out)', unit: 'V', values: index === 0 ? [3, 3] : values }];
    return run;
  } });
  assert.equal(record.summary.measuredCount, 1); assert.equal(record.summary.failedCount, 63); assert.equal(record.trials[0].measurement.value, 3);
  assert.match(record.trials[1].error, /space for later trial diagnostics/); assert.ok(Buffer.byteLength(JSON.stringify(record)) <= EXPERIMENT_LIMITS.recordBytes);
  assert.equal(validateExperimentRecords([record])[0].trials.length, 64);
});

test('CSV retains exact parameters, status, empty failed values and quoted identifiers', async () => {
  const p = divider(), record = await runExperiment(p, spec(p), { runTrial: async (trialProject, { index }) => { if (index === 1) throw new Error('Failure, with "quotes"'); return analyticRunner(trialProject); } });
  const csv = experimentCSV(record); assert.equal(csv.split('\r\n').length, 4); assert.match(csv, /"2000"/); assert.match(csv, /"failed"/); assert.match(csv, /"Failure, with ""quotes"""/);
  const json = JSON.parse(experimentEvidenceJSON(record)); assert.equal(json.format, 'CircuitBench analog experiment evidence'); assert.equal(json.experiment.trials[0].source.real[0], 5);
});

test('summary accumulation handles large finite values without squaring overflow', () => {
  const summary = experimentSummary([{ status: 'completed', measurement: { value: 1e300 } }, { status: 'completed', measurement: { value: -1e300 } }], 2);
  assert.equal(summary.mean, 0); assert.equal(summary.standardDeviation, 1e300);
});

test('AC and transient measurement controls validate their requested domain', () => {
  const p = divider('ac'), base = { ...spec(p), measurement: { signal: 'node:out', kind: 'ac-magnitude', frequency: '1k' } };
  assert.equal(normalizeExperimentSpec(p, base).measurement.frequency, 1000);
  assert.throws(() => normalizeExperimentSpec(p, { ...base, measurement: { ...base.measurement, frequency: '1G' } }), /range/);
  p.analysis.type = 'tran'; const transient = { ...spec(p), measurement: { signal: 'node:out', kind: 'rms', window: { start: '1m', end: '2m' } } };
  assert.deepEqual(normalizeExperimentSpec(p, transient).measurement.window, { start: .001, end: .002 });
  assert.throws(() => normalizeExperimentSpec(p, { ...transient, measurement: { ...transient.measurement, window: { start: '2m', end: '1m' } } }), /window/);
});
