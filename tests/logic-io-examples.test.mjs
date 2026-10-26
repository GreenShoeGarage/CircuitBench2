import test from 'node:test';
import assert from 'node:assert/strict';
import { LOGIC_IO_EXAMPLES } from '../src/examples-logic-io.js';
import { EXAMPLES } from '../src/examples.js';
import { clone, validateProject, serializeProject, parseProject, buildNets } from '../src/model.js';
import { generateNetlist } from '../src/netlist.js';
import { simulateDigital } from '../src/digital.js';
import { mergeEventResults } from '../src/simulation.js';
import { compileCoordinated, createCoordinatedSession } from '../src/coordinated.js';
import { displayStatesForRun } from '../src/displays.js';
import { safeEnvelope } from '../src/storage.js';

const example = id => LOGIC_IO_EXAMPLES.find(item => item.id === id).create();
function generated(project) { const result = generateNetlist(project); assert.deepEqual(result.diagnostics.filter(item => item.severity === 'error'), []); return result; }
function run(project, result, plan = generated(project)) {
  return { id: `run_${project.id}`, projectId: project.id, revision: project.revision, projectSnapshot: clone(project), analysis: clone(project.analysis), status: 'completed', result,
    measurements: plan.measurements, models: plan.modelManifest, diagnostics: plan.diagnostics, logs: [], netlist: plan.netlist,
    startedAt: '2026-10-25T10:00:00Z', completedAt: '2026-10-25T10:00:01Z' };
}
function simulate(project) {
  const plan = generated(project);
  const result = project.analysis.solver === 'coordinated'
    ? createCoordinatedSession(compileCoordinated(project, plan)).advanceTo(plan.simulation.duration)
    : mergeEventResults(null, simulateDigital({ ...plan.simulation.digital, duration: plan.simulation.duration }));
  return run(project, result, plan);
}
const states = (project, result, time) => Object.values(displayStatesForRun(project, result, time));
const last = (result, name) => result.vectors.find(vector => vector.name === name).values.at(-1);

test('all three source and indicator examples are available once, validate and retain their explicit signal domains', () => {
  assert.equal(LOGIC_IO_EXAMPLES.length, 3);
  for (const item of LOGIC_IO_EXAMPLES) {
    assert.equal(EXAMPLES.filter(other => other.id === item.id).length, 1);
    const project = item.create(), plan = generated(project), network = buildNets(project);
    assert.deepEqual(parseProject(serializeProject(project)), project);
    assert.equal(plan.simulation.mode, item.id === 'digital-voltage-rc' ? 'mixed' : 'digital');
    assert.ok(network.nets.every(net => net.domain === 'digital' || net.domain === 'analog'));
    assert.ok(project.circuit.components.some(component => component.type === 'DLED'));
    assert.ok(project.probes.some(probe => probe.kind === 'logic'));
  }
});

test('binary source and inverter example produces complementary actual indicator states for both settings', () => {
  const project = example('digital-voltage-source'), source = project.circuit.components.find(component => component.type === 'DVS');
  for (const value of ['0', '1']) {
    source.params.state = value; const result = simulate(project), observed = states(project, result);
    assert.deepEqual(observed.map(state => state.value), [value, value === '0' ? '1' : '0']);
    assert.deepEqual(observed.map(state => state.on), [value === '1', value === '0']);
    assert.ok(observed.every(state => state.available));
  }
});

test('live source changes preserve the inverter delay and indicator observations on the same advancing timeline', () => {
  const project = example('digital-voltage-source'); project.analysis.solver = 'coordinated';
  const plan = generated(project), source = project.circuit.components.find(component => component.type === 'DVS');
  const session = createCoordinatedSession(compileCoordinated(project, plan));
  session.advanceTo(.001); session.setInputs([{ id: source.id, value: '0' }]);
  const early = session.advanceTo(.001 + 5e-9);
  assert.deepEqual(states(project, run(project, early, plan)).map(state => state.value), ['0', '0']);
  const settled = session.advanceTo(.001 + 20e-9);
  assert.deepEqual(states(project, run(project, settled, plan)).map(state => state.value), ['0', '1']);
  assert.equal(settled.inputTimeline.length, 1);
  assert.equal(settled.inputTimeline[0].time, .001);
  assert.equal(source.params.state, '1', 'Live changes do not rewrite the captured initial circuit.');
});

test('voltage example separates digital command, stored capacitor voltage and Schmitt indicator timing', () => {
  const project = example('digital-voltage-rc'), plan = generated(project);
  const session = createCoordinatedSession(compileCoordinated(project, plan));
  const charged = session.advanceTo(.005), recorded = run(project, charged, plan);
  assert.deepEqual(states(project, recorded, 0).map(state => state.value), ['1', '0']);
  assert.deepEqual(states(project, recorded).map(state => state.value), ['1', '1']);
  assert.equal(last(charged, 'v(drive)'), 5);
  assert.ok(Math.abs(last(charged, 'v(sense)') - 5 * (1 - Math.exp(-5))) < .002);
  const threshold = charged.digitalEvents.find(trace => trace.name === 'd(threshold)').events.find(event => event.value === '1');
  assert.ok(threshold.time > .0012 && threshold.time < .00122, `Schmitt threshold crossing: ${threshold.time}`);
  const source = project.circuit.components.find(component => component.type === 'DVS');
  session.setInputs([{ id: source.id, value: '0' }]);
  const boundary = session.advanceTo(.005);
  assert.deepEqual(states(project, run(project, boundary, plan)).map(state => state.value), ['0', '1']);
  assert.equal(last(boundary, 'v(sense)'), last(charged, 'v(sense)'), 'The capacitor keeps its charge at the live change.');
  const discharged = session.advanceTo(.01);
  assert.deepEqual(states(project, run(project, discharged, plan)).map(state => state.value), ['0', '0']);
  assert.equal(last(discharged, 'v(drive)'), 0);
  assert.ok(last(discharged, 'v(sense)') < .04);
});

test('four-state pattern example displays exactly one red high in each interval and honors event boundaries', () => {
  const project = example('logic-indicator-states'), result = simulate(project), sequence = ['1', '0', 'X', 'Z'];
  for (let interval = 0; interval <= 4; interval++) {
    const observed = states(project, result, interval * .001);
    assert.deepEqual(observed.map(state => state.value), sequence.map((_, index) => sequence[(index + interval) % 4]));
    assert.equal(observed.filter(state => state.on).length, 1);
    assert.equal(observed.find(state => state.on).value, '1');
  }
  assert.deepEqual(states(project, result, .001 - 1e-12).map(state => state.value), sequence);
  assert.deepEqual(states(project, result, .001).map(state => state.value), ['0', 'X', 'Z', '1']);
});

test('portable backups preserve actual source, voltage and four-state indicator observations', () => {
  for (const item of LOGIC_IO_EXAMPLES) {
    const project = item.create(), result = simulate(project), before = states(project, result);
    const restored = safeEnvelope(JSON.parse(JSON.stringify({ format: 'CircuitBench', formatVersion: 1, project, runs: [result], activeRunId: result.id })), validateProject);
    assert.equal(restored.runs.length, 1, item.id);
    assert.deepEqual(states(restored.project, restored.runs[0]).map(state => ({ value: state.value, on: state.on, label: state.label })), before.map(state => ({ value: state.value, on: state.on, label: state.label })), item.id);
  }
});
