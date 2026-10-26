import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveInputController,LIVE_CONTROL_LIMITS,sourceControl,sourceControls,describeSourceControl,sourcePreferencesHTML,bindPinnedControls} from '../src/live-controls.js';
import {newProject,addComponent,setComponentParams,validateProject} from '../src/model.js';
import {digitalVoltageSource} from '../src/examples-logic-io.js';
import {generateNetlist} from '../src/netlist.js';
import {compileCoordinated,createCoordinatedSession} from '../src/coordinated.js';
import {ContinuousSimulation} from '../src/continuous.js';
import {displayStatesForRun} from '../src/displays.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({live=true,apply=async()=>{}}={}) {
  const project=newProject('Source operations'),source=addComponent(project,'DVS',100,100),calls=[],applied=[];
  const session={running:true,state:'paused',generation:1,time:.001,inputChanges:[],plan:{controls:[{id:source.id,type:'DVS'}]},async setInputs(updates){calls.push(structuredClone(updates));await apply(updates);this.inputChanges.push({time:this.time,updates:structuredClone(updates)});}};
  const context={project,session:live?session:null,sessionRun:live?{projectSnapshot:structuredClone(project)}:null,busy:false};
  const controller=new LiveInputController({getContext:()=>context,setInitial:updates=>{for(const update of updates){const c=project.circuit.components.find(c=>c.id===update.id);setComponentParams(project,c.id,{[['DVS','DIN'].includes(c.type)?'state':c.type==='BUSIN'?'value':'dc']:String(update.value)});}project.revision++;},onApplied:info=>applied.push(info)});
  return {project,source,calls,applied,session,context,controller};
}

test('supported pinned inputs include scalar logic, buses and DC supplies; waveform sources stay out',()=>{
  const p=newProject();for(const type of ['DVS','DIN','BUSIN','V','I','CLOCK'])addComponent(p,type);
  const pulse=addComponent(p,'V');setComponentParams(p,pulse.id,{waveform:'pulse'});
  assert.deepEqual(sourceControls(p).map(control=>control.type),['DVS','DIN','BUSIN','V','I']);
  assert.equal(sourceControl(p.circuit.components.find(c=>c.type==='BUSIN')).width,4);
  assert.equal(sourceControl(pulse),null);
});

test('idle controls edit the initial setting through the supplied project transaction',async()=>{
  const h=fixture({live:false});await h.controller.request([{id:h.source.id,value:'1'}]);
  assert.equal(h.source.params.state,'1');assert.equal(h.project.revision,1);assert.equal(h.calls.length,0);
});

test('queued HIGH then release LOW survives a slow press acknowledgement without touching initial conditions',async()=>{
  const gate=deferred(),h=fixture({apply:()=>gate.promise}),before=structuredClone(h.project),owner={};
  const press=h.controller.press(h.source.id,owner);await flush();const release=h.controller.release(owner);
  assert.equal(h.controller.pendingValue(h.source.id),'0');assert.equal(h.calls.length,1);assert.equal(h.controller.held(h.source.id),false);
  gate.resolve();await Promise.all([press,release]);
  assert.deepEqual(h.calls.map(updates=>updates[0].value),['1','0']);assert.equal(h.controller.hasPending(),false);assert.deepEqual(h.project,before);
});

test('different control surfaces share one serialization queue and retain command order',async()=>{
  const gate=deferred(),h=fixture({apply:()=>gate.promise});
  const first=h.controller.request([{id:h.source.id,value:'1'}]),second=h.controller.request([{id:h.source.id,value:'0'}]),third=h.controller.request([{id:h.source.id,value:'1'}]);
  await flush();assert.equal(h.calls.length,1);gate.resolve();await Promise.all([first,second,third]);
  assert.deepEqual(h.calls.map(updates=>updates[0].value),['1','0','1']);assert.equal(h.applied.length,3);
});

test('queue pressure bounds ordinary commands but always admits the owned momentary release',async()=>{
  const gate=deferred(),h=fixture({apply:()=>gate.promise}),owner={},tasks=[h.controller.press(h.source.id,owner)];
  for(let i=1;i<LIVE_CONTROL_LIMITS.queuedCommands;i++)tasks.push(h.controller.request([{id:h.source.id,value:'1'}]));
  await assert.rejects(h.controller.request([{id:h.source.id,value:'1'}]),/queued source commands/);
  tasks.push(h.controller.release(owner));gate.resolve();await Promise.all(tasks);assert.equal(h.calls.at(-1)[0].value,'0');assert.equal(h.controller.hasPending(),false);
});

test('keyboard repetition or a second surface cannot create overlapping holds on one source',async()=>{
  const h=fixture(),owner={};await h.controller.press(h.source.id,owner);await h.controller.press(h.source.id,owner);await h.controller.press(h.source.id,{});
  assert.equal(h.calls.length,1);await h.controller.release(owner);assert.deepEqual(h.calls.map(updates=>updates[0].value),['1','0']);
});

test('Stop invalidates a queued press and release before either can run',async()=>{
  const h=fixture(),owner={};const press=h.controller.press(h.source.id,owner),release=h.controller.release(owner);
  h.controller.invalidate(h.session);h.session.running=false;h.session.generation++;
  const results=await Promise.all([press,release]);assert.equal(h.calls.length,0);assert.ok(results.every(result=>result.cancelled));assert.equal(h.applied.length,0);
});

test('a late release and old acknowledgement cannot control a replacement session',async()=>{
  const gate=deferred(),h=fixture({apply:()=>gate.promise}),owner={};const press=h.controller.press(h.source.id,owner);await flush();
  const fresh={...h.session,generation:9,inputChanges:[],setInputs:async()=>{throw new Error('Old release reached the new session');}};
  h.context.session=fresh;h.context.sessionRun={projectSnapshot:structuredClone(h.project)};
  await h.controller.release(owner);gate.resolve();assert.equal((await press).cancelled,true);assert.equal(h.applied.length,0);assert.equal(h.calls.length,1);
});

test('reusing a session object with a new generation still rejects an old hold',async()=>{
  const h=fixture(),owner={};await h.controller.press(h.source.id,owner);h.session.generation++;
  await h.controller.release(owner);assert.equal(h.calls.length,1);assert.equal(h.controller.held(h.source.id),false);
});

test('a changed project revision or foreign snapshot cannot receive live commands',async()=>{
  const h=fixture();h.project.revision++;await assert.rejects(h.controller.request([{id:h.source.id,value:'1'}]),/does not belong/);assert.equal(h.calls.length,0);
});

test('momentary use requires a live session and invalid drive inputs never reach the worker',async()=>{
  const idle=fixture({live:false});await assert.rejects(idle.controller.press(idle.source.id,{}),/Start continuous/);assert.equal(idle.source.params.state,'0');
  const live=fixture();for(const value of ['X','Z','2','01'])await assert.rejects(live.controller.request([{id:live.source.id,value}]),/LOW/);
  assert.equal(live.calls.length,0);
});

test('failed press acknowledgement clears its held state without inventing saved success',async()=>{
  const h=fixture({apply:async()=>{throw new Error('Known worker rejection');}}),owner={};
  await assert.rejects(h.controller.press(h.source.id,owner),/Known worker rejection/);await flush();
  assert.equal(h.controller.held(h.source.id),false);assert.equal(h.controller.hasPending(),false);assert.equal(h.applied.length,0);
});

test('feedback distinguishes initial, confirmed live, queued and recorded drive at Cursor A',async()=>{
  const gate=deferred(),h=fixture({apply:()=>gate.promise});
  const run={projectId:h.project.id,revision:0,projectSnapshot:structuredClone(h.project),result:{vectors:[{name:'time',values:[0,.001]}],continuous:{inputChanges:[{time:.0005,updates:[{id:h.source.id,value:'1'}]}]}}};
  const pending=h.controller.request([{id:h.source.id,value:'1'}]);await flush();
  let state=describeSourceControl(h.project,h.source,{...h.context,run,cursor:.0001,controller:h.controller});
  assert.match(state.initialLabel,/LOW/);assert.match(state.liveLabel,/LOW/);assert.match(state.pendingLabel,/Queued HIGH/);assert.match(state.recordedLabel,/Recorded LOW.*Cursor A/);
  gate.resolve();await pending;state=describeSourceControl(h.project,h.source,{...h.context,run,cursor:.0009,controller:h.controller});
  assert.match(state.liveLabel,/HIGH/);assert.match(state.pendingLabel,/Awaiting Step or Resume/);assert.match(state.recordedLabel,/Recorded HIGH/);
  h.session.time=.002;assert.doesNotMatch(describeSourceControl(h.project,h.source,{...h.context,controller:h.controller}).pendingLabel,/Awaiting/);
});

test('pin and momentary configuration survives project validation',()=>{
  const h=fixture();h.project.workbench={pinnedSources:[h.source.id],momentarySources:[h.source.id]};
  const p=validateProject(h.project),state=describeSourceControl(p,p.circuit.components[0]);assert.equal(state.pinned,true);assert.equal(state.momentaryMode,true);assert.match(sourcePreferencesHTML(state),/checked/);
});

class Surface {
  constructor(){this.listeners=new Map();this.hidden=false;}
  addEventListener(type,handler){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(handler);}
  removeEventListener(type,handler){this.listeners.get(type)?.delete(handler);}
  emit(type,properties={}){const event={type,button:0,preventDefault(){this.defaultPrevented=true;},...properties};for(const listener of [...this.listeners.get(type)??[]])listener(event);return event;}
}
function interactionFixture(){
  const h=fixture(),win=new Surface(),doc=new Surface(),root=new Surface(),errors=[];
  const button={disabled:false,dataset:{sourceHold:h.source.id},closest:selector=>selector==='[data-source-hold]'||selector==='button'?button:null,focus(){},setPointerCapture(){}};
  root.contains=node=>node===button;root.ownerDocument=doc;doc.defaultView=win;
  const cleanup=bindPinnedControls(root,{setValue:(id,value)=>h.controller.request([{id,value}]),press:(id,owner)=>h.controller.press(id,owner),release:owner=>h.controller.release(owner),pin(){},onError:error=>errors.push(error)},{window:win,document:doc});
  return {...h,root,win,doc,button,errors,cleanup};
}
for(const cancellation of ['pointerup','pointercancel','lostpointercapture','blur','hidden','focusout','cleanup'])test(`the actual pinned pointer handler releases LOW after ${cancellation}`,async()=>{
  const h=interactionFixture();h.root.emit('pointerdown',{target:h.button,pointerId:7});await flush();
  if(cancellation==='hidden'){h.doc.hidden=true;h.doc.emit('visibilitychange');}
  else if(cancellation==='focusout')h.root.emit('focusout',{target:h.button});
  else if(cancellation==='cleanup')h.cleanup();
  else h.win.emit(cancellation,{pointerId:7});
  await flush();assert.deepEqual(h.calls.map(updates=>updates[0].value),['1','0']);assert.equal(h.errors.length,0);h.cleanup();
});

test('the actual pinned keyboard handler ignores repeat, releases outside the panel and suppresses click toggles',async()=>{
  const h=interactionFixture();h.root.emit('keydown',{target:h.button,key:' ',repeat:false});h.root.emit('keydown',{target:h.button,key:' ',repeat:true});await flush();
  h.win.emit('keyup',{key:' '});h.root.emit('click',{target:h.button});await flush();
  assert.deepEqual(h.calls.map(updates=>updates[0].value),['1','0']);assert.equal(h.controller.held(h.source.id),false);h.cleanup();
});

test('a real paused solver preserves initial settings and needs a computed step for momentary indicator response',async()=>{
  const project=validateProject(digitalVoltageSource()),source=project.circuit.components.find(c=>c.type==='DVS');setComponentParams(project,source.id,{state:'0'});project.analysis.solver='coordinated';
  const generated=generateNetlist(project),plan=compileCoordinated(project,generated),snapshot=structuredClone(project);
  class LocalEngine {async start(compiled){this.worker=createCoordinatedSession(compiled);}async advanceTo(time,options){return this.worker.advanceTo(time,options);}async setInputs(updates){return this.worker.setInputs(updates);}stop(){this.worker=null;}close(){this.worker=null;}}
  const session=new ContinuousSimulation({engine:new LocalEngine()}),run={id:'real-live-source',projectId:project.id,revision:project.revision,projectSnapshot:snapshot,analysis:project.analysis,status:'running',result:null};
  const context={project,session,sessionRun:run,busy:false};const controller=new LiveInputController({getContext:()=>context,setInitial(){throw new Error('Live command edited initial circuit');}});
  try {
    await session.start(plan,{chunkDuration:.0001,windowDuration:.001,autoRun:false});await session.step();run.result=session.result;
    const direct=project.circuit.components.find(c=>c.type==='DLED'),owner={};assert.equal(displayStatesForRun(project,run)[direct.id].state,'low');
    await controller.press(source.id,owner);assert.equal(displayStatesForRun(project,run)[direct.id].state,'low');
    await session.step();run.result=session.result;assert.equal(displayStatesForRun(project,run)[direct.id].state,'high');
    await controller.release(owner);await session.step();run.result=session.result;assert.equal(displayStatesForRun(project,run)[direct.id].state,'low');
    assert.deepEqual(project,snapshot);assert.deepEqual(session.inputChanges.map(change=>change.updates[0].value),['1','0']);
  } finally {session.stop();}
});
