/* Dedicated, disposable worker. No static imports: load failures must be caught. */
export const WORKER_PROTOCOL = 'circuitbench-worker-protocol-4';
export const WASM_BYTE_LENGTH = 6133055;
const WASM_HEADER = [0, 97, 115, 109, 1, 0, 0, 0];
const serveHelp = 'Serve the complete deployable folder over HTTP(S). For a source checkout, run node scripts/build.mjs and serve dist/.';
const messageOf = error => error?.message || String(error);
const contentTypeOf = response => response?.headers?.get('content-type') || '(not provided)';
const responseDescription = response => `HTTP ${response.status}${response.statusText ? ' ' + response.statusText : ''}; Content-Type ${contentTypeOf(response)}`;
const isHTML = (bytes, contentType) => /\btext\/html\b/i.test(contentType) || /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(new TextDecoder().decode(bytes.subarray(0, 256)));

function assetError(message, { phase, assetUrl, code, response } = {}) {
  return Object.assign(new Error(message), { phase, assetUrl: String(assetUrl), code,
    ...(response ? { httpStatus: response.status, contentType: contentTypeOf(response) } : {}) });
}

/** Read bytes directly: valid WASM works even when a static host supplies generic MIME. */
export async function loadWasmBinary(url, { fetchImpl = globalThis.fetch, expectedBytes = WASM_BYTE_LENGTH } = {}) {
  const assetUrl = String(url), phase = 'loading-wasm';
  let response;
  try { response = await fetchImpl(assetUrl, { credentials: 'same-origin', mode: 'same-origin' }); }
  catch (error) { throw assetError(`Could not fetch WebAssembly at ${assetUrl}: ${messageOf(error)}. ${serveHelp}`, { phase, assetUrl, code: 'ENGINE_WASM_FETCH' }); }
  if (!response.ok) throw assetError(`WebAssembly request failed at ${assetUrl}: ${responseDescription(response)}. ${serveHelp}`, { phase, assetUrl, code: 'ENGINE_WASM_HTTP', response });
  let bytes;
  try { bytes = new Uint8Array(await response.arrayBuffer()); }
  catch (error) { throw assetError(`Could not read WebAssembly response at ${assetUrl} (${responseDescription(response)}): ${messageOf(error)}.`, { phase, assetUrl, code: 'ENGINE_WASM_READ', response }); }
  if (!WASM_HEADER.every((value, index) => bytes[index] === value)) {
    const explanation = isHTML(bytes, contentTypeOf(response))
      ? 'The server returned an HTML page instead of WebAssembly; this can be a missing-file page, login page or route fallback.'
      : `The response is not a WebAssembly version-1 binary (${bytes.length} bytes received).`;
    throw assetError(`${explanation} URL: ${assetUrl}; ${responseDescription(response)}. ${serveHelp}`, { phase, assetUrl, code: 'ENGINE_WASM_FORMAT', response });
  }
  if (bytes.length !== expectedBytes) throw assetError(`WebAssembly at ${assetUrl} is incomplete or from a different engine build: expected ${expectedBytes} bytes, received ${bytes.length}; ${responseDescription(response)}. Upload the matching engine/spice.wasm from this release.`, { phase, assetUrl, code: 'ENGINE_WASM_SIZE', response });
  return { bytes, assetUrl, httpStatus: response.status, contentType: contentTypeOf(response) };
}

/** Import locally, then inspect the exact response if the browser rejects the module. */
export async function loadEngineModule(url, { importModule = value => import(value), fetchImpl = globalThis.fetch } = {}) {
  const assetUrl = String(url), phase = 'loading-engine-module';
  try { return await importModule(assetUrl); }
  catch (importError) {
    let response, bytes;
    try {
      response = await fetchImpl(assetUrl, { credentials: 'same-origin', mode: 'same-origin' });
      if (response.ok) bytes = new Uint8Array(await response.arrayBuffer());
    } catch (_) { /* The original import reason and exact URL remain useful. */ }
    const delivery = response ? responseDescription(response) : 'The response could not be inspected';
    let explanation = 'The local engine JavaScript could not be imported.';
    if (response && !response.ok) explanation = 'The local engine JavaScript request failed.';
    else if (bytes && isHTML(bytes, contentTypeOf(response))) explanation = 'The engine JavaScript URL returned HTML instead of a module.';
    else if (response && !/(?:java|ecma)script/i.test(contentTypeOf(response))) explanation = 'The engine JavaScript response does not have a JavaScript Content-Type; browsers reject that MIME type for modules.';
    throw assetError(`${explanation} URL: ${assetUrl}; ${delivery}. Browser detail: ${messageOf(importError)}. ${serveHelp}`, { phase, assetUrl, code: 'ENGINE_MODULE_LOAD', response });
  }
}

const unit = { voltage: 'V', current: 'A', time: 's', frequency: 'Hz', notype: '' };
const scope = typeof self !== 'undefined' && typeof self.postMessage === 'function' ? self : null;
let sim, started = false, sent = false, phase = 'worker-startup', currentAssetUrl = import.meta.url;
const loadingLogs = [];
const solverLogs = () => sim ? (sim.getInfo() + '\n' + sim.getError().join('\n')).split('\n').filter(Boolean) : [];
const logs = () => [...new Set([...loadingLogs, ...solverLogs()])];
function progress(message, nextPhase, assetUrl) {
  phase = nextPhase; currentAssetUrl = String(assetUrl || currentAssetUrl);
  loadingLogs.push(message);
  scope.postMessage({ type: 'log', message, phase, assetUrl: currentAssetUrl });
}
function fail(error) {
  if (sent) return;
  sent = true;
  scope.postMessage({ type: 'error', message: messageOf(error), logs: logs(),
    phase: error?.phase || phase, assetUrl: error?.assetUrl || currentAssetUrl,
    code: error?.code || 'ENGINE_RUN_FAILED', httpStatus: error?.httpStatus, contentType: error?.contentType });
}
if (scope) {
  scope.addEventListener('unhandledrejection', event => { event.preventDefault(); fail(event.reason); });
  scope.onmessage = async ({ data }) => {
    if (data?.type !== 'run' || started) return;
    started = true;
    const glueUrl = new URL('../engine/eecircuit-engine.js', import.meta.url);
    const wasmUrl = new URL('../engine/spice.wasm', import.meta.url);
    try {
      progress(`Loading local engine JavaScript: ${glueUrl.href}`, 'loading-engine-module', glueUrl);
      const { Simulation } = await loadEngineModule(glueUrl);
      if (typeof Simulation !== 'function') throw assetError(`Engine JavaScript at ${glueUrl.href} does not export Simulation. Upload the matching engine files from this release.`, { phase, assetUrl: glueUrl, code: 'ENGINE_MODULE_EXPORT' });
      progress(`Loading local WebAssembly: ${wasmUrl.href}`, 'loading-wasm', wasmUrl);
      const binary = await loadWasmBinary(wasmUrl);
      progress(`WebAssembly response validated: ${binary.bytes.length} bytes; HTTP ${binary.httpStatus}; Content-Type ${binary.contentType}.`, 'initializing-wasm', wasmUrl);
      sim = new Simulation({ wasmBinary: binary.bytes, wasmUrl: wasmUrl.href });
      try { await sim.start(); }
      catch (error) { throw assetError(`Could not initialize WebAssembly at ${wasmUrl.href}: ${messageOf(error)}. The downloaded binary passed its header and size checks.`, { phase: 'initializing-wasm', assetUrl: wasmUrl, code: 'ENGINE_WASM_START' }); }
      progress('ngspice is calculating in a separate worker…', 'simulating', wasmUrl);
      sim.setNetList(data.netlist);
      const runStarted = performance.now();
      const raw = await sim.runSim();
      const allLogs = logs();
      const fatal = solverLogs().filter(line => /(?:^|\b)(?:error|fatal)\s*:|simulation(?:\(s\))? aborted|timestep too small|doAnalyses:|unknown (?:device|subckt)|no such (?:model|parameter)|unknown parameter/i.test(line));
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
      const warnings = solverLogs().filter(line => /warn|gmin stepping|source stepping|singular matrix|convergence/i.test(line));
      sent = true;
      scope.postMessage({ type: 'result', result: { vectors, logs: allLogs, warnings, header: raw.header, durationMs: performance.now() - runStarted, points: raw.numPoints,
        engine: { startup: sim.getInitInfo() } } });
    } catch (error) { fail(error); }
  };
  loadingLogs.push(`Simulation worker ready: ${WORKER_PROTOCOL}; ${import.meta.url}`);
  scope.postMessage({ type: 'ready', protocol: WORKER_PROTOCOL });
}
