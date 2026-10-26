import test from 'node:test';
import assert from 'node:assert/strict';
import { PlotView, getRunTraces, getSampleProvenance, csvForRun, formatTraceValue, logicStateAt, logicIntervals } from '../src/plots.js';
import { createReport } from '../src/reports.js';
import { EXAMPLES } from '../src/examples.js';
import { generateNetlist } from '../src/netlist.js';
import { simulateDigital, analogToDigitalEvents, digitalToPWL, DIGITAL_ENGINE_INFO } from '../src/digital.js';
import { mergeEventResults, WORKBENCH_ENGINE_INFO } from '../src/simulation.js';
import { ENGINE_INFO } from '../src/engine.js';
import { escapeHTML } from '../src/storage.js';

function runFixture({ mixed = false, id = 'timing', times = [0, .25, .5, .75, 1], states = ['0', '1', 'X', 'Z', 'Z'] } = {}) {
  const vectors = [{ name: 'time', unit: 's', values: times }, { name: 'd(out)', unit: 'logic', kind: 'logic', values: states }];
  if (mixed) vectors.push({ name: 'v(out)', unit: 'V', values: times.map(t => t * 4) });
  return { id, status: 'completed', analysis: { type: 'tran', stop: '1' }, projectSnapshot: { probes: mixed ? [{ id: 'analog-probe' }] : [] },
    measurements: mixed ? [{ id: 'analog-probe', label: 'Analog output', unit: 'V', vector: 'v(out)' }] : [{ id: 'logic-probe', label: 'Logic output', unit: 'logic', kind: 'logic', vector: 'd(out)' }],
    result: { vectors, points: times.length, sampling: mixed ? { mode: 'event-union', analogSampleIndices: [0, times.length - 1], analogInterpolation: 'linear', logicContinuity: 'right' } : { mode: 'digital-events', analogSampleIndices: [], logicContinuity: 'right' } } };
}
function plot(run) {
  const view = Object.assign(Object.create(PlotView.prototype), { run: null, resultKey: null, baseline: null, range: null, selected: new Set(), unit: 'V', cursors: [null, null], render() {}, draw() {} });
  view.setRun(run);
  return view;
}

test('literal four-state traces are retained beside preferred analog probes and CSV never coerces them', () => {
  const run = runFixture({ mixed: true }), before = JSON.stringify(run), traces = getRunTraces(run);
  const logic = traces.find(trace => trace.kind === 'logic');
  assert.deepEqual(logic.values, ['0', '1', 'X', 'Z', 'Z']);
  assert.equal(logic.unit, 'logic');
  const rows = csvForRun(run).split('\r\n');
  assert.match(rows[0], /"d\(out\) \(logic\)"/);
  assert.equal(rows[1], '0,"ngspice-original",0,"0"');
  assert.equal(rows[3], '0.5,"linear-interpolated",2,"X"');
  assert.equal(rows[4], '0.75,"linear-interpolated",3,"Z"');
  assert.equal(rows[5], '1,"ngspice-original",4,"Z"');
  assert.equal(JSON.stringify(run), before, 'plot and export cannot alter immutable run arrays or provenance');
  assert.equal(formatTraceValue('X', logic), 'X');
  assert.equal(formatTraceValue('Z', 'logic'), 'Z');
  assert.equal(formatTraceValue('1', 'V'), '—', 'logic text is not silently converted to an analog voltage');
  assert.equal(formatTraceValue(.001, 'V'), '1 mV');
});

test('malformed logic vectors are rejected rather than displayed as numerical ramps', () => {
  const run = runFixture();
  run.result.vectors[1].values[1] = 1;
  assert.deepEqual(getRunTraces(run), []);
  run.result.vectors[1].values[1] = '1';
  run.result.vectors[1].imag = [0, 0, 0, 0, 0];
  assert.deepEqual(getRunTraces(run), []);
});

test('union provenance identifies only recorded original analog times and leaves analog-only CSV unchanged', () => {
  const run = runFixture({ mixed: true });
  assert.deepEqual([0, 1, 2, 3, 4].map(i => getSampleProvenance(run, i)), ['ngspice-original', 'linear-interpolated', 'linear-interpolated', 'linear-interpolated', 'ngspice-original']);
  assert.equal(getSampleProvenance(runFixture(), 2), 'logic-event');
  delete run.result.sampling;
  run.result.vectors = run.result.vectors.filter(v => v.kind !== 'logic');
  assert.equal(csvForRun(run).split('\r\n')[0], '"Time (s)","Analog output (V)"');
  assert.equal(csvForRun(run).split('\r\n')[2], '0.25,1');
});

test('right-continuous cursor state and clipped lanes use the predecessor, including settled simultaneous events', () => {
  const times = [0, 1, 1, 2, 3], states = ['0', 'X', '1', 'Z', '0'];
  assert.equal(logicStateAt(times, states, .99), '0');
  assert.equal(logicStateAt(times, states, 1), '1');
  assert.equal(logicStateAt(times, states, 1.99), '1');
  assert.equal(logicStateAt(times, states, -1), 'X');
  assert.deepEqual(logicIntervals(times, states, 1, 2.5), [{ start: 1, end: 2, state: '1' }, { start: 2, end: 2.5, state: 'Z' }]);
  assert.deepEqual(logicIntervals([0, 1], ['1', '1']), [{ start: 0, end: 1, state: '1' }], 'constant input holds through the requested duration');
});

test('logic lanes draw exact horizontal/vertical corners, with distinct X and Z states', () => {
  const view = plot(runFixture()), svg = view.svgContent(800, 300), paths = [...svg.matchAll(/<path class="logic-step"[^>]* d="([^"]+)"/g)].map(match => match[1]);
  assert.equal(view.unit, 'logic');
  assert.equal(paths.length, 4, 'unchanged final Z sample must not introduce a transition');
  assert.equal(paths[0], 'M100 202.4H271.25V72.4');
  assert.equal(paths[1], 'M271.25 72.4H442.5V137.4');
  assert.ok(paths.every(path => !/[LQC]/.test(path)), 'logic transitions cannot be analog ramps');
  assert.match(svg, /logic-state-band" data-state="X"[^>]+fill="url\(#logic-unknown-hatch\)"/);
  assert.match(svg, /logic-step" data-state="Z"[^>]+stroke-dasharray="2 3"/);
  assert.match(svg, />X<\/text>/);
  assert.match(svg, />Z<\/text>/);
  assert.ok(!/NaN|Infinity/.test(svg));
});

test('all logic transitions survive large traces and zoom clipping preserves the state active at the left edge', () => {
  const times = Array.from({ length: 2001 }, (_, i) => i / 2000), states = times.map((_, i) => String(i % 2));
  const view = plot(runFixture({ times, states }));
  assert.equal((view.svgContent(800, 300).match(/class="logic-step"/g) ?? []).length, 2001, 'numeric min/max display simplification must never drop logic edges');
  view.range = [.00025, .00125];
  const svg = view.svgContent(800, 300);
  assert.match(svg, /data-state="0" data-baseline="false" d="M100 202\.4H271\.25V72\.4"/);
  assert.equal((svg.match(/class="logic-step"/g) ?? []).length, 3);
});

test('Mixed automatically displays logic beside voltage and cursor interpolation is explicitly identified', () => {
  const view = plot(runFixture({ mixed: true }));
  assert.equal(view.unit, 'mixed');
  assert.equal(view.visibleTraces().length, 2);
  const svg = view.svgContent(800, 320);
  assert.match(svg, /data-panel="analog"/);
  assert.match(svg, /class="logic-lane"/);
  assert.match(svg, /clip-path="url\(#plot-clip-0\)"/);
  assert.match(svg, /clip-path="url\(#logic-lane-0\)"/);
  view.cursors = [.24, .25];
  const readout = view.cursorText();
  assert.match(readout, /A 240 ms: Analog output ≈ 960 mV \(interpolated\) · d\(out\) 0/);
  assert.match(readout, /B 250 ms: Analog output ≈ 1 V \(interpolated\) · d\(out\) 1/);
  assert.match(readout, /Δt 10 ms/);
  view.cursors = [1, null];
  assert.match(view.cursorText(), /Analog output 4 V/);
  assert.ok(!view.cursorText().includes('interpolated'), 'original ngspice sample must retain its provenance');
  view.unit = 'V';
  assert.equal(view.visibleTraces().length, 1);
  assert.ok(!view.svgContent(800, 300).includes('class="logic-lane"'));
});

test('logic baseline uses its own event times and export preserves named legend, states and literal colors', () => {
  const run = runFixture({ times: [0, .25, 1], states: ['0', '1', '1'] });
  const baseline = runFixture({ id: 'baseline', times: [0, .5, 1], states: ['0', '1', '1'] });
  const view = plot(run);
  view.setRun(run, baseline);
  const svg = view.svgContent(800, 300);
  assert.match(svg, /data-state="0" data-baseline="true" d="M100 204\.4H442\.5V74\.4"/);
  assert.match(svg, /data-state="0" data-baseline="false" d="M100 202\.4H271\.25V72\.4"/);
  const geometry = view.geometry, exported = view.getSVG();
  assert.match(exported, /Logic output \(logic\)/);
  assert.match(exported, /X unknown \(hatched\) · Z high impedance/);
  assert.match(exported, /Solid lines: selected run · Dashed lines: pinned baseline/);
  assert.ok(!exported.includes('var('));
  assert.equal(view.geometry, geometry, 'export dimensions cannot corrupt interactive pointer coordinates');
});

function reportRun(project, generated, result, engine) {
  return { id: 'report-fixture', projectId: project.id, revision: project.revision, projectSnapshot: structuredClone(project), analysis: structuredClone(project.analysis),
    status: 'completed', startedAt: '2026-10-24T00:00:00Z', completedAt: '2026-10-24T00:00:01Z', netlist: generated.netlist, netlistHash: 'fixture-input-sha',
    simulation: generated.simulation, simulationHash: 'fixture-plan-sha', measurements: generated.measurements, models: generated.modelManifest,
    diagnostics: [], logs: [], result, engine };
}

test('pure digital report preserves real four-state results and identifies event timing without analog solver settings', () => {
  const project = EXAMPLES.find(example => example.id === 'tri-state-bus').create(), generated = generateNetlist(project), plan = generated.simulation;
  const digital = simulateDigital({ duration: plan.duration, ...plan.digital }), result = mergeEventResults(null, digital);
  const run = reportRun(project, generated, result, { ...DIGITAL_ENGINE_INFO, mode: 'digital', digital: DIGITAL_ENGINE_INFO });
  const html = createReport({ project, run, schematic: '', plot: plot(run).getSVG(), baseline: null });
  const configuration = html.match(/<table class="analysis-config">[\s\S]*?<\/table>/)?.[0];
  assert.match(configuration, /Digital event resolution<\/th><td>1 ps/);
  assert.match(configuration, /transport; gate and flip-flop delays are recorded per component/);
  assert.ok(!/Maximum time step|initial conditions|Temperature|tolerance/i.test(configuration), 'unused analog solver controls cannot be presented as digital run settings');
  const row = html.match(/<tr><td>Shared bus[\s\S]*?<\/tr>/)?.[0];
  assert.match(row, /States observed: 0, X, 1, Z/);
  assert.match(row, /<td>—<\/td><td>—<\/td>/, 'logic has no numerical extrema');
  assert.ok(html.includes(escapeHTML(DIGITAL_ENGINE_INFO.name+' '+DIGITAL_ENGINE_INFO.version)));
  assert.ok(html.includes('Build: '+escapeHTML(DIGITAL_ENGINE_INFO.build)));
  assert.match(html, /Analog WASM SHA-256: Not used by a digital-only run/);
  assert.match(html, /Compiled digital \/ mixed-signal partition/);
  assert.ok(html.includes('<pre>' + escapeHTML(JSON.stringify(generated.simulation, null, 2)) + '</pre>'), 'the exact digital partition remains in report provenance');
  assert.ok(html.includes('<pre>' + escapeHTML(generated.netlist) + '</pre>'));
  assert.ok(!/NaN|Infinity/.test(html));
  delete result.sampling.description; // Portable metadata permits an omitted description.
  const fallback = createReport({ project, run, schematic: '', plot: '', baseline: null });
  assert.ok(!fallback.includes('Original analog solver samples'));
  assert.match(fallback, /Settled digital event times; logic is held between events/);
});

test('mixed report preserves both executed decks, bridge snapshot, union provenance and distinct engine identities', () => {
  const project = EXAMPLES.find(example => example.id === 'mixed-chain').create(), generated = generateNetlist(project), plan = generated.simulation;
  const adc = plan.adcs[0], sources = [{ id: adc.id, output: adc.output, kind: 'events', events: analogToDigitalEvents([0, .005, .01], [0, 5, 0], adc.low, adc.high, { mode: adc.mode }) }];
  const digital = simulateDigital({ duration: plan.duration, ...plan.digital }, { sources });
  const waveforms = Object.fromEntries(plan.dacs.map(dac => [dac.id, digitalToPWL(digital.traces.find(trace => trace.node === dac.input).events, dac, plan.duration)]));
  const executedDeck = generateNetlist(project, { dacWaveforms: waveforms }).netlist;
  // Explicit report-format fixture values; numerical solver accuracy has separate native/WASM proof tests.
  const analog = { vectors: [{ name: 'time', unit: 's', values: [0, .002, .004, .006, .008, .01] }, { name: 'v(ramp)', unit: 'V', values: [0, 2, 4, 4, 2, 0] }, { name: 'v(out)', unit: 'V', values: [5, 5, 0, 0, 0, 5] }] };
  const result = { ...mergeEventResults(analog, digital), analogNetlists: [generated.netlist, executedDeck] };
  const run = reportRun(project, generated, result, { ...WORKBENCH_ENGINE_INFO, mode: 'mixed', analog: ENGINE_INFO, digital: DIGITAL_ENGINE_INFO });
  const working = structuredClone(project); working.revision++;
  working.circuit.components.find(c => c.type === 'ADC').params.high = '4.9';
  working.circuit.components.find(c => c.type === 'DAC').params.high = '9';
  const html = createReport({ project: working, run, schematic: '', plot: plot(run).getSVG(), baseline: null });
  const configuration = html.match(/<table class="analysis-config">[\s\S]*?<\/table>/)?.[0];
  assert.match(configuration, /Maximum time step/); assert.match(configuration, /Relative tolerance/);
  assert.match(configuration, /Digital event resolution<\/th><td>1 ps/);
  assert.ok(html.includes('Analog engine:</strong> '+escapeHTML(`${ENGINE_INFO.name} ${ENGINE_INFO.version} · ${ENGINE_INFO.package} ${ENGINE_INFO.packageVersion}`)));
  assert.ok(html.includes('Digital engine:</strong> '+escapeHTML(`${DIGITAL_ENGINE_INFO.name} ${DIGITAL_ENGINE_INFO.version} · ${DIGITAL_ENGINE_INFO.package} ${DIGITAL_ENGINE_INFO.packageVersion}`)));
  assert.ok(html.includes(ENGINE_INFO.wasmSha256)); assert.ok(html.includes(DIGITAL_ENGINE_INFO.build));
  assert.ok(html.includes(escapeHTML(result.sampling.description)));
  assert.match(html, /shared result grid preserves original samples from the final ngspice analog pass/);
  assert.match(html, /States observed: 0, 1/);
  assert.match(html, /low: 1\.5 · high: 3\.5 · mode: schmitt/);
  assert.match(html, /low: 0 · high: 5 · rise: 1u · fall: 1u/);
  assert.ok(!html.includes('high: 4.9')); assert.ok(!html.includes('high: 9'));
  for (const [index, deck] of result.analogNetlists.entries()) assert.ok(html.includes(`<h3>Executed analog stage ${index + 1}</h3><pre>${escapeHTML(deck)}</pre>`), 'each exact executed analog deck is retained');
  assert.ok(html.includes('Plan SHA-256: fixture-plan-sha'));
});
