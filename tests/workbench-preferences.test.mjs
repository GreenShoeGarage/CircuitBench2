import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, addComponent, validateProject, removeItems, setComponentParams } from '../src/model.js';
import { safeEnvelope } from '../src/storage.js';
import { createMeasurementPreset } from '../src/measurement-evidence.js';

test('source workbench preferences survive backup without changing initial values or revision', () => {
  const project = newProject(), source = addComponent(project, 'DVS');
  project.workbench = { pinnedSources: [source.id], momentarySources: [source.id] };
  const restored = safeEnvelope(JSON.parse(JSON.stringify({ project })), validateProject).project;
  assert.deepEqual(restored.workbench, project.workbench); assert.equal(restored.circuit.components[0].params.state, source.params.state); assert.equal(restored.revision, project.revision);
});

test('deleted and no-longer-adjustable sources are pruned without dropping valid controls', () => {
  const p = newProject(), a = addComponent(p, 'DVS'), b = addComponent(p, 'V');
  p.workbench = { pinnedSources: [a.id, b.id], momentarySources: [a.id] };
  removeItems(p, [a.id]); assert.deepEqual(p.workbench, { pinnedSources: [b.id], momentarySources: [] });
  setComponentParams(p, b.id, { waveform: 'sin' }); assert.deepEqual(p.workbench, { pinnedSources: [], momentarySources: [] });
});

test('old projects receive empty preferences and malformed/oversized control lists are rejected', () => {
  const p = newProject(); delete p.workbench; delete p.measurementPresets;
  assert.deepEqual(validateProject(p).workbench, { pinnedSources: [], momentarySources: [] }); assert.deepEqual(validateProject(p).measurementPresets, []);
  const source = addComponent(p, 'DVS');
  for (const pinnedSources of [[source.id, source.id], [null], Array.from({ length: 33 }, (_, i) => `source_${i}`)]) assert.throws(() => validateProject({ ...p, workbench: { pinnedSources } }));
  const bus = addComponent(p, 'BUSIN'); p.workbench = { pinnedSources: [bus.id], momentarySources: [bus.id, source.id] };
  assert.deepEqual(validateProject(p).workbench.momentarySources, [source.id]);
});

test('measurement presets are portable project configuration with bounded, validated identities', () => {
  const p = newProject(), spec = { kind: 'rise-time', signal: 'output', window: { start: 0, end: .01 }, levels: { mode: 'absolute', start: .1, end: .9 } };
  const preset = createMeasurementPreset('Edge check', spec);
  p.measurementPresets = [preset];
  assert.deepEqual(safeEnvelope({ project: p }, validateProject).project.measurementPresets, [preset]);
  assert.throws(() => validateProject({ ...p, measurementPresets: Array(17).fill(preset) }), /16/);
});
