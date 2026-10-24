/** Actual stateful numerical results through rolling retention, project backup,
 * independent timing evidence and corruption rejection. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES} from '../src/examples.js';
import {validateProject} from '../src/model.js';
import {generateNetlist} from '../src/netlist.js';
import {compileCoordinated,createCoordinatedSession} from '../src/coordinated.js';
import {appendContinuousResult} from '../src/continuous.js';
import {safeEnvelope} from '../src/storage.js';
import {createTimingRecord,validateTimingRecords,timingCSV,timingEvidenceJSON} from '../src/timing-evidence.js';
import {getTimingSignals,measureTiming} from '../src/timing.js';
const clone=structuredClone;
function fixture(){
 const project=validateProject(EXAMPLES.find(e=>e.id==='converter-staircase').create()),generated=generateNetlist(project),plan=compileCoordinated(project,generated),session=createCoordinatedSession(plan),enable=project.circuit.components.find(c=>c.type==='DIN'&&c.params.state==='1');
 assert.equal(generated.diagnostics.filter(d=>d.severity==='error').length,0);
 let result=null;const changes=[];
 for(const end of[.001,.0015,.0025,.0035,.0045,.0055]){
  let chunk;do{chunk=session.advanceTo(end,{maxSteps:2000});result=appendContinuousResult(result,chunk,{maxPoints:800,windowDuration:.003,inputChanges:changes});}while(!chunk.done);
  if(end===.001||end===.0015){const updates=[{id:enable.id,value:end===.001?'0':'1'}];session.setInputs(updates);changes.push({time:session.time,updates});}
 }
 result.continuous.sessionStatus='stopped';
 const run={id:'run_continuous_storage',projectId:project.id,revision:project.revision,projectSnapshot:clone(project),analysis:clone(project.analysis),status:'completed-with-warnings',startedAt:'2020-01-01T00:00:00.000Z',completedAt:'2020-01-01T00:00:01.000Z',netlist:generated.netlist,netlistHash:'a'.repeat(64),simulationHash:'b'.repeat(64),coordinatedPlan:plan,simulation:generated.simulation,models:generated.modelManifest,measurements:generated.measurements,diagnostics:generated.diagnostics,engine:result.engine,logs:result.logs,result};
 return{project,generated,plan,result,run,changes,envelope:{project,runs:[run],activeRunId:run.id,timingMeasurements:[],truthTables:[]}};
}
function recordFor(run){return createTimingRecord(run,{kind:'period',source:{name:'b(word)',bit:0}},{id:'timing_continuous_storage',createdAt:'2020-01-01T00:00:02.000Z'});}

test('actual rolling mixed result restores its absolute nonzero time window',()=>{const f=fixture(),out=safeEnvelope(JSON.parse(JSON.stringify(f.envelope)),validateProject),r=out.runs[0].result;assert.ok(r.continuous.windowStart>0);assert.equal(r.continuous.currentTime,.0055);assert.equal(r.vectors[0].values[0],r.continuous.windowStart);assert.deepEqual(r.continuous.inputChanges,f.changes);assert.ok(r.continuous.droppedPoints>0);for(const e of r.digitalEvents)assert.equal(e.events[0].time,r.continuous.windowStart);});
test('timing on a retained bus bit ignores the initial boundary as an edge',()=>{const {run}=fixture(),record=recordFor(run),rows=record.result.rows.filter(r=>r.status==='measured');assert.ok(record.source.timeBounds[0]>0);assert.ok(rows.length>=2);for(const row of rows){assert.ok(row.start>record.source.timeBounds[0]);assert.ok(Math.abs(row.value-.001)<1e-12);}assert.equal(getTimingSignals(run).filter(x=>x.name==='b(word)').length,8);});
test('continuous timing and its original run survive two backup round trips',()=>{const f=fixture(),record=recordFor(f.run);f.envelope.timingMeasurements=[record];const first=safeEnvelope(JSON.parse(JSON.stringify(f.envelope)),validateProject),second=safeEnvelope(JSON.parse(JSON.stringify(first)),validateProject);assert.deepEqual(second.timingMeasurements[0].source,record.source);assert.deepEqual(second.timingMeasurements[0].result,record.result);assert.deepEqual(second.runs[0].result.continuous.inputChanges,f.changes);});
test('independent timing retains the live input history after the full run is removed',()=>{const f=fixture(),record=recordFor(f.run),restored=validateTimingRecords([JSON.parse(timingEvidenceJSON(record)).measurement],validateProject);assert.deepEqual(restored[0].sourceRun.continuous.inputChanges,f.changes);assert.equal(restored[0].sourceRun.continuous.sessionStatus,'stopped');assert.deepEqual(restored[0].source.timeBounds,record.source.timeBounds);assert.match(timingCSV(restored[0]),/Window start \(s\)/);});
test('recorded continuous sampling bounds must agree with retained timing source bounds',()=>{const {run}=fixture(),record=recordFor(run);for(const[key,value]of[['windowStart',0],['windowEnd',999],['windowStart','bad']]){const changed=clone(record);changed.sourceRun.sampling[key]=value;assert.throws(()=>validateTimingRecords([changed],validateProject),/bound|window|sampling|continuous/i);}});
test('a nonzero timing source boundary requires explicit continuous provenance',()=>{const {run}=fixture(),record=recordFor(run);record.sourceRun.sampling.mode='digital-events';assert.throws(()=>validateTimingRecords([record],validateProject),/bound|window|continuous/i);});
test('window-boundary, retention-count, session-status and live-source corruption is rejected',()=>{const f=fixture();for(const mutate of[r=>r.result.continuous.windowStart=0,r=>r.result.continuous.droppedPoints++,r=>r.result.continuous.sessionStatus='running',r=>r.result.continuous.inputChanges[0].updates[0].value='2',r=>r.result.continuous.inputChanges[0].updates[0].id='missing',r=>r.result.digitalEvents[0].events[0].time=0]){const e=clone(f.envelope);mutate(e.runs[0]);assert.throws(()=>safeEnvelope(e,validateProject));}});
test('a saved continuous snapshot is inspectable evidence rather than resumable solver state',()=>{const f=fixture();f.run.result.continuous.sessionStatus='snapshot';const out=safeEnvelope(f.envelope,validateProject);assert.equal(out.runs[0].result.continuous.sessionStatus,'snapshot');assert.ok(!('session' in out.runs[0]));assert.ok(measureTiming(out.runs[0],{kind:'frequency',source:{name:'b(word)',bit:0}}).summary.measuredCount>0);});
test('continuous sampling cannot be detached from its retention provenance',()=>{const f=fixture();delete f.run.result.continuous;assert.throws(()=>safeEnvelope(f.envelope,validateProject),/continuous|retention|window/i);});
