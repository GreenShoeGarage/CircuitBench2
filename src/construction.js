/* Explicit, undoable schematic construction. No implicit domain or bit conversion. */
import { getPart, getPins, parseValue, parseLogicWord } from './library.js';
import { addComponent, buildNets, buildDigitalNets, canConnect, clone, endpointPosition, setComponentParams, uid, validateProject } from './model.js';
import { generateNetlist } from './netlist.js';
import { compileCoordinated } from './coordinated.js';

const escRE = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const integer = (value, label, low, high) => {
  if (!/^\d+$/.test(String(value)) || !Number.isInteger(Number(value)) || Number(value) < low || Number(value) > high) throw new Error(`${label} must be an integer from ${low} to ${high}.`);
  return Number(value);
};
const field = (key, label, value, extra = {}) => ({ key, label, value, required: true, ...extra });
const choice = (key, label, value, values) => field(key, label, value, { options: values.map(v => typeof v === 'string' ? { value: v, label: v } : v) });
const numeric = (key, label, value, min, max) => field(key, label, value, { type: 'number', min, max });

export function endpointInfo(project, endpoint, built = buildNets(project)) {
  if (typeof endpoint !== 'string') return null;
  const name = built.endpointToNet[endpoint], net = built.nets.find(n => n.name === name);
  if (!net) return null;
  const component = project.circuit.components.find(c => getPins(c).some(pin => `${c.id}:${pin.id}` === endpoint));
  const pin = component && getPins(component).find(p => `${component.id}:${p.id}` === endpoint);
  return { endpoint, component, pin, net, domain: net.domain, width: net.width, point: endpointPosition(project, endpoint), label: component ? `${component.ref} · ${pin.name || pin.id}` : `Junction · ${net.name}` };
}

/** One network pass per render, even on the largest allowed schematic. */
export function compatibleDestinations(project, endpoint, built = buildNets(project)) {
  const source = built.nets.find(net => net.endpoints.includes(endpoint)), result = new Set();
  if (!source || source.domain === 'mixed' || source.widthConflict) return result;
  for (const net of built.nets) {
    if (net.domain === 'mixed' || net.widthConflict || source.domain && net.domain && source.domain !== net.domain) continue;
    if (source.domain === 'digital' && net.domain === 'digital' && source.width !== net.width) continue;
    for (const candidate of net.endpoints) if (candidate !== endpoint) result.add(candidate);
  }
  return result;
}

function referenceField(project) {
  const net = buildNets(project), options = [{ value: 'ground', label: 'New Ground symbol · node 0' }];
  for (const n of net.nets.filter(n => n.domain === 'analog')) {
    const endpoint = n.endpoints.find(e => !e.startsWith('j:')) || n.endpoints[0];
    options.push({ value: endpoint, label: `${n.name} · ${endpointInfo(project, endpoint, net).label}` });
  }
  return choice('reference', 'Analog reference connection', 'ground', options);
}

function bridgeAction(project, kind, endpoint, target = null, width = 1) {
  const bus = width > 1, type = kind === 'adc' ? bus ? 'ADCBUS' : 'ADC' : bus ? 'DACBUS' : 'DAC';
  const fields = [referenceField(project)];
  if (type === 'ADC') fields.push(field('low', 'Low threshold (V)', '1.5'), field('high', 'High threshold (V)', '3.5'), choice('mode', 'Threshold behavior', 'threshold', [{ value: 'threshold', label: 'Threshold · X between limits' }, { value: 'schmitt', label: 'Schmitt · retain prior known state in band' }]));
  else if (type === 'ADCBUS') fields.push(field('vmin', 'Zero-code voltage (V)', '0'), field('vmax', 'Full-scale voltage (V)', '5'), field('period', 'Sample period (s)', '100u'), field('delay', 'Conversion delay (s)', '1n'));
  else fields.push(field('low', 'Logic 0 / zero-code output (V)', '0'), field('high', 'Logic 1 / full-scale output (V)', '5'), field('rise', 'Rise time (s)', bus ? '1u' : '1n'), field('fall', 'Fall time (s)', bus ? '1u' : '1n'), ...(bus ? [field('initial', 'Known startup word · MSB first', '0b' + '0'.repeat(width))] : []));
  return { id: `${kind}-${width}`, title: `Insert ${width > 1 ? width + '-bit ' : ''}${kind.toUpperCase()}`, description: kind === 'adc' ? `Observe analog voltage relative to an explicit reference and produce ${width}-bit digital data.${bus ? ' Multibit conversion requires Coordinated transient.' : ''}` : `Drive an analog voltage from ${width}-bit digital data relative to an explicit reference.${bus ? ' Multibit conversion requires Coordinated transient.' : ''} X/Z never becomes an invented voltage.`, request: { kind, endpoint, ...(target ? { target } : {}), width }, fields };
}

function displayAction(project, endpoint, target = null) {
  const source = endpointInfo(project, endpoint), destination = target && endpointInfo(project, target);
  const decoder = source.width === 4, active = destination?.component?.params?.active ?? (source.component?.type === 'HEX7' ? source.component.params.active : 'high');
  return { id: decoder ? 'decoder-display' : 'display', title: decoder ? target ? 'Insert matching Hex / BCD decoder' : 'Place decoder and seven-segment display' : 'Attach seven-segment display', description: decoder ? 'Decode a 4-bit digit into segment bits a–g and decimal point. The decimal point receives a separate explicit logic source.' : 'Observe the actual 8-bit segment word: bit 0=a through bit 6=g; bit 7=decimal point.', request: { kind: decoder ? 'decoder-display' : 'display', endpoint, ...(target ? { target } : {}) }, fields: [...(decoder ? [choice('mode', 'Digit encoding', 'hex', ['hex', 'bcd']), choice('decimal', 'Decimal point input', '0', [{ value: '0', label: '0 · off' }, { value: '1', label: '1 · on' }])] : []), choice('active', 'Segment active level', active, destination ? [active] : ['high', 'low'])] };
}

export function constructionActions(project, endpoint) {
  const info = endpointInfo(project, endpoint);
  if (!info || info.domain === 'mixed' || info.net.widthConflict) return [];
  if (info.domain === 'analog') return [bridgeAction(project, 'adc', endpoint), { ...bridgeAction(project, 'adc', endpoint, null, 4), id: 'adc-bus', title: 'Insert multibit sampled ADC', fields: [numeric('width', 'Output width (bits)', 4, 2, 8), ...bridgeAction(project, 'adc', endpoint, null, 4).fields] }];
  if (info.domain !== 'digital') return [];
  const actions = [];
  if (info.width === 1) actions.push({ id: 'indicator', title: 'Attach logic state indicator', description: 'Observe this resolved digital net. The indicator glows red for HIGH and never drives the circuit.', request: { kind: 'indicator', endpoint }, fields: [] });
  if (info.width > 1) actions.push({ id: 'probe-bit', title: 'Probe a bus bit', description: 'Insert an explicit one-bit Slice and a logic probe. Bit 0 is the least significant bit; the original bus is preserved.', request: { kind: 'probe-bit', endpoint }, fields: [numeric('lsb', 'Bit to observe · bit 0 is LSB', 0, 0, info.width - 1)] }, { id: 'slice', title: 'Place a configured Slice', description: 'Output bit i aliases input bit lsb+i. X, Z and contention remain per-bit.', request: { kind: 'slice', endpoint }, fields: [numeric('lsb', 'First input bit · LSB', 0, 0, info.width - 1), numeric('count', 'Number of selected bits', 1, 1, info.width)] });
  if (info.width < 8) actions.push({ id: 'join', title: 'Join with an explicit word', description: 'A forms the low bits; B forms the high bits. The added word is a visible Bus input source, with no implicit padding.', request: { kind: 'join', endpoint }, fields: [numeric('otherWidth', 'Additional word width (bits)', 1, 1, 8 - info.width), choice('side', 'Existing signal position', 'low', [{ value: 'low', label: 'A · low bits' }, { value: 'high', label: 'B · high bits' }]), field('other', 'Additional word · binary/X/Z or 0x number', '0x0')] });
  if ([4, 8].includes(info.width)) actions.push(displayAction(project, endpoint));
  actions.push(bridgeAction(project, 'dac', endpoint, null, info.width));
  return actions;
}

/** Offers corrections, never a way to bypass canConnect. */
export function connectionActions(project, start, end) {
  const a = endpointInfo(project, start), b = endpointInfo(project, end);
  if (!a || !b || a.domain === 'mixed' || b.domain === 'mixed' || a.net.widthConflict || b.net.widthConflict || canConnect(project, start, end).ok) return [];
  if (a.domain !== b.domain && [a.domain, b.domain].every(d => ['digital', 'analog'].includes(d))) {
    const digital = a.domain === 'digital' ? a : b, analog = a.domain === 'analog' ? a : b;
    const expanded = buildDigitalNets(project), names = expanded.endpointBits[digital.endpoint] ?? [], hasDriver = expanded.bits.some(bit => names.includes(bit.name) && bit.drivers.length);
    return [digital.pin?.direction === 'output' || hasDriver ? bridgeAction(project, 'dac', digital.endpoint, analog.endpoint, digital.width) : bridgeAction(project, 'adc', analog.endpoint, digital.endpoint, digital.width)];
  }
  if (a.domain === 'digital' && b.domain === 'digital' && a.width !== b.width) {
    const wide = a.width > b.width ? a : b, narrow = a.width < b.width ? a : b, extra = wide.width - narrow.width;
    const actions = [
      { id: 'slice', title: `Select ${narrow.width} of ${wide.width} bits with Slice`, description: 'Choose exactly which bits share the narrower net. No bits are silently dropped.', request: { kind: 'slice', endpoint: wide.endpoint, target: narrow.endpoint }, fields: [numeric('lsb', 'First input bit · LSB', 0, 0, extra)] },
      { id: 'join', title: `Join ${narrow.width} + ${extra} bits explicitly`, description: 'Add a visible word source for the extra bits. Choose whether the existing signal forms the low or high bits.', request: { kind: 'join', endpoint: narrow.endpoint, target: wide.endpoint }, fields: [choice('side', 'Existing signal position', 'low', [{ value: 'low', label: 'A · low bits' }, { value: 'high', label: 'B · high bits' }]), field('other', `${extra}-bit added word · MSB first`, '0b' + '0'.repeat(extra))] }
    ];
    if (narrow.width === 4 && wide.component?.type === 'SEG7' && wide.pin.id === 'in') actions.unshift(displayAction(project, narrow.endpoint, wide.endpoint));
    return actions;
  }
  return [];
}

function assertDomain(info, domain, width) {
  if (!info || info.domain !== domain || info.net.widthConflict || width && info.width !== width) throw new Error(`Choose a valid ${width ? width + '-bit ' : ''}${domain} endpoint.`);
}
function choiceValue(value, choices, label) { if (!choices.includes(value)) throw new Error(`Choose ${label}: ${choices.join(', ')}.`); return value; }
function positiveTime(value, label) { const seconds = parseValue(value, 's'), tick = Math.round(seconds / 1e-12); if (!(seconds >= 1e-12 && Number.isSafeInteger(tick))) throw new Error(`${label} must be at least 1 ps on the safe time grid.`); return seconds; }

/** All work is staged and validated before the caller's project changes. */
export function applyConstruction(project, request) {
  if (!request || project.workspace !== 'schematic') throw new Error('Guided construction requires a schematic project.');
  const draft = clone(project), config = request.config ?? {}, source = endpointInfo(draft, request.endpoint), target = request.target ? endpointInfo(draft, request.target) : null;
  if (!source || request.target && !target) throw new Error('The chosen endpoint no longer exists. Select the pin again.');
  const ids = [], connections = [], origin = source.point;
  const reserve = [];
  const create = (type, params = {}, dx = 140, dy = 0) => {
    let x = Math.round((origin.x + dx) / 20) * 20, y = Math.round((origin.y + dy) / 20) * 20;
    while (Object.values(draft.layout.components).some(p => Math.abs(p.x - x) < 115 && Math.abs(p.y - y) < 125) || reserve.some(p => Math.abs(p.x - x) < 115 && Math.abs(p.y - y) < 125)) y += 140;
    const c = addComponent(draft, type, x, y); setComponentParams(draft, c.id, params); reserve.push({ x, y }); ids.push(c.id); return c;
  };
  const pin = (c, id) => `${c.id}:${id}`;
  const wire = (a, b) => {
    const check = canConnect(draft, a, b); if (!check.ok) throw new Error(check.message);
    const id = uid('wire'); draft.circuit.connections.push({ id, a, b }); draft.layout.wires[id] = { points: [] }; connections.push(id); return id;
  };
  const reference = () => {
    if (config.reference === 'ground') return pin(create('GND', {}, 140, 140), '0');
    const selected = endpointInfo(draft, config.reference); assertDomain(selected, 'analog'); return selected.endpoint;
  };
  let output, label;
  if (request.kind === 'indicator') {
    assertDomain(source, 'digital', 1); const indicator = create('DLED'); wire(source.endpoint, pin(indicator, 'in')); output = pin(indicator, 'in'); label = 'Attach logic state indicator';
  } else if (request.kind === 'slice' || request.kind === 'probe-bit') {
    assertDomain(source, 'digital'); if (source.width < 2) throw new Error('Select a multibit digital bus.');
    if (target) assertDomain(target, 'digital');
    const count = request.kind === 'probe-bit' ? 1 : target ? target.width : integer(config.count, 'Selected width', 1, source.width), lsb = integer(config.lsb, 'First input bit', 0, source.width - count);
    const slice = create('SLICE', { width: String(source.width), lsb: String(lsb), count: String(count) }); wire(source.endpoint, pin(slice, 'in')); output = pin(slice, 'out');
    if (target) wire(output, target.endpoint);
    if (request.kind === 'probe-bit') draft.probes.push({ id: uid('probe'), kind: 'logic', label: `${source.label} · bit ${lsb}`, a: output });
    label = request.kind === 'probe-bit' ? `Probe bus bit ${lsb}` : `Insert Slice [${lsb + count - 1}:${lsb}]`;
  } else if (request.kind === 'join') {
    assertDomain(source, 'digital'); if (target) assertDomain(target, 'digital');
    const otherWidth = integer(target ? target.width - source.width : config.otherWidth, 'Additional word width', 1, 8 - source.width), side = choiceValue(config.side, ['low', 'high'], 'low or high bit position');
    const word = parseLogicWord(String(config.other ?? ''), otherWidth), low = side === 'low';
    const join = create('JOIN', { aWidth: String(low ? source.width : otherWidth), bWidth: String(low ? otherWidth : source.width) }), added = create('BUSIN', { width: String(otherWidth), value: word }, 0, 160);
    wire(source.endpoint, pin(join, low ? 'a' : 'b')); wire(pin(added, 'out'), pin(join, low ? 'b' : 'a')); output = pin(join, 'out'); if (target) wire(output, target.endpoint); label = 'Insert explicit bus Join and word';
  } else if (request.kind === 'display' || request.kind === 'decoder-display') {
    const decoder = request.kind === 'decoder-display'; assertDomain(source, 'digital', decoder ? 4 : 8); if (target) { assertDomain(target, 'digital', 8); if (target.component?.type !== 'SEG7') throw new Error('A matching decoder must target a seven-segment display.'); }
    const active = choiceValue(config.active, ['high', 'low'], 'segment active level'); if (target && target.component.params.active !== active) throw new Error('Decoder and existing display must use the same active level.');
    let data = source.endpoint;
    if (decoder) {
      const mode = choiceValue(config.mode, ['hex', 'bcd'], 'digit encoding'), decimal = choiceValue(config.decimal, ['0', '1'], 'decimal point state');
      const decode = create('HEX7', { mode, active }), dp = create('DIN', { state: decimal }, 0, 160); wire(data, pin(decode, 'in')); wire(pin(dp, 'out'), pin(decode, 'dp')); data = pin(decode, 'out');
    }
    output = target?.endpoint || pin(create('SEG7', { active }, decoder ? 340 : 140), 'in'); wire(data, output); label = decoder ? 'Place matching decoder and display' : 'Attach seven-segment display';
  } else if (request.kind === 'adc' || request.kind === 'dac') {
    const adc = request.kind === 'adc'; assertDomain(source, adc ? 'analog' : 'digital'); if (target) assertDomain(target, adc ? 'digital' : 'analog');
    const width = integer(adc ? target?.width ?? config.width ?? request.width : source.width, 'Converter width', 1, 8), bus = width > 1, type = adc ? bus ? 'ADCBUS' : 'ADC' : bus ? 'DACBUS' : 'DAC';
    const keys = type === 'ADC' ? ['low', 'high', 'mode'] : type === 'ADCBUS' ? ['vmin', 'vmax', 'period', 'delay'] : ['low', 'high', 'rise', 'fall', ...(bus ? ['initial'] : [])];
    const params = Object.fromEntries(keys.map(key => [key, String(config[key] ?? '')])); if (bus) params.width = String(width);
    const lo = parseValue(params[adc && bus ? 'vmin' : 'low'], 'V'), hi = parseValue(params[adc && bus ? 'vmax' : 'high'], 'V'); if (!(hi > lo)) throw new Error('High/full-scale voltage must be greater than low/zero-code voltage.');
    if (type === 'ADC') choiceValue(params.mode, ['threshold', 'schmitt'], 'threshold behavior');
    if (type === 'ADCBUS') { const period = positiveTime(params.period, 'Sample period'), delay = positiveTime(params.delay, 'Conversion delay'); if (Math.round(delay / 1e-12) >= Math.round(period / 1e-12)) throw new Error('Conversion delay must be shorter than sample period.'); }
    if (!adc) { positiveTime(params.rise, 'Rise time'); positiveTime(params.fall, 'Fall time'); if (bus && !/^[01]+$/.test(parseLogicWord(params.initial, width, { allowZ: false }))) throw new Error('DAC startup word must contain known binary bits.'); }
    const converter = create(type, params), ref = reference();
    if (adc) { wire(source.endpoint, pin(converter, bus ? 'p' : 'in')); wire(ref, pin(converter, bus ? 'n' : 'ref')); output = pin(converter, bus ? 'q' : 'out'); if (target) wire(output, target.endpoint); }
    else { wire(source.endpoint, pin(converter, bus ? 'd' : 'in')); wire(ref, pin(converter, bus ? 'n' : 'ref')); output = pin(converter, bus ? 'p' : 'out'); if (target) { if (buildNets(draft).endpointToNet[ref] === buildNets(draft).endpointToNet[target.endpoint]) throw new Error('DAC output cannot connect to its own analog reference.'); wire(output, target.endpoint); } }
    label = `Insert explicit ${width > 1 ? width + '-bit ' : ''}${adc ? 'ADC' : 'DAC'}`;
  } else throw new Error('Unknown guided construction action.');
  const validated = validateProject(draft);
  const conflicts = buildNets(validated).diagnostics.filter(d => d.severity === 'error' && ['NET_DOMAIN_CONFLICT', 'NET_WIDTH_CONFLICT'].includes(d.code));
  if (conflicts.length) throw new Error(conflicts.map(d => d.message).join(' '));
  Object.assign(project, validated);
  return { ids, connections, label, endpoint: output };
}

/** Resolve identities first; legacy messages use exact, bounded known formats. */
export function diagnosticTarget(project, diagnostic) {
  if (!diagnostic || project.workspace !== 'schematic') return null;
  const built = buildNets(project), ids = new Set(), endpoints = new Set(), message = String(diagnostic.message ?? '');
  const addEndpoint = endpoint => { if (!built.endpointToNet[endpoint]) return; endpoints.add(endpoint); if (endpoint.startsWith('j:')) ids.add(endpoint.slice(2)); else { const c = project.circuit.components.find(c => getPins(c).some(pin => `${c.id}:${pin.id}` === endpoint)); if (c) ids.add(c.id); } };
  for (const endpoint of [diagnostic.endpoint, ...(diagnostic.endpoints ?? [])].filter(Boolean)) addEndpoint(endpoint);
  let component = project.circuit.components.find(c => c.id === diagnostic.componentId);
  if (!component) component = project.circuit.components.find(c => new RegExp(`^${escRE(c.ref)}(?::| pin | can influence )`).test(message));
  if (component) {
    ids.add(component.id);
    const pin = getPins(component).find(pin => pin.id === diagnostic.pinId || message.startsWith(`${component.ref} pin ${pin.name} is unconnected.`));
    if (pin) addEndpoint(`${component.id}:${pin.id}`);
  }
  const netName = diagnostic.netName ?? diagnostic.net ?? /^Net ([^\s]+)(?: |:)/.exec(message)?.[1];
  const net = built.nets.find(n => n.name === netName);
  if (net) { for (const endpoint of net.endpoints) addEndpoint(endpoint); for (const wire of project.circuit.connections) if (built.endpointToNet[wire.a] === net.name) ids.add(wire.id); }
  const bitName = /^Digital bit net ([^\s]+) /.exec(message)?.[1];
  if (bitName) for (const [endpoint, bits] of Object.entries(buildDigitalNets(project, built).endpointBits)) if (bits.includes(bitName)) addEndpoint(endpoint);
  const probe = project.probes.find(p => p.id === diagnostic.probeId || message.startsWith(`${p.label}: `));
  if (probe) { addEndpoint(probe.a); if (probe.b) addEndpoint(probe.b); if (probe.componentId) ids.add(probe.componentId); }
  if (!ids.size && !endpoints.size) return null;
  const first = [...endpoints][0], focusKey = first ? first.startsWith('j:') ? `junction-${first.slice(2)}` : `pin-${first}` : `component-${[...ids][0]}`;
  return { ids: [...ids], endpoints: [...endpoints], focusKey, label: component?.ref ?? (net ? `Net ${net.name}` : bitName ? `Digital net ${bitName}` : probe?.label ?? 'Circuit object') };
}

function compileCheck(project) {
  try { const generated = generateNetlist(project), diagnostics = generated.diagnostics ?? []; if (!diagnostics.some(d => d.severity === 'error') && project.analysis.solver === 'coordinated') compileCoordinated(project, generated); return diagnostics; }
  catch (error) { return [{ severity: 'error', code: error.code, message: error.message }]; }
}

/** A suggested engine must accept the complete unchanged circuit topology. */
export function analysisCompatibility(project) {
  const raw = compileCheck(project), supported = !raw.some(d => d.severity === 'error'), alternatives = [];
  if (!supported) for (const solver of ['ngspice', 'coordinated']) {
    const type = solver === 'coordinated' || project.circuit.components.some(c => getPins(c).some(pin => pin.domain === 'digital')) ? 'tran' : project.analysis.type;
    if (solver === project.analysis.solver && type === project.analysis.type) continue;
    const candidate = clone(project); candidate.analysis.solver = solver; candidate.analysis.type = type;
    if (!compileCheck(candidate).some(d => d.severity === 'error')) alternatives.push({ solver, type, title: solver === 'coordinated' ? 'Use Coordinated transient' : `Use ${type === 'tran' ? 'ngspice / digital transient' : 'ngspice ' + type}`, description: solver === 'coordinated' ? 'This complete circuit fits the supported coordinated analog subset and native digital timeline.' : 'This complete circuit passed ngspice / event preflight. Mixed replay supports feed-forward paths; closed-loop paths were checked before offering this action.' });
  }
  const diagnostics = raw.map(d => d.message.includes('not supported by Coordinated transient.') ? { ...d, code: 'COORDINATED_UNSUPPORTED', message: d.message.replace(/ Use ngspice for this analog model;.*/, ' Coordinated analog supports R, C, L and independent V/I sources. Keep this model with a compatible complete-circuit engine, or explicitly redesign the analog partition.') } : d);
  return { supported, diagnostics, alternatives };
}

export const EXAMPLE_GOALS = Object.freeze([
  { id: 'switch', title: 'Switch inputs and see states' }, { id: 'bus', title: 'Read buses and displays' }, { id: 'timing', title: 'Measure logic timing' }, { id: 'feedback', title: 'Explore mixed-signal control' }, { id: 'analog', title: 'Understand analog behavior' }
]);
export function exampleGoals(example) {
  const project = example.create(), types = new Set(project.circuit.components.map(c => c.type)), goals = [];
  if (['DIN', 'DVS', 'DLED'].some(t => types.has(t))) goals.push('switch');
  if (project.circuit.components.some(c => getPins(c).some(pin => pin.domain === 'digital' && pin.width > 1))) goals.push('bus');
  if (['CLOCK', 'PATTERN', 'DFF', 'REGISTER', 'COUNTER'].some(t => types.has(t)) || /timing|delay|pulse/i.test(example.category ?? '')) goals.push('timing');
  if (project.analysis.solver === 'coordinated' && [...types].some(t => ['ADC', 'ADCBUS', 'DAC', 'DACBUS'].includes(t))) goals.push('feedback');
  if ([...types].some(t => ['R', 'C', 'L', 'D', 'NPN', 'PNP', 'NMOS', 'PMOS', 'OPAMP', 'SW'].includes(t))) goals.push('analog');
  return goals.length ? goals : ['switch'];
}
