import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,webcrypto} from 'node:crypto';
import {Worker as NodeWorker} from 'node:worker_threads';
import {VERSION} from '../src/model.js';
import {simulateDigital} from '../src/digital.js';
import {createCoordinatedSession} from '../src/coordinated.js';
import {INSTALLATION_CHECK_LIMITS,validateInstallationManifests,installationFixtures,runInstallationCheck} from '../src/installation-check.js';
import {installationCheckHTML,installationReportJSON,installationReportFilename,installationRepairURL} from '../src/installation-ui.js';

const scope='https://example.test/tools/circuitbench/',build='1234567890abcdef';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=text=>new TextEncoder().encode(text);
const required=['src/app.js','src/model.js','src/installation-check.js','src/engine.js','src/engine-worker.js','src/digital-engine.js','src/digital-worker.js','src/digital.js','src/coordinated-engine.js','src/coordinated-worker.js','src/coordinated.js','src/coordinated-digital.js','engine/eecircuit-engine.js','engine/spice.wasm','style.css'];
function world(){
 const prefix=`assets/${VERSION}/`,worker=`sw-${VERSION}.js`,content=new Map();
 for(const name of [...required.map(p=>prefix+p),'icon.svg','manifest.webmanifest',worker]){
  const body=name.endsWith('.wasm')?Uint8Array.of(0,97,115,109,1,0,0,0):bytes(name.endsWith('.css')?'body { color: green; }':name.endsWith('.webmanifest')?'{}':name.endsWith('.svg')?'<svg xmlns="http://www.w3.org/2000/svg"/>':`/* ${name} */\nexport const checked = true;\n`);
  content.set(name,{body,mime:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.wasm')?'application/octet-stream':name.endsWith('.svg')?'image/svg+xml':'application/manifest+json'});
 }
 const recovery={format:'CircuitBenchRecovery',formatVersion:1,version:VERSION,buildHash:build,files:[...content].map(([path,{body}])=>({path,bytes:body.length,sha256:hash(body)})),shell:{root:'./',embeddedIn:worker}};
 const recoveryBody=bytes(JSON.stringify(recovery));
 const release={name:'CircuitBench',version:VERSION,buildHash:build,runtimeBase:prefix.slice(0,-1),serviceWorker:worker,runtimeFiles:['index.html',...[...content.keys()].filter(p=>p!==worker)],files:{'index.html':hash('shell'),'recovery-manifest.json':hash(recoveryBody),...Object.fromEntries([...content].map(([p,{body}])=>[p,hash(body)]))}};
 content.set('recovery-manifest.json',{body:recoveryBody,mime:'application/json'});content.set('release-manifest.json',{body:bytes(JSON.stringify(release)),mime:'application/json'});
 const requests=[];
 const fetchImpl=async(url,options)=>{requests.push({url,options});const rel=url.slice(scope.length),entry=content.get(rel);if(!entry)return new Response('Missing',{status:404});return new Response(entry.body,{status:200,headers:{'content-type':entry.mime,...entry.headers}});};
 const environment={isSecureContext:true,fetch:fetchImpl,Worker:function(){},WebAssembly:{},crypto:webcrypto,indexedDB:{},navigator:{onLine:true,userAgent:'Installation test browser',serviceWorker:{}}};
 const lifecycle={created:[],stopped:[]};
 const factory=(kind,object)=>()=>{lifecycle.created.push(kind);return{...object,stop(){lifecycle.stopped.push(kind);}};};
 const engineFactories={digital:factory('digital',{async run(plan){return simulateDigital(plan);}}),coordinated:()=>{lifecycle.created.push('coordinated');let session;return{async start(plan){session=createCoordinatedSession(plan);},async advanceTo(time,options){return session.advanceTo(time,options);},stop(){lifecycle.stopped.push('coordinated');session=null;}};},ngspice:factory('ngspice',{async run(){return{vectors:[{name:'v(out)',values:[5]}],engine:{name:'ngspice',version:'test'}};}})};
 return{release,recovery,content,requests,fetchImpl,environment,engineFactories,lifecycle,prefix,options:{baseURL:scope,version:VERSION,buildHash:build,fetchImpl,environment,cryptoImpl:webcrypto.subtle,engineFactories}};
}
function repack(w){const body=bytes(JSON.stringify(w.recovery));w.content.set('recovery-manifest.json',{body,mime:'application/json'});w.release.files['recovery-manifest.json']=hash(body);w.content.set('release-manifest.json',{body:bytes(JSON.stringify(w.release)),mime:'application/json'});}

test('full advertised inventory, build identity and all three smoke paths pass independently',async()=>{
 const w=world(),progress=[];const r=await runInstallationCheck({...w.options,onProgress:s=>progress.push(s)});
 assert.equal(r.status,'passed');assert.equal(r.manifestBuild,build);assert.equal(r.summary.failed,0);assert.equal(r.summary.unavailable,0);
 assert.deepEqual(r.checks.filter(c=>c.id.startsWith('engine:')).map(c=>[c.id,c.status]),[['engine:digital','passed'],['engine:coordinated','passed'],['engine:ngspice','passed']]);
 assert.deepEqual(w.lifecycle.created,['digital','coordinated','ngspice']);assert.deepEqual(w.lifecycle.stopped,['digital','coordinated','ngspice']);
 assert.equal(r.checks.filter(c=>c.id.startsWith('asset:')).length,w.recovery.files.length);
 assert.equal(w.requests.length,w.recovery.files.length+2);assert.ok(w.requests.every(({options})=>options.cache==='no-store'&&options.redirect==='error'&&options.mode==='same-origin'));
 assert.ok(progress.length>r.checks.length);progress[0].checks[0].message='tampered callback';assert.notEqual(r.checks[0].message,'tampered callback');
 assert.ok(r.limitations.some(t=>t.includes('Offline reload')));assert.ok(!JSON.stringify(r).includes('projectSnapshot'));assert.ok(r.completedAt);assert.ok(r.durationMs>=0);
});

test('the authored smoke fixtures exercise real logic and actual retained feedback',()=>{
 const fixture=installationFixtures(),d=simulateDigital(fixture.digital),session=createCoordinatedSession(fixture.coordinated);
 assert.equal(d.traces.find(t=>t.node==='check_high').events.at(-1).value,'1');assert.equal(d.traces.find(t=>t.node==='check_low').events.at(-1).value,'0');
 const first=session.advanceTo(.002),next=session.advanceTo(.004),v=result=>result.vectors.find(t=>t.name==='v(check_voltage)').values;
 assert.equal(v(first).at(-1),v(next)[0]);assert.ok(next.digitalEvents.find(t=>t.name==='d(check_command)').events.some(e=>e.time>.002&&e.value==='1'));
 assert.match(fixture.analog,/R1 in out 10000\nR2 out 0 10000/);
});

test('manifest validation rejects path escapes, duplicates, unrelated roots and excessive allocations before requesting files',()=>{
 for(const mutation of[
  w=>{w.recovery.files[0].path='../private.js';},w=>{w.recovery.files[0].path='https://elsewhere.test/x.js';},w=>{w.recovery.files[0].path=w.prefix+'src/%2e%2e/secret.js';},w=>{w.recovery.files[0].path='unrelated/runtime.js';},w=>{w.recovery.files.push({...w.recovery.files[0]});},w=>{w.recovery.files[0].bytes=INSTALLATION_CHECK_LIMITS.fileBytes+1;},w=>{w.recovery.files=Array.from({length:129},()=>w.recovery.files[0]);},w=>{w.release.runtimeFiles.push(w.release.runtimeFiles[0]);},w=>{w.release.files[w.recovery.files[0].path]='0'.repeat(64);},w=>{w.release.runtimeFiles=w.release.runtimeFiles.filter(p=>!p.endsWith('/src/engine-worker.js'));},w=>{w.release.runtimeBase='assets/older';}
 ]){const w=world();mutation(w);assert.throws(()=>validateInstallationManifests(w.release,w.recovery,{baseURL:scope,version:VERSION,buildHash:build}));}
 assert.throws(()=>validateInstallationManifests(world().release,world().recovery,{baseURL:'https://example.test/tools/circuitbench',version:VERSION}),/directory/);
 assert.throws(()=>validateInstallationManifests(world().release,world().recovery,{baseURL:'https://user:password@example.test/',version:VERSION}),/HTTP/);
});

test('version/build mismatches fail manifests without following their inventory while smoke results remain independent',async()=>{
 for(const mutate of[w=>{w.release.version='1.0.0';},w=>{w.recovery.buildHash='f'.repeat(16);},w=>{w.options.buildHash='a'.repeat(16);}]){
  const w=world();mutate(w);repack(w);const r=await runInstallationCheck(w.options);assert.equal(r.status,'failed');assert.equal(w.requests.length,2);assert.equal(r.checks.find(c=>c.id==='manifests').status,'failed');assert.equal(r.checks.find(c=>c.id==='assets').status,'unavailable');assert.equal(r.checks.filter(c=>c.id.startsWith('engine:')&&c.status==='passed').length,3);
 }
});

test('a tampered recovery document does not authorize any runtime fetch',async()=>{
 const w=world();w.content.get('recovery-manifest.json').body=bytes(JSON.stringify(w.recovery,null,2));
 const r=await runInstallationCheck(w.options);assert.equal(r.checks.find(c=>c.id==='manifests').code,'INSTALLATION_RECOVERY_HASH');assert.equal(w.requests.length,2);
});

test('same-length changed JavaScript is rejected by its SHA-256',async()=>{
 const w=world(),file=w.prefix+'src/engine-worker.js',entry=w.content.get(file);entry.body=entry.body.slice();entry.body[entry.body.length-3]^=1;
 const r=await runInstallationCheck(w.options),check=r.checks.find(c=>c.id==='asset:'+file);assert.equal(check.code,'INSTALLATION_ASSET_HASH');assert.equal(check.status,'failed');assert.equal(r.status,'failed');
});

test('HTML fallbacks, wrong JavaScript MIME and invalid WebAssembly signatures produce distinct diagnostics',async()=>{
 for(const [kind,code] of [['html','INSTALLATION_HTML_ASSET'],['mime','INSTALLATION_CONTENT_TYPE'],['wasm','INSTALLATION_WASM_SIGNATURE']]){
  const w=world(),file=w.prefix+(kind==='wasm'?'engine/spice.wasm':'src/engine-worker.js'),entry=w.content.get(file);
  if(kind==='html'){entry.mime='text/html';entry.body=bytes('<html>'.padEnd(entry.body.length,' '));}if(kind==='mime')entry.mime='text/plain';if(kind==='wasm')entry.body=Uint8Array.of(0,0,0,0,0,0,0,0);
  const r=await runInstallationCheck(w.options),check=r.checks.find(c=>c.id==='asset:'+file);assert.equal(check.code,code);assert.equal(check.httpStatus,200);assert.equal(check.contentType,entry.mime);assert.equal(check.observedBytes,entry.body.length);
 }
});

test('generic binary MIME is accepted for correct WASM bytes while missing SHA remains explicitly unavailable',async()=>{
 const w=world();w.environment.crypto=undefined;const r=await runInstallationCheck({...w.options,cryptoImpl:null});
 assert.equal(r.status,'partial');assert.equal(r.summary.failed,0);assert.equal(r.checks.find(c=>c.id==='sha256').status,'unavailable');
 const binary=r.checks.find(c=>c.id.endsWith('/engine/spice.wasm'));assert.equal(binary.status,'unavailable');assert.equal(binary.details.sha256,null);assert.match(binary.message,/byte count match/);
});

test('a missing loaded-shell build cannot be reported as a complete release match',async()=>{
 const w=world(),r=await runInstallationCheck({...w.options,buildHash:null});assert.equal(r.status,'partial');assert.equal(r.loadedBuild,null);assert.equal(r.checks.find(c=>c.id==='loaded-build').status,'unavailable');assert.equal(r.manifestBuild,build);
});

test('oversized declared responses are rejected before reading and redirected responses are rejected',async()=>{
 for(const kind of ['size','redirect']){
  const w=world();let reads=0;const original=w.fetchImpl;
  const fetchImpl=async(url,options)=>url.endsWith('/src/engine-worker.js')?{ok:true,status:200,url:kind==='redirect'?scope+'other.js':url,headers:new Headers({'content-type':'text/javascript','content-length':String(INSTALLATION_CHECK_LIMITS.fileBytes+1)}),body:{getReader(){reads++;throw new Error('Should not read');}}}:original(url,options);
  const r=await runInstallationCheck({...w.options,fetchImpl}),check=r.checks.find(c=>c.id.endsWith('/src/engine-worker.js'));assert.equal(reads,0);assert.equal(check.code,kind==='redirect'?'INSTALLATION_REDIRECT':'INSTALLATION_RESPONSE_SIZE');
  if(kind==='size'){assert.equal(check.declaredBytes,String(INSTALLATION_CHECK_LIMITS.fileBytes+1));assert.equal(check.expectedBytes,w.content.get(w.prefix+'src/engine-worker.js').body.length);assert.equal(check.contentType,'text/javascript');assert.equal(check.httpStatus,200);}
 }
});

test('decoded streaming growth is bounded even with a missing or compressed Content-Length',async()=>{
 const w=world(),original=w.fetchImpl,file=w.prefix+'src/engine-worker.js';let cancelled=false;
 const fetchImpl=async(url,options)=>url.endsWith('/src/engine-worker.js')?{ok:true,status:200,url,headers:new Headers({'content-type':'text/javascript','content-encoding':'gzip','content-length':'1'}),body:new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(w.content.get(file).body.length+1));},cancel(){cancelled=true;}})}:original(url,options);
 const r=await runInstallationCheck({...w.options,fetchImpl}),check=r.checks.find(c=>c.id==='asset:'+file);assert.equal(check.code,'INSTALLATION_RESPONSE_SIZE');assert.equal(check.observedBytes,w.content.get(file).body.length+1);assert.equal(check.contentEncoding,'gzip');assert.equal(check.declaredBytes,'1');assert.equal(cancelled,true);
});

test('opaque worker failure is retained without guessing a CSP or cache cause and later paths still run',async()=>{
 const w=world();w.engineFactories.digital=()=>({async run(){throw Object.assign(new Error('The browser did not provide a reason.'),{code:'DIGITAL_WORKER_ERROR',phase:'worker-startup',assetUrl:scope+w.prefix+'src/digital-worker.js'});},stop(){w.lifecycle.stopped.push('digital');}});
 const r=await runInstallationCheck(w.options),failed=r.checks.find(c=>c.id==='engine:digital');assert.equal(failed.status,'failed');assert.equal(failed.phase,'worker-startup');assert.equal(failed.message,'The browser did not provide a reason.');assert.equal(r.checks.find(c=>c.id==='engine:ngspice').status,'passed');assert.ok(w.lifecycle.stopped.includes('digital'));
});

test('an incorrect worker result is detected rather than equating worker startup with a passed smoke test',async()=>{
 const w=world();w.engineFactories.ngspice=()=>({async run(){return{vectors:[{name:'v(out)',values:[0]}]};},stop(){w.lifecycle.stopped.push('ngspice');}});
 const r=await runInstallationCheck(w.options);assert.equal(r.checks.find(c=>c.id==='engine:ngspice').code,'INSTALLATION_NGSPICE_RESULT');assert.equal(r.status,'failed');assert.ok(w.lifecycle.stopped.includes('ngspice'));
});

test('cancelling an active engine check stops it and prevents later engines from starting',async()=>{
 const w=world(),controller=new AbortController();let started,resolveStarted;started=new Promise(resolve=>resolveStarted=resolve);let stopped=0;
 w.engineFactories.digital=()=>({run(){resolveStarted();return new Promise(()=>{});},stop(){stopped++;}});
 const pending=runInstallationCheck({...w.options,signal:controller.signal});await started;controller.abort();const r=await pending;
 assert.equal(r.status,'cancelled');assert.ok(stopped>=1);assert.equal(w.lifecycle.created.length,0);assert.ok(r.checks.some(c=>c.id==='manifests'));assert.equal(r.checks.filter(c=>c.id.startsWith('engine:')).length,0);
});

test('request timeout aborts a stalled fetch and retains a bounded failure report',async()=>{
 const w=world();let aborted=false;
 const fetchImpl=(_,options)=>{options.signal.addEventListener('abort',()=>aborted=true);return new Promise(()=>{});};
 const r=await runInstallationCheck({...w.options,fetchImpl,timeouts:{requestMs:5,totalMs:300,engineMs:100}});assert.equal(aborted,true);assert.equal(r.status,'failed');assert.equal(r.checks.find(c=>c.id==='manifests').code,'INSTALLATION_REQUEST_TIMEOUT');assert.equal(r.checks.filter(c=>c.id.startsWith('engine:')).length,3);
});

test('the total deadline aborts work even if a fetch ignores its cancellation signal',async()=>{
 const w=world();const r=await runInstallationCheck({...w.options,fetchImpl:()=>new Promise(()=>{}),timeouts:{requestMs:100,totalMs:5}});
 assert.equal(r.status,'failed');assert.equal(r.checks.at(-1).code,'INSTALLATION_CHECK_TIMEOUT');assert.equal(w.lifecycle.created.length,0);
});

test('already-cancelled runs and unsupported file scopes perform no network or engine work',async()=>{
 const w=world(),controller=new AbortController();controller.abort();const a=await runInstallationCheck({...w.options,signal:controller.signal}),b=await runInstallationCheck({...w.options,baseURL:'file:///tmp/circuitbench/'});
 assert.equal(a.status,'cancelled');assert.equal(b.status,'failed');assert.equal(b.checks[0].code,'INSTALLATION_SCOPE');assert.equal(w.requests.length,0);assert.equal(w.lifecycle.created.length,0);
});

test('missing browser capabilities are unavailable and progress callback errors cannot leak workers',async()=>{
 const w=world();w.environment.Worker=undefined;w.environment.WebAssembly=undefined;
 const r=await runInstallationCheck({...w.options,onProgress(){throw new Error('observer failure');}});
 assert.equal(r.status,'partial');assert.equal(r.checks.filter(c=>c.id.startsWith('engine:')&&c.status==='unavailable').length,3);assert.equal(w.lifecycle.created.length,0);
});

test('UI escapes observed failures and provides explicit cancellation/download/recovery controls',async()=>{
 const w=world(),r=await runInstallationCheck(w.options);r.checks[0].message='<img src=x onerror=alert(1)>';r.checks[0].label='<script>bad</script>';
 const url=installationRepairURL(scope,VERSION),html=installationCheckHTML(r,{repairURL:url});
 assert.match(html,/data-installation-action="run"/);assert.match(html,/data-installation-action="cancel" disabled/);assert.match(html,/data-installation-action="download" >/);assert.match(html,/Open cache repair/);assert.match(html,/&lt;img/);assert.ok(!html.includes('<script>bad'));
 assert.match(html,/Offline reload/);assert.match(html,/does not establish an installed offline cache/);assert.equal(new URL(url).pathname,'/tools/circuitbench/repair/');assert.equal(new URL(url).searchParams.get('release'),VERSION);
 assert.equal(JSON.parse(installationReportJSON(r)).format,r.format);assert.equal(installationReportFilename(r),`CircuitBench-${VERSION}-installation-check.json`);
 assert.throws(()=>installationRepairURL('javascript:alert(1)',VERSION));assert.ok(!installationCheckHTML(null,{repairURL:'javascript:alert(1)'}).includes('href="javascript:'));
 const running=installationCheckHTML({...r,status:'running'},{running:true});assert.match(running,/data-installation-action="download" disabled/);assert.match(running,/data-installation-action="cancel" >/);
});

test('all three installation fixtures complete through the production worker facades and all workers terminate',async()=>{
 const stage=await fs.mkdtemp(path.join(os.tmpdir(),'circuitbench-installation-')),previous=globalThis.Worker,exits=[],lifecycle={created:0,terminated:0,alive:0};
 try{
  await fs.writeFile(path.join(stage,'package.json'),'{"type":"module"}');await fs.cp(new URL('../src/',import.meta.url),path.join(stage,'src'),{recursive:true});await fs.mkdir(path.join(stage,'engine'));
  for(const name of ['eecircuit-engine.js','spice.wasm'])await fs.copyFile(new URL('../public/engine/'+name,import.meta.url),path.join(stage,'engine',name));
  globalThis.Worker=class{constructor(target){lifecycle.created++;lifecycle.alive++;this.thread=new NodeWorker(new URL('../scripts/engine-node-worker.mjs',import.meta.url),{workerData:{target:new URL('file://'+path.join(stage,'src',path.basename(new URL(target).pathname))).href}});this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.({message:error.message,preventDefault(){}}));exits.push(new Promise(resolve=>this.thread.on('exit',()=>{lifecycle.alive--;resolve();})));}postMessage(message){this.thread.postMessage(message);}terminate(){lifecycle.terminated++;return this.thread.terminate();}};
  const w=world(),options={...w.options};delete options.engineFactories;
  const r=await runInstallationCheck(options);await Promise.all(exits);
  assert.equal(r.status,'passed',JSON.stringify(r.checks.filter(c=>c.status!=='passed')));assert.equal(r.checks.find(c=>c.id==='engine:ngspice').details.measuredVoltage,5);assert.deepEqual(lifecycle,{created:3,terminated:3,alive:0});
 }finally{globalThis.Worker=previous;await Promise.all(exits);await fs.rm(stage,{recursive:true,force:true});}
});
