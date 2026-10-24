/** Deterministic asynchronous tests of the actual application save scheduler.
 * The scheduler is loaded verbatim; timers and IndexedDB boundary are controlled
 * to exercise races without substituting a copy of the implementation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const app=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
const start=app.indexOf('function scheduleSave('),end=app.indexOf('\nfunction commit(',start);
assert.ok(start>=0&&end>start,'Locate actual application save scheduler');
const scheduler=app.slice(start,end);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const state={revision:1,status:'saved',history:[],messages:[],writes:[]},timers=new Map();let next=0;
 const context=vm.createContext({
  setTimeout(fn){const id=++next;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
  envelope(){return {revision:state.revision};},
  setSaveState(value){state.status=value;state.history.push(value);},
  status(message){state.messages.push(message);},
  saveCurrent(data){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});state.writes.push({data,resolve,reject});return promise;}
 });
 vm.runInContext('let saveTimer,saveChain=Promise.resolve(),saveGeneration=0;\n'+scheduler+'\nglobalThis.scheduleSave=scheduleSave;',context);
 const schedule=()=>context.scheduleSave();
 const fire=async()=>{assert.equal(timers.size,1,'One coalesced save timer');const [id,fn]=[...timers][0];timers.delete(id);fn();await flush();};
 return {state,timers,schedule,fire};
}

test('completion of an older write cannot claim a newer unsaved revision is saved',async()=>{
 const h=harness();h.schedule();await h.fire();assert.equal(h.state.status,'saving');assert.equal(h.state.writes[0].data.revision,1);
 h.state.revision=2;h.schedule();assert.equal(h.state.status,'unsaved');
 h.state.writes[0].resolve();await flush();assert.equal(h.state.status,'unsaved','New edit retains before-unload protection while its timer is pending');
 await h.fire();assert.equal(h.state.writes[1].data.revision,2);assert.equal(h.state.status,'saving');h.state.writes[1].resolve();await flush();assert.equal(h.state.status,'saved');
});
test('writes stay serialized when a newer timer fires before an older write completes',async()=>{
 const h=harness();h.schedule();await h.fire();h.state.revision=2;h.schedule();await h.fire();assert.equal(h.state.writes.length,1);
 h.state.writes[0].resolve();await flush();assert.equal(h.state.writes.length,2);assert.equal(h.state.status,'saving');
 h.state.writes[1].resolve();await flush();assert.equal(h.state.status,'saved');assert.deepEqual(h.state.writes.map(w=>w.data.revision),[1,2]);
});
test('an old failed write cannot overwrite the newer save status, and the next write can recover',async()=>{
 const h=harness();h.schedule();await h.fire();h.state.revision=2;h.schedule();h.state.writes[0].reject(new Error('Old transaction failed'));await flush();assert.equal(h.state.status,'unsaved');assert.equal(h.state.messages.length,0);
 await h.fire();h.state.writes[1].resolve();await flush();assert.equal(h.state.status,'saved');
});
test('rapid edits coalesce and the latest failed save advertises a session-only error',async()=>{
 const h=harness();h.schedule();h.state.revision=2;h.schedule();h.state.revision=3;h.schedule();await h.fire();assert.equal(h.state.writes.length,1);assert.equal(h.state.writes[0].data.revision,3);
 h.state.writes[0].reject(new Error('Storage quota exceeded'));await flush();assert.equal(h.state.status,'error');assert.match(h.state.messages[0],/Storage quota exceeded/);assert.match(h.state.messages[0],/Save backup/);
});
