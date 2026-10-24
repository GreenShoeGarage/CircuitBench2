/** Executes the generated service worker in a minimal Cache/Event VM harness.
 * This verifies logic and packaged inputs, NOT a browser's service-worker,
 * HTTPS, lifecycle, installation, or network-disconnected reload behavior.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const dist=path.join(root,'dist');
const manifest=JSON.parse(await fs.readFile(path.join(dist,'release-manifest.json'),'utf8'));
const source=await fs.readFile(path.join(dist,manifest.serviceWorker),'utf8');
const asset=file=>manifest.runtimeBase+'/'+file,assetRef=file=>'./'+asset(file);
const swHash=createHash('sha256').update(source).digest('hex');
const fileBytes=new Map();
console.log('LOGIC-LEVEL OFFLINE VERIFICATION ONLY. No browser service-worker or disconnected-network reload is claimed.');
console.log(`Generated dist/${manifest.serviceWorker} SHA-256: ${swHash}; version ${manifest.version}; build ${manifest.buildHash}`);

class MemoryResponse {
  constructor(url,bytes,{status=200,mime='application/octet-stream'}={}){this.url=url;this.bytes=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);this.status=status;this.ok=status>=200&&status<300;this.headers=new Headers({'content-type':mime});this.type='basic';}
  clone(){return new MemoryResponse(this.url,this.bytes,{status:this.status,mime:this.headers.get('content-type')});}
  async text(){return this.bytes.toString('utf8');}
  async arrayBuffer(){return this.bytes.buffer.slice(this.bytes.byteOffset,this.bytes.byteOffset+this.bytes.byteLength);}
}

const mimeFor=file=>file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.wasm')?'application/wasm':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webmanifest')?'application/manifest+json':'application/json';

function harness(scope,{store=new Map(),failFile=null,failPut=null,crypto=webcrypto}={}){
  const workerURL=new URL(manifest.serviceWorker,scope).href,events=new Map(),state={offline:false,requests:[],claimed:0,skipWaiting:0,overrides:new Map(),staleHTTP:new Map(),failFile,failPut};
  const key=request=>{const url=new URL(typeof request==='string'?request:request.url,workerURL);url.hash='';return url.href;};
  async function network(request){
    const url=new URL(key(request)),cache=typeof request==='string'?'default':request.cache??'default';state.requests.push({url:url.href,cache});
    if(state.offline)throw new Error('Simulated network disconnected');
    if(url.origin!==new URL(scope).origin||!url.href.startsWith(scope))throw new Error('Outside test origin/scope');
    let relative=url.pathname.slice(new URL(scope).pathname.length);const rootRequest=!relative;if(!relative)relative='index.html';
    if(relative===state.failFile)throw new Error(`Simulated missing runtime asset: ${relative}`);
    if(relative.includes('..')||relative.startsWith('/'))throw new Error('Invalid fixture path');
    if(!fileBytes.has(relative))fileBytes.set(relative,await fs.readFile(path.join(dist,relative)));
    const override=(cache!=='reload'&&state.staleHTTP.get(relative))||state.overrides.get(rootRequest?'./':relative)||{};
    return new MemoryResponse(url.href,override.bytes??fileBytes.get(relative),{status:override.status??200,mime:override.mime??mimeFor(relative)});
  }
  const caches={
    async open(name){
      if(!store.has(name))store.set(name,new Map());const entries=store.get(name);
      return {
        async put(request,response){if(state.failPut&&new URL(key(request)).pathname.endsWith('/'+state.failPut))throw new Error('Simulated cache quota failure');entries.set(key(request),response.clone());},
        async match(request,options={}){
          const wanted=new URL(key(request));
          if(!options.ignoreSearch)return entries.get(wanted.href)?.clone();
          wanted.search='';for(const [stored,response] of entries){const candidate=new URL(stored);candidate.search='';if(candidate.href===wanted.href)return response.clone();}return undefined;
        }
      };
    },
    async keys(){return [...store.keys()];},
    async delete(name){return store.delete(name);}
  };
  const self={registration:{scope},location:new URL(workerURL),clients:{async claim(){state.claimed++;}},skipWaiting(){state.skipWaiting++;},addEventListener(type,handler){events.set(type,handler);}};
  const context=vm.createContext({self,caches,URL,Request,Response,Headers,crypto,fetch:network,console});
  // Read lexical metadata without replacing any generated service-worker logic.
  vm.runInContext(source+'\nglobalThis.__meta={VERSION,BUILD,PREFIX,CACHE,FILES,INTEGRITY,SHELL_HTML};',context,{filename:'generated-dist-sw.js'});
  const meta=structuredClone(context.__meta);
  async function dispatch(type,extra={}){
    const waits=[];let responsePromise,intercepted=false;
    const event={...extra,waitUntil(p){waits.push(Promise.resolve(p));},respondWith(p){intercepted=true;responsePromise=Promise.resolve(p);}};
    const handler=events.get(type);assert.equal(typeof handler,'function',`Generated worker registers ${type}`);handler(event);
    await Promise.all(waits);return {intercepted,response:responsePromise?await responsePromise:undefined};
  }
  async function status(){let answer;await dispatch('message',{data:{type:'CACHE_STATUS'},ports:[{postMessage(value){answer=structuredClone(value);}}]});return answer;}
  async function request(relative,method='GET',mode,cache='default'){const request=new Request(new URL(relative,scope).href,{method,cache});if(mode)Object.defineProperty(request,'mode',{value:mode});return dispatch('fetch',{request});}
  return {scope,meta,state,store,dispatch,status,request};
}

test('generated precache lists every real runtime asset, including actual WebAssembly bytes',async()=>{
  const h=harness('https://circuitbench.test/');
  assert.equal(h.meta.VERSION,manifest.version);assert.equal(h.meta.BUILD,manifest.buildHash);
  assert.ok(h.meta.FILES.includes(assetRef('engine/spice.wasm')));
  assert.ok(h.meta.FILES.includes(assetRef('engine/eecircuit-engine.js')));
  assert.ok(!h.meta.FILES.some(file=>file.endsWith('.mjs')),'Runtime uses broadly recognized .js module names');
  assert.ok(h.meta.FILES.includes(assetRef('src/engine-worker.js')));
  assert.deepEqual([...h.meta.FILES].sort(),['./',...manifest.runtimeFiles.map(f=>'./'+f)].sort());
  for(const item of h.meta.FILES){assert.ok(item.startsWith('./'));const file=item==='./'?'index.html':item.slice(2);const stat=await fs.stat(path.join(dist,file));assert.ok(stat.isFile()&&stat.size>0,file);assert.equal(h.meta.INTEGRITY[item].sha256,manifest.files[file]);assert.equal(h.meta.INTEGRITY[item].bytes,stat.size);}
  const wasm=await fs.readFile(path.join(dist,asset('engine/spice.wasm')));assert.equal(wasm.subarray(0,4).toString('hex'),'0061736d');assert.ok(wasm.length>1000000,'Fixture is the real compiled runtime, not a placeholder');
  await h.dispatch('install');const status=await h.status();assert.equal(status.ready,true);assert.equal(status.version,manifest.version);assert.equal(status.build,manifest.buildHash);
});

for(const scope of ['https://circuitbench.test/','https://circuitbench.test/tools/circuitbench/']){
  test(`scope-relative install and cached offline fetch work in VM at ${new URL(scope).pathname}`,async()=>{
    const h=harness(scope);await h.dispatch('install');await h.dispatch('activate');
    assert.equal(h.state.claimed,1);assert.equal(h.state.skipWaiting,0,'Install/activate do not force a waiting update');
    assert.ok(h.state.requests.every(({url})=>url.startsWith(scope)),'No root-absolute asset leak from subdirectory');
    assert.ok(h.state.requests.every(({cache})=>cache==='reload'),'Installation bypasses stale HTTP-cache bytes');
    h.state.offline=true;const before=h.state.requests.length;
    for(const file of h.meta.FILES){const result=await h.request(file);assert.equal(result.intercepted,true,file);assert.equal(result.response?.ok,true,file);}
    assert.equal(h.state.requests.length,before,'All essential offline requests served from the precache');
    const index=await h.request('./index.html?opened=offline','GET','navigate');assert.match(await index.response.text(),/CircuitBench/);
    const wasm=await h.request(assetRef('engine/spice.wasm'));assert.equal(Buffer.from(await wasm.response.arrayBuffer()).subarray(0,4).toString('hex'),'0061736d');
    assert.equal((await h.status()).ready,true);
  });
}

test('canonical shell caching avoids injected host HTML and a redirected/missing index.html alias',async()=>{
  const h=harness('https://circuitbench.test/tools/circuitbench/');
  h.state.overrides.set('./',{bytes:'<!doctype html><script src="https://analytics.invalid/injected.js"></script>',mime:'text/html'});
  h.state.overrides.set('index.html',{status:404,bytes:'<html>Redirected /index/ route does not exist</html>',mime:'text/html'});
  await h.dispatch('install');assert.equal((await h.status()).ready,true);
  assert.ok(h.state.requests.every(({url})=>{const path=new URL(url).pathname;return path!==new URL(h.scope).pathname&&!path.endsWith('/index.html');}),'Neither HTML alias is fetched from the host');
  const canonical=await fs.readFile(path.join(dist,'index.html'),'utf8');assert.equal(h.meta.SHELL_HTML,canonical);
  h.state.offline=true;
  for(const path of ['./','./index.html','./?after=repair','./index.html?after=repair']){
    const result=await h.request(path,'GET','navigate');assert.equal(await result.response.text(),canonical,path);assert.equal(result.response.headers.get('content-type'),'text/html; charset=utf-8');
  }
});

test('asset release directories and query pins never substitute one another in the cache',async()=>{
  const h=harness('https://circuitbench.test/app/'),oldPath='./assets/0.0.0-prior/src/engine-worker.js';
  const oldURL=new URL(oldPath,h.scope).href;
  h.store.set(h.meta.PREFIX+'0.0.0-prior:old-build',new Map([[oldURL,new MemoryResponse(oldURL,'old worker',{mime:'text/javascript'})]]));
  await h.dispatch('install');h.state.offline=true;
  const current=await h.request(assetRef('src/engine-worker.js'));assert.equal(await current.response.text(),await fs.readFile(path.join(dist,asset('src/engine-worker.js')),'utf8'));
  for(const path of [oldPath,'./src/engine-worker.js',assetRef('src/engine-worker.js')+'?release=prior',assetRef('engine/spice.wasm')+'?pin=another','./index.html?not-a-navigation']){
    await assert.rejects(()=>h.request(path),/network disconnected/,path);
  }
});

test('reload and no-store asset diagnostics observe the network without stale-cache fallback',async()=>{
  const h=harness('https://circuitbench.test/app/');await h.dispatch('install');
  h.state.overrides.set(asset('src/engine-worker.js'),{status:404,bytes:'Worker missing on the current host',mime:'text/plain'});
  for(const cache of ['reload','no-store']){
    const result=await h.request(assetRef('src/engine-worker.js'),'GET',undefined,cache);
    assert.equal(result.response.status,404);assert.equal(await result.response.text(),'Worker missing on the current host');
  }
  assert.equal((await h.status()).ready,true,'A diagnostic fetch does not overwrite the verified offline copy');
  h.state.offline=true;
  for(const cache of ['reload','no-store'])await assert.rejects(()=>h.request(assetRef('src/engine-worker.js'),'GET',undefined,cache),/network disconnected/);
  assert.equal((await h.request(assetRef('src/engine-worker.js'))).response.status,200,'Ordinary cached requests remain available offline');
});

test('canonical navigation reload uses fresh responses and falls back only on network failure',async()=>{
  const h=harness('https://circuitbench.test/app/');await h.dispatch('install');
  h.state.overrides.set('./',{status:404,bytes:'Live route not found',mime:'text/html'});
  const live=await h.request('./?reload=1','GET','navigate','reload');assert.equal(live.response.status,404);assert.equal(await live.response.text(),'Live route not found');
  h.state.offline=true;
  for(const file of ['./?reload=1','./index.html?reload=1'])assert.equal(await (await h.request(file,'GET','navigate','reload')).response.text(),h.meta.SHELL_HTML);
  await assert.rejects(()=>h.request('./missing-route/','GET','navigate','reload'),/network disconnected/);
  await assert.rejects(()=>h.request('./','GET','navigate','no-store'),/network disconnected/);
});

test('uncached resources fall back to network and fail honestly while offline',async()=>{
  const h=harness('https://circuitbench.test/workbench/');await h.dispatch('install');
  const online=await h.request('./README.md');assert.equal(online.intercepted,true);assert.match(await online.response.text(),/CircuitBench/);
  h.state.offline=true;await assert.rejects(()=>h.request('./README.md'),/network disconnected/);
});

test('non-GET, foreign-origin, and out-of-scope requests are not intercepted',async()=>{
  const h=harness('https://circuitbench.test/tools/circuitbench/');await h.dispatch('install');
  for(const [url,method]of [[new URL('index.html',h.scope).href,'POST'],['https://another.test/index.html','GET'],['https://circuitbench.test/another/index.html','GET'],['https://circuitbench.test/tools/circuitbench-neighbor/index.html','GET']]){
    const result=await h.dispatch('fetch',{request:{url,method}});assert.equal(result.intercepted,false,url);assert.equal(result.response,undefined);
  }
});

test('a failed runtime fetch cannot advertise offline readiness or leave a partial install',async()=>{
  const h=harness('https://circuitbench.test/',{failFile:asset('engine/spice.wasm')});
  await assert.rejects(()=>h.dispatch('install'),/missing runtime asset/);
  assert.equal((await h.status()).ready,false);
  assert.equal(h.state.claimed,0);assert.equal(h.state.skipWaiting,0);
  assert.equal(h.store.get(h.meta.CACHE).size,0,'No cache writes happen before every response has passed verification');
});

test('HTTP-200 HTML in place of the WASM binary is rejected before caching',async()=>{
  const h=harness('https://circuitbench.test/');
  h.state.overrides.set(asset('engine/spice.wasm'),{bytes:'<!doctype html><title>Static-host fallback</title>',mime:'text/html'});
  await assert.rejects(()=>h.dispatch('install'),/invalid WebAssembly magic/);
  assert.equal((await h.status()).ready,false);assert.equal(h.store.get(h.meta.CACHE).size,0);
});

test('module and stylesheet content types must be usable by the browser',async()=>{
  for(const [file,mime,expected]of [[asset('engine/eecircuit-engine.js'),'application/octet-stream',/JavaScript MIME/],[asset('src/engine-worker.js'),'text/plain',/JavaScript MIME/],[asset('style.css'),'text/html',/CSS MIME/]]){
    const h=harness('https://circuitbench.test/');h.state.overrides.set(file,{mime});
    await assert.rejects(()=>h.dispatch('install'),expected,file);assert.equal((await h.status()).ready,false,file);
  }
});

test('valid binary bytes with generic MIME remain usable with the buffered WASM loader',async()=>{
  const h=harness('https://circuitbench.test/');
  h.state.overrides.set(asset('engine/spice.wasm'),{mime:'application/octet-stream'});
  h.state.overrides.set(asset('engine/eecircuit-engine.js'),{mime:'application/javascript; charset=utf-8'});
  await h.dispatch('install');assert.equal((await h.status()).ready,true);
});

test('SHA-256 rejects same-length stale JavaScript and modified WASM with valid magic',async()=>{
  for(const file of [asset('src/app.js'),asset('engine/spice.wasm')]){
    const bytes=Buffer.from(await fs.readFile(path.join(dist,file)));bytes[bytes.length-1]^=1;
    const h=harness('https://circuitbench.test/');h.state.overrides.set(file,{bytes});
    await assert.rejects(()=>h.dispatch('install'),/SHA-256 differs/,file);assert.equal((await h.status()).ready,false);
  }
});

test('fresh installation bypasses a stale HTTP cache after the hosting files are repaired',async()=>{
  const h=harness('https://circuitbench.test/tools/circuitbench/');
  h.state.staleHTTP.set(asset('engine/spice.wasm'),{bytes:'<html>Previous broken upload</html>',mime:'text/html'});
  await h.dispatch('install');assert.equal((await h.status()).ready,true);
  assert.ok(h.state.requests.every(request=>request.cache==='reload'));
  const result=await h.request(assetRef('engine/spice.wasm'));assert.equal(Buffer.from(await result.response.arrayBuffer()).subarray(0,4).toString('hex'),'0061736d');
});

test('a verified new build replaces a poisoned prior build without deleting other scopes',async()=>{
  const store=new Map(),h=harness('https://circuitbench.test/tools/circuitbench/',{store});
  const prior=h.meta.PREFIX+'1.0.0-rc.1:prior-build';
  const other='circuitbench:https://circuitbench.test/another/|1.0.0-rc.1:prior-build';
  const url=new URL('engine/spice.wasm',h.scope).href;
  store.set(prior,new Map([[url,new MemoryResponse(url,'<html>Previous broken upload</html>',{mime:'text/html'})]]));
  store.set(other,new Map());
  await h.dispatch('install');assert.ok(store.has(prior),'Installation does not delete the still-active previous build');
  assert.equal((await h.status()).ready,true);await h.dispatch('activate');assert.ok(!store.has(prior));assert.ok(store.has(other));
  h.state.offline=true;const result=await h.request(assetRef('engine/spice.wasm'));
  assert.equal(Buffer.from(await result.response.arrayBuffer()).subarray(0,4).toString('hex'),'0061736d');
});

test('failed cache writes clean the incomplete new cache while preserving the prior build',async()=>{
  const h=harness('https://circuitbench.test/',{failPut:asset('engine/spice.wasm')}),prior=h.meta.PREFIX+'previous-build';
  h.store.set(prior,new Map());await assert.rejects(()=>h.dispatch('install'),/quota failure/);
  assert.ok(!h.store.has(h.meta.CACHE));assert.ok(h.store.has(prior));assert.equal((await h.status()).ready,false);
});

test('missing secure digest support refuses installation instead of weakening integrity checks',async()=>{
  // Explicit null avoids the harness's normal Web Crypto default.
  const unavailable=harness('https://circuitbench.test/',{crypto:null});
  await assert.rejects(()=>unavailable.dispatch('install'),/SHA-256 verification is unavailable/);
  assert.equal((await unavailable.status()).ready,false);assert.equal(unavailable.state.claimed,0);
});

test('readiness checks every cached runtime asset instead of accepting only the HTML shell',async()=>{
  const h=harness('https://circuitbench.test/app/');await h.dispatch('install');
  h.store.get(h.meta.CACHE).delete(new URL(asset('engine/spice.wasm'),h.scope).href);
  assert.equal((await h.status()).ready,false);
});

test('readiness rejects poisoned bytes and unusable MIME even when every cache key exists',async()=>{
  const h=harness('https://circuitbench.test/app/');await h.dispatch('install');
  const cache=h.store.get(h.meta.CACHE),url=new URL(asset('engine/spice.wasm'),h.scope).href;
  const original=cache.get(url);cache.set(url,new MemoryResponse(url,'<html>Poisoned cached response</html>',{mime:'text/html'}));
  let status=await h.status();assert.equal(status.ready,false);assert.match(status.error,/WebAssembly magic/);
  cache.set(url,original);
  const jsURL=new URL(asset('engine/eecircuit-engine.js'),h.scope).href,js=cache.get(jsURL);
  cache.set(jsURL,new MemoryResponse(jsURL,js.bytes,{mime:'text/plain'}));
  status=await h.status();assert.equal(status.ready,false);assert.match(status.error,/JavaScript MIME/);
  cache.set(jsURL,js);
  const rootURL=new URL('./',h.scope).href,html=cache.get(rootURL);
  cache.set(rootURL,new MemoryResponse(rootURL,Buffer.from(await html.clone().arrayBuffer()),{mime:'text/plain'}));
  status=await h.status();assert.equal(status.ready,false);assert.match(status.error,/HTML MIME/);
  cache.set(rootURL,html);assert.equal((await h.status()).ready,true);
});

test('cache activation cleans only older builds of the exact scope, preserving nested and sibling installs',async()=>{
  const store=new Map(),root=harness('https://circuitbench.test/',{store}),nested=harness('https://circuitbench.test/tools/circuitbench/',{store}),sibling=harness('https://circuitbench.test/another-app/',{store});
  await root.dispatch('install');await nested.dispatch('install');await sibling.dispatch('install');
  const olderRoot=root.meta.PREFIX+'0.9.0:old-build',olderNested=nested.meta.PREFIX+'0.8.0:old-build',unrelated='unrelated-product-cache';
  store.set(olderRoot,new Map());store.set(olderNested,new Map());store.set(unrelated,new Map());
  await root.dispatch('activate');assert.ok(!store.has(olderRoot));assert.ok(store.has(root.meta.CACHE));
  assert.ok(store.has(nested.meta.CACHE),'Root activation must preserve the nested installation cache');
  assert.ok(store.has(sibling.meta.CACHE),'Root activation must preserve sibling installation caches');
  assert.ok(store.has(olderNested),'Root activation must not manage another scope’s old versions');assert.ok(store.has(unrelated));
  await nested.dispatch('activate');assert.ok(!store.has(olderNested));assert.ok(store.has(root.meta.CACHE));assert.ok(store.has(nested.meta.CACHE));assert.ok(store.has(sibling.meta.CACHE));
});

test('waiting updates are activated only by explicit SKIP_WAITING message',async()=>{
  const h=harness('https://circuitbench.test/');await h.dispatch('install');assert.equal(h.state.skipWaiting,0);
  await h.dispatch('message',{data:{type:'UNRELATED'}});assert.equal(h.state.skipWaiting,0);
  await h.dispatch('message',{data:{type:'SKIP_WAITING'}});assert.equal(h.state.skipWaiting,1);
});
