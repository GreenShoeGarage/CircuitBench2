/** Actual app handlers with asynchronous completion and a controlled DOM surface.
 * The real three-worker smoke checks and browser rendering are verified separately.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {VERSION,newProject} from '../src/model.js';
import {escapeHTML as esc} from '../src/storage.js';
import {installationCheckHTML,installationReportJSON,installationReportFilename,installationRepairURL} from '../src/installation-ui.js';

const source=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
function actualFunction(name){const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));assert.ok(start>=0,`Find ${name}`);const next=source.slice(start+1).search(/\n(?:async )?function [A-Za-z_$]/);assert.ok(next>=0);return source.slice(start,start+1+next);}
const closeBinding=source.match(/^\$\('dialog'\)\.addEventListener\('close',\(\)=>cancelInstallationCheck\(\)\);$/m)?.[0];assert.ok(closeBinding,'Actual dialog-close binding');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const report=(status='passed',tag='test')=>({format:'CircuitBench installation check',formatVersion:1,version:VERSION,loadedBuild:'1234567890abcdef',manifestBuild:'1234567890abcdef',status,scope:'https://example.test/circuitbench/',checks:[{id:'manifests',label:'Release manifests',status:'passed',message:tag},{id:'asset:engine.js',label:'Engine module',status:'passed',message:'Passed'}],summary:{passed:2,failed:0,unavailable:0},environment:{secureContext:true,sha256:true,serviceWorker:true},startedAt:'2026-01-01T00:00:00Z',completedAt:status==='running'?null:'2026-01-01T00:00:01Z'});
function harness({build='1234567890abcdef'}={}){
 const state={checks:[],downloads:[],messages:[],writes:0,modalOpens:0},project=newProject('PRIVATE PROJECT MUST NOT ENTER DIAGNOSTICS'),initial=structuredClone(project),nodes=new Map(),document={baseURI:'https://example.test/circuitbench/index.html',activeElement:null};
 const get=id=>{if(!nodes.has(id)){const listeners=new Map(),node={id,textContent:'',open:false,scrollTop:0,_html:'',buttons:[],details:null,showModal(){this.open=true;state.modalOpens++;},close(){this.open=false;for(const fn of listeners.get('close')??[])fn();},addEventListener(type,fn){listeners.set(type,[...(listeners.get(type)??[]),fn]);},contains(element){return this.buttons.includes(element);},querySelectorAll(selector){return selector==='[data-installation-action]'?this.buttons:[];},querySelector(selector){if(selector==='.installation-assets')return this.details;const action=selector.match(/^\[data-installation-action="([^"]+)"\]$/)?.[1];return this.buttons.find(button=>button.dataset.installationAction===action)??null;}};Object.defineProperty(node,'innerHTML',{get(){return this._html;},set(html){state.writes++;this._html=html;this.scrollTop=0;this.buttons=[...html.matchAll(/<button\b[^>]*data-installation-action="([^"]+)"[^>]*>/g)].map(([tag,action])=>({dataset:{installationAction:action},disabled:/\sdisabled(?:\s|>)/.test(tag),focus(options){document.activeElement=this;state.lastFocusOptions=options;}}));this.details=html.includes('class="installation-assets"')?{open:false}:null;}});nodes.set(id,node);}return nodes.get(id);};
 document.getElementById=get;
 const context=vm.createContext({VERSION,loadedBuild:build,AbortController,URL,document,$:get,esc,installationCheckHTML,installationReportJSON,installationReportFilename,installationRepairURL,project,runInstallationCheck(options){const wait=deferred();state.checks.push({options,...wait});return wait.promise;},download(...args){state.downloads.push(args);},status(message){state.messages.push(message);},scheduleSave(){throw new Error('Installation checks cannot save projects');}});
 vm.runInContext('let installationTask=null,lastInstallationReport=null;\n'+['cancelInstallationCheck','paintInstallationCheck','showInstallationCheck','executeInstallationCheck','showDialog','handleError'].map(actualFunction).join('\n')+'\n'+closeBinding,context);
 const read=()=>vm.runInContext('({installationTask,lastInstallationReport})',context),button=action=>get('dialog-content').buttons.find(b=>b.dataset.installationAction===action);
 return{state,context,get,read,button,project,initial,open(){context.showInstallationCheck();},start(){return context.executeInstallationCheck();},close(){get('dialog').close();}};
}

test('installation dialog waits for an explicit check and does not use the working project',async()=>{
 const h=harness();h.open();assert.equal(h.get('dialog-title').textContent,'Check installation');assert.equal(h.state.checks.length,0);assert.equal(h.button('run').disabled,false);assert.equal(h.button('download').disabled,true);
 const task=h.start(),check=h.state.checks[0];assert.equal(check.options.baseURL,'https://example.test/circuitbench/');assert.equal(check.options.version,VERSION);assert.equal(check.options.buildHash,'1234567890abcdef');assert.deepEqual(Object.keys(check.options).sort(),['baseURL','buildHash','onProgress','signal','version']);
 check.resolve(report());await task;assert.deepEqual(h.project,h.initial);assert.equal(h.state.downloads.length,0);assert.equal(h.read().installationTask,null);assert.equal(h.read().lastInstallationReport.status,'passed');
});

test('only one check can own the dialog and a running diagnostic cannot be downloaded',async()=>{
 const h=harness();h.open();const task=h.start();await h.start();h.button('run').onclick();h.button('download').onclick();assert.equal(h.state.checks.length,1);assert.equal(h.state.downloads.length,0);assert.equal(h.button('run').disabled,true);assert.equal(h.button('download').disabled,true);
 h.state.checks[0].resolve(report());await task;assert.equal(h.button('run').disabled,false);assert.equal(h.button('download').disabled,false);
});

test('cancel button aborts the current check and retains its completed cancellation report for download',async()=>{
 const h=harness();h.open();const task=h.start(),check=h.state.checks[0];h.button('cancel').onclick();assert.equal(check.options.signal.aborted,true);
 check.resolve(report('cancelled','Completed checks before cancellation'));await task;assert.equal(h.read().lastInstallationReport.status,'cancelled');assert.equal(h.read().installationTask,null);h.button('download').onclick();assert.equal(h.state.downloads.length,1);assert.equal(JSON.parse(h.state.downloads[0][1]).status,'cancelled');assert.match(h.state.messages.at(-1),/No project data/);
});

test('closing the real dialog binding aborts ownership and ignores late progress/completion',async()=>{
 const h=harness();h.open();const task=h.start(),check=h.state.checks[0];h.close();assert.equal(check.options.signal.aborted,true);assert.equal(h.read().installationTask,null);const writes=h.state.writes;
 check.options.onProgress(report('running','late progress'));check.resolve(report('passed','late completion'));await task;
 assert.equal(h.state.writes,writes);assert.equal(h.read().lastInstallationReport,null);assert.equal(h.state.messages.length,0);assert.equal(h.state.downloads.length,0);
});

test('replacing the dialog prevents an old check from overwriting the new dialog',async()=>{
 const h=harness();h.open();const task=h.start(),check=h.state.checks[0];h.context.showDialog('Examples','<p>New dialog content</p>');const writes=h.state.writes;
 assert.equal(check.options.signal.aborted,true);check.options.onProgress(report('running'));check.resolve(report());await task;
 assert.equal(h.get('dialog-title').textContent,'Examples');assert.equal(h.get('dialog-content').innerHTML,'<p>New dialog content</p>');assert.equal(h.state.writes,writes);assert.equal(h.read().lastInstallationReport,null);
});

test('an obsolete completion cannot clear a newer task or attach its report',async()=>{
 const h=harness();h.open();const old=h.start(),oldCheck=h.state.checks[0];h.context.showDialog('Help','help');h.open();const fresh=h.start(),freshCheck=h.state.checks[1],newTask=h.read().installationTask;
 oldCheck.options.onProgress(report('running','obsolete'));oldCheck.resolve(report('passed','obsolete'));await old;
 assert.equal(h.read().installationTask,newTask);assert.equal(h.read().lastInstallationReport,null);assert.equal(freshCheck.options.signal.aborted,false);
 freshCheck.resolve(report('passed','new report'));await fresh;assert.equal(h.read().lastInstallationReport.checks[0].message,'new report');
});

test('retry starts a fresh check, clears the old report while running, and downloads only the new result',async()=>{
 const h=harness();h.open();let task=h.start();h.state.checks[0].resolve(report('failed','first'));await task;assert.equal(h.read().lastInstallationReport.status,'failed');
 task=h.start();assert.equal(h.read().lastInstallationReport,null);assert.equal(h.button('download').disabled,true);h.state.checks[1].resolve(report('passed','second'));await task;h.button('download').onclick();const [name,json,mime]=h.state.downloads[0];
 assert.equal(name,`CircuitBench-${VERSION}-installation-check.json`);assert.equal(mime,'application/json');assert.equal(JSON.parse(json).checks[0].message,'second');assert.ok(!json.includes(h.project.title));assert.deepEqual(h.project,h.initial);
});

test('progress repaint preserves file-detail expansion, scroll and the focused action',async()=>{
 const h=harness();h.open();const task=h.start(),check=h.state.checks[0];check.options.onProgress(report('running'));
 const content=h.get('dialog-content');content.details.open=true;content.scrollTop=123;h.button('cancel').focus();check.options.onProgress(report('running','updated'));
 assert.equal(content.details.open,true);assert.equal(content.scrollTop,123);assert.equal(h.context.document.activeElement,h.button('cancel'));assert.equal(h.state.lastFocusOptions.preventScroll,true);
 check.resolve(report());await task;
});

test('unexpected checker rejection releases ownership and uses the actual error dialog without changing the project',async()=>{
 const h=harness();h.open();const task=h.start();h.state.checks[0].reject(new Error('Unexpected <failure>'));await task;
 assert.equal(h.read().installationTask,null);assert.equal(h.get('dialog-title').textContent,'Could not complete that action');assert.match(h.get('dialog-content').innerHTML,/Unexpected &lt;failure&gt;/);assert.equal(h.read().lastInstallationReport,null);assert.deepEqual(h.project,h.initial);
 h.open();const retry=h.start();h.state.checks[1].resolve(report());await retry;assert.equal(h.read().lastInstallationReport.status,'passed');
});

test('late errors after closing are ignored and source-checkout build identity is explicitly omitted',async()=>{
 const h=harness({build:'development'});h.open();const task=h.start();assert.equal(h.state.checks[0].options.buildHash,undefined);h.close();h.state.checks[0].reject(new Error('Late error'));await task;
 assert.equal(h.get('dialog').open,false);assert.equal(h.state.messages.length,0);assert.equal(h.read().lastInstallationReport,null);
});

test('completed diagnostics can be reopened and downloaded without launching a new check',async()=>{
 const h=harness();h.open();const task=h.start();h.state.checks[0].resolve(report());await task;h.close();h.open();assert.equal(h.state.checks.length,1);assert.equal(h.button('download').disabled,false);h.button('download').onclick();assert.equal(h.state.downloads.length,1);
});
