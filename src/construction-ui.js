import { diagnosticTarget } from './construction.js';
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function constructionFormHTML(action) {
  return `<p>${esc(action.description)}</p><form data-construction-form><div class="property-grid">${action.fields.map(field => `<label>${esc(field.label)}${field.options ? `<select name="${esc(field.key)}">${field.options.map(option => `<option value="${esc(option.value)}"${String(option.value) === String(field.value) ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}</select>` : `<input name="${esc(field.key)}" type="${esc(field.type ?? 'text')}" value="${esc(field.value)}"${field.required ? ' required' : ''}${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''}${field.type === 'number' ? ' step="1"' : ''}>`}</label>`).join('')}</div><p class="helper">The inserted parts and wires are one undoable edit. Converter settings and bit order stay explicit. Simulation compatibility is checked before running. Unconnected output pins can be wired after placement.</p><div class="dialog-actions"><button type="button" data-construction-cancel>Cancel</button><button type="submit" class="primary">${esc(action.title)}</button></div><p data-construction-error class="helper" role="alert"></p></form>`;
}

export function constructionConfig(form) { return Object.fromEntries(new FormData(form).entries()); }

/** Index attributes are resolved against the caller's exact diagnostic array. */
export function diagnosticHTML(project, diagnostics) {
  return diagnostics.map((diagnostic, index) => {
    const target = diagnosticTarget(project, diagnostic);
    return `<div class="notice ${diagnostic.severity === 'error' ? 'error' : diagnostic.severity === 'warning' ? 'warning' : ''}"><strong>${esc(diagnostic.severity.toUpperCase())}</strong> · ${esc(diagnostic.message)}${target ? ` <button type="button" data-diagnostic-index="${index}" aria-label="Show ${esc(target.label)} on schematic">Show ${esc(target.label)}</button>` : ''}</div>`;
  }).join('');
}
