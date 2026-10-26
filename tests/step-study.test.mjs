import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EXAMPLES} from '../src/examples.js';
import {validateProject} from '../src/model.js';
import {generateNetlist} from '../src/netlist.js';
import {compileCoordinated, CoordinatedSession} from '../src/coordinated.js';
import {stepStudyChoices, normalizeStepStudySpec, stepStudyTrials, stepStudyTrialProject, runStepStudy, validateStepStudyRecords, retainStepStudyRecords, stepStudyCSV, stepStudyEvidenceJSON, stepStudyReportHTML} from '../src/step-study.js';
import {createMeasurementPreset} from '../src/measurement-evidence.js';
import {stepStudySetupHTML, stepStudyResultHTML, stepStudyHistoryHTML} from '../src/step-study-ui.js';

const hash = async text => createHash('sha256').update(text).digest('hex');
const near = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
function fixture() {
  const project = EXAMPLES.find(e => e.id === 'rc-step').create(); project.analysis.solver = 'coordinated'; project.analysis.step = '100u';
  const measurement = {kind: 'rise-time', signal: 'node:out', window: {start: 0, end: 0.005}, levels: {mode: 'percent', initial: 0, final: 1}};
  const spec = {count: 3, measurement, absoluteTolerance: 0, relativeTolerance: 0.02}; return {project, spec};
}
let runNumber = 0;
async function actualRunner(project) {
  const generated = generateNetlist(project), plan = compileCoordinated(project, generated), session = new CoordinatedSession(plan), startedAt = new Date().toISOString(), result = session.advanceTo(plan.duration, {maxSteps: 20000});
  assert.equal(result.done, true);
  return {id: `run_step_native_${++runNumber}`, projectId: project.id, revision: project.revision, projectSnapshot: structuredClone(project), analysis: structuredClone(project.analysis), netlist: generated.netlist, measurements: generated.measurements, engine: result.engine, status: 'completed', startedAt, completedAt: new Date().toISOString(), result};
}
test('study plans exact grid halvings while preserving every other initial configuration field', () => {
  const {project, spec} = fixture(), original = JSON.stringify(project), trials = stepStudyTrials(project, spec);
  assert.equal(stepStudyChoices(project).reason, ''); assert.deepEqual(trials.map(t => t.stepTicks), [100000000, 50000000, 25000000]);
  near(trials[0].step, 1e-4); near(trials[2].step, 25e-6);
  const next = stepStudyTrialProject(project, trials[1]); next.analysis.step = project.analysis.step; assert.equal(JSON.stringify(next), original); assert.equal(JSON.stringify(project), original);
});
test('invalid trial counts, sub-grid halvings, foreign signals and incompatible solvers are rejected before running', () => {
  const {project, spec} = fixture();
  for (const count of [1, 5, 2.5]) assert.throws(() => normalizeStepStudySpec(project, {...spec, count}), /2–4/);
  const tiny = structuredClone(project); tiny.analysis.step = '3p'; tiny.analysis.duration = '30p'; assert.throws(() => normalizeStepStudySpec(tiny, {...spec, count: 2}), /halving/);
  assert.throws(() => normalizeStepStudySpec(project, {...spec, measurement: {...spec.measurement, signal: 'missing'}}), /signal/);
  assert.throws(() => normalizeStepStudySpec(project, {...spec, relativeTolerance: 2}), /fraction/);
  const spice = structuredClone(project); spice.analysis.solver = 'ngspice'; assert.match(stepStudyChoices(spice).reason, /coordinated/);
  const ac = structuredClone(project); ac.analysis.type = 'ac'; assert.match(stepStudyChoices(ac).reason, /transient/);
});
test('fresh real coordinated RC trials show decreasing analytic error and recomputable successive differences', async () => {
  const {project, spec} = fixture(), original = JSON.stringify(project), progress = [];
  const study = await runStepStudy(project, spec, {runTrial: actualRunner, hash, onProgress: p => progress.push(p.completed)});
  assert.equal(study.status, 'completed'); assert.deepEqual(progress, [1, 2, 3]); assert.equal(study.summary.measuredCount, 3); assert.equal(new Set(study.trials.map(t => t.measurement.sourceRunId)).size, 3);
  const reference = 0.001 * Math.log(9), errors = study.trials.map(t => Math.abs(t.scalar.value - reference));
  assert.ok(errors[2] < errors[1] && errors[1] < errors[0]);
  for (let i = 0; i < study.comparisons.length; i++) { const c = study.comparisons[i], a = study.trials[i].scalar.value, b = study.trials[i + 1].scalar.value; near(c.difference, b - a); near(c.allowedDifference, Math.abs(b) * spec.relativeTolerance); near(c.relativeDifference, Math.abs(b - a) / Math.abs(b)); }
  assert.equal(study.summary.finalComparison, 'within-tolerance'); assert.equal(JSON.stringify(project), original);
  assert.match(study.warnings[0], /not a certified error bound/); assert.deepEqual(validateStepStudyRecords(JSON.parse(JSON.stringify([study])), validateProject), [study]);
});
test('failed trials remain explicit and comparisons never skip a missing middle trial', async () => {
  const {project, spec} = fixture();
  const study = await runStepStudy(project, spec, {hash, runTrial: (p, {index}) => { if (index === 1) throw new Error('Deliberate numerical failure fixture'); return actualRunner(p); }});
  assert.equal(study.status, 'completed-with-errors'); assert.equal(study.summary.failedCount, 1); assert.deepEqual(study.comparisons.map(c => c.status), ['unavailable', 'unavailable']);
  assert.equal(study.trials[1].engine, null); assert.equal(study.trials[1].measurement, undefined); assert.match(study.trials[1].error, /Deliberate/);
});
test('cancellation preserves complete cases and leaves unstarted comparisons unavailable', async () => {
  const {project, spec} = fixture(), abort = new AbortController(); let calls = 0;
  const study = await runStepStudy(project, spec, {hash, signal: abort.signal, runTrial: p => { calls++; return actualRunner(p); }, onProgress: () => abort.abort()});
  assert.equal(calls, 1); assert.equal(study.status, 'cancelled'); assert.equal(study.summary.measuredCount, 1); assert.equal(study.summary.unstartedCount, 2);
  const already = new AbortController(); already.abort(); const empty = await runStepStudy(project, spec, {hash, signal: already.signal, runTrial: () => { throw new Error('must not run'); }});
  assert.equal(empty.status, 'cancelled'); assert.equal(empty.trials.length, 0);
});
test('abort interrupts a pending trial and retains its attempted input without a fabricated result', async () => {
  const {project, spec} = fixture(), abort = new AbortController();
  const study = await runStepStudy(project, spec, {hash, signal: abort.signal, runTrial: () => { queueMicrotask(() => abort.abort()); return new Promise(() => {}); }});
  assert.equal(study.status, 'cancelled'); assert.equal(study.trials.length, 1); assert.equal(study.trials[0].status, 'cancelled'); assert.equal(study.trials[0].measurement, undefined);
});
test('cancelling during input hashing does not wait for a late hash or start a solver', async () => {
  const {project, spec} = fixture(), abort = new AbortController(); let release, called = 0, hashing = 0;
  const gate = new Promise(resolve => { release = resolve; }), pending = runStepStudy(project, spec, {signal: abort.signal, hash: () => { hashing++; return gate; }, runTrial: () => { called++; throw new Error('must not run'); }});
  await new Promise(resolve => setImmediate(resolve)); assert.equal(hashing, 2); abort.abort(); const study = await pending;
  assert.equal(study.status, 'cancelled'); assert.equal(called, 0); assert.equal(study.summary.unstartedCount, 3); release('a'.repeat(64)); await new Promise(resolve => setImmediate(resolve)); assert.equal(called, 0);
});
test('continuous or live-adjusted trials and wrong step results are refused', async () => {
  const {project, spec} = fixture();
  for (const mutate of [run => run.result.inputTimeline.push({time: 0, id: 'source', value: 2}), run => run.result.sampling.mode = 'continuous-window', run => run.analysis.step = '1m', run => run.netlistHash = 'c'.repeat(64)]) {
    const study = await runStepStudy(project, {...spec, count: 2}, {hash, runTrial: async p => { const r = await actualRunner(p); mutate(r); return r; }});
    assert.equal(study.summary.failedCount, 2); assert.equal(study.summary.measuredCount, 0); assert.equal(study.comparisons[0].status, 'unavailable');
  }
});
test('an absent crossing remains saved raw evidence and yields no scalar comparison', async () => {
  const {project, spec} = fixture(); spec.measurement.levels = {mode: 'absolute', start: 5, end: 6};
  const study = await runStepStudy(project, {...spec, count: 2}, {hash, runTrial: actualRunner});
  assert.equal(study.status, 'completed-with-warnings'); assert.equal(study.trials[0].status, 'completed'); assert.equal(study.trials[0].scalar.value, null); assert.equal(study.comparisons[0].status, 'unavailable'); assert.ok(study.trials[0].measurement.source.vectors.length);
});
test('import rejects changed differences, run settings, provenance and scalar identities', async () => {
  const {project, spec} = fixture(), study = await runStepStudy(project, {...spec, count: 2}, {hash, runTrial: actualRunner});
  const changes = [s => s.comparisons[0].absoluteDifference = 0, s => s.summary.measuredCount = 99, s => s.trials[0].step *= 2, s => s.trials[0].projectSnapshot.analysis.step = '1m', s => s.trials[0].coordinatedPlan.maxStep *= 2, s => s.trials[0].scalar.value = 42, s => s.trials[0].measurement.result.value = 42, s => s.trials[0].netlistHash = 'c'.repeat(64), s => s.trials[0].measurement.source.signals[0].label = 'Incorrect compiled signal', s => s.trials[0].inputChanges.push({time: 1, value: 2})];
  for (const mutate of changes) { const bad = structuredClone(study); mutate(bad); assert.throws(() => validateStepStudyRecords([bad], validateProject)); }
  assert.throws(() => validateStepStudyRecords([study, study], validateProject), /duplicated/);
});
test('exports, history retention and setup presentation preserve the explicit sensitivity criterion', async () => {
  const {project, spec} = fixture(), study = await runStepStudy(project, {...spec, count: 2}, {hash, runTrial: actualRunner});
  const retained = retainStepStudyRecords(Array.from({length: 4}, (_, i) => ({...study, id: `old_step_study_${i}`})), study); assert.equal(retained.droppedCount, 1); assert.equal(retained.records.at(-1).id, study.id);
  assert.match(stepStudyCSV(study), /Coordinated plan SHA-256/); assert.equal(JSON.parse(stepStudyEvidenceJSON(study)).study.trials[0].netlist, study.trials[0].netlist);
  const preset = createMeasurementPreset('RC rise', study.spec.measurement), setup = stepStudySetupHTML(project, {presets: [preset]}); assert.match(setup, /step-study-run/); assert.match(setup, /halvings/);
  study.projectSnapshot.title = '<script>unsafe()</script>';
  for (const html of [stepStudyReportHTML([study], {project}), stepStudyResultHTML(study, project), stepStudyHistoryHTML([study], project)]) assert.doesNotMatch(html, /<script>/);
  assert.match(stepStudyReportHTML([study]), /not an accuracy rating/);
});
