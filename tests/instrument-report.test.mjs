import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EXAMPLES } from '../src/examples.js';
import { generateNetlist } from '../src/netlist.js';
import { compileCoordinated, createCoordinatedSession } from '../src/coordinated.js';
import { createReport } from '../src/reports.js';
import { newProject } from '../src/model.js';
const hash = value => createHash('sha256').update(value).digest('hex');

test('coordinated report identifies actual integration/plan without claiming ngspice replay settings', () => {
  const project = EXAMPLES.find(example => example.title === 'Closed-loop Schmitt RC oscillator').create(), generated = generateNetlist(project), coordinatedPlan = compileCoordinated(project, generated), session = createCoordinatedSession(coordinatedPlan);
  const result = session.advanceTo(Math.min(coordinatedPlan.duration, .001));
  const run = { id: 'run_report', projectId: project.id, revision: project.revision, projectSnapshot: project, analysis: project.analysis, status: 'completed', startedAt: '2026-10-25T00:00:00Z', result, engine: result.engine, netlist: generated.netlist, simulation: generated.simulation, coordinatedPlan, simulationHash: hash(JSON.stringify(coordinatedPlan)), measurements: generated.measurements, diagnostics: generated.diagnostics, models: generated.modelManifest, logs: result.logs };
  const report = createReport({ project, run, schematic: '', plot: '' });
  assert.match(report, /backward Euler/); assert.match(report, /Exact coordinated execution plan/); assert.match(report, new RegExp(run.simulationHash));
  assert.doesNotMatch(report, /<th>Temperature|<th>Relative tolerance|<th>Absolute tolerances/); assert.doesNotMatch(report, /final analog pass|final ngspice analog pass/);
  assert.match(report, /Not used by the coordinated solver/); assert.match(report, /causal closed-loop feedback/);
});

test('ngspice analog report continues to include its actual tolerance and temperature configuration', () => {
  const project = newProject('Analog provenance'); project.analysis.type = 'op';
  const run = { id: 'run_analog_report', projectSnapshot: project, revision: 0, analysis: project.analysis, status: 'completed', startedAt: '2026-10-25T00:00:00Z', engine: { name: 'ngspice', version: '45.2', mode: 'analog' }, result: { points: 1, vectors: [{ name: 'v(out)', unit: 'V', values: [5] }] }, measurements: [] };
  const report = createReport({ project, run, schematic: '', plot: '' });
  assert.match(report, /<th>Temperature/); assert.match(report, /<th>Relative tolerance/); assert.match(report, /<th>Absolute tolerances/);
  assert.doesNotMatch(report, /Exact coordinated execution plan/); assert.doesNotMatch(report, /<th>Step control/);
});

test('coordinated digital-only report does not describe analog integration settings', () => {
  const project = EXAMPLES.find(example => example.title === 'Digital voltage source and red logic indicators').create();
  project.analysis.solver = 'coordinated';
  const generated = generateNetlist(project), coordinatedPlan = compileCoordinated(project, generated), session = createCoordinatedSession(coordinatedPlan), result = session.advanceTo(Math.min(coordinatedPlan.duration, .001));
  const run = { id: 'run_digital_report', projectId: project.id, revision: project.revision, projectSnapshot: project, analysis: project.analysis, status: 'completed', startedAt: '2026-10-25T00:00:00Z', result, engine: result.engine, netlist: generated.netlist, simulation: generated.simulation, coordinatedPlan, simulationHash: hash(JSON.stringify(coordinatedPlan)), measurements: generated.measurements, diagnostics: generated.diagnostics, logs: result.logs };
  const report = createReport({ project, run, schematic: '', plot: '' });
  assert.doesNotMatch(report, /<th>Integration|<th>Step control|<th>Maximum time step|<th>Temperature/);
  assert.match(report, /Exact coordinated execution plan/);
});

test('restored coordinated report uses result engine identity when run-level metadata is absent', () => {
  const project = EXAMPLES.find(example => example.title === 'Closed-loop Schmitt RC oscillator').create(), generated = generateNetlist(project), coordinatedPlan = compileCoordinated(project, generated), result = createCoordinatedSession(coordinatedPlan).advanceTo(.001);
  const run = { id: 'run_import_report', projectSnapshot: project, revision: project.revision, analysis: project.analysis, status: 'completed', startedAt: '2026-10-25T00:00:00Z', result, simulation: generated.simulation, measurements: generated.measurements, logs: [] };
  const report = createReport({ project, run, schematic: '', plot: '' });
  assert.match(report, /CircuitBench coordinated transient/);
  assert.doesNotMatch(report, /CircuitBench feed-forward coordinator|WebAssembly in a disposable Web Worker/);
});

test('failed coordinated report does not invent an ngspice execution identity', () => {
  const project = EXAMPLES.find(example => example.title === 'Closed-loop Schmitt RC oscillator').create();
  const run = { id: 'run_failed_report', projectSnapshot: project, revision: project.revision, analysis: project.analysis, status: 'failed', startedAt: '2026-10-25T00:00:00Z', error: 'Worker startup failed', logs: [] };
  const report = createReport({ project, run, schematic: '', plot: '' });
  assert.match(report, /Coordinated transient — engine identity not recorded/);
  assert.match(report, /Execution details not recorded/);
  assert.doesNotMatch(report, /CircuitBench feed-forward coordinator|WebAssembly in a disposable Web Worker/);
});
