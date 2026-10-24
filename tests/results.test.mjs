import test from 'node:test';
import assert from 'node:assert/strict';
import { getAxis, getRunTraces, getPlotAxis, getPlotTraces, canCompareRuns, csvForRun, PlotView } from '../src/plots.js';
import { safeEnvelope } from '../src/storage.js';
import { createReport } from '../src/reports.js';
import { newProject, validateProject, clone } from '../src/model.js';

function resultRun(type = 'ac') {
  const project = newProject('Evidence fixture');
  project.analysis.type = type;
  project.analysis.source = type === 'dc' ? 'I1' : 'V1';
  const axis = { name: type === 'ac' ? 'frequency' : type === 'tran' ? 'time' : 'i-sweep', unit: type === 'ac' ? 'Hz' : type === 'tran' ? 's' : 'A', values: [1, 2] };
  const vectors = [axis, { name: 'v(out)', unit: 'V', values: [1, .5], imag: [0, -.5] }, { name: 'v(in)', unit: 'V', values: [.1, .1], imag: [.2, .2] }, { name: 'v1#branch', unit: 'A', values: [-.001, -.0005], imag: [0, .0005] }];
  return {
    id: 'run_fixture', projectId: project.id, projectSnapshot: project, revision: project.revision,
    startedAt: '2026-10-24T00:00:00.000Z', completedAt: '2026-10-24T00:00:01.000Z', analysis: clone(project.analysis),
    netlist: 'CircuitBench fixture\nV1 out 0 1\nR1 out 0 1000\n.op\n.end\n', netlistHash: 'test-content-hash', status: 'completed',
    engine: { name: 'ngspice', version: 'test-only fixture' }, models: [], logs: [], diagnostics: [],
    measurements: [
      { id: 'out', label: 'Output "A,B"', kind: 'voltage', vector: 'v(out)', unit: 'V' },
      { id: 'ground', label: 'Ground', kind: 'voltage', vector: '0', unit: 'V' },
      { id: 'diff', label: 'Differential', kind: 'differential', a: 'v(out)', b: 'v(in)', unit: 'V' },
      { id: 'resistor', label: 'Resistor current', kind: 'current', a: 'v(out)', b: 'v(in)', resistance: 1000, unit: 'A', referenceDirection: 'pin 1 to pin 2' },
      { id: 'source', label: 'Source current', kind: 'current', vector: 'i(v1)', unit: 'A', referenceDirection: 'positive terminal to negative terminal' }
    ], result: { vectors, points: 2, warnings: [] }
  };
}
const envelope = run => ({ project: run.projectSnapshot, runs: [run], activeRunId: run.id, baselineId: run.id });
const plotHarness = run => Object.assign(Object.create(PlotView.prototype), { run, resultKey: run?.result, baseline: null, range: null, selected: new Set(['out']), unit: 'V', cursors: [null, null], render() {}, draw() {} });

test('complex differential voltage and resistor current retain signed real/imaginary values and reference', () => {
  const run = resultRun(), original = JSON.stringify(run), traces = getRunTraces(run);
  const diff = traces.find(t => t.id === 'diff'), resistor = traces.find(t => t.id === 'resistor'), source = traces.find(t => t.id === 'source');
  assert.deepEqual(diff.values, [.9, .4]);
  assert.deepEqual(diff.imag, [-.2, -.7]);
  assert.deepEqual(resistor.values, [.0009, .0004]);
  assert.deepEqual(resistor.imag, [-.0002, -.0007]);
  assert.equal(resistor.reference, 'pin 1 to pin 2');
  assert.equal(source.reference, 'positive terminal to negative terminal');
  assert.deepEqual(source.values, [-.001, -.0005]);
  assert.equal(JSON.stringify(run), original, 'derived processing must not modify the raw run');
});

test('ground voltage is a real zero trace including in complex AC runs', () => {
  const ground = getRunTraces(resultRun()).find(t => t.id === 'ground');
  assert.ok(ground, 'valid ground probes cannot silently disappear');
  assert.deepEqual(ground.values, [0, 0]);
  assert.deepEqual(ground.imag, [0, 0]);
});

test('axis identity and units match AC, transient, operating point, and current sweep', () => {
  const summary = r => { const { name, unit, log } = getAxis(r); return { name, unit, log }; };
  assert.deepEqual(summary(resultRun('ac')), { name: 'Frequency', unit: 'Hz', log: true });
  assert.deepEqual(summary(resultRun('tran')), { name: 'Time', unit: 's', log: false });
  assert.deepEqual(summary(resultRun('dc')), { name: 'Sweep I1', unit: 'A', log: false });
  assert.deepEqual(summary(resultRun('op')), { name: 'Operating point', unit: '', log: false });
});

test('CSV exports full raw sample order and complex values with correctly quoted labels', () => {
  const run = resultRun(), csv = csvForRun(run), rows = csv.split('\r\n');
  assert.equal(rows.length, 3);
  assert.ok(rows[0].includes('"Output ""A,B"" real (V)"'));
  assert.ok(rows[0].includes('"Resistor current imaginary (A)"'));
  assert.deepEqual(rows[1].split(',').map(Number).slice(0, 7), [1, 1, 0, 0, 0, .9, -.2]);
  assert.deepEqual(rows[2].split(',').map(Number).slice(0, 7), [2, .5, -.5, 0, 0, .4, -.7]);
});

test('descending sweeps are normalized only for plotting; zoom and SVG remain finite', () => {
  const run = resultRun('dc');
  run.result.vectors = [{ name: 'i-sweep', unit: 'A', values: [10, 5, 0] }, { name: 'v(out)', unit: 'V', values: [5, 2.5, 0] }];
  run.measurements = [run.measurements[0]];
  run.result.points = 3;
  const original = JSON.stringify(run);
  assert.deepEqual(getAxis(run).values, [10, 5, 0]);
  assert.deepEqual(getPlotAxis(run).values, [0, 5, 10]);
  assert.deepEqual(getPlotTraces(run)[0].values, [0, 2.5, 5]);
  const view = plotHarness(run);
  assert.deepEqual(view.bounds(), [0, 10]);
  view.setRange(2, 8);
  assert.deepEqual(view.bounds(), [2, 8]);
  const svg = view.svgContent(800, 300);
  assert.ok(!/NaN|Infinity/.test(svg));
  assert.ok(svg.includes('<polyline'));
  assert.ok(svg.includes('clip-path="url(#plot-clip-0)"'));
  assert.equal(csvForRun(run).split('\r\n')[1], '10,5');
  assert.equal(JSON.stringify(run), original);
});

test('first completed result selects useful traces even when the running record had the same id', () => {
  const completed = resultRun(), run = clone(completed), view = plotHarness(null);
  run.status = 'running'; run.result = null;
  view.setRun(run);
  assert.equal(view.selected.size, 0);
  run.status = 'completed'; run.result = completed.result;
  view.setRun(run);
  assert.ok(view.selected.has('out'), 'first-minute workflow must show the result without manual checkbox selection');
  assert.doesNotThrow(() => view.setRun(null));
  assert.equal(view.selected.size, 0);
});

test('AC plots use independent magnitude/phase clipping and state correct dB reference units', () => {
  const view = plotHarness(resultRun());
  const svg = view.svgContent(800, 400);
  assert.ok(svg.includes('Magnitude (dBV)'));
  assert.ok(svg.includes('Phase (°)'));
  assert.ok(svg.includes('id="plot-clip-0"'));
  assert.ok(svg.includes('id="plot-clip-1"'));
  assert.ok(!/NaN|Infinity/.test(svg));
  const exported = view.getSVG();
  assert.ok(!exported.includes('var('), 'exported plot colors must be literal for print/vector renderers');
  assert.ok(exported.includes('fill="#d0dfd5"'));
  assert.ok(exported.includes('Output &quot;A,B&quot; (V)'), 'the exported plot includes its own named signal legend');
  view.baseline={...resultRun(),id:'baseline'};
  const geometryBefore=clone(view.geometry),withBaseline=view.getSVG();
  assert.ok(withBaseline.includes('Dashed lines: pinned baseline'));
  assert.deepEqual(view.geometry,geometryBefore,'export must not change on-screen pointer/cursor geometry');
});

test('baseline comparisons reject unlike horizontal units and the same run', () => {
  const run = resultRun('dc'), baseline = clone(run); baseline.id = 'run_baseline';
  assert.equal(canCompareRuns(run, baseline), true);
  baseline.analysis.source = 'V1';
  assert.equal(canCompareRuns(run, baseline), false, 'amperes on X cannot be overlaid as volts');
  assert.equal(canCompareRuns(run, run), false);
  const view = plotHarness(run); view.setRun(run, baseline);
  assert.equal(view.baseline, null);
  assert.match(view.comparisonNote, /not overlaid/);
});

test('run import validates immutable circuit identity and numerical evidence status', () => {
  const run = resultRun(), saved = safeEnvelope(envelope(run), validateProject);
  assert.equal(saved.runs[0].status, 'completed');
  assert.notEqual(saved.runs[0].projectSnapshot, run.projectSnapshot);
  assert.notEqual(saved.runs[0].result.vectors[0].values, run.result.vectors[0].values);
  for (const edit of [
    r => { r.id = '"><img src=x onerror=alert(1)>'; },
    r => { r.projectSnapshot = {}; },
    r => { r.projectId = 'different_project'; },
    r => { r.revision++; },
    r => { r.analysis.type = 'tran'; },
    r => { r.result = null; },
    r => { r.status = 'cancelled'; },
    r => { r.diagnostics = [{ severity: 'unexpected', message: 'bad' }]; },
    r => { r.measurements[0].unit = 'banana'; },
    r => { r.result.points = 999; }
  ]) {
    const invalid = clone(run); edit(invalid);
    assert.throws(() => safeEnvelope(envelope(invalid), validateProject));
  }
  assert.throws(() => safeEnvelope({ project: run.projectSnapshot, runs: [run, clone(run)] }, validateProject), /duplicate/i);
});

test('interrupted running records recover as failed with no invented result', () => {
  const run = resultRun(); run.status = 'running'; run.result = null;
  const restored = safeEnvelope(envelope(run), validateProject).runs[0];
  assert.equal(restored.status, 'failed');
  assert.equal(restored.result, null);
  assert.match(restored.error, /interrupted/);
  assert.equal(run.status, 'running', 'import must not mutate the input');
});

test('startup failures retain bounded diagnostic details across backup import', () => {
  const run=resultRun();run.status='failed';run.result=null;run.error='The engine file returned HTTP 404.';
  run.failure={phase:'loading-wasm',code:'ENGINE_WASM_HTTP',assetUrl:'https://example.invalid/tools/circuitbench/engine/spice.wasm',httpStatus:404,contentType:'text/html'};
  assert.deepEqual(safeEnvelope(envelope(run),validateProject).runs[0].failure,run.failure);
  for(const edit of [f=>f.assetUrl=Array(3),f=>f.httpStatus='404',f=>f.phase='x'.repeat(101)]){
    const invalid=clone(run);edit(invalid.failure);assert.throws(()=>safeEnvelope(envelope(invalid),validateProject),/startup diagnostics/);
  }
});

test('invalid vector shapes, nonfinite values, and excessive import budgets are rejected', () => {
  const base = resultRun();
  for (const edit of [
    r => { r.result.vectors[1].values.pop(); },
    r => { r.result.vectors[1].imag.pop(); },
    r => { r.result.vectors[1].values[0] = NaN; },
    r => { r.result.vectors[1].imag[0] = Infinity; },
    r => { r.result.vectors[1].values = []; },
    r => { r.result.vectors[1].values = Array(250001).fill(0); }
  ]) {
    const invalid = clone(base); edit(invalid);
    assert.throws(() => safeEnvelope(envelope(invalid), validateProject));
  }
  const budget = clone(base), shared = Array(250000).fill(0);
  budget.result.vectors = Array.from({ length: 17 }, (_, i) => ({ name: 'v(n' + i + ')', values: shared, unit: 'V' }));
  budget.result.points = 250000;
  assert.throws(() => safeEnvelope(envelope(budget), validateProject), /million/);
});

test('reports use historical circuit/configuration and escape imported titles, notes, diagnostics, and netlists', () => {
  const run = resultRun();
  run.projectSnapshot.title = 'Old circuit <img onerror="attack()">';
  run.projectSnapshot.question = 'Captured question';
  run.projectSnapshot.notes = '<script>attack()</script>';
  run.netlist = 'Captured <script>netlist()</script>';
  run.diagnostics = [{ severity: 'warning', message: '<script>diagnostic()</script>' }];
  const working = clone(run.projectSnapshot); working.title = 'New working title'; working.revision = 9; working.analysis.type = 'tran';
  const html = createReport({ project: working, run, schematic: '<svg></svg>', plot: '', baseline: null });
  assert.ok(html.includes('Old circuit &lt;img onerror='));
  assert.ok(html.includes('Captured question'));
  assert.ok(html.includes('Captured &lt;script&gt;netlist()&lt;/script&gt;'));
  assert.ok(html.includes('&lt;script&gt;diagnostic()&lt;/script&gt;'));
  assert.ok(html.includes('belongs to the recorded revision'));
  assert.ok(html.includes('complex magnitudes'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('New working title'));
  assert.ok(html.includes('Evidence status'));
  assert.ok(html.includes('completed'));
  const config = /<table class="analysis-config">([\s\S]*?)<\/table>/.exec(html)?.[1];
  assert.ok(config, 'active analysis configuration table is present');
  assert.ok(config.includes('Start frequency (Hz)'));
  assert.ok(config.includes('Relative tolerance'));
  assert.ok(!/Sweep start|Duration \(s\)|Maximum time step/.test(config), 'AC print configuration excludes inactive DC/transient controls');
  assert.ok(html.includes('evidence-lead'));
  assert.ok(html.includes('engine-diagnostics keep-together'));
});

test('reports identify cancelled runs and have no fabricated numerical evidence', () => {
  const run = resultRun(); run.status = 'cancelled'; run.result = null; run.error = 'Cancelled by user <test>';
  const html = createReport({ project: run.projectSnapshot, run, schematic: '', plot: '', baseline: null });
  assert.ok(html.includes('cancelled'));
  assert.ok(html.includes('No completed numerical evidence is available'));
  assert.ok(html.includes('Cancelled by user &lt;test&gt;'));
  assert.ok(!html.includes('raw samples per vector'));
});
