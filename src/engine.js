/** Bounded, replaceable browser-worker adapter. No numerical approximation lives here. */
export const WORKER_PROTOCOL = 'circuitbench-worker-protocol-4';
export const ENGINE_INFO = Object.freeze({
  name: 'ngspice', version: '45.2', build: 'Sat Sep 5 01:00:10 UTC 2026',
  package: 'EEcircuit-engine', packageVersion: '1.8.0', adapterVersion: 4,
  wasmSha256: 'ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4',
  wasmBytes: 6133055,
  execution: 'WebAssembly · isolated Web Worker · fresh instance per run',
});

async function readResponsePrefix(response, limit = 65536) {
  if (!response.body?.getReader) return new Uint8Array(await response.arrayBuffer()).subarray(0, limit);
  const reader = response.body.getReader(), parts = []; let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read(); if (done) break;
      const part = value.subarray(0, limit - size); parts.push(part); size += part.length;
    }
  } finally { reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

/** Inspect the same worker URL after opaque startup failure; never execute fetched text. */
export async function inspectWorkerStartup(url, { fetchImpl = globalThis.fetch, signal, timeoutMs = 1800 } = {}) {
  const assetUrl = String(url), controller = new AbortController();
  const aborted = () => Object.assign(new Error('Worker response inspection cancelled.'), { name: 'AbortError' });
  if (signal?.aborted) throw aborted();
  let timer, onAbort;
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => { resolve({ assetUrl, timedOut: true }); controller.abort(); }, Math.max(1, Math.min(2000, timeoutMs)));
    onAbort = () => { reject(aborted()); controller.abort(); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  const inspect = (async () => {
    try {
      const response = await fetchImpl(assetUrl, { cache: 'reload', mode: 'same-origin', credentials: 'same-origin', signal: controller.signal });
      const bytes = await readResponsePrefix(response), text = new TextDecoder().decode(bytes);
      const contentType = response.headers?.get('content-type') || '(not provided)';
      return { assetUrl, responseUrl: response.url || assetUrl, httpStatus: response.status, contentType,
        cacheControl: response.headers?.get('cache-control') || '', bytesInspected: bytes.length,
        html: /\btext\/html\b/i.test(contentType) || /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(text),
        protocolFound: text.includes(WORKER_PROTOCOL), javascriptMime: /(?:java|ecma)script|text\/(?:jscript|livescript)/i.test(contentType) };
    } catch (error) {
      if (controller.signal.aborted) throw error;
      return { assetUrl, inspectionError: error?.message || String(error) };
    }
  })();
  try { return await Promise.race([inspect, deadline]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); controller.abort(); }
}

function inspectionMessage(report) {
  if (report.timedOut) return 'The reload inspection did not complete within 1.8 seconds. The original worker-startup cause remains unknown. Try Run again or refresh the browser.';
  if (report.inspectionError) return `The reload inspection could not read that URL: ${report.inspectionError}. The original worker-startup cause remains unknown. Try Run again or refresh the browser.`;
  const response = `Reload inspection: HTTP ${report.httpStatus}; Content-Type ${report.contentType}; current worker protocol marker ${report.protocolFound ? 'found' : 'not found'}.`;
  if (report.httpStatus < 200 || report.httpStatus >= 300) return `${response} This request did not return a successful worker response. Serve the complete deployable folder; for a source checkout, build and serve dist/.`;
  if (report.html) return `${response} This inspection returned HTML instead of worker JavaScript. Check for a missing-file page or route fallback.`;
  if (!report.javascriptMime) return `${response} The inspected response does not identify a JavaScript MIME type. Check the server's content type for this worker URL.`;
  if (!report.protocolFound) return `${response} This response does not contain the expected protocol ${WORKER_PROTOCOL}; it may be an older or different worker file. Refresh the browser or use this installation's repair page.`;
  return `${response} The inspected response has the expected MIME and protocol marker, but the original worker-startup cause remains unknown. Try Run again or refresh the browser.`;
}

export class CircuitEngine {
  constructor() { this.active = null; }
  run(netlist, { timeoutMs = 15000, onLog = () => {} } = {}) {
    if (this.active) return Promise.reject(Object.assign(new Error('A simulation is already running. Stop it before starting another.'), { status: 'failed' }));
    if (typeof netlist !== 'string' || netlist.length > 256000) return Promise.reject(Object.assign(new Error('Netlist must be text smaller than 256 kB.'), { status: 'failed' }));
    const timeout = Math.max(100, Math.min(60000, Number(timeoutMs) || 15000));
    return new Promise((resolve, reject) => {
      const workerUrl = new URL('./engine-worker.js', import.meta.url);
      let worker, phase = 'worker-startup', assetUrl = workerUrl.href, terminated = false, diagnosing = false, inspectionController;
      const loadingLogs = [];
      try { worker = new Worker(workerUrl, { type: 'module', name: 'CircuitBench ngspice' }); }
      catch (cause) { reject(Object.assign(new Error(`Cannot start the simulation worker at ${workerUrl.href}: ${cause.message}. Serve the complete deployable folder over HTTP(S), not file://. For a source checkout, build and serve dist/.`), { status: 'failed', code: 'ENGINE_WORKER_START', phase, assetUrl, logs: loadingLogs })); return; }
      const terminate = () => { if (!terminated) { terminated = true; worker.terminate(); } };
      const finish = (error, result) => {
        if (!this.active || this.active.worker !== worker) return;
        clearTimeout(this.active.timer);
        inspectionController?.abort();
        terminate(); // Always release the WASM instance, heap and virtual filesystem, exactly once.
        this.active = null;
        error ? reject(error) : resolve(result);
      };
      this.active = { worker, finish, timer: setTimeout(() => finish(Object.assign(new Error(`Simulation exceeded its ${timeout / 1000} s time limit during ${phase}. The worker was terminated. Last asset: ${assetUrl}. Check loading diagnostics or reduce the analysis size.`), { status: 'timed-out', phase, assetUrl, logs: loadingLogs })), timeout) };
      worker.onmessage = ({ data }) => {
        if (!this.active || this.active.worker !== worker || diagnosing) return;
        if (data?.type === 'ready') {
          if (data.protocol !== WORKER_PROTOCOL) { finish(Object.assign(new Error(`The worker at ${workerUrl.href} reported protocol ${String(data.protocol)}, expected ${WORKER_PROTOCOL}. Refresh this installation to load matching application files.`), { status: 'failed', code: 'ENGINE_WORKER_PROTOCOL', phase, assetUrl: workerUrl.href, logs: loadingLogs })); return; }
          phase = 'worker-ready';
          const message = `Simulation worker ready: ${WORKER_PROTOCOL}; ${workerUrl.href}`;
          loadingLogs.push(message); onLog(message); return;
        }
        if (data?.type === 'log') { phase = data.phase || phase; assetUrl = data.assetUrl || assetUrl; loadingLogs.push(String(data.message)); onLog(String(data.message)); return; }
        if (data?.type === 'result') finish(null, { ...data.result, engine: { ...ENGINE_INFO, ...data.result.engine } });
        else if (data?.type === 'error') finish(Object.assign(new Error(data.message || 'ngspice failed.'), { status: 'failed', logs: data.logs || loadingLogs,
          code: data.code, phase: data.phase || phase, assetUrl: data.assetUrl || assetUrl, httpStatus: data.httpStatus, contentType: data.contentType }));
      };
      worker.onerror = (event) => {
        event.preventDefault?.(); if (!this.active || this.active.worker !== worker || diagnosing) return;
        const failedUrl = event.filename || assetUrl;
        const failure = Object.assign(new Error(`Simulation worker failed during ${phase} at ${failedUrl}: ${event.message || 'The browser did not provide a reason.'}`), { status: 'failed', code: 'ENGINE_WORKER_ERROR', phase, assetUrl: failedUrl, logs: loadingLogs });
        if (phase !== 'worker-startup' || loadingLogs.length || String(event.message || '').trim()) { finish(failure); return; }
        terminate(); // A failed bootstrap must not remain alive while its response is inspected.
        diagnosing = true; inspectionController = new AbortController();
        inspectWorkerStartup(workerUrl, { signal: inspectionController.signal }).then(report => {
          if (!this.active || this.active.worker !== worker) return;
          failure.message += ' ' + inspectionMessage(report);
          failure.httpStatus = report.httpStatus; failure.contentType = report.contentType;
          failure.workerProtocolFound = report.protocolFound; failure.inspectionTimedOut = Boolean(report.timedOut);
          failure.logs = [...loadingLogs, inspectionMessage(report)]; finish(failure);
        }).catch(error => {
          if (!this.active || this.active.worker !== worker) return;
          failure.message += ` Response inspection failed: ${error?.message || String(error)}. The original startup cause remains unknown.`;
          finish(failure);
        });
      };
      worker.onmessageerror = () => { if (!diagnosing) finish(Object.assign(new Error('The simulation result could not be transferred from the worker.'), { status: 'failed' })); };
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
