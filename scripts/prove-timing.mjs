/** Actual production-worker timing proof. Does not claim browser or HTTPS QA. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {Worker as NodeWorker} from 'node:worker_threads';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),stage=await fs.mkdtemp(path.join(os.tmpdir(),'circuitbench-timing-proof-'));
await fs.cp(path.join(root,'src'),path.join(stage,'src'),{recursive:true});
await fs.mkdir(path.join(stage,'engine'));await fs.writeFile(path.join(stage,'package.json'),'{"type":"module"}');
for(const file of ['eecircuit-engine.js','spice.wasm'])await fs.copyFile(path.join(root,'public/engine',file),path.join(stage,'engine',file));
const lifecycle={created:0,terminated:0,alive:0,digital:0,analog:0},exits=[];
globalThis.Worker=class{
 constructor(target){lifecycle.created++;lifecycle.alive++;lifecycle[String(target).includes('/digital-worker.js')?'digital':'analog']++;
  this.thread=new NodeWorker(new URL('./engine-node-worker.mjs',import.meta.url),{workerData:{target:String(target)}});
  this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.({message:error.message,preventDefault(){}}));
  exits.push(new Promise(resolve=>this.thread.on('exit',()=>{lifecycle.alive--;resolve();})));
 }
 postMessage(message){this.thread.postMessage(message);}
 terminate(){lifecycle.terminated++;return this.thread.terminate();}
};
const module=async name=>import(pathToFileURL(path.join(stage,'src',name)));
const {WorkbenchEngine}=await module('simulation.js'),{EXAMPLES}=await module('examples.js'),{generateNetlist}=await module('netlist.js');
const {VERSION,validateProject}=await module('model.js'),{createTimingRecord,validateTimingRecords,timingCSV,timingEvidenceJSON}=await module('timing-evidence.js'),{safeEnvelope}=await module('storage.js');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex'),engine=new WorkbenchEngine(),checks=[],runs=[],records=[];
const verify=(name,condition,detail)=>{checks.push({name,pass:Boolean(condition),...(detail===undefined?{}:{detail})});if(!condition)throw new Error(name+': '+JSON.stringify(detail));};
const close=(name,actual,expected,tolerance=1e-15)=>verify(name,Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,{actual,expected,absoluteTolerance:tolerance});
async function execute(id){
 const example=EXAMPLES.find(example=>example.id===id),project=validateProject(example.create()),generated=generateNetlist(project),startedAt=new Date().toISOString();
 verify(id+': no compiler errors',!generated.diagnostics.some(d=>d.severity==='error'),generated.diagnostics);
 const result=await engine.run(generated.netlist,{project,generated,timeoutMs:15000});
 const run={id:'run_'+id.replaceAll('-','_'),projectId:project.id,revision:project.revision,projectSnapshot:project,startedAt,completedAt:new Date().toISOString(),analysis:project.analysis,netlist:generated.netlist,netlistHash:hash(generated.netlist),simulation:generated.simulation,simulationHash:hash(JSON.stringify(generated.simulation)),measurements:generated.measurements,models:generated.modelManifest,engine:result.engine,diagnostics:generated.diagnostics,logs:result.logs,status:result.warnings?.length?'completed-with-warnings':'completed',result};
 runs.push(run);console.log(id+': '+result.points+' stored times; '+result.digitalEvents.length+' digital traces');return run;
}
function measure(run,spec){const record=createTimingRecord(run,spec,{id:'timing_'+records.length});records.push(record);return record.result;}
function measured(result){return result.rows.filter(row=>row.status==='measured');}
try{
 const clock=await execute('timing-clock'),source={name:'d(clock)'},target={name:'d(delayed)'};
 for(const edge of ['rising','falling']){
  const result=measure(clock,{kind:'delay',source,target,edge,targetEdge:edge});
  verify('clock: '+edge+' preserves complete pairs and run-boundary misses',result.summary.measuredCount===(edge==='rising'?5:4)&&result.summary.missingCount===(edge==='rising'?0:1));
  measured(result).forEach((row,index)=>close('clock: '+edge+' delay '+index,row.value,20e-9));
 }
 for(const [kind,expected,count,unit]of[['pulse-width',25e-9,5,'s'],['period',100e-9,4,'s'],['frequency',1e7,4,'Hz'],['duty-cycle',25,4,'%']]){
  const result=measure(clock,{kind,source});verify('clock: '+kind+' complete count',result.summary.measuredCount===count);verify('clock: '+kind+' unit',result.unit===unit);
  measured(result).forEach((row,index)=>close('clock: '+kind+' '+index,row.value,expected,unit==='s'?1e-15:1e-7));
  if(kind!=='pulse-width')verify('clock: '+kind+' unfinished final cycle is explicit',result.summary.missingCount===1&&result.rows.at(-1).value===null);
 }
 const hazard=await execute('timing-hazard'),pulses=measure(hazard,{kind:'pulse-width',source:{name:'d(hazard)'}});
 verify('reconvergent hazard: two complete pulses',pulses.summary.measuredCount===2&&pulses.rows.length===2);
 for(const [i,start,end]of[[0,115e-9,135e-9],[1,265e-9,285e-9]]){close('hazard start '+i,pulses.rows[i].start,start);close('hazard end '+i,pulses.rows[i].end,end);close('hazard width '+i,pulses.rows[i].value,20e-9);}
 const uncertain=await execute('timing-unknown'),unknown=measure(uncertain,{kind:'pulse-width',source:{name:'d(uncertain)'}});
 verify('X/Z pulses remain indeterminate and unfinished pulse has no guessed width',JSON.stringify(unknown.rows.map(row=>row.status))===JSON.stringify(['indeterminate','measured','indeterminate','missing-edge']));
 close('known pulse among X/Z intervals',unknown.rows[1].value,40e-9);
 verify('X/Z and missing-edge rows have null values',unknown.rows.filter(row=>row.status!=='measured').every(row=>row.value===null));
 const clipped=measure(uncertain,{kind:'pulse-width',source:{name:'d(uncertain)'},window:{start:200e-9,end:225e-9}});
 verify('window clipping keeps explicit missing closing edge',clipped.rows.length===1&&clipped.rows[0].status==='missing-edge');
 const counter=await execute('bus-counter'),bitPeriod=measure(counter,{kind:'period',source:{name:'b(count)',bit:0},window:{start:0,end:4e-3}});
 verify('bus bit is recorded explicitly, without scalar slice substitution',records.at(-1).spec.source.bit===0&&records.at(-1).source.signals[0].width===4);
 measured(bitPeriod).forEach((row,index)=>close('counter bit0 period '+index,row.value,.002,1e-12));
 verify('counter has complete bit0 cycles',bitPeriod.summary.measuredCount===1);
 const mixed=await execute('bus-dac-bit'),mixedPulse=measure(mixed,{kind:'pulse-width',source:{name:'b(word)',bit:2}});
 verify('mixed run executed analog WASM and captured original samples',mixed.result.engine.mode==='mixed'&&mixed.result.sampling.analogSampleIndices.length>0);
 close('mixed selected bus bit high pulse',mixedPulse.rows[0].value,.001,1e-12);
 verify('mixed timing retains bridge assumptions',records.at(-1).sourceRun.bridgeAssumptions.length>0);
 const frozen=JSON.stringify(records[0]),changed=structuredClone(clock.projectSnapshot);changed.revision++;
 const restored=safeEnvelope(JSON.parse(JSON.stringify({project:changed,runs:[clock],timingMeasurements:[records[0]]})),validateProject);
 verify('saved timing is retained with its original revision',restored.timingMeasurements[0].revision===0&&restored.project.revision===1);
 verify('backup round trip preserves exact event sources and numbers',JSON.stringify(restored.timingMeasurements[0])===frozen);
 restored.runs[0].importedFromBackup=true;restored.timingMeasurements[0].importedFromBackup=true;
 verify('a restored project can be saved and reopened again',safeEnvelope(JSON.parse(JSON.stringify(restored)),validateProject).timingMeasurements[0].importedFromBackup===true);
 verify('timing survives original run removal',validateTimingRecords([records[0]],validateProject)[0].sourceRunId===clock.id);
 const csv=timingCSV(records[0]);verify('CSV contains exact delay, row status and run identity',csv.includes('2e-8')&&csv.includes('measured')&&csv.includes(clock.id));
 verify('standalone timing JSON preserves selected event streams',JSON.parse(timingEvidenceJSON(records[0])).measurement.source.signals.length===2);
 const tampered=structuredClone(records[0]);tampered.result.rows[0].value=99;
 let rejected=false;try{validateTimingRecords([tampered],validateProject);}catch{rejected=true;}verify('import rejects changed timing values',rejected);
 await Promise.all(exits);verify('all actual simulation workers terminated',lifecycle.created===lifecycle.terminated&&lifecycle.alive===0,lifecycle);
 const sourceHashes={};for(const file of ['src/timing.js','src/timing-evidence.js','src/digital.js','src/simulation.js','src/model.js','src/netlist.js','src/examples.js'])sourceHashes[file]=hash(await fs.readFile(path.join(stage,file)));
 const evidence={format:'CircuitBenchTimingProof',appVersion:VERSION,recordedAt:new Date().toISOString(),environment:'Node worker_threads adapting the production disposable Web Workers; not browser or target-host proof',status:'passed',checks,summary:{checks:checks.length,passed:checks.filter(check=>check.pass).length,fixtures:runs.length,measurements:records.length},lifecycle,sourceHashes,runs:runs.map(run=>({id:run.id,title:run.projectSnapshot.title,engine:run.engine,points:run.result.points,digitalEvents:run.result.digitalEvents,sampling:{...run.result.sampling,analogSampleIndices:undefined,originalAnalogTimes:run.result.sampling.analogSampleIndices.length}})),records};
 await fs.writeFile(path.join(root,'evidence/timing-validation.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence.summary));
}finally{engine.stop();await fs.rm(stage,{recursive:true,force:true});}
