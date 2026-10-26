/* View-only bus lanes and identity-safe links between recorded signals and pins. */
import { buildNets, buildDigitalNets } from './model.js';
import { getPins } from './library.js';

const cache = new WeakMap();
const normalized = value => String(value ?? '').toLowerCase().replace(/\s/g, '');
const validWord = (word, width) => typeof word === 'string' && word.length === width && /^[01XZ]+$/.test(word);
export const busBitTraceId = (id, bit) => `bus-bit:${JSON.stringify([String(id), bit])}`;

function busEvents(run, trace) {
  const history = run?.result?.digitalEvents?.find(item => normalized(item.name) === normalized(trace.vector) && item.kind === 'bus' && item.width === trace.width && item.bitOrder === 'msb-first');
  if (!history?.events?.length || history.events.some((event, index) => !Number.isFinite(event.time) || event.time < 0 || index && event.time <= history.events[index - 1].time || !validWord(event.value, trace.width))) return null;
  return history.events;
}

/** Display order is MSB down to LSB. Bit values and event histories are copied. */
export function derivedBusBitTraces(run, trace) {
  if (trace?.kind !== 'bus' || !Number.isInteger(trace.width) || trace.width < 2 || trace.width > 8 || trace.bitOrder !== 'msb-first' || !Array.isArray(trace.values) || trace.values.some(word => !validWord(word, trace.width))) return [];
  const events = busEvents(run, trace), result = run?.result;
  let resultCache = result && cache.get(result);
  if (result && !resultCache) { resultCache = new Map(); cache.set(result, resultCache); }
  const key = JSON.stringify([trace.id, trace.label, trace.width, trace.color]), prior = resultCache?.get(key);
  if (prior?.values === trace.values && prior.events === events) return prior.traces;
  const traces = Array.from({ length: trace.width }, (_, lane) => {
    const bit = trace.width - 1 - lane, bitEvents = [];
    for (const event of events ?? []) { const value = event.value[lane]; if (!bitEvents.length || bitEvents.at(-1).value !== value) bitEvents.push({ time: event.time, value }); }
    return { ...trace, id: busBitTraceId(trace.id, bit), label: `${trace.label} [${bit}]`, kind: 'logic', unit: 'logic', width: undefined, bitOrder: undefined, values: trace.values.map(word => word[lane]), imag: undefined, derived: true, bit, parentId: trace.id, parentVector: trace.vector, sourceWidth: trace.width, sourceBitOrder: 'msb-first', events: bitEvents.length ? bitEvents : null, derivedFrom: bitEvents.length ? 'preserved-bus-events' : 'preserved-bus-values', reference: `Bit ${bit} of ${trace.label}; bit 0 is least significant. View derived from preserved bus data.` };
  });
  resultCache?.set(key, { values: trace.values, events, traces });
  return traces;
}

/** Use preserved events between sampled rows and hold the final state to run end. */
export function logicTraceData(trace, axisValues) {
  if (!trace?.derived || !trace.events?.length || !axisValues?.length) return { times: axisValues ?? [], values: trace?.values ?? [] };
  const start = axisValues[0], end = axisValues.at(-1), events = trace.events;
  let initial = trace.values[0] ?? 'X';
  for (const event of events) { if (event.time > start) break; initial = event.value; }
  const times = [start], values = [initial];
  for (const event of events) if (event.time > start && event.time <= end && event.value !== values.at(-1)) { times.push(event.time); values.push(event.value); }
  if (end > times.at(-1)) { times.push(end); values.push(values.at(-1)); }
  return { times, values };
}

export function signalLinkContext(run, project) {
  const snapshot = run?.projectSnapshot;
  if (!snapshot || snapshot.workspace !== 'schematic') return { ok: false, reason: 'This recorded signal has no captured schematic to link.' };
  if (!project || project.workspace !== 'schematic' || run.projectId !== project.id || run.revision !== project.revision || snapshot.id !== project.id || snapshot.revision !== project.revision) return { ok: false, reason: 'This signal belongs to a different project or revision. Its recorded waveform remains selected; run the current circuit to link working pins.' };
  return { ok: true, snapshot };
}

/** Resolve against captured electrical identities, never display-label guesses. */
export function traceSchematicTarget(run, trace, project) {
  const context = signalLinkContext(run, project);
  if (!context.ok) return context;
  const snapshot = context.snapshot, built = buildNets(snapshot), digital = buildDigitalNets(snapshot, built), endpoints = new Set(), ids = new Set();
  const addEndpoint = ep => { if (Object.hasOwn(built.endpointToNet, ep)) endpoints.add(ep); };
  const addNet = name => { const net = built.nets.find(net => normalized(net.name) === normalized(name)); for (const ep of net?.endpoints ?? []) addEndpoint(ep); };
  const id = trace.parentId ?? trace.id, measurement = run.measurements?.find(m => m.id === id), probe = snapshot.probes.find(p => p.id === id);
  if (trace.derived) {
    const parentName = /^b\((.*)\)$/i.exec(String(trace.parentVector ?? trace.vector))?.[1], net = built.nets.find(n => normalized(n.name) === normalized(parentName));
    const bitName = net && digital.netBits[net.name]?.[trace.bit];
    if (bitName) for (const [ep, bits] of Object.entries(digital.endpointBits)) if (bits.includes(bitName)) addEndpoint(ep);
  } else if (probe && probe.kind !== 'current') { addEndpoint(probe.a); if (probe.b) addEndpoint(probe.b); }
  const componentId = measurement?.componentId ?? (probe?.kind === 'current' ? probe.componentId ?? probe.a : null);
  if (componentId) { const component = snapshot.circuit.components.find(c => c.id === componentId); if (component) { ids.add(component.id); for (const pin of getPins(component)) addEndpoint(`${component.id}:${pin.id}`); } }
  if (!endpoints.size) {
    if (String(id).startsWith('node:')) addNet(String(id).slice(5));
    for (const vector of [measurement?.vector ?? trace.vector, measurement?.a, measurement?.b].filter(Boolean)) {
      const match = /^([vdb])\(([^()]*)\)$/i.exec(vector);
      if (match) {
        if (match[1].toLowerCase() === 'd' && !built.nets.some(n => normalized(n.name) === normalized(match[2]))) {
          for (const [ep, bits] of Object.entries(digital.endpointBits)) if (bits.some(bit => normalized(bit) === normalized(match[2]))) addEndpoint(ep);
        } else addNet(match[2]);
      } else if (vector === '0') addNet('0');
      else {
        const ref = /^i\(([^()]+)\)$/i.exec(vector)?.[1] ?? /^(.*)#branch$/i.exec(vector)?.[1], component = ref && snapshot.circuit.components.find(c => normalized(c.ref) === normalized(ref));
        if (component) { ids.add(component.id); for (const pin of getPins(component)) addEndpoint(`${component.id}:${pin.id}`); }
      }
    }
  }
  if (!endpoints.size && !ids.size) return { ok: false, reason: 'This signal has no matching captured schematic pin or component.' };
  if (!componentId) for (const name of new Set([...endpoints].map(ep => built.endpointToNet[ep]))) addNet(name);
  for (const ep of endpoints) {
    if (ep.startsWith('j:')) ids.add(ep.slice(2));
    else { const component = snapshot.circuit.components.find(c => getPins(c).some(pin => `${c.id}:${pin.id}` === ep)); if (component) ids.add(component.id); }
  }
  if (!componentId) {
    const names = new Set([...endpoints].map(ep => built.endpointToNet[ep]));
    for (const wire of snapshot.circuit.connections) if (names.has(built.endpointToNet[wire.a])) ids.add(wire.id);
  }
  return { ok: true, target: { ids: [...ids], endpoints: [...endpoints], label: `${trace.label}${trace.derived ? ' · derived bus bit' : ''}` } };
}

export function tracesForEndpoint(run, traces, endpoint, project) {
  const context = signalLinkContext(run, project); if (!context.ok) return { ...context, traces: [] };
  const matches = traces.filter(trace => { const link = traceSchematicTarget(run, trace, project); return link.ok && link.target.endpoints.includes(endpoint); });
  if (!matches.length) return { ok: false, traces: [], reason: 'No recorded signal maps to this pin in the selected run.' };
  // Prefer the net voltage/logic or an explicit probe before branch currents.
  matches.sort((a, b) => Number(a.kind === 'current') - Number(b.kind === 'current'));
  return { ok: true, traces: matches };
}
