import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {newProject,validateProject} from '../src/model.js';
import {measureTimingSource} from '../src/timing.js';
import {createTimingRecord,validateTimingRecords,retainTimingRecords,timingCSV,timingEvidenceJSON,TIMING_EVIDENCE_LIMITS} from '../src/timing-evidence.js';
import {safeEnvelope} from '../src/storage.js';
import {createReport,timingReportHTML} from '../src/reports.js';

const at='2026-10-24T09:00:02.000Z';
test('actual 1.3 browser backup restores timing records with default solver settings across repeated saves',async()=>{
 const legacy=JSON.parse(await fs.readFile(new URL('../evidence/history/1.3.0-rc.1/rc130-timing-project.circuitbench.json',import.meta.url),'utf8'));
 assert.ok(legacy.timingMeasurements.length);assert.equal(legacy.timingMeasurements[0].sourceRun.analysis.solver,undefined);
 const restored=safeEnvelope(legacy,validateProject),again=safeEnvelope(JSON.parse(JSON.stringify(restored)),validateProject);
 assert.equal(restored.timingMeasurements.length,legacy.timingMeasurements.length);
 assert.equal(restored.timingMeasurements[0].sourceRun.analysis.solver,'ngspice');
 assert.deepEqual(again,restored);
 const mismatched=structuredClone(legacy);mismatched.timingMeasurements[0].sourceRun.analysis.duration='99';
 assert.throws(()=>safeEnvelope(mismatched,validateProject),/analysis.*match/);
});
function fixture({events,kind='logic',width=1,label='CLOCK'}={}){
 const project=newProject('Timing evidence fixture');project.analysis.type='tran';project.analysis.duration='10u';project.analysis.step='1n';
 const states=events??[{time:0,value:'0'},{time:1e-6,value:'1'},{time:3e-6,value:'0'},{time:5e-6,value:'1'},{time:7e-6,value:'0'},{time:9e-6,value:'1'}];
 const end=10e-6,name=kind==='bus'?'b(word)':'d(clock)',times=[...new Set([0,...states.map(event=>event.time),end])].sort((a,b)=>a-b);let index=0;
 const vector={name,kind,unit:'logic',...(kind==='bus'?{width,bitOrder:'msb-first'}:{}),values:times.map(time=>{while(index+1<states.length&&states[index+1].time<=time)index++;return states[index].value;})};
 const run={id:'run_timing_fixture',status:'completed',projectId:project.id,revision:project.revision,projectSnapshot:structuredClone(project),analysis:structuredClone(project.analysis),startedAt:'2026-10-24T09:00:00.000Z',completedAt:'2026-10-24T09:00:01.000Z',netlist:'CircuitBench timing fixture',netlistHash:'a'.repeat(64),simulationHash:'b'.repeat(64),engine:{name:'CircuitBench event logic',version:'2',build:'cb-digital-kernel-2',timeResolution:1e-12},measurements:[{id:'timing_clock',label,vector:name,kind,unit:'logic',...(kind==='bus'?{width,bitOrder:'msb-first'}:{})}],models:[],logs:[],diagnostics:[],result:{points:times.length,vectors:[{name:'time',unit:'s',values:times},vector],digitalEvents:[{name,...(kind==='bus'?{kind,width,bitOrder:'msb-first'}:{}),events:states}],sampling:{mode:'digital-events',description:'Saved settled events',timeResolution:1e-12,analogSampleIndices:[]},warnings:[]}};
 const spec={kind:'period',source:{name,...(kind==='bus'?{bit:0}:{})},edge:'rising',window:{start:0,end}};
 return {project,run,spec,record:createTimingRecord(run,spec,{id:'timing_fixture',createdAt:at})};
}

test('a timing record retains sparse source evidence and its immutable run revision without copying sampled vectors',()=>{
 const {project,run,record}=fixture();
 assert.equal(record.sourceRunId,run.id);assert.equal(record.projectId,project.id);assert.equal(record.revision,0);
 assert.deepEqual(record.source.signals[0].events,run.result.digitalEvents[0].events);
 assert.equal(record.source.signals[0].events.length,6);assert.equal(record.result.summary.measuredCount,2);
 assert.equal(record.result.rows[0].value,4e-6);assert.equal(record.result.rows.at(-1).status,'missing-edge');
 assert.equal(record.sourceRun.netlistHash,'a'.repeat(64));assert.equal(record.sourceRun.simulationHash,'b'.repeat(64));
 assert.equal('vectors' in record.source,false);assert.equal('analogSampleIndices' in record.sourceRun.sampling,false);
 run.result.digitalEvents[0].events[1].value='X';run.projectSnapshot.title='Changed later';
 assert.equal(record.source.signals[0].events[1].value,'1');assert.equal(record.projectSnapshot.title,'Timing evidence fixture');
});
test('project backups round-trip timing even after their full source run leaves the history',()=>{
 const {project,record}=fixture();project.revision=7;
 const envelope=safeEnvelope(JSON.parse(JSON.stringify({project,runs:[],timingMeasurements:[record]})),validateProject);
 assert.deepEqual(envelope.timingMeasurements,[record]);assert.equal(envelope.project.revision,7);assert.equal(envelope.timingMeasurements[0].revision,0);
 assert.deepEqual(safeEnvelope({project,runs:[]},validateProject).timingMeasurements,[],'older backups have no fabricated timing records');
});
test('restoring, flagging and re-exporting a run preserves historical measurement provenance',()=>{
 const {project,run,record}=fixture();
 const first=safeEnvelope({project,runs:[run],timingMeasurements:[record]},validateProject);
 first.runs[0].importedFromBackup=true;first.timingMeasurements[0].importedFromBackup=true;
 const second=safeEnvelope(JSON.parse(JSON.stringify(first)),validateProject);
 assert.equal(second.runs[0].importedFromBackup,true);assert.equal(second.timingMeasurements[0].importedFromBackup,true);
 assert.equal(second.timingMeasurements[0].sourceRun.importedFromBackup,false,'historical flag is not rewritten by later imports');
 const fresh=createTimingRecord(second.runs[0],record.spec,{id:'timing_restored_run',createdAt:at});
 assert.equal(fresh.sourceRun.importedFromBackup,true,'a new measurement records that its source run was restored');
});
test('saved values, summaries, selected edges and statuses must recompute from preserved events',()=>{
 for(const mutate of [record=>record.result.rows[0].value=0,record=>record.result.summary.mean=1,record=>record.result.rows[0].status='missing-edge',record=>record.result.rows[0].sourceEvent.time=2e-6,record=>record.spec.edge='falling',record=>record.result.pairing='made up']){
  const {record}=fixture();mutate(record);assert.throws(()=>validateTimingRecords([record],validateProject),/disagree|normalized/);
 }
});
test('reordered JSON object properties remain portable while changed event inputs require corresponding measured output',()=>{
 const {record}=fixture();
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,value])=>[key,reorder(value)])):value;
 assert.deepEqual(validateTimingRecords([reorder(record)],validateProject),[record]);
 record.source.signals[0].events[1].time=2e-6;
 assert.throws(()=>validateTimingRecords([record],validateProject),/disagree/);
 record.result=measureTimingSource(record.source,record.spec);
 assert.deepEqual(validateTimingRecords([record],validateProject)[0].result,record.result,'validation checks retained-event arithmetic, without claiming a circuit resimulation');
});
test('a retained original run must agree with the timing snapshot, event series and input hashes',()=>{
 for(const mutate of [record=>record.sourceRun.netlistHash='c'.repeat(64),record=>record.projectSnapshot.title='Different snapshot',record=>{record.source.signals[0].events[1].time=2e-6;record.result=measureTimingSource(record.source,record.spec);}]){
  const {project,run,record}=fixture();mutate(record);assert.throws(()=>safeEnvelope({project,runs:[run],timingMeasurements:[record]},validateProject),/disagree/);
 }
});
test('retained evidence accepts historical labels from the same run without rewriting them',()=>{
 const {project,run,record}=fixture({label:'D(clock)'});
 run.measurements.push({...run.measurements[0],id:'preferred_clock',label:'Clock probe'});
 const restored=safeEnvelope({project,runs:[run],timingMeasurements:[record]},validateProject);
 assert.equal(restored.timingMeasurements[0].source.signals[0].label,'D(clock)','old default label survives current preferred-label selection');
 for(const label of ['Clock probe','d(clock)']){
  const alternate=structuredClone(record);alternate.source.signals[0].label=label;alternate.result=measureTimingSource(alternate.source,alternate.spec);
  const saved=safeEnvelope({project,runs:[run],timingMeasurements:[alternate]},validateProject);
  assert.equal(saved.timingMeasurements[0].source.signals[0].label,label);
  saved.runs[0].importedFromBackup=true;saved.timingMeasurements[0].importedFromBackup=true;
  assert.equal(safeEnvelope(JSON.parse(JSON.stringify(saved)),validateProject).timingMeasurements[0].source.signals[0].label,label);
 }
 const unrelated=structuredClone(record);unrelated.source.signals[0].label='Unrelated signal';unrelated.result=measureTimingSource(unrelated.source,unrelated.spec);
 assert.throws(()=>safeEnvelope({project,runs:[run],timingMeasurements:[unrelated]},validateProject),/label.*source run/);
});
test('declared digital and sampling resolution must agree even after the source run is pruned',()=>{
 for(const mutate of [record=>record.sourceRun.sampling.timeResolution=1e-9,record=>record.sourceRun.engine.timeResolution=1e-9,record=>record.sourceRun.engine.digital={name:'Digital engine',timeResolution:1e-9}]){
  const {record}=fixture();mutate(record);assert.throws(()=>validateTimingRecords([record],validateProject),/event resolution/);
 }
 const {record}=fixture();delete record.sourceRun.sampling.timeResolution;delete record.sourceRun.engine.timeResolution;
 record.sourceRun.engine.digital={name:'Digital engine',timeResolution:1e-12};record.sourceRun.engine.analog={name:'Analog solver',timeResolution:1e-9};
 assert.equal(validateTimingRecords([record],validateProject)[0].source.timeResolution,1e-12,'analog metadata does not replace the digital event grid');
 delete record.sourceRun.engine.digital.timeResolution;
 assert.equal(validateTimingRecords([record],validateProject)[0].source.timeResolution,1e-12,'missing optional provenance is not invented');
});
test('bus timing preserves exact original words and identifies its selected least-significant bit',()=>{
 const events=[{time:0,value:'0000'},{time:1e-6,value:'0001'},{time:2e-6,value:'X001'},{time:3e-6,value:'X000'},{time:5e-6,value:'X001'}];
 const {record}=fixture({events,kind:'bus',width:4,label:'WORD'});
 assert.equal(record.spec.source.bit,0);assert.equal(record.source.signals[0].width,4);assert.equal(record.source.signals[0].bitOrder,'msb-first');
 assert.deepEqual(record.source.signals[0].events.map(event=>event.value),['0000','0001','X001','X000','X001']);
 assert.equal(record.result.rows[0].status,'measured');assert.equal(record.result.rows[0].value,4e-6,'unrelated unknown bus bits do not alter selected-bit timing');
 const invalid=structuredClone(record);delete invalid.spec.source.bit;assert.throws(()=>validateTimingRecords([invalid],validateProject),/explicit bit/);
});
test('a two-bit delay records one whole bus series and two explicit edge selections',()=>{
 const events=[{time:0,value:'00'},{time:1e-6,value:'01'},{time:1.002e-6,value:'11'},{time:3e-6,value:'00'}];
 const {run}=fixture({events,kind:'bus',width:2,label:'BUS'});
 const record=createTimingRecord(run,{kind:'delay',source:{name:'b(word)',bit:0},target:{name:'b(word)',bit:1},edge:'rising',targetEdge:'rising'},{id:'timing_bus_delay',createdAt:at});
 assert.equal(record.source.signals.length,1);assert.equal(record.result.rows[0].value,2e-9);
 assert.deepEqual(record.spec.target,{name:'b(word)',bit:1});
 assert.deepEqual(validateTimingRecords([record],validateProject)[0].result,record.result);
 assert.match(timingCSV(record),/"b\(word\)","0","rising","b\(word\)","1","rising"/);
});
test('invalid or oversized sparse evidence is rejected before becoming saved measurements',()=>{
 for(const mutate of [record=>record.source.signals[0].events[0].time=1e-12,record=>record.source.signals[0].events[1].time=0,record=>record.source.signals[0].events[1].value=1,record=>record.source.signals[0].events[1].value='x',record=>record.source.signals[0].width=2,record=>record.source.timeBounds[1]=0,record=>record.source.timeResolution=1e-9,record=>record.source.eventSource='interpolated-pixels']){
  const {record}=fixture();mutate(record);assert.throws(()=>validateTimingRecords([record],validateProject));
 }
 const {record}=fixture();record.source.signals[0].events=Array(TIMING_EVIDENCE_LIMITS.eventsPerRecord+1).fill({time:0,value:'0'});
 assert.throws(()=>validateTimingRecords([record],validateProject),/too many|limit/);
});
test('unselected event traces cannot be smuggled into a timing record',()=>{
 const {record}=fixture();record.source.signals.push({...structuredClone(record.source.signals[0]),name:'d(unselected)'});
 assert.throws(()=>validateTimingRecords([record],validateProject),/unselected/);
});
test('timing provenance validates chronology, identity, metadata and record count',()=>{
 for(const mutate of [record=>record.id='__proto__',record=>record.revision++,record=>record.sourceRunId='different_run',record=>record.createdAt='yesterday',record=>record.createdAt='2026-10-24T09:00:00.500Z',record=>record.sourceRun.completedAt='2026-10-24T08:00:00.000Z',record=>record.sourceRun.analysis.type='ac',record=>record.sourceRun.status='failed',record=>record.sourceRun.sampling.analogSampleIndices=[0,1],record=>record.sourceRun.importedFromBackup='true']){
  const {record}=fixture();mutate(record);assert.throws(()=>validateTimingRecords([record],validateProject));
 }
 const {record}=fixture();assert.throws(()=>validateTimingRecords([record,record],validateProject),/duplicate/);
 assert.throws(()=>validateTimingRecords(Array.from({length:13},(_,index)=>({...record,id:`timing_${index}`})),validateProject),/at most 12/);
});
test('retention keeps newest records and explicitly reports the number removed',()=>{
 const {record}=fixture(),old=Array.from({length:12},(_,index)=>({...structuredClone(record),id:`timing_${index}`}));
 const result=retainTimingRecords(old,{...record,id:'timing_new'});
 assert.equal(result.droppedCount,1);assert.equal(result.records.length,12);assert.equal(result.records[0].id,'timing_1');assert.equal(result.records.at(-1).id,'timing_new');
 assert.equal(old.length,12);assert.equal(old[0].id,'timing_0','input history is not mutated');
 assert.throws(()=>retainTimingRecords(old,{...record,id:'timing_0'}),/unique/);
});
test('byte-bound retention never silently drops the newest complete measurement',()=>{
 const {run,spec}=fixture(),events=Array.from({length:250000},(_,index)=>({time:index*1e-12,value:String(index%2)}));
 run.result.digitalEvents[0].events=events;run.result.vectors[0].values=[0,10e-6];run.result.vectors[1].values=['0','1'];
 const first=createTimingRecord(run,spec,{id:'timing_large_a',createdAt:at}),second={...first,id:'timing_large_b'},third={...first,id:'timing_large_c'};
 const size=new TextEncoder().encode(JSON.stringify(first)).length;assert.ok(size>TIMING_EVIDENCE_LIMITS.totalBytes/3&&size<TIMING_EVIDENCE_LIMITS.totalBytes/2);
 const kept=retainTimingRecords([first,second],third);
 assert.equal(kept.droppedCount,1);assert.deepEqual(kept.records.map(record=>record.id),['timing_large_b','timing_large_c']);
});
test('CSV keeps raw values, event polarity and missing or indeterminate numbers blank',()=>{
 const events=[{time:0,value:'0'},{time:1e-6,value:'1'},{time:2e-6,value:'X'},{time:3e-6,value:'0'},{time:5e-6,value:'1'}];
 const {record}=fixture({events});record.sourceRun.netlistHash='a,"b';
 const csv=timingCSV(record),lines=csv.split('\r\n');
 assert.equal(lines.length,3);assert.match(lines[0],/"Source bit \(0 = LSB\)"/);assert.match(lines[0],/"Event resolution \(s\)"/);
 assert.match(lines[1],/"indeterminate","0.000001","0.0000049999999999999996|"indeterminate","0.000001","0.000005/);
 assert.match(lines[1],/"","s"/);assert.match(lines[2],/"missing-edge"/);assert.match(lines[1],/"a,""b"/);
 assert.doesNotMatch(csv,/NaN|undefined|Infinity/);
});
test('standalone timing evidence JSON retains the complete selected events and circuit snapshot',()=>{
 const {record}=fixture(),json=JSON.parse(timingEvidenceJSON(record));
 assert.equal(json.format,'CircuitBench timing evidence');assert.equal(json.formatVersion,1);assert.deepEqual(json.measurement,record);
});
test('analysis reports include exact run context, complete diagnostic rows and restored-evidence limits',()=>{
 const {project,run,record}=fixture();project.revision=4;record.importedFromBackup=true;run.id='run_other';
 const html=createReport({project,run,schematic:'',plot:'',timingMeasurements:[record]});
 assert.match(html,/02a \/ Digital timing measurements/);assert.match(html,/source run run_timing_fixture/);
 assert.match(html,/different source run from the selected report waveform/);assert.match(html,/working circuit differs/);
 assert.match(html,/source circuit is not independently resimulated/);assert.match(html,/missing-edge/);assert.match(html,/2 measured/);
 assert.match(html,/cb-event-timing-1/);assert.match(html,/Simulation plan SHA-256 \(as recorded\)/);
 assert.doesNotMatch(html,/NaN|undefined|Infinity/);
});
test('timing reports escape captured labels, titles, engine strings and diagnostics',()=>{
 const {record}=fixture();record.projectSnapshot.title='<script>bad()</script>';record.source.signals[0].label='<img src=x onerror=bad()> ';record.sourceRun.engine.name='" onerror=bad()';record.result.rows[0].reason='<svg onload=bad()>';record.sourceRun.bridgeAssumptions=['<script>again()</script>'];
 const html=timingReportHTML([record]);assert.doesNotMatch(html,/<script|<img|<svg/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;svg onload=bad\(\)&gt;/);
});
