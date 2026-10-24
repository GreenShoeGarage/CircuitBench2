/** Deterministic four-state event simulation. This is not a SPICE device model. */
export const DIGITAL_ENGINE_INFO = Object.freeze({ name: 'CircuitBench event logic', version: '2',
  package: 'CircuitBench event kernel', packageVersion: '2', build: 'cb-digital-kernel-2',
  execution: 'JavaScript · isolated Web Worker · fresh instance per run',
  states: ['0', '1', 'X', 'Z'], timeResolution: 1e-12, delayModel: 'transport',
  initialization: 'Combinational logic settles at time zero; flip-flops, registers and counters use their explicit initial state.',
  simultaneousInputs: 'All driver changes at one timestamp resolve together. Rising-edge state elements sample the resulting inputs; register and counter words update atomically.',
  sequentialControls: 'Register/counter reset and enable are synchronous and active high; reset wins. Ambiguous edges or controls retain only bit values common to every possible outcome.',
  limitations: 'No setup/hold, metastability, drive strengths, HDL, or analog feedback coupling.' });
export const DIGITAL_LIMITS = Object.freeze({ events: 200000, nodes: 255, elements: 600, samples: 2000000, points: 250000 });
const Q = DIGITAL_ENGINE_INFO.timeResolution, STATES = new Set(DIGITAL_ENGINE_INFO.states);
const logicError = (message, code = 'DIGITAL_INVALID') => Object.assign(new Error(message), { status: 'failed', code, phase: 'digital-simulation' });
const known = value => value === '0' || value === '1';
export function logicState(value) { const state = String(value).toUpperCase(); if (!STATES.has(state)) throw logicError(`Invalid logic state ${String(value)}. Use 0, 1, X, or Z.`); return state; }
export function resolveLogic(values) {
  const driven = values.map(logicState).filter(value => value !== 'Z');
  if (!driven.length) return 'Z';
  return driven.every(value => value === driven[0]) ? driven[0] : 'X';
}
export function evaluateGate(type, values, config = {}) {
  const v = values.map(logicState), kind = String(type).toUpperCase();
  const invert = value => value === '0' ? '1' : value === '1' ? '0' : 'X';
  if (kind === 'BUF') return known(v[0]) ? v[0] : 'X';
  if (kind === 'NOT') return invert(v[0]);
  if (kind === 'TRI') return v[1] === '0' ? 'Z' : v[1] === '1' && known(v[0]) ? v[0] : 'X';
  if (kind === 'MUX') {
    if (v[2] === '0') return known(v[0]) ? v[0] : 'X';
    if (v[2] === '1') return known(v[1]) ? v[1] : 'X';
    return known(v[0]) && v[0] === v[1] ? v[0] : 'X';
  }
  if (kind === 'LUT') {
    if (v.length < 1 || v.length > 4 || !Array.isArray(config.table) || config.table.length !== 2 ** v.length) throw logicError('A LUT requires 1–4 input bits and one output state for every binary address.');
    const candidates = [];
    for (let address = 0; address < config.table.length; address++) if (v.every((state, bit) => !known(state) || Number(state) === (address >> bit & 1))) candidates.push(logicState(config.table[address]));
    return candidates.every(state => state === candidates[0]) ? candidates[0] : 'X';
  }
  let result;
  if (kind === 'AND' || kind === 'NAND') result = v.includes('0') ? '0' : v.every(x => x === '1') ? '1' : 'X';
  else if (kind === 'OR' || kind === 'NOR') result = v.includes('1') ? '1' : v.every(x => x === '0') ? '0' : 'X';
  else if (kind === 'XOR' || kind === 'XNOR') result = v.every(known) ? String(v.reduce((sum, x) => sum ^ Number(x), 0)) : 'X';
  else throw logicError(`Unsupported digital gate ${type}.`);
  return ['NAND', 'NOR', 'XNOR'].includes(kind) ? invert(result) : result;
}
function tick(time, label, allowZero = true) {
  if (!Number.isFinite(time) || time < 0 || (!allowZero && time < Q)) throw logicError(`${label} must be ${allowZero ? 'nonnegative' : 'at least 1 ps'}.`);
  const value = Math.round(time / Q);
  if (!Number.isSafeInteger(value) || (!allowZero && value < 1)) throw logicError(`${label} is outside the supported 1 ps timing range.`);
  return value;
}
const seconds = ticks => ticks * Q;
const consensus = values => values.every(value => value === values[0]) ? values[0] : 'X';
function mergeWords(a, b) { return a.map((value, bit) => consensus([value, b[bit]])); }
function incrementWord(bits) {
  let carry = '1';
  return bits.map(bit => { const value = evaluateGate('XOR', [bit, carry]); carry = evaluateGate('AND', [bit, carry]); return value; });
}

class EventQueue {
  constructor() { this.items = []; this.serial = 0; }
  less(a, b) { return a.at < b.at || a.at === b.at && a.order < b.order; }
  push(event) { const a = this.items; event.order = this.serial++; a.push(event); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; } }
  pop() { const a = this.items, first = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; while (true) { let n = i, l = 2 * i + 1, r = l + 1; if (l < a.length && this.less(a[l], a[n])) n = l; if (r < a.length && this.less(a[r], a[n])) n = r; if (n === i) break; [a[i], a[n]] = [a[n], a[i]]; i = n; } } return first; }
  get length() { return this.items.length; }
  get first() { return this.items[0]; }
}

/** Returns change-only events; positive gate delays use transport semantics.
 * A pulse is not filtered by gate delay. Same-time driver changes are atomic.
 * Z is undriven on a net and unknown at ordinary gate inputs. Conflicting
 * driven values resolve to X. DFF clock 0->1 samples post-batch D; an ambiguous
 * possible rising edge (0->X/Z or X/Z->1) sets Q to X. No implicit edge at t=0.
 * Registers/counters keep private word state, independent of resolved output
 * contention. They capture post-batch inputs and synchronous reset/enable at a
 * possible rising edge, then publish the word after the positive transport
 * delay. Unknown controls or uncertain edges use per-bit outcome consensus.
 */
export function simulateDigital(plan, { sources: injectedSources = [], maxEvents = DIGITAL_LIMITS.events } = {}) {
  if (!plan || typeof plan !== 'object') throw logicError('A compiled digital plan is required.');
  const durationTick = tick(plan.duration, 'Digital duration', false), duration = seconds(durationTick);
  const budget = Math.min(DIGITAL_LIMITS.events, Math.max(1, Number(maxEvents) || DIGITAL_LIMITS.events));
  const sources = [...(plan.sources || []), ...injectedSources], gates = (plan.gates || []).map(gate => ({ ...gate, type: String(gate.type).toUpperCase(), inputs: [...(gate.inputs || [])] }));
  const sequential = (plan.sequential || []).map(group => ({ ...group, outputs: [...(group.outputs || [])], inputs: [...(group.inputs || [])], sequential: true }));
  if (sources.length + gates.length + sequential.reduce((n, group) => n + group.outputs.length, 0) > DIGITAL_LIMITS.elements) throw logicError('Digital element budget exceeded.', 'DIGITAL_LIMIT');
  const drivers = new Map(), netDrivers = new Map(), netValues = new Map(), consumers = new Map(), ids = new Set(), names = new Set();
  function node(name) { if (typeof name !== 'string' || !/^[a-zA-Z0-9_]+$/.test(name) || name.length > 80) throw logicError(`Invalid digital net ${String(name)}.`); names.add(name); if (!netDrivers.has(name)) netDrivers.set(name, []); return name; }
  function driver(element) { if (!element.id || ids.has(element.id)) throw logicError(`Digital element identifiers must be unique: ${element.id}.`); ids.add(element.id); node(element.output); drivers.set(element.id, { output: element.output, value: 'Z' }); netDrivers.get(element.output).push(element.id); }
  for (const source of sources) driver(source);
  for (const gate of gates) {
    driver(gate); const arity = ['BUF', 'NOT'].includes(gate.type) ? 1 : gate.type === 'MUX' ? 3 : gate.type === 'LUT' ? gate.inputs.length : 2;
    if (!['BUF', 'NOT', 'AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', 'TRI', 'DFF', 'MUX', 'LUT'].includes(gate.type) || gate.inputs.length !== arity) throw logicError(`${gate.id}: invalid ${gate.type} gate inputs.`);
    if (gate.type === 'LUT') evaluateGate('LUT', gate.inputs.map(() => 'X'), gate);
    gate.delayTick = tick(gate.delay, `${gate.id} propagation delay`, false);
    for (const input of gate.inputs) { node(input); if (!consumers.has(input)) consumers.set(input, new Set()); consumers.get(input).add(gate); }
    if (gate.type === 'DFF') { const initial = logicState(gate.initial ?? 'X'); if (initial === 'Z') throw logicError(`${gate.id}: a flip-flop initial state must be 0, 1, or X.`); drivers.get(gate.id).value = initial; }
  }
  for (const group of sequential) {
    if (!group.id || ids.has(group.id)) throw logicError(`Sequential element identifiers must be unique: ${group.id}.`);
    ids.add(group.id);
    const width = group.outputs.length;
    if (!['REGISTER', 'COUNTER'].includes(group.type) || width < 1 || width > 8 || group.type === 'REGISTER' && group.inputs.length !== width || group.type === 'COUNTER' && group.inputs.length) throw logicError(`${group.id}: invalid synchronous register/counter shape.`);
    if (typeof group.initial !== 'string' || !/^[01X]+$/.test(group.initial) || group.initial.length !== width) throw logicError(`${group.id}: initial state must be an MSB-first ${width}-bit 0/1/X word.`);
    group.delayTick = tick(group.delay, `${group.id} clock-to-output delay`, false);
    group.state = group.initial.split('').reverse();
    group.driverIds = group.outputs.map((output, bit) => { const id = `${group.id}__state_${bit}`; driver({ id, output }); drivers.get(id).value = group.state[bit]; return id; });
    for (const input of [...group.inputs, group.clock, group.enable, group.reset]) { node(input); if (!consumers.has(input)) consumers.set(input, new Set()); consumers.get(input).add(group); }
  }
  const buses = (plan.buses || []).map(bus => {
    if (!bus || typeof bus.name !== 'string' || bus.name.length > 120 || !Number.isInteger(bus.width) || bus.width < 2 || bus.width > 8 || !Array.isArray(bus.bits) || bus.bits.length !== bus.width) throw logicError('Bus descriptors require a name, width 2–8 and LSB-first bit nets.');
    bus.bits.forEach(node); return { ...bus, bits: [...bus.bits] };
  });
  if (new Set(buses.map(bus => bus.name)).size !== buses.length) throw logicError('Bus trace names must be unique.');
  if (names.size > DIGITAL_LIMITS.nodes) throw logicError(`Digital results support at most ${DIGITAL_LIMITS.nodes} nets.`, 'DIGITAL_LIMIT');
  const comb = gates.filter(gate => gate.type !== 'DFF'), combById = new Map(comb.map(gate => [gate.id, gate]));
  const dependencies = new Map(comb.map(gate => [gate.id, new Set(gate.inputs.flatMap(input => netDrivers.get(input)).filter(id => combById.has(id)))]));
  const sorted = [], ready = comb.filter(gate => dependencies.get(gate.id).size === 0);
  while (ready.length) { const gate = ready.shift(); sorted.push(gate); for (const next of comb) if (dependencies.get(next.id).delete(gate.id) && !dependencies.get(next.id).size) ready.push(next); }
  if (sorted.length !== comb.length) throw logicError('Combinational digital feedback is not supported. Break the loop with an explicit flip-flop.', 'DIGITAL_FEEDBACK');
  const queue = new EventQueue(); let scheduled = 0, processed = 0;
  function schedule(id, at, value) { if (at > durationTick) return; if (++scheduled > budget) throw logicError(`Digital event budget of ${budget} was exceeded. Shorten the run or slow the clocks.`, 'DIGITAL_LIMIT'); queue.push({ id, at, value: logicState(value) }); }
  for (const source of sources) {
    const d = drivers.get(source.id);
    if (source.kind === 'constant') d.value = logicState(source.value);
    else if (source.kind === 'events' || source.kind === 'pattern') {
      d.value = logicState(source.value ?? 'X'); let previous = -1;
      if (!Array.isArray(source.events) || source.events.length > budget) throw logicError(`${source.id}: event list is missing or too large.`);
      const entries = source.events.map(event => { const at = tick(event.time, `${source.id} event time`); if (at < previous || source.kind === 'pattern' && at === previous) throw logicError(`${source.id}: event times must be ordered${source.kind === 'pattern' ? ' and distinct at 1 ps resolution' : ''}.`); previous = at; return { at, value: logicState(event.value) }; });
      if (source.kind === 'pattern' && (!entries.length || entries[0].at !== 0)) throw logicError(`${source.id}: a pattern requires an explicit time-zero word.`);
      const repeat = source.kind === 'pattern' && source.repeatPeriod ? tick(source.repeatPeriod, `${source.id} repeat period`, false) : 0;
      if (repeat && repeat <= entries.at(-1).at) throw logicError(`${source.id}: repeat period must exceed the last pattern time.`);
      for (let offset = 0; offset <= durationTick; offset += repeat) {
        for (const event of entries) { const at = offset + event.at; if (at === 0) d.value = event.value; else schedule(source.id, at, event.value); }
        if (!repeat) break;
      }
    } else if (source.kind === 'clock') {
      const period = tick(source.period, `${source.id} period`, false), delay = tick(source.delay ?? 0, `${source.id} start delay`);
      if (!(source.duty > 0 && source.duty < 1)) throw logicError(`${source.id}: duty must be between zero and one.`);
      const high = Math.round(period * source.duty); if (high < 1 || period - high < 1) throw logicError(`${source.id}: both clock levels must last at least 1 ps.`);
      d.value = delay === 0 ? '1' : '0';
      for (let at = delay; at <= durationTick; at += period) { if (at > 0) schedule(source.id, at, '1'); schedule(source.id, at + high, '0'); }
    } else throw logicError(`${source.id}: unsupported digital source ${source.kind}.`);
  }
  const resolve = name => resolveLogic(netDrivers.get(name).map(id => drivers.get(id).value));
  for (const name of names) netValues.set(name, resolve(name));
  for (const gate of sorted) { const value = evaluateGate(gate.type, gate.inputs.map(input => netValues.get(input)), gate); drivers.get(gate.id).value = value; gate.lastComputed = value; netValues.set(gate.output, resolve(gate.output)); }
  for (const gate of gates.filter(g => g.type === 'DFF')) { gate.lastClock = netValues.get(gate.inputs[1]); gate.lastComputed = drivers.get(gate.id).value; }
  for (const group of sequential) group.lastClock = netValues.get(group.clock);
  const histories = new Map([...names].map(name => [name, [{ time: 0, value: netValues.get(name) }]]));
  while (queue.length) {
    const at = queue.first.at, changedDrivers = new Set();
    while (queue.length && queue.first.at === at) { const event = queue.pop(); processed++; const d = drivers.get(event.id); if (d.value !== event.value) { d.value = event.value; changedDrivers.add(d.output); } }
    const affected = new Set();
    for (const name of changedDrivers) { const value = resolve(name); if (value === netValues.get(name)) continue; netValues.set(name, value); histories.get(name).push({ time: seconds(at), value }); for (const gate of consumers.get(name) || []) affected.add(gate); }
    for (const gate of affected) {
      if (gate.sequential) {
        const clock = netValues.get(gate.clock), prior = gate.lastClock; gate.lastClock = clock;
        const rising = prior === '0' && clock === '1', uncertain = prior !== clock && (prior === '0' && !known(clock) || !known(prior) && clock === '1');
        if (!rising && !uncertain) continue;
        const held = gate.state, candidate = gate.type === 'COUNTER' ? incrementWord(held) : gate.inputs.map(input => known(netValues.get(input)) ? netValues.get(input) : 'X');
        const enable = netValues.get(gate.enable), reset = netValues.get(gate.reset), zero = held.map(() => '0');
        let next = enable === '1' ? candidate : enable === '0' ? held : mergeWords(held, candidate);
        next = reset === '1' ? zero : reset === '0' ? next : mergeWords(zero, next);
        if (uncertain) next = mergeWords(held, next);
        gate.state = next;
        for (let bit = 0; bit < next.length; bit++) if (next[bit] !== held[bit]) schedule(gate.driverIds[bit], at + gate.delayTick, next[bit]);
        continue;
      }
      const inputs = gate.inputs.map(input => netValues.get(input)); let value;
      if (gate.type === 'DFF') {
        const [data, clock] = inputs, prior = gate.lastClock; gate.lastClock = clock;
        if (prior === '0' && clock === '1') value = known(data) ? data : 'X';
        else if (prior !== clock && (prior === '0' && !known(clock) || !known(prior) && clock === '1')) value = 'X';
        else continue;
      } else value = evaluateGate(gate.type, inputs, gate);
      if (value !== gate.lastComputed) { gate.lastComputed = value; schedule(gate.id, at + gate.delayTick, value); }
    }
  }
  const traces = [...names].sort().map(name => ({ name: `d(${name})`, node: name, events: histories.get(name) }));
  const busTraces = buses.map(bus => {
    const times = [...new Set(bus.bits.flatMap(bit => histories.get(bit).map(event => event.time)))].sort((a, b) => a - b), positions = bus.bits.map(() => 0), events = [];
    for (const time of times) { const word = bus.bits.map((bit, i) => { const history = histories.get(bit); while (positions[i] + 1 < history.length && history[positions[i] + 1].time <= time) positions[i]++; return history[positions[i]].value; }).reverse().join(''); if (!events.length || events.at(-1).value !== word) events.push({ time, value: word }); }
    return { name: bus.name, kind: 'bus', unit: 'logic', width: bus.width, bitOrder: 'msb-first', bits: bus.bits, events };
  });
  const hiddenNodes = [...new Set(plan.hiddenNodes || [])];
  if (hiddenNodes.some(name => !names.has(name))) throw logicError('A hidden bit trace does not belong to the compiled circuit.');
  return { duration, timeResolution: Q, processedEvents: processed, scheduledEvents: scheduled, traces, busTraces, hiddenNodes,
    engine: DIGITAL_ENGINE_INFO, warnings: [], logs: [`Digital event engine completed ${processed} events across ${names.size} nets; 1 ps resolution, transport delays.`] };
}

export function visibleDigitalTraces(result) {
  const hidden = new Set(result.hiddenNodes || []);
  return [...result.traces.filter(trace => !hidden.has(trace.node)), ...(result.busTraces || [])];
}

/** Bounded combinational truth table, evaluated by the same timed event kernel.
 * Each row changes selected drivers from X to a binary assignment at 1 ps,
 * then observes outputs after the longest combinational path has settled.
 * Unselected constant drivers retain their explicit project values.
 */
export function generateTruthTable(plan, { inputIds, outputNames, maxEvents = DIGITAL_LIMITS.events } = {}) {
  const invalid = message => logicError(message, 'TRUTH_TABLE_UNSUPPORTED');
  if (!plan || typeof plan !== 'object' || (plan.sources || []).some(source => source.kind !== 'constant') || (plan.sequential || []).length || (plan.gates || []).some(gate => String(gate.type).toUpperCase() === 'DFF')) throw invalid('A full truth table requires a pure combinational circuit with only constant DIN/BUSIN inputs. Clocks, patterns and state elements are unsupported.');
  const groups = plan.inputGroups || [], byId = new Map(groups.map(group => [group.id, group]));
  const selectedIds = inputIds ?? groups.map(group => group.id);
  if (!Array.isArray(selectedIds) || !selectedIds.length || new Set(selectedIds).size !== selectedIds.length) throw invalid('Select one or more distinct constant input components for the truth table.');
  const selected = selectedIds.map(id => { const group = byId.get(id); if (!group) throw invalid(`Truth-table input ${id} is not a constant DIN/BUSIN component.`); return group; });
  const sources = plan.sources || [], bySource = new Map(sources.map(source => [source.id, source])), usedSources = new Set();
  for (const group of selected) {
    if (!Number.isInteger(group.width) || group.width < 1 || group.width > 8 || !Array.isArray(group.sources) || group.sources.length !== group.width) throw invalid(`Input ${group.id} has an invalid bit mapping.`);
    for (const id of group.sources) { if (!bySource.has(id) || bySource.get(id).kind !== 'constant' || usedSources.has(id)) throw invalid('Selected truth-table inputs require unique constant source drivers.'); usedSources.add(id); }
  }
  const inputBits = selected.reduce((sum, group) => sum + group.width, 0);
  if (inputBits < 1 || inputBits > 8) throw invalid('Truth tables support 1–8 selected input bits (at most 256 rows).');
  const gates = plan.gates || [], producers = new Map(), pathCache = new Map(), visiting = new Set();
  for (const gate of gates) { if (!producers.has(gate.output)) producers.set(gate.output, []); producers.get(gate.output).push(gate); }
  const pathDelay = gate => {
    if (pathCache.has(gate)) return pathCache.get(gate);
    if (visiting.has(gate)) throw invalid('Combinational feedback cannot produce a full truth table.');
    visiting.add(gate); let prior = 0;
    for (const input of gate.inputs || []) for (const upstream of producers.get(input) || []) prior = Math.max(prior, pathDelay(upstream));
    const total = prior + tick(gate.delay, `${gate.id} propagation delay`, false); visiting.delete(gate);
    if (!Number.isSafeInteger(total + 2)) throw invalid('Truth-table settling time exceeds the supported timing range.');
    pathCache.set(gate, total); return total;
  };
  const settleTicks = 2 + Math.max(0, ...gates.map(pathDelay)), settleTime = seconds(settleTicks);
  const initial = simulateDigital({ ...plan, duration: settleTime }), available = visibleDigitalTraces(initial), byName = new Map(available.map(trace => [trace.name, trace]));
  const names = outputNames ?? available.map(trace => trace.name);
  if (!Array.isArray(names) || names.length < 1 || names.length > 32 || new Set(names).size !== names.length) throw invalid('Select 1–32 distinct output traces for the truth table.');
  const outputs = names.map(name => { const trace = byName.get(name); if (!trace) throw invalid(`Truth-table output ${name} is not a visible circuit trace.`); return { name, kind: trace.kind === 'bus' ? 'bus' : 'logic', width: trace.width || 1, bitOrder: 'msb-first' }; });
  const inputs = selected.map(group => ({ id: group.id, label: group.label || group.id, width: group.width, bitOrder: 'msb-first' }));
  const rows = [], budget = Math.min(DIGITAL_LIMITS.events, Math.max(1, Number(maxEvents) || DIGITAL_LIMITS.events)); let usedEvents = 0;
  for (let index = 0; index < 2 ** inputBits; index++) {
    const binary = index.toString(2).padStart(inputBits, '0'), assignments = new Map(), words = []; let offset = 0;
    for (const group of selected) { const word = binary.slice(offset, offset + group.width); offset += group.width; words.push(word); group.sources.forEach((id, bit) => assignments.set(id, word[group.width - 1 - bit])); }
    if (usedEvents >= budget) throw logicError(`Truth table exceeded its shared ${budget}-event budget. Select fewer inputs or simplify the circuit.`, 'TRUTH_TABLE_LIMIT');
    const rowSources = sources.map(source => assignments.has(source.id) ? { ...source, kind: 'events', value: 'X', events: [{ time: 0, value: 'X' }, { time: Q, value: assignments.get(source.id) }] } : source);
    const result = simulateDigital({ ...plan, duration: settleTime, sources: rowSources }, { maxEvents: budget - usedEvents }); usedEvents += result.scheduledEvents;
    const traces = new Map(visibleDigitalTraces(result).map(trace => [trace.name, trace]));
    rows.push({ index, inputs: words, outputs: names.map(name => traces.get(name).events.at(-1).value) });
  }
  return { kind: 'truth-table', inputs, outputs, rows, settleTime, engine: DIGITAL_ENGINE_INFO,
    logs: [`Truth table completed ${rows.length} rows, ${inputBits} selected input bits and ${usedEvents} scheduled events; each row settled through the timed kernel.`],
    warnings: ['Only selected constant inputs are enumerated. Other explicit constant drivers retain their project values. Truth tables do not replace transient hazard or setup/hold analysis.'] };
}

/** Analog threshold conversion of the saved numerical trace, with explicit X band.
 * Crossing times are linearly interpolated between original samples, then rounded
 * to 1 ps. This cannot recover analog activity absent from the saved samples.
 */
export function analogToDigitalEvents(times, values, low, high, { mode = 'threshold' } = {}) {
  if (!Array.isArray(times) || !times.length || values.length !== times.length || !(Number.isFinite(low) && Number.isFinite(high) && low < high)) throw logicError('ADC needs a sampled waveform and low threshold below high threshold.', 'ADC_INVALID');
  if (!['threshold', 'schmitt'].includes(mode)) throw logicError('ADC mode must be threshold or schmitt.', 'ADC_INVALID');
  const state = value => value <= low ? '0' : value >= high ? '1' : 'X';
  const events = [{ time: 0, value: state(values[0]) }];
  function add(time, value) { const t = seconds(tick(time, 'ADC event time')); const last = events.at(-1); if (last.time === t) { last.value = value; if (events.length > 1 && events.at(-2).value === value) events.pop(); } else if (last.value !== value) events.push({ time: t, value }); }
  for (let i = 0; i < times.length; i++) {
    if (!Number.isFinite(times[i]) || !Number.isFinite(values[i]) || times[i] < 0 || i && times[i] <= times[i - 1]) throw logicError('ADC waveform must have finite values and strictly increasing times.', 'ADC_INVALID');
    if (!i) continue;
    const a = values[i - 1], b = values[i], crossing = threshold => times[i - 1] + (threshold - a) * (times[i] - times[i - 1]) / (b - a);
    if (b > a) { if (mode === 'threshold' && a <= low && b > low) add(crossing(low), 'X'); if (a < high && b >= high) add(crossing(high), '1'); }
    else if (b < a) { if (mode === 'threshold' && a >= high && b < high) add(crossing(high), 'X'); if (a > low && b <= low) add(crossing(low), '0'); }
  }
  return events;
}

/** PWL replay with explicit finite rise/fall. A new edge interrupts a previous
 * ramp at its current interpolated voltage; it never backdates a transition.
 * X and Z are rejected: this ideal DAC has neither unknown-voltage nor tri-state
 * electrical models. No event is silently converted to a fictitious voltage.
 */
export function digitalToPWL(events, { low, high, rise, fall }, duration) {
  if (!events?.length || events[0].time !== 0 || ![low, high, rise, fall, duration].every(Number.isFinite) || !(high > low && rise > 0 && fall > 0 && duration > 0)) throw logicError('DAC requires initial logic, finite levels, and positive rise/fall times.', 'DAC_INVALID');
  for (const event of events) if (!known(event.value)) throw logicError(`DAC input is ${event.value} at ${event.time} s. This DAC requires known 0/1 states; X and Z have no analog voltage mapping.`, 'DAC_UNKNOWN');
  const voltage = value => value === '1' ? high : low, points = [[0, voltage(events[0].value)]];
  let start = 0, from = points[0][1], end = 0, target = from;
  const at = time => time >= end || end === start ? target : from + (target - from) * (time - start) / (end - start);
  function put(time, value) { const last = points.at(-1); if (last[0] === time) last[1] = value; else points.push([time, value]); }
  for (let i = 1; i < events.length; i++) {
    const event = events[i], time = event.time;
    if (!Number.isFinite(time) || time <= events[i - 1].time) throw logicError('DAC input event times must strictly increase.', 'DAC_INVALID');
    if (time > duration) break;
    if (end > start && end < time) put(end, target);
    const current = at(time); put(time, current); start = time; from = current; target = voltage(event.value); end = time + (target > current ? rise : fall);
  }
  if (end > start && end < duration) put(end, target);
  put(duration, at(duration)); return points;
}
