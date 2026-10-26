/** Binary source controls describe the drive setting, not the resolved net. */
import {escapeHTML as esc} from './storage.js';

export function digitalSourceControlHTML(component, {value = component.params.state, live = false, busy = false} = {}) {
  if (component.type !== 'DVS' || !['0', '1'].includes(value)) throw new Error('A digital voltage source control requires a known 0 or 1.');
  const voltage = component.params.outputMode === 'logic-voltage';
  const labels = {0: 'LOW', 1: 'HIGH'};
  return `<fieldset class="logic-source-switch"><legend>${live ? 'Live source state' : 'Source state'}</legend><div class="logic-source-buttons">${['0', '1'].map(state => `<button type="button" data-source-state="${state}" data-source-id="${esc(component.id)}" aria-label="Set ${esc(component.ref)} ${labels[state]}" aria-pressed="${value === state}" ${busy ? 'disabled' : ''}><strong>${state} · ${labels[state]}</strong>${voltage ? `<small>${esc(component.params[state === '1' ? 'high' : 'low'])} V</small>` : ''}</button>`).join('')}</div><p class="helper">${live ? 'Changes this running session. When paused, use Step or Resume to see the response.' : 'Sets the starting drive state. Run the circuit to update its indicators.'}</p></fieldset>`;
}

export function digitalSourceOutputLabel(value) {
  return {logic: 'Digital logic', 'logic-voltage': 'Digital logic + voltage terminals'}[value] ?? value;
}
