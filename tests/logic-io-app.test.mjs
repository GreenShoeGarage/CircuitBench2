import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {digitalSourceControlHTML,digitalSourceOutputLabel} from '../src/logic-source-ui.js';
import {LiveInputController} from '../src/live-controls.js';
import {newProject,addComponent,setComponentParams} from '../src/model.js';

const source=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
function actualFunction(name){const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.ok(start>=0);const next=source.slice(start+1).search(/\n(?:async )?function [A-Za-z_$]/);assert.ok(next>=0);return source.slice(start,start+1+next);}
function fixture(){const project=newProject('Source control');const component=addComponent(project,'DVS',200,200);return {project,component};}
function harness({live=false,change=async()=>{},mismatch=false}={}){
 const {project,component}=fixture(),state={commits:0,updates:[],saves:0,messages:[],renders:0};
 const session=live?{running:true,state:'paused',time:.001,inputChanges:[],plan:{controls:[{id:component.id,type:'DVS'}]},async setInputs(updates){state.updates.push(structuredClone(updates));await change();this.inputChanges.push({time:this.time,updates});}}:null;
 const context=vm.createContext({project,liveInputController:null,LiveInputController,editor:{render(){}},continuousSession:session,continuousRun:session?{projectSnapshot:{id:mismatch?'different':project.id,revision:project.revision}}:null,engine:{running:false},preparing:false,setComponentParams,digitalSourceControlHTML,formatNumber:t=>String(t),renderSelection(){state.renders++;},renderContinuousState(){},renderDisplayReadouts(){},scheduleSave(){state.saves++;},status:message=>state.messages.push(message),commit(mutator,message){mutator(project);project.revision++;state.commits++;state.messages.push(message);}});
 vm.runInContext(['getLiveInputController','digitalSourceControl','setDigitalSourceState'].map(actualFunction).join('\n'),context);
 return{project,component,session,state,context,set:value=>context.setDigitalSourceState(component.id,value)};
}

test('source controls expose keyboard-native binary buttons and explicit selected state',()=>{
 const {component}=fixture(),html=digitalSourceControlHTML(component);
 assert.match(html,/data-source-state="0"[^>]+aria-pressed="true"/);assert.match(html,/data-source-state="1"[^>]+aria-pressed="false"/);
 assert.match(html,/Set DV1 HIGH/);assert.match(html,/Run the circuit to update/);assert.doesNotMatch(html,/<small>.* V<\/small>/);
});
test('voltage-mode buttons show the configured differential levels with safe escaped text',()=>{
 const {component}=fixture();Object.assign(component.params,{outputMode:'logic-voltage',low:'-1',high:'3.3'});
 const html=digitalSourceControlHTML(component,{value:'1',live:true,busy:true});assert.match(html,/>-1 V</);assert.match(html,/>3.3 V</);assert.match(html,/Live source state/);assert.match(html,/Step or Resume/);assert.equal((html.match(/ disabled>/g)||[]).length,2);
 component.ref='bad<ref>';assert.ok(!digitalSourceControlHTML(component).includes('bad<ref>'));
});
test('binary source UI cannot silently represent X or Z as HIGH or LOW',()=>{
 const {component}=fixture();assert.throws(()=>digitalSourceControlHTML(component,{value:'X'}),/known 0 or 1/);assert.throws(()=>digitalSourceControlHTML(component,{value:'Z'}),/known 0 or 1/);
 assert.equal(digitalSourceOutputLabel('logic'),'Digital logic');assert.equal(digitalSourceOutputLabel('logic-voltage'),'Digital logic + voltage terminals');
});
test('idle source button updates the project starting value through the normal edit transaction',async()=>{
 const h=harness();await h.set('1');assert.equal(h.component.params.state,'1');assert.equal(h.project.revision,1);assert.equal(h.state.commits,1);assert.equal(h.state.updates.length,0);assert.match(h.state.messages.at(-1),/run the circuit/);
});
test('live source button changes the retained session and keeps the original project immutable',async()=>{
 const h=harness({live:true});await h.set('1');assert.deepEqual(h.state.updates,[[{id:h.component.id,value:'1'}]]);assert.equal(h.component.params.state,'0');assert.equal(h.project.revision,0);assert.equal(h.state.commits,0);assert.equal(h.state.saves,1);assert.match(h.state.messages.at(-1),/Use Step or Resume/);
 assert.match(h.context.digitalSourceControl(h.component),/data-source-state="1"[^>]+aria-pressed="true"/);
});
test('unknown drive settings are rejected before reaching a live worker',async()=>{
 const h=harness({live:true});for(const invalid of ['X','Z','2','01',1,null])await assert.rejects(h.set(invalid),/LOW \(0\) or HIGH \(1\)/);assert.equal(h.state.updates.length,0);assert.equal(h.state.commits,0);
});
test('a source cannot be applied to a continuous session belonging to another project',async()=>{
 const h=harness({live:true,mismatch:true});await assert.rejects(h.set('1'),/does not belong/);assert.equal(h.state.updates.length,0);assert.equal(h.state.saves,0);
});
test('source buttons are blocked during a pending bounded experiment',async()=>{
 const h=harness();h.context.preparing=true;await assert.rejects(h.set('1'),/active experiment/);assert.equal(h.state.commits,0);assert.match(h.context.digitalSourceControl(h.component),/disabled/);
});
test('failed input changes do not claim success or save a fabricated drive change',async()=>{
 const h=harness({live:true,change:async()=>{throw new Error('Worker rejected change');}});await assert.rejects(h.set('1'),/Worker rejected/);assert.equal(h.state.saves,0);assert.equal(h.state.messages.length,0);assert.equal(h.component.params.state,'0');
});
test('a replaced session cannot be reported or saved by a late successful input response',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),h=harness({live:true,change:()=>gate});const pending=h.set('1');h.context.continuousSession=null;release();await pending;assert.equal(h.state.saves,0);assert.equal(h.state.messages.length,0);
});
