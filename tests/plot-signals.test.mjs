import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, addComponent, clone, buildNets, buildDigitalNets } from '../src/model.js';
import { derivedBusBitTraces, logicTraceData, busBitTraceId, traceSchematicTarget, tracesForEndpoint, signalLinkContext } from '../src/plot-signals.js';
import { PlotView, getRunTraces, csvForRun } from '../src/plots.js';
import { SchematicEditor } from '../src/editor.js';
import { EXAMPLES } from '../src/examples.js';
import { generateNetlist } from '../src/netlist.js';
import { simulateDigital } from '../src/digital.js';
import { mergeEventResults } from '../src/simulation.js';

function busRun(width = 4) {
  const words = width === 4 ? ['0000', '10XZ', '1111'] : ['00', 'XZ', '11'];
  return { id: 'bus-run', analysis: { type: 'tran' }, measurements: [{ id: 'bus', label: 'Data', vector: 'b(data)', kind: 'bus', unit: 'logic', width, bitOrder: 'msb-first' }], result: { points: 3, vectors: [{ name: 'time', unit: 's', values: [0, .5, 1] }, { name: 'b(data)', kind: 'bus', unit: 'logic', width, bitOrder: 'msb-first', values: words }], digitalEvents: [{ name: 'b(data)', kind: 'bus', width, bitOrder: 'msb-first', events: [{ time: 0, value: words[0] }, { time: .2, value: width === 4 ? '0001' : '01' }, { time: .4, value: words[1] }, { time: .8, value: words[2] }] }] } };
}
function viewFor(run, baseline) {
  const view = Object.assign(Object.create(PlotView.prototype), { run: null, resultKey: null, baseline: null, range: null, selected: new Set(), unit: 'V', cursors: [null, null], render() {}, draw() {} });
  view.setRun(run, baseline); return view;
}
function realDigitalRun(exampleId = 'bus-slice-join') {
  const project = EXAMPLES.find(e => e.id === exampleId).create(), generated = generateNetlist(project), digital = simulateDigital({ ...generated.simulation.digital, duration: generated.simulation.duration });
  return { project, run: { id: 'compiled-run', projectId: project.id, revision: project.revision, projectSnapshot: clone(project), analysis: clone(project.analysis), measurements: generated.measurements, result: mergeEventResults(null, digital) } };
}

test('derived lanes display MSB down to LSB and preserve literal X/Z per bit', () => {
  const run = busRun(), trace = getRunTraces(run)[0], bits = derivedBusBitTraces(run, trace);
  assert.deepEqual(bits.map(t => t.bit), [3, 2, 1, 0]); assert.deepEqual(bits.map(t => t.values[1]), ['1', '0', 'X', 'Z']);
  assert.equal(bits[3].id, busBitTraceId('bus', 0)); assert.ok(bits.every(t => t.kind === 'logic' && t.derived && t.parentId === 'bus'));
  assert.notEqual(bits[0].values, run.result.vectors[1].values); assert.notEqual(bits[0].events, run.result.digitalEvents[0].events);
});

test('expansion retains preserved transitions between sampled rows and holds final state to run end', () => {
  const run = busRun(), bit = derivedBusBitTraces(run, getRunTraces(run)[0]).find(t => t.bit === 0), data = logicTraceData(bit, [0, .5, 1]);
  assert.deepEqual(data.times, [0, .2, .4, .8, 1]); assert.deepEqual(data.values, ['0', '1', 'Z', '1', '1']);
  const zoomed = logicTraceData(bit, [.3, .6]); assert.deepEqual(zoomed, { times: [.3, .4, .6], values: ['1', 'Z', 'Z'] });
});

test('event projection removes only unchanged states of the same bit', () => {
  const run = busRun(), bits = derivedBusBitTraces(run, getRunTraces(run)[0]), msb = bits[0];
  assert.deepEqual(msb.events, [{ time: 0, value: '0' }, { time: .4, value: '1' }]);
  assert.equal(bits[3].events.length, 4);
});

test('valid preserved value vectors support expansion without a separate bus event record', () => {
  const run = busRun(); delete run.result.digitalEvents; const bit = derivedBusBitTraces(run, getRunTraces(run)[0])[3];
  assert.equal(bit.derivedFrom, 'preserved-bus-values'); assert.deepEqual(logicTraceData(bit, [0, .5, 1]), { times: [0, .5, 1], values: ['0', 'Z', '1'] });
});

test('invalid bus metadata or word width is rejected without coercing states', () => {
  const run = busRun(), trace = getRunTraces(run)[0];
  for (const change of [{ width: 9 }, { width: 1 }, { bitOrder: 'lsb-first' }, { values: ['010'] }, { values: [3] }]) assert.deepEqual(derivedBusBitTraces(run, { ...trace, ...change }), []);
});

test('expand/collapse is view-only; backup data, raw trace catalog and CSV stay byte-identical', () => {
  const run = busRun(), before = JSON.stringify(run), csv = csvForRun(run), view = viewFor(run);
  view.expandBus('bus'); assert.equal(view.visibleTraces().length, 5); assert.equal(getRunTraces(run).length, 1); assert.equal(view.plotHeight(100), 284);
  view.expandBus('bus', false); assert.equal(view.visibleTraces().length, 1); assert.equal(JSON.stringify(run), before); assert.equal(csvForRun(run), csv);
});

test('expanded bit cursor and SVG show the actual event before a sampled bus row', () => {
  const run = busRun(), view = viewFor(run); view.expandBus('bus'); view.cursors[0] = .3;
  assert.match(view.cursorText(), /Data \[0\] 1/);
  view.selected = new Set([busBitTraceId('bus', 0)]); const svg = view.svgContent(800, 300);
  assert.match(svg, /data-state="Z"/); assert.match(svg, /data-select-trace=/); assert.match(svg, /data-state="0" data-baseline="false" d="M100 [^H]+H237/);
});

test('compatible baseline bus bits retain independent event times and incompatible widths are excluded', () => {
  const run = busRun(), baseline = busRun(); baseline.id = 'baseline'; baseline.result.digitalEvents[0].events[1].time = .1;
  const view = viewFor(run, baseline); view.expandBus('bus'); view.selected = new Set([busBitTraceId('bus', 0)]);
  assert.match(view.svgContent(800, 300), /data-state="0" data-baseline="true" d="M100 [^H]+H168\.5/);
  const narrow = busRun(2); narrow.id = 'narrow'; const mismatch = viewFor(run, narrow); mismatch.expandBus('bus'); assert.equal(mismatch.baseline, null);
});

test('expanded state persists across same-session continuous batches and resets for another run', () => {
  const run = busRun(); run.result.continuous = true; const view = viewFor(run); view.expandBus('bus');
  const next = clone(run); next.result.vectors[1].values[2] = '0000'; view.setRun(next); assert.ok(view.expandedBuses.has('bus')); assert.equal(view.displayTraces().find(t => t.bit === 0).values.at(-1), '0');
  const another = clone(next); another.id = 'another'; view.setRun(another); assert.equal(view.expandedBuses.size, 0);
});

test('explicit expand/collapse and Locate controls are rendered with accessible names', () => {
  const run = busRun(), view = viewFor(run), nodes = new Map();
  view.traceList = { innerHTML: '', querySelectorAll: () => [] }; view.area = { innerHTML: '', querySelector: selector => { if (!nodes.has(selector)) nodes.set(selector, { addEventListener() {} }); return nodes.get(selector); } };
  PlotView.prototype.render.call(view); assert.match(view.traceList.innerHTML, /data-expand-bus="bus" aria-expanded="false"/); assert.match(view.traceList.innerHTML, /Expand bits/); assert.match(view.traceList.innerHTML, /data-link-trace="bus"/);
  view.expandBus('bus'); PlotView.prototype.render.call(view); assert.match(view.traceList.innerHTML, /Collapse bits/); assert.match(view.traceList.innerHTML, /Derived bit 0/);
});

test('selectTrace emits recorded identity while preserving cursor/range and raw data', () => {
  const run = busRun(), view = viewFor(run), before = JSON.stringify(run), notifications = []; view.onTraceSelect = e => notifications.push(e); view.range = [.2, .8]; view.cursors = [.3, .7]; view.expandBus('bus');
  assert.equal(view.selectTrace(busBitTraceId('bus', 2)), true); assert.equal(notifications[0].run, run); assert.equal(notifications[0].trace.bit, 2); assert.deepEqual(view.range, [.2, .8]); assert.deepEqual(view.cursors, [.3, .7]); assert.equal(JSON.stringify(run), before);
});

test('same-revision bus bit links through electrical Slice/Join aliases to visible pins', () => {
  const { project, run } = realDigitalRun(), trace = getRunTraces(run).find(t => t.kind === 'bus'), bit = derivedBusBitTraces(run, trace).find(t => t.bit === 0), link = traceSchematicTarget(run, bit, project);
  assert.ok(link.ok); const built = buildNets(project), digital = buildDigitalNets(project, built), parentName = /^b\((.*)\)$/.exec(trace.vector)[1], bitName = digital.netBits[parentName][0];
  assert.ok(link.target.endpoints.length >= 2); assert.ok(link.target.endpoints.every(ep => digital.endpointBits[ep]?.includes(bitName))); assert.ok(link.target.ids.length);
});

test('working pins can select a specific expanded bit without notifying the reverse link', () => {
  const { project, run } = realDigitalRun(), trace = getRunTraces(run).find(t => t.kind === 'bus'), net = buildNets(project).nets.find(n => `b(${n.name})` === trace.vector), view = viewFor(run), notifications = [];
  view.onTraceSelect = event => notifications.push(event); const result = view.selectEndpoint(net.endpoints[0], { project, bit: 0 });
  assert.ok(result.ok); assert.ok(view.activeTraceId.startsWith('bus-bit:')); assert.equal(view.displayTraces().find(t => t.id === view.activeTraceId).bit, 0); assert.deepEqual(notifications, []);
});

test('historical revision mismatch blocks both link directions without changing the active plot', () => {
  const { project, run } = realDigitalRun(), trace = getRunTraces(run)[0], changed = clone(project); changed.revision++;
  assert.equal(traceSchematicTarget(run, trace, changed).ok, false); assert.match(signalLinkContext(run, changed).reason, /different project or revision/);
  const view = viewFor(run), before = [...view.selected]; const result = view.selectEndpoint(`${project.circuit.components[0].id}:out`, { project: changed }); assert.equal(result.ok, false); assert.deepEqual([...view.selected], before);
});

test('differential and branch-current links retain their recorded component and endpoint identities', () => {
  const project = EXAMPLES.find(e => e.id === 'divider').create(), generated = generateNetlist(project), run = { projectId: project.id, revision: project.revision, projectSnapshot: clone(project), measurements: generated.measurements };
  const current = generated.measurements.find(m => m.kind === 'current'), link = traceSchematicTarget(run, { ...current, values: [0] }, project);
  assert.ok(link.ok); assert.deepEqual(link.target.ids, [current.componentId]);
  const r = project.circuit.components.find(c => c.type === 'R'); project.probes.push({ id: 'difference', label: 'Across resistor', kind: 'differential', a: `${r.id}:1`, b: `${r.id}:2` }); run.projectSnapshot = clone(project);
  const difference = traceSchematicTarget(run, { id: 'difference', label: 'Across resistor', kind: 'differential' }, project); assert.ok(difference.target.endpoints.includes(`${r.id}:1`)); assert.ok(difference.target.endpoints.includes(`${r.id}:2`));
});

test('net-to-plot mapping prioritizes voltage/logic over an incidental branch-current trace', () => {
  const project = newProject(), source = addComponent(project, 'V'), snapshot = clone(project), endpoint = `${source.id}:p`, name = buildNets(project).endpointToNet[endpoint];
  const measurements = [{ id: 'current', kind: 'current', componentId: source.id, vector: 'i(v1)' }, { id: 'voltage', kind: 'voltage', vector: `v(${name})` }], run = { projectId: project.id, revision: project.revision, projectSnapshot: snapshot, measurements };
  const result = tracesForEndpoint(run, measurements, endpoint, project); assert.equal(result.traces[0].id, 'voltage');
});

test('Editor signal focus highlights selected endpoints with no circuit edit or reverse callback', () => {
  const { project, run } = realDigitalRun(), trace = getRunTraces(run).find(t => t.kind === 'bus'), link = traceSchematicTarget(run, trace, project), before = clone(project), callbacks = [];
  const editor = Object.assign(Object.create(SchematicEditor.prototype), { callbacks: { getProject: () => project, onEndpointFocus: () => callbacks.push('endpoint'), onChange: () => callbacks.push('edit'), onSelect() {} }, selection: new Set(), mode: 'select', render() {}, status() {}, svg: { getBoundingClientRect: () => ({ width: 1000, height: 600 }) } });
  assert.equal(editor.selectSignal(link.target), true); assert.deepEqual(editor.signalEndpoints, link.target.endpoints); assert.deepEqual(project, before); assert.deepEqual(callbacks, []);
  editor.select([]); assert.deepEqual(editor.signalEndpoints, []);
});
