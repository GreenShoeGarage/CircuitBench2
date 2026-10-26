/** Actual application study handlers with controlled DOM/worker boundaries.
 * Numerical WASM acceptance and browser rendering have their own checks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { EXAMPLES } from '../src/examples.js';
import { VERSION, newProject, validateProject } from '../src/model.js';
import { getPins, parseValue } from '../src/library.js';
import { generateNetlist } from '../src/netlist.js';
import { safeEnvelope, filename, escapeHTML as esc } from '../src/storage.js';
import { createReport } from '../src/reports.js';
import { runExperiment as runAnalogStudy, retainExperimentRecords, experimentCSV, experimentEvidenceJSON, experimentChoices } from '../src/experiments.js';
import { experimentSetupHTML, bindExperimentForm, readExperimentForm, experimentResultHTML, experimentHistoryHTML } from '../src/experiments-ui.js';

const app = await fs.readFile(new URL('../src/app.js', import.meta.url), 'utf8');
function extract(startText, endText) { const start = app.indexOf(startText), end = app.indexOf(endText, start); assert.ok(start >= 0 && end > start, `Locate actual app function ${startText}`); return app.slice(start, end); }
const actual = [
  extract('const envelope=', '\nfunction endpointDomain('),
  extract('function commit(', '\nfunction restoreHistory('),
  extract('function stopExperiment(', '\nfunction setModeButtons('),
  extract('function portableRuns(', '\nfunction renderDisplayReadouts('),
  extract('function showAnalogExperiments(', '\nfunction runExperiment('),
  extract('function confirmReplace(', '\nfunction showExamples('),
  extract('function exportProject(', '\nasync function importSpiceFile('),
  extract('function showReport(', '\nfunction showHelp('),
  extract("$('new-btn').onclick=", "\n$('recover-btn').onclick=")
].join('\n') + '\nglobalThis.envelope=envelope;';
const clone = value => structuredClone(value), flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const decode = value => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[entity]));
let serial = 0;

function harness({ project = EXAMPLES.find(item => item.id === 'divider').create(), records = [], workerDeferred = false, hashDeferred = false, ignoreStop = false, failIndices = [] } = {}) {
  const state = { html: '', messages: [], errors: [], saves: [], downloads: [], reportCalls: [], workerRuns: 0, stops: 0, executed: [], renders: 0 }, nodes = new Map(), workerGate = deferred(), hashGate = deferred();
  const baseIds = ['dialog', 'dialog-title', 'dialog-content', 'run-btn', 'stop-btn', 'continuous-btn', 'experiments-btn', 'truth-table-btn', 'new-btn', 'duplicate-project-btn'];
  function makeNode(tag = 'div', attrs = '', content = '') {
    const dataset = {}, listeners = {};
    for (const [, key, value] of attrs.matchAll(/\bdata-([\w-]+)(?:="([^"]*)")?/g)) dataset[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = decode(value ?? '');
    const node = { tagName: tag.toUpperCase(), dataset, listeners, value: decode(attrs.match(/\bvalue="([^"]*)"/)?.[1] ?? ''), textContent: decode(content), checked: /\bchecked\b/.test(attrs), disabled: /\bdisabled\b/.test(attrs), hidden: /\bhidden\b/.test(attrs), open: false, children: [], ids: [],
      addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener: name => { delete listeners[name]; }, close() { this.open = false; }, showModal() { this.open = true; }, contentWindow: { focus() {}, print() { state.printed = true; } } };
    if (tag === 'select') { node.options = [...content.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(([, a, label]) => ({ value: decode(a.match(/\bvalue="([^"]*)"/)?.[1] ?? ''), selected: /\bselected\b/.test(a), textContent: decode(label) })); node.value = (node.options.find(option => option.selected) ?? node.options[0])?.value ?? ''; }
    node.querySelectorAll = selector => { const match = selector.match(/^\[data-([\w-]+)(?:="([^"]*)")?\]$/); if (!match) return []; const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); return node.children.filter(child => Object.hasOwn(child.dataset, key) && (match[2] === undefined || child.dataset[key] === match[2])); };
    node.querySelector = selector => selector.startsWith('#') ? nodes.get(selector.slice(1)) ?? null : node.querySelectorAll(selector)[0] ?? null;
    Object.defineProperty(node, 'innerHTML', { get: () => node._html ?? '', set: html => {
      for (const id of node.ids) if (!baseIds.includes(id)) nodes.delete(id); node.ids = []; node.children = []; node._html = html;
      for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/g)) { const [, childTag, a] = match, id = a.match(/\bid="([^"]+)"/)?.[1]; if (!id && !/\bdata-/.test(a)) continue; const inner = html.slice(match.index + match[0].length).split(`</${childTag}>`)[0], child = makeNode(childTag, a, inner); node.children.push(child); if (id) { nodes.set(id, child); node.ids.push(id); } }
    } });
    return node;
  }
  for (const id of baseIds) nodes.set(id, makeNode());
  const $ = id => nodes.get(id) ?? null;
  const showDialog = (title, html) => { state.html = html; $('dialog-title').textContent = title; $('dialog-content').innerHTML = html; $('dialog').open = true; };
  const engine = { running: false, run(netlist, { project: trialProject }) {
    const index = state.workerRuns++; state.executed.push(clone(trialProject));
    if (this.running) return Promise.reject(new Error('A simulation is already running.'));
    this.running = true;
    const resistors = trialProject.circuit.components.filter(item => item.type === 'R'), [top, bottom] = resistors.map(item => parseValue(item.params.value, 'Ω')), voltage = parseValue(trialProject.circuit.components.find(item => item.type === 'V').params.dc, 'V');
    const result = { points: 1, vectors: [{ name: 'v(mid)', unit: 'V', values: [voltage * bottom / (top + bottom)] }], engine: { name: 'Analytic app harness; not the production engine', version: '1' }, logs: [], warnings: [] }; state.lastResult = result;
    const task = failIndices.includes(index) ? Promise.reject(new Error('Fixture convergence failure')) : workerDeferred && index === 0 ? workerGate.promise : Promise.resolve(result);
    return task.finally(() => { this.running = false; });
  }, stop() { state.stops++; const wasRunning = this.running; if (wasRunning && !ignoreStop) { this.running = false; workerGate.reject(Object.assign(new Error('Active trial cancelled'), { status: 'cancelled' })); } return wasRunning; } };
  let context;
  context = vm.createContext({ captureRecords:[],measurementRecords:[],stepStudies:[], project, runs: [], truthTables: [], timingMeasurements: [], analogExperiments: records, studyAbort: null, continuousPreparation: null, continuousSession: null, continuousRun: null, activeRunId: null, baselineId: null, selection: [], undoStack: [], redoStack: [], selectedEndpoint: null, exampleId: null, runTask: null, preparing: false, truthTableTask: null, reportHTML: '', reportURL: null, VERSION,
    $, showDialog, engine, clone, Date, Map, Set, Number, JSON, Blob, AbortController, URL: { createObjectURL: () => 'blob:experiment-app-test', revokeObjectURL() {} },
    uid: prefix => `${prefix}_study_app_${++serial}`, newProject, validateProject, getPins, generateNetlist, safeEnvelope, filename, esc,
    runAnalogStudy, retainExperimentRecords, experimentCSV, experimentEvidenceJSON, experimentChoices, experimentSetupHTML, bindExperimentForm, readExperimentForm, experimentResultHTML, experimentHistoryHTML,
    hashText: () => hashDeferred ? hashGate.promise : Promise.resolve('a'.repeat(64)),
    createReport: options => { state.reportCalls.push(options); return createReport(options); },
    scheduleSave: immediate => state.saves.push({ immediate: Boolean(immediate), envelope: clone(context.envelope()) }),
    render() { state.renders++; }, renderContinuousState() {}, stopContinuous() { state.stoppedContinuous = true; },
    editor: { select() {}, setMode() {}, fit() {}, exportSVG: () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }, plot: { baseline: null, getSVG: () => '<svg></svg>' },
    requestAnimationFrame: fn => fn(), status: message => state.messages.push(message), handleError: error => state.errors.push(error), download: (name, content, type) => state.downloads.push({ name, content, type })
  });
  vm.runInContext(actual + "\n$('stop-btn').onclick=stopExperiment;", context);
  const setup = () => { context.showAnalogExperiments(); const target = context.project.circuit.components.find(item => item.type === 'R'); if ($('experiment-target')) { $('experiment-target').value = target.id + ':value'; $('experiment-start').value = '10k'; $('experiment-stop').value = '30k'; $('experiment-count').value = '3'; $('experiment-signal').value = 'node:mid'; $('experiment-measurement').value = 'final'; } };
  const start = () => { setup(); $('study-run').onclick(); return context.runTask; };
  return { context, state, $, engine, setup, start, workerGate, hashGate };
}

test('the app runs a sequential study from its captured project without changing circuit revision', async () => {
  const h = harness(), before = JSON.stringify(h.context.project); await h.start();
  assert.equal(h.state.errors.length, 0); assert.equal(h.state.workerRuns, 3); assert.equal(h.context.analogExperiments.length, 1); assert.equal(JSON.stringify(h.context.project), before);
  const record = h.context.analogExperiments[0]; assert.equal(record.summary.measuredCount, 3); assert.deepEqual(record.trials.map(trial => trial.measurement.value), [5, 10 / 3, 2.5]);
  assert.equal(h.context.preparing, false); assert.equal(h.context.studyAbort, null); assert.equal(h.state.saves.length, 1); assert.match(h.state.html, /3 measured/);
});

test('working edits while a study runs cannot change later trial inputs or the captured revision', async () => {
  const h = harness({ workerDeferred: true }), task = h.start(); await flush();
  h.context.commit(p => { p.notes = 'Later edit'; p.circuit.components.find(item => item.type === 'V').params.dc = '20'; }, 'Edited');
  h.workerGate.resolve(h.state.lastResult); await task;
  assert.equal(h.context.project.revision, 1); assert.equal(h.context.project.circuit.components.find(item => item.type === 'V').params.dc, '20');
  const record = h.context.analogExperiments[0]; assert.equal(record.revision, 0); assert.notEqual(record.projectSnapshot.notes, 'Later edit');
  assert.ok(h.state.executed.every(p => p.circuit.components.find(item => item.type === 'V').params.dc === '10')); assert.match(h.state.html, /working circuit has changed/);
});

test('an invalid setup never starts workers or overwrites study history', () => {
  const h = harness(); h.setup(); h.$('experiment-count').value = '1000'; h.$('study-run').onclick();
  assert.equal(h.state.workerRuns, 0); assert.equal(h.context.analogExperiments.length, 0); assert.equal(h.context.preparing, false); assert.equal(h.$('experiment-error').hidden, false); assert.match(h.$('experiment-error').textContent, /64/);
});

test('ineligible empty or invalid analog circuits do not expose a dead Run study action', () => {
  const h = harness({ project: newProject() }); h.context.showAnalogExperiments();
  assert.equal(h.$('study-run'), null); assert.match(h.state.html, /Place components|Add a component/);
});

test('a second queued activation cannot replace the active study task or cancellation controller', async () => {
  const h = harness({ workerDeferred: true }); h.setup(); const button = h.$('study-run'); button.onclick(); const task = h.context.runTask, abort = h.context.studyAbort; button.onclick();
  try { assert.equal(h.context.runTask, task); assert.equal(h.context.studyAbort, abort); } finally { await flush(); h.workerGate.resolve(h.state.lastResult); await task; }
  assert.equal(h.state.workerRuns, 3); assert.equal(h.context.analogExperiments.length, 1);
});

test('modal Stop cancels an active worker and retains an explicit partial study', async () => {
  const h = harness({ workerDeferred: true }), task = h.start(); await flush(); h.$('study-stop').onclick(); await task;
  assert.equal(h.state.workerRuns, 1); assert.ok(h.state.stops >= 1); const record = h.context.analogExperiments[0];
  assert.equal(record.status, 'cancelled'); assert.equal(record.summary.cancelledCount, 1); assert.equal(record.summary.notRunCount, 2); assert.equal(record.trials[0].measurement, undefined); assert.equal(h.context.studyAbort, null);
});

test('global Stop during input hashing prevents additional trials and ignores the late hash result', async () => {
  const h = harness({ hashDeferred: true }), task = h.start(); await flush(); assert.equal(h.state.workerRuns, 1); h.$('stop-btn').onclick(); await task;
  const before = JSON.stringify(h.context.analogExperiments); h.hashGate.resolve('a'.repeat(64)); await flush();
  assert.equal(h.state.workerRuns, 1); assert.equal(JSON.stringify(h.context.analogExperiments), before); assert.equal(h.context.analogExperiments[0].status, 'cancelled');
});

test('a late successful worker response after Stop cannot append completed evidence', async () => {
  const h = harness({ workerDeferred: true, ignoreStop: true }), task = h.start(); await flush(); h.$('study-stop').onclick(); await task;
  const before = JSON.stringify(h.context.analogExperiments), saves = h.state.saves.length; h.workerGate.resolve(h.state.lastResult); await flush();
  assert.equal(JSON.stringify(h.context.analogExperiments), before); assert.equal(h.state.saves.length, saves); assert.equal(h.context.analogExperiments[0].summary.measuredCount, 0);
});

test('replacement waits for cancellation and clears only the departing project history', async () => {
  const h = harness({ workerDeferred: true }); const task = h.start(); await flush(); const next = newProject('Replacement'); await h.context.replaceProject(next, 'Replaced'); await task;
  assert.equal(h.context.project.id, next.id); assert.equal(h.context.analogExperiments.length, 0); assert.equal(h.context.preparing, false); assert.equal(h.state.workerRuns, 1); assert.equal(h.state.saves.at(-1).envelope.project.id, next.id);
});

test('failed trial handling continues later values and retains a clean completed-errors record', async () => {
  const h = harness({ failIndices: [1] }); await h.start(); const record = h.context.analogExperiments[0];
  assert.equal(record.status, 'completed-with-errors'); assert.equal(record.summary.measuredCount, 2); assert.equal(record.summary.failedCount, 1); assert.equal(record.summary.mean, 3.75); assert.equal(record.trials[1].measurement, undefined);
  assert.equal(h.state.errors.length, 0); assert.match(h.state.html, /Fixture convergence failure/);
});

test('history navigation and CSV/JSON exports preserve independent study evidence', async () => {
  const h = harness(); await h.start(); const record = h.context.analogExperiments[0]; h.context.showAnalogExperiments(); const button = h.$('dialog-content').querySelectorAll('[data-experiment-history]')[0];
  assert.equal(button.dataset.experimentHistory, record.id); button.onclick(); h.$('study-csv').onclick(); h.$('study-json').onclick();
  assert.match(h.state.downloads[0].content, /"Trial","Status"/); assert.equal(JSON.parse(h.state.downloads[1].content).experiment.id, record.id); assert.equal(h.context.runs.length, 0);
});

test('exported project backup reopens with restored notices and survives another export/import', async () => {
  const h = harness(); await h.start(); h.context.exportProject(); const backup = h.state.downloads.at(-1), saved = safeEnvelope(JSON.parse(backup.content), validateProject);
  assert.equal(saved.analogExperiments.length, 1); const target = harness({ project: newProject() }); await target.context.importProjectFile({ size: backup.content.length, text: async () => backup.content });
  assert.equal(target.context.analogExperiments.length, 1); assert.equal(target.context.analogExperiments[0].importedFromBackup, true); target.context.showAnalogExperimentRecord(target.context.analogExperiments[0]); assert.match(target.state.html, /circuits have not been simulated again/);
  target.context.exportProject(); assert.equal(safeEnvelope(JSON.parse(target.state.downloads.at(-1).content), validateProject).analogExperiments[0].importedFromBackup, true);
});

test('study-only content retains backup confirmation and Cancel preserves the record', async () => {
  const h = harness(); await h.start(); h.context.project = newProject(); let replaced = false; const before = JSON.stringify(h.context.analogExperiments);
  h.context.confirmReplace('Replace?', () => { replaced = true; }); assert.equal(replaced, false); assert.match(h.state.html, /analog experiments/); h.$('confirm-backup').onclick(); assert.equal(JSON.parse(h.state.downloads.at(-1).content).analogExperiments.length, 1);
  h.$('confirm-cancel').onclick(); assert.equal(replaced, false); assert.equal(JSON.stringify(h.context.analogExperiments), before);
});

test('envelope and restored project histories are deep copies', async () => {
  const h = harness(); await h.start(); const record = h.context.analogExperiments[0], envelope = h.context.envelope(); envelope.analogExperiments[0].trials[0].source.real[0] = 999;
  assert.equal(record.trials[0].source.real[0], 5); const incoming = clone(record); await h.context.replaceProject(h.context.project, 'Reopened', [], { analogExperiments: [incoming] }); incoming.trials[0].source.real[0] = 99;
  assert.equal(h.context.analogExperiments[0].trials[0].source.real[0], 5);
});

test('duplicate projects start a new study history while the exported backup preserves it', async () => {
  const h = harness(); await h.start(); h.context.exportProject(); const backup = JSON.parse(h.state.downloads.at(-1).content), id = h.context.project.id; h.$('duplicate-project-btn').onclick(); await flush();
  assert.notEqual(h.context.project.id, id); assert.equal(h.context.analogExperiments.length, 0); assert.equal(backup.analogExperiments.length, 1); assert.equal(backup.analogExperiments[0].projectId, id);
});

test('removing a saved study updates history without changing the schematic', async () => {
  const h = harness(); await h.start(); const before = JSON.stringify(h.context.project); h.$('study-remove').onclick();
  assert.equal(h.context.analogExperiments.length, 0); assert.equal(JSON.stringify(h.context.project), before); assert.equal(h.$('dialog-title').textContent, 'Advanced analog experiments');
});

test('reports include all saved studies without requiring retained full run records', async () => {
  const h = harness(); await h.start(); h.context.project.revision++; h.context.showReport();
  assert.equal(h.state.reportCalls.at(-1).analogExperiments.length, 1); assert.match(h.context.reportHTML, /Analog parameter experiments/); assert.match(h.context.reportHTML, /3 measured/); assert.match(h.context.reportHTML, /captured revision/); assert.equal(h.$('report-frame').srcdoc, h.context.reportHTML);
});

test('the seventh completed study preserves the newest record and discloses eviction', async () => {
  const h = harness(), ids = []; for (let i = 0; i < 7; i++) { await h.start(); ids.push(h.context.analogExperiments.at(-1).id); }
  assert.equal(h.context.analogExperiments.length, 6); assert.equal(h.context.analogExperiments[0].id, ids[1]); assert.equal(h.context.analogExperiments.at(-1).id, ids[6]); assert.match(h.state.messages.at(-1), /1 older study records removed/);
});
