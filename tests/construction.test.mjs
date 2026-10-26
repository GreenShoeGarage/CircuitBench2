import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, addComponent, setComponentParams, buildNets, buildDigitalNets, checkCircuit, canConnect, clone, validateProject } from '../src/model.js';
import { getPins } from '../src/library.js';
import { constructionActions, connectionActions, applyConstruction, compatibleDestinations, diagnosticTarget, analysisCompatibility, exampleGoals, EXAMPLE_GOALS } from '../src/construction.js';
import { constructionFormHTML, diagnosticHTML } from '../src/construction-ui.js';
import { SchematicEditor } from '../src/editor.js';
import { compileSimulation } from '../src/netlist.js';
import { simulateDigital } from '../src/digital.js';
import { sevenSegmentGlyph } from '../src/displays.js';
import { EXAMPLES } from '../src/examples.js';

const endpoint = (component, pin) => `${component.id}:${pin}`;
function fixture(type = 'BUSIN', params = { width: '4', value: '0xA' }) {
  const project = newProject('Construction fixture'); project.analysis.type = 'tran';
  const component = addComponent(project, type, 0, 0); setComponentParams(project, component.id, params);
  return { project, component, endpoint: endpoint(component, getPins(component)[0].id) };
}
const configure = (action, values = {}) => ({ ...action.request, config: { ...Object.fromEntries(action.fields.map(f => [f.key, String(f.value)])), ...values } });
const action = (project, ep, id) => constructionActions(project, ep).find(a => a.id === id);
const connect = (project, a, b) => { const id = `fixture-wire-${project.circuit.connections.length}`; project.circuit.connections.push({ id, a, b }); project.layout.wires[id] = { points: [] }; };
function digitalValue(project, ep) {
  const plan = compileSimulation(project), result = simulateDigital({ ...plan.digital, duration: plan.duration }), built = buildNets(project), name = built.endpointToNet[ep], width = built.nets.find(n => n.name === name).width;
  return (width > 1 ? result.busTraces.find(t => t.name === `b(${name})`) : result.traces.find(t => t.name === `d(${name})`)).events.at(-1).value;
}
function harness(project) {
  const history = [], messages = [], editor = Object.create(SchematicEditor.prototype);
  editor.callbacks = { getProject: () => project, onSelect() {}, onStatus: text => messages.push(text) };
  Object.assign(editor, { selection: new Set(), mode: 'select', wireDraft: null, sourcePress: null, view: { x: 0, y: 0, width: 1000, height: 600 } });
  editor.render = () => {}; editor.svg = { hasPointerCapture: () => false, setPointerCapture() {}, releasePointerCapture() {}, getBoundingClientRect: () => ({ width: 1000, height: 600 }) };
  editor.change = (mutator, label) => { const before = clone(project); mutator(project); project = validateProject(project); history.push({ before, label }); };
  return { editor, history, messages, get project() { return project; }, undo() { project = history.pop().before; } };
}

test('destination highlighting exactly respects the real domain/width connection rule', () => {
  const { project, endpoint: from } = fixture(), scalar = addComponent(project, 'DLED', 200, 0), analog = addComponent(project, 'R', 400, 0), matching = addComponent(project, 'BUSIN', 600, 0);
  project.circuit.junctions.push({ id: 'free' }); project.layout.junctions.free = { x: 0, y: 200 };
  const destinations = compatibleDestinations(project, from), all = [...project.circuit.components.flatMap(c => getPins(c).map(p => endpoint(c, p.id))), 'j:free'];
  for (const ep of all) assert.equal(destinations.has(ep), ep !== from && canConnect(project, from, ep).ok, ep);
  assert.ok(destinations.has(endpoint(matching, 'out'))); assert.ok(!destinations.has(endpoint(scalar, 'in'))); assert.ok(!destinations.has(endpoint(analog, '1')));
});

test('attach indicator observes HIGH without adding a digital driver', () => {
  const { project, component, endpoint: from } = fixture('DVS', { state: '1' });
  const result = applyConstruction(project, configure(action(project, from, 'indicator'))), built = buildNets(project), net = built.nets.find(n => n.endpoints.includes(from));
  assert.equal(project.circuit.components.find(c => c.id === result.ids[0]).type, 'DLED'); assert.deepEqual(net.drivers, [endpoint(component, 'out')]); assert.equal(digitalValue(project, result.endpoint), '1');
  assert.equal(checkCircuit(project).filter(d => d.severity === 'error').length, 0);
});

test('bus-bit probe inserts a genuine one-bit alias with MSB/LSB correctness', () => {
  for (const bit of [0, 1, 2, 3]) {
    const { project, endpoint: from } = fixture(), result = applyConstruction(project, configure(action(project, from, 'probe-bit'), { lsb: String(bit) }));
    const bits = buildDigitalNets(project).endpointBits;
    assert.equal(bits[result.endpoint][0], bits[from][bit]); assert.equal(digitalValue(project, result.endpoint), '1010'[3 - bit]);
    assert.equal(project.probes[0].a, result.endpoint); assert.equal(project.probes[0].kind, 'logic');
  }
});

test('Join uses explicit low/high placement and preserves X/Z per bit', () => {
  for (const [side, expected] of [['low', 'X0Z1'], ['high', 'Z1X0']]) {
    const { project, endpoint: from } = fixture('BUSIN', { width: '2', value: 'Z1' });
    const result = applyConstruction(project, configure(action(project, from, 'join'), { otherWidth: '2', side, other: 'X0' }));
    assert.equal(digitalValue(project, result.endpoint), expected); assert.equal(project.circuit.components.filter(c => c.type === 'BUSIN').length, 2);
    assert.equal(buildNets(project).diagnostics.filter(d => d.severity === 'error').length, 0);
  }
});

test('4-bit to display correction inserts matching decoder plus explicit decimal source', () => {
  for (const active of ['high', 'low']) {
    const { project, endpoint: from } = fixture(), display = addComponent(project, 'SEG7', 500, 0); setComponentParams(project, display.id, { active });
    const suggestion = connectionActions(project, from, endpoint(display, 'in')).find(a => a.id === 'decoder-display');
    assert.ok(suggestion); const result = applyConstruction(project, configure(suggestion, { decimal: '1' }));
    const decoder = project.circuit.components.find(c => c.type === 'HEX7'); assert.equal(decoder.params.active, active);
    const word = digitalValue(project, result.endpoint); assert.equal(sevenSegmentGlyph(word, active), 'A'); assert.equal(word[0], active === 'high' ? '1' : '0');
    assert.equal(project.circuit.components.filter(c => c.type === 'SEG7').length, 1); assert.equal(checkCircuit(project).filter(d => d.severity === 'error').length, 0);
  }
});

test('matching display attached to decoder output inherits the explicit active-level default', () => {
  const { project, component } = fixture('HEX7', { active: 'low' }), from = endpoint(component, 'out'), suggestion = action(project, from, 'display');
  assert.equal(suggestion.fields.find(f => f.key === 'active').value, 'low');
  const result = applyConstruction(project, configure(suggestion)); assert.equal(project.circuit.components.find(c => c.id === result.ids[0]).params.active, 'low');
});

test('width corrections construct valid Slice and Join wiring without directly merging buses', () => {
  for (const kind of ['slice', 'join']) {
    const { project, endpoint: from } = fixture(), sink = addComponent(project, 'DLED', 400, 0), to = endpoint(sink, 'in');
    const suggestion = connectionActions(project, from, to).find(a => a.id === kind), result = applyConstruction(project, configure(suggestion, kind === 'slice' ? { lsb: '1' } : { side: 'low', other: '0b101' }));
    assert.equal(project.circuit.connections.some(w => w.a === from && w.b === to || w.b === from && w.a === to), false);
    assert.equal(buildNets(project).diagnostics.length, 0); assert.ok(result.ids.length);
    for (const wire of project.circuit.connections) assert.ok(canConnect(project, wire.a, wire.b).ok);
  }
});

test('ADC and DAC correction direction follows the driven digital net', () => {
  const { project, component: source } = fixture('DVS', { state: '1' }), resistor = addComponent(project, 'R', 300, 0), indicator = addComponent(project, 'DLED', 500, 0);
  assert.equal(connectionActions(project, endpoint(source, 'out'), endpoint(resistor, '1'))[0].request.kind, 'dac');
  assert.equal(connectionActions(project, endpoint(resistor, '2'), endpoint(indicator, 'in'))[0].request.kind, 'adc');
});

test('ADC/DAC direction discovers drivers through passive Slice/Join aliases', () => {
  const { project, endpoint: from } = fixture(), selected = applyConstruction(project, configure(action(project, from, 'slice'), { lsb: '1', count: '1' })), resistor = addComponent(project, 'R', 500, 0);
  assert.equal(buildNets(project).nets.find(n => n.endpoints.includes(selected.endpoint)).drivers.length, 0);
  assert.equal(connectionActions(project, selected.endpoint, endpoint(resistor, '1'))[0].request.kind, 'dac');
});

test('scalar ADC correction explicitly wires its analog reference and leaves domains distinct', () => {
  const { project, component: voltage } = fixture('V', {}), indicator = addComponent(project, 'DLED', 400, 0), from = endpoint(voltage, 'p'), to = endpoint(indicator, 'in');
  const suggestion = connectionActions(project, from, to)[0], result = applyConstruction(project, configure(suggestion));
  const adc = project.circuit.components.find(c => c.type === 'ADC'), ground = project.circuit.components.find(c => c.type === 'GND'), built = buildNets(project);
  assert.equal(built.endpointToNet[endpoint(adc, 'ref')], built.endpointToNet[endpoint(ground, '0')]);
  assert.notEqual(built.endpointToNet[from], built.endpointToNet[to]); assert.equal(built.nets.find(n => n.endpoints.includes(to)).domain, 'digital');
  assert.ok(result.ids.includes(adc.id)); assert.equal(project.analysis.solver, 'ngspice');
});

test('multibit DAC maps the bus width and preserves explicit voltage/rise/startup settings', () => {
  const { project, endpoint: from } = fixture(), resistor = addComponent(project, 'R', 400, 0), to = endpoint(resistor, '1');
  const result = applyConstruction(project, configure(connectionActions(project, from, to)[0], { low: '-1', high: '3', rise: '2u', fall: '4u', initial: '0x7' }));
  const dac = project.circuit.components.find(c => c.type === 'DACBUS'); assert.equal(dac.params.width, '4'); assert.equal(dac.params.initial, '0x7'); assert.equal(dac.params.low, '-1'); assert.equal(dac.params.rise, '2u');
  assert.equal(buildNets(project).endpointToNet[result.endpoint], buildNets(project).endpointToNet[to]);
  assert.ok(checkCircuit(project).some(d => d.code === 'COORDINATED_REQUIRED'), 'construction does not silently choose a solver');
});

test('standalone multibit ADC config accepts explicit 2–8 bit widths and converter timing', () => {
  const { project, component: voltage } = fixture('V', {}), suggestion = action(project, endpoint(voltage, 'p'), 'adc-bus');
  applyConstruction(project, configure(suggestion, { width: '7', period: '1m', delay: '2u' }));
  const adc = project.circuit.components.find(c => c.type === 'ADCBUS'); assert.equal(adc.params.width, '7'); assert.equal(getPins(adc).find(p => p.id === 'q').width, 7);
});

test('invalid ranges, words, timing and references are rejected without any project mutation', () => {
  const checks = [
    ['probe-bit', { lsb: '4' }], ['slice', { lsb: '3', count: '2' }], ['join', { otherWidth: '4', other: '0x100' }],
    ['dac-4', { initial: 'XXXX' }], ['dac-4', { high: '0', low: '5' }], ['dac-4', { reference: 'missing:pin' }], ['dac-4', { rise: '0' }]
  ];
  for (const [id, config] of checks) { const { project, endpoint: from } = fixture(), before = clone(project); assert.throws(() => applyConstruction(project, configure(action(project, from, id), config)), id); assert.deepEqual(project, before, id); }
  const { project, component } = fixture('V', {}), before = clone(project); assert.throws(() => applyConstruction(project, configure(action(project, endpoint(component, 'p'), 'adc-bus'), { delay: '100u', period: '100u' }))); assert.deepEqual(project, before);
});

test('DAC refuses a voltage output short to the chosen reference atomically', () => {
  const { project, endpoint: from } = fixture('DVS', {}), ground = addComponent(project, 'GND', 400, 0), to = endpoint(ground, '0'), before = clone(project);
  assert.throws(() => applyConstruction(project, configure(connectionActions(project, from, to)[0], { reference: to })), /own analog reference/); assert.deepEqual(project, before);
});

test('Editor construction groups decoder, decimal source, display and all wires into one undo', () => {
  const f = fixture(), h = harness(f.project), before = clone(h.project);
  const result = h.editor.construct(configure(action(h.project, f.endpoint, 'decoder-display')));
  assert.equal(h.history.length, 1); assert.equal(result.ids.length, 3); assert.equal(h.project.circuit.connections.length, 3); assert.deepEqual(h.editor.getSelection(), result.ids);
  h.undo(); assert.deepEqual(h.project, before);
  assert.throws(() => h.editor.construct(configure(action(h.project, f.endpoint, 'probe-bit'), { lsb: '8' })));
  assert.equal(h.history.length, 0); assert.deepEqual(h.project, before);
});

test('typed corrective UI escapes project labels and includes explicit configuration fields', () => {
  const f = fixture('V', {}); f.component.ref = 'V1'; const html = constructionFormHTML({ ...action(f.project, endpoint(f.component, 'p'), 'adc-1'), description: '<script>bad()</script>' });
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(html.includes('name="reference"')); assert.ok(html.includes('name="low"')); assert.ok(html.includes('data-construction-form'));
});

test('diagnostic navigation resolves an exact component pin instead of another reference prefix', () => {
  const { project } = fixture('R', {}), r10 = addComponent(project, 'R', 1000, 1000); r10.ref = 'R10';
  const diagnostic = checkCircuit(project).find(d => d.componentId === r10.id && d.message.startsWith('R10 pin'));
  const target = diagnosticTarget(project, diagnostic); assert.deepEqual(target.ids, [r10.id]); assert.equal(target.endpoints[0], endpoint(r10, '1'));
  const h = harness(project); assert.equal(h.editor.navigateDiagnostic(diagnostic), true); assert.deepEqual(h.editor.getSelection(), [r10.id]); assert.ok(h.editor.view.x > 500); assert.ok(h.editor.view.y > 500);
});

test('net conflict diagnostic selects exact members and connecting wires', () => {
  const { project, endpoint: from } = fixture(), indicator = addComponent(project, 'DLED', 400, 0); connect(project, from, endpoint(indicator, 'in'));
  const diagnostic = buildNets(project).diagnostics.find(d => d.code === 'NET_WIDTH_CONFLICT'), target = diagnosticTarget(project, diagnostic);
  assert.equal(target.endpoints.length, 2); assert.ok(target.ids.includes(project.circuit.connections[0].id));
  assert.ok(diagnosticHTML(project, [diagnostic]).includes('data-diagnostic-index="0"'));
});

test('undriven bus-bit diagnostic resolves bit aliases back to visible bus pins', () => {
  const { project, component: display } = fixture('SEG7', {}), diagnostic = checkCircuit(project).find(d => d.message.startsWith('Digital bit net ')), target = diagnosticTarget(project, diagnostic);
  assert.deepEqual(target.ids, [display.id]); assert.deepEqual(target.endpoints, [endpoint(display, 'in')]);
});

test('probe diagnostics navigate to probe endpoints and settings diagnostics stay non-navigable', () => {
  const { project, endpoint: from } = fixture('DVS', {}); project.probes.push({ id: 'bad-probe', kind: 'voltage', label: 'Measurement', a: from });
  assert.deepEqual(diagnosticTarget(project, { message: 'Measurement: voltage measurements require analog nets.' }).endpoints, [from]);
  assert.equal(diagnosticTarget(project, { message: 'Transient step must be positive.' }), null);
});

test('whole-circuit analysis compatibility offers ngspice for an intact nonlinear analog circuit', () => {
  const project = EXAMPLES.find(e => e.id === 'rectifier').create(); project.analysis.solver = 'coordinated'; const result = analysisCompatibility(project);
  assert.equal(result.supported, false); assert.deepEqual(result.alternatives.map(a => a.solver), ['ngspice']);
  assert.ok(result.diagnostics.some(d => d.code === 'COORDINATED_UNSUPPORTED')); assert.ok(result.diagnostics.every(d => !d.message.includes('Use ngspice for this analog model')));
});

test('nonlinear mixed feedback never offers a misleading ngspice fallback', () => {
  const project = EXAMPLES.find(e => e.id === 'closed-loop-schmitt').create(), resistor = project.circuit.components.find(c => c.type === 'R'), diode = addComponent(project, 'D', 1000, 500);
  connect(project, endpoint(resistor, '1'), endpoint(diode, 'a')); connect(project, endpoint(resistor, '2'), endpoint(diode, 'k'));
  const result = analysisCompatibility(project); assert.equal(result.supported, false); assert.deepEqual(result.alternatives, []); assert.ok(result.diagnostics.some(d => d.componentId === diode.id));
});

test('a supported closed loop offered from replay keeps topology and only proposes Coordinated transient', () => {
  const project = EXAMPLES.find(e => e.id === 'closed-loop-schmitt').create(); project.analysis.solver = 'ngspice'; const before = clone(project), result = analysisCompatibility(project);
  assert.deepEqual(result.alternatives.map(a => a.solver), ['coordinated']); assert.deepEqual(project, before);
});

test('alternative engines are withheld until unrelated circuit errors are repaired', () => {
  const project = EXAMPLES.find(e => e.id === 'rectifier').create(); project.analysis.solver = 'coordinated'; addComponent(project, 'R', 1000, 0);
  assert.deepEqual(analysisCompatibility(project).alternatives, []);
});

test('goal-based example groups cover every existing example without adding catalog entries', () => {
  const valid = new Set(EXAMPLE_GOALS.map(g => g.id)); for (const example of EXAMPLES) { const goals = exampleGoals(example); assert.ok(goals.length); assert.ok(goals.every(g => valid.has(g))); }
  assert.ok(exampleGoals(EXAMPLES.find(e => e.id === 'closed-loop-schmitt')).includes('feedback'));
});

test('source operating targets emit one owned momentary gesture across callback rerenders', () => {
  const f = fixture('DVS', {}), h = harness(f.project), operations = [];
  h.editor.callbacks.getSourceOperation = () => ({ enabled: true, momentary: true, value: '0' });
  h.editor.callbacks.onSourceOperation = event => { operations.push(event); h.editor.render(); };
  h.editor.beginSourceOperation(f.component.id, { pointerId: 7, clientX: 100, clientY: 20, preventDefault() {} });
  assert.equal(h.editor.drag, undefined); assert.equal(h.editor.selection.size, 0);
  h.editor.sourcePointerUp({ pointerId: 7, preventDefault() {} });
  h.editor.sourcePointerUp({ pointerId: 7, preventDefault() {} });
  assert.deepEqual(operations.map(e => e.action), ['press', 'release']); assert.equal(operations[0].owner, operations[1].owner);
});

test('source toggle requires release; dragging or canceling the operation target does not toggle', () => {
  const f = fixture('DVS', {}), h = harness(f.project), operations = []; h.editor.callbacks.getSourceOperation = () => ({ enabled: true, momentary: false }); h.editor.callbacks.onSourceOperation = e => operations.push(e);
  const down = { pointerId: 1, clientX: 10, clientY: 10, preventDefault() {} };
  h.editor.beginSourceOperation(f.component.id, down); assert.equal(operations.length, 0); h.editor.pointerMove({ pointerId: 1, clientX: 30, clientY: 10 }); h.editor.sourcePointerUp(down); assert.equal(operations.length, 0);
  h.editor.beginSourceOperation(f.component.id, down); h.editor.finishSourceOperation('cancel'); assert.equal(operations.length, 0);
  h.editor.beginSourceOperation(f.component.id, down); h.editor.sourcePointerUp(down); assert.deepEqual(operations.map(e => e.action), ['toggle']);
});

test('source keyboard press repeat is coalesced and cancels safely when changing editor mode', () => {
  const f = fixture('DVS', {}), h = harness(f.project), operations = []; h.editor.callbacks.getSourceOperation = () => ({ enabled: true, momentary: true }); h.editor.callbacks.onSourceOperation = e => operations.push(e);
  const key = { key: ' ', preventDefault() {} }; h.editor.beginSourceOperation(f.component.id, key, ' '); h.editor.beginSourceOperation(f.component.id, key, ' ');
  h.editor.sourceKeyUp({ key: 'Enter', preventDefault() {} }); assert.equal(operations.length, 1);
  h.editor.setMode('wire'); h.editor.sourceKeyUp(key); assert.deepEqual(operations.map(e => e.action), ['press', 'cancel']); assert.equal(operations[0].owner, operations[1].owner);
});
