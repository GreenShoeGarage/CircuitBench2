import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash, webcrypto} from 'node:crypto';

const html = await fs.readFile(new URL('../public/repair.html', import.meta.url), 'utf8');
const script = id => {
  const match = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
  assert.ok(match, 'The actual standalone page contains ' + id);
  return match[1];
};
const coreScript = script('recovery-core');
function loadCore(environment = {}, globals = {}) {
  const context = vm.createContext({URL, TextDecoder, TextEncoder, AbortController, Uint8Array, setTimeout, clearTimeout, ...environment, ...globals});
  vm.runInContext(coreScript, context);
  return context;
}
const scope = 'https://example.test/tools/circuitbench/';
const version = '1.0.0-rc.3';
const assets = 'assets/' + version + '/';
const worker = 'sw-' + version + '.js';
const prefix = 'circuitbench:' + scope + '|';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pageHTML = '<!doctype html><html><head><title>CircuitBench · Recovery fixture</title></head><body><script data-host-injected="analytics">void 0</script></body></html>';

function deployment(options = {}) {
  const appScope = options.scope || scope;
  const bodies = new Map([
    [assets + 'src/app.js', {bytes: Buffer.from('export const value = 1;'), mime: 'text/javascript'}],
    [assets + 'src/engine-worker.js', {bytes: Buffer.from('export const worker = true;'), mime: 'text/javascript'}],
    [assets + 'engine/eecircuit-engine.js', {bytes: Buffer.from('export class Simulation {}'), mime: 'text/javascript'}],
    [assets + 'engine/spice.wasm', {bytes: Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]), mime: 'application/octet-stream'}],
    [assets + 'style.css', {bytes: Buffer.from('body{color:green}'), mime: 'text/css'}],
    [worker, {bytes: Buffer.from('/* canonical shell is embedded here */'), mime: 'text/javascript'}],
    ['icon.svg', {bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), mime: 'image/svg+xml'}],
    ['manifest.webmanifest', {bytes: Buffer.from('{"name":"CircuitBench"}'), mime: 'application/manifest+json'}]
  ]);
  const manifest = {format: 'CircuitBenchRecovery', formatVersion: 1, version, buildHash: '0123456789abcdef', shell: {root: './', embeddedIn: worker}, files: [...bodies].map(([path, file]) => ({path, bytes: file.bytes.length, sha256: hash(file.bytes)}))};
  options.changeManifest?.(manifest);
  const calls = [];
  async function fetch(url, init) {
    calls.push({url: String(url), init});
    const target = new URL(url);
    assert.equal(target.origin, new URL(appScope).origin, 'Recovery must not request another origin');
    assert.ok(target.href.startsWith(appScope), 'Recovery must not request a sibling or ancestor path');
    const path = target.pathname.slice(new URL(appScope).pathname.length);
    let file;
    if (path === 'recovery-manifest.json') file = {bytes: Buffer.from(JSON.stringify(manifest)), mime: 'application/json'};
    else if (!path) file = {bytes: Buffer.from(options.navigationHTML || pageHTML), mime: 'text/html'};
    else file = bodies.get(path);
    if (options.response) {
      const replacement = await options.response(path, file, init);
      if (replacement instanceof Response) return replacement;
      if (replacement) file = replacement;
    }
    if (!file) return new Response('not found', {status: 404});
    const response = new Response(file.bytes, {status: file.status || 200, headers: {'content-type': file.mime, ...file.headers}});
    Object.defineProperty(response, 'url', {value: String(url)});
    return response;
  }
  return {manifest, bodies, calls, fetch, scope: appScope};
}

function environment(overrides = {}) {
  const value = {
    location: {href: scope + 'repair/?release=' + version + '&return=https://unrelated.test/#fragment'},
    isSecureContext: true,
    navigator: {serviceWorker: {async getRegistrations() {return [];}}},
    caches: {async keys() {return [];}, async delete() {return true;}},
    crypto: webcrypto,
    fetch: deployment().fetch,
    ...overrides
  };
  for (const key of ['indexedDB', 'localStorage']) Object.defineProperty(value, key, {get() {throw new Error('Project storage must not be accessed: ' + key);}});
  return value;
}

test('flat and directory recovery routes derive the exact parent app scope at root and subdirectories', () => {
  const core = loadCore();
  for (const [path, expected] of [
    ['/repair/', 'https://example.test/'],
    ['/repair/index.html', 'https://example.test/'],
    ['/repair.html', 'https://example.test/'],
    ['/tools/circuitbench/repair/', scope],
    ['/tools/circuitbench/repair/index.html', scope],
    ['/tools/circuitbench/repair.html', scope]
  ]) {
    const context = core.recoveryEnvironment(environment({location: {href: 'https://example.test' + path + '?release=x&return=https://unrelated.test/#hash'}}));
    assert.equal(context.scope, expected);
    const target = new URL(context.returnURL);
    assert.equal(target.origin + target.pathname, expected);
    assert.equal(target.hash, '');
    assert.deepEqual([...target.searchParams.keys()], ['cache-refresh']);
  }
});

test('recovery isolates scope and refreshes canonical asset HTTP-cache keys without fetching index.html', async () => {
  const removedScopes = [], removedCaches = [];
  const scopes = [scope, 'https://example.test/', 'https://example.test/tools/', scope + 'nested/', 'https://example.test/tools/circuitbench-other/'];
  const ownCaches = [prefix + '1.0.0-rc.1:old', prefix + '1.0.0-rc.2:old'];
  const otherCaches = ['other-app', 'circuitbench:https://example.test/tools/|old', 'circuitbench:' + scope + 'nested/|old', 'circuitbench:' + scope + 'old-without-delimiter', 'circuitbench:https://example.test/tools/circuitbench-other/|old'];
  const server = deployment({response(path, file) {
    if (path === assets + 'src/app.js') return {...file, headers: {'content-encoding': 'gzip', 'content-length': String(file.bytes.length + 40)}};
  }});
  const result = await loadCore().refreshCachedApplicationFiles(environment({fetch: server.fetch,
    navigator: {serviceWorker: {async getRegistrations() {return scopes.map(registeredScope => ({scope: registeredScope, async unregister() {removedScopes.push(registeredScope);return true;}}));}}},
    caches: {async keys() {return [...ownCaches, ...otherCaches];}, async delete(name) {removedCaches.push(name);return true;}}
  }));
  assert.deepEqual(removedScopes, [scope]);
  assert.deepEqual(removedCaches, ownCaches);
  assert.equal(result.status, 'complete');
  assert.equal(result.filesRefreshed, server.manifest.files.length);
  assert.equal(result.filesHashed, server.manifest.files.length);
  assert.equal(result.navigationRefreshed, true, 'Host-injected analytics do not require the canonical shell hash');
  assert.equal(server.calls.length, server.manifest.files.length + 2);
  for (const {url, init} of server.calls) {
    const target = new URL(url);
    assert.equal(init.cache, 'reload');
    assert.equal(init.mode, 'same-origin');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.redirect, 'error');
    assert.ok(!target.pathname.endsWith('/index.html'));
    if (target.pathname.endsWith('/recovery-manifest.json') || target.pathname === new URL(scope).pathname) assert.ok(target.searchParams.has('cache-refresh'));
    else assert.equal(target.search, '', 'Runtime requests refresh their actual cache key, not a one-off query alias');
  }
  assert.equal(server.calls.at(-1).url, result.returnURL);
});

test('HTTP file refresh works without secure cache APIs and reports exactly which checks were unavailable', async () => {
  const httpScope = 'http://example.test/tools/circuitbench/';
  const server = deployment({scope: httpScope});
  let storageAccess = 0;
  const env = environment({location: {href: httpScope + 'repair/'}, isSecureContext: false, crypto: undefined, fetch: server.fetch});
  for (const name of ['navigator', 'caches']) Object.defineProperty(env, name, {get() {storageAccess++;throw new Error('HTTP must not attempt secure storage cleanup');}});
  const result = await loadCore().refreshCachedApplicationFiles(env);
  assert.equal(result.status, 'complete');
  assert.equal(result.filesRefreshed, server.manifest.files.length);
  assert.equal(result.filesHashed, 0);
  assert.equal(result.sha256Available, false);
  assert.equal(storageAccess, 0);
  assert.match(result.notes.join('\n'), /Those stores were not changed/);
  assert.match(result.notes.join('\n'), /no cryptographic match is claimed/);
  const secureServer = deployment();
  const partial = await loadCore().refreshCachedApplicationFiles(environment({fetch: secureServer.fetch, caches: undefined}));
  assert.equal(partial.status, 'partial');
  assert.equal(partial.filesRefreshed, secureServer.manifest.files.length);
  assert.match(partial.errors.join('\n'), /cleanup controls were unavailable/);
});

test('cleanup failures remain visible while other eligible caches and runtime downloads are attempted', async () => {
  const deleted = [], server = deployment();
  const result = await loadCore().refreshCachedApplicationFiles(environment({fetch: server.fetch,
    navigator: {serviceWorker: {async getRegistrations() {return [{scope, async unregister() {throw new Error('Registration blocked');}}];}}},
    caches: {async keys() {return [prefix + 'blocked', prefix + 'removable', prefix + 'already-absent'];}, async delete(name) {deleted.push(name);if (name.endsWith('blocked')) throw new Error('Cache blocked');return name.endsWith('removable');}}
  }));
  assert.equal(result.status, 'partial');
  assert.equal(result.cachesRemoved, 1);
  assert.equal(deleted.length, 3);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors.join('\n'), /Registration blocked/);
  assert.match(result.errors.join('\n'), /Cache blocked/);
  assert.equal(result.filesRefreshed, server.manifest.files.length);
  assert.equal(result.navigationRefreshed, true);
});

test('malicious manifest paths are rejected before any listed runtime asset is requested', async () => {
  for (const path of ['https://elsewhere.test/x.js', '//elsewhere.test/x.js', '/admin/x.js', '../sibling/x.js', assets + 'src/../../x.js', assets + 'src/%2e%2e/x.js', assets + 'src/app.js?old=1', assets + 'src/app.js#fragment', assets + 'src\\x.js', 'index.html', assets + 'index.html', 'assets/other/src/app.js']) {
    const server = deployment({changeManifest(manifest) {manifest.files.push({path, bytes: 1, sha256: '0'.repeat(64)});}});
    const result = await loadCore().refreshCachedApplicationFiles(environment({fetch: server.fetch}));
    assert.equal(result.status, 'partial', path);
    assert.equal(result.filesRefreshed, 0, path);
    assert.equal(server.calls.length, 2, 'Only manifest and safe root may be requested: ' + path);
    assert.ok(server.calls.every(call => !call.url.includes('elsewhere.test')));
  }
});

test('manifest shape, duplicates, missing essentials and download budgets fail closed', async () => {
  const future = deployment().manifest;
  const futureVersion = '2.3.0-rc.7+hosting';
  future.version = futureVersion;
  future.shell.embeddedIn = 'sw-' + futureVersion + '.js';
  for (const file of future.files) file.path = file.path.replace(version, futureVersion);
  assert.equal(loadCore().validateRecoveryManifest(future, scope).version, futureVersion, 'Builder-compatible SemVer metadata remains a literal path character');
  const changes = [
    manifest => {manifest.formatVersion = 2;},
    manifest => {manifest.shell.root = '../';},
    manifest => {manifest.shell.embeddedIn = 'index.html';},
    manifest => {manifest.files[0].bytes = 0;},
    manifest => {manifest.files[0].bytes = 64 * 1024 * 1024;},
    manifest => {for (const file of manifest.files.slice(0, 3)) file.bytes = 16 * 1024 * 1024;},
    manifest => {manifest.files[0].sha256 = 'not-a-hash';},
    manifest => {manifest.files.push({...manifest.files[0]});},
    manifest => {manifest.files = manifest.files.filter(file => file.path !== worker);},
    manifest => {manifest.files = Array.from({length: 300}, () => ({...manifest.files[0]}));}
  ];
  for (const changeManifest of changes) {
    const server = deployment({changeManifest});
    const result = await loadCore().refreshCachedApplicationFiles(environment({fetch: server.fetch}));
    assert.equal(result.status, 'partial');
    assert.equal(result.filesRefreshed, 0);
    assert.equal(server.calls.length, 2);
  }
});

test('same-length stale bytes, truncated files, unusable JavaScript MIME and HTTP failures are distinct partial results', async () => {
  const server = deployment({response(path, file) {
    if (path === assets + 'src/app.js') return {...file, bytes: Buffer.from(file.bytes.toString().replace('1', '2'))};
    if (path === assets + 'src/engine-worker.js') return {...file, bytes: Buffer.from('!')};
    if (path === assets + 'engine/eecircuit-engine.js') return {...file, mime: 'text/plain'};
    if (path === assets + 'engine/spice.wasm') return {...file, status: 404};
  }});
  const result = await loadCore().refreshCachedApplicationFiles(environment({fetch: server.fetch}));
  assert.equal(result.status, 'partial');
  assert.equal(result.filesRefreshed, server.manifest.files.length - 4);
  assert.equal(result.navigationRefreshed, true);
  const errors = result.errors.join('\n');
  assert.match(errors, /SHA-256 differs/);
  assert.match(errors, /Expected \d+ bytes; received 1/);
  assert.match(errors, /JavaScript MIME is unusable: text\/plain/);
  assert.match(errors, /HTTP 404/);
});

test('an available SHA-256 implementation that fails does not silently downgrade to size-only success', async () => {
  const server = deployment();
  const result = await loadCore().refreshCachedApplicationFiles(environment({fetch: server.fetch, crypto: {subtle: {async digest() {throw new Error('Digest blocked');}}}}));
  assert.equal(result.status, 'partial');
  assert.equal(result.sha256Available, true);
  assert.equal(result.filesHashed, 0);
  assert.equal(result.filesRefreshed, 0);
  assert.match(result.errors.join('\n'), /Digest blocked/);
});

test('oversized bodies remain blocked and identify the expected limit, observed size and response metadata', async () => {
  for (const variant of ['stream', 'declared', 'buffer']) {
    const server = deployment({response(path) {
      if (path !== 'recovery-manifest.json') return;
      const headers = {'content-type': 'application/json', ...(variant === 'declared' ? {'content-length': '262144'} : {'content-encoding': 'gzip'})};
      const response = new Response(Buffer.alloc(256 * 1024, 32), {headers});
      if (variant === 'buffer') Object.defineProperty(response, 'body', {value: null});
      return response;
    }});
    const result = await loadCore().refreshCachedApplicationFiles(environment({fetch: server.fetch}));
    assert.equal(result.status, 'partial');
    assert.equal(result.filesRefreshed, 0);
    assert.equal(server.calls.length, 2);
    const message = result.errors.join('\n');
    assert.match(message, /expected at most 131072 decoded bytes/);
    assert.match(message, /HTTP 200; Content-Type application\/json/);
    if (variant === 'declared') {
      assert.match(message, /declared Content-Length is 262144 bytes before reading the body/);
      assert.match(message, /Content-Encoding \(not provided\); Content-Length 262144/);
    } else {
      assert.match(message, variant === 'stream' ? /read at least 262144 decoded bytes before stopping/ : /read 262144 decoded bytes/);
      assert.match(message, /Content-Encoding gzip; Content-Length \(not provided\)/);
    }
  }
});

test('stalled network requests are timed out and aborted with a readable result', async () => {
  const signals = [], delays = [];
  const env = environment({isSecureContext: false, crypto: undefined, fetch(url, init) {signals.push(init.signal);return new Promise(() => {});}});
  const core = loadCore({}, {setTimeout(callback, milliseconds) {delays.push(milliseconds);return setTimeout(callback, Math.min(milliseconds, 5));}});
  const result = await core.refreshCachedApplicationFiles(env);
  assert.equal(result.status, 'partial');
  assert.equal(signals.length, 2, 'Only manifest and root are attempted after the manifest stalls');
  assert.ok(signals.every(signal => signal.aborted));
  assert.ok(delays.every(value => value > 0 && value <= 15000));
  assert.match(result.errors.join('\n'), /Timed out/);
});

test('runtime downloads use a bounded parallel queue', async () => {
  let active = 0, maximum = 0;
  const server = deployment({async response(path) {
    if (!path || path === 'recovery-manifest.json') return;
    active++;maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
  }});
  const result = await loadCore().refreshCachedApplicationFiles(environment({fetch: server.fetch}));
  assert.equal(result.status, 'complete');
  assert.ok(maximum > 1);
  assert.ok(maximum <= 4);
  assert.equal(active, 0);
});

test('HTTP recovery UI stays actionable, waits for file checks and requires a separate Return action', async () => {
  let finishAsset, assetStarted;
  const deferred = new Promise(resolve => {finishAsset = resolve;});
  const started = new Promise(resolve => {assetStarted = resolve;});
  const httpScope = 'http://example.test/tools/circuitbench/';
  const server = deployment({scope: httpScope, async response(path) {if (path === assets + 'src/app.js') {assetStarted();await deferred;}}});
  function element() {
    return {textContent: '', hidden: false, disabled: false, dataset: {}, children: [], listeners: {}, addEventListener(name, callback) {this.listeners[name] = callback;}, replaceChildren() {this.children = [];}, append(child) {this.children.push(child);}, focus() {this.focused = true;}};
  }
  const ids = ['refresh-button', 'return-link', 'result', 'result-heading', 'result-description', 'result-details', 'scope-text'];
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  elements['return-link'].hidden = true;
  const location = {href: httpScope + 'repair/', assign() {assert.fail('Recovery must not navigate automatically');}, replace() {assert.fail('Recovery must not navigate automatically');}};
  const env = environment({location, isSecureContext: false, crypto: undefined, fetch: server.fetch});
  const context = loadCore({...env, document: {getElementById(id) {return elements[id];}, createElement() {return element();}}});
  vm.runInContext(script('recovery-ui'), context);
  assert.equal(elements['refresh-button'].disabled, false);
  assert.match(elements['result-heading'].textContent, /Ready to refresh browser files over HTTP/);
  const pending = elements['refresh-button'].listeners.click();
  await started;
  assert.equal(elements['refresh-button'].disabled, true);
  assert.equal(elements['return-link'].hidden, true);
  assert.equal(elements.result.dataset.state, 'working');
  finishAsset();
  await pending;
  assert.equal(elements.result.dataset.state, 'complete');
  assert.match(elements['result-heading'].textContent, /ready to return/);
  assert.equal(elements['return-link'].hidden, false);
  assert.equal(elements['refresh-button'].disabled, false);
  assert.equal(elements.result.focused, true);
  assert.equal(new URL(elements['return-link'].href).pathname, '/tools/circuitbench/');
  assert.match(elements['return-link'].href, /\?cache-refresh=\d+$/);
  assert.equal(location.href, httpScope + 'repair/');
  assert.ok(elements['result-details'].children.some(item => item.textContent.includes('Those stores were not changed')));
});
