import {measureTimingSource,timingSourceForRun} from './timing.js';
import {uid,validateProject as validateCircuitProject} from './model.js';
import {validateContinuousProvenance} from './continuous-evidence.js';

/** Sparse selected events travel with each measurement, independently of the run history. */
export const TIMING_EVIDENCE_LIMITS=Object.freeze({records:12,eventsPerRecord:250000,totalEvents:1000000,totalBytes:16*1024*1024});
const isObject=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const text=(value,max=200)=>typeof value==='string'&&value.length<=max;
const identifier=value=>text(value,100)&&/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const timestamp=value=>text(value,80)&&Number.isFinite(Date.parse(value));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
function jsonObject(value,maximum,label){
 assert(isObject(value),`${label} must be an object.`);
 let encoded;try{canonical(value);encoded=JSON.stringify(value);}catch{throw new Error(`${label} is not portable JSON.`);}
 assert(encoded.length<=maximum,`${label} is too large.`);
 return JSON.parse(encoded);
}
function canonical(value,depth=0){
 assert(depth<=24,'Saved timing evidence has excessive nesting.');
 if(Array.isArray(value))return value.map(item=>canonical(item,depth+1));
 if(isObject(value)){const result=Object.create(null);for(const key of Object.keys(value).sort())result[key]=canonical(value[key],depth+1);return result;}
 assert(value===null||typeof value==='string'||typeof value==='boolean'||finite(value),'Saved timing evidence must contain finite portable JSON values.');
 return value;
}
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const eventIdentity=source=>({...source,signals:source.signals.map(({label,...signal})=>signal).sort((a,b)=>a.name.localeCompare(b.name))});
const eventCount=record=>(record.source?.signals??[]).reduce((count,signal)=>count+(signal.events?.length??0),0);
const boundsMessage='Timing evidence exceeds the saved-event or 16 MiB backup limit. Shorten the simulation or select fewer signals.';
function capturedSampling(sampling){
 if(!sampling)return null;
 const result={};
 for(const key of ['mode','description','analogInterpolation','logicContinuity','timeResolution','windowStart','windowEnd'])if(sampling[key]!==undefined)result[key]=structuredClone(sampling[key]);
 return result;
}
function sourceMetadata(run){
 return {id:run.id,status:run.status,startedAt:run.startedAt,completedAt:run.completedAt??null,analysis:structuredClone(run.analysis),engine:structuredClone(run.engine??run.result?.engine??{}),netlistHash:run.netlistHash??null,simulationHash:run.simulationHash??null,sampling:capturedSampling(run.result?.sampling),...(run.result?.continuous?{continuous:structuredClone(run.result.continuous)}:{}),bridgeAssumptions:structuredClone(run.result?.bridgeAssumptions??[]),warnings:structuredClone(run.result?.warnings??[]),importedFromBackup:Boolean(run.importedFromBackup)};
}
function checkedSource(source){
 assert(isObject(source)&&Array.isArray(source.timeBounds)&&source.timeBounds.length===2&&finite(source.timeBounds[0])&&source.timeBounds[0]>=0&&finite(source.timeBounds[1])&&source.timeBounds[1]>source.timeBounds[0],'Saved timing source has invalid run boundaries.');
 assert(source.timeResolution===1e-12&&source.eventSource==='preserved-digital-events','Saved timing source must identify its preserved 1 ps digital events.');
 assert(Array.isArray(source.signals)&&source.signals.length>=1&&source.signals.length<=2,'Saved timing evidence must retain one or two selected signals.');
 const names=new Set();let count=0;
 const signals=source.signals.map(signal=>{
  assert(isObject(signal)&&text(signal.name)&&signal.name.length&&text(signal.label)&&!names.has(signal.name),'Saved timing signal names or labels are malformed.');names.add(signal.name);
  assert(['logic','bus'].includes(signal.kind)&&Number.isInteger(signal.width)&&signal.width>0&&signal.width<=8&&signal.kind===(signal.width===1?'logic':'bus')&&signal.bitOrder==='msb-first','Saved timing signal width or bit order is invalid.');
  assert(Array.isArray(signal.events)&&signal.events.length&&signal.events.length<=TIMING_EVIDENCE_LIMITS.eventsPerRecord,'Saved timing signal has too many or no events.');
  count+=signal.events.length;assert(count<=TIMING_EVIDENCE_LIMITS.eventsPerRecord,boundsMessage);
  const events=signal.events.map((event,index)=>{
   const previous=signal.events[index-1];
   assert(isObject(event)&&finite(event.time)&&event.time>=source.timeBounds[0]&&event.time<=source.timeBounds[1]&&text(event.value,8)&&event.value.length===signal.width&&/^[01XZ]+$/.test(event.value)&&(index===0?event.time===source.timeBounds[0]:event.time>previous.time&&event.value!==previous.value),'Saved timing events must be ordered, literal state changes beginning at the retained time boundary.');
   return {time:event.time,value:event.value};
  });
  return {name:signal.name,label:signal.label,kind:signal.kind,width:signal.width,bitOrder:'msb-first',events};
 });
 return {timeBounds:[...source.timeBounds],signals,timeResolution:1e-12,eventSource:'preserved-digital-events'};
}
function checkedMetadata(metadata,snapshot,sourceRunId,source){
 assert(isObject(metadata)&&metadata.id===sourceRunId&&['completed','completed-with-warnings'].includes(metadata.status),'Saved timing evidence must identify its completed source run.');
 assert(timestamp(metadata.startedAt)&&(metadata.completedAt===null||timestamp(metadata.completedAt))&&(metadata.completedAt===null||Date.parse(metadata.completedAt)>=Date.parse(metadata.startedAt)),'Saved timing source timestamps are invalid.');
 const normalizedAnalysis=validateCircuitProject({...snapshot,analysis:metadata.analysis}).analysis;
 assert(isObject(metadata.analysis)&&same(normalizedAnalysis,snapshot.analysis)&&snapshot.analysis.type==='tran','Saved timing analysis must match its transient circuit snapshot.');
 for(const key of ['netlistHash','simulationHash'])assert(metadata[key]===null||text(metadata[key],200),`Saved timing ${key} is invalid.`);
 assert(typeof metadata.importedFromBackup==='boolean','Saved timing source restoration metadata is invalid.');
 const engine=jsonObject(metadata.engine,40000,'Saved timing engine provenance');
 let sampling=null;
 if(metadata.sampling!==null){
  sampling=jsonObject(metadata.sampling,6000,'Saved timing sampling provenance');
  assert(Object.keys(sampling).every(key=>['mode','description','analogInterpolation','logicContinuity','timeResolution','windowStart','windowEnd'].includes(key)),'Saved timing sampling provenance contains unsupported fields.');
  for(const key of ['mode','description','analogInterpolation','logicContinuity'])if(sampling[key]!==undefined)assert(text(sampling[key],4000),'Saved timing sampling provenance is malformed.');
  if(sampling.timeResolution!==undefined)assert(finite(sampling.timeResolution)&&sampling.timeResolution>0,'Saved timing resolution is invalid.');
 }
 let continuous;
 if(sampling?.mode==='continuous-window'||metadata.continuous!==undefined)continuous=validateContinuousProvenance(metadata.continuous,snapshot,{timeBounds:source.timeBounds,sampling});
 else assert(source.timeBounds[0]===0&&sampling?.windowStart===undefined&&sampling?.windowEnd===undefined,'Saved non-continuous timing provenance must begin at time zero without continuous window bounds.');
 for(const key of ['bridgeAssumptions','warnings'])assert(Array.isArray(metadata[key])&&metadata[key].length<=20&&metadata[key].every(value=>text(value,4000)),`Saved timing ${key} are malformed.`);
 return {id:sourceRunId,status:metadata.status,startedAt:metadata.startedAt,completedAt:metadata.completedAt,analysis:structuredClone(snapshot.analysis),engine,netlistHash:metadata.netlistHash,simulationHash:metadata.simulationHash,sampling,...(continuous?{continuous}:{}),bridgeAssumptions:[...metadata.bridgeAssumptions],warnings:[...metadata.warnings],importedFromBackup:metadata.importedFromBackup};
}

/** Capture only the selected change-only traces. No analog or sampled-vector copy is needed. */
export function createTimingRecord(run,spec,{id=uid('timing'),createdAt=new Date().toISOString()}={}){
 assert(run&&['completed','completed-with-warnings'].includes(run.status),'Choose a completed run before measuring its timing.');
 const source=timingSourceForRun(run,spec),result=measureTimingSource(source,spec);
 const record={id,kind:'timing',status:'completed',projectId:run.projectId,revision:run.revision,sourceRunId:run.id,createdAt,projectSnapshot:structuredClone(run.projectSnapshot),sourceRun:sourceMetadata(run),source,spec:structuredClone(result.spec),result};
 return validateRecords([record],validateCircuitProject,{computedResults:new Map([[record,result]])})[0];
}

/** Recalculate stored numbers from their retained events; this is not a circuit resimulation. */
function validateRecords(records,validateProject,{runs=[],computedResults=null}={}){
 if(records===undefined)return [];
 assert(Array.isArray(records)&&records.length<=TIMING_EVIDENCE_LIMITS.records,'A backup may contain at most 12 timing measurements.');
 let totalEvents=0;const ids=new Set(),knownRuns=new Map(runs.map(run=>[run.id,run]));
 const validated=records.map(record=>{
  assert(isObject(record)&&identifier(record.id)&&!ids.has(record.id)&&record.kind==='timing'&&record.status==='completed','A saved timing measurement is malformed or has a duplicate identifier.');ids.add(record.id);
  assert(identifier(record.projectId)&&identifier(record.sourceRunId)&&Number.isInteger(record.revision)&&record.revision>=0,'Saved timing run or project identity is invalid.');
  const snapshot=validateProject(record.projectSnapshot);
  assert(snapshot.id===record.projectId&&snapshot.revision===record.revision,'A saved timing measurement does not match its captured circuit revision.');
  assert(timestamp(record.createdAt),'A saved timing measurement timestamp is invalid.');
  const source=checkedSource(record.source),sourceRun=checkedMetadata(record.sourceRun,snapshot,record.sourceRunId,source);
  assert(Date.parse(record.createdAt)>=Date.parse(sourceRun.completedAt??sourceRun.startedAt),'A saved timing measurement predates its completed source run.');
  jsonObject(record.spec,4000,'Saved timing selection');jsonObject(record.result,1000000,'Saved timing result');
  const result=computedResults?.get(record)??measureTimingSource(source,record.spec);
  for(const resolution of [sourceRun.sampling?.timeResolution,sourceRun.engine.timeResolution,sourceRun.engine.digital?.timeResolution])if(resolution!==undefined)assert(resolution===source.timeResolution,'Saved timing provenance disagrees with its preserved event resolution.');
  const selectedNames=new Set([result.spec.source.name,...(result.spec.target?[result.spec.target.name]:[])]);
  assert(source.signals.length===selectedNames.size&&source.signals.every(signal=>selectedNames.has(signal.name)),'Saved timing evidence contains unselected or missing event signals.');
  assert(same(record.spec,result.spec),'Saved timing selection is not in its normalized form.');
  assert(same(record.result,result),'Saved timing results disagree with their preserved digital events.');
  assert(record.importedFromBackup===undefined||typeof record.importedFromBackup==='boolean','Saved timing restoration flag is invalid.');
  const output={id:record.id,kind:'timing',status:'completed',projectId:record.projectId,revision:record.revision,sourceRunId:record.sourceRunId,createdAt:record.createdAt,projectSnapshot:snapshot,sourceRun,source,spec:structuredClone(result.spec),result,...(record.importedFromBackup!==undefined?{importedFromBackup:record.importedFromBackup}:{})};
  const original=knownRuns.get(record.sourceRunId);
  if(original){
   assert(original.projectId===record.projectId&&original.revision===record.revision&&same(original.projectSnapshot,snapshot),'Saved timing evidence disagrees with its retained source run snapshot.');
   assert(same(eventIdentity(timingSourceForRun(original,result.spec)),eventIdentity(source)),'Saved timing events disagree with their retained source run.');
   for(const signal of source.signals){
    const labels=new Set([signal.name,...(original.measurements??[]).filter(measurement=>measurement.vector===signal.name).map(measurement=>measurement.label)]);
    assert(labels.has(signal.label),'Saved timing signal label does not belong to its retained source run.');
   }
   const originalMetadata=sourceMetadata(original),recordedMetadata={...sourceRun};delete originalMetadata.importedFromBackup;delete recordedMetadata.importedFromBackup;
   assert(same(originalMetadata,recordedMetadata),'Saved timing provenance disagrees with its retained source run.');
  }
  totalEvents+=eventCount(output);assert(totalEvents<=TIMING_EVIDENCE_LIMITS.totalEvents,boundsMessage);
  assert(bytes(output)<=TIMING_EVIDENCE_LIMITS.totalBytes,boundsMessage);
  return output;
 });
 assert(bytes(validated)<=TIMING_EVIDENCE_LIMITS.totalBytes,boundsMessage);
 return validated;
}

export function validateTimingRecords(records,validateProject,{runs=[]}={}){return validateRecords(records,validateProject,{runs});}

/** Keep the newest records within every backup bound; the new record is never silently dropped. */
export function retainTimingRecords(records,newRecord){
 assert(Array.isArray(records)&&records.length<=TIMING_EVIDENCE_LIMITS.records,'Timing history is malformed.');
 assert(isObject(newRecord)&&identifier(newRecord.id)&&!records.some(record=>record.id===newRecord.id),'A timing measurement needs a unique identifier.');
 const incomingEvents=eventCount(newRecord),incomingBytes=bytes(newRecord);
 assert(incomingEvents<=TIMING_EVIDENCE_LIMITS.eventsPerRecord&&incomingBytes+2<=TIMING_EVIDENCE_LIMITS.totalBytes,boundsMessage);
 const kept=[...records,newRecord],sizes=kept.map(record=>bytes(record)),counts=kept.map(eventCount);
 let totalBytes=sizes.reduce((sum,value)=>sum+value,0)+Math.max(0,kept.length-1)+2,totalEvents=counts.reduce((sum,value)=>sum+value,0),droppedCount=0;
 while(kept.length>TIMING_EVIDENCE_LIMITS.records||totalBytes>TIMING_EVIDENCE_LIMITS.totalBytes||totalEvents>TIMING_EVIDENCE_LIMITS.totalEvents){kept.shift();totalBytes-=sizes.shift()+1;totalEvents-=counts.shift();droppedCount++;}
 return {records:kept,droppedCount};
}

/** Values remain raw SI seconds/hertz or percentage points; invalid measurements stay blank. */
export function timingCSV(record){
 const q=value=>'"'+String(value??'').replaceAll('"','""')+'"',spec=record.spec,result=record.result;
 const headings=['Measurement ID','Source run ID','Project ID','Revision','Recorded at','Method','Kind','Source signal','Source bit (0 = LSB)','Source edge','Target signal','Target bit (0 = LSB)','Target edge','Window start (s)','Window end (s)','Row','Status','Start (s)','End (s)','Value','Unit','Source event from','Source event to','Source event index','Target event from','Target event to','Target event index','High time (s)','Cycle time (s)','Reason','Details JSON','Netlist SHA-256 (as recorded)','Simulation plan SHA-256 (as recorded)','Event resolution (s)','Candidate count','Rows truncated'];
 const rows=result.rows.map(row=>[record.id,record.sourceRunId,record.projectId,record.revision,record.createdAt,result.method,spec.kind,spec.source.name,spec.source.bit,spec.edge,spec.target?.name,spec.target?.bit,spec.targetEdge,spec.window.start,spec.window.end,row.index,row.status,row.start,row.end,row.value,result.unit,row.sourceEvent?.from,row.sourceEvent?.to,row.sourceEvent?.index,row.targetEvent?.from,row.targetEvent?.to,row.targetEvent?.index,row.details?.highTime,row.details?.cycleTime,row.reason,JSON.stringify(row.details),record.sourceRun.netlistHash,record.sourceRun.simulationHash,result.timeResolution,result.candidateCount,result.truncated]);
 return [headings,...rows].map(row=>row.map(q).join(',')).join('\r\n');
}
export function timingEvidenceJSON(record){return JSON.stringify({format:'CircuitBench timing evidence',formatVersion:1,measurement:record},null,2);}
