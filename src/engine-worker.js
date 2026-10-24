/* Dedicated, disposable worker. Curated models are supplied explicitly in the netlist. */
import { Simulation } from '../engine/eecircuit-engine.mjs';
const unit = { voltage: 'V', current: 'A', time: 's', frequency: 'Hz', notype: '' };
let sim, sent = false;
const logs = () => sim ? [...new Set((sim.getInfo() + '\n' + sim.getError().join('\n')).split('\n').filter(Boolean))] : [];
function fail(error) {
  if (sent) return;
  sent = true;
  self.postMessage({ type: 'error', message: error?.message || String(error), logs: logs() });
}
self.addEventListener('unhandledrejection', event => { event.preventDefault(); fail(event.reason); });
self.onmessage = async ({ data }) => {
  if (data?.type !== 'run' || sim) return;
  try {
    self.postMessage({ type: 'log', message: 'Loading local ngspice WebAssembly…' });
    sim = new Simulation();
    await sim.start();
    self.postMessage({ type: 'log', message: 'ngspice is calculating in a separate worker…' });
    sim.setNetList(data.netlist);
    const started = performance.now();
    const raw = await sim.runSim();
    const allLogs = logs();
    const fatal = allLogs.filter(line => /(?:^|\b)(?:error|fatal)\s*:|simulation(?:\(s\))? aborted|timestep too small|doAnalyses:|unknown (?:device|subckt)|no such (?:model|parameter)|unknown parameter/i.test(line));
    if (fatal.length) throw new Error(`ngspice did not complete: ${fatal.slice(0, 5).join(' · ')}`);
    if (!Array.isArray(raw?.data) || !raw.numPoints) throw new Error('ngspice returned no numerical data. Check ground, connectivity, model names and analysis settings.');
    if (raw.numPoints > 250000 || raw.numVariables > 256 || raw.numPoints * raw.numVariables > 2000000) throw new Error('Simulation result exceeds the 2 million sample safety limit. Reduce points, time range, or saved vectors.');
    const vectors = raw.data.map(vector => {
      const complex = raw.dataType === 'complex';
      const values = vector.values.map(value => complex ? value.real : value);
      const imag = complex ? vector.values.map(value => value.img) : undefined;
      if (values.length !== raw.numPoints || values.some(value => !Number.isFinite(value)) || imag?.some(value => !Number.isFinite(value))) throw new Error(`ngspice produced incomplete or non-finite data for ${vector.name}. Results were not accepted.`);
      return { name: vector.name, unit: unit[vector.type] ?? '', values, ...(complex ? { imag } : {}) };
    });
    const warnings = allLogs.filter(line => /warn|gmin stepping|source stepping|singular matrix|convergence/i.test(line));
    sent = true;
    self.postMessage({ type: 'result', result: { vectors, logs: allLogs, warnings, header: raw.header, durationMs: performance.now() - started, points: raw.numPoints,
      engine: { startup: sim.getInitInfo() } } });
  } catch (error) { fail(error); }
};
