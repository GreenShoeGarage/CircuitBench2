import test from 'node:test';
import assert from 'node:assert/strict';
import { getPart, getPins, MODELS, LOGIC_IO_MODEL_VERSION } from '../src/library.js';
import { newProject, addComponent, uid, clone, buildNets, buildDigitalNets, canConnect, checkCircuit, validateProject } from '../src/model.js';
import { compileSimulation, generateNetlist } from '../src/netlist.js';
import { simulateDigital } from '../src/digital.js';
import { mergeEventResults } from '../src/simulation.js';
import { compileCoordinated, createCoordinatedSession } from '../src/coordinated.js';
import { appendContinuousResult } from '../src/continuous.js';
import { logicIndicatorState, logicIndicatorMarkup, displayStatesForRun, displayPanelMarkup } from '../src/displays.js';
import { symbolMarkup } from '../src/symbols.js';
import { SchematicEditor } from '../src/editor.js';
import { safeEnvelope } from '../src/storage.js';

const ep = (component, pin = 'out') => `${component.id}:${pin}`;
const add = (project, type, params = {}, x = 100, y = 100) => { const component = addComponent(project, type, x, y); Object.assign(component.params, params); return component; };
const wire = (project, a, b) => { const id = uid('w'); project.circuit.connections.push({ id, a, b }); project.layout.wires[id] = { points: [] }; };
const label = (project, target, name) => project.circuit.labels.push({ id: uid('label'), target, name });
function circuit(state = '0') {
  const project = newProject('Logic indicator fixture'); Object.assign(project.analysis, { type: 'tran', duration: '4m', step: '10u' });
  const source = add(project, 'DIN', { state }), indicator = add(project, 'DLED', {}, 280, 100);
  wire(project, ep(source), ep(indicator, 'in')); label(project, ep(indicator, 'in'), 'lamp');
  return { project, source, indicator };
}
function run(project, result) {
  const generated = generateNetlist(project); assert.deepEqual(generated.diagnostics.filter(item => item.severity === 'error'), []);
  const plan = generated.simulation;
  return { id: uid('run'), projectId: project.id, revision: project.revision, projectSnapshot: clone(project), analysis: clone(project.analysis), status: 'completed', result: result ?? mergeEventResults(null, simulateDigital({ ...plan.digital, duration: plan.duration })), measurements: generated.measurements, models: generated.modelManifest, diagnostics: generated.diagnostics, logs: [], netlist: generated.netlist, startedAt: '2026-10-24T13:00:00Z', completedAt: '2026-10-24T13:00:01Z' };
}
const stateOf = (fixture, result, time) => displayStatesForRun(fixture.project, result, time)[fixture.indicator.id];

test('logic indicator is a scalar passive input with versioned educational provenance', () => {
  const part = getPart('DLED');
  assert.equal(part.name, 'Logic state indicator'); assert.equal(part.category, 'Displays'); assert.equal(part.prefix, 'IND');
  assert.deepEqual(getPins('DLED').map(pin => [pin.id, pin.domain, pin.direction, pin.width]), [['in', 'digital', 'input', 1]]);
  assert.equal(MODELS[part.model].version, LOGIC_IO_MODEL_VERSION); assert.equal(MODELS[part.model].license, 'MIT');
  const fixture = circuit('1'), before = compileSimulation(fixture.project), another = add(fixture.project, 'DLED');
  wire(fixture.project, ep(another, 'in'), ep(fixture.source)); const after = compileSimulation(fixture.project);
  assert.deepEqual(after.digital.sources, before.digital.sources); assert.deepEqual(after.digital.gates, before.digital.gates); assert.deepEqual(after.digital.sequential, before.digital.sequential);
  assert.ok(buildDigitalNets(fixture.project).bits.every(bit => bit.drivers.length === 1 && bit.drivers[0].componentId === fixture.source.id));
});

test('red high and dark low come from simulated values, with distinct unknown and high impedance', () => {
  const expected = { '0': ['low', 'LOW', false], '1': ['high', 'HIGH', true], X: ['unknown', 'UNKNOWN', false], Z: ['released', 'HIGH IMPEDANCE', false] };
  for (const [value, [state, caption, on]] of Object.entries(expected)) {
    const fixture = circuit(value), observed = stateOf(fixture, run(fixture.project));
    assert.equal(observed.type, 'DLED'); assert.equal(observed.word, value); assert.equal(observed.value, value); assert.equal(observed.state, state); assert.equal(observed.label, caption); assert.equal(observed.on, on); assert.equal(observed.available, true);
    const markup = logicIndicatorMarkup(observed); assert.match(markup, new RegExp(`data-logic-state="${value}"`));
    assert.equal(markup.includes('class="logic-glow"'), on); assert.equal(markup.includes('fill:#f03c3c'), on);
    assert.match(markup, new RegExp(`aria-label="Logic indicator ${caption}`));
  }
  assert.match(logicIndicatorMarkup({ available: true, word: 'Z', time: 0 }), /stroke-dasharray/);
  assert.equal(logicIndicatorState(null).state, 'unobserved');
  for (const value of [1, 0, '', '10', 'x', 'bad']) assert.throws(() => logicIndicatorState(value), /one literal/);
});

test('a high driver opposed by a low driver resolves to unknown without red glow', () => {
  const fixture = circuit('1'), opponent = add(fixture.project, 'DIN', { state: '0' }); wire(fixture.project, ep(opponent), ep(fixture.source));
  const observed = stateOf(fixture, run(fixture.project)); assert.equal(observed.word, 'X'); assert.equal(observed.state, 'unknown'); assert.equal(observed.on, false);
  assert.ok(!logicIndicatorMarkup(observed).includes('class="logic-glow"'));
});

test('scalar indicators reject direct analog pins and unselected bus words', () => {
  const fixture = circuit(), bus = add(fixture.project, 'BUSIN', { width: '4' }), voltage = add(fixture.project, 'V');
  assert.equal(canConnect(fixture.project, ep(bus), ep(fixture.indicator, 'in')).ok, false);
  assert.equal(canConnect(fixture.project, ep(voltage, 'p'), ep(fixture.indicator, 'in')).ok, false);
});

test('bus slice aliases use the canonical resolved scalar trace even with different net names', () => {
  const fixture = circuit(); fixture.project.circuit.components = fixture.project.circuit.components.filter(c => c.id !== fixture.source.id); delete fixture.project.layout.components[fixture.source.id]; fixture.project.circuit.connections = []; fixture.project.layout.wires = {};
  const source = add(fixture.project, 'BUSIN', { width: '4', value: '1010' }), sliceA = add(fixture.project, 'SLICE', { width: '4', lsb: '1', count: '1' }), sliceB = add(fixture.project, 'SLICE', { width: '4', lsb: '1', count: '1' }), extra = add(fixture.project, 'DLED');
  wire(fixture.project, ep(source), ep(sliceA, 'in')); wire(fixture.project, ep(source), ep(sliceB, 'in')); wire(fixture.project, ep(sliceA), ep(fixture.indicator, 'in')); wire(fixture.project, ep(sliceB), ep(extra, 'in'));
  label(fixture.project, ep(extra, 'in'), 'a_alias');
  const result = run(fixture.project), states = displayStatesForRun(fixture.project, result);
  assert.equal(states[fixture.indicator.id].traceName, 'd(a_alias)'); assert.equal(states[fixture.indicator.id].word, '1'); assert.equal(states[extra.id].word, '1');
});

test('selected-time readback follows exact sparse events and is right-continuous', () => {
  const fixture = circuit(); fixture.source.type = 'PATTERN'; fixture.source.model = getPart('PATTERN').model; fixture.source.ref = 'PAT1'; fixture.source.params = { ...getPart('PATTERN').defaults, width: '1', pattern: '0,0; 1m,1; 2m,X; 3m,Z' };
  const result = run(fixture.project); result.result.vectors.find(vector => vector.name === 'd(lamp)').values.fill('1');
  assert.equal(stateOf(fixture, result, .001 - 1e-12).word, '0'); assert.equal(stateOf(fixture, result, .001).word, '1'); assert.equal(stateOf(fixture, result, .002).word, 'X'); assert.equal(stateOf(fixture, result).word, 'Z');
  for (const time of [-1, NaN, Infinity, .004001]) assert.equal(stateOf(fixture, result, time).available, false);
});

test('missing, stale and failed runs stay neutral instead of displaying a false low or high', () => {
  const fixture = circuit('1'), result = run(fixture.project);
  const initial = stateOf(fixture, null); assert.equal(initial.state, 'unobserved'); assert.equal(initial.word, null); assert.equal(initial.on, false); assert.equal(initial.label, 'NO RESULT');
  for (const mutate of [r => r.projectId = 'other', r => r.revision++, r => r.projectSnapshot.revision++, r => delete r.projectSnapshot, r => r.status = 'failed', r => r.analysis.type = 'ac', r => delete r.result.digitalEvents]) {
    const bad = clone(result); mutate(bad); const state = stateOf(fixture, bad); assert.equal(state.available, false); assert.equal(state.state, 'unobserved'); assert.ok(!logicIndicatorMarkup(state).includes('class="logic-glow"'));
  }
  fixture.project.revision++; assert.equal(stateOf(fixture, result).available, false);
});

test('malformed scalar event evidence cannot light an indicator', () => {
  const fixture = circuit('1'), result = run(fixture.project);
  for (const mutate of [r => r.result.digitalEvents[0].events[0].value = 1, r => r.result.digitalEvents[0].events[0].value = '11', r => r.result.digitalEvents[0].events[0].time = .0001, r => r.result.digitalEvents[0].events.push({ time: 0, value: '0' }), r => r.result.digitalEvents[0].kind = 'bus', r => r.result.digitalEvents.push(clone(r.result.digitalEvents[0])), r => r.result.vectors.find(vector => vector.name === 'd(lamp)').kind = 'bus', r => r.result.vectors.find(vector => vector.name === 'd(lamp)').unit = 'V']) {
    const bad = clone(result); mutate(bad); assert.equal(stateOf(fixture, bad).available, false);
  }
});

test('contradictory scalar metadata and invalid time axes stay unavailable', () => {
  const fixture = circuit('1'), result = run(fixture.project);
  for (const mutate of [r => r.result.digitalEvents[0].width = 8, r => r.result.digitalEvents[0].bitOrder = 'lsb-first', r => r.result.vectors[1].width = 8, r => r.result.vectors[1].bitOrder = 'lsb-first', r => r.result.vectors.push(clone(r.result.vectors[1])), r => r.result.vectors.push(clone(r.result.vectors[0])), r => r.result.vectors[0].unit = 'Hz', r => r.result.vectors[0].values = [0, NaN, .004], r => r.result.vectors[0].values = [0, .003, .002, .004], r => r.result.digitalEvents[0].events[0] = null, r => r.result.vectors = {}]) {
    const bad = clone(result); mutate(bad); assert.equal(stateOf(fixture, bad).available, false);
  }
  result.result.digitalEvents[0].width = 1; result.result.digitalEvents[0].bitOrder = 'msb-first'; result.result.vectors[1].width = 1; result.result.vectors[1].bitOrder = 'msb-first';
  assert.equal(stateOf(fixture, result).on, true, 'explicit compatible scalar metadata remains supported');
});

test('continuous input changes update the actual lamp and retained-window cursor readings', () => {
  const fixture = circuit('0'); fixture.project.analysis.solver = 'coordinated';
  const generated = generateNetlist(fixture.project), session = createCoordinatedSession(compileCoordinated(fixture.project, generated));
  let result = appendContinuousResult(null, session.advanceTo(.001));
  const record = run(fixture.project, result); record.status = 'paused'; assert.equal(stateOf(fixture, record).word, '0');
  session.setInputs([{ id: fixture.source.id, value: '1' }]); result = appendContinuousResult(result, session.advanceTo(.002)); record.result = result; record.status = 'running';
  assert.equal(stateOf(fixture, record, .001 - 1e-12).word, '0'); assert.equal(stateOf(fixture, record, .001).word, '1'); assert.equal(stateOf(fixture, record).on, true);
  session.setInputs([{ id: fixture.source.id, value: '0' }]); record.result = appendContinuousResult(result, session.advanceTo(.003), { windowDuration: .0005 });
  assert.ok(record.result.vectors[0].values[0] > 0); assert.equal(stateOf(fixture, record).word, '0'); assert.equal(stateOf(fixture, record, .001).available, false);
});

test('indicator models and resolved results survive a portable project backup', () => {
  const fixture = circuit('1'), result = run(fixture.project);
  const restored = safeEnvelope(JSON.parse(JSON.stringify({ format: 'CircuitBench', formatVersion: 1, project: fixture.project, runs: [result], activeRunId: result.id })), validateProject);
  assert.equal(displayStatesForRun(restored.project, restored.runs[0])[fixture.indicator.id].word, '1');
  assert.equal(restored.project.circuit.components.find(c => c.id === fixture.indicator.id).model, getPart('DLED').model);
});

test('schematic, result card and standalone SVG retain red high state and accessible text', () => {
  const fixture = circuit('1'), result = run(fixture.project), states = displayStatesForRun(fixture.project, result), editor = Object.create(SchematicEditor.prototype);
  editor.callbacks = { getProject: () => fixture.project, getDisplayStates: () => states }; editor.selection = new Set();
  const rendered = editor.renderComponents(fixture.project, buildNets(fixture.project).endpointToNet);
  assert.match(rendered, /HIGH \(1\)/); assert.match(rendered, /data-logic-state="1" data-glowing="true"/); assert.match(rendered, /digital input pin/);
  const exported = editor.exportSVG(); assert.match(exported, /fill:#f03c3c/); assert.match(exported, /class="logic-glow"/); assert.ok(!exported.includes('var('));
  states[fixture.indicator.id].ref = '<script>unsafe</script>'; const panel = displayPanelMarkup(states);
  assert.match(panel, /Logic indicators/); assert.match(panel, /HIGH \(1\)/); assert.match(panel, /&lt;script&gt;/); assert.ok(!panel.includes('<script>'));
  assert.match(panel, /Cursor A/); assert.match(symbolMarkup('DLED', {}, states[fixture.indicator.id]), /data-logic-state="1"/);
});

test('seven-segment and scalar indicators share the result area without misrendering their widths', () => {
  const fixture = circuit('1'), bus = add(fixture.project, 'BUSIN', { width: '8', value: '00111111' }), seven = add(fixture.project, 'SEG7'); wire(fixture.project, ep(bus), ep(seven, 'in'));
  const states = displayStatesForRun(fixture.project, run(fixture.project)), panel = displayPanelMarkup(states);
  assert.equal(states[seven.id].word, '00111111'); assert.equal(states[seven.id].glyph, '0'); assert.equal(states[fixture.indicator.id].word, '1');
  assert.match(panel, /Seven-segment displays/); assert.match(panel, /Logic indicators/); assert.equal((panel.match(/class="seven-segment-display"/g) ?? []).length, 1); assert.equal((panel.match(/data-logic-state="1"/g) ?? []).length, 1);
});

test('digital source artwork only exposes analog terminals in enabled voltage mode', () => {
  const pure = symbolMarkup('DVS', { state: '0', outputMode: 'logic' }), voltage = symbolMarkup('DVS', { state: '1', outputMode: 'logic-voltage' });
  assert.match(pure, />0 \/ 1</); assert.match(pure, />Q</); assert.ok(!pure.includes('M0 -40'));
  assert.match(voltage, /M0 -40V-24M0 24V40/);
  const editor = Object.create(SchematicEditor.prototype), source = { type: 'DVS', params: { state: '1', outputMode: 'logic-voltage', low: '0', high: '3.3' } };
  assert.equal(editor.componentValue(source, getPart('DVS')), 'Initial HIGH (1) · 0 / 3.3 V');
});
