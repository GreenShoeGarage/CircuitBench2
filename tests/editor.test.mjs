import test from 'node:test';
import assert from 'node:assert/strict';
import { SchematicEditor, wirePolyline } from '../src/editor.js';
import { newProject, addComponent, buildNets, validateProject, clone } from '../src/model.js';
import { EXAMPLES } from '../src/examples.js';

// Domain/interaction tests exercise the real editor methods without replacing
// electrical code. Browser pointer rendering is verified separately in CUA.
function editorHarness(initial) {
  let project = initial;
  const edits = [], messages = [];
  const editor = Object.create(SchematicEditor.prototype);
  editor.callbacks = { getProject: () => project, onSelect: () => {}, onProbe: (...args) => messages.push(args) };
  Object.assign(editor, { selection: new Set(), mode: 'select', preview: null, drag: null, clipboard: null, probeAnchor: null, view: { x: 0, y: 0, width: 1000, height: 600 } });
  editor.render = () => {};
  editor.status = message => messages.push(message);
  editor.pixelScale = () => 1;
  editor.focus = () => {};
  editor.world = e => ({ x: e.clientX, y: e.clientY });
  editor.svg = { hasPointerCapture: () => false, setPointerCapture: () => {}, releasePointerCapture: () => {}, getBoundingClientRect: () => ({ width: 1000, height: 600 }) };
  editor.change = (mutator, label) => { const next = clone(project); mutator(next); project = validateProject(next); edits.push(label); };
  return { editor, edits, messages, get project() { return project; }, set project(value) { project = value; } };
}

function crossedWires() {
  const project = newProject('Crossing fixture');
  const a = addComponent(project, 'R', 0, 100), b = addComponent(project, 'R', 200, 100);
  const c = addComponent(project, 'R', 100, 0), d = addComponent(project, 'R', 100, 200);
  project.layout.components[c.id].rotation = 90;
  project.layout.components[d.id].rotation = 90;
  project.circuit.connections = [{ id: 'w1', a: `${a.id}:2`, b: `${b.id}:1` }, { id: 'w2', a: `${c.id}:2`, b: `${d.id}:1` }];
  project.layout.wires = { w1: { points: [] }, w2: { points: [] } };
  return { project, a, b, c, d };
}

function keyEvent(key, dataset = {}, modifiers = {}) {
  const target = {
    matches: () => false,
    closest: selector => {
      const name = /data-([^\]]+)/.exec(selector)?.[1];
      return name && dataset[name] !== undefined ? { dataset } : null;
    }
  };
  return { key, target, preventDefault() { this.prevented = true; }, ...modifiers };
}

test('visual crossings stay separate until an explicit junction splits both edges', () => {
  const { project, a, c } = crossedWires();
  const fixture = editorHarness(project), { editor } = fixture;
  const before = buildNets(project).endpointToNet;
  assert.notEqual(before[`${a.id}:2`], before[`${c.id}:2`]);
  assert.deepEqual(wirePolyline(project, project.circuit.connections[0]), [{ x: 40, y: 100 }, { x: 160, y: 100 }]);
  const endpoint = editor.addJunctionAt(100, 100);
  const after = buildNets(fixture.project).endpointToNet;
  assert.equal(after[`${a.id}:2`], after[`${c.id}:2`]);
  assert.equal(after[`${a.id}:2`], after[endpoint]);
  assert.equal(fixture.project.circuit.connections.length, 4);
  assert.equal(fixture.project.circuit.junctions.length, 1);
  assert.deepEqual(fixture.edits, ['Insert explicit junction']);
  editor.addJunctionAt(100, 100);
  assert.equal(fixture.project.circuit.connections.length, 4, 'repeat click does not insert redundant edges');
});

test('wire-mode junction insertion touches only the chosen wire at a crossing', () => {
  const { project, a, c } = crossedWires();
  const fixture = editorHarness(project);
  fixture.editor.addJunctionAt(100, 100, 'w1');
  const nets = buildNets(fixture.project).endpointToNet;
  assert.notEqual(nets[`${a.id}:2`], nets[`${c.id}:2`]);
  assert.equal(fixture.project.circuit.connections.length, 3);
});

test('movement, rotation, and mirroring preserve semantic electrical connections', () => {
  const { project, a } = crossedWires();
  const fixture = editorHarness(project), { editor } = fixture;
  editor.addJunctionAt(100, 100);
  const before = buildNets(fixture.project).endpointToNet;
  const originalEdges = clone(fixture.project.circuit.connections);
  editor.select([a.id]);
  editor.moveSelection(40, 60);
  editor.rotate();
  editor.mirror();
  assert.deepEqual(buildNets(fixture.project).endpointToNet, before);
  assert.deepEqual(fixture.project.circuit.connections, originalEdges);
  assert.equal(fixture.project.layout.components[a.id].rotation, 90);
  assert.equal(fixture.project.layout.components[a.id].mirror, true);
});

test('RC move-rotate-mirror reroutes the pin approach around C1 while keeping deliberate bends and nets', () => {
  const project = EXAMPLES.find(e=>e.id==='rc-filter').create(), capacitor = project.circuit.components.find(c=>c.ref==='C1');
  const fixture = editorHarness(project), { editor } = fixture;
  const netsBefore = buildNets(project).endpointToNet, groundWire = project.circuit.connections.find(w=>w.a===`${capacitor.id}:2`);
  const storedBends = clone(project.layout.wires[groundWire.id].points);
  editor.select([capacitor.id]);
  editor.setPosition(capacitor.id,460,280);editor.rotate();editor.mirror();
  assert.deepEqual(fixture.project.layout.components[capacitor.id],{x:460,y:280,rotation:180,mirror:true});
  assert.deepEqual(buildNets(fixture.project).endpointToNet,netsBefore);
  assert.deepEqual(fixture.project.layout.wires[groundWire.id].points,storedBends);
  const path=wirePolyline(fixture.project,groundWire);
  assert.deepEqual(path.slice(0,3),[{x:500,y:280},{x:500,y:380},{x:440,y:380}]);
  assert.ok(!path.some((point,i)=>i&&point.y===280&&path[i-1].y===280&&Math.min(point.x,path[i-1].x)<472&&Math.max(point.x,path[i-1].x)>448),'lead cannot cross the capacitor body');
});

test('drag previews are isolated and one release creates one undoable edit', () => {
  const { project, a } = crossedWires();
  const fixture = editorHarness(project), { editor } = fixture;
  editor.selection = new Set([a.id]);
  editor.drag = { kind: 'move', start: { x: 0, y: 0 }, ids: [a.id], original: clone(project), moved: false, dx: 0, dy: 0 };
  editor.preview = clone(project);
  editor.pointerMove({ clientX: 39, clientY: 23 });
  editor.pointerMove({ clientX: 61, clientY: 43 });
  assert.equal(fixture.edits.length, 0);
  assert.equal(fixture.project.layout.components[a.id].x, 0);
  assert.equal(editor.preview.layout.components[a.id].x, 60);
  editor.pointerUp({ pointerId: 1 });
  assert.equal(fixture.edits.length, 1);
  assert.equal(fixture.project.layout.components[a.id].x, 60);
  assert.equal(fixture.project.layout.components[a.id].y, 140);
  assert.equal(editor.preview, null);
});

test('cancelled pointer gestures discard their preview without a mutation', () => {
  const { project, a } = crossedWires();
  const fixture = editorHarness(project), { editor } = fixture;
  editor.drag = { kind: 'move', start: { x: 0, y: 0 }, ids: [a.id], original: clone(project), moved: false, dx: 0, dy: 0 };
  editor.preview = clone(project);
  editor.pointerMove({ clientX: 80, clientY: 80 });
  editor.pointerCancel({ pointerId: 1 });
  assert.equal(fixture.edits.length, 0);
  assert.equal(fixture.project.layout.components[a.id].x, 0);
  assert.equal(editor.preview, null);
});

test('clipboard retains a snapshot and pastes safely into a different project', () => {
  const { project, a, c } = crossedWires();
  project.circuit.labels.push({ id: 'label1', name: 'out', target: `${a.id}:1` }, { id: 'label2', name: 'out', target: `${c.id}:1` });
  project.layout.annotations.push({ id: 'note1', x: 0, y: -80, text: 'Original source note' });
  const fixture = editorHarness(project), { editor } = fixture;
  editor.addJunctionAt(100, 100);
  editor.keyDown(keyEvent('a', {}, { ctrlKey: true }));
  editor.copy();
  const sourceIds = new Set(fixture.project.circuit.components.map(c => c.id));
  fixture.project.circuit.components[0].params.value = '2k';
  const target = newProject('Destination');
  addComponent(target, 'R', 500, 500);
  target.circuit.labels.push({ id: 'destination_label', name: 'out_copy', target: target.circuit.components[0].id + ':1' });
  fixture.project = target;
  editor.select([]);
  editor.paste();
  assert.equal(fixture.project.circuit.components.length, 5);
  assert.equal(fixture.project.circuit.junctions.length, 1);
  assert.equal(fixture.project.circuit.connections.length, 4);
  assert.equal(fixture.project.layout.annotations[0].text, 'Original source note');
  const pasted = fixture.project.circuit.components.slice(1);
  assert.ok(pasted.every(c => !sourceIds.has(c.id)));
  assert.ok(pasted.every(c => c.params.value === '10k'), 'copy is not affected by subsequent source edits');
  assert.equal(new Set(fixture.project.circuit.components.map(c => c.ref.toLowerCase())).size, 5);
  const copiedLabels = fixture.project.circuit.labels.slice(1);
  assert.equal(copiedLabels[0].name, copiedLabels[1].name, 'equal copied labels remain one electrical net');
  assert.notEqual(copiedLabels[0].name, 'out_copy', 'copied labels do not silently join destination nets');
  const nets = buildNets(fixture.project).endpointToNet;
  assert.equal(nets[copiedLabels[0].target], nets[copiedLabels[1].target]);
  assert.notEqual(nets[copiedLabels[0].target], nets[fixture.project.circuit.labels[0].target]);
  validateProject(fixture.project);
});

test('focused component arrows select and move; form input shortcuts are untouched', () => {
  const { project, a } = crossedWires();
  const fixture = editorHarness(project), { editor } = fixture;
  const e = keyEvent('ArrowRight', { item: a.id });
  editor.keyDown(e);
  assert.equal(e.prevented, true);
  assert.equal(fixture.project.layout.components[a.id].x, 20);
  const inputEvent = keyEvent('r');
  inputEvent.target.matches = () => true;
  editor.keyDown(inputEvent);
  assert.equal(fixture.project.layout.components[a.id].rotation, 0);
  assert.equal(inputEvent.prevented, undefined);
});

test('wire bend keyboard deletion removes only a bend, not the wire', () => {
  const { project } = crossedWires();
  project.layout.wires.w1.points = [{ x: 80, y: 100 }, { x: 120, y: 100 }];
  const fixture = editorHarness(project);
  fixture.editor.keyDown(keyEvent('Delete', { wire: 'w1', item: 'w1', handle: '0' }));
  assert.equal(fixture.project.circuit.connections.length, 2);
  assert.deepEqual(fixture.project.layout.wires.w1.points, [{ x: 120, y: 100 }]);
});

test('keyboard wire activation joins two real pin identifiers and cancellation discards drafts', () => {
  const p = newProject('Keyboard wiring'), a = addComponent(p, 'R', 0, 0), b = addComponent(p, 'C', 200, 0);
  const fixture = editorHarness(p), { editor } = fixture;
  editor.setMode('wire');
  editor.keyDown(keyEvent('Enter', { endpoint: `${a.id}:2` }));
  assert.equal(fixture.project.circuit.connections.length, 0);
  editor.keyDown(keyEvent('Enter', { endpoint: `${b.id}:1` }));
  assert.equal(fixture.project.circuit.connections.length, 1);
  assert.deepEqual(fixture.project.circuit.connections.map(w => [w.a, w.b]), [[`${a.id}:2`, `${b.id}:1`]]);
  editor.keyDown(keyEvent('Enter', { endpoint: `${a.id}:1` }));
  editor.keyDown(keyEvent('Escape'));
  assert.equal(editor.wireDraft, null);
  assert.equal(fixture.project.circuit.connections.length, 1);
});

test('SVG export can render an immutable historical snapshot with escaped text', () => {
  const { project } = crossedWires();
  const historical = clone(project);
  historical.title = 'Historical <script>alert(1)</script>';
  historical.circuit.components[0].params.value = '47k';
  const fixture = editorHarness(project);
  fixture.project.title = 'Current circuit';
  fixture.project.circuit.components[0].params.value = '1k';
  const svg = fixture.editor.exportSVG(historical);
  assert.ok(svg.includes('Historical &lt;script&gt;'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('47k Ω'));
  assert.ok(!svg.includes('Current circuit'));
  assert.ok(svg.includes('fill="#ffffff"'));
  assert.ok(!svg.includes('var('), 'exported SVG must not depend on CSS-variable support in vector/print renderers');
  assert.ok(!svg.includes('https://'));
  assert.equal(fixture.project.circuit.components[0].params.value, '1k');
});
