/** Real production event workers + ngspice WASM replay proof. No browser claim.
 * Run: node scripts/prove-digital.mjs
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'circuitbench-digital-proof-'));
await fs.cp(path.join(root, 'src'), path.join(stage, 'src'), { recursive: true });
await fs.mkdir(path.join(stage, 'engine')); await fs.writeFile(path.join(stage, 'package.json'), '{"type":"module"}');
for (const name of ['eecircuit-engine.js', 'spice.wasm']) await fs.copyFile(path.join(root, 'public/engine', name), path.join(stage, 'engine', name));
const lifecycle = { created: 0, terminated: 0, alive: 0, digital: 0, analog: 0 }, exits = [];
globalThis.Worker = class {
  constructor(target) {
    lifecycle.created++; lifecycle.alive++; lifecycle[String(target).includes('/digital-worker.js') ? 'digital' : 'analog']++;
    const thread = this.thread = new NodeWorker(new URL('./engine-node-worker.mjs', import.meta.url), { workerData: { target: String(target) } });
    thread.on('message', data => this.onmessage?.({ data })); thread.on('error', error => this.onerror?.({ message: error.message, preventDefault() {} }));
    exits.push(new Promise(resolve => thread.on('exit', () => { lifecycle.alive--; resolve(); })));
  }
  postMessage(message) { this.thread.postMessage(message); }
  terminate() { lifecycle.terminated++; return this.thread.terminate(); }
};
const { WorkbenchEngine } = await import(pathToFileURL(path.join(stage, 'src/simulation.js')));
const { CircuitEngine, ENGINE_INFO } = await import(pathToFileURL(path.join(stage, 'src/engine.js')));
const { DIGITAL_ENGINE_INFO } = await import(pathToFileURL(path.join(stage, 'src/digital.js')));
const { newProject, addComponent, uid, validateProject } = await import(pathToFileURL(path.join(stage, 'src/model.js')));
const { generateNetlist } = await import(pathToFileURL(path.join(stage, 'src/netlist.js')));
const { EXAMPLES } = await import(pathToFileURL(path.join(stage, 'src/examples.js')));
const engine = new WorkbenchEngine(), native = new CircuitEngine(), checks = [], records = [], truthTables = [];
const numeric = (name, actual, expected, tolerance) => { const pass = Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance; checks.push({ name, actual, expected, absoluteTolerance: tolerance, pass }); if (!pass) throw new Error(`${name}: ${actual} != ${expected} ± ${tolerance}`); };
const verify = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass), detail }); if (!pass) throw new Error(name + (detail ? ': ' + JSON.stringify(detail) : '')); };
const value = (result, name) => result.vectors.find(v => v.name === name)?.values;
const interpolate = (xs, ys, x) => { let i = xs.findIndex(t => t >= x); if (i <= 0) return i === 0 ? ys[0] : ys.at(-1); return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]); };
const crossing = (result, vector, threshold) => { const ts = value(result, 'time'), vs = value(result, vector); for (let i = 1; i < ts.length; i++) if (vs[i - 1] < threshold && vs[i] >= threshold) return ts[i - 1] + (threshold - vs[i - 1]) * (ts[i] - ts[i - 1]) / (vs[i] - vs[i - 1]); throw new Error(`Missing crossing ${vector}/${threshold}`); };
const part = (p, type, params = {}) => { const c = addComponent(p, type, 120 + p.circuit.components.length * 80, 200); Object.assign(c.params, params); return c; };
const ep = (c, pin) => `${c.id}:${pin}`;
const wire = (p, a, b) => { const id = uid('w'); p.circuit.connections.push({ id, a, b }); p.layout.wires[id] = { points: [] }; };
const label = (p, endpoint, name) => p.circuit.labels.push({ id: uid('l'), target: endpoint, name });
function project(title, duration = '11u') { const p = newProject(title); Object.assign(p.analysis, { type: 'tran', step: '5n', duration, reltol: '1e-7', uic: false }); return p; }
function dacFixture() {
  const p = project('Proof · digital clock, finite DAC and analog RC');
  const clk = part(p, 'CLOCK', { period: '10u', duty: '50', delay: '1u' }), dac = part(p, 'DAC', { rise: '10n', fall: '10n' });
  const r = part(p, 'R', { value: '1k' }), c = part(p, 'C', { value: '1n' }), g = part(p, 'GND');
  wire(p, ep(clk, 'out'), ep(dac, 'in')); wire(p, ep(dac, 'out'), ep(r, '1')); wire(p, ep(r, '2'), ep(c, '1')); wire(p, ep(c, '2'), ep(g, '0')); wire(p, ep(dac, 'ref'), ep(g, '0'));
  label(p, ep(clk, 'out'), 'clock'); label(p, ep(dac, 'out'), 'drive'); label(p, ep(c, '1'), 'out'); return validateProject(p);
}
function chainFixture(mode = 'schmitt', includeDAC = true) {
  const p = project(`Proof · analog ${mode} ADC, logic and ${includeDAC ? 'DAC RC output' : 'digital output'}`, '9u');
  const input = part(p, 'V', { dc: '0', ac: '0', waveform: 'pwl', pwl: '0,0; 1u,0; 3u,5; 5u,5; 7u,0; 9u,0' }), load = part(p, 'R', { value: '10k' });
  const adc = part(p, 'ADC', { low: '1', high: '4', mode }), buffer = part(p, 'BUF', { delay: '20n' }), ground = part(p, 'GND');
  wire(p, ep(input, 'p'), ep(adc, 'in')); wire(p, ep(input, 'p'), ep(load, '1')); wire(p, ep(input, 'n'), ep(ground, '0')); wire(p, ep(load, '2'), ep(ground, '0')); wire(p, ep(adc, 'ref'), ep(ground, '0')); wire(p, ep(adc, 'out'), ep(buffer, 'in'));
  label(p, ep(input, 'p'), 'sense'); label(p, ep(adc, 'out'), 'decision'); label(p, ep(buffer, 'out'), 'logic_out');
  if (includeDAC) { const dac = part(p, 'DAC', { rise: '10n', fall: '10n' }), r = part(p, 'R', { value: '1k' }), c = part(p, 'C', { value: '1n' }); wire(p, ep(buffer, 'out'), ep(dac, 'in')); wire(p, ep(dac, 'out'), ep(r, '1')); wire(p, ep(dac, 'ref'), ep(ground, '0')); wire(p, ep(r, '2'), ep(c, '1')); wire(p, ep(c, '2'), ep(ground, '0')); label(p, ep(c, '1'), 'out'); }
  return validateProject(p);
}
async function execute(id, p) {
  const generated = generateNetlist(p), errors = generated.diagnostics.filter(d => d.severity === 'error');
  verify(`${id}: generated project has no electrical errors`, !errors.length, errors);
  const result = await engine.run(generated.netlist, { project: p, generated, timeoutMs: 15000 });
  verify(`${id}: expected ${generated.simulation.mode} execution`, result.engine.mode === generated.simulation.mode);
  verify(`${id}: complete aligned vectors`, result.vectors.every(v => v.values.length === result.points));
  verify(`${id}: strictly increasing shared time`, value(result, 'time').every((x, i, xs) => !i || x > xs[i - 1]));
  records.push({ id, projectTitle: p.title, mode: result.engine.mode, points: result.points, analogPoints: result.analogPoints, digitalEvents: result.digitalEvents, sampling: { ...result.sampling, analogSampleIndices: undefined, originalAnalogSamples: result.sampling.analogSampleIndices.length }, analogNetlists: result.analogNetlists, warnings: result.warnings });
  console.log(`${id}: ${result.engine.mode}, ${result.points} shared rows, ${result.analogNetlists.length} actual analog passes`);
  return result;
}
const dac = await execute('clock_dac_rc', dacFixture());
const tau = 1e-6, rise = 1e-8, k = tau / rise * (1 - Math.exp(-rise / tau));
numeric('Clock DAC RC rising 1.5 V crossing', crossing(dac, 'v(out)', 1.5), 1.01e-6 - tau * Math.log((1 - 1.5 / 5) / k), 20e-12);
numeric('Clock DAC RC rising 3.5 V crossing', crossing(dac, 'v(out)', 3.5), 1.01e-6 - tau * Math.log((1 - 3.5 / 5) / k), 20e-12);
const threshold = await execute('analog_threshold_adc', chainFixture('threshold', false));
const thresholdEvents = threshold.digitalEvents.find(t => t.name === 'd(decision)').events;
verify('Threshold ADC preserves 0/X/1/X/0 intervals', thresholdEvents.map(e => e.value).join('') === '0X1X0');
for (const [i, expected] of [[1, 1.4e-6], [2, 2.6e-6], [3, 5.4e-6], [4, 6.6e-6]]) numeric(`Threshold ADC event ${i}`, thresholdEvents[i].time, expected, 1e-12);
const chainProject = chainFixture(), chain = await execute('analog_schmitt_logic_dac_rc', chainProject);
const decisions = chain.digitalEvents.find(t => t.name === 'd(decision)').events, delayed = chain.digitalEvents.find(t => t.name === 'd(logic_out)').events;
verify('Schmitt ADC emits known 0/1/0', decisions.map(e => e.value).join('') === '010');
numeric('Schmitt rising decision', decisions[1].time, 2.6e-6, 1e-12); numeric('Schmitt falling decision', decisions[2].time, 6.6e-6, 1e-12);
numeric('Digital propagation after ADC rising', delayed[1].time - decisions[1].time, 20e-9, 1e-12);
const at4us = interpolate(value(chain, 'time'), value(chain, 'v(out)'), 4e-6);
numeric('Feed-forward Schmitt/DAC RC analog result at 4 us', at4us, 5 * (1 - k * Math.exp(-(4e-6 - 2.63e-6) / tau)), 20e-6);
const finalNative = await native.run(chain.analogNetlists.at(-1));
let preservation = true;
for (const vector of finalNative.vectors) { const merged = value(chain, vector.name); for (let i = 0; i < vector.values.length; i++) if (merged[chain.sampling.analogSampleIndices[i]] !== vector.values[i]) preservation = false; }
verify('Every original ngspice time and value survives event union exactly', preservation);
const again = await engine.run(generateNetlist(chainProject).netlist, { project: chainProject, generated: generateNetlist(chainProject) });
verify('Fresh complete mixed replay is deterministic', JSON.stringify(again.vectors) === JSON.stringify(chain.vectors) && JSON.stringify(again.digitalEvents) === JSON.stringify(chain.digitalEvents));
const bad = chainFixture('threshold'); let rejection;
try { await engine.run(generateNetlist(bad).netlist, { project: bad, generated: generateNetlist(bad) }); } catch (error) { rejection = { status: error.status, code: error.code, message: error.message }; }
verify('Unknown threshold band is rejected before DAC replay', rejection?.status === 'failed' && rejection?.code === 'DAC_UNKNOWN', rejection);
for (const example of EXAMPLES) {
  const p = example.create(); if (!generateNetlist(p).simulation) continue;
  const result = await execute(`example:${example.id}`, p);
  const trace = name => result.digitalEvents.find(t => t.name === `d(${name})`).events;
  const bus = name => result.digitalEvents.find(t => t.name === `b(${name})`).events;
  const stateAt = (name, time) => trace(name).filter(event => event.time <= time).at(-1).value;
  if (example.id === 'digital-half-adder') {
    for (const [t, a, b, sum, carry] of [[.0005, '1', '1', '0', '1'], [.0015, '0', '1', '1', '0'], [.0025, '1', '0', '1', '0'], [.0035, '0', '0', '0', '0']])
      verify(`Half-adder truth at ${t} s`, ['a', 'b', 'sum', 'carry'].map(name => stateAt(name, t)).join('') === [a, b, sum, carry].join(''));
  } else if (example.id === 'logic-gates') {
    for (const [name, expected] of Object.entries({ and: '0', nand: '1', buf: 'X', not: 'X', or: 'X', nor: 'X', xor: 'X', xnor: 'X' })) verify(`Unknown logic example ${name}`, trace(name)[0].value === expected);
  } else if (example.id === 'dff-divider') {
    const q = trace('q'); verify('DFF divider alternating states', q.map(e => e.value).join('') === '010101');
    for (let i = 1; i < q.length; i++) numeric(`DFF divider event ${i}`, q[i].time, .0001 + (i - 1) * .001 + 1e-8, 1e-12);
  } else if (example.id === 'tri-state-bus') {
    verify('Tri-state example includes 0, contention X, 1 and undriven Z', trace('bus').slice(0, 4).map(e => e.value).join('') === '0X1Z');
    numeric('Tri-state first contention delay', trace('bus')[1].time, .00100001, 1e-12);
  } else if (example.id === 'clock-dac-rc') {
    const tau = 1e-4, rise = 1e-6, factor = tau / rise * (1 - Math.exp(-rise / tau));
    numeric('Authored clock-DAC RC at 350 us', interpolate(value(result, 'time'), value(result, 'v(filtered)'), 350e-6), 5 * (1 - factor * Math.exp(-(350e-6 - 101e-6) / tau)), .002);
  } else if (example.id === 'adc-ramp') {
    const bit = trace('bit'); verify('Authored ADC ramp threshold sequence', bit.map(e => e.value).join('') === '0X1X0');
    for (const [i, t] of [[1, .0015], [2, .0035], [3, .0065], [4, .0085]]) numeric(`Authored ADC ramp event ${i}`, bit[i].time, t, 1e-12);
  } else if (example.id === 'mixed-chain') {
    for (const [time, expected] of [[0, 5], [.005, 0], [.009, 5]]) numeric(`Authored complete mixed chain at ${time} s`, interpolate(value(result, 'time'), value(result, 'v(out)'), time), expected, 1e-6);
    verify('Authored complete mixed chain performed two actual analog passes', result.analogNetlists.length === 2);
  } else if (example.id === 'bus-slice-join') {
    for (const [name, expected] of Object.entries({ word: '10Z1', low: 'Z1', high: '10', joined: '10Z1' })) verify(`Bus alias ${name} preserves its literal word`, bus(name).length === 1 && bus(name)[0].value === expected);
    verify('Scalar slice preserves released bit 1', trace('bit1')[0].value === 'Z');
    const compiled = generateNetlist(p).simulation.digital;
    verify('Visible buses carry explicit MSB-first metadata without private bit duplicates', result.vectors.filter(v => v.kind === 'bus').every(v => v.unit === 'logic' && v.width >= 2 && v.bitOrder === 'msb-first') && compiled.hiddenNodes.every(node => !result.vectors.some(v => v.name === `d(${node})`)));
  } else if (example.id === 'bus-register') {
    const q = bus('q'), expected = [[0, '0000'], [.0005 + 1e-8, '0001'], [.0015 + 1e-8, '0010'], [.0045 + 1e-8, '1111'], [.0055 + 1e-8, '0000']];
    verify('Register captures whole words, holds disabled cycles and synchronously resets', JSON.stringify(q.map(e => e.value)) === JSON.stringify(expected.map(e => e[1])));
    for (let i = 1; i < q.length; i++) numeric(`Register word event ${i}`, q[i].time, expected[i][0], 1e-12);
  } else if (example.id === 'bus-counter') {
    const count = bus('count'), words = ['1110', '1111', '0000', '0001', '0010', '0000', '0001', '0010', '0011'];
    verify('Counter initial value, wrap, reset and resumed count match exact words', JSON.stringify(count.map(e => e.value)) === JSON.stringify(words));
    for (let i = 1; i < count.length; i++) numeric(`Counter word event ${i}`, count[i].time, .0001 + (i - 1) * .001 + 1e-8, 1e-12);
    verify('Counter scalar bit tap matches each settled word', count.every(event => stateAt('q0', event.time) === event.value.at(-1)));
  } else if (example.id === 'bus-mux-decoder') {
    for (const [name, expected, delay] of [['chosen', ['01', '10', 'XX', '01'], 1e-8], ['decoded', ['0010', '0100', 'XXXX', '0010'], 2e-8]]) {
      const events = bus(name); verify(`${name}: known selections and unknown interval are literal words`, JSON.stringify(events.map(e => e.value)) === JSON.stringify(expected));
      for (let i = 1; i < events.length; i++) numeric(`${name} event ${i} transport timing`, events[i].time, i * .001 + delay, 1e-12);
    }
  } else if (example.id === 'truth-table-adder') {
    verify('Authored LUT initial 11 input gives Carry:Sum 10', bus('sumcarry')[0].value === '10' && trace('sum')[0].value === '0' && trace('carry')[0].value === '1');
    const generated = generateNetlist(p), table = await engine.runTruthTable(generated, { inputIds: generated.simulation.digital.inputGroups.map(group => group.id), outputNames: ['b(sumcarry)', 'd(sum)', 'd(carry)'] });
    verify('Actual truth-table worker enumerates binary input order and half-adder outputs', JSON.stringify(table.rows.map(row => [row.inputs[0], ...row.outputs])) === JSON.stringify([['00', '00', '0', '0'], ['01', '01', '1', '0'], ['10', '01', '1', '0'], ['11', '10', '0', '1']]));
    verify('Actual truth-table worker preserves bus/scalar metadata', table.inputs.every(input => input.bitOrder === 'msb-first') && table.outputs.every(output => output.bitOrder === 'msb-first') && table.outputs[0].kind === 'bus' && table.outputs[0].width === 2 && table.outputs[1].kind === 'logic' && table.outputs[1].width === 1);
    numeric('Truth-table row settling uses LUT transport delay', table.settleTime, 1e-8 + 2e-12, 1e-15);
    truthTables.push({ id: example.id, result: table });
  } else if (example.id === 'bus-dac-bit') {
    verify('Bus bit DAC stimulus preserves full word and scalar edge sequences', bus('word').map(e => e.value).join(',') === '0000,0100,0000' && trace('bit2').map(e => e.value).join('') === '010');
    numeric('Selected bus bit rising edge', trace('bit2')[1].time, .001, 1e-12); numeric('Selected bus bit falling edge', trace('bit2')[2].time, .002, 1e-12);
    const tau = 1e-4, edge = 1e-6, factor = tau / edge * (1 - Math.exp(-edge / tau)), rising = time => time <= .001 ? 0 : 5 * (1 - factor * Math.exp(-(time - .001 - edge) / tau));
    numeric('Bus DAC RC at 1.3 ms', interpolate(value(result, 'time'), value(result, 'v(filtered)'), .0013), rising(.0013), .002);
    numeric('Bus DAC RC at 2.3 ms', interpolate(value(result, 'time'), value(result, 'v(filtered)'), .0023), rising(.0023) - rising(.0013), .002);
    const original = await native.run(result.analogNetlists.at(-1));
    verify('Mixed bus result preserves every original analog sample exactly', original.vectors.every(vector => vector.values.every((sample, index) => value(result, vector.name)[result.sampling.analogSampleIndices[index]] === sample)));
  }
}
await Promise.all(exits); verify('All created workers were physically terminated', lifecycle.created === lifecycle.terminated && lifecycle.alive === 0, lifecycle);
const sourceHashes = {};
for (const name of ['digital.js', 'digital-worker.js', 'digital-engine.js', 'simulation.js', 'model.js', 'netlist.js', 'library.js', 'examples.js']) sourceHashes[name] = crypto.createHash('sha256').update(await fs.readFile(path.join(stage, 'src', name))).digest('hex');
const report = { status: 'passed', recordedAt: new Date().toISOString(), environment: { node: process.version, method: 'Production browser modules in Node Worker API shim; actual event kernel and pinned ngspice WASM. No browser/UI or secure offline claim.' }, analogEngine: ENGINE_INFO, digitalEngine: DIGITAL_ENGINE_INFO, sourceHashes, lifecycle, checks, fixtures: records, truthTables, limitations: ['WASM was compiled without XSPICE; digital events come from the explicit CircuitBench kernel.', 'Feed-forward replay rejects analog DAC-to-ADC dependency and does not solve analog/digital feedback.', 'ADC crossing timing is reconstructed between recorded analog samples at 1 ps event resolution.', 'DAC X/Z inputs are rejected; no drive-strength, metastability, setup/hold or HDL claim.', 'Full truth tables cover at most 8 selected constant input bits and 32 output columns in a pure combinational circuit; they do not replace transient hazard analysis.'] };
await fs.writeFile(path.join(root, 'evidence/digital-validation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, checks: checks.length, fixtures: records.length, truthTables: truthTables.length, lifecycle, evidence: 'evidence/digital-validation.json' }, null, 2));
