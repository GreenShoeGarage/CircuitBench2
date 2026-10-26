/** Actual app operation/preference callbacks with the production queue. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {newProject,addComponent,setComponentParams,validateWorkbench} from '../src/model.js';
import {LiveInputController,describeSourceControl} from '../src/live-controls.js';
const source=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
function actualFunction(name){const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.ok(start>=0);const next=source.slice(start+1).search(/\n(?:async )?function [A-Za-z_$]/);assert.ok(next>=0);return source.slice(start,start+1+next);}
const functions=['getLiveInputController','saveSourcePreferences','toggleSourcePin','setSourceMomentary','sourceOperation','operateSource','setDigitalSourceState'];
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness({live=false,change=async()=>{}}={}){
  const project=newProject(),component=addComponent(project,'DVS',100,100),state={updates:[],saves:0,commits:0,errors:[]};
  const session=live?{running:true,state:'paused',generation:1,time:.001,plan:{controls:[{id:component.id,type:'DVS'}]},inputChanges:[],async setInputs(updates){state.updates.push(structuredClone(updates));await change();this.inputChanges.push({time:this.time,updates});}}:null;
  const context=vm.createContext({project,LiveInputController,describeSourceControl,setComponentParams,validateWorkbench,liveInputController:null,continuousSession:session,continuousRun:session?{projectSnapshot:structuredClone(project)}:null,engine:{running:false},preparing:false,clone:structuredClone,Date,Set,formatNumber:value=>String(value),editor:{render(){}},renderSelection(){},renderContinuousState(){},renderLiveControls(){},renderDisplayReadouts(){},scheduleSave(){state.saves++;},status(){},handleError:error=>state.errors.push(error),commit(mutator){state.commits++;mutator(context.project);context.project.revision++;}});
  vm.runInContext(functions.map(actualFunction).join('\n'),context);
  return{project,component,session,state,context};
}
test('dedicated source toggle uses initial edits while idle and owned live commands during a session',async()=>{
  const idle=harness();assert.match(idle.context.sourceOperation(idle.component).label,/initial drive/);await idle.context.operateSource({id:idle.component.id,action:'toggle'});assert.equal(idle.component.params.state,'1');assert.equal(idle.state.commits,1);
  const live=harness({live:true});assert.match(live.context.sourceOperation(live.component).label,/live drive/);await live.context.operateSource({id:live.component.id,action:'toggle'});assert.equal(live.component.params.state,'0');assert.deepEqual(live.state.updates[0],[{id:live.component.id,value:'1'}]);assert.equal(live.state.commits,0);
});
test('the dedicated momentary target is disabled before a retained session exists',async()=>{
  const h=harness();await h.context.setSourceMomentary(h.component.id,true);const operation=h.context.sourceOperation(h.component);assert.equal(operation.momentary,true);assert.equal(operation.enabled,false);assert.equal(h.component.params.state,'0');assert.equal(h.state.commits,0);
});
test('pinning and momentary preferences autosave without stopping or revising an active circuit',async()=>{
  const h=harness({live:true}),snapshot=JSON.stringify(h.session),revision=h.project.revision;
  h.context.toggleSourcePin(h.component.id);await h.context.setSourceMomentary(h.component.id,true);
  assert.deepEqual([...h.project.workbench.pinnedSources],[h.component.id]);assert.deepEqual([...h.project.workbench.momentarySources],[h.component.id]);assert.equal(h.project.revision,revision);assert.equal(h.state.commits,0);assert.equal(h.state.saves,2);assert.equal(JSON.stringify(h.session),snapshot);
});
test('changing momentary preference safely releases an owned live hold first',async()=>{
  const h=harness({live:true}),owner='editor-owned-press';await h.context.setSourceMomentary(h.component.id,true);await h.context.operateSource({id:h.component.id,action:'press',owner});await h.context.setSourceMomentary(h.component.id,false);
  assert.deepEqual(h.state.updates.map(updates=>updates[0].value),['1','0']);assert.equal(h.project.workbench.momentarySources.length,0);assert.equal(h.component.params.state,'0');
});
test('an old preference change waiting on release cannot attach itself to a replacement project',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;}),h=harness({live:true,change:()=>gate}),owner={};
  const press=h.context.operateSource({id:h.component.id,action:'press',owner});await flush();const preference=h.context.setSourceMomentary(h.component.id,true),replacement=newProject();h.context.project=replacement;h.context.continuousSession=null;
  release();await Promise.all([press,preference]);assert.deepEqual(replacement.workbench,{pinnedSources:[],momentarySources:[]});assert.equal(h.state.saves,0);
});
test('queued direct toggles use the desired value so two rapid activations return to LOW',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;}),h=harness({live:true,change:()=>gate});
  const first=h.context.operateSource({id:h.component.id,action:'toggle'}),second=h.context.operateSource({id:h.component.id,action:'toggle'});release();await Promise.all([first,second]);
  assert.deepEqual(h.state.updates.map(updates=>updates[0].value),['1','0']);assert.equal(h.project.revision,0);
});
test('a stale dedicated release cannot enter the next session',async()=>{
  const h=harness({live:true}),owner='old-editor-press';await h.context.operateSource({id:h.component.id,action:'press',owner});
  h.context.liveInputController.invalidate(h.session);h.session.running=false;h.context.continuousSession={...h.session,running:true,generation:2,inputChanges:[],setInputs:async()=>{throw new Error('Stale release entered new session');}};
  await h.context.operateSource({id:h.component.id,action:'release',owner});assert.equal(h.state.updates.length,1);assert.equal(h.state.errors.length,0);
});
