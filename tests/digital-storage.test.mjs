import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject,VERSION} from '../src/model.js';
import {safeEnvelope} from '../src/storage.js';

function backup(){
 const project=newProject('Four-state record');project.analysis.type='tran';
 const run={id:'run_logic',projectId:project.id,revision:0,projectSnapshot:structuredClone(project),analysis:structuredClone(project.analysis),startedAt:'2026-10-24T06:00:00Z',completedAt:'2026-10-24T06:00:01Z',status:'completed',netlist:'CircuitBench digital fixture',models:[],logs:[],diagnostics:[],measurements:[{id:'logic_out',label:'Output',kind:'logic',unit:'logic',vector:'d(out)'}],result:{points:4,vectors:[{name:'time',unit:'s',values:[0,1e-6,2e-6,3e-6]},{name:'d(out)',kind:'logic',unit:'logic',values:['0','1','X','Z']}],warnings:[],sampling:{mode:'digital-events',description:'Settled right-continuous logic states.'}}};
 return {format:'CircuitBench',formatVersion:1,appVersion:VERSION,project,runs:[run],activeRunId:run.id};
}

test('portable digital record preserves all four literal states and its snapshot',()=>{
 const input=backup(),saved=safeEnvelope(JSON.parse(JSON.stringify(input)),validateProject);
 assert.deepEqual(saved.runs[0].result.vectors[1].values,['0','1','X','Z']);
 assert.deepEqual(saved.runs[0].projectSnapshot,input.project);
 assert.equal(saved.runs[0].measurements[0].kind,'logic');
});
test('numeric pseudo-logic and unknown state tokens are rejected',()=>{
 for(const value of [0,1,2,null,'U','x']){const input=backup();input.runs[0].result.vectors[1].values[2]=value;assert.throws(()=>safeEnvelope(input,validateProject),/logic results/);}
 const input=backup();delete input.runs[0].result.vectors[1].kind;assert.throws(()=>safeEnvelope(input,validateProject),/numerical results/);
});
test('logic imports require a valid transient time order',()=>{
 for(const values of [[0,1e-6,1e-6,3e-6],[0,2e-6,1e-6,3e-6],[-1,1e-6,2e-6,3e-6]]){const input=backup();input.runs[0].result.vectors[0].values=values;assert.throws(()=>safeEnvelope(input,validateProject),/time axis/);}
 const input=backup();input.project.analysis.type='ac';input.runs[0].analysis.type='ac';input.runs[0].projectSnapshot.analysis.type='ac';assert.throws(()=>safeEnvelope(input,validateProject),/transient time axis/);
});
test('logic measurement kind and unit must agree',()=>{
 const input=backup();input.runs[0].measurements[0].unit='V';assert.throws(()=>safeEnvelope(input,validateProject),/measurement definition/);
});
test('mixed sample provenance and exact analog inputs survive a backup round trip',()=>{
 const input=backup(),result=input.runs[0].result;result.vectors.push({name:'v(out)',unit:'V',values:[0,.5,1,1.5]});result.sampling={mode:'event-union',description:'Original analog positions plus interpolated digital event times.',analogSampleIndices:[0,2,3]};result.analogNetlists=['Mixed replay\nR1 out 0 1k\n.end'];
 const saved=safeEnvelope(input,validateProject).runs[0].result;
 assert.deepEqual(saved.sampling.analogSampleIndices,[0,2,3]);assert.deepEqual(saved.analogNetlists,result.analogNetlists);
});
test('mixed provenance cannot point beyond, repeat, or omit its source positions',()=>{
 for(const indices of [[0,2,4],[0,2,2],[2,0],undefined]){const input=backup();input.runs[0].result.sampling={mode:'event-union',description:'Test',analogSampleIndices:indices};assert.throws(()=>safeEnvelope(input,validateProject),/analog sample/);}
 const input=backup();input.runs[0].result.analogNetlists=[{netlist:'not a string'}];assert.throws(()=>safeEnvelope(input,validateProject),/analog execution/);
});
test('sparse event evidence round-trips and must agree with the logic samples',()=>{
 const input=backup(),result=input.runs[0].result;
 result.digitalEvents=[{name:'d(out)',events:result.vectors[0].values.map((time,i)=>({time,value:result.vectors[1].values[i]}))}];
 assert.deepEqual(safeEnvelope(input,validateProject).runs[0].result.digitalEvents,result.digitalEvents);
 result.digitalEvents[0].events[1].value='X';assert.throws(()=>safeEnvelope(input,validateProject),/events.*(ordered|disagree)/);
});
test('sparse event evidence rejects future, nonliteral and unseeded transitions',()=>{
 for(const events of [[{time:1e-6,value:'0'}],[{time:0,value:'0'},{time:4e-6,value:'1'}],[{time:0,value:0}]]){const input=backup();input.runs[0].result.digitalEvents=[{name:'d(out)',events}];assert.throws(()=>safeEnvelope(input,validateProject),/digital events/);}
});

function busBackup(){
 const input=backup(),run=input.runs[0],vector=run.result.vectors[1];
 Object.assign(vector,{kind:'bus',width:4,bitOrder:'msb-first',values:['0000','1010','10XZ','ZZZZ']});
 Object.assign(run.measurements[0],{kind:'bus',width:4,bitOrder:'msb-first'});
 run.result.digitalEvents=[{name:vector.name,kind:'bus',width:4,bitOrder:'msb-first',events:run.result.vectors[0].values.map((time,i)=>({time,value:vector.values[i]}))}];
 return input;
}
test('bus backup preserves exact words, leading zeros, X/Z bits and event evidence',()=>{
 const input=busBackup(),saved=safeEnvelope(JSON.parse(JSON.stringify(input)),validateProject);
 assert.deepEqual(saved.runs[0].result,input.runs[0].result);
 assert.deepEqual(saved.runs[0].measurements,input.runs[0].measurements);
});
test('bus imports reject missing width/order, unsupported dimensions and padded or numeric words',()=>{
 for(const width of [undefined,0,1,9,4.5,'4']){const input=busBackup();input.runs[0].result.vectors[1].width=width;assert.throws(()=>safeEnvelope(input,validateProject),/bus results/);}
 for(const order of [undefined,'lsb-first','native']){const input=busBackup();input.runs[0].result.vectors[1].bitOrder=order;assert.throws(()=>safeEnvelope(input,validateProject),/bus results/);}
 for(const word of ['1','00101','10xz','0x0A',10,null,' 1010']){const input=busBackup();input.runs[0].result.vectors[1].values[1]=word;assert.throws(()=>safeEnvelope(input,validateProject),/logic results/);}
});
test('bus sparse events must have coherent metadata and exact matching held words',()=>{
 for(const field of ['kind','width','bitOrder']){const input=busBackup();input.runs[0].result.digitalEvents[0][field]={kind:'logic',width:8,bitOrder:'lsb-first'}[field];assert.throws(()=>safeEnvelope(input,validateProject),/event widths/);}
 const input=busBackup();input.runs[0].result.digitalEvents[0].events[1].value='1000';assert.throws(()=>safeEnvelope(input,validateProject),/disagree/);
});
test('bus measurement width cannot disagree with the stored vector',()=>{
 const input=busBackup();input.runs[0].measurements[0].width=8;assert.throws(()=>safeEnvelope(input,validateProject),/bus measurements/);
});
test('legacy single-bit evidence remains distinct from bus words',()=>{
 const input=backup();input.runs[0].result.vectors[1].width=4;assert.throws(()=>safeEnvelope(input,validateProject),/scalar logic/);
 assert.equal(safeEnvelope(backup(),validateProject).runs[0].result.vectors[1].kind,'logic');
});
