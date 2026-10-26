import {measureMeasurementSource, measurementSourceForRun, normalizeMeasurementPresetSpec, validateMeasurementSource, MEASUREMENT_METHOD} from './measurements.js';
import {validateContinuousProvenance} from './continuous-evidence.js';

// This module deliberately has no model/storage dependency: model validation can
// call the preset validator, and backup validation supplies its project validator.
export const MEASUREMENT_EVIDENCE_LIMITS = Object.freeze({records: 12, presets: 16, valuesPerRecord: 1500000, totalValues: 2000000, eventsPerRecord: 250000, totalEvents: 1000000, recordBytes: 20 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, presetBytes: 4000});
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = (value, max = 200) => typeof value === 'string' && value.length <= max;
const identifier = value => text(value, 100) && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const stamp = value => text(value, 80) && Number.isFinite(Date.parse(value));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const clone = value => structuredClone(value);
const newId = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.().replaceAll('-', '') ?? Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
function canonical(value, depth = 0) {
  check(depth <= 28, 'Measurement evidence has excessive nesting.');
  if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1));
  if (object(value)) { const out = Object.create(null); for (const key of Object.keys(value).sort()) out[key] = canonical(value[key], depth + 1); return out; }
  check(value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value), 'Measurement evidence must contain finite portable JSON values.'); return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function portable(value, max, label) { canonical(value); check(bytes(value) <= max, `${label} exceeds its byte budget.`); return clone(value); }
const ownKeys = (value, names, label) => check(Object.keys(value).every(key => names.includes(key)), `${label} contains unsupported fields.`);
const counts = record => ({values: record.source?.domain === 'analog' ? record.source.axis.values.length + record.source.vectors.reduce((n, v) => n + v.values.length + (v.imag?.length ?? 0), 0) : 0, events: record.source?.domain === 'digital' ? record.source.signals.reduce((n, s) => n + s.events.length, 0) : 0});
const boundsMessage = 'Instrument evidence exceeds the selected-sample, event or 32 MiB backup budget. Shorten the retained run or keep fewer measurements.';

/** Presets contain explicit signal identities, levels and windows, but no run data. */
export function validateMeasurementPresets(presets) {
  if (presets === undefined) return [];
  check(Array.isArray(presets) && presets.length <= MEASUREMENT_EVIDENCE_LIMITS.presets, 'A project may keep at most 16 instrument measurement presets.');
  const ids = new Set();
  return presets.map(preset => {
    check(object(preset) && identifier(preset.id) && !ids.has(preset.id) && text(preset.name, 100) && preset.name.trim().length > 0, 'Measurement preset names or identifiers are invalid.'); ids.add(preset.id);
    ownKeys(preset, ['id', 'name', 'createdAt', 'updatedAt', 'spec'], 'Measurement preset');
    check(stamp(preset.createdAt) && stamp(preset.updatedAt) && Date.parse(preset.updatedAt) >= Date.parse(preset.createdAt), 'Measurement preset timestamps are invalid.');
    portable(preset, MEASUREMENT_EVIDENCE_LIMITS.presetBytes, 'Measurement preset');
    const spec = normalizeMeasurementPresetSpec(preset.spec);
    check(same(spec, preset.spec), 'A measurement preset must contain a normalized, explicit configuration.');
    return {id: preset.id, name: preset.name, createdAt: preset.createdAt, updatedAt: preset.updatedAt, spec};
  });
}
export function createMeasurementPreset(name, input, {id = newId('measurement_preset'), createdAt = new Date().toISOString(), updatedAt = createdAt} = {}) {
  return validateMeasurementPresets([{id, name, createdAt, updatedAt, spec: normalizeMeasurementPresetSpec(input)}])[0];
}
function samplingMetadata(run) {
  const s = run.result?.sampling; if (!s) return null;
  const out = {};
  for (const key of ['mode', 'description', 'analogInterpolation', 'logicContinuity', 'timeResolution', 'windowStart', 'windowEnd']) if (s[key] !== undefined) out[key] = clone(s[key]);
  return out;
}
function runMetadata(run) {
  return {id: run.id, status: run.status, startedAt: run.startedAt, completedAt: run.completedAt ?? null, analysis: clone(run.analysis), engine: clone(run.engine ?? run.result?.engine ?? {}), netlistHash: run.netlistHash ?? null, simulationHash: run.simulationHash ?? null, sampling: samplingMetadata(run), ...(run.result?.continuous ? {continuous: clone(run.result.continuous)} : {}), bridgeAssumptions: clone(run.result?.bridgeAssumptions ?? []), warnings: clone(run.result?.warnings ?? []), importedFromBackup: Boolean(run.importedFromBackup)};
}
function checkedSource(value) {
  validateMeasurementSource(value);
  if (value.domain === 'digital') {
    ownKeys(value, ['domain', 'timeBounds', 'signals', 'timeResolution', 'eventSource'], 'Preserved digital measurement source');
    for (const s of value.signals) { ownKeys(s, ['name', 'label', 'kind', 'width', 'bitOrder', 'events'], 'Preserved digital signal'); for (const e of s.events) ownKeys(e, ['time', 'value'], 'Digital event'); }
  } else {
    ownKeys(value, ['domain', 'analysis', 'axis', 'signals', 'vectors', 'sampleIndices', 'originalPoints', 'origin'], 'Preserved analog measurement source');
    ownKeys(value.axis, ['name', 'unit', 'values'], 'Analog measurement axis');
    for (const s of value.signals) ownKeys(s, ['id', 'label', 'unit', 'vector', 'a', 'b', 'divisor'], 'Selected analog signal');
    for (const v of value.vectors) ownKeys(v, ['name', 'values', 'imag'], 'Raw analog vector');
  }
  return portable(value, MEASUREMENT_EVIDENCE_LIMITS.recordBytes, 'Selected raw measurement source');
}
function checkedMetadata(metadata, snapshot, sourceRunId, source) {
  check(object(metadata), 'A saved measurement needs captured run provenance.');
  ownKeys(metadata, ['id', 'status', 'startedAt', 'completedAt', 'analysis', 'engine', 'netlistHash', 'simulationHash', 'sampling', 'continuous', 'bridgeAssumptions', 'warnings', 'importedFromBackup'], 'Captured measurement provenance');
  check(metadata.id === sourceRunId && ['completed', 'completed-with-warnings'].includes(metadata.status), 'The measurement must identify its completed source run.');
  check(stamp(metadata.startedAt) && (metadata.completedAt === null || stamp(metadata.completedAt) && Date.parse(metadata.completedAt) >= Date.parse(metadata.startedAt)), 'The captured source timestamps are invalid.');
  check(same(metadata.analysis, snapshot.analysis) && metadata.analysis.type === (source.domain === 'digital' ? 'tran' : source.analysis), 'The source analysis must match its circuit snapshot and raw evidence.');
  for (const key of ['netlistHash', 'simulationHash']) check(metadata[key] === null || metadata[key] === 'unavailable-in-insecure-context' || /^[a-f0-9]{64}$/i.test(metadata[key]), `Captured ${key} must be a SHA-256 digest or an explicit unavailable value.`);
  check(typeof metadata.importedFromBackup === 'boolean', 'The source-run restoration flag is invalid.');
  check(object(metadata.engine), 'Captured engine provenance must be an object.'); portable(metadata.engine, 40000, 'Captured engine provenance');
  if (metadata.sampling !== null) {
    check(object(metadata.sampling), 'Captured sampling provenance must be an object.');
    ownKeys(metadata.sampling, ['mode', 'description', 'analogInterpolation', 'logicContinuity', 'timeResolution', 'windowStart', 'windowEnd'], 'Captured sampling provenance');
    for (const key of ['mode', 'description', 'analogInterpolation', 'logicContinuity']) if (metadata.sampling[key] !== undefined) check(text(metadata.sampling[key], 4000), 'Captured sampling text is malformed.');
    for (const key of ['timeResolution', 'windowStart', 'windowEnd']) if (metadata.sampling[key] !== undefined) check(finite(metadata.sampling[key]) && metadata.sampling[key] >= 0, 'Captured sampling bounds are malformed.');
    portable(metadata.sampling, 6000, 'Captured sampling provenance');
  }
  const bounds = source.domain === 'digital' ? source.timeBounds : [source.axis.values[0], source.axis.values.at(-1)];
  if (source.domain === 'digital') for (const resolution of [metadata.sampling?.timeResolution, metadata.engine.timeResolution, metadata.engine.digital?.timeResolution]) if (resolution !== undefined) check(resolution === source.timeResolution, 'The declared event resolution disagrees with the captured events.');
  if (source.domain === 'analog') check((source.origin === 'original-analog-samples-from-event-union') === (metadata.sampling?.mode === 'event-union'), 'Original analog sample provenance disagrees with the captured sampling mode.');
  if (metadata.sampling?.mode === 'continuous-window') {
    check(object(metadata.continuous), 'A retained continuous window needs its captured session provenance.');
    check(metadata.sampling.windowStart === bounds[0] && metadata.sampling.windowEnd === bounds[1], 'Continuous window boundaries disagree with the retained numerical evidence.');
    const normalized = validateContinuousProvenance(metadata.continuous, snapshot, {timeBounds: bounds, ...(source.domain === 'analog' ? {points: source.originalPoints} : {}), sampling: metadata.sampling});
    check(same(normalized, metadata.continuous), 'Captured continuous provenance is not normalized.');
  } else check(metadata.continuous === undefined, 'Continuous provenance requires an explicitly retained continuous window.');
  if (metadata.continuous !== undefined) portable(metadata.continuous, 200000, 'Captured continuous provenance');
  for (const key of ['bridgeAssumptions', 'warnings']) check(Array.isArray(metadata[key]) && metadata[key].length <= 40 && metadata[key].every(value => text(value, 4000)), `Captured source ${key} are malformed.`);
  return clone(metadata);
}
const identity = source => source.domain === 'digital' ? {...source, signals: source.signals.map(({label, ...s}) => s).sort((a, b) => a.name.localeCompare(b.name))} : {...source, signals: source.signals.map(({label, ...s}) => s).sort((a, b) => a.id.localeCompare(b.id)), vectors: [...source.vectors].sort((a, b) => a.name.localeCompare(b.name))};

/** The selected raw vectors/events travel with the record after runs are removed. */
export function createMeasurementRecord(run, spec, {id = newId('measurement'), createdAt = new Date().toISOString(), validateProject = clone} = {}) {
  const source = measurementSourceForRun(run, spec), result = measureMeasurementSource(source, spec);
  const record = {id, kind: 'instrument-measurement', method: MEASUREMENT_METHOD, status: 'completed', projectId: run.projectId, revision: run.revision, sourceRunId: run.id, createdAt, projectSnapshot: clone(run.projectSnapshot), sourceRun: runMetadata(run), source, spec: clone(result.spec), result};
  return checkedRecords([record], validateProject, {computed: new Map([[record, result]])})[0];
}
function checkedRecords(records, validateProject, {runs = [], computed = null} = {}) {
  if (records === undefined) return [];
  check(typeof validateProject === 'function', 'Importing measurements requires the project schema validator.');
  check(Array.isArray(records) && records.length <= MEASUREMENT_EVIDENCE_LIMITS.records, 'A backup may contain at most 12 instrument measurements.');
  const ids = new Set(), originalRuns = new Map(runs.map(run => [run.id, run])); let totalValues = 0, totalEvents = 0;
  const output = records.map(record => {
    check(object(record) && identifier(record.id) && !ids.has(record.id) && record.kind === 'instrument-measurement' && record.method === MEASUREMENT_METHOD && record.status === 'completed', 'A saved instrument measurement is malformed or duplicated.'); ids.add(record.id);
    ownKeys(record, ['id', 'kind', 'method', 'status', 'projectId', 'revision', 'sourceRunId', 'createdAt', 'projectSnapshot', 'sourceRun', 'source', 'spec', 'result', 'importedFromBackup'], 'Saved instrument measurement');
    check(identifier(record.projectId) && identifier(record.sourceRunId) && Number.isInteger(record.revision) && record.revision >= 0 && stamp(record.createdAt), 'Saved measurement identity, revision or timestamp is invalid.');
    const snapshot = validateProject(record.projectSnapshot);
    check(snapshot && snapshot.id === record.projectId && snapshot.revision === record.revision && object(snapshot.analysis), 'The measurement does not match its captured circuit revision.');
    const source = checkedSource(record.source), sourceRun = checkedMetadata(record.sourceRun, snapshot, record.sourceRunId, source);
    check(Date.parse(record.createdAt) >= Date.parse(sourceRun.completedAt ?? sourceRun.startedAt), 'The measurement predates its completed source run.');
    portable(record.spec, 4000, 'Measurement configuration'); portable(record.result, 1500000, 'Computed measurement result');
    const result = computed?.get(record) ?? measureMeasurementSource(source, record.spec);
    check(same(result.spec, record.spec), 'The saved measurement configuration is not normalized.');
    check(same(result, record.result), 'Saved measurement arithmetic disagrees with the retained raw samples or events.');
    check(record.importedFromBackup === undefined || typeof record.importedFromBackup === 'boolean', 'The measurement restoration flag is malformed.');
    const original = originalRuns.get(record.sourceRunId);
    if (original) {
      check(original.projectId === record.projectId && original.revision === record.revision && same(validateProject(original.projectSnapshot), snapshot), 'Measurement evidence contradicts its retained source-run circuit snapshot.');
      const actualSource = measurementSourceForRun(original, record.spec);
      check(same(identity(actualSource), identity(source)), 'Measurement raw evidence contradicts its retained source run.');
      check(same(actualSource.signals.map(s => s.label), source.signals.map(s => s.label)), 'Measurement signal labels contradict the retained run.');
      const actual = runMetadata(original), captured = clone(sourceRun); delete actual.importedFromBackup; delete captured.importedFromBackup;
      check(same(actual, captured), 'Measurement engine/input provenance contradicts its retained source run.');
    }
    const out = {...clone(record), projectSnapshot: snapshot, sourceRun, source, spec: clone(result.spec), result};
    const count = counts(out); totalValues += count.values; totalEvents += count.events;
    check(count.values <= MEASUREMENT_EVIDENCE_LIMITS.valuesPerRecord && count.events <= MEASUREMENT_EVIDENCE_LIMITS.eventsPerRecord && totalValues <= MEASUREMENT_EVIDENCE_LIMITS.totalValues && totalEvents <= MEASUREMENT_EVIDENCE_LIMITS.totalEvents && bytes(out) <= MEASUREMENT_EVIDENCE_LIMITS.recordBytes, boundsMessage);
    return out;
  });
  check(bytes(output) <= MEASUREMENT_EVIDENCE_LIMITS.totalBytes, boundsMessage); return output;
}
/** Recompute arithmetic, not the circuit simulation, when restoring evidence. */
export function validateMeasurementRecords(records, validateProject, {runs = []} = {}) { return checkedRecords(records, validateProject, {runs}); }
export function retainMeasurementRecords(records, record) {
  check(Array.isArray(records) && records.length <= MEASUREMENT_EVIDENCE_LIMITS.records && object(record) && identifier(record.id) && !records.some(item => item.id === record.id), 'Instrument history or its new identifier is malformed.');
  const own = counts(record); check(own.values <= MEASUREMENT_EVIDENCE_LIMITS.valuesPerRecord && own.events <= MEASUREMENT_EVIDENCE_LIMITS.eventsPerRecord && bytes(record) <= MEASUREMENT_EVIDENCE_LIMITS.recordBytes, boundsMessage);
  const kept = [...records, record], sizes = kept.map(bytes), quantities = kept.map(counts); let droppedCount = 0;
  let totalBytes = sizes.reduce((a, b) => a + b, 0) + kept.length + 1, totalValues = quantities.reduce((n, c) => n + c.values, 0), totalEvents = quantities.reduce((n, c) => n + c.events, 0);
  while (kept.length > MEASUREMENT_EVIDENCE_LIMITS.records || totalBytes > MEASUREMENT_EVIDENCE_LIMITS.totalBytes || totalValues > MEASUREMENT_EVIDENCE_LIMITS.totalValues || totalEvents > MEASUREMENT_EVIDENCE_LIMITS.totalEvents) { kept.shift(); totalBytes -= sizes.shift() + 1; const count = quantities.shift(); totalValues -= count.values; totalEvents -= count.events; droppedCount++; }
  check(kept.length && kept.at(-1).id === record.id, boundsMessage); return {records: kept, droppedCount};
}
export function measurementCSV(record) {
  const q = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  const rows = [['Measurement ID', 'Source run ID', 'Project ID', 'Revision', 'Recorded at', 'Method', 'Kind', 'Window start', 'Window end', 'Window unit', 'Row', 'Status', 'Value', 'Unit', 'Start', 'End', 'Reason', 'Details JSON', 'Configuration JSON', 'Netlist SHA-256 (as recorded)', 'Simulation plan SHA-256 (as recorded)', 'Result status', 'Candidate count', 'Rows truncated'], ...record.result.rows.map(row => [record.id, record.sourceRunId, record.projectId, record.revision, record.createdAt, record.method, record.spec.kind, record.spec.window.start, record.spec.window.end, record.source.domain === 'analog' ? record.source.axis.unit : 's', row.index, row.status, row.value, row.unit, row.start, row.end, row.reason, JSON.stringify(row.details), JSON.stringify(record.spec), record.sourceRun.netlistHash, record.sourceRun.simulationHash, record.result.status, record.result.candidateCount, record.result.truncated])];
  return rows.map(row => row.map(q).join(',')).join('\r\n');
}
export function measurementEvidenceJSON(record) { return JSON.stringify({format: 'CircuitBench instrument measurement evidence', formatVersion: 1, measurement: record}, null, 2); }
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const exact = (value, unit) => finite(value) ? `${value} ${unit}` : '—';
export function measurementReportHTML(records = [], {project, run} = {}) {
  if (!records.length) return '';
  return `<section class="instrument-evidence"><h2>02c / Instrument measurements</h2><p class="caption">Saved original analog samples or resolved digital events remain attached to each measurement. Import recomputes the measurement arithmetic; it does not rerun the circuit. Levels, windows, reference amplitudes and interpolation methods are explicit.</p>${records.map(record => {
    const earlier = project && (record.projectId !== project.id || record.revision !== project.revision), other = run && run.id !== record.sourceRunId;
    return `<section class="instrument-record"><h3>${esc(record.spec.kind)} · ${esc(record.id)}</h3><p>${esc(record.projectSnapshot.title)} · captured revision ${esc(record.revision)} · source run ${esc(record.sourceRunId)}${earlier ? ' · earlier circuit revision' : ''}${other ? ' · separate captured run' : ''}</p><p>${esc(record.result.interpretation)}</p><p>Overall status: ${esc(record.result.status)}. Window ${esc(record.spec.window.start)} to ${esc(record.spec.window.end)} ${esc(record.source.domain === 'analog' ? record.source.axis.unit : 's')}. ${record.result.truncated ? `Only the first ${record.result.rows.length} of ${record.result.candidateCount} occurrences are retained.` : ''}</p><table><thead><tr><th>Occurrence</th><th>Value</th><th>Status</th><th>Reason / numerical details</th></tr></thead><tbody>${record.result.rows.map(row => `<tr><td>${row.index}</td><td>${esc(exact(row.value, row.unit))}</td><td>${esc(row.status)}</td><td>${esc(row.reason)}<br><small>${esc(JSON.stringify(row.details))}</small></td></tr>`).join('')}</tbody></table><details><summary>Declared configuration</summary><pre>${esc(JSON.stringify(record.spec, null, 2))}</pre></details>${[...(record.result.warnings ?? []), ...record.sourceRun.bridgeAssumptions, ...record.sourceRun.warnings].map(warning => `<p class="caption">${esc(warning)}</p>`).join('')}<p class="caption">Method ${esc(record.method)} · captured engine ${esc(record.sourceRun.engine.name ?? 'Not recorded')} ${esc(record.sourceRun.engine.version ?? '')}<br>Recorded ${esc(record.createdAt)}<br>Netlist SHA-256 (as recorded): ${esc(record.sourceRun.netlistHash ?? 'Not recorded')}<br>Simulation plan SHA-256 (as recorded): ${esc(record.sourceRun.simulationHash ?? 'Not recorded')}<br>JSON/project backup retain the circuit snapshot, selected raw input arrays or events and exact configuration. CSV retains raw SI values, diagnostic statuses and per-row details.</p></section>`;
  }).join('')}</section>`;
}
