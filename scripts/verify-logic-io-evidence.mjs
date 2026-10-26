/** Verify actual rc.2 browser downloads without rerunning a simulator.
 * Default is read-only; --finalize writes the hashed verification record. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { safeEnvelope } from '../src/storage.js';
import { validateProject, buildNets } from '../src/model.js';
import { parseValue } from '../src/library.js';
import { displayStatesForRun } from '../src/displays.js';

const root = fileURLToPath(new URL('..', import.meta.url)), finalize = process.argv.includes('--finalize');
if (process.argv.slice(2).some(value => value !== '--finalize')) throw new Error('Usage: node scripts/verify-logic-io-evidence.mjs [--finalize]');
const output = 'evidence/rc202-export-validation.json';
const files = ['rc202-live-digital.circuitbench.json', 'rc202-voltage-levels.circuitbench.json', 'rc202-four-state-indicators.circuitbench.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const tick = time => Math.round(time * 1e12);
const vector = (run, name) => { const found = run.result.vectors.find(item => item.name === name); if (!found) throw new Error(`Missing ${name} in ${run.id}`); return found.values; };
const trace = (run, name) => { const found = run.result.digitalEvents.find(item => item.name === name); if (!found) throw new Error(`Missing ${name} events in ${run.id}`); return found.events; };
const eventValue = (events, time) => events.filter(event => event.time <= time).at(-1)?.value;
const lamps = (project, run, time) => Object.values(displayStatesForRun(project, run, time)).map(({ ref, value, on, label, available }) => ({ ref, value, on, label, available }));
const report = { format: 'CircuitBench logic I/O browser export verification', formatVersion: 1, version: '2.0.0-rc.2', verifiedAt: new Date().toISOString(), hashesFinalized: finalize,
  scope: 'Production import validation of three actual browser backups, repeated JSON round trips, snapshot-specific indicator observations, independently reconstructed sparse/dense digital states, exact gate-edge delays, RC backward-Euler recurrence, Ohm law and Schmitt threshold decisions. No circuit is resimulated. This record does not establish browser actions, CSS appearance, hosting/offline behavior or physical-device accuracy.',
  artifacts: [], checks: [], analogChecks: [] };
function verify(name, condition, details = {}) { report.checks.push({ name, passed: Boolean(condition), details }); if (!condition) throw new Error(name); }
function recordedHash(name, recorded, content) {
  verify(`${name}: hash matches or insecure-context absence is explicit`, /^[a-f0-9]{64}$/.test(recorded ?? '') ? recorded === hash(content) : recorded === 'unavailable-in-insecure-context', { recorded });
}
const loaded = new Map();
for (const name of files) {
  const file = `evidence/${name}`, bytes = await fs.readFile(path.join(root, file)), raw = JSON.parse(bytes), envelope = safeEnvelope(raw, validateProject);
  verify(`${name}: production import keeps every captured run`, raw.format === 'CircuitBench' && raw.formatVersion === 1 && raw.appVersion === '2.0.0-rc.2' && envelope.runs.length === raw.runs.length);
  let repeated = envelope;
  for (let cycle = 1; cycle <= 3; cycle++) { repeated = safeEnvelope(clone(repeated), validateProject); verify(`${name}: JSON/import round trip ${cycle} is unchanged`, same(repeated, envelope)); }
  const artifact = { file, bytes: bytes.length, sha256: hash(bytes), appVersion: raw.appVersion, projectId: envelope.project.id, title: envelope.project.title, revision: envelope.project.revision, activeRunId: envelope.activeRunId, runs: [] };
  for (const run of envelope.runs) {
    const times = vector(run, 'time'), snapshot = run.projectSnapshot, observed = lamps(snapshot, run);
    verify(`${run.id}: complete vectors and strictly advancing time`, times.length === run.result.points && times.every((time, index) => Number.isFinite(time) && (!index || time > times[index - 1])) && run.result.vectors.every(item => item.values.length === times.length && (item.kind === 'logic' ? item.values.every(value => /^[01XZ]$/.test(value)) : item.values.every(Number.isFinite))));
    verify(`${run.id}: all indicator observations use the matching snapshot and red only for 1`, observed.length > 0 && observed.every(lamp => lamp.available && lamp.on === (lamp.value === '1')));
    verify(`${run.id}: sparse states reproduce every dense logic value`, run.result.vectors.filter(item => item.kind === 'logic').every(item => item.values.every((value, index) => value === eventValue(trace(run, item.name), times[index]))));
    if (run.revision !== envelope.project.revision) verify(`${run.id}: older revision cannot illuminate the working circuit`, lamps(envelope.project, run).every(lamp => !lamp.available && !lamp.on && lamp.value === null));
    recordedHash(`${run.id}/netlist`, run.netlistHash, run.netlist);
    if (run.simulationHash) recordedHash(`${run.id}/simulation`, run.simulationHash, JSON.stringify(run.coordinatedPlan ?? run.simulation));
    artifact.runs.push({ id: run.id, revision: run.revision, status: run.status, solver: run.analysis.solver, engineBuild: run.engine.build, points: times.length, vectorCount: run.result.vectors.length, timeBounds: [times[0], times.at(-1)], snapshotIndicators: observed });
  }
  verify(`${name}: active run reproduces the working-circuit indicators`, lamps(envelope.project, envelope.runs.find(run => run.id === envelope.activeRunId)).every(lamp => lamp.available));
  report.artifacts.push(artifact); loaded.set(name, envelope);
}

// Source and NOT states are reconstructed from captured input changes, not
// obtained by calling the digital kernel or the continuous session engine.
{
  const envelope = loaded.get(files[0]), run = envelope.runs.find(item => item.result.continuous), snapshot = run.projectSnapshot;
  verify('Live digital: two bounded runs and one completed continuous window', envelope.runs.length === 3 && envelope.runs.filter(item => item.result.continuous).length === 1 && run.status === 'completed-with-warnings');
  const source = snapshot.circuit.components.find(item => item.type === 'DVS'), inverter = snapshot.circuit.components.find(item => item.type === 'NOT'), nets = buildNets(snapshot).endpointToNet;
  const input = trace(run, `d(${nets[`${source.id}:out`]})`), outputEvents = trace(run, `d(${nets[`${inverter.id}:out`]})`), history = run.result.continuous;
  verify('Live digital: recorded source drives the inverter input', nets[`${source.id}:out`] === nets[`${inverter.id}:in`] && source.params.outputMode === 'logic' && source.params.state === '1');
  verify('Live digital: retained window and point accounting', tick(history.windowStart) === 15500000000 && tick(history.currentTime) === 17500000000 && run.result.points === 23 && history.totalPoints === 178 && history.droppedPoints === 155 && history.totalPoints - history.droppedPoints === run.result.points && history.sessionStatus === 'stopped', history);
  verify('Live digital: exact source changes are retained', same(history.inputChanges.map(change => ({ timeTick: tick(change.time), updates: change.updates })), [{ timeTick: 17300000000, updates: [{ id: source.id, value: '0' }] }, { timeTick: 17400000000, updates: [{ id: source.id, value: '1' }] }]));
  const expectedInput = [{ time: history.windowStart, value: source.params.state }, ...history.inputChanges.map(change => ({ time: change.time, value: change.updates.find(update => update.id === source.id).value }))];
  verify('Live digital: sparse source events match the independent input-history reconstruction', same(input, expectedInput));
  const delayTicks = tick(parseValue(inverter.params.delay, 's'));
  const expectedNot = expectedInput.map((event, index) => ({ timeTick: tick(event.time) + (index ? delayTicks : 0), value: event.value === '1' ? '0' : '1' }));
  verify('Live digital: both NOT edges preserve the configured 10 ns delay', delayTicks === 10000 && same(outputEvents.map(event => ({ timeTick: tick(event.time), value: event.value })), expectedNot), { propagationDelaySeconds: delayTicks * 1e-12, inputEvents: input, outputEvents });
  for (const [time, expected] of [[.0173 - 1e-12, ['1', '0']], [.0173, ['0', '0']], [.01730001, ['0', '1']], [.0174, ['1', '1']], [.01740001, ['1', '0']]]) verify(`Live digital: indicators at ${time} s`, same(lamps(snapshot, run, time).map(lamp => lamp.value), expected));
  verify('Live digital: latest retained indicators are HIGH/LOW', same(lamps(envelope.project, run).map(lamp => lamp.value), ['1', '0']));
  verify('Live digital: a time before the retained window is unavailable', lamps(snapshot, run, history.windowStart - 1e-12).every(lamp => !lamp.available && !lamp.on));
  for (const finiteRun of envelope.runs.filter(item => !item.result.continuous)) {
    const state = finiteRun.projectSnapshot.circuit.components.find(item => item.type === 'DVS').params.state;
    verify(`${finiteRun.id}: bounded source and NOT are complementary`, same(lamps(finiteRun.projectSnapshot, finiteRun).map(lamp => lamp.value), [state, state === '1' ? '0' : '1']));
  }
  report.continuousDigital = { runId: run.id, ...history, sourceEvents: input, inverterEvents: outputEvents, propagationDelaySeconds: delayTicks * 1e-12, latestIndicators: lamps(envelope.project, run) };
}

// For this grounded, unloaded series-R/shunt-C network, Kirchhoff's law and
// backward Euler give Vc[n] = (RC*Vc[n-1] + dt*Vs[n]) / (RC + dt).
{
  const envelope = loaded.get(files[1]);
  verify('Voltage levels: three preserved 5 V, 5 V, 3.3 V runs', same(envelope.runs.map(run => run.projectSnapshot.circuit.components.find(item => item.type === 'DVS').params.high), ['5', '5', '3.3']));
  verify('Voltage levels: observed point counts remain 503, 503, 502', same(envelope.runs.map(run => run.result.points), [503, 503, 502]));
  for (const run of envelope.runs) {
    const project = run.projectSnapshot, parts = project.circuit.components, source = parts.find(item => item.type === 'DVS'), resistor = parts.find(item => item.type === 'R'), capacitor = parts.find(item => item.type === 'C'), adc = parts.find(item => item.type === 'ADC');
    const nets = buildNets(project).endpointToNet, node = (part, pin) => nets[`${part.id}:${pin}`];
    verify(`${run.id}: independent RC topology assumptions`, parts.length === 7 && parts.filter(item => item.type === 'DLED').length === 2 && node(source, 'n') === '0' && node(capacitor, '2') === '0' && node(adc, 'ref') === '0' && node(source, 'p') === node(resistor, '1') && node(resistor, '2') === node(capacitor, '1') && node(adc, 'in') === node(capacitor, '1') && project.analysis.uic && adc.params.mode === 'schmitt');
    const times = vector(run, 'time'), drive = vector(run, `v(${node(source, 'p')})`), voltage = vector(run, `v(${node(capacitor, '1')})`), command = vector(run, `d(${node(source, 'out')})`), threshold = vector(run, `d(${node(adc, 'out')})`);
    const resistance = parseValue(resistor.params.value, 'Ω'), capacitance = parseValue(capacitor.params.value, 'F'), tau = resistance * capacitance, level = parseValue(source.params.high, 'V');
    verify(`${run.id}: configured source voltage and initial conditions`, source.params.state === '1' && source.params.outputMode === 'logic-voltage' && drive.every(value => value === level) && command.every(value => value === '1') && voltage[0] === parseValue(capacitor.params.ic, 'V') && times[0] === 0 && tick(times.at(-1)) === 5000000000);
    let recurrence = parseValue(capacitor.params.ic, 'V'), maximumRecurrenceError = 0;
    for (let index = 1; index < times.length; index++) { const dt = times[index] - times[index - 1]; recurrence = (tau * recurrence + dt * level) / (tau + dt); maximumRecurrenceError = Math.max(maximumRecurrenceError, Math.abs(recurrence - voltage[index])); }
    verify(`${run.id}: every capacitor sample agrees with independent backward-Euler recurrence`, maximumRecurrenceError <= 1e-10, { points: times.length, maximumAbsoluteErrorVolts: maximumRecurrenceError, toleranceVolts: 1e-10, timeConstantSeconds: tau });
    const branch = run.result.vectors.find(item => item.unit === 'A');
    const maximumCurrentError = Math.max(...branch.values.map((current, index) => Math.abs(current - (voltage[index] - drive[index]) / resistance)));
    verify(`${run.id}: source current agrees with independent Ohm law`, maximumCurrentError <= 1e-12, { maximumAbsoluteErrorAmps: maximumCurrentError, toleranceAmps: 1e-12, direction: 'Current into source positive terminal; delivered current is negative.' });
    let state = 'X'; const low = parseValue(adc.params.low, 'V'), high = parseValue(adc.params.high, 'V'), expectedThreshold = voltage.map(value => { if (value <= low) state = '0'; else if (value >= high) state = '1'; return state; });
    verify(`${run.id}: every Schmitt state follows independently applied thresholds`, same(threshold, expectedThreshold));
    const expectedFinal = level >= high ? ['1', '1'] : ['1', '0'];
    verify(`${run.id}: final indicators agree with voltage range and Schmitt threshold`, same(lamps(project, run).map(lamp => lamp.value), expectedFinal));
    const thresholdEvents = trace(run, `d(${node(adc, 'out')})`);
    verify(`${run.id}: recorded threshold timing or absent crossing matches range`, level === 5 ? thresholdEvents.length === 2 && tick(thresholdEvents[1].time) === 1209973626 : thresholdEvents.length === 1 && thresholdEvents[0].value === '0', { thresholdEvents });
    report.analogChecks.push({ runId: run.id, highVoltage: level, points: times.length, timeConstantSeconds: tau, finalCapacitorVoltage: voltage.at(-1), maximumRecurrenceErrorVolts: maximumRecurrenceError, maximumCurrentErrorAmps: maximumCurrentError, thresholdEvents, finalIndicators: lamps(project, run) });
  }
  const active = envelope.runs.find(run => run.id === envelope.activeRunId);
  verify('Voltage levels: current 3.3 V project remains direct HIGH and sensed LOW', same(lamps(envelope.project, active).map(lamp => lamp.value), ['1', '0']));
}

{
  const envelope = loaded.get(files[2]), run = envelope.runs.find(item => item.id === envelope.activeRunId), project = run.projectSnapshot, nets = buildNets(project).endpointToNet, cursor = .001481650892211237;
  verify('Four-state patterns: four indicators and a complete 4.5 ms result', envelope.runs.length === 1 && run.result.points === 6 && tick(vector(run, 'time').at(-1)) === 4500000000 && project.circuit.components.filter(item => item.type === 'DLED').length === 4);
  for (const source of project.circuit.components.filter(item => item.type === 'PATTERN')) {
    const expected = source.params.pattern.split(';').map(row => { const [time, value] = row.trim().split(','); return { time: parseValue(time, 's'), value }; });
    verify(`${source.ref}: every sparse event equals the authored scalar pattern`, source.params.width === '1' && source.params.repeat === '0' && same(trace(run, `d(${nets[`${source.id}:out`]})`), expected));
  }
  verify('Four-state patterns: retained-end states are 1, 0, X, Z with exactly one high lamp', same(lamps(project, run).map(lamp => lamp.value), ['1', '0', 'X', 'Z']) && lamps(project, run).filter(lamp => lamp.on).length === 1);
  verify('Four-state patterns: captured Cursor A reads 0, X, Z, 1', same(lamps(project, run, cursor).map(lamp => lamp.value), ['0', 'X', 'Z', '1']) && lamps(project, run, cursor).filter(lamp => lamp.on).length === 1, { cursorSeconds: cursor });
  verify('Four-state patterns: exact 1 ms event is right-continuous', same(lamps(project, run, .001 - 1e-12).map(lamp => lamp.value), ['1', '0', 'X', 'Z']) && same(lamps(project, run, .001).map(lamp => lamp.value), ['0', 'X', 'Z', '1']));
  report.fourStateIndicators = { runId: run.id, latest: lamps(project, run), observedCursor: { time: cursor, indicators: lamps(project, run, cursor) } };
}

report.dependencies = {};
const pending = ['src/storage.js', 'src/model.js', 'src/library.js', 'src/displays.js'];
while (pending.length) {
  const file = pending.pop(); if (report.dependencies[file]) continue;
  const bytes = await fs.readFile(path.join(root, file)); report.dependencies[file] = hash(bytes);
  for (const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)) pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1])));
}
report.verifier = { file: 'scripts/verify-logic-io-evidence.mjs', sha256: hash(await fs.readFile(fileURLToPath(import.meta.url))) };
try { const manifest = JSON.parse(await fs.readFile(path.join(root, 'dist/release-manifest.json'))); report.localDistribution = { version: manifest.version, buildHash: manifest.buildHash, scope: 'Current local distribution, not a browser-capture build assertion. The downloaded backups do not contain a runtime build hash.' }; } catch { /* An unbuilt checkout can still verify evidence. */ }
report.summary = { artifacts: report.artifacts.length, capturedRuns: report.artifacts.reduce((total, artifact) => total + artifact.runs.length, 0), jsonRoundTrips: files.length * 3, rcRuns: report.analogChecks.length, rcSamples: report.analogChecks.reduce((total, check) => total + check.points, 0), sourceDependencies: Object.keys(report.dependencies).length, passedChecks: report.checks.filter(check => check.passed).length, failedChecks: report.checks.filter(check => !check.passed).length };
report.status = report.summary.failedChecks ? 'failed' : finalize ? 'passed' : 'passed-provisional';
if (finalize) await fs.writeFile(path.join(root, output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, summary: report.summary, maximumRecurrenceErrorVolts: Math.max(...report.analogChecks.map(check => check.maximumRecurrenceErrorVolts)), ...(finalize ? { output } : { note: 'Read-only verification; use --finalize to write the captured-artifact and dependency hashes.' }) }, null, 2));
if (report.summary.failedChecks) process.exitCode = 1;
