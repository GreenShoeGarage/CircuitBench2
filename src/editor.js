/* CircuitBench SVG schematic editor. Electrical intent lives in project.circuit. */
import { getPart, getPins, parseLogicWord } from './library.js';
import { addComponent, removeItems, duplicateItems, endpointPosition, uid, clone, buildNets, getEndpointDomain, canConnect } from './model.js';
import { symbolMarkup, escapeXML, SYMBOL_CSS } from './symbols.js';

const NS = 'http://www.w3.org/2000/svg';
const GRID = 20;
const snap = n => Math.round(n / GRID) * GRID;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const equal = (a, b) => dist(a, b) < .01;
const itemIds = p => [...p.circuit.components, ...p.circuit.connections, ...p.circuit.junctions, ...p.circuit.labels, ...(p.layout.annotations || [])].map(i => i.id);
const safePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const compact = points => points.filter((p, i) => safePoint(p) && (i === 0 || !equal(p, points[i - 1])));
function networkView(project) {
  try { const built = buildNets(project), domains = Object.create(null), widths = Object.create(null), conflicts = Object.create(null); for (const net of built.nets) for (const endpoint of net.endpoints) { domains[endpoint] = net.domain; widths[endpoint] = net.width; conflicts[endpoint] = net.widthConflict; } return { nets: built.endpointToNet, domains, widths, conflicts }; }
  catch { return { nets: {}, domains: {}, widths: {}, conflicts: {} }; }
}

function bodyBounds(project, componentId) {
  const component = project.circuit.components.find(c => c.id === componentId), l = project.layout.components[componentId];
  if (!component || !l) return null;
  const boxes = { R: [-29,-13,29,13], C: [-12,-25,12,25], L: [-30,-23,30,5], V: [-26,-26,26,26], I: [-26,-26,26,26], D: [-19,-21,19,21], LED: [-19,-21,19,21], GND: [-23,-4,23,18], NPN: [-18,-26,26,35], PNP: [-18,-26,26,35], NMOS: [-23,-27,25,27], PMOS: [-23,-27,25,27], SW: [-23,-22,23,24], OPAMP: [-27,-34,31,34], DIN: [-29,-25,29,25], CLOCK: [-29,-25,29,25], BUF: [-28,-28,28,28], NOT: [-28,-28,33,28], AND: [-28,-31,27,31], NAND: [-28,-31,36,31], OR: [-31,-31,27,31], NOR: [-31,-31,36,31], XOR: [-36,-31,27,31], XNOR: [-36,-31,36,31], TRI: [-29,-32,29,32], DFF: [-29,-33,29,33], ADC: [-29,-33,31,33], DAC: [-31,-33,31,33], SEG7: [-27,-34,34,34], HEX7: [-29,-33,29,33], ADCBUS: [-29,-33,31,33], DACBUS: [-31,-33,31,33] };
  const [x0,y0,x1,y1] = boxes[component.type] || (['REGISTER','COUNTER','MUX','DECODER','LUT','JOIN'].includes(component.type) ? [-30,-33,30,33] : [-28,-28,28,28]), angle = (l.rotation || 0) * Math.PI / 180;
  const points = [[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([px,py]) => { const x = l.mirror ? -px : px; return { x: l.x + Math.round(x*Math.cos(angle)-py*Math.sin(angle)), y: l.y + Math.round(x*Math.sin(angle)+py*Math.cos(angle)) }; });
  return { x0: Math.min(...points.map(p=>p.x)), y0: Math.min(...points.map(p=>p.y)), x1: Math.max(...points.map(p=>p.x)), y1: Math.max(...points.map(p=>p.y)) };
}
function insideBody(point, box) { return point.x > box.x0 + .01 && point.x < box.x1 - .01 && point.y > box.y0 + .01 && point.y < box.y1 - .01; }
function segmentCrossesBody(a,b,box) {
  if (a.y === b.y) return a.y > box.y0 + .01 && a.y < box.y1 - .01 && Math.max(a.x,b.x) > box.x0 + .01 && Math.min(a.x,b.x) < box.x1 - .01;
  if (a.x === b.x) return a.x > box.x0 + .01 && a.x < box.x1 - .01 && Math.max(a.y,b.y) > box.y0 + .01 && Math.min(a.y,b.y) < box.y1 - .01;
  return false;
}
function routeBetween(a,b,obstacles,preferred) {
  const collisions = points => points.slice(1).reduce((n,p,i)=>n+obstacles.filter(box=>segmentCrossesBody(points[i],p,box)).length,0);
  const original = compact(preferred || [a,{x:b.x,y:a.y},b]);
  if (!collisions(original)) return original;
  const candidates = [original,compact([a,{x:a.x,y:b.y},b]),compact([a,{x:b.x,y:a.y},b])];
  if (obstacles.length) {
    const left = Math.floor(Math.min(...obstacles.map(r=>r.x0))/GRID)*GRID-GRID, right = Math.ceil(Math.max(...obstacles.map(r=>r.x1))/GRID)*GRID+GRID;
    const top = Math.floor(Math.min(...obstacles.map(r=>r.y0))/GRID)*GRID-GRID, bottom = Math.ceil(Math.max(...obstacles.map(r=>r.y1))/GRID)*GRID+GRID;
    for (const x of [left,right]) candidates.push(compact([a,{x,y:a.y},{x,y:b.y},b]));
    for (const y of [top,bottom]) candidates.push(compact([a,{x:a.x,y},{x:b.x,y},b]));
  }
  const length = points => points.slice(1).reduce((sum,p,i)=>sum+dist(points[i],p),0);
  candidates.sort((x,y)=>collisions(x)-collisions(y)||length(x)-length(y));
  return candidates[0];
}

/** Drawing geometry is derived from actual endpoint positions on every render. */
export function wirePolyline(project, connection) {
  let start, end;
  try { start = endpointPosition(project, connection.a); end = endpointPosition(project, connection.b); } catch { return []; }
  if (!safePoint(start) || !safePoint(end)) return [];
  const owner = ep => ep.startsWith('j:') ? null : ep.split(':')[0];
  const obstacles = [...new Set([owner(connection.a),owner(connection.b)].filter(Boolean))].map(id=>bodyBounds(project,id)).filter(Boolean);
  const middle = project.layout.wires?.[connection.id]?.points || [];
  if (!middle.length) {
    if (start.x === end.x || start.y === end.y) return routeBetween(start,end,obstacles,[start,end]);
    const mx = snap((start.x + end.x) / 2);
    return routeBetween(start,end,obstacles,[start,{x:mx,y:start.y},{x:mx,y:end.y},end]);
  }
  const points = [start, ...middle, end];
  const orthogonal = [start];
  for (let i = 1; i < points.length; i++) {
    const previous = orthogonal.at(-1), next = points[i];
    if (!safePoint(next)) continue;
    orthogonal.push(...routeBetween(previous,next,obstacles).slice(1));
  }
  return compact(orthogonal);
}

function nearestSegment(point, points) {
  let best = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], vx = b.x - a.x, vy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * vx + (point.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
    const at = { x: a.x + t * vx, y: a.y + t * vy };
    const d = dist(point, at);
    if (!best || d < best.distance) best = { point: at, distance: d, segment: i };
  }
  return best;
}

function pathD(points) { return points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' '); }
function componentTransform(layout) { return `translate(${layout.x} ${layout.y}) rotate(${layout.rotation || 0}) scale(${layout.mirror ? -1 : 1} 1)`; }
function pointInside(point, box) { return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height; }
function labelPosition(project, label) {
  try { const p = endpointPosition(project, label.target); return { x: p.x + 9, y: p.y - 10 }; } catch { return { x: 0, y: 0 }; }
}

const STYLE = `
${SYMBOL_CSS}
.schematic-svg { display:block; width:100%; height:100%; min-height:260px; touch-action:none; outline:none; background:var(--canvas,#121a18); user-select:none; }
.schematic-svg:focus-visible { outline:2px solid var(--accent,#b9ed8e); outline-offset:-3px; }
.schematic-grid-dot { fill:var(--grid,#34413a); }
.wire { fill:none; stroke:var(--wire,#8fb49e); stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
.wire-digital { stroke:var(--blue,#89bdf2); }
.wire-bus { stroke-width:3.6; }
.wire-mixed,.wire-width-conflict { stroke:var(--danger,#fb969d); stroke-dasharray:5 3; }
.bus-width-marker { pointer-events:none; }
.bus-width-marker path { stroke:var(--blue,#89bdf2); stroke-width:1.8; }
.bus-width-marker text { fill:var(--blue,#89bdf2); font:600 10px ui-monospace,monospace; }
.wire-hit { fill:none; stroke:transparent; stroke-width:14; cursor:pointer; }
.selected-wire { stroke:var(--accent,#b9ed8e); stroke-width:3; }
.wire-bus.selected-wire { stroke-width:4.8; }
.component-hit { fill:transparent; stroke:transparent; stroke-width:1; rx:5; }
.component.selected .component-hit { fill:var(--selection,rgba(167,223,128,.07)); stroke:var(--accent,#b9ed8e); stroke-dasharray:5 3; }
.component:focus .component-hit,.junction:focus .junction-focus,.annotation:focus rect { stroke:var(--accent,#b9ed8e); stroke-width:2; }
.component { cursor:grab; outline:none; }
.component-label { fill:var(--text,#e7ece8); font:600 13px system-ui,sans-serif; text-anchor:middle; pointer-events:none; }
.component-value { fill:var(--muted,#aebdb3); font:12px ui-monospace,SFMono-Regular,Consolas,monospace; text-anchor:middle; pointer-events:none; }
.pin { fill:var(--canvas,#121a18); stroke:var(--wire,#8fb49e); stroke-width:1.7; cursor:crosshair; outline:none; }
.pin-digital { stroke:var(--blue,#89bdf2); }
.pin-bus { stroke-width:2.4; }
.pin-width { fill:var(--blue,#89bdf2); font:600 9px ui-monospace,monospace; pointer-events:none; }
.pin:focus,.pin:hover { fill:var(--accent,#b9ed8e); stroke:var(--text,#e7ece8); stroke-width:2.5; }
.pin-hit { fill:transparent; cursor:crosshair; }
.pin:focus ~ .pin-name { opacity:1; }
.pin-name { fill:var(--muted,#aebdb3); font:10px ui-monospace,monospace; opacity:0; pointer-events:none; }
.junction-dot { fill:var(--wire,#8fb49e); stroke:var(--canvas,#121a18); stroke-width:1; }
.junction-digital { fill:var(--blue,#89bdf2); }
.junction-mixed,.junction-width-conflict { fill:var(--danger,#fb969d); }
.junction-focus { fill:transparent; stroke:transparent; }
.junction.selected .junction-focus { stroke:var(--accent,#b9ed8e); }
.net-label { fill:var(--accent,#b9ed8e); font:600 12px ui-monospace,SFMono-Regular,monospace; cursor:pointer; }
.net-label.selected { text-decoration:underline; }
.annotation text { fill:var(--muted,#aebdb3); font:13px system-ui,sans-serif; }
.annotation rect { fill:var(--canvas,#121a18); stroke:transparent; }
.annotation.selected rect { stroke:var(--accent,#b9ed8e); stroke-dasharray:4 3; }
.annotation { cursor:grab; outline:none; }
.wire-handle { fill:var(--canvas,#121a18); stroke:var(--accent,#b9ed8e); stroke-width:2; cursor:move; }
.draft-wire { fill:none; stroke:var(--accent,#b9ed8e); stroke-width:2.5; stroke-dasharray:7 4; pointer-events:none; }
.snap-ring { fill:var(--selection,rgba(167,223,128,.08)); stroke:var(--accent,#b9ed8e); stroke-width:2; pointer-events:none; }
.snap-invalid { stroke:var(--danger,#fb969d); stroke-dasharray:3 3; }
.select-box { fill:var(--selection,rgba(167,223,128,.10)); stroke:var(--accent,#b9ed8e); stroke-dasharray:5 3; pointer-events:none; }
.placement-ghost { opacity:.5; pointer-events:none; }
.probe-marker { fill:var(--accent,#b9ed8e); stroke:var(--canvas,#121a18); stroke-width:1; pointer-events:none; }
.probe-logic { fill:var(--blue,#89bdf2); }
.workspace-message { fill:var(--muted,#aebdb3); font:14px system-ui,sans-serif; text-anchor:middle; }
.workspace-message-title { fill:var(--text,#e7ece8); font:600 20px system-ui,sans-serif; text-anchor:middle; }
.schematic-svg[data-mode=pan] { cursor:grab; }
.schematic-svg[data-mode=wire],.schematic-svg[data-mode=junction],.schematic-svg[data-mode=probe],.schematic-svg[data-mode=place] { cursor:crosshair; }
`;

export class SchematicEditor {
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.mode = 'select';
    this.selection = new Set();
    this.view = { x: -100, y: -80, width: 1000, height: 600 };
    this.pointer = null;
    this.snapTarget = null;
    this.wireDraft = null;
    this.drag = null;
    this.preview = null;
    this.placeType = null;
    this.clipboard = null;
    this.probeAnchor = null;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.classList.add('schematic-svg');
    this.svg.setAttribute('role', 'group');
    this.svg.setAttribute('aria-label', 'Circuit schematic. Tab to components and pins. W wires, P probes, V select, R rotate, M mirror, F fit.');
    this.svg.setAttribute('tabindex', '0');
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    container.replaceChildren(this.svg);
    this.svg.addEventListener('pointerdown', event => this.pointerDown(event));
    this.svg.addEventListener('pointermove', event => this.pointerMove(event));
    this.svg.addEventListener('pointerup', event => this.pointerUp(event));
    this.svg.addEventListener('pointercancel', event => this.pointerCancel(event));
    this.svg.addEventListener('dblclick', event => this.doubleClick(event));
    this.svg.addEventListener('keydown', event => this.keyDown(event));
    this.svg.addEventListener('wheel', event => this.wheel(event), { passive: false });
    this.svg.addEventListener('contextmenu', event => event.preventDefault());
    this.render();
  }

  get project() { return this.callbacks.getProject(); }
  get displayProject() { return this.preview || this.project; }
  status(text) { this.callbacks.onStatus?.(text); }
  change(mutator, label) { this.callbacks.onChange(mutator, label); this.render(); }
  focus() { this.svg.focus({ preventScroll: true }); }
  getSelection() { return [...this.selection]; }

  select(ids) {
    const valid = new Set(itemIds(this.project));
    this.selection = new Set(ids.filter(id => valid.has(id)));
    this.callbacks.onSelect?.(this.getSelection());
    this.render();
  }

  setMode(mode) {
    if (!['select', 'wire', 'pan', 'junction', 'label', 'note', 'probe', 'place'].includes(mode)) return;
    this.mode = mode;
    this.wireDraft = null;
    this.placeType = null;
    this.probeAnchor = null;
    this.preview = null;
    this.drag = null;
    this.snapTarget = null;
    this.callbacks.onMode?.(mode);
    const hints = {
      select: 'Select: click a part; Shift-click for a group. Drag empty space for a selection box.',
      wire: 'Wire: click a pin, click bends if needed, then click another pin. Escape cancels.',
      pan: 'Pan: drag the canvas. Scroll to zoom. F fits the circuit.',
      junction: 'Junction: click a wire or crossing to connect it explicitly. Crossing lines otherwise remain separate.',
      label: 'Label: click a pin, junction, or wire. Equal net labels join electrically.',
      note: 'Note: click the canvas to add an annotation.',
      probe: 'Probe: click for voltage or logic state. Shift-click a second analog pin for a voltage difference.'
    };
    this.status(hints[mode] || 'Click the canvas to place a component.');
    this.render();
  }

  place(type) {
    const part = getPart(type);
    if (!part) return;
    this.setMode('place');
    this.placeType = type;
    this.status(`Place ${part.name}: click the canvas. Enter places at the center. Escape finishes.`);
    this.focus();
    this.render();
  }

  cancel() { this.setMode('select'); }

  render() {
    const project = this.displayProject;
    if (!project?.circuit || !project?.layout) return;
    const valid = new Set(itemIds(project));
    this.selection = new Set([...this.selection].filter(id => valid.has(id)));
    this.svg.dataset.mode = this.mode;
    this.svg.setAttribute('viewBox', `${this.view.x} ${this.view.y} ${this.view.width} ${this.view.height}`);
    const network = networkView(project), { nets } = network;
    const parts = [];
    parts.push(`<title>${escapeXML(project.title || 'Circuit schematic')}</title><desc>Electrical connections use explicit wires and junctions; crossings do not connect automatically.</desc><style>${STYLE}</style>`);
    parts.push(`<defs><pattern id="cb-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle class="schematic-grid-dot" cx="0" cy="0" r="1"/></pattern></defs><rect x="${this.view.x - 3000}" y="${this.view.y - 3000}" width="${this.view.width + 6000}" height="${this.view.height + 6000}" fill="url(#cb-grid)"/>`);
    parts.push(this.renderWires(project, network));
    parts.push(this.renderComponents(project, nets));
    parts.push(this.renderJunctions(project, nets, network));
    parts.push(this.renderLabels(project));
    parts.push(this.renderNotes(project));
    parts.push(this.renderProbes(project, network.widths));
    if (this.wireDraft) {
      const start = this.position(this.wireDraft.start);
      if (start && this.pointer) {
        const end = this.snapTarget?.point || { x: snap(this.pointer.x), y: snap(this.pointer.y) };
        const route = this.draftPolyline(start, this.wireDraft.points, end);
        parts.push(`<path class="draft-wire" d="${pathD(route)}"/>`);
      }
    }
    if (this.snapTarget) parts.push(`<circle class="snap-ring${this.snapTarget.compatible === false ? ' snap-invalid' : ''}" cx="${this.snapTarget.point.x}" cy="${this.snapTarget.point.y}" r="10"/>`);
    if (this.drag?.kind === 'box' && this.drag.box) {
      const b = this.drag.box;
      parts.push(`<rect class="select-box" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}"/>`);
    }
    if (this.mode === 'place' && this.placeType && this.pointer) parts.push(`<g class="placement-ghost symbol-art" transform="translate(${snap(this.pointer.x)} ${snap(this.pointer.y)})">${symbolMarkup(this.placeType, getPart(this.placeType).defaults)}</g>`);
    if (!project.circuit.components.length && !project.circuit.connections.length && !project.layout.annotations?.length && this.mode === 'select') {
      const x = this.view.x + this.view.width / 2, y = this.view.y + this.view.height / 2;
      parts.push(`<text class="workspace-message-title" x="${x}" y="${y - 32}">Your next circuit starts here</text><text class="workspace-message" x="${x}" y="${y}">Choose a part from the drawer, or open a worked example.</text><text class="workspace-message" x="${x}" y="${y + 26}">Place → wire → run → measure</text>`);
    }
    const focusKey = this.svg.contains(document.activeElement) && document.activeElement !== this.svg ? document.activeElement.dataset.focusKey : null;
    this.svg.innerHTML = parts.join('');
    if (focusKey && !this.drag) [...this.svg.querySelectorAll('[data-focus-key]')].find(el => el.dataset.focusKey === focusKey)?.focus({ preventScroll: true });
  }

  renderWires(project, network = networkView(project)) {
    return project.circuit.connections.map(connection => {
      const points = wirePolyline(project, connection);
      if (points.length < 2) return '';
      const selected = this.selection.has(connection.id), d = pathD(points);
      const domain = network.domains[connection.a], width = network.widths[connection.a], conflict = network.conflicts[connection.a];
      let html = `<g data-item="${escapeXML(connection.id)}" data-wire="${escapeXML(connection.id)}"><path class="wire${domain ? ' wire-' + domain : ''}${width > 1 ? ' wire-bus' : ''}${conflict ? ' wire-width-conflict' : ''}${selected ? ' selected-wire' : ''}" d="${d}"/><path class="wire-hit" d="${d}" tabindex="0" role="button" data-focus-key="wire-${escapeXML(connection.id)}" aria-label="${escapeXML(domain || 'Unassigned')} ${width > 1 ? width + '-bit bus' : 'wire'}${conflict ? ' with conflicting widths' : ''} ${escapeXML(connection.a)} to ${escapeXML(connection.b)}. Delete removes it; Enter selects it."/></g>`;
      if (width > 1) {
        const longest = points.slice(1).map((point, index) => ({ a: points[index], b: point, length: dist(points[index], point) })).sort((a,b) => b.length-a.length)[0];
        if (longest?.length >= 40) { const x = (longest.a.x+longest.b.x)/2, y = (longest.a.y+longest.b.y)/2; html += `<g class="bus-width-marker" aria-hidden="true"><path d="M${x-4} ${y+5}L${x+4} ${y-5}"/><text x="${x+8}" y="${y-7}">${width}</text></g>`; }
      }
      if (selected && this.mode === 'select') {
        const handles = project.layout.wires?.[connection.id]?.points || [];
        html += handles.map((point, index) => `<rect class="wire-handle" x="${point.x - 5}" y="${point.y - 5}" width="10" height="10" data-handle="${index}" data-wire="${escapeXML(connection.id)}" data-item="${escapeXML(connection.id)}" tabindex="0" role="button" data-focus-key="handle-${escapeXML(connection.id)}-${index}" aria-label="Wire bend ${index + 1}. Arrow keys move; Delete removes bend."/>`).join('');
      }
      return html;
    }).join('');
  }

  renderComponents(project, nets) {
    const displays = this.callbacks.getDisplayStates?.(project) ?? {};
    return project.circuit.components.map(component => {
      const part = getPart(component.type), l = project.layout.components[component.id];
      if (!part || !l) return '';
      const pins = getPins(component);
      const selected = this.selection.has(component.id);
      const rotatedVertical = Math.abs((l.rotation || 0) % 180) === 90;
      const display = displays[component.id];
      const value = this.componentValue(component, part, display);
      const hasLogic = pins.some(pin => pin.domain === 'digital');
      const sideLabel = !hasLogic && (component.type === 'V' || component.type === 'I' || component.type === 'GND' || rotatedVertical);
      const labelX = sideLabel ? l.x + 57 : l.x;
      const labelY = sideLabel ? l.y - 6 : l.y - (hasLogic ? rotatedVertical ? 72 : 56 : 39);
      let html = `<g class="component${selected ? ' selected' : ''}" data-item="${escapeXML(component.id)}" data-component="${escapeXML(component.id)}" role="button" tabindex="0" data-focus-key="component-${escapeXML(component.id)}" aria-label="${escapeXML(component.ref)} ${escapeXML(part.name)} ${escapeXML(value)}. Arrow keys move; R rotates; M mirrors; Enter selects."><g transform="${componentTransform(l)}"><rect class="component-hit" x="-48" y="-48" width="96" height="96"/><g class="symbol-art">${symbolMarkup(component.type, component.params, display)}</g></g><text class="component-label" x="${labelX}" y="${labelY}">${escapeXML(component.ref)}</text>${value ? `<text class="component-value" x="${labelX}" y="${labelY + 17}">${escapeXML(value)}</text>` : ''}</g>`;
      html += pins.map(pin => {
        const ep = `${component.id}:${pin.id}`;
        let point;
        try { point = endpointPosition(project, ep); } catch { return ''; }
        if (!safePoint(point)) return '';
        const digital = pin.domain === 'digital', bus = digital && pin.width > 1, radius = bus ? 4.8 : 3.8, tag = digital ? 'rect' : 'circle', geometry = digital ? `x="${point.x - radius}" y="${point.y - radius}" width="${radius*2}" height="${radius*2}"` : `cx="${point.x}" cy="${point.y}" r="3.8"`;
        const pinDescription = `${bus ? pin.width + '-bit ' : ''}${digital ? 'digital' : 'analog'} ${pin.direction || 'passive'}`;
        const leftPin = point.x < l.x-20, horizontalPin = Math.abs(point.x-l.x)>20, range = bus ? `<text class="pin-width" x="${point.x+(leftPin?-9:9)}" y="${point.y+(horizontalPin?-8:4)}" text-anchor="${leftPin?'end':'start'}">[${pin.width-1}:0]</text>` : '';
        return `<g data-endpoint="${escapeXML(ep)}"><circle class="pin-hit" cx="${point.x}" cy="${point.y}" r="10"/><${tag} class="pin${digital ? ' pin-digital' : ''}${bus ? ' pin-bus' : ''}" ${geometry} role="button" tabindex="0" data-focus-key="pin-${escapeXML(ep)}" aria-label="${escapeXML(component.ref)} ${escapeXML(pin.name || pin.id)} ${pinDescription} pin, net ${escapeXML(nets[ep] ?? 'unconnected')}. Enter connects in Wire mode or measures ${bus ? 'bus word' : digital ? 'logic state' : 'voltage'}."><title>${escapeXML(component.ref)} · ${escapeXML(pin.name || pin.id)} · ${pinDescription} · ${escapeXML(nets[ep] ?? 'unconnected')}</title></${tag}>${range}${bus ? '' : `<text class="pin-name" x="${point.x + 7}" y="${point.y - 7}">${escapeXML(pin.name || pin.id)}</text>`}</g>`;
      }).join('');
      return html;
    }).join('');
  }

  componentValue(component, part, displayState = null) {
    const params = component.params || {};
    if (component.type === 'GND') return '';
    if (component.type === 'SEG7') return displayState?.available ? `${displayState.glyph} · ${displayState.word}` : `8 segments · ${params.active ?? 'high'} active`;
    if (component.type === 'HEX7') return `${String(params.mode ?? 'hex').toUpperCase()} · ${params.active ?? 'high'} active`;
    if (component.type === 'DIN') return `State ${params.state ?? '0'}`;
    if (component.type === 'BUSIN') { let word; try { word = parseLogicWord(params.value, params.width); } catch { word = String(params.value).slice(0,12); } return `${params.width}-bit · ${word}`; }
    if (component.type === 'PATTERN') return `${params.width}-bit pattern`;
    if (component.type === 'SLICE') return Number(params.count) === 1 ? `bit [${params.lsb}]` : `bits [${Number(params.lsb)+Number(params.count)-1}:${params.lsb}]`;
    if (component.type === 'JOIN') return `B:A · ${Number(params.aWidth)+Number(params.bWidth)} bits`;
    if (['REGISTER','COUNTER'].includes(component.type)) return `${params.width}-bit · init ${String(params.initial).slice(0,10)}`;
    if (component.type === 'MUX') return `${params.width}-bit mux`;
    if (component.type === 'DECODER') return `${params.inputBits} → ${2**Number(params.inputBits)} bits`;
    if (component.type === 'LUT') return `${params.inputBits} → ${params.outputBits} bits`;
    if (component.type === 'CLOCK') return `${params.period} s · ${params.duty}%`;
    if (component.type === 'DFF') return `DFF · starts ${params.initial ?? 'X'}`;
    if (component.type === 'ADCBUS') return `${params.width}-bit · ${params.vmin} / ${params.vmax} V`;
    if (component.type === 'DACBUS') return `${params.width}-bit · ${params.low} / ${params.high} V`;
    if (component.type === 'ADC') return `${params.low} / ${params.high} V${params.mode === 'schmitt' ? ' · Schmitt' : ''}`;
    if (component.type === 'DAC') return `${params.low} / ${params.high} V`;
    if (part.pins?.some(pin => pin.domain === 'digital')) return params.delay && params.delay !== '0' ? `delay ${params.delay} s` : '';
    if (['V', 'I'].includes(component.type)) {
      const waveform = params.waveform || params.mode || 'DC';
      if (String(waveform).toUpperCase() !== 'DC') return String(waveform).toUpperCase();
      return `${params.dc ?? params.value ?? part.defaults?.dc ?? ''} ${component.type === 'V' ? 'V' : 'A'}`;
    }
    if (params.value !== undefined) return `${params.value}${['R', 'C', 'L'].includes(component.type) ? ' ' + ({ R: 'Ω', C: 'F', L: 'H' })[component.type] : ''}`;
    if (['D', 'LED', 'NPN', 'PNP', 'NMOS', 'PMOS', 'OPAMP'].includes(component.type)) return part.modelLabel || 'generic';
    return '';
  }

  renderJunctions(project, nets, network = networkView(project)) {
    return project.circuit.junctions.map(junction => {
      const point = project.layout.junctions[junction.id];
      if (!safePoint(point)) return '';
      const ep = `j:${junction.id}`;
      const domain = network.domains[ep], width = network.widths[ep], conflict = network.conflicts[ep], radius = width > 1 ? 6 : 4.5, dot = domain === 'digital' ? `<rect class="junction-dot junction-digital${conflict?' junction-width-conflict':''}" x="${point.x - radius}" y="${point.y - radius}" width="${radius*2}" height="${radius*2}"/>` : `<circle class="junction-dot${domain === 'mixed' ? ' junction-mixed' : ''}" cx="${point.x}" cy="${point.y}" r="5"/>`;
      return `<g class="junction${this.selection.has(junction.id) ? ' selected' : ''}" data-item="${escapeXML(junction.id)}" data-endpoint="${escapeXML(ep)}" role="button" tabindex="0" data-focus-key="junction-${escapeXML(junction.id)}" aria-label="${escapeXML(domain || 'Unassigned')} ${width > 1 ? width+'-bit bus ' : ''}junction${conflict?' with conflicting widths':''}, net ${escapeXML(nets[ep] ?? 'unconnected')}. Enter measures or connects."><circle class="junction-focus" cx="${point.x}" cy="${point.y}" r="11"/>${dot}</g>`;
    }).join('');
  }

  renderLabels(project) {
    return project.circuit.labels.map(label => {
      const p = labelPosition(project, label);
      return `<text class="net-label${this.selection.has(label.id) ? ' selected' : ''}" x="${p.x}" y="${p.y}" data-item="${escapeXML(label.id)}" data-label="${escapeXML(label.id)}" tabindex="0" role="button" data-focus-key="label-${escapeXML(label.id)}" aria-label="Net label ${escapeXML(label.name)}. Enter edits.">${escapeXML(label.name)}</text>`;
    }).join('');
  }

  renderNotes(project) {
    return (project.layout.annotations || []).map(note => {
      const lines = String(note.text).split('\n'), width = Math.max(80, Math.min(600, Math.max(...lines.map(l => l.length)) * 7.4));
      return `<g class="annotation${this.selection.has(note.id) ? ' selected' : ''}" data-item="${escapeXML(note.id)}" data-note="${escapeXML(note.id)}" tabindex="0" role="button" data-focus-key="note-${escapeXML(note.id)}" aria-label="Annotation ${escapeXML(note.text)}. Enter edits."><rect x="${note.x - 7}" y="${note.y - 17}" width="${width + 14}" height="${lines.length * 19 + 10}" rx="3"/><text x="${note.x}" y="${note.y}">${lines.map((line, i) => `<tspan x="${note.x}" dy="${i ? 19 : 0}">${escapeXML(line)}</tspan>`).join('')}</text></g>`;
    }).join('');
  }

  renderProbes(project, widths = networkView(project).widths) {
    return (project.probes || []).filter(p => p.a && p.kind !== 'current').map((probe, i) => {
      let pos;
      try { pos = endpointPosition(project, probe.a); } catch { return ''; }
      if (!safePoint(pos)) return '';
      return `<g><title>${probe.kind === 'logic' ? widths[probe.a] > 1 ? widths[probe.a]+'-bit bus' : 'Logic' : 'Voltage'} probe ${i + 1}</title><path class="probe-marker${probe.kind === 'logic' ? ' probe-logic' : ''}" d="M${pos.x + 8} ${pos.y - 16}h22v17h-14l-8 8Z"/><text x="${pos.x + 19}" y="${pos.y - 4}" text-anchor="middle" fill="var(--canvas,#121a18)" font-family="system-ui,sans-serif" font-size="10" font-weight="700" pointer-events="none">${i + 1}</text></g>`;
    }).join('');
  }

  position(endpoint) { try { return endpointPosition(this.displayProject, endpoint); } catch { return null; } }

  world(event) {
    const matrix = this.svg.getScreenCTM();
    if (matrix) {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      return { x: point.x, y: point.y };
    }
    const r = this.svg.getBoundingClientRect();
    return { x: this.view.x + (event.clientX - r.left) / r.width * this.view.width, y: this.view.y + (event.clientY - r.top) / r.height * this.view.height };
  }

  pixelScale() { return this.svg.getScreenCTM()?.a || this.svg.getBoundingClientRect().width / this.view.width || 1; }

  findSnap(point) {
    const project = this.displayProject;
    let best = null, limit = 13 / this.pixelScale();
    for (const component of project.circuit.components) {
      for (const pin of getPins(component)) {
        const ep = `${component.id}:${pin.id}`, at = this.position(ep);
        if (!safePoint(at)) continue;
        const d = dist(point, at);
        if (d < limit && (!best || d < best.distance)) best = { endpoint: ep, point: at, distance: d };
      }
    }
    for (const junction of project.circuit.junctions) {
      const ep = `j:${junction.id}`, at = this.position(ep);
      if (!safePoint(at)) continue;
      const d = dist(point, at);
      if (d < limit && (!best || d < best.distance)) best = { endpoint: ep, point: at, distance: d };
    }
    if (best && this.mode === 'wire' && this.wireDraft) { const check = canConnect(project, this.wireDraft.start, best.endpoint); best.compatible = check.ok; best.message = check.message; }
    return best;
  }

  endpointFrom(event, point) {
    return event.target.closest('[data-endpoint]')?.dataset.endpoint || this.findSnap(point)?.endpoint;
  }

  pointerDown(event) {
    if (event.button !== 0 && event.button !== 1) return;
    const point = this.world(event);
    this.pointer = point;
    const endpoint = this.endpointFrom(event, point);
    const wireId = event.target.closest('[data-wire]')?.dataset.wire;
    const item = event.target.closest('[data-item]')?.dataset.item;
    const handle = event.target.closest('[data-handle]')?.dataset.handle;
    if (event.button === 1 || this.mode === 'pan' || event.altKey) {
      event.preventDefault();
      this.drag = { kind: 'pan', clientX: event.clientX, clientY: event.clientY, view: { ...this.view } };
      this.svg.setPointerCapture(event.pointerId);
      this.focus();
      return;
    }
    if (this.mode === 'place' && this.placeType) {
      event.preventDefault();
      this.placeAt(point.x, point.y);
      return;
    }
    if (this.mode === 'wire') {
      event.preventDefault();
      let target = endpoint;
      if (!target && wireId) {
        const wire = this.project.circuit.connections.find(w => w.id === wireId);
        if (wire && this.wireDraft && wire.a !== this.wireDraft.start) { const check = canConnect(this.project, this.wireDraft.start, wire.a); if (!check.ok) { this.status(check.message); this.focus(); return; } }
        target = this.addJunctionAt(point.x, point.y, wireId);
        if (!target) return;
      }
      if (target) this.activateWireEndpoint(target);
      else if (this.wireDraft) {
        const p = { x: snap(point.x), y: snap(point.y) };
        this.wireDraft.points.push(p);
        this.status('Bend added. Click the destination pin, or click more bends. Backspace removes the last bend.');
        this.render();
      } else this.status('Start a wire at a visible pin or click an existing wire to insert a junction.');
      this.focus();
      return;
    }
    if (this.mode === 'junction') {
      event.preventDefault();
      const ep = this.addJunctionAt(point.x, point.y);
      if (ep) this.status('Explicit junction added. Every wire through this dot is electrically connected.');
      return;
    }
    if (this.mode === 'label') {
      let target = endpoint;
      if (!target && wireId) target = this.addJunctionAt(point.x, point.y, wireId);
      if (target) this.addLabel(target);
      else this.status('Click a pin, junction, or wire to label an electrical net.');
      return;
    }
    if (this.mode === 'note') { this.addNote(point.x, point.y); return; }
    if (this.mode === 'probe') {
      let target = endpoint;
      if (!target && wireId) target = this.project.circuit.connections.find(w => w.id === wireId)?.a;
      if (target) this.measure(target, event.shiftKey);
      else this.status('Click a pin, junction, or wire to measure voltage or logic state.');
      return;
    }
    // Select mode keeps pin clicks useful without changing connectivity.
    if (endpoint && !item && !event.shiftKey) { this.measure(endpoint, false); return; }
    if (handle !== undefined && wireId) {
      event.preventDefault();
      this.drag = { kind: 'handle', wireId, index: Number(handle), start: point, original: clone(this.project), moved: false };
      this.preview = clone(this.project);
      this.svg.setPointerCapture(event.pointerId);
      return;
    }
    if (item) {
      event.preventDefault();
      if (event.shiftKey) {
        const next = this.getSelection();
        this.select(this.selection.has(item) ? next.filter(id => id !== item) : [...next, item]);
      } else if (!this.selection.has(item)) this.select([item]);
      if (!this.selection.has(item)) return;
      const movable = this.movableIds();
      if (movable.length) {
        this.drag = { kind: 'move', start: point, ids: movable, original: clone(this.project), moved: false, dx: 0, dy: 0 };
        this.preview = clone(this.project);
        this.svg.setPointerCapture(event.pointerId);
      }
      this.focus();
      return;
    }
    if (endpoint) { this.measure(endpoint, event.shiftKey); return; }
    event.preventDefault();
    if (!event.shiftKey) this.select([]);
    this.drag = { kind: 'box', start: point, additive: event.shiftKey, initial: this.getSelection(), box: null };
    this.svg.setPointerCapture(event.pointerId);
    this.focus();
  }

  pointerMove(event) {
    const point = this.world(event);
    this.pointer = point;
    if (!this.drag) {
      const previous = this.snapTarget;
      this.snapTarget = ['wire', 'label', 'probe', 'junction'].includes(this.mode) ? this.findSnap(point) : null;
      if (this.snapTarget && this.mode === 'wire' && (previous?.endpoint !== this.snapTarget.endpoint || previous?.compatible !== this.snapTarget.compatible)) this.status(this.snapTarget.compatible === false ? this.snapTarget.message : 'Pin snapped. Click to connect; digital nets must have matching widths.');
      if (this.wireDraft || this.mode === 'place' || this.snapTarget || ['wire', 'probe', 'label'].includes(this.mode)) this.render();
      return;
    }
    if (this.drag.kind === 'pan') {
      const scale = this.pixelScale();
      this.view.x = this.drag.view.x - (event.clientX - this.drag.clientX) / scale;
      this.view.y = this.drag.view.y - (event.clientY - this.drag.clientY) / scale;
      this.render();
      return;
    }
    if (this.drag.kind === 'box') {
      this.drag.box = { x: Math.min(this.drag.start.x, point.x), y: Math.min(this.drag.start.y, point.y), width: Math.abs(point.x - this.drag.start.x), height: Math.abs(point.y - this.drag.start.y) };
      this.render();
      return;
    }
    if (this.drag.kind === 'move') {
      const dx = snap(point.x - this.drag.start.x), dy = snap(point.y - this.drag.start.y);
      if (dx === this.drag.dx && dy === this.drag.dy) return;
      this.drag.dx = dx; this.drag.dy = dy; this.drag.moved = true;
      this.preview = clone(this.drag.original);
      this.offsetItems(this.preview, this.drag.ids, dx, dy);
      this.render();
      return;
    }
    if (this.drag.kind === 'handle') {
      const points = this.preview.layout.wires[this.drag.wireId]?.points;
      if (points?.[this.drag.index]) {
        points[this.drag.index] = { x: snap(point.x), y: snap(point.y) };
        this.drag.moved = true;
        this.render();
      }
    }
  }

  pointerUp(event) {
    if (this.svg.hasPointerCapture(event.pointerId)) this.svg.releasePointerCapture(event.pointerId);
    const drag = this.drag;
    if (!drag) return;
    const preview = this.preview;
    this.drag = null; this.preview = null;
    if (drag.kind === 'move' && drag.moved && (drag.dx || drag.dy)) {
      this.change(p => this.offsetItems(p, drag.ids, drag.dx, drag.dy), 'Move selection');
    } else if (drag.kind === 'handle' && drag.moved) {
      const points = clone(preview.layout.wires[drag.wireId].points);
      this.change(p => { p.layout.wires[drag.wireId].points = points; }, 'Move wire bend');
    } else if (drag.kind === 'box' && drag.box) {
      const inside = [];
      for (const component of this.project.circuit.components) if (pointInside(this.project.layout.components[component.id], drag.box)) inside.push(component.id);
      for (const junction of this.project.circuit.junctions) if (pointInside(this.project.layout.junctions[junction.id], drag.box)) inside.push(junction.id);
      for (const note of this.project.layout.annotations || []) if (pointInside(note, drag.box)) inside.push(note.id);
      this.select([...new Set([...(drag.additive ? drag.initial : []), ...inside])]);
      this.status(`${this.selection.size} item${this.selection.size === 1 ? '' : 's'} selected.`);
    }
    this.render();
  }

  pointerCancel(event) {
    if (this.svg.hasPointerCapture(event.pointerId)) this.svg.releasePointerCapture(event.pointerId);
    this.drag = null; this.preview = null;
    this.status('Gesture cancelled; the circuit is unchanged.');
    this.render();
  }

  placeAt(x, y) {
    if (!this.placeType) return;
    let id;
    this.change(project => { id = addComponent(project, this.placeType, snap(x), snap(y)).id; }, `Place ${this.placeType}`);
    this.select([id]);
    this.status(`${getPart(this.placeType).name} placed. Click again to place another, or Escape to select.`);
  }

  activateWireEndpoint(endpoint) {
    if (!this.wireDraft) {
      this.wireDraft = { start: endpoint, points: [] };
      this.status('Pin snapped. Click the destination pin; optional clicks add wire bends.');
    } else if (endpoint === this.wireDraft.start) {
      this.status('Choose a different destination pin. Escape cancels this wire.');
    } else {
      const connected = this.connectEndpoints(this.wireDraft.start, endpoint, this.wireDraft.points);
      if (connected) { this.wireDraft = null; this.status('Wire connected to both pins. Click a pin to start another.'); }
    }
    this.render();
  }

  connectEndpoints(a, b, points = []) {
    if (!a || !b || a === b || !this.position(a) || !this.position(b)) { this.status('Choose two distinct, existing pins or junctions.'); return null; }
    const check = canConnect(this.project, a, b);
    if (!check.ok) { this.status(check.message); return null; }
    const exists = this.project.circuit.connections.find(w => (w.a === a && w.b === b) || (w.a === b && w.b === a));
    if (exists) { this.status('These endpoints already have a wire.'); return exists.id; }
    const id = uid('wire');
    this.change(project => {
      project.circuit.connections.push({ id, a, b });
      project.layout.wires[id] = { points: points.map(p => ({ x: snap(p.x), y: snap(p.y) })) };
    }, 'Connect pins');
    return id;
  }

  draftPolyline(start, middle, end) {
    const points = [start, ...middle, end], path = [start];
    for (let i = 1; i < points.length; i++) {
      const p = points[i], previous = path.at(-1);
      if (previous.x !== p.x && previous.y !== p.y) path.push({ x: p.x, y: previous.y });
      path.push(p);
    }
    return compact(path);
  }

  /** Explicit insertion; a crossing only joins when the user asks for a junction. */
  addJunctionAt(x, y, onlyWireId = null) {
    const project = this.project, click = { x, y };
    let at = { x: snap(x), y: snap(y) };
    const threshold = 12 / this.pixelScale();
    const candidates = project.circuit.connections.filter(w => !onlyWireId || w.id === onlyWireId).map(w => ({ wire: w, points: wirePolyline(project, w) })).map(w => ({ ...w, nearest: nearestSegment(click, w.points) })).filter(w => w.nearest && w.nearest.distance < threshold);
    if (candidates.length) {
      candidates.sort((a, b) => a.nearest.distance - b.nearest.distance);
      at = candidates[0].nearest.point;
      // Prefer a grid point on the chosen segment so intentional crossings line up exactly.
      const nearGrid = { x: snap(at.x), y: snap(at.y) };
      const reproject = nearestSegment(nearGrid, candidates[0].points);
      if (reproject && reproject.distance < .01 && dist(at, nearGrid) < 11 / this.pixelScale()) at = nearGrid;
    }
    const old = project.circuit.junctions.find(j => dist(project.layout.junctions[j.id], at) < .1);
    const junctionId = old?.id || uid('junction');
    const endpoint = `j:${junctionId}`;
    const affected = project.circuit.connections.filter(w => !onlyWireId || w.id === onlyWireId).map(w => ({ wire: w, points: wirePolyline(project, w) })).map(w => ({ ...w, nearest: nearestSegment(at, w.points) })).filter(w => w.nearest && w.nearest.distance < .1);
    const network = networkView(project), domains = network.domains, joining = [...affected.map(w => w.wire.a), ...(old ? [endpoint] : [])], joinedDomains = new Set(joining.map(ep => domains[ep]).filter(Boolean));
    if (joinedDomains.has('mixed') || joinedDomains.size > 1) { this.status('This crossing contains analog and digital nets. Use an explicit ADC or DAC bridge; a junction cannot convert signals.'); return null; }
    const joinedWidths = new Set(joining.map(ep => network.widths[ep]).filter(width => width != null));
    if (joinedWidths.size > 1 || joining.some(ep => network.conflicts[ep])) { this.status('This crossing has different digital widths. Use explicit SLICE or JOIN parts; a junction cannot resize a bus.'); return null; }
    if (old && affected.every(w => w.wire.a === endpoint || w.wire.b === endpoint)) return endpoint;
    this.change(p => {
      if (!old) { p.circuit.junctions.push({ id: junctionId }); p.layout.junctions[junctionId] = { x: at.x, y: at.y }; }
      for (const { wire, points, nearest } of affected) {
        if (wire.a === endpoint || wire.b === endpoint) continue;
        const current = p.circuit.connections.find(w => w.id === wire.id);
        if (!current) continue;
        if (equal(at, points[0]) || equal(at, points.at(-1))) {
          const existingEndpoint = equal(at, points[0]) ? wire.a : wire.b;
          const newId = uid('wire');
          p.circuit.connections.push({ id: newId, a: existingEndpoint, b: endpoint });
          p.layout.wires[newId] = { points: [] };
        } else {
          const end = current.b, id = uid('wire');
          current.b = endpoint;
          p.layout.wires[current.id] = { points: compact(points.slice(1, nearest.segment + 1)).filter(pt => !equal(pt, at)) };
          p.circuit.connections.push({ id, a: endpoint, b: end });
          p.layout.wires[id] = { points: compact(points.slice(nearest.segment + 1, -1)).filter(pt => !equal(pt, at)) };
        }
      }
    }, 'Insert explicit junction');
    return endpoint;
  }

  addLabel(endpoint) {
    const name = window.prompt('Net label (equal labels connect electrically)', 'out');
    if (name === null || !name.trim()) return;
    if (!/^(?:0|[A-Za-z_][A-Za-z0-9_]{0,31})$/.test(name.trim())) { this.status('Use a letter or underscore first, then letters, digits, or underscores (up to 32 characters), or 0 for ground.'); return; }
    if (!this.labelAllowed(endpoint, name.trim())) return;
    this.change(p => { p.circuit.labels.push({ id: uid('label'), name: name.trim(), target: endpoint }); }, 'Add net label');
    this.status(`Net labeled ${name.trim()}. Equal labels are electrically joined.`);
  }

  labelAllowed(endpoint, name, replacedId = null) {
    const candidate = clone(this.project);
    candidate.circuit.labels = candidate.circuit.labels.filter(label => label.id !== replacedId);
    candidate.circuit.labels.push({ id: '__proposed_label__', target: endpoint, name });
    if (getEndpointDomain(candidate, endpoint) === 'mixed') { this.status('This label would join analog and digital nets. Use an explicit ADC or DAC bridge; 0 names analog ground.'); return false; }
    if (networkView(candidate).conflicts[endpoint]) { this.status('This label would join different digital widths. Use explicit SLICE or JOIN parts; equal names do not resize a bus.'); return false; }
    return true;
  }

  addNote(x, y) {
    const text = window.prompt('Annotation', '');
    if (text === null || !text.trim()) return;
    this.change(p => { p.layout.annotations.push({ id: uid('note'), x: snap(x), y: snap(y), text: text.trim().slice(0, 2000) }); }, 'Add annotation');
  }

  measure(endpoint, differential) {
    const domain = getEndpointDomain(this.project, endpoint);
    const network = networkView(this.project);
    if (network.conflicts[endpoint]) { this.status('This net has conflicting bit widths. Repair its connections with matching widths or explicit SLICE/JOIN parts before probing.'); return; }
    if (domain === 'mixed') { this.status('This net mixes analog and digital pins. Repair its connections using explicit ADC or DAC bridges before probing.'); return; }
    if (differential && (domain === 'digital' || this.probeAnchor && getEndpointDomain(this.project, this.probeAnchor) === 'digital')) { this.status('Differential voltage needs two analog pins. Probe digital pins individually for logic state.'); return; }
    if (differential && this.probeAnchor && this.probeAnchor !== endpoint) {
      this.callbacks.onProbe?.(this.probeAnchor, endpoint);
      this.status('Differential voltage probe added: first node minus second node.');
    } else {
      this.callbacks.onProbe?.(endpoint);
      this.probeAnchor = endpoint;
      this.status(domain === 'digital' ? network.widths[endpoint] > 1 ? `${network.widths[endpoint]}-bit bus probe added. Words are MSB first, with bit 0 at right; X/Z remain explicit.` : 'Logic probe added. States are 0, 1, X (unknown), or Z (high impedance).' : 'Voltage probe added. Shift-click a second analog pin to measure the voltage difference.');
    }
    this.render();
  }

  movableIds() {
    const p = this.project;
    return this.getSelection().filter(id => p.layout.components[id] || p.layout.junctions[id] || p.layout.annotations?.some(n => n.id === id));
  }

  offsetItems(project, ids, dx, dy) {
    const selected = new Set(ids);
    for (const id of ids) {
      const location = project.layout.components[id] || project.layout.junctions[id] || project.layout.annotations.find(n => n.id === id);
      if (location) { location.x += dx; location.y += dy; }
    }
    const owner = ep => ep.startsWith('j:') ? ep.slice(2) : ep.split(':')[0];
    for (const wire of project.circuit.connections) if (selected.has(owner(wire.a)) && selected.has(owner(wire.b))) {
      for (const point of project.layout.wires[wire.id]?.points || []) { point.x += dx; point.y += dy; }
    }
    this.adaptEndpointBends(project, ids);
  }

  adaptEndpointBends(project, ids) {
    const selected = new Set(ids), owner = ep => ep.startsWith('j:') ? null : ep.split(':')[0];
    for (const wire of project.circuit.connections) {
      const boxes = [...new Set([owner(wire.a),owner(wire.b)].filter(id=>id&&selected.has(id)))].map(id=>bodyBounds(project,id)).filter(Boolean);
      const layout = project.layout.wires[wire.id];
      if (boxes.length && layout?.points) layout.points = layout.points.filter(point=>!boxes.some(box=>insideBody(point,box)));
    }
  }

  moveSelection(dx, dy) {
    const ids = this.movableIds();
    if (!ids.length) { this.status('Select a part, junction, or annotation to move.'); return; }
    this.change(p => this.offsetItems(p, ids, dx, dy), 'Move selection');
    this.status('Selection moved; wires stay attached and their pin approaches adjust around component bodies.');
  }

  setPosition(id, x, y) {
    const old = this.project.layout.components[id] || this.project.layout.junctions[id] || this.project.layout.annotations.find(n => n.id === id);
    if (!old || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.change(p => this.offsetItems(p, [id], snap(x) - old.x, snap(y) - old.y), 'Position item');
  }

  rotate() {
    const ids = this.getSelection().filter(id => this.project.layout.components[id]);
    if (!ids.length) { this.status('Select a component to rotate.'); return; }
    this.change(p => { ids.forEach(id => { p.layout.components[id].rotation = ((p.layout.components[id].rotation || 0) + 90) % 360; }); this.adaptEndpointBends(p,ids); }, 'Rotate components');
    this.status('Components rotated; wires keep their pin connections and adjust nearby bends around the symbols.');
  }

  mirror() {
    const ids = this.getSelection().filter(id => this.project.layout.components[id]);
    if (!ids.length) { this.status('Select a component to mirror.'); return; }
    this.change(p => { ids.forEach(id => { p.layout.components[id].mirror = !p.layout.components[id].mirror; }); this.adaptEndpointBends(p,ids); }, 'Mirror components');
    this.status('Components mirrored; wires keep their pin connections and adjust nearby bends around the symbols.');
  }

  delete() {
    const ids = this.getSelection();
    if (!ids.length) { this.status('Select a component, wire, label, junction, or note to delete.'); return; }
    this.change(p => removeItems(p, ids), 'Delete selection');
    this.select([]);
    this.status('Selection deleted. Undo restores it.');
  }

  copy() {
    if (!this.selection.size) { this.status('Select components or annotations to copy.'); return; }
    this.clipboard = { project: clone(this.project), ids: this.getSelection(), count: 0 };
    this.status('Selection copied within CircuitBench. Paste places a copy with new identifiers.');
  }

  paste() {
    if (!this.clipboard) { this.status('Copy a selection in CircuitBench first.'); return; }
    const source = clone(this.clipboard.project), before = new Set(itemIds(source));
    this.clipboard.count++;
    duplicateItems(source, this.clipboard.ids, 40 * this.clipboard.count);
    const fresh = itemIds(source).filter(id => !before.has(id)), freshSet = new Set(fresh);
    if (!fresh.length) { this.status('Copy components or annotations. Wires require their endpoints in the selection.'); return; }
    this.change(target => {
      const refs = new Set(target.circuit.components.map(c => c.ref.toLowerCase()));
      for (const component of source.circuit.components.filter(c => freshSet.has(c.id))) {
        const prefix = getPart(component.type)?.prefix || component.type;
        if (refs.has(component.ref.toLowerCase())) { let n = 1; while (refs.has((prefix + n).toLowerCase())) n++; component.ref = prefix + n; }
        refs.add(component.ref.toLowerCase());
        target.circuit.components.push(component);
        target.layout.components[component.id] = source.layout.components[component.id];
      }
      for (const wire of source.circuit.connections.filter(c => freshSet.has(c.id))) { target.circuit.connections.push(wire); target.layout.wires[wire.id] = source.layout.wires[wire.id]; }
      for (const junction of source.circuit.junctions.filter(c => freshSet.has(c.id))) { target.circuit.junctions.push(junction); target.layout.junctions[junction.id] = source.layout.junctions[junction.id]; }
      const usedLabels = new Set(target.circuit.labels.map(l => l.name.toLowerCase())), labelNames = new Map();
      for (const label of source.circuit.labels.filter(c => freshSet.has(c.id))) {
        const key = label.name.toLowerCase();
        if (!labelNames.has(key)) {
          let name = label.name, n = 1;
          while (usedLabels.has(name.toLowerCase())) name = label.name.slice(0, 26) + '_' + n++;
          usedLabels.add(name.toLowerCase()); labelNames.set(key, name);
        }
        label.name = labelNames.get(key); target.circuit.labels.push(label);
      }
      target.layout.annotations.push(...source.layout.annotations.filter(c => freshSet.has(c.id)));
    }, 'Paste selection');
    this.select(fresh);
    this.status('Copy pasted with new identifiers. Internal wires are preserved; external wires are not copied.');
  }

  duplicate() {
    if (!this.selection.size) { this.status('Select components or annotations to duplicate.'); return; }
    let ids = [];
    this.change(p => { ids = duplicateItems(p, this.getSelection(), 40); }, 'Duplicate selection');
    this.select(ids);
    this.status('Selection duplicated with new component and connection identifiers.');
  }

  doubleClick(event) {
    const noteId = event.target.closest('[data-note]')?.dataset.note;
    const labelId = event.target.closest('[data-label]')?.dataset.label;
    const wireId = event.target.closest('[data-wire]')?.dataset.wire;
    if (noteId) this.editNote(noteId);
    else if (labelId) this.editLabel(labelId);
    else if (wireId && this.mode === 'select') this.addBend(wireId, this.world(event));
  }

  editNote(id) {
    const note = this.project.layout.annotations.find(n => n.id === id);
    if (!note) return;
    const text = window.prompt('Edit annotation', note.text);
    if (text === null) return;
    this.change(p => { const n = p.layout.annotations.find(n => n.id === id); n.text = text.trim().slice(0, 2000); }, 'Edit annotation');
  }

  editLabel(id) {
    const label = this.project.circuit.labels.find(l => l.id === id);
    if (!label) return;
    const name = window.prompt('Edit net label (equal labels connect electrically)', label.name);
    if (name === null) return;
    if (!/^(?:0|[A-Za-z_][A-Za-z0-9_]{0,31})$/.test(name.trim())) { this.status('Use a valid net name: letter/underscore first, then letters, digits, underscores; 0 names ground.'); return; }
    if (!this.labelAllowed(label.target, name.trim(), id)) return;
    this.change(p => { p.circuit.labels.find(l => l.id === id).name = name.trim(); }, 'Edit net label');
  }

  addBend(wireId, point) {
    const connection = this.project.circuit.connections.find(w => w.id === wireId);
    if (!connection) return;
    const points = wirePolyline(this.project, connection), nearest = nearestSegment(point, points);
    if (!nearest) return;
    const at = { x: snap(nearest.point.x), y: snap(nearest.point.y) };
    const middle = compact([...points.slice(1, nearest.segment + 1), at, ...points.slice(nearest.segment + 1, -1)]);
    this.change(p => { p.layout.wires[wireId] = { points: middle }; }, 'Add wire bend');
    this.select([wireId]);
    this.status('Wire bend added. Drag a square handle, or Tab to it and use arrow keys.');
  }

  keyDown(event) {
    if (event.target.matches('input,textarea,select,[contenteditable=true]')) return;
    const command = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    const endpoint = event.target.closest('[data-endpoint]')?.dataset.endpoint;
    const item = event.target.closest('[data-item]')?.dataset.item;
    const wireId = event.target.closest('[data-wire]')?.dataset.wire;
    const handle = event.target.closest('[data-handle]')?.dataset.handle;
    if (command && key === 'c') { event.preventDefault(); this.copy(); return; }
    if (command && key === 'v') { event.preventDefault(); this.paste(); return; }
    if (command && key === 'd') { event.preventDefault(); this.duplicate(); return; }
    if (command && key === 'a') { event.preventDefault(); this.select(itemIds(this.project)); return; }
    if (command) return;
    if (event.key === 'Escape') { event.preventDefault(); this.cancel(); return; }
    if (event.key === 'Backspace' && this.wireDraft) { event.preventDefault(); this.wireDraft.points.pop(); this.render(); return; }
    if ((event.key === 'Delete' || event.key === 'Backspace') && handle !== undefined && wireId) {
      event.preventDefault(); this.change(p => p.layout.wires[wireId].points.splice(Number(handle), 1), 'Remove wire bend'); return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (item && !this.selection.has(item)) this.select([item]); this.delete(); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (this.mode === 'place' && this.placeType) { this.placeAt(this.view.x + this.view.width / 2, this.view.y + this.view.height / 2); return; }
      if (endpoint) {
        if (this.mode === 'wire') this.activateWireEndpoint(endpoint);
        else if (this.mode === 'label') this.addLabel(endpoint);
        else this.measure(endpoint, event.shiftKey);
        return;
      }
      const noteId = event.target.closest('[data-note]')?.dataset.note, labelId = event.target.closest('[data-label]')?.dataset.label;
      if (noteId) this.editNote(noteId);
      else if (labelId) this.editLabel(labelId);
      else if (item) this.select(event.shiftKey ? [...this.selection, item] : [item]);
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? GRID * 5 : GRID;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      if (this.mode !== 'pan' && item && !this.selection.has(item) && (this.project.layout.components[item] || this.project.layout.junctions[item] || this.project.layout.annotations.some(a => a.id === item))) this.select([item]);
      if (handle !== undefined && wireId) {
        this.change(p => { const point = p.layout.wires[wireId].points[Number(handle)]; point.x += dx; point.y += dy; }, 'Move wire bend');
      } else if (this.mode === 'pan' || !this.selection.size) { this.view.x += dx; this.view.y += dy; this.render(); }
      else this.moveSelection(dx, dy);
      return;
    }
    const action = { v: () => this.setMode('select'), w: () => this.setMode('wire'), p: () => this.setMode('probe'), h: () => this.setMode('pan'), j: () => this.setMode('junction'), l: () => this.setMode('label'), n: () => this.setMode('note'), r: () => this.rotate(), m: () => this.mirror(), f: () => this.fit(), '+': () => this.zoom(1.25), '=': () => this.zoom(1.25), '-': () => this.zoom(.8) }[key];
    if (action) { event.preventDefault(); action(); }
  }

  bounds(project = this.project) {
    const points = [];
    for (const c of project.circuit.components) {
      const p = project.layout.components[c.id];
      if (p) points.push({ x: p.x - 75, y: p.y - 65 }, { x: p.x + 100, y: p.y + 65 });
    }
    for (const w of project.circuit.connections) points.push(...wirePolyline(project, w));
    for (const n of project.layout.annotations || []) points.push({ x: n.x - 10, y: n.y - 25 }, { x: n.x + Math.min(600, String(n.text).length * 7), y: n.y + 25 });
    for (const j of project.circuit.junctions) if (project.layout.junctions[j.id]) points.push(project.layout.junctions[j.id]);
    if (!points.length) return { x: -100, y: -80, width: 1000, height: 600 };
    const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y));
    const maxX = Math.max(...points.map(p => p.x)), maxY = Math.max(...points.map(p => p.y));
    return { x: minX - 35, y: minY - 35, width: Math.max(200, maxX - minX + 70), height: Math.max(180, maxY - minY + 70) };
  }

  fit() {
    const b = this.bounds(), r = this.svg.getBoundingClientRect(), ratio = Math.max(.3, r.width / (r.height || 500));
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    let w = b.width, h = b.height;
    if (w / h < ratio) w = h * ratio; else h = w / ratio;
    this.view = { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
    this.render();
    this.status('Circuit fitted to the workspace.');
  }

  zoom(factor, anchor = null) {
    const point = anchor || { x: this.view.x + this.view.width / 2, y: this.view.y + this.view.height / 2 };
    const next = Math.min(12000, Math.max(160, this.view.width / factor));
    const ratio = next / this.view.width;
    this.view = { x: point.x - (point.x - this.view.x) * ratio, y: point.y - (point.y - this.view.y) * ratio, width: next, height: this.view.height * ratio };
    this.render();
  }

  wheel(event) { event.preventDefault(); this.zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, this.world(event)); }

  exportSVG(project = this.project) {
    const p = project, b = this.bounds(p);
    const oldSelection = this.selection;
    this.selection = new Set();
    let body;
    const network = networkView(p), { nets } = network;
    try { body = this.renderWires(p, network) + this.renderComponents(p, nets) + this.renderJunctions(p, nets, network) + this.renderLabels(p) + this.renderNotes(p) + this.renderProbes(p, network.widths); }
    finally { this.selection = oldSelection; }
    // SVG consumers include print renderers and vector editors that do not
    // implement CSS custom properties. Export a literal, independent palette.
    const exportStyle = `
      .symbol-art{fill:none;stroke:#18271f;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
      .symbol-arrow{fill:#18271f;stroke-width:1}.symbol-type,.pin-sign{fill:#18271f;stroke:none;font:12px sans-serif;text-anchor:middle}
      .wire{fill:none;stroke:#315f49;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .wire-digital{stroke:#315e8c}.wire-bus{stroke-width:3.6}.wire-mixed,.wire-width-conflict{stroke:#a82739;stroke-dasharray:5 3}
      .bus-width-marker path{stroke:#315e8c;stroke-width:1.8}.bus-width-marker text{fill:#315e8c;font:600 10px monospace}
      .component-label{fill:#18271f;font:600 13px sans-serif;text-anchor:middle}.component-value{fill:#425a4c;font:12px monospace;text-anchor:middle}
      .pin{fill:#ffffff;stroke:#315f49;stroke-width:1.7}.junction-dot{fill:#315f49;stroke:#ffffff;stroke-width:1}
      .pin-digital{stroke:#315e8c}.pin-bus{stroke-width:2.4}.pin-width{fill:#315e8c;font:600 9px monospace}.junction-digital{fill:#315e8c}.junction-mixed,.junction-width-conflict{fill:#a82739}
      .net-label{fill:#2c702e;font:600 12px monospace}.annotation text{fill:#425a4c;font:13px sans-serif}.annotation rect{fill:#ffffff;stroke:none}
      .probe-marker{fill:#2c702e;stroke:#ffffff;stroke-width:1}
      .probe-logic{fill:#315e8c}
      .pin-hit,.wire-hit,.component-hit,.junction-focus,.pin-name{display:none}
    `;
    body = body.replaceAll('var(--canvas,#121a18)', '#ffffff');
    return `<svg xmlns="${NS}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" width="${Math.ceil(b.width)}" height="${Math.ceil(b.height)}" role="img" aria-label="${escapeXML(p.title)} schematic"><title>${escapeXML(p.title)}</title><desc>Exported from CircuitBench. Junction dots indicate connected wire crossings. Square pins are digital; round pins are analog. Heavier digital wires and slash-number marks identify bus widths; bit ranges are MSB:LSB. ADC and DAC symbols mark explicit domain bridges.</desc><style>${exportStyle}</style><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#ffffff"/>${body}</svg>`;
  }
}
