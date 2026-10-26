/** Authored DVS circuits, actual digital/MNA execution and portable provenance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Worker as NodeWorker} from 'node:worker_threads';
import {getPart,getPins,MODELS,LOGIC_IO_MODEL_VERSION,LOGIC_IO_TYPES} from '../src/library.js';
import {newProject,addComponent,uid,validateProject,setComponentParams,canConnect} from '../src/model.js';
import {generateNetlist,compileSimulation} from '../src/netlist.js';
import {simulateDigital,generateTruthTable} from '../src/digital.js';
import {compileCoordinated,createCoordinatedSession} from '../src/coordinated.js';
import {WorkbenchEngine} from '../src/simulation.js';
import {appendContinuousResult} from '../src/continuous.js';
import {safeEnvelope} from '../src/storage.js';

const ep=(c,pin)=>`${c.id}:${pin}`;
const errors=generated=>generated.diagnostics.filter(item=>item.severity==='error');
const close=(actual,expected,tolerance=1e-11)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
function fixture({voltage=false,state='0',solver='coordinated'}={}){
 const p=newProject('Digital voltage source integration');Object.assign(p.analysis,{type:'tran',solver,step:'1u',duration:'20u'});
 const add=(type,params={})=>{const c=addComponent(p,type);Object.assign(c.params,params);return c;};
 const wire=(a,pa,b,pb)=>{const id=uid('wire');p.circuit.connections.push({id,a:ep(a,pa),b:ep(b,pb)});p.layout.wires[id]={points:[]};};
 const label=(c,pin,name)=>p.circuit.labels.push({id:uid('label'),target:ep(c,pin),name});
 const source=add('DVS',{state,outputMode:voltage?'logic-voltage':'logic',rise:'4u',fall:'6u'}),indicator=add('DLED');wire(source,'out',indicator,'in');label(source,'out','logic');
 let load,ground;if(voltage){load=add('R',{value:'1k'});ground=add('GND');wire(source,'p',load,'1');wire(source,'n',load,'2');wire(source,'n',ground,'0');label(source,'p','voltage');}
 return {p,source,indicator,load,ground,add,wire,label};
}
function compile(f){const p=validateProject(f.p),generated=generateNetlist(p);assert.deepEqual(errors(generated),[]);const plan=compileCoordinated(p,generated);return{p,generated,plan,session:createCoordinatedSession(plan)};}
const final=(result,name)=>result.vectors.find(v=>v.name===name).values.at(-1);

test('DVS and DLED have versioned original models and explicit selectable port domains',()=>{
 assert.deepEqual(LOGIC_IO_TYPES,['DVS','DLED']);
 for(const type of LOGIC_IO_TYPES){const part=getPart(type),model=MODELS[part.model];assert.equal(model.version,LOGIC_IO_MODEL_VERSION);assert.equal(model.license,'MIT');assert.equal(JSON.parse(model.definition).type,type);}
 const {source}=fixture();assert.deepEqual(getPins(source).map(p=>[p.id,p.domain,p.width]),[['out','digital',1]]);
 source.params.outputMode='logic-voltage';assert.deepEqual(getPins(source).map(p=>[p.id,p.domain,p.width]),[['out','digital',1],['p','analog',1],['n','analog',1]]);
 assert.deepEqual(JSON.parse(MODELS.CB_DVS.definition).portPolicy,{out:'always',p:'outputMode=logic-voltage',n:'outputMode=logic-voltage'});
 assert.deepEqual(getPins('DLED').map(p=>[p.id,p.domain,p.direction,p.width]),[['in','digital','input',1]]);
});

test('default DVS directly drives native logic and passive indicators without ground or WASM',()=>{
 for(const state of['0','1']){const f=fixture({state,solver:'ngspice'}),gate=f.add('NOT');f.wire(f.source,'out',gate,'in');f.label(gate,'out','inverted');const g=generateNetlist(validateProject(f.p));assert.deepEqual(errors(g),[]);assert.equal(g.simulation.mode,'digital');assert.equal(g.simulation.dacs.length,0);assert.equal(g.simulation.digital.sources.length,1);assert.equal(g.simulation.digital.gates.length,1);const result=simulateDigital({...g.simulation.digital,duration:g.simulation.duration});assert.equal(result.traces.find(t=>t.node==='logic').events.at(-1).value,state);assert.equal(result.traces.find(t=>t.node==='inverted').events.at(-1).value,state==='1'?'0':'1');}
});

test('DVS constant sources participate in the existing exhaustive truth-table engine',()=>{
 const f=fixture(),gate=f.add('NOT');f.wire(f.source,'out',gate,'in');f.label(gate,'out','inverted');const g=generateNetlist(f.p),table=generateTruthTable(g.simulation.digital,{inputIds:[f.source.id],outputNames:['d(inverted)']});assert.deepEqual(table.rows.map(row=>[row.inputs[0],row.outputs[0]]),[['0','1'],['1','0']]);
});

test('DVS rejects invalid states, port modes and active voltage parameters',()=>{
 for(const state of['X','Z','2','01']){const f=fixture();f.source.params.state=state;assert.throws(()=>validateProject(f.p),/Logic state/);assert.throws(()=>compileSimulation(f.p),/known logic/);assert.throws(()=>compileCoordinated(f.p),/known logic/);}
 const wrongMode=fixture();wrongMode.source.params.outputMode='automatic';assert.throws(()=>validateProject(wrongMode.p),/Output mode/);
 for(const changes of[{low:'5'},{high:'bad'},{rise:'0'},{fall:'0.5p'},{rise:'10000s'}]){const f=fixture({voltage:true});Object.assign(f.source.params,changes);assert.ok(errors(generateNetlist(f.p)).length>0,JSON.stringify(changes));}
});

test('changing DVS port mode preserves wired, labelled and probed voltage terminals atomically',()=>{
 for(const kind of['wire','label','probe']){const f=fixture();setComponentParams(f.p,f.source.id,{outputMode:'logic-voltage'});if(kind==='wire'){const r=f.add('R');f.wire(f.source,'p',r,'1');}if(kind==='label')f.label(f.source,'n','reference');if(kind==='probe')f.p.probes.push({id:uid('probe'),kind:'voltage',a:ep(f.source,'p'),b:null,label:'Voltage'});const before=structuredClone(f.p);assert.throws(()=>setComponentParams(f.p,f.source.id,{outputMode:'logic'}),/disconnect voltage terminals/i);assert.deepEqual(f.p,before);}
 const f=fixture();setComponentParams(f.p,f.source.id,{outputMode:'logic-voltage'});assert.equal(getPins(f.source).length,3);setComponentParams(f.p,f.source.id,{outputMode:'logic'});assert.deepEqual(getPins(f.source).map(pin=>pin.id),['out']);assert.deepEqual(errors(generateNetlist(f.p)),[]);
});

test('voltage terminals require an explicit analog reference and never alias the logic output',()=>{
 const f=fixture();setComponentParams(f.p,f.source.id,{outputMode:'logic-voltage'});const g=generateNetlist(f.p);assert.ok(errors(g).some(d=>/ground reference/i.test(d.message)));assert.ok(errors(g).some(d=>/Voltage.*unconnected/.test(d.message)));assert.equal(canConnect(f.p,ep(f.source,'out'),ep(f.source,'p')).ok,false);
 const grounded=fixture({voltage:true});grounded.wire(grounded.source,'out',grounded.source,'p');assert.ok(errors(generateNetlist(grounded.p)).some(d=>d.code==='NET_DOMAIN_CONFLICT'));
});

test('DVS initial voltage honors low/high and a separate nonzero reference immediately',()=>{
 for(const state of['0','1']){const f=fixture({voltage:true,state});Object.assign(f.source.params,{low:'-1',high:'3'});const reference=f.add('V',{dc:'0.75',ac:'0'});const old=f.p.circuit.connections.find(w=>w.a===ep(f.source,'n')&&w.b===ep(f.ground,'0'));f.p.circuit.connections=f.p.circuit.connections.filter(w=>w!==old);delete f.p.layout.wires[old.id];f.wire(reference,'p',f.source,'n');f.wire(reference,'n',f.ground,'0');const {generated,plan,session}=compile(f),result=session.advanceTo(2e-6),expected=state==='1'?3:-1;assert.equal(plan.dacs[0].initial,expected);assert.equal(generated.simulation.dacs[0].initial,expected);for(const value of result.vectors.find(v=>v.name==='v(voltage)').values)close(value,expected+.75);close(final(result,`i(${plan.dacs[0].sourceName.toLowerCase()})`),-expected/1000);}
});

test('live DVS changes retain time and follow the configured rise and fall slopes',()=>{
 const f=fixture({voltage:true}),{session}=compile(f);session.advanceTo(10e-6);session.setInputs([{id:f.source.id,value:'1'}]);let r=session.advanceTo(12e-6);assert.equal(final(r,'d(logic)'),'1');close(final(r,'v(voltage)'),2.5);close(final(session.advanceTo(14e-6),'v(voltage)'),5);session.setInputs([{id:f.source.id,value:'0'}]);r=session.advanceTo(17e-6);assert.equal(final(r,'d(logic)'),'0');close(final(r,'v(voltage)'),2.5);close(final(session.advanceTo(20e-6),'v(voltage)'),0);assert.deepEqual(session.inputTimeline.map(e=>e.value),['1','0']);close(session.inputTimeline[0].time,10e-6,1e-18);close(session.inputTimeline[1].time,14e-6,1e-18);
});

test('live DVS changes retain capacitor state across command boundaries',()=>{
 const f=fixture({voltage:true}),cap=f.add('C',{value:'1u',ic:'0'});f.p.circuit.connections=f.p.circuit.connections.filter(w=>!(w.a===ep(f.source,'n')&&w.b===ep(f.load,'2')));f.wire(f.load,'2',cap,'1');f.wire(cap,'2',f.ground,'0');f.label(cap,'1','charge');const {session}=compile(f);session.advanceTo(10e-6);session.setInputs([{id:f.source.id,value:'1'}]);let r=session.advanceTo(.001);const before=final(r,'v(charge)');assert.ok(before>3&&before<3.5);session.setInputs([{id:f.source.id,value:'0'}]);r=session.advanceTo(.001);close(final(r,'v(charge)'),before);assert.ok(final(session.advanceTo(.0011),'v(charge)')<before);
});

test('DVS rejects unknown live values before any controls or timeline mutate',()=>{
 const f=fixture(),other=f.add('DIN',{state:'0'}),{session}=compile(f);session.advanceTo(5e-6);const before=structuredClone(session.inputTimeline);for(const value of['X','Z','01','2']){assert.throws(()=>session.setInputs([{id:other.id,value:'1'},{id:f.source.id,value}]),/logic|word|bits|Expected/i);assert.deepEqual(session.inputTimeline,before);assert.equal(session.digital.getValue(session.plan.digital.sources.find(s=>s.id===other.id).output),'0');assert.equal(session.digital.getValue('logic'),'0');}session.setInputs([{id:f.source.id,value:'0x1'}]);assert.equal(session.digital.getValue('logic'),'1');assert.equal(session.inputTimeline.at(-1).value,'1');
});

test('resolved contention remains X in logic mode and explicitly stops voltage projection',()=>{
 for(const voltage of[false,true]){const f=fixture({voltage,state:'1'}),other=f.add('DIN',{state:'0'});f.wire(f.source,'out',other,'out');const g=generateNetlist(f.p);assert.deepEqual(errors(g),[]);if(voltage)assert.throws(()=>createCoordinatedSession(compileCoordinated(f.p,g)),/X\/Z|input is X/);else assert.equal(simulateDigital({...g.simulation.digital,duration:g.simulation.duration}).traces.find(t=>t.node==='logic').events[0].value,'X');}
});

test('generated DVS voltage-source names cannot collide with authored source references',()=>{
 const f=fixture({voltage:true,state:'1'}),independent=f.add('V',{dc:'2',ac:'0'}),load=f.add('R',{value:'2k'});independent.ref='V_CB_DV1';f.wire(independent,'p',load,'1');f.wire(independent,'n',load,'2');f.wire(independent,'n',f.ground,'0');const {generated,plan,session}=compile(f);assert.equal(generated.simulation.dacs[0].sourceName,'V_CB_DV1_1');assert.equal(plan.dacs[0].sourceName,'V_CB_DV1_1');const result=session.advanceTo(2e-6);assert.equal(result.vectors.filter(v=>v.name==='i(v_cb_dv1)').length,1);assert.equal(result.vectors.filter(v=>v.name==='i(v_cb_dv1_1)').length,1);close(final(result,'v(voltage)'),5);
});

test('voltage projection and ADC readback use coordinated analog/digital coupling',()=>{
 const f=fixture({voltage:true,state:'1',solver:'ngspice'}),adc=f.add('ADC');f.wire(f.source,'p',adc,'in');f.wire(f.source,'n',adc,'ref');f.label(adc,'out','readback');assert.ok(errors(generateNetlist(f.p)).some(d=>d.code==='MIXED_ANALOG_FEEDBACK'));f.p.analysis.solver='coordinated';const {session}=compile(f);assert.equal(final(session.advanceTo(2e-6),'d(readback)'),'1');
});

test('continuous DVS backup preserves actual live changes and rejects corrupted unknown values',()=>{
 const f=fixture({voltage:true}),{p,generated,plan,session}=compile(f);let result=appendContinuousResult(null,session.advanceTo(10e-6),{inputChanges:[]});const updates=[{id:f.source.id,value:'1'}];session.setInputs(updates);const changes=[{time:session.time,updates}];result=appendContinuousResult(result,session.advanceTo(20e-6),{inputChanges:changes});result.continuous.sessionStatus='stopped';
 const run={id:'run_dvs_storage',projectId:p.id,revision:p.revision,projectSnapshot:structuredClone(p),analysis:structuredClone(p.analysis),status:'completed-with-warnings',startedAt:'2020-01-01T00:00:00.000Z',completedAt:'2020-01-01T00:00:01.000Z',netlist:generated.netlist,netlistHash:'a'.repeat(64),simulationHash:'b'.repeat(64),coordinatedPlan:plan,simulation:generated.simulation,models:generated.modelManifest,measurements:generated.measurements,diagnostics:generated.diagnostics,engine:result.engine,logs:result.logs,result};
 const envelope={project:p,runs:[run],activeRunId:run.id};let restored=safeEnvelope(JSON.parse(JSON.stringify(envelope)),validateProject);restored=safeEnvelope(JSON.parse(JSON.stringify(restored)),validateProject);assert.deepEqual(restored.runs[0].result.continuous.inputChanges,changes);assert.deepEqual(restored.runs[0].simulation,generated.simulation);assert.deepEqual(restored.runs[0].coordinatedPlan,plan);assert.deepEqual(restored.runs[0].models,generated.modelManifest);for(const value of['X','Z']){const invalid=structuredClone(envelope);invalid.runs[0].result.continuous.inputChanges[0].updates[0].value=value;assert.throws(()=>safeEnvelope(invalid,validateProject),/digital voltage source input/);}
});

test('production ngspice WASM executes both DVS voltage levels through the complete mixed runner',async()=>{
 const stage=await fs.mkdtemp(path.join(os.tmpdir(),'circuitbench-dvs-worker-')),previous=globalThis.Worker,exits=[],lifecycle={created:0,terminated:0,alive:0};
 try{await fs.mkdir(path.join(stage,'src'));await fs.writeFile(path.join(stage,'package.json'),'{"type":"module"}');for(const file of['engine.js','engine-worker.js'])await fs.copyFile(new URL('../src/'+file,import.meta.url),path.join(stage,'src',file));await fs.cp(new URL('../public/engine/',import.meta.url),path.join(stage,'engine'),{recursive:true});
  globalThis.Worker=class{constructor(target){lifecycle.created++;lifecycle.alive++;this.thread=new NodeWorker(new URL('../scripts/engine-node-worker.mjs',import.meta.url),{workerData:{target:String(target)}});this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.({message:error.message,preventDefault(){}}));exits.push(new Promise(resolve=>this.thread.on('exit',()=>{lifecycle.alive--;resolve();})));}postMessage(message){this.thread.postMessage(message);}terminate(){lifecycle.terminated++;return this.thread.terminate();}};
  const {CircuitEngine}=await import(pathToFileURL(path.join(stage,'src','engine.js')));for(const state of['0','1']){const f=fixture({voltage:true,state,solver:'ngspice'});Object.assign(f.source.params,{low:'-1',high:'3.3'});const generated=generateNetlist(f.p);assert.deepEqual(errors(generated),[]);const engine=new WorkbenchEngine({analogEngine:new CircuitEngine(),digitalEngine:{async run(plan,options){return simulateDigital(plan,{sources:options.sources});},stop(){return false;}}});const result=await engine.run(generated.netlist,{project:f.p,generated,timeoutMs:15000});assert.equal(result.engine.mode,'mixed');assert.equal(result.engine.analog.name,'ngspice');assert.equal(final(result,'d(logic)'),state);for(const value of result.vectors.find(v=>v.name==='v(voltage)').values)close(value,state==='1'?3.3:-1,1e-9);}
  await Promise.all(exits);assert.deepEqual(lifecycle,{created:2,terminated:2,alive:0});
 }finally{globalThis.Worker=previous;await Promise.all(exits);await fs.rm(stage,{recursive:true,force:true});}
});
