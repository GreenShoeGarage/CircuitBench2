import test from 'node:test';
import assert from 'node:assert/strict';
import { SchematicEditor, wirePolyline } from '../src/editor.js';
import { newProject, addComponent, buildNets, clone, validateProject, endpointPosition } from '../src/model.js';
import { getPart, DIGITAL_TYPES } from '../src/library.js';
import { symbolMarkup } from '../src/symbols.js';

function harness(initial) {
  let project = initial;
  const messages = [], edits = [], probes = [], editor = Object.create(SchematicEditor.prototype);
  editor.callbacks = { getProject: () => project, onSelect() {}, onProbe: (...args) => probes.push(args) };
  Object.assign(editor, { mode: 'select', selection: new Set(), preview: null, drag: null, wireDraft: null, snapTarget: null, probeAnchor: null, view: { x: 0, y: 0, width: 800, height: 600 } });
  editor.render = () => {}; editor.focus = () => {}; editor.status = text => messages.push(text); editor.pixelScale = () => 1;
  editor.world = event => ({ x: event.clientX, y: event.clientY });
  editor.svg = { setPointerCapture() {}, releasePointerCapture() {} };
  editor.change = (mutator, label) => { const next = clone(project); mutator(next); project = validateProject(next); edits.push(label); };
  return { editor, messages, edits, probes, get project() { return project; } };
}
function components() {
  const project = newProject('Domain guard fixture'), input = addComponent(project, 'DIN', 0, 100), gate = addComponent(project, 'NOT', 200, 100), resistor = addComponent(project, 'R', 400, 100), adc = addComponent(project, 'ADC', 200, 300), dac = addComponent(project, 'DAC', 400, 300);
  return { project, input, gate, resistor, adc, dac };
}

test('incompatible wire attempts preserve the draft and graph while explicit bridge ports connect normally', () => {
  const { project, input, gate, resistor, adc, dac } = components(), f = harness(project), editor = f.editor;
  editor.mode = 'wire'; editor.activateWireEndpoint(`${input.id}:out`);
  const snapshot = JSON.stringify(f.project);
  editor.activateWireEndpoint(`${resistor.id}:1`);
  assert.equal(JSON.stringify(f.project), snapshot);
  assert.equal(editor.wireDraft.start, `${input.id}:out`);
  assert.match(f.messages.at(-1), /explicit ADC or DAC/);
  assert.equal(editor.findSnap(endpointPosition(f.project, `${resistor.id}:1`)).compatible, false);
  editor.activateWireEndpoint(`${gate.id}:in`);
  assert.equal(editor.wireDraft, null);
  assert.ok(editor.connectEndpoints(`${input.id}:out`, `${dac.id}:in`));
  assert.ok(editor.connectEndpoints(`${dac.id}:out`, `${resistor.id}:1`));
  assert.ok(editor.connectEndpoints(`${resistor.id}:2`, `${adc.id}:in`));
  assert.ok(editor.connectEndpoints(`${adc.id}:out`, `${gate.id}:in`), 'multiple digital drivers are valid and resolved by the event engine');
  assert.ok(!buildNets(f.project).diagnostics.some(d => d.code === 'NET_DOMAIN_CONFLICT'));
});

function crossedDomains() {
  const project = newProject('Typed crossing'), input = addComponent(project, 'DIN', 0, 100), gate = addComponent(project, 'NOT', 200, 100), a = addComponent(project, 'R', 100, 0), b = addComponent(project, 'R', 100, 200);
  project.layout.components[a.id].rotation = project.layout.components[b.id].rotation = 90;
  project.circuit.connections = [{ id: 'digital', a: `${input.id}:out`, b: `${gate.id}:in` }, { id: 'analog', a: `${a.id}:2`, b: `${b.id}:1` }];
  project.layout.wires = { digital: { points: [] }, analog: { points: [] } };
  return { project, input, gate, a, b };
}

test('explicit junction cannot merge analog and digital crossings, but a branch on one chosen wire is valid', () => {
  const { project, input, a } = crossedDomains(), f = harness(project), before = JSON.stringify(project);
  assert.deepEqual(wirePolyline(project, project.circuit.connections[0]), [{ x: 40, y: 100 }, { x: 160, y: 100 }]);
  assert.equal(f.editor.addJunctionAt(100, 100), null);
  assert.equal(JSON.stringify(f.project), before);
  assert.equal(f.edits.length, 0);
  assert.match(f.messages.at(-1), /junction cannot convert/);
  const junction = f.editor.addJunctionAt(100, 100, 'digital'), nets = buildNets(f.project).endpointToNet;
  assert.equal(nets[junction], nets[`${input.id}:out`]);
  assert.notEqual(nets[junction], nets[`${a.id}:2`]);
  assert.equal(f.editor.addJunctionAt(100, 100, 'analog'), null, 'existing junction at the crossing still cannot convert domains');
  assert.equal(f.project.circuit.connections.length, 3);
});

test('clicking an incompatible existing wire rejects before splitting it', () => {
  const { project, input } = crossedDomains(), f = harness(project);
  f.editor.mode = 'wire'; f.editor.wireDraft = { start: `${input.id}:out`, points: [] };
  const before = JSON.stringify(project);
  f.editor.pointerDown({ button: 0, clientX: 100, clientY: 80, pointerId: 1, preventDefault() {}, target: { closest: selector => selector === '[data-wire]' ? { dataset: { wire: 'analog' } } : null } });
  assert.equal(JSON.stringify(f.project), before);
  assert.equal(f.edits.length, 0);
  assert.equal(f.editor.wireDraft.start, `${input.id}:out`);
  assert.match(f.messages.at(-1), /explicit ADC or DAC/);
});

test('equal labels and ground cannot bypass a bridge; renaming an old conflicting label can repair the graph', () => {
  const { project, input, resistor } = components();
  project.circuit.labels = [{ id: 'analog-label', name: 'BUS', target: `${resistor.id}:1` }];
  const f = harness(project);
  assert.equal(f.editor.labelAllowed(`${input.id}:out`, 'bus'), false);
  assert.equal(f.editor.labelAllowed(`${input.id}:out`, '0'), false);
  assert.equal(f.editor.labelAllowed(`${input.id}:out`, 'logic_bus'), true);
  assert.equal(f.editor.labelAllowed(`${resistor.id}:2`, 'BUS'), true);
  project.circuit.labels.push({ id: 'bad-label', name: 'bus', target: `${input.id}:out` });
  assert.equal(f.editor.labelAllowed(`${input.id}:out`, 'logic_bus', 'bad-label'), true, 'domain preflight must examine the proposed replacement, not the stale alias');
  assert.equal(f.edits.length, 0);
});

test('logic probes remain single-node measurements and differential requests require analog nodes', () => {
  const { project, input, resistor } = components(), f = harness(project);
  f.editor.measure(`${input.id}:out`, false);
  assert.deepEqual(f.probes, [[`${input.id}:out`]]);
  assert.match(f.messages.at(-1), /Logic probe/);
  f.editor.measure(`${resistor.id}:1`, true);
  assert.equal(f.probes.length, 1);
  f.editor.measure(`${resistor.id}:1`, false);
  f.editor.measure(`${input.id}:out`, true);
  assert.equal(f.probes.length, 2);
  f.editor.measure(`${resistor.id}:2`, true);
  assert.deepEqual(f.probes.at(-1), [`${resistor.id}:1`, `${resistor.id}:2`]);
});

test('all native symbols have explicit artwork and exports show true typed bridge pins after rotation and mirroring', () => {
  for (const type of DIGITAL_TYPES) assert.ok(!symbolMarkup(type).includes(`<text class="symbol-type" x="0" y="5">${type}</text>`), `${type} needs intentional artwork`);
  const { project, input, gate, adc, dac } = components(), f = harness(project);
  f.editor.connectEndpoints(`${input.id}:out`, `${gate.id}:in`);
  f.editor.select([adc.id, dac.id]);
  const before = clone(f.project.circuit);
  f.editor.rotate(); f.editor.mirror();
  assert.deepEqual(f.project.circuit, before, 'orientation affects layout only');
  const rendered = f.editor.renderComponents(f.project, buildNets(f.project).endpointToNet);
  for (const c of [adc, dac]) for (const pin of getPart(c.type).pins) {
    const ep = `${c.id}:${pin.id}`, pos = endpointPosition(f.project, ep), pinMarkup = rendered.slice(rendered.indexOf(`data-endpoint="${ep}"`)).split('</g>')[0];
    if (pin.domain === 'digital') {
      assert.match(pinMarkup, /<rect class="pin pin-digital"/);
      assert.ok(pinMarkup.includes(`x="${pos.x - 3.8}" y="${pos.y - 3.8}"`));
      assert.match(pinMarkup, /digital (input|output) pin/);
    } else {
      assert.match(pinMarkup, /<circle class="pin"/);
      assert.ok(pinMarkup.includes(`cx="${pos.x}" cy="${pos.y}"`));
      assert.match(pinMarkup, /analog (input|output|passive) pin/);
    }
  }
  const svg = f.editor.exportSVG();
  assert.ok(!svg.includes('var('));
  assert.match(svg, /wire wire-digital/);
  assert.match(svg, /\.pin-digital\{stroke:#315e8c\}/);
  assert.match(svg, /Square pins are digital; round pins are analog/);
  assert.match(svg, /A→D/); assert.match(svg, /D→A/);
});
