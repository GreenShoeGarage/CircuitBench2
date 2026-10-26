/** Actual bounded Run/export handlers. Coordinated and digital fixtures execute
 * the production numerical kernels; ngspice export checks make no WASM claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {EXAMPLES} from '../src/examples.js';
import {VERSION, newProject, validateProject} from '../src/model.js';
import {getPins} from '../src/library.js';
import {generateNetlist} from '../src/netlist.js';
import {CoordinatedSession, compileCoordinated} from '../src/coordinated.js';
import {mergeCoordinatedChunks} from '../src/coordinated-results.js';
import {simulateDigital, DIGITAL_ENGINE_INFO} from '../src/digital.js';
import {mergeEventResults} from '../src/simulation.js';
import {ENGINE_INFO} from '../src/engine.js';
import {safeEnvelope, filename, escapeHTML as esc} from '../src/storage.js';

const app = await fs.readFile(new URL('../src/app.js', import.meta.url), 'utf8');
function extract(startText, endText) { const start = app.indexOf(startText), end = app.indexOf(endText, start); assert.ok(start >= 0 && end > start, `Locate actual handler ${startText}`); return app.slice(start, end); }
const actual = [
  extract('const envelope=', '\nfunction endpointDomain('),
  extract('function portableRuns(', '\nfunction renderWorkbenchState('),
  extract('function stopExperiment(', '\nfunction setModeButtons('),
  extract('function runExperiment(', '\nfunction renderResults('),
  extract('function confirmReplace(', '\nfunction showExamples('),
  extract('async function exportWorkingSimulation(', '\nfunction exportProject('),
  extract('function exportProject(', '\nasync function importSpiceFile(')
].join('\n') + '\nglobalThis.envelope=envelope;';
const clone = value => structuredClone(value), digest = value => createHash('sha256').update(value).digest('hex'), flush = () => new Promise(resolve => setImmediate(resolve));
let serial = 0;
function example(id, solver) { const p = EXAMPLES.find(e => e.id === id).create(); if (solver) p.analysis.solver = solver; if (id === 'rc-step') p.analysis.step = '100u'; return p; }
function harness({project = example('rc-step', 'coordinated'), compileFailure = false, hashGate = null} = {}) {
  const state = {downloads: [], messages: [], errors: [], engineCalls: [], hashes: [], saves: [], html: '', renderCount: 0}, nodes = new Map();
  const $ = id => { if (!nodes.has(id)) nodes.set(id, {id, dataset: {}, disabled: false, textContent: '', open: false, close() { this.open = false; }, showModal() { this.open = true; }}); return nodes.get(id); };
  const showDialog = (title, html) => { state.html = html; $('dialog-title').textContent = title; $('dialog').open = true; };
  const engine = {running: false, stop() { this.running = false; return true; }, async run(netlist, {project: snapshot, generated}) {
    state.engineCalls.push({project: clone(snapshot), netlist, generated: clone(generated)}); this.running = true;
    try {
      if (snapshot.analysis.solver === 'coordinated') {
        const plan = compileCoordinated(snapshot, generated), session = new CoordinatedSession(plan); let result = null;
        for (let batches = 0; batches < 100; batches++) { const chunk = session.advanceTo(plan.duration, {maxSteps: 20000}); result = mergeCoordinatedChunks(result, chunk); if (chunk.done) return result; }
        throw new Error('The numerical fixture exceeded its bounded batch count.');
      }
      if (generated.simulation?.mode === 'digital') { const raw = simulateDigital({...generated.simulation.digital, duration: generated.simulation.duration}); return {...mergeEventResults(null, raw), engine: clone(DIGITAL_ENGINE_INFO), warnings: raw.warnings, logs: raw.logs}; }
      throw Object.assign(new Error('This provenance harness deliberately does not execute ngspice WASM.'), {code: 'TEST_WASM_NOT_REQUESTED', status: 'failed'});
    } finally { this.running = false; }
  }};
  let context;
  context = vm.createContext({project, runs: [], activeRunId: null, baselineId: null, captureRecords: [], measurementRecords: [], stepStudies: [], truthTables: [], timingMeasurements: [], analogExperiments: [], continuousRun: null, continuousSession: null, continuousPreparation: null, studyAbort: null, truthTableTask: null, runTask: null, preparing: false, saveState: 'saved', restoredRunIds: new Set(), selection: [], selectedEndpoint: null, constructionEndpoint: null, undoStack: [], redoStack: [], exampleId: null, VERSION, ENGINE_INFO,
    $, showDialog, clone, Date, Map, Set, JSON, Number, performance, engine, uid: prefix => `${prefix}_provenance_app_${++serial}`, getPins, generateNetlist, compileCoordinated: (p, g) => { if (compileFailure) throw Object.assign(new Error('Controlled coordinated compiler failure before execution'), {code: 'COORDINATED_FIXTURE_COMPILE'}); return compileCoordinated(p, g); }, hashText: async value => { state.hashes.push(value); if (hashGate) await hashGate; return digest(value); }, validateProject, newProject, safeEnvelope, filename, esc,
    status: message => state.messages.push(message), handleError: error => state.errors.push(error), renderResults() { state.renderCount++; }, renderContinuousState() {}, renderWorkbenchState() {}, switchTab() {}, render() {}, stopContinuous() {}, editor: {select() {}, setMode() {}, fit() {}}, requestAnimationFrame: fn => fn(), scheduleSave: immediate => state.saves.push({immediate: Boolean(immediate), envelope: clone(context.envelope())}), download: (name, content, type) => state.downloads.push({name, content, type})});
  vm.runInContext(actual, context);
  return {context, state, $, engine};
}

test('bounded coordinated analog Run captures and hashes the actual compiled execution plan', async () => {
  const h = harness(), snapshot = clone(h.context.project), generated = generateNetlist(snapshot), expected = compileCoordinated(snapshot, generated);
  await h.context.runExperiment(); const run = h.context.runs[0];
  assert.ok(['completed', 'completed-with-warnings'].includes(run.status)); assert.equal(h.state.engineCalls.length, 1); assert.deepEqual(clone(run.coordinatedPlan), expected); assert.equal(run.simulationHash, digest(JSON.stringify(expected))); assert.equal(run.netlistHash, digest(generated.netlist)); assert.equal(run.simulation, null); assert.equal(run.result.engine.integration, 'backward Euler'); assert.ok(run.result.points > 20);
  assert.equal(JSON.stringify(h.context.project), JSON.stringify(snapshot)); assert.equal(h.context.preparing, false);
});
test('bounded coordinated mixed Run preserves the digital partition separately from its execution-plan hash', async () => {
  const h = harness({project: example('clock-dac-rc', 'coordinated')}), generated = generateNetlist(h.context.project), expected = compileCoordinated(h.context.project, generated);
  await h.context.executeRun(); const run = h.context.runs[0]; assert.ok(['completed', 'completed-with-warnings'].includes(run.status)); assert.equal(run.simulation.mode, 'mixed'); assert.deepEqual(clone(run.simulation), generated.simulation); assert.deepEqual(clone(run.coordinatedPlan), expected);
  assert.equal(run.simulationHash, digest(JSON.stringify(expected))); assert.notEqual(run.simulationHash, digest(JSON.stringify(run.simulation))); assert.ok(run.result.digitalEvents.length > 0); assert.ok(run.result.vectors.some(v => v.name === 'v(filtered)'));
});
test('coordinated input identity remains attached to the captured revision during working edits', async () => {
  const h = harness(), old = clone(h.context.project), task = h.context.executeRun(); h.context.project.analysis.step = '200u'; h.context.project.revision++;
  await task; const run = h.context.runs[0], expected = compileCoordinated(old, generateNetlist(old)); assert.equal(run.revision, 0); assert.equal(h.context.project.revision, 1); assert.equal(run.projectSnapshot.analysis.step, '100u'); assert.equal(run.coordinatedPlan.maxStep, expected.maxStep); assert.equal(run.simulationHash, digest(JSON.stringify(expected))); assert.equal(h.state.engineCalls[0].project.analysis.step, '100u');
});
test('actual backup export/import retains coordinated plan/hash and immutable run provenance', async () => {
  const h = harness(); await h.context.executeRun(); const run = h.context.runs[0]; h.context.exportProject(); const backup = h.state.downloads.at(-1), normalized = safeEnvelope(JSON.parse(backup.content), validateProject);
  assert.deepEqual(normalized.runs[0].coordinatedPlan, clone(run.coordinatedPlan)); assert.equal(normalized.runs[0].simulationHash, run.simulationHash);
  const target = harness({project: newProject('Empty receiving project')}); await target.context.importProjectFile({size: backup.content.length, text: async () => backup.content}); await flush(); assert.equal(target.context.runs[0].importedFromBackup, true); assert.deepEqual(clone(target.context.runs[0].coordinatedPlan), clone(run.coordinatedPlan)); assert.equal(target.context.runs[0].simulationHash, run.simulationHash);
  const exported = h.context.envelope(); exported.runs[0].coordinatedPlan.maxStep = 123; assert.notEqual(run.coordinatedPlan.maxStep, 123); assert.equal(h.state.engineCalls.length, 1); assert.equal(target.state.engineCalls.length, 0);
});
test('ordinary digital Run continues to hash its native partition and uses actual resolved events', async () => {
  const h = harness({project: example('timing-clock', 'ngspice')}), generated = generateNetlist(h.context.project); await h.context.executeRun(); const run = h.context.runs[0];
  assert.ok(['completed', 'completed-with-warnings'].includes(run.status)); assert.equal(run.coordinatedPlan, undefined); assert.equal(run.simulationHash, digest(JSON.stringify(generated.simulation))); assert.deepEqual(clone(run.simulation), generated.simulation); assert.ok(run.result.digitalEvents.length > 0);
});
test('ordinary mixed ngspice input retains partition hashing even when its numerical runner fails explicitly', async () => {
  const h = harness({project: example('clock-dac-rc', 'ngspice')}), generated = generateNetlist(h.context.project); await h.context.executeRun(); const run = h.context.runs[0];
  assert.equal(run.status, 'failed'); assert.match(run.error, /does not execute ngspice/); assert.equal(run.coordinatedPlan, undefined); assert.equal(run.simulationHash, digest(JSON.stringify(generated.simulation))); assert.equal(run.result, null);
});
test('ordinary analog ngspice input has no fabricated coordinated plan or simulation-plan hash', async () => {
  const h = harness({project: example('rc-step', 'ngspice')}), generated = generateNetlist(h.context.project); await h.context.executeRun(); const run = h.context.runs[0];
  assert.equal(run.status, 'failed'); assert.equal(run.simulation, null); assert.equal(run.coordinatedPlan, undefined); assert.equal(run.simulationHash, undefined); assert.equal(run.netlistHash, digest(generated.netlist)); assert.equal(run.netlist, generated.netlist);
});
test('unsupported coordinated devices and compiler errors stop before workers with diagnostic evidence', async () => {
  const unsupported = harness({project: example('rectifier', 'coordinated')}); await unsupported.context.executeRun(); const invalid = unsupported.context.runs[0]; assert.equal(invalid.status, 'failed'); assert.equal(unsupported.state.engineCalls.length, 0); assert.match(invalid.error, /not supported|unavailable/); assert.equal(invalid.coordinatedPlan, undefined); assert.equal(invalid.result, null);
  const broken = harness({compileFailure: true}); await broken.context.executeRun(); const failed = broken.context.runs[0]; assert.equal(failed.status, 'failed'); assert.equal(broken.state.engineCalls.length, 0); assert.equal(failed.coordinatedPlan, undefined); assert.equal(failed.simulationHash, undefined); assert.ok(failed.diagnostics.some(d => d.code === 'COORDINATED_FIXTURE_COMPILE')); assert.match(failed.error, /compiler failure/);
});
test('standalone coordinated export includes exact execution inputs and their matching hashes', async () => {
  for (const id of ['rc-step', 'clock-dac-rc']) {
    const h = harness({project: example(id, 'coordinated')}), snapshot = clone(h.context.project), generated = generateNetlist(snapshot), plan = compileCoordinated(snapshot, generated), payload = await h.context.exportWorkingSimulation();
    assert.equal(payload.format, 'CircuitBenchSimulationPlan'); assert.deepEqual(clone(payload.coordinatedPlan), plan); assert.equal(payload.simulationHash, digest(JSON.stringify(plan))); assert.equal(payload.simulationHashRole, 'coordinated execution plan'); assert.equal(payload.netlistHash, digest(generated.netlist)); assert.equal(payload.netlist, generated.netlist); assert.deepEqual(clone(payload.project), snapshot); assert.equal(h.state.engineCalls.length, 0);
    assert.match(h.state.downloads[0].name, /-simulation-plan\.json$/); const saved = JSON.parse(h.state.downloads[0].content); assert.equal(saved.simulationHash, digest(JSON.stringify(saved.coordinatedPlan)));
    if (generated.simulation) { assert.deepEqual(clone(payload.simulation), generated.simulation); assert.equal(payload.simulationRole, 'digital/mixed-signal partition'); assert.notEqual(payload.simulationHash, digest(JSON.stringify(payload.simulation))); } else { assert.equal(payload.simulation, null); assert.equal(payload.simulationRole, undefined); }
  }
});
test('standalone export freezes project, compiled plan and matching analog stages before asynchronous hashing', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; }), h = harness({project: example('clock-dac-rc', 'coordinated'), hashGate: gate}), captured = clone(h.context.project);
  const originalStages = ['* completed captured analog pass']; h.context.runs = [{id: 'run_stage_fixture', projectId: captured.id, revision: captured.revision, result: {analogNetlists: originalStages}}];
  const task = h.context.exportWorkingSimulation(); assert.equal(h.state.hashes.length, 2); h.context.project.title = 'Changed while hashing'; h.context.project.analysis.step = '200u'; h.context.project.revision++; originalStages[0] = '* later mutation'; release();
  const payload = await task, expected = compileCoordinated(captured, generateNetlist(captured)); assert.deepEqual(clone(payload.project), captured); assert.deepEqual(clone(payload.coordinatedPlan), expected); assert.equal(payload.simulationHash, digest(JSON.stringify(expected))); assert.deepEqual([...payload.analogNetlists], ['* completed captured analog pass']); assert.ok(!h.state.downloads[0].name.includes('Changed'));
});
test('ordinary digital and mixed exports retain native partition identity while pure analog ngspice exports SPICE', async () => {
  for (const id of ['timing-clock', 'clock-dac-rc']) {
    const h = harness({project: example(id, 'ngspice')}), generated = generateNetlist(h.context.project), payload = await h.context.exportWorkingSimulation(); assert.equal(payload.coordinatedPlan, undefined); assert.deepEqual(clone(payload.simulation), generated.simulation); assert.equal(payload.simulationHash, digest(JSON.stringify(generated.simulation))); assert.equal(payload.simulationHashRole, 'digital/mixed-signal partition'); assert.equal(payload.simulationRole, 'digital/mixed-signal partition');
  }
  const h = harness({project: example('rc-step', 'ngspice')}), expected = generateNetlist(h.context.project).netlist; assert.equal(await h.context.exportWorkingSimulation(), undefined); assert.match(h.state.downloads[0].name, /\.cir$/); assert.equal(h.state.downloads[0].content, expected); assert.equal(h.state.downloads[0].type, 'text/plain'); assert.equal(h.state.hashes.length, 0);
});
test('invalid standalone coordinated export downloads no substitute or fabricated execution plan', async () => {
  for (const h of [harness({project: example('rectifier', 'coordinated')}), harness({compileFailure: true})]) {
    const before = JSON.stringify(h.context.project); await assert.rejects(() => h.context.exportWorkingSimulation(), /circuit errors|compiler failure/); assert.equal(h.state.downloads.length, 0); assert.equal(h.state.engineCalls.length, 0); assert.equal(h.state.hashes.length, 0); assert.equal(JSON.stringify(h.context.project), before); assert.equal(h.context.runs.length, 0);
  }
});
