/** Bounded, replaceable browser-worker adapter. No numerical approximation lives here. */
export const ENGINE_INFO = Object.freeze({
  name: 'ngspice', version: '45.2', build: 'Sat Sep 5 01:00:10 UTC 2026',
  package: 'EEcircuit-engine', packageVersion: '1.8.0', adapterVersion: 2,
  wasmSha256: 'ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4',
  execution: 'WebAssembly · isolated Web Worker · fresh instance per run',
});
export class CircuitEngine {
  constructor() { this.active = null; }
  run(netlist, { timeoutMs = 15000, onLog = () => {} } = {}) {
    if (this.active) return Promise.reject(Object.assign(new Error('A simulation is already running. Stop it before starting another.'), { status: 'failed' }));
    if (typeof netlist !== 'string' || netlist.length > 256000) return Promise.reject(Object.assign(new Error('Netlist must be text smaller than 256 kB.'), { status: 'failed' }));
    const timeout = Math.max(100, Math.min(60000, Number(timeoutMs) || 15000));
    return new Promise((resolve, reject) => {
      let worker;
      try { worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module', name: 'CircuitBench ngspice' }); }
      catch (cause) { reject(Object.assign(new Error(`Cannot start simulation worker: ${cause.message}. Serve this app over HTTP(S), not file://.`), { status: 'failed' })); return; }
      const finish = (error, result) => {
        if (!this.active || this.active.worker !== worker) return;
        clearTimeout(this.active.timer);
        worker.terminate(); // Always release the WASM instance, heap and virtual filesystem.
        this.active = null;
        error ? reject(error) : resolve(result);
      };
      this.active = { worker, finish, timer: setTimeout(() => finish(Object.assign(new Error(`Simulation exceeded its ${timeout / 1000} s time limit. The worker was terminated; reduce the time range, increase the step, or inspect convergence diagnostics.`), { status: 'timed-out' })), timeout) };
      worker.onmessage = ({ data }) => {
        if (data?.type === 'log') { onLog(String(data.message)); return; }
        if (data?.type === 'result') finish(null, { ...data.result, engine: { ...ENGINE_INFO, ...data.result.engine } });
        else if (data?.type === 'error') finish(Object.assign(new Error(data.message || 'ngspice failed.'), { status: 'failed', logs: data.logs || [] }));
      };
      worker.onerror = (event) => { event.preventDefault?.(); finish(Object.assign(new Error(`Simulation worker failed: ${event.message || 'WebAssembly could not load. Check that all engine files are present.'}`), { status: 'failed' })); };
      worker.onmessageerror = () => finish(Object.assign(new Error('The simulation result could not be transferred from the worker.'), { status: 'failed' }));
      worker.postMessage({ type: 'run', netlist });
    });
  }
  stop() {
    if (!this.active) return false;
    this.active.finish(Object.assign(new Error('Cancelled. The simulation worker and its computation were terminated.'), { status: 'cancelled' }));
    return true;
  }
  get running() { return Boolean(this.active); }
}
