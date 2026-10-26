import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {VERSION} from '../src/model.js';
import {RELEASE_DOCUMENTS,RELEASE_DOCUMENT_RENDERER,renderReleaseDocument} from './release-docs.mjs';
function stampVersion(html,version){
  const tag=/(<span\b[^>]*\bid=["']version["'][^>]*>)[^<]*(<\/span>)/i;
  if(!tag.test(html))throw new Error('The application shell is missing its version label.');
  return html.replace(tag,(_,open,close)=>open+'v'+version+close);
}
function stampBuild(html,build='development'){
  if(build!=='development'&&!/^[a-f0-9]{16}$/.test(build))throw new Error('Invalid shell build identity.');
  const tag=/(<meta\b[^>]*\bname=["']circuitbench-build["'][^>]*\bcontent=["'])[^"']*(["'][^>]*>)/i;
  if(!tag.test(html))throw new Error('The application shell is missing its build identity.');
  return html.replace(tag,(_,open,close)=>open+build+close);
}
function renderIndex(html,version,build='development'){
  if(!html.includes('href="./style.css"')||!html.includes('src="./src/app.js"'))throw new Error('The source shell must reference the source stylesheet and application entry.');
  const base='./assets/'+version+'/';
  return stampBuild(stampVersion(html,version).replace('href="./style.css"','href="'+base+'style.css"').replace('src="./src/app.js"','src="'+base+'src/app.js"'),build);
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
if(!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(VERSION))throw new Error('Version must be a safe semantic version.');
const runtimeBase='assets/'+VERSION,serviceWorker='sw-'+VERSION+'.js',fileSources={},generatedDocuments={};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function paths(dir,prefix=''){let all=[];for(const ent of await fs.readdir(dir,{withFileTypes:true})){const rel=prefix+ent.name;if(ent.isDirectory())all.push(...await paths(path.join(dir,ent.name),rel+'/'));else all.push(rel);}return all.sort();}
async function copyInput(sourceName,destinationName){
  const source=path.join(root,sourceName),destination=path.join(dist,destinationName),stat=await fs.stat(source);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  if(stat.isDirectory()){
    await fs.cp(source,destination,{recursive:true});
    for(const name of await paths(source))fileSources[path.posix.join(destinationName,name)]=path.posix.join(sourceName,name);
  }else{await fs.copyFile(source,destination);fileSources[destinationName]=sourceName;}
}
await fs.mkdir(dist,{recursive:true});for(const entry of await fs.readdir(dist))await fs.rm(path.join(dist,entry),{recursive:true,force:true});
await copyInput('src',runtimeBase+'/src');await copyInput('public','');
await fs.mkdir(path.join(dist,runtimeBase,'engine'),{recursive:true});
for(const name of ['eecircuit-engine.js','spice.wasm']){
  const previous='engine/'+name,next=runtimeBase+'/engine/'+name;
  await fs.rename(path.join(dist,previous),path.join(dist,next));fileSources[next]=fileSources[previous];delete fileSources[previous];
}
await copyInput('style.css',runtimeBase+'/style.css');await copyInput('index.html','index.html');
await copyInput('public/repair.html','repair/index.html');
const indexSource=await fs.readFile(path.join(dist,'index.html'),'utf8');let index=renderIndex(indexSource,VERSION);
await fs.writeFile(path.join(dist,'index.html'),index);delete fileSources['index.html'];
for(const name of ['README.md','LICENSE','THIRD_PARTY_NOTICES.md','CHANGELOG.md','ROADMAP.md','docs','evidence']){try{await copyInput(name,name);}catch(e){if(e.code!=='ENOENT')throw e;}}
for(const [output,source] of Object.entries(RELEASE_DOCUMENTS)){
  const rendered=renderReleaseDocument(await fs.readFile(path.join(root,source),'utf8'),VERSION,output);
  await fs.mkdir(path.dirname(path.join(dist,output)),{recursive:true});await fs.writeFile(path.join(dist,output),rendered);
  delete fileSources[output];generatedDocuments[output]={source,renderer:RELEASE_DOCUMENT_RENDERER,version:VERSION};
}
const files=await paths(dist),runtime=files.filter(p=>p==='index.html'||p==='icon.svg'||p==='manifest.webmanifest'||p.startsWith(runtimeBase+'/'));
for(const required of ['engine/eecircuit-engine.js','engine/spice.wasm','src/engine-worker.js'])if(!runtime.includes(runtimeBase+'/'+required))throw new Error('Missing deployable engine asset: '+required);
const hashes={},sizes={};for(const file of files){const bytes=await fs.readFile(path.join(dist,file));hashes[file]=hash(bytes);sizes[file]=bytes.length;}
const buildHash=hash(runtime.map(p=>p+':'+hashes[p]).join('\n')).slice(0,16);
// The identity includes the complete runtime with this one shell field set to
// its source value. Hashing the final self-referential field is impossible;
// the manifest still authenticates the final shell and all served bytes.
const buildHashMethod='runtime-shell-development-v1';
index=stampBuild(index,buildHash);await fs.writeFile(path.join(dist,'index.html'),index);
hashes['index.html']=hash(index);sizes['index.html']=Buffer.byteLength(index);
const runtimeSource=Object.fromEntries(runtime.filter(file=>file!=='index.html').map(file=>[file,fileSources[file]]));
const buildInputs={'index.html':hash(indexSource)};
for(const name of new Set(['scripts/build.mjs','scripts/package.py','scripts/release-docs.mjs','package.json',...Object.values(RELEASE_DOCUMENTS)]))buildInputs[name]=hash(await fs.readFile(path.join(root,name)));
const integrity=Object.fromEntries(['./',...runtime.map(p=>'./'+p)].map(file=>{const name=file==='./'?'index.html':file.slice(2);return[file,{sha256:hashes[name],bytes:sizes[name]}];}));
const sw=String.raw`/* CircuitBench ${VERSION}; content-verified cache for this exact runtime build. */
const VERSION=${JSON.stringify(VERSION)}, BUILD=${JSON.stringify(buildHash)};
const PREFIX='circuitbench:'+self.registration.scope+'|';
const CACHE=PREFIX+VERSION+':'+BUILD+':sha256-shell-v2';
const FILES=${JSON.stringify(['./',...runtime.map(p=>'./'+p)])};
const INTEGRITY=${JSON.stringify(integrity)};
const SHELL_HTML=${JSON.stringify(index)};
const JS_MIMES=new Set(['text/javascript','application/javascript','text/ecmascript','application/ecmascript','application/x-javascript','application/x-ecmascript','text/x-javascript','text/x-ecmascript','text/javascript1.0','text/javascript1.1','text/javascript1.2','text/javascript1.3','text/javascript1.4','text/javascript1.5','text/jscript','text/livescript']);
async function validateResponse(file,response){
  if(!response||!response.ok)throw new Error(file+': missing asset or HTTP '+(response?.status??'response unavailable'));
  const mime=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
  if(file.endsWith('.js')&&!JS_MIMES.has(mime))throw new Error(file+': invalid JavaScript MIME type '+(mime||'(missing)'));
  if((file==='./'||file.endsWith('.html'))&&mime!=='text/html')throw new Error(file+': invalid HTML MIME type '+(mime||'(missing)'));
  if(file.endsWith('.css')&&mime!=='text/css')throw new Error(file+': invalid CSS MIME type '+(mime||'(missing)'));
  const bytes=new Uint8Array(await response.clone().arrayBuffer()),expected=INTEGRITY[file];
  if(file.endsWith('.wasm')&&(bytes.length<8||bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109))throw new Error(file+': invalid WebAssembly magic; the host may be returning HTML instead of the binary');
  if(bytes.length!==expected.bytes)throw new Error(file+': byte length differs from this release; upload the complete deployable folder');
  if(!globalThis.crypto?.subtle)throw new Error('Secure SHA-256 verification is unavailable; offline installation was not accepted');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const actual=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(actual!==expected.sha256)throw new Error(file+': SHA-256 differs from this release; stale, modified or mixed release assets were not cached');
}
async function installCache(){
  // Validate the entire download before writing any cache entry. Reload bypasses
  // stale HTTP-cache responses when a host has just replaced or repaired files.
  const verified=await Promise.all(FILES.map(async file=>{
    const request=new Request(new URL(file,self.registration.scope).href,{cache:'reload',credentials:'same-origin'});
    // The canonical shell is part of this release, not host-injected analytics or
    // a broken /index.html rewrite. Both navigation aliases use identical bytes.
    const response=file==='./'||file==='./index.html'?new Response(SHELL_HTML,{headers:{'content-type':'text/html; charset=utf-8'}}):await fetch(request);
    await validateResponse(file,response);return[request,response];
  }));
  const cache=await caches.open(CACHE);
  try{for(const [request,response]of verified)await cache.put(request,response);}
  catch(error){await caches.delete(CACHE);throw error;}
}
async function cacheStatus(){
  try{const cache=await caches.open(CACHE);await Promise.all(FILES.map(async file=>validateResponse(file,await cache.match(file))));return{ready:true,version:VERSION,build:BUILD};}
  catch(error){return{ready:false,version:VERSION,build:BUILD,error:error?.message??String(error)};}
}
self.addEventListener('install',event=>event.waitUntil(installCache()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;event.respondWith((async()=>{let lookup=event.request;
  // Only the two HTML navigation aliases may ignore a query string. Asset URLs,
  // including release directories and query pins, must match exactly.
  const root=new URL(self.registration.scope),index=new URL('index.html',root);
  const navigation=event.request.mode==='navigate'&&(url.pathname===root.pathname||url.pathname===index.pathname);
  if(navigation){url.search='';url.hash='';lookup=url.href;}
  if(event.request.cache==='reload'||event.request.cache==='no-store'){
    try{return await fetch(event.request);}
    catch(error){
      // An ordinary offline page reload can recover its known shell. Asset
      // diagnostics and no-store requests must never hide a network failure.
      if(navigation&&event.request.cache==='reload'){const cache=await caches.open(CACHE),shell=await cache.match(lookup);if(shell)return shell;}
      throw error;
    }
  }
  const cache=await caches.open(CACHE);
  const cached=await cache.match(lookup);if(cached)return cached;return fetch(event.request);})());});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();if(event.data?.type==='CACHE_STATUS')event.waitUntil((async()=>{event.ports?.[0]?.postMessage(await cacheStatus());})());});
`;
for(const name of [serviceWorker,'sw.js']){await fs.writeFile(path.join(dist,name),sw);hashes[name]=hash(sw);sizes[name]=Buffer.byteLength(sw);}
const recovery={format:'CircuitBenchRecovery',formatVersion:1,version:VERSION,buildHash,files:[...runtime.filter(file=>file!=='index.html'),serviceWorker].map(file=>({path:file,bytes:sizes[file],sha256:hashes[file]})),shell:{root:'./',embeddedIn:serviceWorker}};
const recoveryText=JSON.stringify(recovery,null,2)+'\n';await fs.writeFile(path.join(dist,'recovery-manifest.json'),recoveryText);hashes['recovery-manifest.json']=hash(recoveryText);
await fs.writeFile(path.join(dist,'release-manifest.json'),JSON.stringify({name:'CircuitBench',version:VERSION,buildHash,buildHashMethod,runtimeBase,serviceWorker,runtimeFiles:runtime,runtimeSource,fileSources,generatedDocuments,buildInputs,files:hashes},null,2)+'\n');
console.log(`Built CircuitBench ${VERSION} / ${buildHash}: ${files.length+4} files, ${runtime.length} local runtime assets.`);
