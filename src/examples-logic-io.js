/** Original digital source and logic-indicator examples. MIT. */
import { newProject, addComponent, uid, validateProject } from './model.js';

const pin = (component, name) => `${component.id}:${name}`;
function part(project, type, x, y, params = {}, rotation = 0) {
  const component = addComponent(project, type, x, y);
  Object.assign(component.params, params); project.layout.components[component.id].rotation = rotation;
  return component;
}
function wire(project, a, b, points = []) { const id = uid('w'); project.circuit.connections.push({ id, a, b }); project.layout.wires[id] = { points }; }
function observe(project, target, name, title, digital = true) {
  project.circuit.labels.push({ id: uid('label'), target, name });
  project.probes.push({ id: uid('probe'), kind: digital ? 'logic' : 'voltage', a: target, b: null, label: title });
}
function note(project, x, y, text) { project.layout.annotations.push({ id: uid('note'), x, y, text }); }
function base(duration = '5m', solver = 'ngspice') {
  const project = newProject(); Object.assign(project.analysis, { type: 'tran', solver, duration, step: '10u', uic: false }); return project;
}

export function digitalVoltageSource() {
  const project = base('2m');
  const source = part(project, 'DVS', 140, 240, { state: '1' });
  const inverter = part(project, 'NOT', 440, 240, { delay: '10n' });
  const direct = part(project, 'DLED', 340, 100);
  const inverted = part(project, 'DLED', 680, 240);
  wire(project, pin(source, 'out'), pin(inverter, 'in'));
  wire(project, pin(source, 'out'), pin(direct, 'in'), [{ x: 260, y: 240 }, { x: 260, y: 100 }]);
  wire(project, pin(inverter, 'out'), pin(inverted, 'in'));
  observe(project, pin(source, 'out'), 'input', 'Source state');
  observe(project, pin(inverter, 'out'), 'inverted', 'Inverted state');
  note(project, 100, 30, 'Red means HIGH (1). Dark means LOW (0). Run to observe both indicators.');
  note(project, 100, 390, 'Change DV1 in its inspector, then Run. Continuous → Live inputs changes it without restarting.');
  return project;
}

export function digitalVoltageRC() {
  const project = base('5m', 'coordinated'); project.analysis.uic = true;
  const source = part(project, 'DVS', 140, 260, { state: '1', outputMode: 'logic-voltage', low: '0', high: '5', rise: '1u', fall: '1u' });
  const resistor = part(project, 'R', 380, 140, { value: '1k' });
  const capacitor = part(project, 'C', 560, 260, { value: '1u', ic: '0' }, 90);
  const adc = part(project, 'ADC', 740, 220, { mode: 'schmitt', low: '1.5', high: '3.5' });
  const direct = part(project, 'DLED', 380, 340);
  const sensed = part(project, 'DLED', 960, 220);
  const ground = part(project, 'GND', 140, 440);
  wire(project, pin(source, 'p'), pin(resistor, '1'), [{ x: 140, y: 140 }]);
  wire(project, pin(resistor, '2'), pin(capacitor, '1'), [{ x: 560, y: 140 }]);
  wire(project, pin(capacitor, '1'), pin(adc, 'in'), [{ x: 640, y: 220 }, { x: 640, y: 200 }]);
  wire(project, pin(source, 'n'), pin(ground, '0'));
  wire(project, pin(capacitor, '2'), pin(ground, '0'), [{ x: 560, y: 420 }]);
  wire(project, pin(adc, 'ref'), pin(ground, '0'), [{ x: 700, y: 420 }]);
  wire(project, pin(source, 'out'), pin(direct, 'in'), [{ x: 260, y: 260 }, { x: 260, y: 340 }]);
  wire(project, pin(adc, 'out'), pin(sensed, 'in'));
  observe(project, pin(source, 'out'), 'command', 'Digital command');
  observe(project, pin(source, 'p'), 'drive', 'Source voltage', false);
  observe(project, pin(capacitor, '1'), 'sense', 'Capacitor voltage', false);
  observe(project, pin(adc, 'out'), 'threshold', 'Schmitt logic');
  note(project, 100, 60, 'The source is HIGH immediately; the RC voltage takes time to cross the ADC threshold.');
  note(project, 100, 530, 'Continuous → Live inputs: change DV1 to 0, then watch the charged capacitor discharge.');
  return project;
}

export function logicIndicatorStates() {
  const project = base('4.5m');
  const states = ['1', '0', 'X', 'Z'];
  for (let index = 0; index < states.length; index++) {
    const x = index % 2 ? 640 : 120, y = index < 2 ? 160 : 400;
    const pattern = Array.from({ length: 5 }, (_, step) => `${step ? `${step}m` : '0'},${states[(index + step) % states.length]}`).join('; ');
    const source = part(project, 'PATTERN', x, y, { width: '1', pattern, repeat: '0' });
    const indicator = part(project, 'DLED', x + 240, y);
    wire(project, pin(source, 'out'), pin(indicator, 'in'));
    observe(project, pin(source, 'out'), `state_${index + 1}`, `Pattern ${index + 1}`);
  }
  note(project, 90, 50, 'HIGH = red glow · LOW = dark · X = unknown · Z = released');
  note(project, 90, 540, 'Move Cursor A through the four one-millisecond windows to inspect actual resolved states.');
  return project;
}

const definitions = [
  { id: 'digital-voltage-source', title: 'Digital voltage source and red logic indicators', category: 'Digital inputs & indicators',
    question: 'How can a switchable digital source drive gates and visible logic indicators?',
    description: 'A binary digital voltage source drives a NOT gate. Two passive indicators observe the source and its complement; a known HIGH glows red.',
    expected: 'With DV1 at 1, IND1 glows red HIGH and IND2 is dark LOW. Set DV1 to 0 and run again to reverse them. In Continuous, live changes propagate through the inverter after its 10 ns delay.',
    tryThis: 'Select DV1 to choose its binary state. Start Continuous and use Live inputs to change between 0 and 1 while retaining simulation time.', create: digitalVoltageSource },
  { id: 'digital-voltage-rc', title: 'Digital voltage source, RC response and logic indicators', category: 'Mixed signal',
    question: 'How do a digital command and the resulting analog voltage differ in time?',
    description: 'The source exposes both a digital output and explicit 0/5 V terminals. Its voltage charges a 1 kΩ / 1 µF network, whose voltage passes through a Schmitt ADC to a second indicator.',
    expected: 'The direct indicator is HIGH at startup. The RC voltage begins at zero and crosses the 3.5 V high threshold near 1.21 ms with the configured 10 µs maximum step; the sensed indicator then glows red. The capacitor approaches 5 V.',
    tryThis: 'Use Continuous and set DV1 to 0 in Live inputs. Its direct indicator goes LOW immediately; the sensed indicator stays HIGH until the capacitor discharges below 1.5 V. Reducing the maximum step improves numerical convergence.', create: digitalVoltageRC },
  { id: 'logic-indicator-states', title: 'Logic indicators: high, low, unknown and released', category: 'Digital inputs & indicators',
    question: 'How can a visible indicator preserve unknown and released logic instead of guessing a binary value?',
    description: 'Four scalar patterns cycle through 1, 0, X and Z at one-millisecond boundaries. Every interval contains one example of each state.',
    expected: 'Only the HIGH indicator glows red. LOW stays dark, X is explicitly unknown, and Z is explicitly high impedance. Cursor A selects the preserved event states at that exact time.',
    tryThis: 'Run, then move Cursor A before and after 1 ms. At an event time, the newly recorded state is already in effect. Clear the cursor to return to the last retained states.', create: logicIndicatorStates }
];

export const LOGIC_IO_EXAMPLES = definitions.map(meta => ({ ...meta, create: () => {
  const project = meta.create(); Object.assign(project, { title: meta.title, question: meta.question, notes: `${meta.description}\n\nExpected: ${meta.expected}\n\nTry: ${meta.tryThis}` });
  project.assumptions = [
    'Logic indicators observe resolved 0/1/X/Z events. They add no load or drive strength, and the red glow does not represent LED current or physical brightness.',
    'The displayed state belongs to the selected time and the current project revision. Missing or stale results remain unobserved.',
    ...(meta.id === 'digital-voltage-rc' ? ['The explicit voltage output is an ideal differential source with finite edges; it has no current limit or output resistance.', 'The 1 ms RC time constant is solved using coordinated backward Euler; reduce maximum step to check convergence.'] : ['The digital-only source output is a binary logic signal. Its optional voltage terminals must be enabled and wired explicitly for analog experiments.'])
  ];
  return validateProject(project);
} }));
