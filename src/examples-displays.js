/** Original worked seven-segment circuits. MIT. */
import { newProject, addComponent, uid, validateProject } from './model.js';

const endpoint = (component, pin) => `${component.id}:${pin}`;
function part(project, type, x, y, params = {}) { const component = addComponent(project, type, x, y); Object.assign(component.params, params); return component; }
function wire(project, a, b, points = []) { const id = uid('w'); project.circuit.connections.push({ id, a, b }); project.layout.wires[id] = { points }; }
function label(project, name, target, title = name) { project.circuit.labels.push({ id: uid('label'), name, target }); project.probes.push({ id: uid('probe'), kind: 'logic', a: target, b: null, label: title }); }
function setup(duration) { const project = newProject(); Object.assign(project.analysis, { type: 'tran', duration, step: '10u', uic: false }); return project; }

export function sevenSegmentCounter() {
  const project = setup('16m');
  const clock = part(project, 'CLOCK', 100, 160, { period: '1m', delay: '100u' });
  const enable = part(project, 'DIN', 100, 320, { state: '1' });
  const zero = part(project, 'DIN', 100, 480, { state: '0' });
  const counter = part(project, 'COUNTER', 400, 240, { width: '4', initial: '0x0', delay: '10n' });
  const decoder = part(project, 'HEX7', 660, 240, { mode: 'hex', active: 'high', delay: '10n' });
  const display = part(project, 'SEG7', 900, 240, { active: 'high' });
  wire(project, endpoint(clock, 'out'), endpoint(counter, 'clk'), [{ x: 280, y: 160 }, { x: 280, y: 220 }]);
  wire(project, endpoint(enable, 'out'), endpoint(counter, 'en'), [{ x: 260, y: 320 }, { x: 260, y: 260 }]);
  wire(project, endpoint(zero, 'out'), endpoint(counter, 'rst'), [{ x: 400, y: 480 }]);
  wire(project, endpoint(zero, 'out'), endpoint(decoder, 'dp'), [{ x: 580, y: 480 }, { x: 580, y: 260 }]);
  wire(project, endpoint(counter, 'q'), endpoint(decoder, 'in'), [{ x: 540, y: 240 }, { x: 540, y: 220 }]);
  wire(project, endpoint(decoder, 'out'), endpoint(display, 'in'));
  label(project, 'clock', endpoint(clock, 'out'), 'Clock');
  label(project, 'count', endpoint(counter, 'q'), 'Hex count [3:0]');
  label(project, 'segments', endpoint(decoder, 'out'), 'Segments dp:g:f:e:d:c:b:a');
  project.layout.annotations.push({ id: uid('note'), x: 90, y: 70, text: 'Run, then inspect a time: the display follows the actual segment bus.' });
  project.layout.annotations.push({ id: uid('note'), x: 600, y: 370, text: 'HEX7 and SEG7 active levels must match. Bit 7 is the decimal point.' });
  return project;
}

export function sevenSegmentStates() {
  const project = setup('4.5m');
  const pattern = part(project, 'PATTERN', 160, 240, { width: '8', pattern: '0,00111111; 1m,10000110; 2m,XXXXXXXX; 3m,ZZZZZZZZ; 4m,01000000' });
  const display = part(project, 'SEG7', 460, 240);
  wire(project, endpoint(pattern, 'out'), endpoint(display, 'in'));
  label(project, 'segments', endpoint(pattern, 'out'), 'Segment pattern [7:0]');
  project.layout.annotations.push({ id: uid('note'), x: 100, y: 100, text: '0 → 1 with decimal point → X → Z → middle segment only.' });
  project.layout.annotations.push({ id: uid('note'), x: 100, y: 400, text: 'X and Z remain explicit; they are never painted as a guessed digit.' });
  return project;
}

const definitions = [
  { id: 'seven-segment-counter', title: 'Hex counter with a working seven-segment display', category: 'Displays',
    question: 'How does a four-bit counter drive a seven-segment digit?',
    description: 'A clock drives a four-bit counter. An explicit HEX7 decoder maps its digit and decimal point onto the eight-bit SEG7 segment bus.',
    expected: 'The display starts at 0, advances through 1–9, A, b, C, d, E, F, then wraps to 0. Each visible update follows the rising clock by 20 ns (counter plus decoder delay). Decimal point stays off.',
    tryThis: 'Inspect different simulation times. Set both decoder and display active levels to low, or switch the decoder to BCD to blank counts 10–15.', create: sevenSegmentCounter },
  { id: 'seven-segment-states', title: 'Seven-segment patterns, decimal point, X and Z', category: 'Displays',
    question: 'What should a display show when its segment drivers become uncertain or release the bus?',
    description: 'An eight-bit pattern drives the display directly. Segment bits are independent; bit zero is a, and bit seven is the decimal point.',
    expected: 'Successive one-millisecond intervals show 0; 1 with the decimal point; explicit X markers; explicit Z outlines; and then only segment g. No decoder or analog brightness model is implied.',
    tryThis: 'Replace one pattern word with a custom eight-bit 0/1/X/Z word and inspect the individual segments.', create: sevenSegmentStates }
];
export const DISPLAY_EXAMPLES = definitions.map(meta => ({ ...meta, create: () => {
  const project = meta.create(); Object.assign(project, { title: meta.title, question: meta.question, notes: `${meta.description}\n\nExpected: ${meta.expected}\n\nTry: ${meta.tryThis}` });
  project.assumptions = ['The display is a passive digital indicator. It does not model LED electrical loading or brightness.', 'Bit 0=a, 1=b, 2=c, 3=d, 4=e, 5=f, 6=g, 7=decimal point. Words are MSB first.', 'The displayed state comes from the current project revision and preserved simulation events at the selected time.'];
  return validateProject(project);
} }));
