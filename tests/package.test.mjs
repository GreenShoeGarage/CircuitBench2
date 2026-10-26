import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {VERSION} from '../src/model.js';
import {RELEASE_DOCUMENTS,RELEASE_DOCUMENT_RENDERER,renderReleaseDocument} from '../scripts/release-docs.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const read=name=>fs.readFile(path.join(dist,name),'utf8');
const manifest=JSON.parse(await read('release-manifest.json').catch(error=>{throw new Error('Build the deployable folder before testing: node scripts/build.mjs',{cause:error});}));
const runtime=new Set(manifest.runtimeFiles);
const asset=file=>manifest.runtimeBase+'/'+file;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const runFile=promisify(execFile);

test('built release identity matches application and source package',async()=>{
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 assert.equal(manifest.name,'CircuitBench');assert.equal(manifest.version,VERSION);assert.equal(pkg.version,VERSION);
 const index=await read('index.html');assert.ok(index.includes('v'+VERSION));
 assert.ok(index.includes('<meta name="circuitbench-build" content="'+manifest.buildHash+'">'));
 assert.equal(manifest.runtimeBase,'assets/'+VERSION);assert.equal(manifest.serviceWorker,'sw-'+VERSION+'.js');
 assert.equal(hash(await fs.readFile(path.join(dist,asset('src/model.js')))),hash(await fs.readFile(path.join(root,'src/model.js'))));
});

test('version stamping targets the shell label and supports arbitrary future prerelease versions',async()=>{
 const builder=await fs.readFile(path.join(root,'scripts/build.mjs'),'utf8');
 const begin=builder.indexOf('function stampVersion('),end=builder.indexOf('\nconst root=',begin);
 assert.ok(begin>=0&&end>begin);const stamp=vm.runInNewContext(builder.slice(begin,end)+'\nstampVersion');
 for(const old of ['v1.0.0-rc.1','v1.0.0-rc.29','v9.4.2','old label']){
  const html=`<span class="version" id="version">${old}</span><p>v1.0.0 is historical prose.</p>`;
  assert.equal(stamp(html,'2.3.0-beta.12+hosting'),'<span class="version" id="version">v2.3.0-beta.12+hosting</span><p>v1.0.0 is historical prose.</p>');
 }
 assert.throws(()=>stamp('<span>v1.0.0</span>','2.0.0'),/missing its version label/);
 const render=vm.runInNewContext(builder.slice(begin,end)+'\nrenderIndex');
 const input='<meta name="circuitbench-build" content="development"><span id="version">v0.1.0</span><link href="./style.css"><script type="module" src="./src/app.js"></script>';
 assert.equal(render(input,'2.3.0-rc.7'),'<meta name="circuitbench-build" content="development"><span id="version">v2.3.0-rc.7</span><link href="./assets/2.3.0-rc.7/style.css"><script type="module" src="./assets/2.3.0-rc.7/src/app.js"></script>');
 assert.ok(render(input,'2.3.0-rc.7','0123456789abcdef').includes('content="0123456789abcdef"'));
 assert.throws(()=>render(input,'2.3.0-rc.7','wrong-build'),/build identity/);
 assert.throws(()=>render(input.replace(/<meta[^>]+>/,''),'2.3.0-rc.7'),/missing its build identity/);
});

test('operational documentation and both recovery entries use this release from recorded source templates',async()=>{
 assert.deepEqual(Object.keys(manifest.generatedDocuments).sort(),Object.keys(RELEASE_DOCUMENTS).sort());
 for(const [output,source]of Object.entries(RELEASE_DOCUMENTS)){
  assert.deepEqual(manifest.generatedDocuments[output],{source,renderer:RELEASE_DOCUMENT_RENDERER,version:VERSION});
  const original=await fs.readFile(path.join(root,source),'utf8');
  assert.equal(await read(output),renderReleaseDocument(original,VERSION,output));
  assert.equal(manifest.buildInputs[source],hash(original));
  assert.ok(!Object.hasOwn(manifest.fileSources,output),'A generated document must not pretend to be a byte-identical copy');
 }
 assert.equal(manifest.buildInputs['scripts/release-docs.mjs'],hash(await fs.readFile(path.join(root,'scripts/release-docs.mjs'))));
});

test('manifest authenticates every packaged file it declares',async()=>{
 for(const [name,expected]of Object.entries(manifest.files)){
  assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'),'Release path stays below package root: '+name);
  assert.equal(hash(await fs.readFile(path.join(dist,name))),expected,'Changed after build: '+name);
 }
 assert.ok(Object.keys(manifest.files).length>20);
});

test('offline asset list includes the ordinary-JS engine and actual WASM filename',async()=>{
 assert.ok(runtime.has(asset('engine/eecircuit-engine.js')));
 assert.ok(![...runtime].some(name=>name.endsWith('.mjs')),'Browser runtime avoids hosts that do not map .mjs to a JavaScript MIME type');
 assert.ok(runtime.has(asset('engine/spice.wasm')),'Actual runtime is spice.wasm, not ngspice.wasm');
 assert.ok(!runtime.has(asset('engine/ngspice.wasm')));
 const engine=await read(asset('engine/eecircuit-engine.js'));
 const wasmPaths=[...engine.matchAll(/new URL\(["']([^"']+\.wasm)["']/g)].map(m=>m[1]);
 assert.ok(wasmPaths.length>=1,'Vendored engine has a local WASM URL');
 for(const ref of wasmPaths){assert.equal(ref,'./spice.wasm');assert.ok(runtime.has(path.posix.normalize(asset('engine/')+ref)));}
 const wasm=await fs.readFile(path.join(dist,asset('engine/spice.wasm')));
 assert.deepEqual([...wasm.subarray(0,4)],[0,97,115,109]);
 assert.equal(hash(wasm),'ed7995425b6f7af02db874539d13ea10d07759d5f2be6b79969343459ae886e4');
});

test('service worker precaches only available local core assets',async()=>{
 const sw=await read(manifest.serviceWorker);assert.equal(sw,await read('sw.js'));
 const match=sw.match(/const FILES=(\[[^;]+\]);/);assert.ok(match,'Generated precache list is inspectable');
 const files=JSON.parse(match[1]);
 assert.ok(files.includes('./'));assert.ok(files.includes('./'+asset('engine/spice.wasm')));
 for(const ref of files){assert.ok(ref.startsWith('./'),'Scope-relative cache entry: '+ref);if(ref!=='./'){assert.ok(runtime.has(ref.slice(2)));await fs.access(path.join(dist,ref));}}
 for(const name of runtime)assert.ok(files.includes('./'+name),'Runtime omitted from offline list: '+name);
 assert.ok(!files.some(ref=>ref.includes('/source/')||ref.endsWith('.tar.gz')),'Nonruntime source archives must not be precached');
 assert.ok(!files.includes('./'+manifest.serviceWorker)&&!files.includes('./sw.js'),'Service workers are not recursively cached');
 assert.ok(!files.some(ref=>ref.includes('repair')||ref.includes('recovery-manifest')),'Recovery files stay on the fresh network path');
 assert.ok(sw.includes('self.registration.scope'),'Cache identity/fetch boundary uses this installation scope');
 assert.ok(sw.includes(VERSION));
 const context=vm.createContext({self:{registration:{scope:'https://package.test/circuitbench/'},addEventListener(){}}});
 vm.runInContext(sw+'\nglobalThis.__integrity=INTEGRITY;globalThis.__shell=SHELL_HTML;',context);
 for(const ref of files){const name=ref==='./'?'index.html':ref.slice(2);assert.equal(context.__integrity[ref].sha256,manifest.files[name]);assert.equal(context.__integrity[ref].bytes,(await fs.stat(path.join(dist,name))).size);}
 assert.equal(context.__shell,await read('index.html'),'Embedded shell is byte-for-byte the canonical release HTML');
});

test('browser module imports and entry assets resolve locally within the app subdirectory',async()=>{
 const base='https://example.invalid/tools/circuitbench/';
 for(const name of runtime){
  if(!/\.(?:js|mjs)$/.test(name))continue;
  const source=await read(name);
  const refs=[...source.matchAll(/\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)].map(m=>m[1]);
  for(const ref of refs){
   assert.ok(ref.startsWith('./')||ref.startsWith('../'),'No external or bare runtime import in '+name+': '+ref);
   const url=new URL(ref,new URL(name,base));assert.ok(url.href.startsWith(base),'Module stays under deployment route');
   const relative=decodeURIComponent(url.href.slice(base.length));assert.ok(runtime.has(relative),'Imported module is precached: '+relative);await fs.access(path.join(dist,relative));
  }
  for(const match of source.matchAll(/\bnew URL\(\s*["']([^"']+\.(?:js|mjs|wasm))["']/g)){
   const ref=match[1],url=new URL(ref,new URL(name,base));assert.ok(url.href.startsWith(base),'Worker or engine URL stays under deployment route: '+ref);
   const relative=decodeURIComponent(url.href.slice(base.length));assert.ok(runtime.has(relative),'Worker/engine URL is packaged in its release directory: '+relative);await fs.access(path.join(dist,relative));
  }
  assert.ok(!/\bimport\s*\(\s*["'](?:https?:)?\/\//.test(source),'No dynamic external import in '+name);
  assert.ok(!/\bfetch\s*\(\s*["']https?:\/\//.test(source),'No fixed external runtime fetch in '+name);
 }
 const html=await read('index.html');
 for(const match of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)){
  const ref=match[1];assert.ok(ref.startsWith('./'),'Root HTML uses relative asset URL: '+ref);
  const url=new URL(ref,base);assert.ok(url.href.startsWith(base));assert.ok(runtime.has(url.href.slice(base.length)));await fs.access(path.join(dist,ref));
 }
 const appManifest=JSON.parse(await read('manifest.webmanifest'));
 assert.equal(appManifest.start_url,'./');assert.equal(appManifest.scope,'./');
 for(const icon of appManifest.icons??[])assert.ok(new URL(icon.src,base).href.startsWith(base));
});

test('every copied runtime and release file maps to matching original source bytes',async()=>{
 const generated=new Set(['index.html','sw.js',manifest.serviceWorker,'recovery-manifest.json',...Object.keys(manifest.generatedDocuments)]);
 assert.deepEqual(Object.keys(manifest.fileSources).sort(),Object.keys(manifest.files).filter(name=>!generated.has(name)).sort());
 assert.deepEqual(Object.keys(manifest.runtimeSource).sort(),[...runtime].filter(name=>name!=='index.html').sort());
 for(const [name,original]of Object.entries(manifest.fileSources)){
  assert.ok(!original.startsWith('/')&&!original.split('/').includes('..'),'Source mapping remains inside the source root');
  assert.equal(hash(await fs.readFile(path.join(root,original))),manifest.files[name],'Source input changed after build: '+original);
  if(runtime.has(name))assert.equal(manifest.runtimeSource[name],original);
 }
 for(const [name,expected]of Object.entries(manifest.buildInputs))assert.equal(hash(await fs.readFile(path.join(root,name))),expected,'Generated-file input changed after build: '+name);
 const builder=await fs.readFile(path.join(root,'scripts/build.mjs'),'utf8'),begin=builder.indexOf('function stampVersion('),end=builder.indexOf('\nconst root=',begin);
 const render=vm.runInNewContext(builder.slice(begin,end)+'\nrenderIndex');
 assert.equal(await read('index.html'),render(await fs.readFile(path.join(root,'index.html'),'utf8'),VERSION,manifest.buildHash));
});

test('release contains one WASM and no duplicate unversioned executable tree',async()=>{
 const names=Object.keys(manifest.files);
 assert.deepEqual(names.filter(name=>name.endsWith('/spice.wasm')),[asset('engine/spice.wasm')]);
 for(const name of names){assert.ok(!name.startsWith('src/'),'Old source execution path was not duplicated');if(name.startsWith('assets/'))assert.ok(name.startsWith(manifest.runtimeBase+'/'),'Only this release’s executable directory is packaged');}
 for(const name of ['style.css','engine/eecircuit-engine.js','engine/spice.wasm'])assert.ok(!names.includes(name),'Unversioned execution asset removed: '+name);
 for(const name of ['engine/NOTICE.txt','engine/manifest.json','repair.html','repair/index.html'])assert.ok(names.includes(name),'Nonruntime release/recovery material remains: '+name);
 assert.equal(await read('repair/index.html'),await read('repair.html'));assert.equal(manifest.generatedDocuments['repair/index.html'].source,'public/repair.html');
});

test('recovery manifest warms exact versioned assets without requesting a rewritten HTML shell',async()=>{
 const recovery=JSON.parse(await read('recovery-manifest.json'));
 assert.equal(recovery.format,'CircuitBenchRecovery');assert.equal(recovery.formatVersion,1);assert.equal(recovery.version,VERSION);assert.equal(recovery.buildHash,manifest.buildHash);
 assert.deepEqual(recovery.shell,{root:'./',embeddedIn:manifest.serviceWorker});
 assert.deepEqual(recovery.files.map(file=>file.path).sort(),[...runtime].filter(name=>name!=='index.html').concat(manifest.serviceWorker).sort());
 for(const file of recovery.files){assert.ok(!file.path.endsWith('.html'));assert.ok(!file.path.startsWith('/')&&!file.path.split('/').includes('..'));assert.equal(file.sha256,manifest.files[file.path]);assert.equal(file.bytes,(await fs.stat(path.join(dist,file.path))).size);}
 assert.ok(!recovery.files.some(file=>file.path==='sw.js'),'Recovery warms the versioned service worker instead of a stale root alias');
 const canonical=await read('index.html').then(html=>html.replace(/(<meta name="circuitbench-build" content=")[^"]+(">)/,'$1development$2'));
 assert.equal(manifest.buildHashMethod,'runtime-shell-development-v1');
 const calculated=hash(manifest.runtimeFiles.map(name=>name+':'+(name==='index.html'?hash(canonical):manifest.files[name])).join('\n')).slice(0,16);assert.equal(calculated,manifest.buildHash,'Runtime identity uses the canonical shell build field and excludes docs/evidence changes');
});

test('packager selects only its exact archives beside prerelease and unrelated ZIPs',{timeout:60000},async t=>{
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'circuitbench-package-neighbors-'));
 t.after(()=>fs.rm(temporary,{recursive:true,force:true}));
 const fixture=path.join(temporary,'CircuitBench'),release=path.join(temporary,'release');
 // Copy the source inputs required by the real builder and packager. Rebuilding
 // the private fixture also records the currently tested packager's input hash.
 const sources=new Set([...Object.values(manifest.fileSources),...Object.keys(manifest.buildInputs)]);
 for(const name of sources){
  assert.ok(!path.isAbsolute(name)&&!name.split('/').includes('..'),'Fixture source stays within the project');
  const destination=path.join(fixture,name);await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.copyFile(path.join(root,name),destination);
 }
 await runFile(process.execPath,['scripts/build.mjs'],{cwd:fixture,timeout:20000,maxBuffer:1024*1024});
 await fs.mkdir(release,{recursive:true});
 const expected=[`CircuitBench-${VERSION}-deploy.zip`,`CircuitBench-${VERSION}-source.zip`].sort();
 const base=VERSION.replace(/[-+].*$/,'');
 const neighborNames=[...['rc.1','rc.2','rc.3'].flatMap(tag=>['deploy','source'].map(kind=>`CircuitBench-${base}-${tag}-${kind}.zip`)),`CircuitBench-${VERSION}-notes.zip`,'OtherProject-1.0.0-deploy.zip'].filter(name=>!expected.includes(name));
 const neighbors=new Map();
 for(const name of neighborNames){
  const comment=Buffer.from('Preserve existing archive: '+name),header=Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50,0);header.writeUInt16LE(comment.length,20);
  const bytes=Buffer.concat([header,comment]);neighbors.set(name,bytes);
  await fs.writeFile(path.join(release,name),bytes);
 }
 await runFile('python3',['scripts/package.py'],{cwd:fixture,timeout:30000,maxBuffer:1024*1024});
 const lines=(await fs.readFile(path.join(release,`CircuitBench-${VERSION}-SHA256SUMS.txt`),'utf8')).trim().split('\n');
 const sums=lines.map(line=>{const match=line.match(/^([a-f0-9]{64})  (.+)$/);assert.ok(match,'Valid checksum line');return {sha256:match[1],name:match[2]};});
 const receipt=JSON.parse(await fs.readFile(path.join(release,`CircuitBench-${VERSION}-release-integrity.json`),'utf8'));
 assert.deepEqual(sums.map(item=>item.name).sort(),expected,'Checksums include exactly this release’s two archives');
 assert.deepEqual(Object.keys(receipt.release_files).sort(),expected,'Receipt does not adopt neighboring archives');
 assert.deepEqual(Object.keys(receipt.archives).sort(),expected);
 for(const {name,sha256}of sums){
  const bytes=await fs.readFile(path.join(release,name));assert.equal(sha256,hash(bytes));
  assert.deepEqual(receipt.release_files[name],{bytes:bytes.length,sha256});
  assert.equal(receipt.archives[name].sha256,sha256);assert.equal(receipt.archives[name].zip_crc_verified,true);
 }
 for(const [name,bytes]of neighbors)assert.deepEqual(await fs.readFile(path.join(release,name)),bytes,'Existing neighboring archive is unchanged: '+name);
});
