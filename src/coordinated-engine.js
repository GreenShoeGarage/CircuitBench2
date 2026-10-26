import { COORDINATED_ENGINE_INFO, COORDINATED_LIMITS } from './coordinated.js';
import { mergeCoordinatedChunks, validateCoordinatedResult } from './coordinated-results.js';
export { COORDINATED_ENGINE_INFO };
const protocol = 'circuitbench-coordinated-worker-1';
const failure = (message, code = 'COORDINATED_FAILED', status = 'failed', fields = {}) => Object.assign(new Error(message), { code, status, phase: 'coordinated-simulation', ...fields });

/** Keeps solver state in one worker until explicit close, failure or Stop.
 * Each command has its own watchdog. Paused sessions have no running command.
 */
export class CoordinatedEngine {
  constructor({ workerFactory = (url, options) => new Worker(url, options) } = {}) {
    this.workerFactory = workerFactory; this.active = null; this.sequence = 0;
  }
  get running() { return Boolean(this.active); }
  get busy() { return Boolean(this.active?.pending); }
  async start(plan, { timeoutMs = 15000, onLog = () => {}, onFailure = () => {} } = {}) {
    if (this.active) throw failure('A coordinated session is already open. Stop it before starting another.', 'COORDINATED_BUSY');
    const url = new URL('./coordinated-worker.js', import.meta.url);
    let worker;
    try { worker = this.workerFactory(url, { type: 'module', name: 'CircuitBench coordinated transient' }); }
    catch (error) { throw failure(`Cannot start the coordinated worker at ${url.href}: ${error.message}`, 'COORDINATED_WORKER_START', 'failed', { phase: 'worker-startup', assetUrl: url.href }); }
    const job = { worker, url, pending: null, ready: false, timeoutMs, onLog, onFailure, logs: [], terminated: false };
    this.active = job;
    worker.onmessage = ({ data }) => {
      if (this.active !== job) return;
      if (data?.type === 'ready') {
        if (job.ready || data.protocol !== protocol) { this.abort(failure('Coordinated worker protocol mismatch. Refresh the matching application files.', 'COORDINATED_PROTOCOL')); return; }
        job.ready = true; const message = `Coordinated worker ready: ${protocol}`; job.logs.push(message); this.deliverLog(job, message);
        if (job.pending?.type === 'initialize') this.send(job.pending);
      } else if (data?.type === 'log') {
        const text = String(data.message).slice(0,4000); if (job.logs.length < 1000) job.logs.push(text); this.deliverLog(job, text);
      } else if (job.pending && data?.id === job.pending.id && data?.type === 'result') {
        if (!job.ready || !job.pending.sent) { this.abort(failure('Coordinated worker replied before completing its ready handshake.', 'COORDINATED_PROTOCOL')); return; }
        const pending = job.pending; job.pending = null; clearTimeout(pending.timer); pending.resolve(data.result);
      } else if (job.pending && data?.id === job.pending.id && data?.type === 'error') {
        this.abort(failure(data.message || 'Coordinated simulation failed.', data.code, 'failed', { phase: data.phase }));
      }
    };
    worker.onerror = event => { event.preventDefault?.(); if (this.active === job) this.abort(failure(`Coordinated worker failed at ${event.filename || url.href}: ${event.message || 'The browser did not provide a reason.'}`, 'COORDINATED_WORKER_ERROR', 'failed', { phase: job.ready ? 'coordinated-simulation' : 'worker-startup', assetUrl: event.filename || url.href })); };
    worker.onmessageerror = () => { if (this.active === job) this.abort(failure('Coordinated worker results could not be transferred.', 'COORDINATED_TRANSFER')); };
    return this.request('initialize', { plan });
  }
  deliverLog(job, message) {
    if (this.active !== job) return;
    try { job.onLog(message); }
    catch (error) { if (this.active === job) this.abort(failure(`The simulation log callback failed: ${error.message}`, 'COORDINATED_CALLBACK')); }
  }
  send(pending) {
    if (!this.active || this.active.pending !== pending || pending.sent) return;
    pending.sent = true;
    try { this.active.worker.postMessage({ ...pending.payload, type: pending.type, id: pending.id }); }
    catch (error) { this.abort(failure(`The coordinated request could not be transferred: ${error.message}`, 'COORDINATED_TRANSFER')); }
  }
  request(type, payload, { timeoutMs } = {}) {
    const job = this.active;
    if (!job) return Promise.reject(failure('The coordinated session has ended.', 'COORDINATED_CLOSED'));
    if (job.pending) return Promise.reject(failure('Wait for the current coordinated step to finish.', 'COORDINATED_BUSY'));
    return new Promise((resolve, reject) => {
      const pending = { type, payload, id: ++this.sequence, resolve, reject, sent: false };
      const timeout = Math.max(1, Math.min(60000, Number(timeoutMs ?? job.timeoutMs) || 15000));
      pending.timer = setTimeout(() => { if (this.active === job && job.pending === pending) this.abort(failure('The coordinated command exceeded its time limit. Its worker was terminated.', 'COORDINATED_TIMEOUT', 'timed-out')); }, timeout);
      job.pending = pending;
      if (job.ready) this.send(pending);
    });
  }
  advanceTo(end, { maxSteps = 2000, timeoutMs, trigger = null, stopOnEvent = false } = {}) { return this.request('advance', { end, maxSteps, trigger, stopOnEvent }, { timeoutMs }); }
  setInputs(updates, { trigger = null, ...options } = {}) { return this.request('inputs', { updates, trigger }, options); }
  async run(plan, { timeoutMs = 30000, onLog = () => {} } = {}) {
    if (this.active) throw failure('A coordinated session is already open. Stop it before starting another.', 'COORDINATED_BUSY');
    const started = performance.now(), timeout = Math.max(1, Math.min(60000, Number(timeoutMs) || 30000));
    const initialized = this.start(plan, { timeoutMs: timeout, onLog }), owned = this.active;
    try {
      await initialized;
      let result = null, at = 0;
      const target = Math.round(plan.duration / 1e-12) * 1e-12;
      while (true) {
        if (this.active !== owned) throw failure('The coordinated run was stopped.', 'COORDINATED_CANCELLED', 'cancelled');
        const remaining = timeout - (performance.now() - started);
        if (!(remaining > 0)) throw failure('The coordinated run exceeded its total time limit.', 'COORDINATED_TIMEOUT', 'timed-out');
        const chunk = await this.advanceTo(target, { maxSteps: COORDINATED_LIMITS.stepsPerChunk, timeoutMs: remaining });
        if (this.active !== owned) throw failure('The coordinated run was stopped.', 'COORDINATED_CANCELLED', 'cancelled');
        const bounds = validateCoordinatedResult(chunk);
        if (bounds.start !== at || !(bounds.end > at) || bounds.end > target || chunk.done !== (bounds.end === target)) throw failure('The coordinated solver returned an inconsistent or nonadvancing chunk.', 'COORDINATED_STALLED');
        result = mergeCoordinatedChunks(result, chunk); at = bounds.end;
        if (chunk.done) break;
      }
      if (performance.now() - started > timeout) throw failure('The coordinated run exceeded its total time limit.', 'COORDINATED_TIMEOUT', 'timed-out');
      return { ...result, durationMs: performance.now() - started, logs: [...(owned?.logs ?? []), ...(result.logs ?? [])] };
    } finally { if (owned && this.active === owned) this.close(); }
  }
  abort(error) {
    const job = this.active; if (!job) return false;
    this.active = null;
    if (job.pending) { clearTimeout(job.pending.timer); error.logs = [...job.logs, ...(error.logs ?? [])]; job.pending.reject(error); job.pending = null; }
    if (!job.terminated) { job.terminated = true; try { job.worker.terminate(); } catch {} }
    if (error.status !== 'cancelled') { try { job.onFailure(error); } catch {} }
    return true;
  }
  close() { return this.abort(failure('The coordinated session was closed.', 'COORDINATED_CLOSED', 'cancelled')); }
  stop() { return this.abort(failure('Stopped. The coordinated worker and its computation were terminated.', 'COORDINATED_CANCELLED', 'cancelled')); }
}
