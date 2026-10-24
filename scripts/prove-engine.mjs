/** Actual WASM worker numerical, lifecycle and pinned native reference checks.
 * Run: node --expose-gc scripts/prove-engine.mjs
 * This is a Node Worker API adapter test, not a browser/UI test.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'circuitbench-engine-proof-'));
await fs.mkdir(path.join(stage, 'src'));
await fs.writeFile(path.join(stage, 'package.json'), '{"type":"module"}');
for (const name of ['engine.js', 'engine-worker.js']) await fs.copyFile(path.join(root, 'src', name), path.join(stage, 'src', name));
await fs.cp(path.join(root, 'public/engine'), path.join(stage, 'engine'), { recursive: true });
const lifecycle = { created: 0, terminated: 0, alive: 0 };
globalThis.Worker = class {
  constructor(target) {
    lifecycle.created++; lifecycle.alive++;
    this.thread = new NodeWorker(new URL('./engine-node-worker.mjs', import.meta.url), { workerData: { target: String(target) } });
    this.thread.on('message', data => this.onmessage?.({ data }));
    this.thread.on('error', error => this.onerror?.({ message: error.message, preventDefault() {} }));
    this.thread.on('exit', () => lifecycle.alive--);
  }
  postMessage(message) { this.thread.postMessage(message); }
  terminate() { lifecycle.terminated++; return this.thread.terminate(); }
};
const { CircuitEngine, ENGINE_INFO } = await import(pathToFileURL(path.join(stage, 'src/engine.js')));
const engine = new CircuitEngine();
const tau = 0.001, fc = 1 / (2 * Math.PI * tau);
const fixtures = {
  divider: 'Equal resistor divider\nV1 in 0 10\nR1 in out 10000\nR2 out 0 10000\n.options reltol=1e-6 abstol=1e-12 vntol=1e-9\n.op\n.end',
  unicode_crossing: 'CircuitBench - QA · Independent wire crossing - revision 0\n* Reproducible analysis from schema 1. Generic models are educational.\nV1 n1 0 DC 1.000000000000e+1 AC 0.000000000000e+0 0.000000000000e+0\nV2 n2 0 DC 4.000000000000e+0 AC 0.000000000000e+0 0.000000000000e+0\nR1 n1 channel_a 1.000000000000e+4\nR2 channel_a 0 1.000000000000e+4\nR3 n2 channel_b 1.000000000000e+4\nR4 channel_b 0 1.000000000000e+4\n.temp 27\n.options reltol=1.000000000000e-4 abstol=1e-12 vntol=1e-6 itl1=200 itl4=100\n.save all\n.op\n.end',
  sweep: 'Divider DC sweep\nV1 in 0 0\nR1 in out 10000\nR2 out 0 10000\n.dc V1 0 10 0.5\n.end',
  ac: `RC cutoff\nV1 in 0 DC 0 AC 1\nR1 in out 10000\nC1 out 0 1e-7\n.options reltol=1e-6\n.ac lin 1 ${fc} ${fc}\n.end`,
  step: 'RC step\nV1 in 0 PULSE(0 1 0 1e-9 1e-9 1 2)\nR1 in out 10000\nC1 out 0 1e-7 IC=0\n.options reltol=1e-6\n.tran 1e-6 0.005 0 1e-6 uic\n.end',
  diode: 'Generic diode\nV1 in 0 5\nR1 in out 1000\nD1 out 0 CBD\n.model CBD D(Is=1e-14 N=1 Rs=0.1 Cjo=2e-12)\n.op\n.end',
  npn: 'Generic NPN\nV1 supply 0 5\nVB bias 0 1\nRB bias base 10000\nRC supply out 1000\nQ1 out base 0 CBN\n.model CBN NPN(Is=1e-14 Bf=100 Vaf=100)\n.op\n.end',
  mos: 'Generic NMOS\nV1 supply 0 5\nVG gate 0 5\nR1 supply out 100\nM1 out gate 0 0 CBM W=1e-3 L=1e-5\n.model CBM NMOS(Level=1 Vto=2 Kp=0.001 Lambda=0.01)\n.op\n.end',
  opamp: 'Bounded generic opamp\nVCC vp 0 12\nVEE vn 0 -12\nVIN input 0 0.1\nR1 minus 0 10000\nR2 out minus 100000\nB1 out 0 V=(V(vp)+V(vn))/2+(V(vp)-V(vn))/2*tanh(100000*(V(input)-V(minus))/((V(vp)-V(vn))/2))\n.op\n.end',
  switch: 'Voltage controlled switch\nV1 in 0 5\nVC control 0 5\nS1 in out control 0 CBS\nR1 out 0 1000\n.model CBS SW(Ron=1 Roff=1e9 Vt=2.5 Vh=0.1)\n.op\n.end',
};
const checks = [], outputs = {};
function check(name, actual, expected, tolerance) {
  const pass = Math.abs(actual - expected) <= tolerance;
  checks.push({ name, actual, expected, absoluteTolerance: tolerance, pass });
  if (!pass) throw new Error(`${name}: ${actual} expected ${expected} ± ${tolerance}`);
}
const value = (result, name) => result.vectors.find(vector => vector.name === name);
const interp = (xs, ys, x) => { let i = xs.findIndex(v => v >= x); if (i < 0) return ys.at(-1); if (!i) return ys[0]; const a = (x-xs[i-1])/(xs[i]-xs[i-1]); return ys[i-1]+a*(ys[i]-ys[i-1]); };
for (const [name, netlist] of Object.entries(fixtures)) {
  const start = performance.now(); outputs[name] = await engine.run(netlist);
  console.log(`${name}: ${outputs[name].points} points, ${(performance.now()-start).toFixed(0)} ms`);
}
check('DC midpoint', value(outputs.divider,'v(out)').values[0], 5, 1e-9);
check('DC source current reference direction', value(outputs.divider,'i(v1)').values[0], -0.0005, 1e-12);
check('Unicode-title independent divider A', value(outputs.unicode_crossing,'v(channel_a)').values[0], 5, 1e-9);
check('Unicode-title independent divider B', value(outputs.unicode_crossing,'v(channel_b)').values[0], 2, 1e-9);
check('DC sweep final midpoint', value(outputs.sweep,'v(out)').values.at(-1), 5, 1e-9);
const outAC=value(outputs.ac,'v(out)');
check('RC cutoff frequency',value(outputs.ac,'frequency').values[0],fc,1e-9);
check('RC cutoff magnitude dB',20*Math.log10(Math.hypot(outAC.values[0],outAC.imag[0])),-10*Math.log10(2),1e-8);
check('RC cutoff phase degrees',Math.atan2(outAC.imag[0],outAC.values[0])*180/Math.PI,-45,1e-8);
const stepAtTau=interp(value(outputs.step,'time').values,value(outputs.step,'v(out)').values,tau);
check('RC step after one time constant',stepAtTau,1-Math.exp(-1),0.00002);
check('Generic opamp closed-loop gain',value(outputs.opamp,'v(out)').values[0]/0.1,11,0.01);
check('Closed switch divider',value(outputs.switch,'v(out)').values[0],5000/1001,1e-8);
// Pinned native reference: ngspice 42+ds-3build1 from Ubuntu 24.04 snapshot.
const nativeVersion=execFileSync('ngspice',['--version'],{encoding:'utf8'});
const nativeHash=crypto.createHash('sha256').update(await fs.readFile('/usr/bin/ngspice')).digest('hex');
if(nativeHash!=='820658317b0b54035208da41936fd6871ce924036e5ea4113a4168b821b7fc45') throw new Error('Native reference hash differs; update pin explicitly after review.');
function parseRaw(buffer) {
 const marker=Buffer.from('Binary:\n');const offset=buffer.indexOf(marker)+marker.length;
 const header=buffer.subarray(0,offset).toString('utf8');
 const n=+header.match(/No\. Variables:\s*(\d+)/)[1],count=+header.match(/No\. Points:\s*(\d+)/)[1],complex=/Flags:.*complex/.test(header);
 const entries=[...header.matchAll(/^\s*\d+\s+(\S+)\s+(\S+)\s*$/gm)].map(m=>({name:m[1],unit:m[2],values:[],...(complex?{imag:[]}: {})}));
 let pos=offset;for(let i=0;i<count;i++)for(let j=0;j<n;j++){ entries[j].values.push(buffer.readDoubleLE(pos));pos+=8;if(complex){entries[j].imag.push(buffer.readDoubleLE(pos));pos+=8;}}
 return{vectors:entries,points:count};
}
for(const [name,deck] of Object.entries(fixtures)) {
 const net=path.join(stage,name+'.cir'),raw=path.join(stage,name+'.raw');await fs.writeFile(net,deck);
 execFileSync('ngspice',['-b','-r',raw,net],{encoding:'utf8',stdio:'pipe'});
 const reference=parseRaw(await fs.readFile(raw));
 for(const v of outputs[name].vectors){
   const ref=value(reference,v.name);if(!ref)throw new Error(`Native reference missing ${v.name}`);
   if(name==='step') { if(v.name==='time')continue;const t=value(outputs[name],'time').values,rt=value(reference,'time').values;let max=0;for(let i=0;i<t.length;i++)max=Math.max(max,Math.abs(v.values[i]-interp(rt,ref.values,t[i])));check(`Native comparison ${name}/${v.name}`,max,0,2e-5); }
   else {if(v.values.length!==ref.values.length)throw new Error(`Reference point count differs ${name}/${v.name}`);let max=0;for(let i=0;i<v.values.length;i++){max=Math.max(max,Math.abs(v.values[i]-ref.values[i]));if(v.imag)max=Math.max(max,Math.abs(v.imag[i]-ref.imag[i]));}check(`Native comparison ${name}/${v.name}`,max,0,Math.max(1e-8,...ref.values.map(x=>Math.abs(x)*1e-5)));}
 }
}
// Invalid model must fail promptly and permit a valid run immediately afterwards.
let failure;
try { await engine.run('Missing model\nV1 in 0 5\nR1 in out 1000\nD1 out 0 DOESNOTEXIST\n.op\n.end',{timeoutMs:3000}); } catch(e){failure={message:e.message,status:e.status,logs:e.logs};}
if(failure?.status!=='failed')throw new Error('Missing model did not fail with diagnostics: '+JSON.stringify(failure));
outputs.recovery=await engine.run(fixtures.divider);check('Recovery after failure',value(outputs.recovery,'v(out)').values[0],5,1e-9);
const stress='Bounded cancellation stress\nV1 in 0 PULSE(0 1 0 1e-12 1e-12 1e-6 2e-6)\nR1 in out 10000\nC1 out 0 1e-7\n.tran 1e-12 1000 0 1e-12 uic\n.end';
let ticks=0,cancelStart,cancelStatus;const heartbeat=setInterval(()=>ticks++,5);
try { await engine.run(stress,{timeoutMs:5000,onLog:line=>{if(line.includes('calculating'))setTimeout(()=>{cancelStart=performance.now();engine.stop();},50);}}); }catch(e){cancelStatus=e.status;}
clearInterval(heartbeat);if(cancelStatus!=='cancelled'||!ticks)throw new Error('Cancellation / main-event-loop responsiveness failed');
const cancelMs=performance.now()-cancelStart;
check('Recovery after cancellation',value(await engine.run(fixtures.divider),'v(out)').values[0],5,1e-9);
let timeoutStatus;try{await engine.run(stress,{timeoutMs:150});}catch(e){timeoutStatus=e.status;}if(timeoutStatus!=='timed-out')throw new Error('Timeout did not stop computation');
check('Recovery after timeout',value(await engine.run(fixtures.divider),'v(out)').values[0],5,1e-9);
const memory=[];for(let i=0;i<40;i++){await engine.run(fixtures.ac);await new Promise(r=>setTimeout(r,5));global.gc?.();memory.push({run:i+1,...process.memoryUsage()});}
await new Promise(r=>setTimeout(r,50));
if(lifecycle.alive!==0||lifecycle.created!==lifecycle.terminated)throw new Error('Worker leak '+JSON.stringify(lifecycle));
const last=memory.slice(-10).map(x=>x.rss),first=memory.slice(5,15).map(x=>x.rss),mean=a=>a.reduce((p,v)=>p+v,0)/a.length;
const growth=mean(last)-mean(first);
if(growth>64*1024*1024)throw new Error(`Worker memory growth exceeds 64 MiB allowance: ${growth}`);
const result={testedAt:new Date().toISOString(),scope:'Actual production Worker adapter exercised with Node worker_threads shim; browser/UI/offline require separate browser QA.',engine:ENGINE_INFO,nativeReference:{package:'ngspice 42+ds-3build1',sha256:nativeHash,version:nativeVersion},checks,fixtures:Object.fromEntries(Object.entries(outputs).map(([k,v])=>[k,{points:v.points,durationMs:v.durationMs,warnings:v.warnings}])),invalidModel:failure,lifecycle:{...lifecycle,cancelStatus,cancelResponseMs:cancelMs,mainThreadHeartbeatTicksDuringLongRun:ticks,timeoutStatus},memory:{runs:memory.length,observedMeanRSSGrowthBytes:growth,allowanceBytes:64*1024*1024,samples:memory},status:'passed'};
await fs.mkdir(path.join(root,'evidence'),{recursive:true});await fs.writeFile(path.join(root,'evidence','engine-validation.json'),JSON.stringify(result,null,2)+'\n');
await fs.mkdir(path.join(root,'tests','engine-fixtures'),{recursive:true});for(const [name,deck]of Object.entries(fixtures))await fs.writeFile(path.join(root,'tests','engine-fixtures',name+'.cir'),deck+'\n');
console.log(JSON.stringify({status:result.status,checks:checks.length,lifecycle:result.lifecycle,memory:result.memory.observedMeanRSSGrowthBytes},null,2));
await fs.rm(stage,{recursive:true,force:true});
