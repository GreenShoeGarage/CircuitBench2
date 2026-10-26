/** Execute actual application handlers with a controlled DOM and actual
 * coordinated numerical sessions. Browser rendering has separate acceptance. */
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
import {sliceCaptureResult, createCaptureRecord} from '../src/capture.js';
import {safeEnvelope, filename, escapeHTML as esc} from '../src/storage.js';
import {createReport} from '../src/reports.js';
import {getRunTraces, getAxis} from '../src/plots.js';
import {busBitTraceId} from '../src/plot-signals.js';
import {normalizeMeasurementSpec} from '../src/measurements.js';
import {createMeasurementRecord, retainMeasurementRecords, createMeasurementPreset, validateMeasurementPresets, measurementCSV, measurementEvidenceJSON} from '../src/measurement-evidence.js';
import {measurementSetupHTML, updateMeasurementSetup, readMeasurementSetup, measurementResultHTML, measurementHistoryHTML} from '../src/measurements-ui.js';
import {runStepStudy, retainStepStudyRecords, stepStudyCSV, stepStudyEvidenceJSON} from '../src/step-study.js';
import {stepStudySetupHTML, updateStepStudySetup, readStepStudySetup, stepStudyResultHTML, stepStudyHistoryHTML} from '../src/step-study-ui.js';

const app = await fs.readFile(new URL('../src/app.js', import.meta.url), 'utf8');
function extract(startText, endText) { const start = app.indexOf(startText), end = app.indexOf(endText, start); assert.ok(start >= 0 && end > start, `Locate actual handler ${startText}`); return app.slice(start, end); }
const actual = [
  extract('const envelope=', '\nfunction endpointDomain('),
  extract('function portableRuns(', '\nfunction renderDisplayReadouts('),
  extract('function commit(', '\nfunction restoreHistory('),
  extract('function stopExperiment(', '\nfunction setModeButtons('),
  extract('function retainEvidenceRun(', '\nfunction viewCapture('),
  extract('function showStepStudies(', '\nfunction runExperiment('),
  extract('function measurementSourceRun(', '\nfunction showTimingMeasurements('),
  extract('function confirmReplace(', '\nfunction showExamples('),
  extract('function exportProject(', '\nasync function importSpiceFile('),
  extract('function showReport(', '\nfunction showHelp(')
].join('\n') + '\nglobalThis.envelope=envelope;';
const clone = value => structuredClone(value), flush = () => new Promise(resolve => setImmediate(resolve));
const hash = value => createHash('sha256').update(value).digest('hex');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const decode = value => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'"}[e]));
let serial = 0;
function projectFixture() { const p = EXAMPLES.find(e => e.id === 'rc-step').create(); p.analysis.solver = 'coordinated'; p.analysis.step = '100u'; return p; }
function numericalRun(project = projectFixture(), id = `run_app_fixture_${++serial}`) {
  const generated = generateNetlist(project), plan = compileCoordinated(project, generated), session = new CoordinatedSession(plan), result = session.advanceTo(plan.duration, {maxSteps: 20000});
  return {id, projectId: project.id, revision: project.revision, projectSnapshot: clone(project), analysis: clone(project.analysis), startedAt: '2020-01-01T00:00:00.000Z', completedAt: '2020-01-01T00:00:01.000Z', status: 'completed', netlist: generated.netlist, netlistHash: hash(generated.netlist), simulationHash: hash(JSON.stringify(plan)), coordinatedPlan: plan, engine: result.engine, measurements: generated.measurements, models: generated.modelManifest, diagnostics: generated.diagnostics, logs: result.logs, result};
}
function captureFixture() {
  const run = numericalRun(), plan = run.coordinatedPlan, session = new CoordinatedSession(plan), trigger = {kind: 'analog', signal: 'v(out)', edge: 'rising', threshold: 0.5}, first = session.advanceTo(plan.duration, {maxSteps: 20000, trigger}), second = session.advanceTo(plan.duration, {maxSteps: 20000}), merged = mergeCoordinatedChunks(first, second), result = sliceCaptureResult(merged, 0);
  return createCaptureRecord(run, {status: 'complete', event: first.halt, result, request: {mode: 'capture', trigger, before: first.halt.time, after: plan.duration - first.halt.time, search: plan.duration}}, {id: `capture_app_${++serial}`});
}
function harness({run = numericalRun(), project = clone(run.projectSnapshot), records = [], captures = [], emptyRuns = false, workerDeferred = false, ignoreStop = false, failIndices = []} = {}) {
  const state = {html: '', messages: [], errors: [], saves: [], downloads: [], reportCalls: [], workerRuns: 0, stops: 0, executed: [], renders: 0}, nodes = new Map(), gate = deferred();
  const baseIds = ['dialog', 'dialog-title', 'dialog-content', 'results', 'results-toggle'];
  function makeNode(tag = 'div', attrs = '', content = '') {
    const dataset = {}, attributes = new Map(), classes = new Set((attrs.match(/\bclass="([^"]*)"/)?.[1] ?? '').split(' '));
    for (const [, key, value] of attrs.matchAll(/\bdata-([\w-]+)(?:="([^"]*)")?/g)) dataset[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = decode(value ?? '');
    const node = {tagName: tag.toUpperCase(), dataset, value: decode(attrs.match(/\bvalue="([^"]*)"/)?.[1] ?? ''), textContent: decode(content), checked: /\bchecked\b/.test(attrs), disabled: /\bdisabled\b/.test(attrs), hidden: /\bhidden\b/.test(attrs), open: false, children: [], ids: [], classList: {add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v)}, setAttribute: (k, v) => attributes.set(k, v), getAttribute: k => attributes.get(k), hasAttribute: key => new RegExp(`\\b${key}(?:=|\\s|$)`).test(attrs), close() { this.open = false; }, showModal() { this.open = true; }, contentWindow: {focus() {}, print() { state.printed = true; }}};
    if (tag === 'select') { node.options = [...content.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(([, a, label]) => ({value: decode(a.match(/\bvalue="([^"]*)"/)?.[1] ?? ''), selected: /\bselected\b/.test(a), textContent: decode(label)})); node.value = (node.options.find(o => o.selected) ?? node.options[0])?.value ?? ''; }
    node.querySelectorAll = selector => { if (selector === 'input,select') return node.children.filter(c => ['INPUT', 'SELECT'].includes(c.tagName)); const match = selector.match(/^\[data-([\w-]+)\]$/); if (!match) return []; const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase()); return node.children.filter(c => Object.hasOwn(c.dataset, key)); };
    node.querySelector = selector => selector.startsWith('#') ? nodes.get(selector.slice(1)) ?? null : node.querySelectorAll(selector)[0] ?? null;
    Object.defineProperty(node, 'innerHTML', {get: () => node._html ?? '', set: html => { for (const id of node.ids) if (!baseIds.includes(id)) nodes.delete(id); node.ids = []; node.children = []; node._html = html; for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/g)) { const [, childTag, a] = match, id = a.match(/\bid="([^"]+)"/)?.[1]; if (!id && !/\bdata-/.test(a)) continue; const inner = html.slice(match.index + match[0].length).split(`</${childTag}>`)[0], child = makeNode(childTag, a, inner); node.children.push(child); if (id) { nodes.set(id, child); node.ids.push(id); } } }});
    return node;
  }
  for (const id of baseIds) nodes.set(id, makeNode()); const $ = id => nodes.get(id) ?? null;
  const showDialog = (title, html) => { state.html = html; $('dialog-title').textContent = title; $('dialog-content').innerHTML = html; $('dialog').open = true; };
  const engine = {running: false, run(netlist, {project: trialProject, generated}) { const index = state.workerRuns++; state.executed.push(clone(trialProject)); if (this.running) return Promise.reject(new Error('Concurrent solver request')); this.running = true; const plan = compileCoordinated(trialProject, generated), session = new CoordinatedSession(plan), result = session.advanceTo(plan.duration, {maxSteps: 20000}); state.lastResult = result; const pending = failIndices.includes(index) ? Promise.reject(new Error('App numerical failure fixture')) : workerDeferred && index === 0 ? gate.promise : Promise.resolve(result); return pending.finally(() => { this.running = false; }); }, stop() { state.stops++; const wasRunning = this.running; if (wasRunning && !ignoreStop) { this.running = false; gate.reject(Object.assign(new Error('App worker cancelled'), {status: 'cancelled'})); } return wasRunning; }};
  const plot = {selected: new Set(), cursors: [null, null], unit: 'V', range: null, baseline: null, render() {}, draw() {}, setRange(a, b) { this.range = [a, b]; }, expandBus() {}, getSVG: () => '<svg></svg>'};
  let context;
  context = vm.createContext({project, runs: emptyRuns ? [] : [run], activeRunId: emptyRuns ? null : run.id, baselineId: null, continuousRun: null, continuousSession: null, continuousPreparation: null, captureRecords: captures, measurementRecords: records, stepStudies: [], truthTables: [], timingMeasurements: [], analogExperiments: [], studyAbort: null, preparing: false, runTask: null, truthTableTask: null, restoredRunIds: new Set(), selection: [], selectedEndpoint: null, constructionEndpoint: null, undoStack: [], redoStack: [], exampleId: null, reportHTML: '', reportURL: null,
    $, showDialog, engine, plot, clone, Date, Map, Set, Number, JSON, Blob, AbortController, VERSION, Math, URL: {createObjectURL: () => 'blob:instrument-app-test', revokeObjectURL() {}}, uid: prefix => `${prefix}_app_${++serial}`, newProject, validateProject, getPins, generateNetlist, filename, esc, safeEnvelope, getRunTraces, getAxis, busBitTraceId,
    createMeasurementRecord, retainMeasurementRecords, createMeasurementPreset, validateMeasurementPresets, measurementCSV, measurementEvidenceJSON, normalizeMeasurementSpec, measurementSetupHTML, updateMeasurementSetup, readMeasurementSetup, measurementResultHTML, measurementHistoryHTML, runStepStudy, retainStepStudyRecords, stepStudyCSV, stepStudyEvidenceJSON, stepStudySetupHTML, updateStepStudySetup, readStepStudySetup, stepStudyResultHTML, stepStudyHistoryHTML,
    hashText: async value => hash(value), createReport: options => { state.reportCalls.push(options); return createReport(options); }, scheduleSave: immediate => state.saves.push({immediate: Boolean(immediate), envelope: clone(context.envelope())}), render() { state.renders++; }, renderResults() {}, renderContinuousState() {}, renderDisplayReadouts() {}, switchTab() {}, stopContinuous() {}, editor: {select() {}, setMode() {}, fit() {}, exportSVG: () => '<svg></svg>'}, requestAnimationFrame: fn => fn(), status: message => state.messages.push(message), handleError: error => state.errors.push(error), download: (name, content, type) => state.downloads.push({name, content, type})});
  vm.runInContext(actual, context);
  const setup = selectedRun => { context.showInstrumentMeasurements(selectedRun); if ($('measurement-signal')) $('measurement-signal').value = 'node:out'; };
  const measure = () => { $('measurement-run').onclick(); return context.measurementRecords.at(-1); };
  const savePreset = () => { setup(); $('measurement-preset-name').value = 'RC rise'; $('measurement-save-preset').onclick(); return context.project.measurementPresets.at(-1); };
  const study = () => { if (!context.project.measurementPresets.length) savePreset(); context.showStepStudies(); $('step-study-count').value = '3'; $('step-study-relative').value = '2'; $('step-study-run').onclick(); return context.runTask; };
  return {context, state, $, run, engine, plot, gate, setup, measure, savePreset, study};
}

test('measurement setup owns its captured run when the active run and source arrays later change', () => {
  const h = harness(), expected = h.run.result.vectors.find(v => v.name === 'v(out)').values[1]; h.setup(); const other = numericalRun(h.context.project); h.context.runs.push(other); h.context.activeRunId = other.id;
  h.run.result.vectors.find(v => v.name === 'v(out)').values[1] = 123; h.context.commit(p => { p.notes = 'Later working note'; }, 'Edit');
  const record = h.measure(); assert.equal(h.state.errors.length, 0); assert.equal(record.sourceRunId, h.run.id); assert.equal(record.revision, 0); assert.equal(record.source.vectors[0].values[1], expected); assert.match(h.state.html, /working circuit has changed/);
});
test('measurement activation refuses a replaced project and preserves the old draft', () => {
  const h = harness(); h.setup(); h.context.project = newProject('Replacement'); h.measure(); assert.equal(h.context.measurementRecords.length, 0); assert.match(h.$('measurement-error').textContent, /project was replaced/); assert.equal(h.state.saves.length, 0);
});
test('actual preset handlers save, load and delete exact settings without changing electrical revision', () => {
  const h = harness(), circuit = JSON.stringify(h.context.project.circuit), preset = h.savePreset(); assert.equal(h.context.project.revision, 0); assert.equal(JSON.stringify(h.context.project.circuit), circuit);
  h.$('measurement-low').value = '20'; h.$('measurement-preset').value = preset.id; h.$('measurement-load-preset').onclick(); assert.equal(h.$('measurement-low').value, '10'); assert.equal(h.$('measurement-high').value, '90');
  const record = h.measure(), frozen = JSON.stringify(record); h.context.showInstrumentMeasurements(); h.$('measurement-preset').value = preset.id; h.$('measurement-delete-preset').onclick(); assert.equal(h.context.project.measurementPresets.length, 0); assert.equal(JSON.stringify(record), frozen);
});
test('invalid measurement windows do not append or autosave evidence', () => {
  const h = harness(); h.setup(); h.$('measurement-end').value = '10'; h.measure(); assert.equal(h.context.measurementRecords.length, 0); assert.equal(h.state.saves.length, 0); assert.match(h.$('measurement-error').textContent, /inside the saved/); assert.equal(h.$('measurement-end').value, '10');
});
test('active continuous windows require an explicit immutable snapshot before measurement', () => {
  const h = harness(), run = h.run; run.result = sliceCaptureResult(run.result, 0); delete run.result.continuous.sessionStatus; run.status = 'paused'; run.completedAt = null; h.context.continuousRun = run; const before = JSON.stringify(run);
  h.setup(); assert.equal(h.$('measurement-run'), null); h.$('measurement-snapshot').onclick(); assert.equal(h.context.runs.length, 2); assert.equal(h.context.activeRunId, run.id); assert.equal(JSON.stringify(run), before);
  const snapshot = h.context.runs.at(-1); assert.equal(snapshot.result.continuous.sessionStatus, 'snapshot'); h.$('measurement-signal').value = 'node:out'; const record = h.measure(); assert.equal(record.sourceRunId, snapshot.id); assert.notEqual(record.sourceRunId, run.id); assert.equal(record.sourceRun.continuous.sessionStatus, 'snapshot');
  run.result.vectors[1].values[1] += 1; assert.notEqual(run.result.vectors[1].values[1], snapshot.result.vectors[1].values[1]);
});
test('capture-only source measurements and interval viewing preserve capture ownership', () => {
  const capture = captureFixture(), h = harness({run: capture.run, captures: [capture], emptyRuns: true}), before = JSON.stringify(capture); h.setup(capture.run); const record = h.measure(); assert.equal(record.sourceRunId, capture.run.id); assert.equal(h.context.runs.length, 0);
  h.context.viewInstrumentInterval(record, 0); assert.equal(h.context.runs.length, 1); assert.equal(h.context.activeRunId, capture.run.id); assert.notEqual(h.context.runs[0], capture.run); assert.equal(JSON.stringify(capture), before); h.context.runs[0].label = 'User view label'; assert.equal(JSON.stringify(capture), before);
});
test('AC measurement interval navigation supplies logarithmic range coordinates and raw frequency cursors', () => {
  const h = harness(), project = clone(h.context.project); project.analysis.type = 'ac'; project.analysis.solver = 'ngspice'; const generated = generateNetlist(project), run = {...h.run, id: 'run_ac_view', projectSnapshot: project, analysis: clone(project.analysis), netlist: generated.netlist, engine: {name: 'Complex transfer reference fixture', version: '1'}, measurements: [{id: 'out', label: 'Output', vector: 'v(out)', unit: 'V'}, {id: 'in', label: 'Input', vector: 'v(in)', unit: 'V'}], result: {points: 3, vectors: [{name: 'frequency', unit: 'Hz', values: [1, 100, 10000]}, {name: 'v(out)', unit: 'V', values: [1, 0.5, 0.1], imag: [0, 0, 0]}, {name: 'v(in)', unit: 'V', values: [1, 1, 1], imag: [0, 0, 0]}]}};
  const record = createMeasurementRecord(run, {kind: 'transfer-gain', mode: 'ac', signal: 'out', reference: 'in', frequency: 100, window: {start: 1, end: 10000}}, {validateProject}); h.context.runs = [run]; h.context.viewInstrumentInterval(record, 0);
  assert.deepEqual([...h.plot.cursors], [100, 100]); assert.ok(h.plot.range[0] < 2 && h.plot.range[1] > 2 && h.plot.range[1] < 3);
});
test('measurement source removal leaves exports, backup/import and report evidence intact', async () => {
  const h = harness(); h.setup(); const record = h.measure(); h.context.runs = []; h.context.activeRunId = null; h.context.showInstrumentRecord(record); h.$('measurement-csv').onclick(); h.$('measurement-evidence').onclick(); assert.match(h.state.downloads[0].content, /Source run ID/); assert.equal(JSON.parse(h.state.downloads[1].content).measurement.sourceRunId, record.sourceRunId);
  h.context.exportProject(); const backup = h.state.downloads.at(-1), checked = safeEnvelope(JSON.parse(backup.content), validateProject); assert.equal(checked.measurementRecords.length, 1);
  const target = harness({project: newProject(), emptyRuns: true}); await target.context.importProjectFile({size: backup.content.length, text: async () => backup.content}); await flush(); assert.equal(target.context.measurementRecords[0].importedFromBackup, true); assert.equal(target.context.runs.length, 0);
  target.context.showReport(); assert.match(target.context.reportHTML, /Instrument measurements/); assert.equal(target.state.reportCalls.at(-1).measurementRecords[0].id, record.id);
});
test('real app step-study handler runs fresh coordinated trials and retains immutable initial settings', async () => {
  const h = harness(); h.savePreset(); const before = JSON.stringify(h.context.project); await h.study(); assert.equal(h.state.errors.length, 0); assert.equal(h.state.workerRuns, 3); assert.equal(h.context.stepStudies.length, 1); const record = h.context.stepStudies[0]; assert.equal(record.summary.measuredCount, 3); assert.equal(JSON.stringify(h.context.project), before); assert.equal(h.context.studyAbort, null); assert.equal(h.context.preparing, false);
  assert.deepEqual(h.state.executed.map(p => p.analysis.step), record.trials.map(t => String(t.step))); assert.match(h.state.html, /3 of 3 trials yielded/);
});
test('working edits during a pending step trial do not change any later independent trial input', async () => {
  const h = harness({workerDeferred: true}), task = h.study(); await flush(); const originalR = h.context.project.circuit.components.find(c => c.type === 'R').params.value; h.context.commit(p => { p.circuit.components.find(c => c.type === 'R').params.value = '20k'; }, 'Edit'); h.gate.resolve(h.state.lastResult); await task;
  assert.equal(h.context.project.revision, 1); assert.equal(h.context.stepStudies[0].revision, 0); assert.ok(h.state.executed.every(p => p.circuit.components.find(c => c.type === 'R').params.value === originalR)); assert.match(h.state.html, /working circuit has changed/);
});
test('duplicate study activation and Stop cannot publish a late successful trial', async () => {
  const h = harness({workerDeferred: true, ignoreStop: true}); h.savePreset(); h.context.showStepStudies(); const button = h.$('step-study-run'); button.onclick(); const task = h.context.runTask, abort = h.context.studyAbort; button.onclick(); assert.equal(h.context.runTask, task); assert.equal(h.context.studyAbort, abort); await flush(); h.$('step-study-stop').onclick(); await task;
  const before = JSON.stringify(h.context.stepStudies); assert.equal(h.context.stepStudies[0].status, 'cancelled'); assert.equal(h.context.stepStudies[0].summary.measuredCount, 0); h.gate.resolve(h.state.lastResult); await flush(); assert.equal(JSON.stringify(h.context.stepStudies), before); assert.equal(h.state.workerRuns, 1);
});
test('project replacement waits for a cancelled study before clearing departing evidence', async () => {
  const h = harness({workerDeferred: true}), task = h.study(); await flush(); const replacement = newProject('Replacement'); await h.context.replaceProject(replacement, 'Replaced'); await task;
  assert.equal(h.context.project.id, replacement.id); assert.equal(h.context.stepStudies.length, 0); assert.equal(h.context.measurementRecords.length, 0); assert.equal(h.context.preparing, false); assert.equal(h.state.saves.at(-1).envelope.project.id, replacement.id);
});
test('failed app study cases remain explicit and nested trial evidence exports/reopens independently', async () => {
  const h = harness({failIndices: [1]}); await h.study(); const record = h.context.stepStudies[0]; assert.equal(record.status, 'completed-with-errors'); assert.equal(record.summary.failedCount, 1); assert.equal(record.comparisons[1].status, 'unavailable');
  h.$('dialog-content').querySelectorAll('[data-step-study-trial]')[0].onclick(); h.$('step-trial-csv').onclick(); h.$('step-trial-evidence').onclick(); assert.equal(JSON.parse(h.state.downloads.at(-1).content).measurement.id, record.trials[0].measurement.id); h.$('step-trial-back').onclick(); h.$('step-study-evidence').onclick(); assert.equal(JSON.parse(h.state.downloads.at(-1).content).study.id, record.id);
  h.context.exportProject(); const backup = h.state.downloads.at(-1), target = harness({project: newProject(), emptyRuns: true}); await target.context.importProjectFile({size: backup.content.length, text: async () => backup.content}); await flush(); assert.equal(target.context.stepStudies[0].importedFromBackup, true); assert.equal(target.context.stepStudies[0].trials[0].measurement.sourceRun.importedFromBackup, false); target.context.showReport(); assert.match(target.context.reportHTML, /Time-step sensitivity/);
});
test('envelopes deep-copy measurement/study samples and deleting one record preserves the circuit and other histories', async () => {
  const h = harness(); h.setup(); const measurement = h.measure(); await h.study(); const study = h.context.stepStudies[0], beforeProject = JSON.stringify(h.context.project), exported = h.context.envelope(); exported.measurementRecords[0].source.vectors[0].values[0] = 999; exported.stepStudies[0].trials[0].measurement.source.vectors[0].values[0] = 999;
  assert.notEqual(measurement.source.vectors[0].values[0], 999); assert.notEqual(study.trials[0].measurement.source.vectors[0].values[0], 999); h.context.showInstrumentRecord(measurement); h.$('measurement-remove').onclick(); assert.equal(h.context.measurementRecords.length, 0); assert.equal(h.context.stepStudies.length, 1); assert.equal(JSON.stringify(h.context.project), beforeProject);
});
