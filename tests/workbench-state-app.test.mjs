/** Actual app handlers, real state/display readers and digital/coordinated
 * kernels. Only the DOM, worker transport and async boundaries are controlled. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {diagnosticHTML} from '../src/construction-ui.js';
import { EXAMPLES } from '../src/examples.js';
import { VERSION, newProject, validateProject, setComponentParams } from '../src/model.js';
import { getPart, getPins, MODELS, parseValue, parseLogicWord } from '../src/library.js';
import { generateNetlist } from '../src/netlist.js';
import { simulateDigital } from '../src/digital.js';
import { mergeEventResults } from '../src/simulation.js';
import { compileCoordinated, createCoordinatedSession } from '../src/coordinated.js';
import { ContinuousSimulation } from '../src/continuous.js';
import { ENGINE_INFO } from '../src/engine.js';
import { displayStatesForRun, displayPanelMarkup } from '../src/displays.js';
import {LiveInputController,describeSourceControl,sourcePreferencesHTML} from '../src/live-controls.js';
import { digitalSourceControlHTML, digitalSourceOutputLabel } from '../src/logic-source-ui.js';
import { describeWorkbenchState, workbenchStateHTML, bindWorkbenchState } from '../src/workbench-state.js';
import { formatNumber, formatTraceValue, getRunTraces } from '../src/plots.js';
import { escapeHTML as esc } from '../src/storage.js';

const source = await fs.readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const copy = structuredClone;
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function actualFunction(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `Find actual ${name}`);
  const next = source.slice(start + 1).search(/\n(?:async )?function [A-Za-z_$]/);
  assert.ok(next >= 0, `Find end of actual ${name}`);
  return source.slice(start, start + next + 1);
}
const actual = [
  'commit', 'restoreHistory', 'stopExperiment', 'replaceProject', 'fieldHTML', 'digitalSourceControl', 'setDigitalSourceState', 'getLiveInputController', 'liveSourceState',
  'renderSelection', 'portableRuns', 'renderWorkbenchState', 'renderDisplayReadouts', 'renderContinuousState', 'stepContinuous',
  'startContinuous', 'stopContinuous', 'runExperiment', 'executeRun', 'trimRunBudget', 'renderResults', 'switchTab'
].map(actualFunction).join('\n');
let serial = 0;

function harness({ workerGate = null, inputGate = null, hashGate = null, advanceGate = null } = {}) {
  const project = validateProject(EXAMPLES.find(example => example.id === 'digital-voltage-source').create());
  project.analysis.solver = 'coordinated';
  const sourcePart = project.circuit.components.find(component => component.type === 'DVS');
  const nodes = new Map(), document = { activeElement: null, querySelectorAll: () => [] };
  const state = { messages: [], errors: [], saves: 0, drawCalls: 0, editorRenders: 0, stops: 0, starts: 0, inputs: [], lastResult: null };
  const makeNode = (id = '', attrs = '') => {
    const node = { id, textContent: '', hidden: false, disabled: /\bdisabled\b/.test(attrs), checked: true, value: '', dataset: {}, writes: 0,
      listeners: new Map(), children: [], isConnected: true, open: false, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {},
      addEventListener(name, callback) { this.listeners.set(name, callback); }, removeEventListener(name, callback) { if (this.listeners.get(name) === callback) this.listeners.delete(name); },
      hasAttribute(name) { return attrs.includes(name); }, focus() { document.activeElement = this; }, contains(child) { return this.children.includes(child); },
      click() { if (!this.disabled) { this.onclick?.(); this.listeners.get('click')?.(); } }, close() { this.open = false; },
      querySelectorAll(selector) { const match = selector.match(/^\[data-([\w-]+)\]$/); if (!match) return []; const key = match[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()); return this.children.filter(child => Object.hasOwn(child.dataset, key)); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    };
    for (const [, name, value = ''] of attrs.matchAll(/\bdata-([\w-]+)(?:="([^"]*)")?/g)) node.dataset[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
    Object.defineProperty(node, 'innerHTML', { get: () => node.html ?? '', set(html) {
      this.html = html; this.writes++; this.children = [];
      for (const [, tag, childAttrs] of html.matchAll(/<(button|input|select)\b([^>]*)>/g)) {
        const child = makeNode(childAttrs.match(/\bid="([^"]+)"/)?.[1] ?? '', childAttrs); child.tagName = tag.toUpperCase();
        this.children.push(child); if (child.id) nodes.set(child.id, child);
      }
    } });
    return node;
  };
  const $ = id => { if (!nodes.has(id)) nodes.set(id, makeNode(id)); return nodes.get(id); };
  let context;
  class LocalEngine {
    constructor() { this.active = null; this.busy = false; }
    async start(plan) { state.starts++; this.active = createCoordinatedSession(plan); }
    async advanceTo(end, options) {
      this.busy = true;
      try { if (advanceGate) await advanceGate.promise; if (!this.active) throw new Error('Session closed.'); return this.active.advanceTo(end, options); }
      finally { this.busy = false; }
    }
    async setInputs(updates) { state.inputs.push(copy(updates)); if (inputGate) await inputGate.promise; if (!this.active) throw new Error('Session closed before input confirmation.'); return this.active.setInputs(updates); }
    close() { this.active = null; }
    stop() { state.stops++; this.active = null; }
  }
  class TestContinuous extends ContinuousSimulation { constructor(options) { super({ ...options, engine: new LocalEngine(), intervalMs: 60000 }); } }
  const engine = { running: false, async run(netlist, { generated }) {
    this.running = true;
    state.lastResult = mergeEventResults(null, simulateDigital({ ...generated.simulation.digital, duration: generated.simulation.duration }));
    try { return workerGate ? await workerGate.promise : state.lastResult; } finally { this.running = false; }
  }, stop() { state.stops++; this.running = false; return true; } };
  const plot = { cursors: [null, null], baseline: null, setRun(run) { this.run = run; }, draw() { state.drawCalls++; } };
  const editor = { render() { state.editorRenders++; }, select(ids) { context.selection = Array.isArray(ids) ? ids : [ids]; }, setMode() {}, fit() {} };
  context = vm.createContext({ diagnosticHTML,bindDiagnosticNavigation(){},renderInstrumentState(){},renderCaptureState(){}, captureRecords:[],measurementRecords:[],stepStudies:[], project, liveInputController:null, LiveInputController, describeSourceControl, sourcePreferencesHTML, renderLiveControls(){}, runs: [], truthTables: [], timingMeasurements: [], analogExperiments: [], restoredRunIds: new Set(), workbenchStateCleanup() {}, lastWorkbenchMarkup: '',
    studyAbort: null, continuousPreparation: null, continuousSession: null, continuousRun: null, continuousSaveAt: 0, activeRunId: null, baselineId: null,
    selection: [], undoStack: [], redoStack: [], selectedEndpoint: null, exampleId: null, runTask: null, preparing: false, truthTableTask: null, saveState: 'saved',
    $, document, plot, editor, engine, VERSION, ENGINE_INFO, newProject, validateProject, setComponentParams, getPart, getPins, MODELS, parseValue, parseLogicWord,
    generateNetlist, compileCoordinated, ContinuousSimulation: TestContinuous, clone: copy, structuredClone, Date, Map, Set, Number, JSON, Promise, performance,
    uid: prefix => `${prefix}_state_app_${++serial}`, hashText: () => hashGate ? hashGate.promise : Promise.resolve('a'.repeat(64)),
    describeWorkbenchState, workbenchStateHTML, bindWorkbenchState, displayStatesForRun, displayPanelMarkup, digitalSourceControlHTML, digitalSourceOutputLabel,
    formatNumber, displayTraceValue: formatTraceValue, getRunTraces, getTimingSignals: () => [], esc,
    scheduleSave() { state.saves++; }, status: message => state.messages.push(message), handleError: error => state.errors.push(error), requestAnimationFrame: callback => callback(),
    render() { context.renderResults(); context.renderContinuousState(); context.renderDisplayReadouts(); },
    hasDigital: value => value.circuit.components.some(component => getPins(component).some(pin => pin.domain === 'digital')),
    activeRun: () => context.runs.find(run => run.id === context.activeRunId) ?? context.runs.at(-1), baseline: () => context.runs.find(run => run.id === context.baselineId)
  });
  const stepBinding = source.match(/\$\('continuous-step'\)\.onclick=[^;]+;/)?.[0];
  assert.ok(stepBinding, 'Find actual Step button binding');
  vm.runInContext(actual + '\n' + stepBinding, context);
  const run = async () => { await context.runExperiment(); return context.activeRun(); };
  const start = async () => context.startContinuous({ chunkDuration: 0.0001, windowDuration: 0.002, autoRun: false });
  const html = () => $('workbench-state').innerHTML;
  return { context, state, $, document, plot, sourcePart, project, engine, run, start, html, stop: () => context.stopContinuous() };
}

test('actual result and selection renderers keep the persistent strip and DVS initial state current', async () => {
  const h = harness(); h.context.renderResults(); assert.match(h.html(), />Editing</);
  await h.run(); assert.match(h.html(), />Results ready</); assert.match(h.html(), /Latest ·/);
  h.context.selection = [h.sourcePart.id]; h.context.renderSelection();
  assert.match(h.html(), /Initial HIGH \(1\)/); assert.doesNotMatch(h.html(), /Live drive/);
  h.context.selection = []; h.context.renderSelection(); assert.doesNotMatch(h.html(), /workbench-source/);
});

test('the actual Return to latest action clears only Cursor A and never changes or resumes simulation', async () => {
  const h = harness(); const run = await h.run(); h.plot.cursors = [0.0001, 0.0002]; h.context.renderDisplayReadouts();
  const button = h.$('workbench-state').querySelector('[data-workbench-latest]'), before = JSON.stringify({ project: h.context.project, runs: h.context.runs });
  const saves = h.state.saves, stops = h.state.stops;
  assert.ok(button); button.click();
  assert.equal(h.plot.cursors[0], null); assert.equal(h.plot.cursors[1], 0.0002);
  assert.equal(h.context.activeRunId, run.id); assert.equal(h.context.continuousSession, null);
  assert.equal(JSON.stringify({ project: h.context.project, runs: h.context.runs }), before);
  assert.equal(h.state.saves, saves); assert.equal(h.state.stops, stops); assert.ok(h.state.drawCalls > 0);
  assert.match(h.html(), /Latest ·/); assert.equal(h.$('workbench-state').querySelector('[data-workbench-latest]'), null);
});

test('unchanged renders retain keyboard focus and changed state cleans up old view-action listeners', async () => {
  const h = harness(); await h.run(); h.plot.cursors[0] = 0.0001; h.context.renderDisplayReadouts();
  const box = h.$('workbench-state'), old = box.querySelector('[data-workbench-latest]'); old.focus(); const writes = box.writes;
  h.context.renderContinuousState(); assert.equal(box.writes, writes); assert.equal(h.document.activeElement, old);
  h.plot.cursors[0] = 0.0002; h.context.renderDisplayReadouts();
  const next = box.querySelector('[data-workbench-latest]'); assert.notEqual(next, old); assert.equal(old.listeners.size, 0);
  assert.equal(h.document.activeElement, next); assert.equal(next.listeners.size, 1);
});

test('actual history selection can show an older run while the retained continuous session remains paused', async t => {
  const h = harness(), prior = await h.run(); await h.start(); t.after(() => h.stop());
  const session = h.context.continuousSession; await session.step(); const liveId = h.context.continuousRun.id;
  h.context.renderResults(); const historyButton = h.$('runs-panel').querySelectorAll('[data-view-run]').find(button => button.dataset.viewRun === prior.id);
  assert.ok(historyButton); historyButton.click();
  assert.equal(h.context.activeRunId, prior.id); assert.equal(h.context.continuousRun.id, liveId); assert.equal(session.state, 'paused');
  assert.match(h.html(), />Paused</); assert.match(h.html(), /separate continuous run is active/);
  assert.equal(h.state.stops, 0);
});

test('async bounded-run completion after an edit shows its captured revision without lighting current indicators', async () => {
  const gate = pending(), h = harness({ workerGate: gate }), task = h.context.runExperiment();
  assert.match(h.html(), />Running</); await settle(); assert.equal(h.engine.running, true);
  const captured = h.context.activeRun();
  h.context.commit(project => { project.notes = 'Changed while computing'; }, 'Edit during run');
  assert.equal(h.context.project.revision, captured.revision + 1);
  gate.resolve(h.state.lastResult); await task;
  assert.equal(h.context.preparing, false); assert.equal(h.engine.running, false);
  assert.match(h.html(), />Showing saved result</); assert.match(h.html(), /another project or revision/);
  h.context.renderDisplayReadouts(); assert.doesNotMatch(h.$('display-readouts').innerHTML, /data-glowing="true"/);
  assert.equal(captured.projectSnapshot.notes.includes('Changed while computing'), false);
});

test('replacement tracks restored run identities without adding persistence-schema fields', async () => {
  const h = harness(), run = await h.run(), saved = copy(run), snapshot = JSON.stringify(saved);
  await h.context.replaceProject(copy(h.project), 'Restored', [saved], { activeRunId: saved.id });
  assert.equal(h.context.restoredRunIds.has(saved.id), true); assert.match(h.html(), />Showing saved result</);
  assert.equal(JSON.stringify(saved), snapshot); assert.equal(JSON.stringify(h.context.portableRuns()[0]), snapshot);
  await h.context.replaceProject(newProject('Fresh circuit'), 'Fresh');
  assert.equal(h.context.restoredRunIds.size, 0); assert.match(h.html(), />Editing</);
});

test('actual paused source controls show last confirmed drive until acknowledgement and retain initial state', async t => {
  const gate = pending(), h = harness({ inputGate: gate }); await h.start(); t.after(() => h.stop());
  const session = h.context.continuousSession; await session.step(); h.context.selection = [h.sourcePart.id]; h.context.renderSelection();
  const before = JSON.stringify(h.context.project), task = h.context.setDigitalSourceState(h.sourcePart.id, '0');
  assert.match(h.html(), /Initial HIGH \(1\)/); assert.match(h.html(), /Live drive HIGH \(1\)/);
  await settle(); assert.match(h.html(), /last confirmed setting/);
  gate.resolve(); await task;
  assert.equal(session.state, 'paused'); assert.match(h.html(), /Live drive LOW \(0\)/); assert.match(h.html(), /Step or Resume/);
  assert.equal(JSON.stringify(h.context.project), before); assert.equal(session.inputChanges.length, 1);
  await session.step(); h.context.renderDisplayReadouts(); assert.match(h.$('display-readouts').innerHTML, /data-state="low"/);
});

test('a late input response from an ended session cannot replace the new session state strip', async t => {
  const gate = pending(), h = harness({ inputGate: gate }); await h.start(); t.after(() => h.stop());
  await h.context.continuousSession.step(); h.context.selection = [h.sourcePart.id];
  const old = h.context.continuousSession, task = h.context.setDigitalSourceState(h.sourcePart.id, '0');
  await settle(); h.stop(); await h.start(); const current = h.context.continuousSession;
  gate.resolve(); assert.equal((await task).cancelled, true);
  assert.notEqual(current, old); assert.equal(h.context.continuousSession, current); assert.equal(current.state, 'paused');
  assert.equal(current.inputChanges.length, 0); assert.match(h.html(), /Live drive HIGH \(1\)/);
  assert.doesNotMatch(h.html(), /Live drive LOW/); assert.equal(h.state.messages.some(message => /set LOW/.test(message)), false);
});

test('stopping through the actual lifecycle converts the strip to a non-resumable saved window', async () => {
  const h = harness(); await h.start(); await h.context.continuousSession.step();
  assert.match(h.html(), />Paused</); h.stop();
  assert.equal(h.context.continuousRun, null); assert.match(h.html(), />Showing saved result</);
  assert.match(h.html(), /Start a new continuous session/); assert.equal(h.$('continuous-panel').hidden, true);
});

test('the Step button finishes with an idle paused strip after publishing a completed update', async t => {
  const gate = pending(), h = harness({ advanceGate: gate }); await h.start(); t.after(() => h.stop());
  const session = h.context.continuousSession, task = h.$('continuous-step').onclick();
  const disabledDuring = h.$('continuous-step').disabled, textDuring = h.html();
  gate.resolve(); await task;
  assert.equal(session.inFlight, null); assert.equal(session.state, 'paused'); assert.ok(Math.abs(session.time - 0.0001) < 1e-15);
  assert.doesNotMatch(h.html(), /Advancing one step/);
  assert.match(h.html(), /Step or Resume continues this session/);
  assert.equal(h.$('continuous-step').disabled, false);
  assert.equal(disabledDuring, true); assert.match(textDuring, /Advancing one step/);
});

test('a stopped Step finishing after a new session starts cannot repaint or report errors for that new session', async t => {
  const gate = pending(), h = harness({ advanceGate: gate }); await h.start(); t.after(() => h.stop());
  const old = h.context.continuousSession, task = h.$('continuous-step').onclick(); await settle();
  h.stop(); await h.start(); const current = h.context.continuousSession, currentMarkup = h.html();
  gate.resolve(); await task;
  assert.notEqual(current, old); assert.equal(h.context.continuousSession, current);
  assert.equal(current.time, 0); assert.equal(current.state, 'paused');
  assert.equal(h.html(), currentMarkup); assert.equal(h.state.errors.length, 0);
});
