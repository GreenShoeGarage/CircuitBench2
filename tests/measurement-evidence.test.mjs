import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject, validateProject} from '../src/model.js';
import {measureMeasurementSource} from '../src/measurements.js';
import {createMeasurementRecord, validateMeasurementRecords, retainMeasurementRecords, createMeasurementPreset, validateMeasurementPresets, measurementCSV, measurementEvidenceJSON, measurementReportHTML} from '../src/measurement-evidence.js';
import {measurementSetupHTML, measurementResultHTML, measurementHistoryHTML} from '../src/measurements-ui.js';

function fixture() {
  const project = newProject('Instrument evidence fixture'); project.id = 'project_measurements'; project.analysis.type = 'tran';
  const run = {id: 'run_measurements', status: 'completed', projectId: project.id, revision: project.revision, projectSnapshot: structuredClone(project), analysis: structuredClone(project.analysis), startedAt: '2026-10-24T10:00:00.000Z', completedAt: '2026-10-24T10:00:01.000Z', engine: {name: 'Reference fixture', version: '1'}, netlistHash: 'a'.repeat(64), simulationHash: 'b'.repeat(64), measurements: [{id: 'out', label: 'Output', vector: 'v(out)', unit: 'V'}], result: {points: 4, vectors: [{name: 'time', unit: 's', values: [0, 1, 2, 3]}, {name: 'v(out)', unit: 'V', values: [0, 0.5, 1, 1]}], warnings: []}};
  const spec = {kind: 'rise-time', signal: 'out', window: {start: 0, end: 3}, levels: {mode: 'percent', initial: 0, final: 1}};
  const record = createMeasurementRecord(run, spec, {id: 'measurement_fixture', createdAt: '2026-10-25T10:00:00.000Z', validateProject}); return {project, run, spec, record};
}
test('measurement records retain complete independent raw evidence and survive run removal', () => {
  const {run, record} = fixture(); assert.equal(record.result.value, 1.6); assert.equal(record.sourceRun.netlistHash, 'a'.repeat(64));
  run.result.vectors[1].values[1] = 99; run.projectSnapshot.title = 'Edited later';
  assert.equal(record.source.vectors[0].values[1], 0.5); assert.equal(record.projectSnapshot.title, 'Instrument evidence fixture');
  const restored = validateMeasurementRecords(JSON.parse(JSON.stringify([record])), validateProject, {runs: []}); assert.deepEqual(restored[0], record);
});
test('import recomputes arithmetic and rejects contradictory settings, metadata and raw samples', () => {
  const {record, run} = fixture();
  for (const change of [r => r.result.rows[0].value = 99, r => r.result.value = 99, r => r.spec.levels.high = 80, r => r.source.axis.values[2] = 0.5, r => r.source.vectors[0].values.pop(), r => r.sourceRun.netlistHash = 'not-a-hash', r => r.sourceRun.analysis.type = 'ac', r => r.revision++, r => r.sourceRun.engine.name = 'Changed']) {
    const bad = structuredClone(record); change(bad); assert.throws(() => validateMeasurementRecords([bad], validateProject, {runs: [run]}));
  }
  const changed = structuredClone(record); changed.source.vectors[0].values[1] = 0.25; changed.result = measureMeasurementSource(changed.source, changed.spec);
  assert.throws(() => validateMeasurementRecords([changed], validateProject, {runs: [run]}), /raw evidence/);
  // Once the original run is absent, validation proves arithmetic consistency,
  // not authenticity of an externally edited source. This limit is disclosed.
  assert.equal(validateMeasurementRecords([changed], validateProject).length, 1);
});
test('malformed source extras, duplicate records, nonportable numbers and invalid timestamps are rejected', () => {
  const {record} = fixture(); assert.throws(() => validateMeasurementRecords([record, record], validateProject), /duplicated/);
  for (const change of [r => r.source.injected = true, r => r.source.vectors[0].values[0] = Infinity, r => r.createdAt = '2026-10-20T00:00:00Z', r => r.source.sampleIndices[2] = 1, r => r.result.rows[0].extra = true]) { const bad = structuredClone(record); change(bad); assert.throws(() => validateMeasurementRecords([bad], validateProject)); }
  assert.throws(() => validateMeasurementRecords([record]), /schema validator/);
});
test('presets have bounded normalized definitions and keep exact windows and declared levels', () => {
  const {record} = fixture(), preset = createMeasurementPreset('Rise setup', record.spec, {id: 'preset_rise', createdAt: '2026-10-25T10:00:00Z'});
  assert.deepEqual(validateMeasurementPresets([preset])[0], preset); assert.equal(preset.spec.levels.high, 90); assert.equal(preset.spec.window.end, 3);
  assert.throws(() => validateMeasurementPresets([preset, preset]), /identifiers/);
  const bad = structuredClone(preset); bad.spec.window.end = -1; assert.throws(() => validateMeasurementPresets([bad]), /window/);
  const extra = structuredClone(preset); extra.spec.silentDefault = true; assert.throws(() => validateMeasurementPresets([extra]), /normalized/);
  assert.throws(() => validateMeasurementPresets(Array.from({length: 17}, (_, i) => ({...preset, id: `preset_${i}`}))), /16/);
});
test('bounded retention keeps the new record and states how many records were removed', () => {
  const {record} = fixture(), old = Array.from({length: 12}, (_, i) => ({...record, id: `measurement_old_${i}`})), result = retainMeasurementRecords(old, record);
  assert.equal(result.records.length, 12); assert.equal(result.records.at(-1).id, record.id); assert.equal(result.droppedCount, 1);
});
test('CSV and evidence JSON retain exact values and provenance; HTML escapes user fields', () => {
  const {record, run, project} = fixture(), json = JSON.parse(measurementEvidenceJSON(record)); assert.equal(json.formatVersion, 1); assert.deepEqual(json.measurement.source, record.source);
  const csv = measurementCSV(record); assert.match(csv, /1\.6/); assert.match(csv, /a{64}/); assert.match(csv, /Configuration JSON/);
  record.projectSnapshot.title = '<script>alert(1)</script>'; record.sourceRun.engine.name = '<img onerror=evil()>'; record.result.rows[0].reason = '<svg onload=evil()>';
  for (const html of [measurementReportHTML([record], {project, run}), measurementResultHTML(record, project), measurementHistoryHTML([record], project)]) { assert.doesNotMatch(html, /<script>|<img onerror|<svg onload/); assert.match(html, /Instrument|Rise|instrument/); }
  const setup = measurementSetupHTML(run, {spec: record.spec, records: [record]}); assert.match(setup, /measurement-run/); assert.match(setup, /measurement-save-preset/); assert.match(setup, /10/);
});
