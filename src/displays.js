/** Seven-segment indicators observe actual digital events; they never drive nets. */
import { buildNets } from './model.js';
import { SEVEN_SEGMENT_HEX } from './library.js';

export const SEGMENT_NAMES = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp']);
const wordPattern = /^[01XZ]{8}$/;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function segmentStates(word, active = 'high') {
  if (!['high', 'low'].includes(active)) throw new Error('Display active level must be high or low.');
  if (word !== null && word !== undefined && (typeof word !== 'string' || !wordPattern.test(word))) throw new Error('A display requires an eight-bit MSB-first 0/1/X/Z word.');
  return SEGMENT_NAMES.map((name, bit) => {
    const logic = word?.[7 - bit] ?? null;
    const state = logic === null ? 'unobserved' : logic === 'X' ? 'unknown' : logic === 'Z' ? 'released' : logic === (active === 'high' ? '1' : '0') ? 'on' : 'off';
    return { name, bit, logic, state, on: state === 'on' };
  });
}

export function sevenSegmentGlyph(word, active = 'high') {
  const segments = segmentStates(word, active).slice(0, 7);
  if (segments.some(segment => segment.logic === null)) return null;
  if (segments.some(segment => !['on', 'off'].includes(segment.state))) return '?';
  const mask = segments.reduce((value, segment) => value + (segment.on ? 2 ** segment.bit : 0), 0);
  if (mask === 0) return 'blank';
  const digit = SEVEN_SEGMENT_HEX.indexOf(mask);
  return digit < 0 ? 'custom' : '0123456789AbCdEF'[digit];
}

/** Return component-id keyed states. A result from another revision is never
 * painted onto the current circuit. Time is right-continuous, with no snapping
 * to a plotted sample. Running/paused results may provide a completed chunk. */
export function displayStatesForRun(project, run, time) {
  const states = Object.create(null), displays = project?.circuit?.components?.filter(component => component.type === 'SEG7') ?? [];
  for (const component of displays) states[component.id] = {
    componentId: component.id, ref: component.ref, active: component.params.active ?? 'high', word: null,
    segments: segmentStates(null, component.params.active ?? 'high'), glyph: null,
    available: false, status: 'unobserved', reason: 'Run the current circuit to observe segment states.', time: null, traceName: null
  };
  if (!displays.length || !run || !['completed', 'completed-with-warnings', 'running', 'paused'].includes(run.status) || run.analysis?.type !== 'tran') return states;
  const snapshot = run.projectSnapshot;
  if (run.projectId !== project.id || run.revision !== project.revision || snapshot?.id !== project.id || snapshot?.revision !== project.revision) {
    for (const state of Object.values(states)) state.reason = 'This run belongs to another project or revision. Run the current circuit.';
    return states;
  }
  const axis = run.result?.vectors?.find(vector => vector.name === 'time'), series = run.result?.digitalEvents;
  if (!Array.isArray(axis?.values) || !axis.values.length || !Array.isArray(series)) return states;
  const start = axis.values[0], end = axis.values.at(-1), selectedTime = time === undefined || time === null ? end : time;
  if (![start, end, selectedTime].every(Number.isFinite) || start < 0 || end < start || selectedTime < start || selectedTime > end) {
    for (const state of Object.values(states)) state.reason = 'Choose a time inside the retained simulation interval.';
    return states;
  }
  let network;
  try { network = buildNets(snapshot); } catch { return states; }
  for (const component of displays) {
    const state = states[component.id], original = snapshot.circuit.components.find(item => item.id === component.id && item.type === 'SEG7');
    if (!original || original.params.active !== component.params.active) continue;
    const net = network.nets.find(item => item.endpoints.includes(`${component.id}:in`));
    if (!net || net.domain !== 'digital' || net.width !== 8 || net.widthConflict) continue;
    const name = `b(${net.name})`, matches = series.filter(trace => trace.name === name), vector = run.result.vectors.find(item => item.name === name);
    state.traceName = name;
    if (matches.length !== 1 || vector?.kind !== 'bus' || vector.width !== 8 || vector.bitOrder !== 'msb-first') continue;
    const trace = matches[0], events = trace.events;
    if (trace.kind !== 'bus' || trace.width !== 8 || trace.bitOrder !== 'msb-first' || !Array.isArray(events) || !events.length || events.length > 250000 || events[0].time > start) continue;
    let previous = -Infinity;
    if (!events.every(event => {
      const valid = event && Number.isFinite(event.time) && event.time >= 0 && event.time <= end && event.time > previous && typeof event.value === 'string' && wordPattern.test(event.value);
      previous = event?.time; return valid;
    })) continue;
    let left = 0, right = events.length;
    while (left + 1 < right) { const middle = Math.floor((left + right) / 2); if (events[middle].time <= selectedTime) left = middle; else right = middle; }
    const word = events[left].value, segments = segmentStates(word, state.active);
    Object.assign(state, { word, segments, glyph: sevenSegmentGlyph(word, state.active), available: true,
      status: segments.some(segment => ['unknown', 'released'].includes(segment.state)) ? 'uncertain' : 'observed',
      reason: 'Actual resolved segment events at the selected simulation time.', time: selectedTime, sourceRunId: run.id });
  }
  return states;
}

const geometry = [
  { points: '-12,-27 12,-27 15,-24 11,-21 -11,-21 -15,-24', x: 0, y: -21 },
  { points: '16,-22 19,-19 19,-4 16,-1 13,-4 13,-18', x: 16, y: -8 },
  { points: '16,1 19,4 19,19 16,22 13,18 13,4', x: 16, y: 15 },
  { points: '-11,21 11,21 15,24 12,27 -12,27 -15,24', x: 0, y: 27 },
  { points: '-16,1 -13,4 -13,18 -16,22 -19,19 -19,4', x: -16, y: 15 },
  { points: '-16,-22 -13,-18 -13,-4 -16,-1 -19,-4 -19,-19', x: -16, y: -8 },
  { points: '-11,-3 11,-3 15,0 11,3 -11,3 -15,0', x: 0, y: 3 },
  { x: 26, y: 24 }
];
const labels = { on: 'on', off: 'off', unknown: 'unknown X', released: 'released Z', unobserved: 'not observed' };
const paint = {
  on: 'fill:#ff625b;stroke:#ff9286;stroke-width:.7',
  off: 'fill:#302b2a;stroke:#625a57;stroke-width:.6',
  unknown: 'fill:#ffc16b;stroke:#8c590c;stroke-width:.9',
  released: 'fill:none;stroke:#77c6ee;stroke-width:1.4;stroke-dasharray:2 1',
  unobserved: 'fill:#28312d;stroke:#6d7870;stroke-width:.6'
};

/** Artwork inside a component-local SVG group; explicit styles also export. */
export function sevenSegmentMarkup(state = null, params = {}) {
  const active = params.active ?? state?.active ?? 'high', word = state?.available ? state.word : null;
  const segments = segmentStates(word, active);
  const title = state?.available ? `Segments ${word}, ${active} active, ${sevenSegmentGlyph(word, active)} at ${state.time} seconds` : state?.reason ?? 'Seven-segment display: run the circuit to observe states';
  return `<g class="seven-segment-display" data-display-word="${escape(word ?? '')}" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><rect x="-27" y="-34" width="61" height="68" rx="6" style="fill:#121a16;stroke:#718077;stroke-width:1.3"/>${segments.map((segment, index) => {
    const shape = geometry[index], marker = segment.state === 'unknown' ? 'X' : segment.state === 'released' ? 'Z' : '';
    return `<g class="display-segment segment-${segment.name}" data-segment="${segment.name}" data-state="${segment.logic ?? 'unobserved'}"><title>${segment.name}, bit ${segment.bit}: ${labels[segment.state]}</title>${index === 7 ? `<circle cx="${shape.x}" cy="${shape.y}" r="3.4" style="${paint[segment.state]}"/>` : `<polygon points="${shape.points}" style="${paint[segment.state]}"/>`}${marker ? `<text x="${shape.x}" y="${shape.y}" style="fill:${segment.state === 'unknown' ? '#332000' : '#9bdfff'};stroke:none;font:bold 6px sans-serif;text-anchor:middle">${marker}</text>` : ''}</g>`;
  }).join('')}</g>`;
}

/** Larger live/readback display for the result panel. Text retains literal X/Z. */
export function displayPanelMarkup(states) {
  const items = Object.values(states ?? {});
  if (!items.length) return '';
  return `<section class="display-readouts" aria-label="Seven-segment displays"><h3>Seven-segment displays</h3><p class="helper">Actual segment states at the selected time. Bits 7…0: dp, g, f, e, d, c, b, a. X is unknown; Z is released.</p><div class="display-readout-grid">${items.map(state => `<figure class="display-readout"><svg viewBox="-36 -40 78 80" width="117" height="120" aria-label="${escape(state.ref)}">${sevenSegmentMarkup(state, { active: state.active })}</svg><figcaption><strong>${escape(state.ref)}</strong> · ${escape(state.active)} active<br><span class="mono">${escape(state.word ?? 'No result')}</span><br>${state.available ? `${escape(state.glyph)} · ${escape(state.time)} s` : escape(state.reason)}</figcaption></figure>`).join('')}</div></section>`;
}
