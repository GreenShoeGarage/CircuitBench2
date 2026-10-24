import test from 'node:test';
import assert from 'node:assert/strict';
import { getPart, getPins, MODELS, DISPLAY_TYPES, DISPLAY_MODEL_VERSION } from '../src/library.js';
import { newProject, addComponent, uid, clone, buildNets, buildDigitalNets, canConnect, checkCircuit, validateProject, serializeProject, parseProject } from '../src/model.js';
import { compileSimulation, generateNetlist } from '../src/netlist.js';
import { simulateDigital } from '../src/digital.js';
import { mergeEventResults } from '../src/simulation.js';
import { segmentStates, sevenSegmentGlyph, displayStatesForRun, sevenSegmentMarkup, displayPanelMarkup } from '../src/displays.js';
import { DISPLAY_EXAMPLES } from '../src/examples-displays.js';
import { symbolMarkup } from '../src/symbols.js';
import { SchematicEditor } from '../src/editor.js';
import { safeEnvelope } from '../src/storage.js';

const ep = (component, pin) => `${component.id}:${pin}`;
const add = (project, type, params = {}) => { const component = addComponent(project, type); Object.assign(component.params, params); return component; };
const wire = (project, a, b) => { const id = uid('w'); project.circuit.connections.push({ id, a, b }); project.layout.wires[id] = { points: [] }; };
const errors = project => checkCircuit(project).filter(item => item.severity === 'error');
function circuit({ mode = 'hex', active = 'high', input = '0000', dp = '0', decoder = true } = {}) {
  const project = newProject('Display test'); Object.assign(project.analysis, { type: 'tran', duration: '3m', step: '1u' });
  const source = add(project, 'BUSIN', { width: decoder ? '4' : '8', value: input });
  const display = add(project, 'SEG7', { active });
  let digit, point;
  if (decoder) { digit = add(project, 'HEX7', { mode, active, delay: '10n' }); point = add(project, 'DIN', { state: dp }); wire(project, ep(source, 'out'), ep(digit, 'in')); wire(project, ep(point, 'out'), ep(digit, 'dp')); wire(project, ep(digit, 'out'), ep(display, 'in')); }
  else wire(project, ep(source, 'out'), ep(display, 'in'));
  project.circuit.labels.push({ id: uid('label'), name: 'segments', target: ep(display, 'in') });
  return { project, source, display, digit, point };
}
function run(project) {
  const generated = generateNetlist(project); assert.deepEqual(generated.diagnostics.filter(item => item.severity === 'error'), []);
  const plan = generated.simulation, digital = simulateDigital({ ...plan.digital, duration: plan.duration });
  return { id: uid('run'), projectId: project.id, revision: project.revision, projectSnapshot: clone(project), analysis: clone(project.analysis), status: 'completed', result: mergeEventResults(null, digital), measurements: generated.measurements, models: generated.modelManifest, diagnostics: generated.diagnostics, logs: [], netlist: generated.netlist, startedAt: '2026-10-24T13:00:00Z', completedAt: '2026-10-24T13:00:01Z' };
}
const displayOf = (project, result, time) => Object.values(displayStatesForRun(project, result, time))[0];

test('display and decoder have fixed explicit digital ports and original model provenance', () => {
  assert.deepEqual(DISPLAY_TYPES, ['HEX7', 'SEG7']);
  assert.deepEqual(getPins('SEG7').map(pin => [pin.id, pin.domain, pin.direction, pin.width]), [['in', 'digital', 'input', 8]]);
  assert.deepEqual(getPins('HEX7').map(pin => [pin.id, pin.width]), [['in', 4], ['dp', 1], ['out', 8]]);
  for (const type of DISPLAY_TYPES) { const part = getPart(type), model = MODELS[part.model]; assert.equal(model.license, 'MIT'); assert.equal(model.version, DISPLAY_MODEL_VERSION); assert.equal(part.category, 'Displays'); assert.ok(JSON.parse(model.definition).widthPolicy); assert.ok(DISPLAY_EXAMPLES.some(example => example.id === part.fixture)); }
});

test('a display is a passive observer and cannot silently accept a scalar or four-bit digit', () => {
  const { project, display, source } = circuit({ decoder: false, input: '00111111' }), plan = compileSimulation(project);
  assert.deepEqual(errors(project), []); assert.equal(plan.digital.gates.length, 0); assert.equal(plan.digital.sources.length, 8);
  assert.ok(buildDigitalNets(project).bits.every(bit => bit.drivers.length === 1 && bit.drivers[0].componentId === source.id));
  const scalar = add(project, 'DIN'), digit = add(project, 'BUSIN', { width: '4' });
  for (const input of [scalar, digit]) assert.equal(canConnect(project, ep(input, 'out'), ep(display, 'in')).ok, false);
});

test('all hexadecimal digits use the documented independent a-to-g segment masks', () => {
  const expected = ['00111111','00000110','01011011','01001111','01100110','01101101','01111101','00000111','01111111','01101111','01110111','01111100','00111001','01011110','01111001','01110001'];
  for (let digit = 0; digit < 16; digit++) { const { project } = circuit({ input: `0x${digit.toString(16)}` }); const state = displayOf(project, run(project)); assert.equal(state.word, expected[digit]); assert.equal(state.glyph, '0123456789AbCdEF'[digit]); }
});

test('active-low decoding complements every driven segment including decimal point', () => {
  const high = circuit({ input: '0xA', dp: '1' }), low = circuit({ input: '0xA', dp: '1', active: 'low' });
  const a = displayOf(high.project, run(high.project)), b = displayOf(low.project, run(low.project));
  assert.equal(a.word, '11110111'); assert.equal(b.word, '00001000'); assert.deepEqual(a.segments.map(segment => segment.on), b.segments.map(segment => segment.on)); assert.equal(b.glyph, 'A');
});

test('BCD blanks invalid digits while preserving an independent decimal point', () => {
  for (const active of ['high', 'low']) for (let digit = 10; digit < 16; digit++) { const { project } = circuit({ mode: 'bcd', input: `0x${digit.toString(16)}`, active, dp: '1' }); const state = displayOf(project, run(project)); assert.equal(state.glyph, 'blank'); assert.ok(state.segments.slice(0, 7).every(segment => !segment.on)); assert.equal(state.segments[7].on, true); }
});

test('uncertain decoder inputs preserve unanimous segments without guessing a digit', () => {
  for (const input of ['000X', '000Z']) { const { project } = circuit({ input }); const state = displayOf(project, run(project)); assert.equal(state.word, '00XXX11X'); assert.equal(state.glyph, '?'); assert.equal(state.status, 'uncertain'); assert.equal(state.segments[1].on, true); assert.equal(state.segments[2].on, true); }
  const { project } = circuit({ input: '0000', dp: 'Z' }); assert.equal(displayOf(project, run(project)).word, 'X0111111');
});

test('HEX7 compiles through existing LUT/BUF/NOT gates with actual propagation delay', () => {
  const { project, source, point, digit } = circuit(); source.type = 'PATTERN'; source.model = getPart('PATTERN').model; source.ref = 'PAT1'; source.params = { ...getPart('PATTERN').defaults, width: '4', pattern: '0,0000; 1m,0001' };
  point.type = 'PATTERN'; point.model = getPart('PATTERN').model; point.ref = 'PAT2'; point.params = { ...getPart('PATTERN').defaults, width: '1', pattern: '0,0; 1m,1' };
  const plan = compileSimulation(project); assert.equal(plan.digital.gates.length, 8); assert.equal(plan.digital.gates.filter(gate => gate.type === 'LUT').length, 7); assert.ok(plan.digital.gates.every(gate => gate.delay === 1e-8));
  const result = run(project); assert.equal(displayOf(project, result, .001).word, '00111111'); assert.equal(displayOf(project, result, .001 + 9e-9).word, '00111111'); assert.equal(displayOf(project, result, (.001 / 1e-12 + 10000) * 1e-12).word, '10000110');
  digit.params.delay = '0'; assert.ok(errors(project).some(error => /at least 1 ps/.test(error.message)));
});

test('the counter example displays captured count transitions and wraps through zero', () => {
  const project = DISPLAY_EXAMPLES.find(example => example.id === 'seven-segment-counter').create(), result = run(project);
  for (const [time, glyph] of [[0, '0'], [.0001 + 30e-9, '1'], [.0091 + 30e-9, 'A'], [.0141 + 30e-9, 'F'], [.0151 + 30e-9, '0']]) assert.equal(displayOf(project, result, time).glyph, glyph);
  assert.ok(result.result.digitalEvents.some(trace => trace.name === 'b(segments)'));
});

test('direct pattern example visibly preserves X, Z, decimal point and custom segments', () => {
  const project = DISPLAY_EXAMPLES.find(example => example.id === 'seven-segment-states').create(), result = run(project);
  assert.equal(displayOf(project, result, .0005).glyph, '0'); assert.equal(displayOf(project, result, .0015).segments[7].on, true);
  assert.ok(displayOf(project, result, .0025).segments.every(segment => segment.state === 'unknown'));
  assert.ok(displayOf(project, result, .0035).segments.every(segment => segment.state === 'released'));
  assert.deepEqual(displayOf(project, result, .0045).segments.filter(segment => segment.on).map(segment => segment.name), ['g']);
});

test('display readback selects right-continuous event values without dense-sample interpolation', () => {
  const project = DISPLAY_EXAMPLES[1].create(), result = run(project);
  result.result.vectors.find(vector => vector.name === 'b(segments)').values.fill('11111111');
  assert.equal(displayOf(project, result, .001 - 1e-12).word, '00111111'); assert.equal(displayOf(project, result, .001).word, '10000110');
  assert.equal(displayOf(project, result).word, '01000000');
  for (const time of [-1, NaN, Infinity, .005]) assert.equal(displayOf(project, result, time).available, false);
});

test('no run or unrelated run stays neutral and cannot light the current circuit', () => {
  const { project } = circuit(), result = run(project);
  assert.ok(displayOf(project, null).segments.every(segment => segment.state === 'unobserved'));
  for (const mutate of [r => r.projectId = 'other', r => r.revision++, r => r.projectSnapshot.revision++, r => delete r.projectSnapshot, r => r.status = 'failed', r => r.analysis.type = 'ac', r => delete r.result.digitalEvents]) { const changed = clone(result); mutate(changed); assert.equal(displayOf(project, changed).available, false); }
  project.revision++; assert.equal(displayOf(project, result).available, false);
});

test('a running or paused continuous chunk can render only its retained time range', () => {
  const { project } = circuit(), result = run(project);
  for (const status of ['running', 'paused']) { result.status = status; assert.equal(displayOf(project, result).available, true); assert.equal(displayOf(project, result, 1).available, false); }
});

test('malformed or mismatched preserved display evidence is unavailable', () => {
  const project = DISPLAY_EXAMPLES[1].create(), result = run(project);
  for (const mutate of [r => r.result.digitalEvents[0].events[0].value = '12345678', r => r.result.digitalEvents[0].events[1].time = 0, r => r.result.digitalEvents[0].events[0].time = .0001, r => r.result.digitalEvents[0].width = 7, r => r.result.digitalEvents[0].bitOrder = 'lsb-first', r => r.result.digitalEvents.push(clone(r.result.digitalEvents[0])), r => r.result.vectors.find(vector => vector.name === 'b(segments)').width = 4]) { const bad = clone(result); mutate(bad); assert.equal(displayOf(project, bad).available, false); }
});

test('rendered segment artwork labels each bit and distinguishes unknown from released', () => {
  const x = { available: true, word: 'XXXXXXXX', active: 'high', time: 1 }, z = { ...x, word: 'ZZZZZZZZ' };
  const xm = sevenSegmentMarkup(x), zm = sevenSegmentMarkup(z);
  for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp']) { assert.match(xm, new RegExp(`data-segment="${name}" data-state="X"`)); assert.match(zm, new RegExp(`data-segment="${name}" data-state="Z"`)); }
  assert.match(xm, />X<\/text>/); assert.match(zm, /stroke-dasharray/); assert.match(zm, />Z<\/text>/);
  assert.match(sevenSegmentMarkup(), /not observed/); assert.throws(() => segmentStates('1100')); assert.throws(() => segmentStates('00111111', 'negative'));
});

test('schematic symbols and editor receive observed state with accessible literal text', () => {
  const { project } = circuit({ input: '0x8' }), result = run(project), states = displayStatesForRun(project, result), state = Object.values(states)[0];
  assert.match(symbolMarkup('SEG7', { active: 'high' }, state), /data-display-word="01111111"/); assert.match(symbolMarkup('HEX7', { mode: 'bcd' }), />BCD</);
  const editor = Object.create(SchematicEditor.prototype); editor.callbacks = { getDisplayStates: passed => { assert.equal(passed, project); return states; } }; editor.selection = new Set();
  const svg = editor.renderComponents(project, buildNets(project).endpointToNet); assert.match(svg, /8 · 01111111/); assert.match(svg, /data-display-word="01111111"/); assert.match(svg, /8-bit digital input/);
  state.ref = '<script>alert(1)</script>'; const panel = displayPanelMarkup(states); assert.ok(!panel.includes('<script>')); assert.match(panel, /&lt;script&gt;/); assert.match(panel, /Bits 7…0/);
});

test('saved display circuits and their working results survive portable backups unchanged', () => {
  for (const example of DISPLAY_EXAMPLES) { const project = example.create(), result = run(project); assert.deepEqual(parseProject(serializeProject(project)), project); const saved = safeEnvelope(JSON.parse(JSON.stringify({ format: 'CircuitBench', formatVersion: 1, project, runs: [result], activeRunId: result.id })), validateProject); assert.equal(displayOf(saved.project, saved.runs[0]).word, displayOf(project, result).word); }
});

test('display polarity and decoder options reject unsupported serialized settings', () => {
  for (const [type, key] of [['SEG7', 'active'], ['HEX7', 'active'], ['HEX7', 'mode']]) { const { project } = circuit(), component = project.circuit.components.find(component => component.type === type); component.params[key] = '<invalid>'; assert.throws(() => validateProject(project), /unsupported/); assert.ok(errors(project).some(error => /must be one of/.test(error.message))); }
});
