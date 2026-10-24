import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';
import { loadWasmBinary, loadEngineModule, WASM_BYTE_LENGTH, WORKER_PROTOCOL as BOOTSTRAP_PROTOCOL } from '../src/engine-worker.js';
import { CircuitEngine, ENGINE_INFO, WORKER_PROTOCOL, inspectWorkerStartup } from '../src/engine.js';
import { Simulation } from '../public/engine/eecircuit-engine.js';

const wasmUrl = 'https://circuitbench.test/tools/lab/engine/spice.wasm';
const glueUrl = 'https://circuitbench.test/tools/lab/engine/eecircuit-engine.js';
const wasm = await fs.readFile(new URL('../public/engine/spice.wasm', import.meta.url));
const response = (bytes, type = 'application/wasm', status = 200) => new Response(bytes, { status, headers: type ? { 'content-type': type } : {} });
const rejectedImport = async () => { throw new TypeError('Failed to fetch dynamically imported module'); };

test('real pinned WASM bytes load with correct, generic, absent or misleading MIME types', async () => {
  assert.equal(ENGINE_INFO.wasmBytes, WASM_BYTE_LENGTH);
  for (const mime of ['application/wasm', 'application/octet-stream', 'text/plain', 'text/html', null]) {
    const fetched = [];
    const loaded = await loadWasmBinary(wasmUrl, { fetchImpl: async (url, options) => {
      fetched.push({ url, options }); return response(wasm, mime);
    } });
    assert.equal(loaded.bytes.length, WASM_BYTE_LENGTH);
    assert.deepEqual(loaded.bytes, new Uint8Array(wasm));
    assert.equal(fetched.length, 1); assert.equal(fetched[0].url, wasmUrl);
    assert.equal(fetched[0].options.mode, 'same-origin'); assert.equal(loaded.assetUrl, wasmUrl);
  }
});

test('missing WASM reports the exact subdirectory URL, HTTP status and response MIME', async () => {
  await assert.rejects(loadWasmBinary(wasmUrl, { fetchImpl: async () => response('not found', 'text/html', 404) }), error => {
    assert.equal(error.code, 'ENGINE_WASM_HTTP'); assert.equal(error.phase, 'loading-wasm');
    assert.equal(error.assetUrl, wasmUrl); assert.equal(error.httpStatus, 404); assert.equal(error.contentType, 'text/html');
    assert.ok(error.message.includes(wasmUrl)); assert.match(error.message, /HTTP 404/); assert.match(error.message, /serve dist/); return true;
  });
});

test('a status-200 HTML route fallback is identified instead of sent to WebAssembly', async () => {
  for (const mime of ['text/html; charset=utf-8', 'application/octet-stream']) {
    await assert.rejects(loadWasmBinary(wasmUrl, { fetchImpl: async () => response('<!doctype html><html><body>app shell</body></html>', mime) }), error => {
      assert.equal(error.code, 'ENGINE_WASM_FORMAT'); assert.equal(error.httpStatus, 200);
      assert.match(error.message, /HTML page instead of WebAssembly/); assert.ok(error.message.includes(wasmUrl)); return true;
    });
  }
});

test('truncated valid-header WASM and non-WASM files fail with distinct diagnostics', async () => {
  await assert.rejects(loadWasmBinary(wasmUrl, { fetchImpl: async () => response(wasm.subarray(0, 16)) }), error => {
    assert.equal(error.code, 'ENGINE_WASM_SIZE'); assert.match(error.message, /expected 6133055 bytes, received 16/); return true;
  });
  await assert.rejects(loadWasmBinary(wasmUrl, { fetchImpl: async () => response(new Uint8Array(32)) }), error => {
    assert.equal(error.code, 'ENGINE_WASM_FORMAT'); assert.match(error.message, /not a WebAssembly version-1 binary/); return true;
  });
});

test('network/policy failures preserve the real cause without inventing an HTTP status', async () => {
  await assert.rejects(loadWasmBinary(wasmUrl, { fetchImpl: async () => { throw new TypeError('Network request blocked'); } }), error => {
    assert.equal(error.code, 'ENGINE_WASM_FETCH'); assert.equal(error.httpStatus, undefined);
    assert.match(error.message, /Network request blocked/); assert.ok(error.message.includes(wasmUrl)); return true;
  });
});

test('response read failures retain URL and successful response metadata', async () => {
  await assert.rejects(loadWasmBinary(wasmUrl, { fetchImpl: async () => ({ ok: true, status: 200,
    headers: new Headers({ 'content-type': 'application/wasm' }), arrayBuffer: async () => { throw new Error('body interrupted'); } }) }), error => {
    assert.equal(error.code, 'ENGINE_WASM_READ'); assert.equal(error.httpStatus, 200);
    assert.match(error.message, /body interrupted/); return true;
  });
});

test('successful local glue import performs no diagnostic fetch or external fallback', async () => {
  const module = { Simulation: class {} };
  const loaded = await loadEngineModule(glueUrl, { importModule: async url => { assert.equal(url, glueUrl); return module; },
    fetchImpl: async () => { throw new Error('Unexpected diagnostic fetch'); } });
  assert.equal(loaded, module);
});

test('missing engine glue is caught after bootstrap and gives source-checkout guidance', async () => {
  await assert.rejects(loadEngineModule(glueUrl, { importModule: rejectedImport, fetchImpl: async () => response('', 'text/html', 404) }), error => {
    assert.equal(error.code, 'ENGINE_MODULE_LOAD'); assert.equal(error.phase, 'loading-engine-module');
    assert.equal(error.assetUrl, glueUrl); assert.equal(error.httpStatus, 404);
    assert.match(error.message, /HTTP 404/); assert.match(error.message, /node scripts\/build\.mjs/); return true;
  });
});

test('a rejected engine module reports wrong MIME and status-200 HTML responses explicitly', async () => {
  await assert.rejects(loadEngineModule(glueUrl, { importModule: rejectedImport, fetchImpl: async () => response('export {}', 'application/octet-stream') }), error => {
    assert.equal(error.contentType, 'application/octet-stream'); assert.match(error.message, /JavaScript Content-Type/); return true;
  });
  await assert.rejects(loadEngineModule(glueUrl, { importModule: rejectedImport, fetchImpl: async () => response('<html>login</html>', 'text/javascript') }), error => {
    assert.equal(error.httpStatus, 200); assert.match(error.message, /returned HTML instead of a module/); return true;
  });
});

test('opaque engine import failures keep the browser reason when response inspection is blocked', async () => {
  await assert.rejects(loadEngineModule(glueUrl, { importModule: async () => { throw new Error('Blocked by script-src policy'); },
    fetchImpl: async () => { throw new Error('network blocked'); } }), error => {
    assert.match(error.message, /Blocked by script-src policy/); assert.equal(error.httpStatus, undefined);
    assert.ok(error.message.includes(glueUrl)); assert.doesNotMatch(error.message, /WebAssembly could not load/); return true;
  });
});

test('vendor start rejects an actual invalid supplied binary instead of leaving startup pending', { timeout: 3000 }, async () => {
  const original = globalThis.fetch; let fetches = 0;
  globalThis.fetch = async () => { fetches++; throw new Error('Unexpected fetch'); };
  try {
    const sim = new Simulation({ wasmBinary: new Uint8Array([1, 2, 3, 4]), wasmUrl });
    await assert.rejects(sim.start(), /WebAssembly|CompileError|magic|Aborted/i);
    assert.equal(fetches, 0, 'Supplied bytes must reach the compiler without an opaque second fetch');
  } finally { globalThis.fetch = original; }
});

test('an actual disposable worker computes from one validated WASM fetch with generic MIME', { timeout: 5000 }, async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'circuitbench-loader-test-'));
  const original = globalThis.Worker; const exits = []; let created = 0, terminated = 0;
  try {
    await fs.mkdir(path.join(stage, 'src')); await fs.mkdir(path.join(stage, 'engine'));
    await fs.writeFile(path.join(stage, 'package.json'), '{"type":"module"}');
    for (const name of ['engine.js', 'engine-worker.js']) await fs.copyFile(path.join(root, 'src', name), path.join(stage, 'src', name));
    for (const name of ['eecircuit-engine.js', 'spice.wasm']) await fs.copyFile(path.join(root, 'public/engine', name), path.join(stage, 'engine', name));
    globalThis.Worker = class {
      constructor(target) {
        created++;
        this.thread = new NodeWorker(new URL('../scripts/engine-node-worker.mjs', import.meta.url), { workerData: {
          target: String(target), maxLocalFetches: 1, wasmMime: 'application/octet-stream',
        } });
        this.thread.on('message', data => this.onmessage?.({ data }));
        this.thread.on('error', error => this.onerror?.({ message: error.message, preventDefault() {} }));
      }
      postMessage(data) { this.thread.postMessage(data); }
      terminate() { terminated++; exits.push(this.thread.terminate()); }
    };
    const { CircuitEngine: StagedEngine } = await import(pathToFileURL(path.join(stage, 'src/engine.js')));
    const progress = [];
    const result = await new StagedEngine().run('Generic MIME loading regression\nV1 in 0 10\nR1 in out 10k\nR2 out 0 10k\n.op\n.end', { onLog: message => progress.push(message) });
    assert.equal(result.vectors.find(v => v.name === 'v(out)').values[0], 5);
    assert.ok(result.logs.some(line => line.includes('Content-Type application/octet-stream')));
    assert.equal(result.engine.adapterVersion, 4);
    assert.equal(BOOTSTRAP_PROTOCOL, WORKER_PROTOCOL);
    assert.match(progress[0], /Simulation worker ready: circuitbench-worker-protocol-4/);
    assert.ok(progress[1].includes('Loading local engine JavaScript'));
    assert.equal(created, 1); assert.equal(terminated, 1);
    await Promise.all(exits);
  } finally { globalThis.Worker = original; await Promise.all(exits); await fs.rm(stage, { recursive: true, force: true }); }
});

test('empty worker error keeps startup phase and exact worker URL without asserting a WASM cause', async () => {
  const original = globalThis.Worker; let terminated = 0, workerUrl;
  globalThis.Worker = class {
    constructor(url) { workerUrl = String(url); }
    postMessage() { queueMicrotask(() => this.onerror({ message: '', preventDefault() {} })); }
    terminate() { terminated++; }
  };
  try {
    await assert.rejects(new CircuitEngine().run('test'), error => {
      assert.equal(error.code, 'ENGINE_WORKER_ERROR'); assert.equal(error.phase, 'worker-startup');
      assert.equal(error.assetUrl, workerUrl); assert.match(workerUrl, /\/src\/engine-worker\.js$/);
      assert.match(error.message, /did not provide a reason/); assert.doesNotMatch(error.message, /WebAssembly could not load/); return true;
    });
    assert.equal(terminated, 1);
  } finally { globalThis.Worker = original; }
});

test('worker-constructor policy errors retain the denied worker URL', async () => {
  const original = globalThis.Worker;
  globalThis.Worker = class { constructor() { throw new Error('worker-src denied'); } };
  try {
    await assert.rejects(new CircuitEngine().run('test'), error => {
      assert.equal(error.code, 'ENGINE_WORKER_START'); assert.equal(error.phase, 'worker-startup');
      assert.match(error.assetUrl, /engine-worker\.js$/); assert.match(error.message, /worker-src denied/); return true;
    });
  } finally { globalThis.Worker = original; }
});

test('the public facade retains structured worker asset diagnostics and terminates the failed worker', async () => {
  const original = globalThis.Worker; let terminated = 0;
  globalThis.Worker = class {
    postMessage() { queueMicrotask(() => this.onmessage({ data: { type: 'error', message: 'missing WASM',
      code: 'ENGINE_WASM_HTTP', phase: 'loading-wasm', assetUrl: wasmUrl, httpStatus: 404, contentType: 'text/html', logs: ['loading'] } })); }
    terminate() { terminated++; }
  };
  try {
    await assert.rejects(new CircuitEngine().run('test'), error => {
      assert.equal(error.status, 'failed'); assert.equal(error.code, 'ENGINE_WASM_HTTP');
      assert.equal(error.assetUrl, wasmUrl); assert.equal(error.httpStatus, 404); assert.equal(error.contentType, 'text/html');
      assert.deepEqual(error.logs, ['loading']); return true;
    });
    assert.equal(terminated, 1);
  } finally { globalThis.Worker = original; }
});

test('a stalled loader is bounded and reports the loading stage when terminated', async () => {
  const original = globalThis.Worker; let terminated = 0;
  globalThis.Worker = class {
    postMessage() { queueMicrotask(() => this.onmessage({ data: { type: 'log', message: 'loading WASM', phase: 'loading-wasm', assetUrl: wasmUrl } })); }
    terminate() { terminated++; }
  };
  try {
    await assert.rejects(new CircuitEngine().run('test', { timeoutMs: 100 }), error => {
      assert.equal(error.status, 'timed-out'); assert.equal(error.phase, 'loading-wasm'); assert.equal(error.assetUrl, wasmUrl); return true;
    });
    assert.equal(terminated, 1);
  } finally { globalThis.Worker = original; }
});

test('worker reload inspection reports observed HTTP, MIME, HTML and current protocol accurately', async () => {
  const url = 'https://circuitbench.test/projects/lab/assets/1.0.0-rc.3/src/engine-worker.js';
  const current = `export const WORKER_PROTOCOL = '${WORKER_PROTOCOL}';`;
  const cases = [
    { body: current, mime: 'application/javascript', status: 200, html: false, protocol: true, js: true },
    { body: '<!doctype html><html>Fallback</html>', mime: 'text/html', status: 200, html: true, protocol: false, js: false },
    { body: '<html>Not found</html>', mime: 'text/html', status: 404, html: true, protocol: false, js: false },
    { body: current, mime: 'text/plain', status: 200, html: false, protocol: true, js: false },
    { body: 'import { Simulation } from "../engine/eecircuit-engine.mjs";', mime: 'application/javascript', status: 200, html: false, protocol: false, js: true },
  ];
  for (const item of cases) {
    let requested;
    const report = await inspectWorkerStartup(url, { fetchImpl: async (exactUrl, options) => {
      requested = { exactUrl, options }; return response(item.body, item.mime, item.status);
    } });
    assert.equal(requested.exactUrl, url); assert.equal(requested.options.cache, 'reload');
    assert.equal(requested.options.mode, 'same-origin'); assert.equal(requested.options.credentials, 'same-origin');
    assert.equal(report.assetUrl, url); assert.equal(report.httpStatus, item.status); assert.equal(report.contentType, item.mime);
    assert.equal(report.html, item.html); assert.equal(report.protocolFound, item.protocol); assert.equal(report.javascriptMime, item.js);
  }
});

test('worker response inspection bounds the inspected body without executing it', async () => {
  const report = await inspectWorkerStartup(glueUrl, { fetchImpl: async () => response('x'.repeat(90000) + WORKER_PROTOCOL, 'application/javascript') });
  assert.equal(report.bytesInspected, 65536);
  assert.equal(report.protocolFound, false, 'A marker beyond the bounded prefix is not reported as inspected');
});

test('worker response inspection times out even when the injected fetch ignores abort', async () => {
  let fetchSignal; const start = performance.now();
  const report = await inspectWorkerStartup(glueUrl, { timeoutMs: 25, fetchImpl: async (_, options) => {
    fetchSignal = options.signal; return new Promise(() => {});
  } });
  assert.equal(report.timedOut, true); assert.equal(fetchSignal.aborted, true);
  assert.ok(performance.now() - start < 1000);
});

test('worker response inspection respects external cancellation and preserves its abort identity', async () => {
  const controller = new AbortController(); let fetchSignal;
  const pending = inspectWorkerStartup(glueUrl, { signal: controller.signal, fetchImpl: async (_, options) => {
    fetchSignal = options.signal; return new Promise(() => {});
  } });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(fetchSignal.aborted, true);
});

async function withOpaqueStartup(fetchImpl, inspect) {
  const originalWorker = globalThis.Worker, originalFetch = globalThis.fetch;
  const state = { terminated: 0, events: [], fetchSignal: null };
  let signalStarted; state.started = new Promise(resolve => { signalStarted = resolve; });
  globalThis.Worker = class {
    postMessage() { queueMicrotask(() => this.onerror({ message: '', preventDefault() {} })); }
    terminate() { state.terminated++; state.events.push('terminate'); }
  };
  globalThis.fetch = (url, options) => {
    state.events.push('inspect'); state.fetchSignal = options.signal; signalStarted();
    return fetchImpl(url, options);
  };
  const engine = new CircuitEngine();
  try { await inspect(engine, state); }
  finally { engine.stop(); globalThis.Worker = originalWorker; globalThis.fetch = originalFetch; }
}

test('opaque startup diagnostics distinguish bad responses while healthy responses keep the cause unknown', async () => {
  for (const item of [
    { body: WORKER_PROTOCOL, mime: 'application/javascript', status: 200, expected: /original worker-startup cause remains unknown.*Try Run again/i },
    { body: '<html>fallback</html>', mime: 'text/html', status: 200, expected: /HTML instead of worker JavaScript/ },
    { body: 'missing', mime: 'text/plain', status: 404, expected: /HTTP 404.*did not return a successful worker response/ },
    { body: WORKER_PROTOCOL, mime: 'text/plain', status: 200, expected: /does not identify a JavaScript MIME type/ },
    { body: 'old worker without current handshake', mime: 'application/javascript', status: 200, expected: /may be an older or different worker file/ },
  ]) {
    await withOpaqueStartup(async () => response(item.body, item.mime, item.status), async (engine, state) => {
      const error = await engine.run('test').catch(error => error);
      assert.equal(error.status, 'failed'); assert.equal(error.phase, 'worker-startup');
      assert.equal(error.httpStatus, item.status); assert.equal(error.contentType, item.mime); assert.match(error.message, item.expected);
      assert.equal(state.terminated, 1); assert.deepEqual(state.events, ['terminate', 'inspect']);
      assert.equal(engine.running, false);
    });
  }
});

test('Stop during startup inspection wins over diagnostics and terminates the worker exactly once', async () => {
  await withOpaqueStartup(async () => new Promise(() => {}), async (engine, state) => {
    const pending = engine.run('test').catch(error => error);
    await state.started;
    assert.equal(state.terminated, 1, 'Worker is disposed before response inspection');
    assert.equal(engine.stop(), true);
    const error = await pending;
    assert.equal(error.status, 'cancelled'); assert.equal(state.fetchSignal.aborted, true);
    assert.equal(state.terminated, 1); assert.equal(engine.running, false); assert.equal(engine.stop(), false);
  });
});

test('the original run watchdog wins during startup inspection and aborts its fetch', async () => {
  await withOpaqueStartup(async () => new Promise(() => {}), async (engine, state) => {
    const error = await engine.run('test', { timeoutMs: 100 }).catch(error => error);
    assert.equal(error.status, 'timed-out'); assert.equal(error.phase, 'worker-startup');
    assert.equal(state.terminated, 1); assert.equal(state.fetchSignal.aborted, true); assert.equal(engine.running, false);
  });
});

test('accepted worker protocol is visible before computation and incompatible protocols fail without inspection', async () => {
  const originalWorker = globalThis.Worker, originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('Unexpected response inspection after ready'); };
    for (const protocol of [WORKER_PROTOCOL, 'circuitbench-worker-protocol-old']) {
      let terminated = 0; const progress = [];
      globalThis.Worker = class {
        postMessage() { queueMicrotask(() => {
          this.onmessage({ data: { type: 'ready', protocol } });
          this.onerror({ message: '', preventDefault() {} });
        }); }
        terminate() { terminated++; }
      };
      const error = await new CircuitEngine().run('test', { onLog: line => progress.push(line) }).catch(error => error);
      if (protocol === WORKER_PROTOCOL) {
        assert.equal(error.phase, 'worker-ready'); assert.equal(progress.length, 1); assert.ok(progress[0].includes(WORKER_PROTOCOL));
      } else {
        assert.equal(error.code, 'ENGINE_WORKER_PROTOCOL'); assert.equal(progress.length, 0);
      }
      assert.equal(terminated, 1); assert.doesNotMatch(error.message, /Reload inspection/);
    }
  } finally { globalThis.Worker = originalWorker; globalThis.fetch = originalFetch; }
});
