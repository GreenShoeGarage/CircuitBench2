import { DIGITAL_ENGINE_INFO } from './digital.js';
export { DIGITAL_ENGINE_INFO };
const protocol = 'circuitbench-digital-worker-2';
const failure = (message, status = 'failed', fields = {}) => Object.assign(new Error(message), { status, phase: 'digital-simulation', ...fields });
/** The facade always disposes its worker, including successful and failed runs. */
export class DigitalEngine {
  constructor() { this.active = null; }
  run(plan, options = {}) { return this.execute('run', plan, options); }
  runTruthTable(plan, options = {}) { return this.execute('truth-table', plan, options); }
  execute(operation, plan, { sources = [], inputIds, outputNames, timeoutMs = 15000, onLog = () => {} } = {}) {
    if (this.active) return Promise.reject(failure('A digital simulation is already running.'));
    return new Promise((resolve, reject) => {
      const url = new URL('./digital-worker.js', import.meta.url), logs = [];
      let worker, terminated = false;
      try { worker = new Worker(url, { type: 'module', name: 'CircuitBench event logic' }); }
      catch (error) { reject(failure(`Cannot start the digital worker at ${url.href}: ${error.message}`, 'failed', { code: 'DIGITAL_WORKER_START', phase: 'worker-startup', assetUrl: url.href })); return; }
      const finish = (error, result) => {
        if (this.active?.worker !== worker) return;
        clearTimeout(this.active.timer);
        if (!terminated) { terminated = true; worker.terminate(); }
        this.active = null;
        if (error) { error.logs = [...logs, ...(error.logs || [])]; reject(error); }
        else resolve({ ...result, logs: [...logs, ...result.logs] });
      };
      const timeout = Math.max(1, Math.min(60000, Number(timeoutMs) || 15000));
      this.active = { worker, finish, timer: setTimeout(() => finish(failure('Digital simulation exceeded its time limit. The worker was terminated.', 'timed-out', { code: 'DIGITAL_TIMEOUT' })), timeout) };
      worker.onmessage = ({ data }) => {
        if (this.active?.worker !== worker) return;
        if (data?.type === 'ready') { if (data.protocol !== protocol) { finish(failure('Digital worker protocol mismatch. Refresh matching application files.', 'failed', { code: 'DIGITAL_WORKER_PROTOCOL' })); return; } const message = `Digital worker ready: ${protocol}; ${url.href}`; logs.push(message); onLog(message); }
        else if (data?.type === 'log') { logs.push(String(data.message)); onLog(String(data.message)); }
        else if (data?.type === 'result') finish(null, data.result);
        else if (data?.type === 'error') finish(failure(data.message || 'Digital simulation failed.', 'failed', { code: data.code, phase: data.phase }));
      };
      worker.onerror = event => { event.preventDefault?.(); finish(failure(`Digital worker failed at ${event.filename || url.href}: ${event.message || 'The browser did not provide a reason.'}`, 'failed', { code: 'DIGITAL_WORKER_ERROR', phase: 'worker-startup', assetUrl: event.filename || url.href })); };
      worker.onmessageerror = () => finish(failure('Digital simulation results could not be transferred.', 'failed', { code: 'DIGITAL_TRANSFER' }));
      try { worker.postMessage({ type: operation, plan, sources, inputIds, outputNames }); } catch (error) { finish(failure(`Digital plan could not be transferred: ${error.message}`)); }
    });
  }
  stop() { if (!this.active) return false; this.active.finish(failure('Cancelled. The digital worker and computation were terminated.', 'cancelled', { code: 'DIGITAL_CANCELLED' })); return true; }
  get running() { return Boolean(this.active); }
}
