import {validateProject as defaultValidateProject, uid} from './model.js';
import {parseValue} from './library.js';
import {generateNetlist} from './netlist.js';
import {compileCoordinated} from './coordinated.js';
import {normalizeMeasurementPresetSpec, measurementScalar, measurementSourceForRun} from './measurements.js';
import {createMeasurementRecord, validateMeasurementRecords} from './measurement-evidence.js';

export const STEP_STUDY_METHOD = 'cb-time-step-sensitivity-1';
export const STEP_STUDY_LIMITS = Object.freeze({trials: 4, records: 4, valuesPerStudy: 1500000, historyValues: 3000000, recordBytes: 24 * 1024 * 1024, historyBytes: 48 * 1024 * 1024});
const KINDS = ['rise-time', 'fall-time', 'overshoot', 'settling-time', 'threshold-delay', 'transfer-gain'];
const Q = 1e-12;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (v, max = 200) => typeof v === 'string' && v.length <= max;
const identifier = v => text(v, 100) && /^[A-Za-z][A-Za-z0-9_-]*$/.test(v);
const stamp = v => text(v, 80) && finite(Date.parse(v));
const validHash = value => typeof value === 'string' && (/^[a-f0-9]{64}$/i.test(value) || value === 'unavailable-in-insecure-context');
const clone = value => structuredClone(value);
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const fail = (message, code = 'STEP_STUDY_INVALID') => Object.assign(new Error(message), {code});
const check = (condition, message, code) => { if (!condition) throw fail(message, code); };
function canonical(value, depth = 0) {
  check(depth <= 30, 'Time-step evidence has excessive nesting.');
  if (Array.isArray(value)) return value.map(v => canonical(v, depth + 1));
  if (object(value)) { const out = Object.create(null); for (const key of Object.keys(value).sort()) out[key] = canonical(value[key], depth + 1); return out; }
  check(value === null || typeof value === 'string' || typeof value === 'boolean' || finite(value), 'Time-step evidence must contain finite portable JSON.'); return value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const only = (value, fields, label) => check(Object.keys(value).every(k => fields.includes(k)), `${label} contains unsupported fields.`);
const sourceValues = trial => trial.measurement ? trial.measurement.source.axis.values.length + trial.measurement.source.vectors.reduce((n, v) => n + v.values.length + (v.imag?.length ?? 0), 0) : 0;
const recordValues = record => record.trials.reduce((n, trial) => n + sourceValues(trial), 0);
const hashText = async text => globalThis.crypto?.subtle ? [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('') : 'unavailable-in-insecure-context';

/** Availability checks compile the actual coordinated subset; no substituted model. */
export function stepStudyChoices(project) {
  let reason = '', generated, plan;
  if (project?.workspace !== 'schematic' || project?.analysis?.type !== 'tran' || project?.analysis?.solver !== 'coordinated') reason = 'Time-step sensitivity requires a transient schematic with the coordinated solver selected.';
  try { if (!reason) { generated = generateNetlist(project); const errors = generated.diagnostics.filter(d => d.severity === 'error'); if (errors.length) reason = errors.map(d => d.message).join(' '); else { plan = compileCoordinated(project, generated); if (!plan.analog.elements.length) reason = 'Add an analog partition; digital-only event times do not use the analog maximum step.'; } } } catch (error) { reason = error.message; }
  const signals = (generated?.measurements ?? []).filter(m => ['V', 'A'].includes(m.unit)).map(m => ({id: m.id, label: m.label ?? m.id, unit: m.unit}));
  return {reason, signals, measurementKinds: [...KINDS], baseStep: plan?.maxStep ?? null, duration: plan?.duration ?? null};
}
function exactTicks(value, label) {
  const ticks = Math.round(value / Q);
  check(finite(value) && value > 0 && Number.isSafeInteger(ticks) && ticks >= 1 && Math.abs(value - ticks * Q) <= Math.max(Q * 1e-6, Number.EPSILON * value * 4), `${label} must be a positive exact multiple of the 1 ps event grid.`);
  return ticks;
}
export function normalizeStepStudySpec(project, input) {
  const choices = stepStudyChoices(project); check(!choices.reason, choices.reason);
  check(object(input) && Number.isInteger(input.count) && input.count >= 2 && input.count <= STEP_STUDY_LIMITS.trials, 'Choose 2–4 fresh trials, including the original maximum step.');
  const baseTicks = exactTicks(choices.baseStep, 'Starting maximum step'), divisor = 2 ** (input.count - 1);
  check(baseTicks >= divisor && baseTicks % divisor === 0, 'Every requested halving must remain an exact positive 1 ps grid duration. Adjust the starting step or reduce the trial count.');
  const measurement = normalizeMeasurementPresetSpec(input.measurement);
  check(KINDS.includes(measurement.kind) && (measurement.kind !== 'transfer-gain' || measurement.mode !== 'ac'), 'Choose a transient analog scalar measurement; AC and digital constraints are outside this study.');
  const selected = [measurement.signal, ...(measurement.reference ? [measurement.reference] : [])];
  check(selected.every(id => choices.signals.some(s => s.id === id)), 'A measurement signal does not belong to this schematic.');
  if (measurement.kind === 'transfer-gain') check(choices.signals.find(s => s.id === measurement.signal).unit === choices.signals.find(s => s.id === measurement.reference).unit, 'Transfer gain requires input and output with the same unit.');
  check(measurement.window.start >= 0 && measurement.window.end <= choices.duration, 'The measurement window must fit every fresh simulation from time zero to the configured duration.');
  for (const key of ['absoluteTolerance', 'relativeTolerance']) check(finite(input[key]) && input[key] >= 0, 'Absolute and relative comparison tolerances must be finite and nonnegative.');
  check(input.relativeTolerance <= 1, 'Relative tolerance is a fraction from 0 to 1 (0–100 percent).');
  const spec = {count: input.count, measurement, absoluteTolerance: input.absoluteTolerance, relativeTolerance: input.relativeTolerance};
  // Compile the finest run too, so its existing point preflight is a real gate.
  const finest = clone(project); finest.analysis.step = String(baseTicks / divisor * Q);
  const generated = generateNetlist(finest), errors = generated.diagnostics.filter(d => d.severity === 'error'); check(!errors.length, `The finest requested step cannot run: ${errors.map(d => d.message).join(' ')}`); compileCoordinated(finest, generated);
  return spec;
}
export function stepStudyTrials(project, input) {
  const spec = normalizeStepStudySpec(project, input), ticks = exactTicks(parseValue(project.analysis.step, 's'), 'Starting maximum step');
  return Array.from({length: spec.count}, (_, index) => ({index, stepTicks: ticks / 2 ** index, step: ticks / 2 ** index * Q}));
}
export function stepStudyTrialProject(project, trial) { const output = clone(project); output.analysis.step = String(trial.step); return output; }
function comparisons(trials, spec) {
  return Array.from({length: spec.count - 1}, (_, i) => {
    const previous = trials[i], current = trials[i + 1], base = {index: i + 1, previousTrial: i, currentTrial: i + 1};
    if (previous?.status !== 'completed' || current?.status !== 'completed') return {...base, status: 'unavailable', difference: null, absoluteDifference: null, relativeDifference: null, allowedDifference: null, unit: null, reason: 'Both adjacent trials must complete; failed, cancelled and unstarted trials are not skipped.'};
    const a = measurementScalar(previous.measurement.result), b = measurementScalar(current.measurement.result);
    if (a.value === null || b.value === null || a.unit !== b.unit) return {...base, status: 'unavailable', difference: null, absoluteDifference: null, relativeDifference: null, allowedDifference: null, unit: a.unit === b.unit ? a.unit : null, reason: a.value === null ? a.reason : b.value === null ? b.reason : 'The measured units differ.'};
    const difference = b.value - a.value, absoluteDifference = Math.abs(difference), scale = Math.abs(b.value), allowedDifference = spec.absoluteTolerance + spec.relativeTolerance * scale;
    if (![difference, absoluteDifference, allowedDifference].every(finite)) return {...base, status: 'unavailable', difference: null, absoluteDifference: null, relativeDifference: null, allowedDifference: null, unit: b.unit, reason: 'Comparison arithmetic exceeded the finite numeric range.'};
    const relative = scale ? absoluteDifference / scale : absoluteDifference === 0 ? 0 : null;
    return {...base, status: absoluteDifference <= allowedDifference ? 'within-tolerance' : 'outside-tolerance', difference, absoluteDifference, relativeDifference: finite(relative) ? relative : null, allowedDifference, unit: b.unit, reason: scale === 0 && absoluteDifference !== 0 ? 'Relative difference is undefined because the finer-step value is zero; the absolute tolerance still applies.' : relative !== null && !finite(relative) ? 'Relative difference exceeds the finite range; the absolute comparison remains defined.' : ''};
  });
}
export function stepStudySummary(trials, spec) {
  const pairs = comparisons(trials, spec), completed = trials.filter(t => t.status === 'completed');
  return {requestedCount: spec.count, attemptedCount: trials.length, completedCount: completed.length, measuredCount: completed.filter(t => measurementScalar(t.measurement.result).value !== null).length, failedCount: trials.filter(t => t.status === 'failed').length, cancelledCount: trials.filter(t => t.status === 'cancelled').length, unstartedCount: spec.count - trials.length, withinToleranceCount: pairs.filter(p => p.status === 'within-tolerance').length, outsideToleranceCount: pairs.filter(p => p.status === 'outside-tolerance').length, unavailableComparisonCount: pairs.filter(p => p.status === 'unavailable').length, finalComparison: pairs.at(-1)?.status ?? 'unavailable'};
}
function finalStatus(trials, count, aborted = false) { return aborted || trials.length < count || trials.some(t => t.status === 'cancelled') ? 'cancelled' : trials.some(t => t.status === 'failed') ? 'completed-with-errors' : trials.some(t => measurementScalar(t.measurement.result).value === null) ? 'completed-with-warnings' : 'completed'; }
function warningsFor(status, summary) {
  return ['Successive differences describe sensitivity to the maximum step. They are not a certified error bound, proof of convergence or a physical-accuracy rating.', 'Each trial restarts from the same schematic initial conditions and source parameters. Retained live-input histories are not replayed.', ...(status === 'cancelled' ? ['Cancelled study: completed trial evidence is retained; unfinished and unstarted cases have no numeric comparison.'] : []), ...(summary.failedCount ? [`${summary.failedCount} trial(s) failed. Comparisons do not skip missing trials.`] : []), ...(summary.measuredCount < summary.completedCount ? ['Some completed trials did not yield exactly one complete scalar. Their raw measurement evidence and diagnostic reasons are retained.'] : [])];
}
const cancelled = () => fail('Time-step study cancelled.', 'STEP_STUDY_CANCELLED');
function withAbort(promise, signal) {
  if (!signal) return promise; if (signal.aborted) { promise.catch(() => {}); return Promise.reject(cancelled()); }
  return new Promise((resolve, reject) => { const abort = () => reject(cancelled()); signal.addEventListener('abort', abort, {once: true}); promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)); });
}

/** runTrial starts a fresh isolated solver and stops it on signal.abort. */
export async function runStepStudy(project, input, {runTrial, signal, onProgress = () => {}, hash = hashText, id = uid('step_study'), createdAt = new Date().toISOString()} = {}) {
  check(typeof runTrial === 'function' && typeof hash === 'function', 'A fresh simulation runner and input hasher are required.');
  const snapshot = defaultValidateProject(clone(project)), spec = normalizeStepStudySpec(snapshot, input), planned = stepStudyTrials(snapshot, spec);
  check(identifier(id) && stamp(createdAt), 'Study identity or timestamp is invalid.');
  const record = {id, kind: 'step-study', method: STEP_STUDY_METHOD, projectId: snapshot.id, revision: snapshot.revision, createdAt, startedAt: new Date().toISOString(), completedAt: null, projectSnapshot: snapshot, spec, status: 'running', trials: [], comparisons: [], summary: null, warnings: []};
  check(Date.parse(record.startedAt) >= Date.parse(createdAt), 'The study cannot begin before its creation timestamp.');
  const prepared = planned.map(trial => { const projectSnapshot = stepStudyTrialProject(snapshot, trial), generated = generateNetlist(projectSnapshot); return {...trial, projectSnapshot, generated, coordinatedPlan: compileCoordinated(projectSnapshot, generated)}; });
  const reserves = prepared.map(p => bytes({...planned[p.index], projectSnapshot: p.projectSnapshot, netlist: p.generated.netlist, coordinatedPlan: p.coordinatedPlan}) + 18000);
  check(bytes(record) + reserves.reduce((n, v) => n + v, 0) + 20000 <= STEP_STUDY_LIMITS.recordBytes, 'This circuit and its exact trial inputs exceed the 24 MiB study budget before numerical evidence.');
  let values = 0;
  for (const preparedTrial of prepared) {
    if (signal?.aborted) break;
    const {projectSnapshot: trialProject, generated, coordinatedPlan} = preparedTrial, plannedTrial = planned[preparedTrial.index], startedAt = new Date().toISOString();
    let netlistHash, simulationHash;
    try { [netlistHash, simulationHash] = await withAbort(Promise.resolve().then(() => Promise.all([hash(generated.netlist), hash(JSON.stringify(coordinatedPlan))])), signal); }
    catch (error) { if (signal?.aborted || error?.code === 'STEP_STUDY_CANCELLED') break; throw error; }
    check(validHash(netlistHash) && validHash(simulationHash), 'The input hasher returned an invalid SHA-256 identifier.');
    const basis = {...plannedTrial, startedAt, projectSnapshot: trialProject, netlist: generated.netlist, netlistHash, coordinatedPlan, simulationHash}; let trial;
    try {
      const run = await withAbort(Promise.resolve().then(() => { if (signal?.aborted) throw cancelled(); return runTrial(clone(trialProject), {signal, index: plannedTrial.index}); }), signal);
      if (signal?.aborted) throw cancelled();
      check(run && ['completed', 'completed-with-warnings'].includes(run.status), 'A trial did not complete its simulation.');
      check(same(defaultValidateProject(run.projectSnapshot), trialProject) && same(run.analysis, trialProject.analysis) && run.projectId === snapshot.id && run.revision === snapshot.revision, 'A trial returned a different circuit, initial condition or analysis setting.');
      check(run.netlist === generated.netlist && (run.coordinatedPlan === undefined || same(run.coordinatedPlan, coordinatedPlan)), 'A trial returned a different exact simulation input.');
      check((run.netlistHash === undefined || run.netlistHash === null || run.netlistHash === netlistHash) && (run.simulationHash === undefined || run.simulationHash === null || run.simulationHash === simulationHash), 'A trial input hash contradicts its compiled source.');
      const engine = run.engine ?? run.result?.engine;
      check(object(engine) && engine.integration === 'backward Euler' && engine.timeResolution === Q && text(engine.name) && engine.name && text(engine.version) && engine.version, 'The trial must identify the coordinated backward-Euler engine and 1 ps grid.');
      check(!run.result?.continuous && run.result?.sampling?.mode === 'coordinated-events' && (!run.result.inputTimeline || Array.isArray(run.result.inputTimeline) && run.result.inputTimeline.length === 0), 'Time-step trials require fresh full runs without retained continuous or live-input history.');
      const axis = run.result.vectors?.find(v => v.name === 'time')?.values;
      check(Array.isArray(axis) && axis.length >= 2 && axis[0] === 0 && Math.abs(axis.at(-1) - coordinatedPlan.duration) <= Q * 1e-6 && axis.every((t, i) => !i || t > axis[i - 1] && t - axis[i - 1] <= plannedTrial.step + Math.max(Q * 1e-6, Number.EPSILON * t * 8)), 'A trial did not preserve the full requested time range within its maximum step.');
      const completedAt = new Date().toISOString(), captured = {...run, engine: clone(engine), netlistHash, simulationHash};
      const measurement = createMeasurementRecord(captured, spec.measurement, {id: `${id}_trial_${plannedTrial.index}`, createdAt: completedAt, validateProject: defaultValidateProject});
      trial = {...basis, status: 'completed', completedAt, engine: clone(engine), inputChanges: [], measurement, scalar: measurementScalar(measurement.result)};
      const count = sourceValues(trial);
      check(values + count <= STEP_STUDY_LIMITS.valuesPerStudy, 'The study exceeds its 1.5 million selected raw-value budget. Shorten the run or reduce trials.', 'STEP_STUDY_LIMIT');
      check(bytes({...record, trials: [...record.trials, trial]}) + reserves.slice(plannedTrial.index + 1).reduce((n, v) => n + v, 0) + 20000 <= STEP_STUDY_LIMITS.recordBytes, 'The study exceeds its 24 MiB evidence budget, including space for later diagnostic rows.', 'STEP_STUDY_LIMIT');
      values += count;
    } catch (error) {
      const stopped = signal?.aborted || error?.status === 'cancelled' || error?.code === 'STEP_STUDY_CANCELLED';
      trial = {...basis, status: stopped ? 'cancelled' : 'failed', completedAt: new Date().toISOString(), engine: null, inputChanges: [], error: String(error?.message ?? error).slice(0, 4000), code: String(error?.code ?? 'STEP_STUDY_TRIAL_FAILED').slice(0, 100)};
    }
    record.trials.push(trial); onProgress({completed: record.trials.length, total: spec.count, trial: clone(trial), summary: stepStudySummary(record.trials, spec)});
    if (trial.status === 'cancelled') break;
  }
  record.status = finalStatus(record.trials, spec.count, Boolean(signal?.aborted)); record.completedAt = new Date().toISOString(); record.comparisons = comparisons(record.trials, spec); record.summary = stepStudySummary(record.trials, spec); record.warnings = warningsFor(record.status, record.summary);
  return validateStepStudyRecords([record], defaultValidateProject)[0];
}

/** Regenerate declared inputs and recompute every saved measurement/difference. */
export function validateStepStudyRecords(records, validateProject = defaultValidateProject) {
  if (records === undefined) return [];
  check(Array.isArray(records) && records.length <= STEP_STUDY_LIMITS.records, 'A backup may contain at most four time-step studies.');
  check(bytes(records) <= STEP_STUDY_LIMITS.historyBytes, 'Time-step study history exceeds 48 MiB.');
  const ids = new Set(); let totalValues = 0;
  const output = records.map(record => {
    check(object(record) && identifier(record.id) && !ids.has(record.id) && record.kind === 'step-study' && record.method === STEP_STUDY_METHOD, 'A saved time-step study is malformed or duplicated.'); ids.add(record.id);
    only(record, ['id', 'kind', 'method', 'projectId', 'revision', 'createdAt', 'startedAt', 'completedAt', 'projectSnapshot', 'spec', 'status', 'trials', 'comparisons', 'summary', 'warnings', 'importedFromBackup'], 'Time-step study');
    const snapshot = validateProject(record.projectSnapshot);
    check(snapshot.id === record.projectId && snapshot.revision === record.revision && stamp(record.createdAt) && stamp(record.startedAt) && stamp(record.completedAt) && Date.parse(record.createdAt) <= Date.parse(record.startedAt) && Date.parse(record.startedAt) <= Date.parse(record.completedAt), 'Saved study identity or timestamp order is invalid.');
    const spec = normalizeStepStudySpec(snapshot, record.spec), planned = stepStudyTrials(snapshot, spec);
    check(same(spec, record.spec) && Array.isArray(record.trials) && record.trials.length <= spec.count, 'Saved study settings or trial count are malformed.');
    const measurementIds = new Set(), runIds = new Set(); let previousEnd = Date.parse(record.startedAt);
    const trials = record.trials.map((trial, index) => {
      check(object(trial) && trial.index === index && trial.stepTicks === planned[index].stepTicks && trial.step === planned[index].step && ['completed', 'failed', 'cancelled'].includes(trial.status), 'Saved trial order or exact step halving is invalid.');
      only(trial, ['index', 'stepTicks', 'step', 'startedAt', 'completedAt', 'projectSnapshot', 'netlist', 'netlistHash', 'coordinatedPlan', 'simulationHash', 'status', 'engine', 'inputChanges', 'measurement', 'scalar', 'error', 'code'], 'Time-step trial');
      const trialProject = stepStudyTrialProject(snapshot, planned[index]), generated = generateNetlist(trialProject), plan = compileCoordinated(trialProject, generated);
      check(same(validateProject(trial.projectSnapshot), trialProject) && trial.netlist === generated.netlist && same(trial.coordinatedPlan, plan), 'Saved trial input or circuit differs from the declared initial configuration and step.');
      check(validHash(trial.netlistHash) && validHash(trial.simulationHash) && Array.isArray(trial.inputChanges) && trial.inputChanges.length === 0, 'Saved trial hashes or fresh-run input provenance are invalid.');
      check(stamp(trial.startedAt) && stamp(trial.completedAt) && Date.parse(trial.startedAt) >= previousEnd && Date.parse(trial.completedAt) >= Date.parse(trial.startedAt) && Date.parse(trial.completedAt) <= Date.parse(record.completedAt), 'Saved trials must execute sequentially with ordered timestamps.'); previousEnd = Date.parse(trial.completedAt);
      if (trial.status === 'completed') {
        check(trial.error === undefined && trial.code === undefined && object(trial.engine) && trial.engine.integration === 'backward Euler' && trial.engine.timeResolution === Q, 'A completed trial has invalid engine or failure metadata.');
        const measurement = validateMeasurementRecords([trial.measurement], validateProject)[0];
        check(measurement && !measurementIds.has(measurement.id) && !runIds.has(measurement.sourceRunId), 'Each fresh trial requires distinct run and measurement identities.'); measurementIds.add(measurement.id); runIds.add(measurement.sourceRunId);
        check(same(measurement.projectSnapshot, trialProject) && same(measurement.spec, spec.measurement) && same(measurement.sourceRun.engine, trial.engine) && measurement.sourceRun.netlistHash === trial.netlistHash && measurement.sourceRun.simulationHash === trial.simulationHash && measurement.sourceRun.sampling?.mode === 'coordinated-events' && measurement.sourceRun.continuous === undefined, 'A saved measurement contradicts its fresh trial configuration or engine/input provenance.');
        const xs = measurement.source.axis.values;
        check(xs[0] === 0 && Math.abs(xs.at(-1) - plan.duration) <= Q * 1e-6 && xs.every((x, i) => !i || x - xs[i - 1] <= trial.step + Math.max(Q * 1e-6, Number.EPSILON * x * 8)), 'Saved trial evidence does not cover the complete requested range at its declared step.');
        const source = measurement.source;
        const reconstructed = measurementSourceForRun({status: 'completed', analysis: trialProject.analysis, measurements: generated.measurements, result: {points: xs.length, sampling: {mode: 'coordinated-events'}, vectors: [{name: source.axis.name, unit: 's', values: xs}, ...source.vectors.map(v => ({name: v.name, values: v.values, unit: 'V'}))]}}, spec.measurement);
        check(same(source.signals, reconstructed.signals), 'Saved trial signal definitions disagree with its compiled schematic.');
        const scalar = measurementScalar(measurement.result); check(same(scalar, trial.scalar), 'Saved scalar selection disagrees with the recomputed measurement.');
        return {...clone(trial), projectSnapshot: trialProject, measurement, scalar};
      }
      check(trial.measurement === undefined && trial.scalar === undefined && trial.engine === null && text(trial.error, 4000) && trial.error.length > 0 && text(trial.code, 100), 'A failed/cancelled trial must retain a bounded diagnostic and no numeric result.');
      check(trial.status !== 'cancelled' || index === record.trials.length - 1, 'A cancelled trial must be the final attempted case.'); return clone(trial);
    });
    // A cancelled signal may arrive just after the final successful case.
    const allowedStatus = finalStatus(trials, spec.count, record.status === 'cancelled'); check(record.status === allowedStatus, 'Saved study completion status contradicts its trial outcomes.');
    const pairs = comparisons(trials, spec), summary = stepStudySummary(trials, spec), warnings = warningsFor(record.status, summary);
    check(same(record.comparisons, pairs) && same(record.summary, summary) && same(record.warnings, warnings), 'Saved time-step comparisons, summary or diagnostic interpretation disagree with recomputed evidence.');
    check(record.importedFromBackup === undefined || typeof record.importedFromBackup === 'boolean', 'Study restoration metadata is invalid.');
    const out = {...clone(record), projectSnapshot: snapshot, spec, trials, comparisons: pairs, summary, warnings}, values = recordValues(out); totalValues += values;
    check(values <= STEP_STUDY_LIMITS.valuesPerStudy && bytes(out) <= STEP_STUDY_LIMITS.recordBytes, 'Saved study exceeds its raw-value or 24 MiB evidence budget.'); return out;
  });
  check(totalValues <= STEP_STUDY_LIMITS.historyValues, 'Saved time-step history exceeds three million raw values.'); return output;
}
export function retainStepStudyRecords(records, record) {
  check(Array.isArray(records) && records.length <= STEP_STUDY_LIMITS.records && !records.some(r => r.id === record.id), 'Time-step history is malformed or its new identifier is duplicated.');
  check(recordValues(record) <= STEP_STUDY_LIMITS.valuesPerStudy && bytes(record) <= STEP_STUDY_LIMITS.recordBytes, 'The new time-step study exceeds its individual evidence budget.');
  const kept = [...records, record]; let droppedCount = 0;
  while (kept.length > STEP_STUDY_LIMITS.records || bytes(kept) > STEP_STUDY_LIMITS.historyBytes || kept.reduce((n, r) => n + recordValues(r), 0) > STEP_STUDY_LIMITS.historyValues) { kept.shift(); droppedCount++; }
  check(kept.length && kept.at(-1).id === record.id, 'The new time-step record could not be retained.'); return {records: kept, droppedCount};
}
export function stepStudyCSV(record) {
  const q = v => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  const rows = [['Study', 'Project', 'Revision', 'Trial', 'Maximum step (s)', 'Status', 'Scalar status', 'Value', 'Unit', 'Comparison to previous', 'Signed difference', 'Absolute difference', 'Relative difference (fraction, finer reference)', 'Allowed difference', 'Absolute tolerance', 'Relative tolerance (fraction)', 'Reason', 'Source run', 'Netlist SHA-256 (as recorded)', 'Coordinated plan SHA-256 (as recorded)', 'Measurement configuration JSON'], ...record.trials.map(t => { const c = record.comparisons.find(c => c.currentTrial === t.index); return [record.id, record.projectId, record.revision, t.index + 1, t.step, t.status, t.scalar?.status, t.scalar?.value, t.scalar?.unit, c?.status, c?.difference, c?.absoluteDifference, c?.relativeDifference, c?.allowedDifference, record.spec.absoluteTolerance, record.spec.relativeTolerance, t.error ?? t.scalar?.reason ?? c?.reason, t.measurement?.sourceRunId, t.netlistHash, t.simulationHash, JSON.stringify(record.spec.measurement)]; })];
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}
export function stepStudyEvidenceJSON(record) { return JSON.stringify({format: 'CircuitBench time-step sensitivity evidence', formatVersion: 1, study: record}, null, 2); }
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function stepStudyReportHTML(records = [], {project} = {}) {
  if (!records.length) return '';
  return `<section class="step-study-evidence"><h2>02d / Time-step sensitivity</h2><p class="caption">Independent coordinated transient runs restart from identical initial conditions. Only the declared maximum step is halved. Successive differences are a sensitivity observation, not an accuracy rating or a certified error bound.</p>${records.map(r => `<section><h3>${esc(r.projectSnapshot.title)} · ${esc(r.id)}</h3><p>Captured revision ${esc(r.revision)}${project && (project.id !== r.projectId || project.revision !== r.revision) ? ' · earlier circuit revision' : ''} · ${esc(r.status)} · ${r.summary.measuredCount} / ${r.spec.count} trials produced one complete scalar.</p><p>Criterion: absolute difference ≤ ${esc(r.spec.absoluteTolerance)} + ${esc(r.spec.relativeTolerance)} × absolute finer-step value. The final adjacent comparison is ${esc(r.summary.finalComparison)}.</p><table><thead><tr><th>Trial</th><th>Maximum step (s)</th><th>Value</th><th>Adjacent comparison</th><th>Diagnostic</th></tr></thead><tbody>${r.trials.map(t => { const c = r.comparisons.find(c => c.currentTrial === t.index); return `<tr><td>${t.index + 1}</td><td>${esc(t.step)}</td><td>${t.scalar?.value === null || t.scalar?.value === undefined ? '—' : esc(`${t.scalar.value} ${t.scalar.unit}`)}</td><td>${esc(c?.status ?? 'Initial trial')}${c?.absoluteDifference !== null && c?.absoluteDifference !== undefined ? ` · |Δ| ${esc(c.absoluteDifference)}` : ''}</td><td>${esc(t.error || t.scalar?.reason || c?.reason || '')}</td></tr>`; }).join('')}</tbody></table><details><summary>Declared measurement</summary><pre>${esc(JSON.stringify(r.spec.measurement, null, 2))}</pre></details>${r.warnings.map(w => `<p class="caption">${esc(w)}</p>`).join('')}<p class="caption">Method ${esc(r.method)}. Every completed trial retains its circuit snapshot, exact compiled inputs and recorded hashes, engine identity and independent raw measurement evidence. Import recomputes measurement arithmetic and all differences; it does not rerun the solver.</p></section>`).join('')}</section>`;
}
