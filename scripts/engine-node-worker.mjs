// Test-only Node adapter for the browser Worker API. Never shipped in runtime.
import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs/promises';
const originalFetch = globalThis.fetch;
let localFetches = 0;
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url.startsWith('/') || url.startsWith('file:')) {
    if (++localFetches > (workerData.maxLocalFetches ?? Infinity)) throw new Error('Unexpected extra asset fetch after WASM bytes were supplied.');
    return new Response(await fs.readFile(url.startsWith('file:') ? new URL(url) : url), { headers: { 'content-type': workerData.wasmMime ?? 'application/wasm' } });
  }
  return originalFetch(input, options);
};
globalThis.self = globalThis;
globalThis.postMessage = message => parentPort.postMessage(message);
globalThis.addEventListener = (name, fn) => {
  if (name === 'unhandledrejection') process.on('unhandledRejection', reason => fn({ reason, preventDefault() {} }));
};
await import(workerData.target);
parentPort.on('message', data => globalThis.onmessage({ data }));
