/** Read-only, bounded checks of the advertised release and its three execution paths.
 * A passing result is an installation observation, not an offline/upgrade certificate.
 * User projects, storage, caches and service-worker registrations are never changed.
 */
import { VERSION, newProject, addComponent, uid } from './model.js';
import { generateNetlist } from './netlist.js';
import { compileCoordinated } from './coordinated.js';
import { CircuitEngine } from './engine.js';
import { DigitalEngine } from './digital-engine.js';
import { CoordinatedEngine } from './coordinated-engine.js';

export const INSTALLATION_CHECK_LIMITS = Object.freeze({
  manifestBytes: 524288, files: 128, fileBytes: 16777216, totalBytes: 33554432,
  requestMs: 10000, engineMs: 15000, totalMs: 60000, concurrency: 4,
});
const SEMVER = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9][A-Za-z0-9.-]*)?(?:\+[A-Za-z0-9][A-Za-z0-9.-]*)?$/;
const HASH = /^[a-f0-9]{64}$/i, BUILD = /^[a-f0-9]{16,64}$/i;
const PATH = /^[A-Za-z0-9_-][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._+-]*)*$/;
const JS_MIMES = new Set(['text/javascript','application/javascript','text/ecmascript','application/ecmascript','application/x-javascript','application/x-ecmascript','text/x-javascript','text/x-ecmascript','text/javascript1.0','text/javascript1.1','text/javascript1.2','text/javascript1.3','text/javascript1.4','text/javascript1.5','text/jscript','text/livescript']);
const ERROR_FIELDS = ['code','phase','assetUrl','httpStatus','contentType','expectedBytes','observedBytes','declaredBytes','contentEncoding'];
const messageOf = value => String(value?.message ?? value).slice(0,1000);
const problem = (message, code = 'INSTALLATION_CHECK_FAILED', fields = {}) => Object.assign(new Error(message), { code, ...fields });
const cancelled = () => problem('Installation check cancelled. Completed observations are retained.', 'INSTALLATION_CHECK_CANCELLED', { name: 'AbortError' });
const validRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');

function scopeURL(value) {
  const url = new URL(value);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw problem('Open the deployed application over HTTP or HTTPS before checking its installation.', 'INSTALLATION_SCOPE');
  url.search = ''; url.hash = '';
  if (!url.pathname.endsWith('/')) throw problem('The installation check requires the application directory, ending in a slash.', 'INSTALLATION_SCOPE');
  return url.href;
}

/** Validate both manifests before requesting any manifest-controlled asset path. */
export function validateInstallationManifests(release, recovery, { baseURL, version = VERSION, buildHash = null } = {}) {
  const scope = scopeURL(baseURL);
  if (typeof version !== 'string' || version.length > 64 || !SEMVER.test(version)) throw problem('The loaded application has an invalid release version.', 'INSTALLATION_VERSION');
  if (!validRecord(release) || release.name !== 'CircuitBench' || !validRecord(recovery) || recovery.format !== 'CircuitBenchRecovery' || recovery.formatVersion !== 1) throw problem('Release or recovery manifest is missing or unsupported. Upload the complete deploy package.', 'INSTALLATION_MANIFEST');
  if (release.version !== version || recovery.version !== version) throw problem(`The loaded application is ${version}, but the release/recovery manifests advertise ${String(release.version).slice(0,64)} / ${String(recovery.version).slice(0,64)}. Load one complete release and refresh this installation.`, 'INSTALLATION_VERSION_MISMATCH', { manifestVersion: release.version });
  if (typeof release.buildHash !== 'string' || !BUILD.test(release.buildHash) || release.buildHash !== recovery.buildHash) throw problem('Release and recovery manifests do not identify the same valid runtime build.', 'INSTALLATION_BUILD_MISMATCH');
  if (buildHash && (!BUILD.test(buildHash) || release.buildHash !== buildHash)) throw problem(`The loaded page and uploaded manifests identify different builds (${String(buildHash).slice(0,64)} / ${release.buildHash}). Refresh this installation after uploading the complete package.`, 'INSTALLATION_BUILD_MISMATCH');
  const prefix = `assets/${version}/`, worker = `sw-${version}.js`;
  if (release.runtimeBase !== prefix.slice(0,-1) || release.serviceWorker !== worker || recovery.shell?.root !== './' || recovery.shell?.embeddedIn !== worker) throw problem('The release has inconsistent runtime or recovery paths.', 'INSTALLATION_RUNTIME_PATH');
  if (!Array.isArray(release.runtimeFiles) || release.runtimeFiles.length < 1 || release.runtimeFiles.length > INSTALLATION_CHECK_LIMITS.files || !validRecord(release.files) || !Array.isArray(recovery.files) || recovery.files.length < 1 || recovery.files.length > INSTALLATION_CHECK_LIMITS.files) throw problem('The release has an invalid or excessive runtime inventory.', 'INSTALLATION_INVENTORY');
  const rootFiles = new Set([worker,'icon.svg','manifest.webmanifest']), seen = new Set();
  let totalBytes = 0;
  const files = recovery.files.map(file => {
    const path = file?.path;
    if (typeof path !== 'string' || path.length > 240 || !PATH.test(path) || /\.(?:html?|xhtml)$/i.test(path) || !path.startsWith(prefix) && !rootFiles.has(path)) throw problem('An unsafe or out-of-release runtime path was rejected.', 'INSTALLATION_ASSET_PATH');
    const url = new URL(path, scope);
    if (url.origin !== new URL(scope).origin || !url.href.startsWith(scope) || url.search || url.hash || seen.has(path)) throw problem('A duplicate or out-of-scope runtime path was rejected.', 'INSTALLATION_ASSET_PATH');
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > INSTALLATION_CHECK_LIMITS.fileBytes) throw problem(`Invalid or excessive byte count for ${path}.`, 'INSTALLATION_ASSET_SIZE');
    if (typeof file.sha256 !== 'string' || !HASH.test(file.sha256) || release.files[path] !== file.sha256) throw problem(`The manifests disagree about the file identity of ${path}.`, 'INSTALLATION_ASSET_IDENTITY');
    totalBytes += file.bytes;
    if (totalBytes > INSTALLATION_CHECK_LIMITS.totalBytes) throw problem('The advertised runtime exceeds the bounded download budget.', 'INSTALLATION_ASSET_SIZE');
    seen.add(path);
    return { path, url: url.href, bytes: file.bytes, sha256: file.sha256.toLowerCase() };
  });
  const expected = new Set(release.runtimeFiles);
  if (expected.size !== release.runtimeFiles.length || !expected.delete('index.html') || !HASH.test(release.files['index.html'] ?? '') || !HASH.test(release.files['recovery-manifest.json'] ?? '')) throw problem('The release inventory has duplicate files or is missing its shell/recovery identity.', 'INSTALLATION_INVENTORY');
  expected.add(worker);
  if (expected.size !== seen.size || [...expected].some(path => !seen.has(path))) throw problem('Release and recovery runtime inventories differ.', 'INSTALLATION_INVENTORY');
  const required = ['src/app.js','src/model.js','src/installation-check.js','src/engine.js','src/engine-worker.js','src/digital-engine.js','src/digital-worker.js','src/digital.js','src/coordinated-engine.js','src/coordinated-worker.js','src/coordinated.js','src/coordinated-digital.js','engine/eecircuit-engine.js','engine/spice.wasm','style.css'].map(path => prefix + path);
  for (const path of [worker,'icon.svg','manifest.webmanifest',...required]) if (!seen.has(path)) throw problem(`The runtime inventory is missing ${path}. Upload the complete deploy package.`, 'INSTALLATION_INVENTORY');
  return { scope, version, buildHash: release.buildHash, files, totalBytes, recoverySha256: release.files['recovery-manifest.json'] };
}

function environmentInfo(environment) {
  let crypto = null;
  try { crypto = environment.crypto?.subtle; } catch {}
  return {
    secureContext: environment.isSecureContext === true,
    fetch: typeof environment.fetch === 'function',
    worker: typeof environment.Worker === 'function',
    webAssembly: typeof environment.WebAssembly === 'object',
    sha256: typeof crypto?.digest === 'function',
    serviceWorker: Boolean(environment.navigator?.serviceWorker),
    indexedDB: Boolean(environment.indexedDB),
    online: typeof environment.navigator?.onLine === 'boolean' ? environment.navigator.onLine : null,
    userAgent: String(environment.navigator?.userAgent ?? '').slice(0,500),
  };
}

function throwIfStopped(context) {
  if (context.signal.aborted) throw context.signal.reason ?? cancelled();
  if (Date.now() >= context.deadline) throw problem('Installation check reached its total time limit.', 'INSTALLATION_CHECK_TIMEOUT');
}

async function bounded(context, operation, maximumMs, cleanup = () => {}) {
  throwIfStopped(context);
  let timer, onAbort;
  const wait = Math.max(1,Math.min(maximumMs,context.deadline-Date.now()));
  const ended = new Promise((_, reject) => {
    onAbort = () => { try { cleanup(); } catch {} reject(context.signal.reason ?? cancelled()); };
    context.signal.addEventListener('abort',onAbort,{once:true});
    timer = setTimeout(() => { try { cleanup(); } catch {} reject(problem(`The check did not finish within ${wait / 1000} seconds.`, 'INSTALLATION_REQUEST_TIMEOUT')); },wait);
  });
  try { return await Promise.race([Promise.resolve().then(() => { throwIfStopped(context); return operation(); }),ended]); }
  finally { clearTimeout(timer); context.signal.removeEventListener('abort',onAbort); }
}

async function fetchBytes(context, url, limit) {
  const controller = new AbortController(); let reader;
  const cleanup = () => { controller.abort(); try { Promise.resolve(reader?.cancel()).catch(() => {}); } catch {} };
  const stillReading = () => { throwIfStopped(context); if (controller.signal.aborted) throw problem('The response check has already timed out or stopped.', 'INSTALLATION_REQUEST_TIMEOUT'); };
  try {
    return await bounded(context,async () => {
      const response = await context.fetch(url,{cache:'no-store',credentials:'same-origin',mode:'same-origin',redirect:'error',signal:controller.signal});
      stillReading();
      if (!response?.ok) throw problem(`HTTP ${response?.status ?? 'response unavailable'} for ${url}.`, 'INSTALLATION_HTTP', {assetUrl:url,httpStatus:response?.status});
      const contentType = response.headers?.get('content-type') ?? '', mime = contentType.split(';')[0].trim().toLowerCase();
      if (response.url && response.url !== url) throw problem(`A redirected response was rejected for ${url}.`, 'INSTALLATION_REDIRECT', {assetUrl:url});
      const length = response.headers?.get('content-length'), encoding = response.headers?.get('content-encoding');
      const responseFields = {assetUrl:url,httpStatus:response.status,contentType,expectedBytes:limit,declaredBytes:length?.slice(0,100) ?? null,contentEncoding:encoding?.slice(0,100) ?? null};
      if ((!encoding || encoding.toLowerCase() === 'identity') && /^\d+$/.test(length ?? '') && Number(length) > limit) throw problem(`Response declares ${length.slice(0,100)} bytes; the permitted maximum is ${limit}. HTTP ${response.status}; Content-Type ${contentType || '(missing)'}.`, 'INSTALLATION_RESPONSE_SIZE', responseFields);
      const chunks = []; let size = 0;
      if (response.body?.getReader) {
        reader = response.body.getReader();
        while (true) {
          const {done,value} = await reader.read(); stillReading();
          if (done) break;
          size += value.length;
          if (size > limit) throw problem(`Response supplied at least ${size} decoded bytes; the permitted maximum is ${limit}. HTTP ${response.status}; Content-Type ${contentType || '(missing)'}.`, 'INSTALLATION_RESPONSE_SIZE', {...responseFields,observedBytes:size});
          chunks.push(value);
        }
      } else {
        if (!/^\d+$/.test(length ?? '') || Number(length) > limit) throw problem('This browser response cannot be read within the declared byte bound.', 'INSTALLATION_BOUNDED_READ_UNAVAILABLE', {unavailable:true,assetUrl:url});
        const value = new Uint8Array(await response.arrayBuffer()); stillReading(); size = value.length;
        if (size > limit) throw problem(`Response supplied ${size} decoded bytes; the permitted maximum is ${limit}.`, 'INSTALLATION_RESPONSE_SIZE', {...responseFields,observedBytes:size});
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
      return {bytes,mime,contentType,httpStatus:response.status};
    },context.requestMs,cleanup);
  } finally { cleanup(); try { reader?.releaseLock(); } catch {} }
}

function validateAsset(file, response) {
  const {bytes,mime} = response, html = /^(?:text\/html|application\/xhtml\+xml)$/.test(mime) || /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(new TextDecoder().decode(bytes.subarray(0,256)));
  if (html) throw problem('The host returned HTML in place of this runtime file.', 'INSTALLATION_HTML_ASSET');
  if (file.path.endsWith('.js') && !JS_MIMES.has(mime)) throw problem(`JavaScript cannot use Content-Type ${mime || '(missing)'}.`, 'INSTALLATION_CONTENT_TYPE');
  if (file.path.endsWith('.css') && mime !== 'text/css') throw problem(`Stylesheet has Content-Type ${mime || '(missing)'}.`, 'INSTALLATION_CONTENT_TYPE');
  if (file.path.endsWith('.wasm') && (bytes.length < 8 || [0,97,115,109,1,0,0,0].some((value,index) => bytes[index] !== value))) throw problem('The response is not a supported WebAssembly binary.', 'INSTALLATION_WASM_SIGNATURE');
  if (bytes.length !== file.bytes) throw problem(`Expected ${file.bytes} bytes; received ${bytes.length}. Upload matching complete assets.`, 'INSTALLATION_BYTE_MISMATCH');
}

/** Tiny authored fixtures, separate from every working project and saved result. */
export function installationFixtures() {
  const make = solver => { const p = newProject('CircuitBench installation check'); Object.assign(p.analysis,{type:'tran',solver,duration:'4m',step:'10u',uic:true}); return p; };
  const add = (p,type,params = {}) => { const c = addComponent(p,type); Object.assign(c.params,params); return c; };
  const pin = (c,name) => `${c.id}:${name}`;
  const wire = (p,a,pa,b,pb) => { const id = uid('w'); p.circuit.connections.push({id,a:pin(a,pa),b:pin(b,pb)}); p.layout.wires[id] = {points:[]}; };
  const label = (p,c,name,text) => p.circuit.labels.push({id:uid('label'),target:pin(c,name),name:text});
  const digital = make('ngspice'); digital.analysis.duration = '100n'; digital.analysis.step = '1n'; digital.analysis.uic = false;
  const source = add(digital,'DVS',{state:'1'}), gate = add(digital,'NOT',{delay:'10n'}), indicator = add(digital,'DLED');
  wire(digital,source,'out',gate,'in'); wire(digital,gate,'out',indicator,'in'); label(digital,source,'out','check_high'); label(digital,gate,'out','check_low');
  const generatedDigital = generateNetlist(digital);
  const coordinated = make('coordinated'), dac = add(coordinated,'DAC',{rise:'1u',fall:'1u'}), r = add(coordinated,'R',{value:'10k'}), c = add(coordinated,'C',{value:'100n',ic:'0'}), adc = add(coordinated,'ADC',{low:'1.5',high:'3.5',mode:'schmitt'}), inv = add(coordinated,'NOT',{delay:'1u'}), ground = add(coordinated,'GND');
  wire(coordinated,dac,'out',r,'1'); wire(coordinated,r,'2',c,'1'); wire(coordinated,c,'1',adc,'in'); wire(coordinated,c,'2',ground,'0'); wire(coordinated,dac,'ref',ground,'0'); wire(coordinated,adc,'ref',ground,'0'); wire(coordinated,adc,'out',inv,'in'); wire(coordinated,inv,'out',dac,'in');
  label(coordinated,c,'1','check_voltage'); label(coordinated,adc,'out','check_sense'); label(coordinated,inv,'out','check_command');
  const generatedCoordinated = generateNetlist(coordinated);
  for (const generated of [generatedDigital,generatedCoordinated]) {
    const errors = generated.diagnostics.filter(d => d.severity === 'error');
    if (errors.length) throw problem('An installation fixture could not be compiled: '+errors.map(d => d.message).join(' · '), 'INSTALLATION_FIXTURE');
  }
  return {
    digital:{...generatedDigital.simulation.digital,duration:generatedDigital.simulation.duration},
    coordinated:compileCoordinated(coordinated,generatedCoordinated),
    analog:'CircuitBench installation check\nV1 in 0 10\nR1 in out 10000\nR2 out 0 10000\n.options reltol=1e-6 abstol=1e-12 vntol=1e-9\n.op\n.end\n',
  };
}

const vector = (result,name) => result?.vectors?.find(item => item.name === name)?.values;
async function engineCheck(kind, context, fixture) {
  const engine = context.engineFactories[kind]();
  if (!engine || typeof engine.stop !== 'function') throw problem('Installation engine adapter is unavailable.', 'INSTALLATION_ENGINE_ADAPTER');
  const cleanup = () => { try { engine.stop(); } catch {} };
  try {
    return await bounded(context,async () => {
      if (kind === 'digital') {
        const result = await engine.run(fixture.digital,{timeoutMs:context.engineMs}); throwIfStopped(context);
        const last = node => result?.traces?.find(trace => trace.node === node)?.events?.at(-1)?.value;
        if (last('check_high') !== '1' || last('check_low') !== '0') throw problem('Digital worker returned an incorrect HIGH/NOT result.', 'INSTALLATION_DIGITAL_RESULT');
        return {fixture:'Binary source and inverter',high:'1',inverted:'0',engine:result.engine?.build ?? result.engine?.version ?? null};
      }
      if (kind === 'coordinated') {
        await engine.start(fixture.coordinated,{timeoutMs:context.engineMs}); throwIfStopped(context);
        const first = await engine.advanceTo(.002,{maxSteps:2000,timeoutMs:context.engineMs}); throwIfStopped(context);
        const second = await engine.advanceTo(.004,{maxSteps:2000,timeoutMs:context.engineMs}); throwIfStopped(context);
        const firstTimes = vector(first,'time'), secondTimes = vector(second,'time'), firstVoltage = vector(first,'v(check_voltage)'), secondVoltage = vector(second,'v(check_voltage)');
        const commandEvents = [...(first.digitalEvents?.find(trace => trace.name === 'd(check_command)')?.events ?? []),...(second.digitalEvents?.find(trace => trace.name === 'd(check_command)')?.events ?? [])];
        if (!first.done || !second.done || firstTimes?.at(-1) !== .002 || secondTimes?.[0] !== .002 || secondTimes?.at(-1) !== .004 || !Number.isFinite(firstVoltage?.at(-1)) || !Number.isFinite(secondVoltage?.[0]) || Math.abs(firstVoltage.at(-1)-secondVoltage[0]) > 1e-10 || !commandEvents.some(event => event.value === '0') || !commandEvents.some(event => event.value === '1') || !commandEvents.some(event => event.time > .002 && event.value === '1') || secondVoltage.some(value => !Number.isFinite(value) || value < -1e-9 || value > 5+1e-9)) throw problem('The coordinated worker did not preserve the expected closed-loop state across both updates.', 'INSTALLATION_COORDINATED_RESULT');
        return {fixture:'Schmitt RC feedback across two retained updates',completedTime:.004,boundaryVoltage:firstVoltage.at(-1),finalVoltage:secondVoltage.at(-1),engine:second.engine?.build ?? null};
      }
      const result = await engine.run(fixture.analog,{timeoutMs:context.engineMs}); throwIfStopped(context);
      const voltage = vector(result,'v(out)')?.at(-1);
      if (!Number.isFinite(voltage) || Math.abs(voltage-5) > 1e-8) throw problem('The WebAssembly engine did not return the expected 5 V divider result.', 'INSTALLATION_NGSPICE_RESULT');
      return {fixture:'10 V equal-resistor divider',expectedVoltage:5,measuredVoltage:voltage,engine:result.engine?.name ?? 'ngspice',engineVersion:result.engine?.version ?? null};
    },context.engineMs,cleanup);
  } finally { cleanup(); }
}

/** Run checks with one total deadline. Callback snapshots never expose project data. */
export async function runInstallationCheck({
  baseURL = new URL('./',globalThis.document?.baseURI ?? globalThis.location?.href ?? import.meta.url).href,
  version = VERSION, buildHash = null, signal, onProgress = () => {}, environment = globalThis,
  fetchImpl = environment.fetch?.bind(environment), cryptoImpl = environment.crypto?.subtle,
  engineFactories = {digital:() => new DigitalEngine(),coordinated:() => new CoordinatedEngine(),ngspice:() => new CircuitEngine()},
  timeouts = {},
} = {}) {
  const started = Date.now(), capabilities = environmentInfo(environment), controller = new AbortController();
  const duration = (key,fallback) => Math.max(1,Math.min(fallback,Number(timeouts[key]) || fallback));
  const report = {format:'CircuitBench installation check',formatVersion:1,version,loadedBuild:buildHash && BUILD.test(buildHash) ? buildHash : null,manifestBuild:null,scope:null,startedAt:new Date(started).toISOString(),completedAt:null,status:'running',currentStep:null,environment:capabilities,checks:[],summary:{passed:0,failed:0,unavailable:0},limitations:[
    'Checks the downloaded runtime against this installation’s advertised release, then runs independent smoke circuits. It is not publisher-signature verification or a general numerical validation.',
    'Offline reload, upgrade, recovery and output downloads require separate browser acceptance. This check does not clear caches, alter service-worker registrations, read projects or write project storage.',
    'The canonical offline HTML is embedded in the verified service worker. Host-modified navigation HTML is not compared byte-for-byte with the release shell.',
  ]};
  const context = {signal:controller.signal,deadline:started+duration('totalMs',INSTALLATION_CHECK_LIMITS.totalMs),requestMs:duration('requestMs',INSTALLATION_CHECK_LIMITS.requestMs),engineMs:duration('engineMs',INSTALLATION_CHECK_LIMITS.engineMs),fetch:fetchImpl,crypto:cryptoImpl,engineFactories};
  const emit = () => { report.summary = {passed:report.checks.filter(c => c.status === 'passed').length,failed:report.checks.filter(c => c.status === 'failed').length,unavailable:report.checks.filter(c => c.status === 'unavailable').length}; try { onProgress(structuredClone(report)); } catch {} };
  const record = item => { report.checks.push(item); emit(); return item; };
  const failure = (id,label,error,extra = {}) => record({id,label,status:error?.unavailable ? 'unavailable' : 'failed',message:messageOf(error),...Object.fromEntries(ERROR_FIELDS.filter(key => error?.[key] !== undefined).map(key => [key,typeof error[key] === 'string' ? error[key].slice(0,1000) : error[key]])),...extra});
  const onAbort = () => controller.abort(cancelled());
  signal?.addEventListener('abort',onAbort,{once:true}); if (signal?.aborted) onAbort();
  const deadlineTimer = setTimeout(() => controller.abort(problem('Installation check reached its total time limit.', 'INSTALLATION_CHECK_TIMEOUT')),duration('totalMs',INSTALLATION_CHECK_LIMITS.totalMs));
  try {
    throwIfStopped(context); report.scope = scopeURL(baseURL);
    record({id:'loaded-build',label:'Loaded application identity',status:report.loadedBuild ? 'passed' : 'unavailable',message:report.loadedBuild ? `Loaded ${version}, build ${report.loadedBuild}.` : `Loaded ${version}. This page does not provide a release build identity; a complete match to its manifests cannot be established.`});
    record({id:'sha256',label:'SHA-256 verification',status:typeof cryptoImpl?.digest === 'function' ? 'passed' : 'unavailable',message:typeof cryptoImpl?.digest === 'function' ? 'Cryptographic byte comparison is available.' : 'SHA-256 is unavailable here. File types and lengths can be checked, but exact byte identity cannot be confirmed. Use HTTPS or localhost.'});
    let manifest;
    try {
      report.currentStep = 'Reading release and recovery manifests…'; emit();
      if (typeof fetchImpl !== 'function') throw problem('This browser cannot fetch installation files.', 'INSTALLATION_FETCH_UNAVAILABLE', {unavailable:true});
      const releaseResponse = await fetchBytes(context,new URL('release-manifest.json',report.scope).href,INSTALLATION_CHECK_LIMITS.manifestBytes);
      const recoveryResponse = await fetchBytes(context,new URL('recovery-manifest.json',report.scope).href,INSTALLATION_CHECK_LIMITS.manifestBytes);
      let release, recovery;
      try { release = JSON.parse(new TextDecoder().decode(releaseResponse.bytes)); recovery = JSON.parse(new TextDecoder().decode(recoveryResponse.bytes)); }
      catch { throw problem('The release or recovery manifest is not valid JSON. Check for an HTML fallback or incomplete upload.', 'INSTALLATION_MANIFEST_JSON'); }
      manifest = validateInstallationManifests(release,recovery,{baseURL:report.scope,version,buildHash:report.loadedBuild});
      if (typeof cryptoImpl?.digest === 'function') {
        const actual = hex(await bounded(context,() => cryptoImpl.digest('SHA-256',recoveryResponse.bytes),context.requestMs));
        if (actual !== manifest.recoverySha256) throw problem('The recovery manifest bytes do not match the release manifest.', 'INSTALLATION_RECOVERY_HASH');
      }
      report.manifestBuild = manifest.buildHash;
      record({id:'manifests',label:'Release and recovery manifests',status:'passed',message:`Both identify ${version}, build ${manifest.buildHash}, with ${manifest.files.length} bounded runtime files.`,details:{files:manifest.files.length,declaredBytes:manifest.totalBytes}});
    } catch (error) { if (controller.signal.aborted) throw error; manifest = null; failure('manifests','Release and recovery manifests',error); }
    if (manifest) {
      report.currentStep = 'Checking runtime file responses…'; emit();
      let next = 0;
      const checkFile = async () => {
        while (next < manifest.files.length && !controller.signal.aborted) {
          const file = manifest.files[next++];
          let response;
          try {
            response = await fetchBytes(context,file.url,file.bytes); validateAsset(file,response);
            let hash = null;
            if (typeof cryptoImpl?.digest === 'function') {
              hash = hex(await bounded(context,() => cryptoImpl.digest('SHA-256',response.bytes),context.requestMs));
              if (hash !== file.sha256) throw problem('SHA-256 differs from the advertised release. The file is stale, changed or from another build.', 'INSTALLATION_ASSET_HASH');
            }
            throwIfStopped(context);
            record({id:`asset:${file.path}`,label:file.path,status:hash ? 'passed' : 'unavailable',message:hash ? 'File type, byte count and SHA-256 match.' : 'File type and byte count match; SHA-256 verification is unavailable.',assetUrl:file.url,httpStatus:response.httpStatus,contentType:response.contentType,details:{bytes:response.bytes.length,sha256:hash}});
          } catch (error) { if (controller.signal.aborted) return; failure(`asset:${file.path}`,file.path,error,{assetUrl:file.url,...(response ? {httpStatus:response.httpStatus,contentType:response.contentType,observedBytes:response.bytes.length} : {})}); }
        }
      };
      await Promise.all(Array.from({length:Math.min(INSTALLATION_CHECK_LIMITS.concurrency,manifest.files.length)},checkFile));
    } else record({id:'assets',label:'Runtime files',status:'unavailable',message:'No manifest-controlled asset was requested because the manifest pair could not be validated.'});
    throwIfStopped(context);
    const fixture = installationFixtures();
    for (const [kind,label] of [['digital','Digital logic worker'],['coordinated','Coordinated feedback worker'],['ngspice','ngspice WebAssembly worker']]) {
      throwIfStopped(context);
      report.currentStep = `Running ${label.toLowerCase()} check…`; emit();
      if (!capabilities.worker || kind === 'ngspice' && !capabilities.webAssembly) { record({id:`engine:${kind}`,label,status:'unavailable',message:!capabilities.worker ? 'Web Workers are unavailable in this browser.' : 'WebAssembly is unavailable in this browser.'}); continue; }
      try { const details = await engineCheck(kind,context,fixture); record({id:`engine:${kind}`,label,status:'passed',message:`${details.fixture} completed with the expected result.`,details}); }
      catch (error) { if (controller.signal.aborted) throw error; failure(`engine:${kind}`,label,error); }
    }
    report.status = report.summary.failed ? 'failed' : report.summary.unavailable ? 'partial' : 'passed';
  } catch (error) {
    const reason = controller.signal.aborted ? controller.signal.reason : error;
    if (reason?.code === 'INSTALLATION_CHECK_CANCELLED' || reason?.name === 'AbortError') { report.status = 'cancelled'; report.message = messageOf(reason); }
    else { failure('check','Installation check',reason); report.status = 'failed'; }
  } finally {
    clearTimeout(deadlineTimer); signal?.removeEventListener('abort',onAbort); controller.abort();
    report.currentStep = null; report.completedAt = new Date().toISOString(); report.durationMs = Math.max(0,Date.now()-started); emit();
  }
  return report;
}
