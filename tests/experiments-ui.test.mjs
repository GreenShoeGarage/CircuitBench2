import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/examples.js';
import { generateNetlist } from '../src/netlist.js';
import { experimentChoices, runExperiment } from '../src/experiments.js';
import { experimentSetupHTML, bindExperimentForm, readExperimentForm, experimentResultHTML, experimentHistoryHTML } from '../src/experiments-ui.js';

const project = id => EXAMPLES.find(example => example.id === id).create();
const decode = text => text.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
function form(html) {
  const fields = new Map(), node = extra => ({ ...extra, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; }, removeEventListener(name) { delete this.listeners[name]; } });
  for (const [, tag, attrs] of html.matchAll(/<(input|p|fieldset)\b([^>]*)>/g)) {
    const id = attrs.match(/\bid="([^"]+)"/)?.[1], tolerance = attrs.match(/\bdata-experiment-tolerance(?:="([^"]*)")?/), percent = attrs.match(/\bdata-experiment-percent="([^"]*)"/), sweep = /\bdata-experiment-sweep\b/.test(attrs);
    const entry = node({ tagName: tag.toUpperCase(), value: decode(attrs.match(/\bvalue="([^"]*)"/)?.[1] ?? ''), checked: /\bchecked\b/.test(attrs), disabled: /\bdisabled\b/.test(attrs), hidden: /\bhidden\b/.test(attrs), textContent: '' });
    if (id) fields.set('#' + id, entry);
    if (tolerance) fields.set(tolerance[1] === undefined ? '[data-experiment-tolerance]' : `[data-experiment-tolerance="${tolerance[1]}"]`, entry);
    if (percent) fields.set(`[data-experiment-percent="${percent[1]}"]`, entry);
    if (sweep) fields.set('[data-experiment-sweep]', entry);
  }
  for (const [, attrs, content] of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const id = attrs.match(/\bid="([^"]+)"/)?.[1], options = [...content.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(([, a, label]) => ({ value: decode(a.match(/\bvalue="([^"]*)"/)?.[1] ?? ''), selected: /\bselected\b/.test(a), label: decode(label) }));
    if (id) fields.set('#' + id, node({ value: (options.find(option => option.selected) ?? options[0])?.value ?? '', options }));
  }
  return { fields, querySelector: selector => fields.get(selector) ?? null, field: id => fields.get('#' + id) };
}
function fakeRunner(p) {
  const g = generateNetlist(p), net = g.measurements.find(m => m.vector === 'v(mid)'), resistor = p.circuit.components.find(c => c.type === 'R');
  return Promise.resolve({ id: 'run_ui_' + resistor.params.value.replaceAll('.', '_'), projectSnapshot: structuredClone(p), projectId: p.id, revision: p.revision, status: 'completed', analysis: structuredClone(p.analysis), netlist: g.netlist, measurements: g.measurements, engine: { name: 'UI fixture', version: '1' }, result: { points: 1, vectors: [{ name: net.vector, unit: 'V', values: [5] }], warnings: [] } });
}
async function resultFixture() {
  const p = project('divider'), choices = experimentChoices(p), target = choices.parameters.find(item => item.key === 'value'), signal = choices.signals.find(item => item.label === 'V(mid)');
  const record = await runExperiment(p, { kind: 'sweep', target, start: '1k', stop: '2k', count: 3, spacing: 'linear', measurement: { signal: signal.id, kind: 'final' } }, { runTrial: fakeRunner });
  return { p, record };
}

test('setup presents usable controls and analog choices without a run', () => {
  const p = project('divider'), html = experimentSetupHTML(p), dom = form(html);
  assert.ok(dom.field('experiment-kind').options.length === 2); assert.ok(dom.field('experiment-target').options.some(option => /Resistance/.test(option.label)));
  assert.match(html, /previous run is not required/); assert.match(html, /role="alert" hidden/); assert.match(html, /Both endpoints are included/);
  assert.equal(dom.field('experiment-measurement').value, 'final'); assert.ok(dom.field('experiment-signal').options.length > 1);
});

test('engineering sweep values round-trip without changing circuit state', () => {
  const p = project('divider'), before = JSON.stringify(p), dom = form(experimentSetupHTML(p));
  dom.field('experiment-start').value = '10k'; dom.field('experiment-stop').value = '30k'; dom.field('experiment-count').value = '5';
  const spec = readExperimentForm(dom, p); assert.equal(spec.start, 10000); assert.equal(spec.stop, 30000); assert.equal(spec.count, 5);
  assert.equal(JSON.stringify(p), before);
});

test('binding switches modes and keeps listeners removable', () => {
  const p = project('divider'), dom = form(experimentSetupHTML(p)), cleanup = bindExperimentForm(dom, p);
  assert.equal(dom.querySelector('[data-experiment-sweep]').hidden, false); assert.equal(dom.querySelector('[data-experiment-tolerance]').hidden, true);
  dom.field('experiment-kind').value = 'monte-carlo'; dom.field('experiment-kind').listeners.change();
  assert.equal(dom.querySelector('[data-experiment-sweep]').hidden, true); assert.equal(dom.querySelector('[data-experiment-tolerance]').hidden, false); assert.equal(dom.field('experiment-count').min, '1');
  const spec = readExperimentForm(dom, p); assert.equal(spec.kind, 'monte-carlo'); assert.equal(spec.seed, 12345); assert.equal(spec.targets.length, 1); assert.equal(spec.targets[0].tolerance, 5);
  cleanup(); assert.deepEqual(dom.field('experiment-kind').listeners, {}); assert.deepEqual(dom.field('experiment-target').listeners, {});
});

test('changing the parameter updates the units and sensible sweep defaults', () => {
  const p = project('rc-filter'), dom = form(experimentSetupHTML(p)), choices = experimentChoices(p), target = choices.parameters.find(item => item.key === 'value' && item.unit === 'F');
  bindExperimentForm(dom, p); dom.field('experiment-target').value = target.componentId + ':' + target.key; dom.field('experiment-target').listeners.change();
  assert.equal(Number(dom.field('experiment-start').value), target.nominal * .5); assert.match(dom.field('experiment-target-unit').textContent, /Values use F/);
});

test('AC controls offer complex measurements and validate frequency', () => {
  const p = project('rc-filter'), dom = form(experimentSetupHTML(p));
  assert.deepEqual(dom.field('experiment-measurement').options.map(option => option.value), ['ac-magnitude', 'ac-phase']);
  dom.field('experiment-frequency').value = '1k'; assert.equal(readExperimentForm(dom, p).measurement.frequency, 1000);
  dom.field('experiment-frequency').value = '1T'; assert.throws(() => readExperimentForm(dom, p), /range/);
});

test('transient windows require both endpoints and offer RMS', () => {
  const p = project('rc-step'), dom = form(experimentSetupHTML(p));
  assert.ok(dom.field('experiment-measurement').options.some(option => option.value === 'rms'));
  assert.equal(readExperimentForm(dom, p).measurement.window, undefined);
  dom.field('experiment-window-start').value = '1m'; assert.throws(() => readExperimentForm(dom, p), /both/);
  dom.field('experiment-window-end').value = '2m'; assert.deepEqual(readExperimentForm(dom, p).measurement.window, { start: .001, end: .002 });
});

test('ineligible projects show an actionable notice without study controls', () => {
  const p = project('logic-gates'), html = experimentSetupHTML(p); assert.match(html, /analog-only/); assert.doesNotMatch(html, /id="experiment-kind"/);
});

test('results show statistics, exact values, an accessible chart and all trials', async () => {
  const { p, record } = await resultFixture(), html = experimentResultHTML(record, p);
  assert.match(html, /3 measured/); assert.match(html, /Population standard deviation/); assert.match(html, /role="img"/); assert.match(html, /aria-label="Analog experiment results"/);
  assert.equal((html.match(/<circle /g) ?? []).length, 3); assert.match(html, /1500 Ω/); assert.doesNotMatch(html, /NaN|Infinity/);
  assert.match(html, /complete selected sample arrays/);
});

test('failed trial rows retain diagnostics and have no plotted number', async () => {
  const { p, record } = await resultFixture(); record.trials[1] = { ...record.trials[1], status: 'failed', measurement: undefined, source: undefined, error: 'No convergence' }; record.summary = { ...record.summary, measuredCount: 2, failedCount: 1 };
  const html = experimentResultHTML(record, p); assert.match(html, /No convergence/); assert.match(html, /2 measured/); assert.equal((html.match(/<circle /g) ?? []).length, 2); assert.match(html, /class="mono">—/);
});

test('results distinguish stale and restored evidence and escape authored text', async () => {
  const { p, record } = await resultFixture(); record.projectSnapshot.title = '<img src=x onerror=alert(1)>'; record.importedFromBackup = true;
  const html = experimentResultHTML(record, { ...p, revision: p.revision + 1 });
  assert.match(html, /working circuit has changed/); assert.match(html, /have not been simulated again/); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img/);
});

test('history preserves newest-first navigation and cancellation status', async () => {
  const { p, record } = await resultFixture(), newer = structuredClone(record); newer.id = 'experiment_newer'; newer.status = 'cancelled';
  const html = experimentHistoryHTML([record, newer], p); assert.ok(html.indexOf('experiment_newer') < html.indexOf(record.id)); assert.match(html, /cancelled/); assert.match(html, /Up to 6 studies/);
  assert.equal(experimentHistoryHTML([], p), '');
});
