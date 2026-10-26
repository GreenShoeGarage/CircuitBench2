/** Exercise the actual app functions with controlled DOM and async boundaries.
 * These are lifecycle/repair tests, not a substitute for browser interaction.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {EXAMPLES} from '../src/examples.js';
import {VERSION,validateProject,newProject,setComponentParams,removeItems} from '../src/model.js';
import {getPart,getPins,parseTruthTable,buildTruthTable} from '../src/library.js';
import {generateNetlist} from '../src/netlist.js';
import {generateTruthTable} from '../src/digital.js';
import {validateTruthTables} from '../src/truth-table-evidence.js';
import {escapeHTML as esc} from '../src/storage.js';
import {lutRowsHTML,normalizeLUTRows} from '../src/truth-table-ui.js';

const app=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
function extract(startText,endText){
 const start=app.indexOf(startText),end=app.indexOf(endText,start);
 assert.ok(start>=0&&end>start,`Locate actual app function ${startText}`);
 return app.slice(start,end);
}
const actual=[
 extract('function commit(','\nfunction restoreHistory('),
 extract('function stopExperiment(','\nasync function replaceProject('),
 extract('async function replaceProject(','\nfunction setModeButtons('),
 extract('function showLUTEditor(','\nfunction showTruthTables('),
 extract('async function executeTruthTable(','\nfunction showTruthTableRecord('),
 extract('function confirmReplace(','\nfunction showExamples(')
].join('\n');
const globalStop=app.match(/\$\('stop-btn'\)\.onclick=[^;]+;/)?.[0];
assert.ok(globalStop,'Locate actual global Stop button handler');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const decode=value=>String(value).replace(/&(amp|lt|gt|quot|#39);/g,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[entity]));

function harness({hashDeferred=false,workerDeferred=false,invalidTable}={}){
 const project=EXAMPLES.find(example=>example.id==='truth-table-adder').create();
 const lut=project.circuit.components.find(component=>component.type==='LUT');
 if(invalidTable!==undefined)lut.params.table=invalidTable;
 const state={html:'',rowInputs:[],messages:[],saves:0,workerRuns:0,stops:0,records:[],errors:[]};
 const nodes=new Map(),base=new Set(['dialog','dialog-title','dialog-content','run-btn','stop-btn','truth-table-btn']);
 for(const id of base)nodes.set(id,{value:'',textContent:'',disabled:false});
 const $=id=>nodes.get(id)??null;
 $('dialog').close=()=>{$('dialog').open=false;};
 $('dialog-content').querySelectorAll=selector=>selector==='[data-lut-row]'?state.rowInputs:[];
 const showDialog=(title,html)=>{
  for(const id of nodes.keys())if(!base.has(id))nodes.delete(id);
  state.html=html;$('dialog-title').textContent=title;$('dialog').open=true;
  for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
   const [,tag,attrs,id]=match,node={value:decode(attrs.match(/\bvalue="([^"]*)"/)?.[1]??''),textContent:''};
   const content=html.slice(match.index+match[0].length).split(`</${tag}>`)[0];
   if(tag==='textarea')node.value=decode(content);
   if(tag==='select')node.value=content.match(/<option\s+value="([^"]+)"\s+selected/)?.[1]??content.match(/<option\s+value="([^"]+)"/)?.[1]??'';
   if(tag==='p')node.textContent=decode(content);
   nodes.set(id,node);
  }
  state.rowInputs=[...html.matchAll(/<input\b([^>]*\bdata-lut-row="(\d+)"[^>]*)>/g)].map(([,attrs,index])=>({value:decode(attrs.match(/\bvalue="([^"]*)"/)?.[1]??''),dataset:{lutRow:index}}));
 };
 const hash=deferred(),worker=deferred();
 const engine={running:false,stop(){state.stops++;return this.running;},runTruthTable(generated,options){state.workerRuns++;this.running=true;state.result=generateTruthTable(generated.simulation.digital,options);return (workerDeferred?worker.promise:Promise.resolve(state.result)).finally(()=>{this.running=false;});}};
 let serial=0;
 const context=vm.createContext({ captureRecords:[],measurementRecords:[],stepStudies:[],
  project,continuousPreparation:null,continuousSession:null,continuousRun:null,studyAbort:null,analogExperiments:[],truthTables:[],timingMeasurements:[],runs:[],runTask:null,preparing:false,truthTableTask:null,selection:[],selectedEndpoint:null,undoStack:[],redoStack:[],VERSION,
  $,showDialog,engine,clone:structuredClone,Date,Map,JSON,getPart,getPins,parseTruthTable,buildTruthTable,setComponentParams,validateProject,validateTruthTables,generateNetlist,normalizeLUTRows,lutRowsHTML,esc,
  uid:()=>`table_test_${++serial}`,hashText:()=>hashDeferred?hash.promise:Promise.resolve('a'.repeat(64)),
  scheduleSave(){state.saves++;},status(message){state.messages.push(message);},render(){},
  hasDigital:p=>p.workspace!=='netlist'&&p.circuit.components.some(c=>getPins(c).some(pin=>pin.domain==='digital')),
  handleError(error){state.errors.push(error);},showTruthTables(){},exportProject(){state.backups=(state.backups??0)+1;},
  showTruthTableRecord(record){state.records.push(record);showDialog('Truth-table results','');},
  editor:{select(){},setMode(){},fit(){}},requestAnimationFrame:fn=>fn()
 });
 vm.runInContext(actual+'\n'+globalStop,context);
 const selection=()=>{const {digital}=generateNetlist(context.project).simulation;return {inputIds:digital.inputGroups.map(group=>group.id),outputNames:['b(sumcarry)','d(carry)','d(sum)']};};
 const start=()=>{context.preparing=true;context.runTask=context.executeTruthTable(selection()).finally(()=>{context.preparing=false;});return context.runTask;};
 return {context,state,$,lut,hash,worker,start};
}

test('modal Stop during plan hashing prevents worker startup and evidence append',async()=>{
 const h=harness({hashDeferred:true}),task=h.start();
 h.$('truth-stop').onclick();h.hash.resolve('a'.repeat(64));await task;
 assert.equal(h.state.stops,1);assert.equal(h.state.workerRuns,0);assert.equal(h.context.truthTables.length,0);assert.equal(h.state.saves,0);
 assert.match(h.state.messages.at(-1),/cancelled/i);assert.equal(h.context.truthTableTask,null);
});
test('global Stop cancels preparation and a subsequent table can complete',async()=>{
 const h=harness({hashDeferred:true}),task=h.start();
 h.$('stop-btn').onclick();h.hash.resolve('a'.repeat(64));await task;
 assert.equal(h.state.workerRuns,0);await h.start();
 assert.equal(h.state.workerRuns,1);assert.equal(h.context.truthTables.length,1);assert.equal(h.state.saves,1);
 assert.deepEqual(h.context.truthTables[0].result.rows.map(row=>row.outputs),[['00','0','0'],['01','0','1'],['01','0','1'],['10','1','0']]);
});
test('project replacement cancels a preparing truth table before replacing its state',async()=>{
 const h=harness({hashDeferred:true});h.start();const next=newProject('Replacement');
 const replacing=h.context.replaceProject(next,'Replaced');h.hash.resolve('a'.repeat(64));await replacing;
 assert.equal(h.context.project.id,next.id);assert.equal(h.state.workerRuns,0);assert.equal(h.context.truthTables.length,0);
 assert.equal(h.state.saves,1,'Only the replacement project is scheduled for save');
});
test('a late successful worker response cannot append evidence after Stop',async()=>{
 const h=harness({workerDeferred:true}),task=h.start();await flush();assert.equal(h.state.workerRuns,1);
 h.$('truth-stop').onclick();h.worker.resolve(h.state.result);await task;
 assert.equal(h.context.truthTables.length,0);assert.equal(h.state.saves,0);assert.equal(h.context.truthTableTask,null);
 assert.match(h.state.messages.at(-1),/cancelled/i);
});
test('Stop without a truth-table task retains the ordinary engine stop behavior',()=>{
 const h=harness();h.context.engine.running=true;assert.equal(h.context.stopExperiment(),true);
 assert.equal(h.state.stops,1);assert.equal(h.context.truthTableTask,null);
});
test('completed evidence retains the captured circuit after later working edits',async()=>{
 const h=harness();await h.start();const record=h.context.truthTables[0],saved=structuredClone(record);
 h.context.project.notes+=' Later edit';h.context.project.revision++;
 assert.deepEqual(record,saved);assert.equal(record.result.inputs[0].width,2);assert.equal(record.outputNames[0],'b(sumcarry)');
});
test('an incomplete imported LUT opens a repair draft and Cancel preserves every project byte',()=>{
 const h=harness({invalidTable:'00:00; <invalid>&'}),before=JSON.stringify(h.context.project);
 assert.doesNotThrow(()=>validateProject(h.context.project));h.context.showLUTEditor(h.lut.id);
 assert.match(h.$('dialog-title').textContent,/repair truth table/);assert.equal(h.$('lut-repair-text').value,'00:00; <invalid>&');
 assert.match(h.state.html,/&lt;invalid&gt;&amp;/);assert.doesNotMatch(h.state.html,/<invalid>/);
 assert.equal(h.$('lut-repair-input-bits').value,'2');assert.equal(h.$('lut-repair-output-bits').value,'2');
 h.$('lut-repair-cancel').onclick();assert.equal(JSON.stringify(h.context.project),before);assert.equal(h.state.saves,0);
});
test('incorrect repair text reports its parse error without changing the circuit',()=>{
 const h=harness({invalidTable:'00:00'}),before=JSON.stringify(h.context.project);h.context.showLUTEditor(h.lut.id);
 h.$('lut-repair-text').value='00:0x1';h.$('lut-repair-open').onclick();
 assert.match(h.$('lut-repair-error').textContent,/all 4 input rows/);assert.equal(JSON.stringify(h.context.project),before);assert.equal(h.state.saves,0);
});
test('corrected repair text normalizes numeric and unknown words, then applies atomically',()=>{
 const h=harness({invalidTable:'00:00'}),before=JSON.stringify(h.context.project),revision=h.context.project.revision;
 h.context.showLUTEditor(h.lut.id);h.$('lut-repair-text').value='00:0x1; 01:0X; 10:Z1; 11:0b10';h.$('lut-repair-open').onclick();
 assert.deepEqual(h.state.rowInputs.map(input=>input.value),['01','0X','Z1','10']);assert.equal(JSON.stringify(h.context.project),before);
 h.$('lut-apply').onclick();const applied=h.context.project.circuit.components.find(c=>c.id===h.lut.id);
 assert.deepEqual(parseTruthTable(applied.params.table,2,2),['01','0X','Z1','10']);assert.equal(h.context.project.revision,revision+1);assert.equal(h.state.saves,1);
});
test('resetting a repair draft is explicit and cancelling its row editor keeps the original',()=>{
 const h=harness({invalidTable:'00:11'}),before=JSON.stringify(h.context.project);h.context.showLUTEditor(h.lut.id);
 h.$('lut-repair-reset').onclick();assert.deepEqual(h.state.rowInputs.map(input=>input.value),['00','00','00','00']);
 assert.equal(JSON.stringify(h.context.project),before);h.$('lut-cancel').onclick();assert.equal(JSON.stringify(h.context.project),before);assert.equal(h.state.saves,0);
});
test('a reset draft changes the component only when Apply truth table succeeds',()=>{
 const h=harness({invalidTable:'00:11'});h.context.showLUTEditor(h.lut.id);h.$('lut-repair-reset').onclick();h.$('lut-apply').onclick();
 assert.deepEqual(parseTruthTable(h.context.project.circuit.components.find(c=>c.id===h.lut.id).params.table,2,2),['00','00','00','00']);assert.equal(h.state.saves,1);
});
test('a repaired width conflict keeps both the circuit and draft available for correction',()=>{
 const h=harness({invalidTable:'00:00'}),before=JSON.stringify(h.context.project);h.context.showLUTEditor(h.lut.id);
 h.$('lut-repair-output-bits').value='3';h.$('lut-repair-text').value='00:000; 01:001; 10:010; 11:011';h.$('lut-repair-open').onclick();h.$('lut-apply').onclick();
 assert.match(h.$('lut-error').textContent,/width conflicts/);assert.equal(h.$('dialog').open,true);assert.equal(JSON.stringify(h.context.project),before);assert.equal(h.state.saves,0);
});
test('valid LUTs retain direct row editing and numeric-word normalization',()=>{
 const h=harness();h.context.showLUTEditor(h.lut.id);assert.match(h.$('dialog-title').textContent,/edit truth table/);
 h.state.rowInputs[0].value='0x2';h.state.rowInputs[1].value='0X';h.$('lut-apply').onclick();
 assert.deepEqual(parseTruthTable(h.context.project.circuit.components.find(c=>c.id===h.lut.id).params.table,2,2),['10','0X','01','10']);
});
test('a truly empty new project can be replaced without a confirmation dialog',()=>{
 const h=harness();h.context.project=newProject();let replacements=0;
 h.context.confirmReplace('Replace?',()=>replacements++);
 assert.equal(replacements,1);assert.equal(h.$('dialog').open,undefined);
});
test('deleting the circuit does not bypass backup confirmation for retained truth tables',async()=>{
 const h=harness();await h.start();const recorded=structuredClone(h.context.truthTables[0]);
 const p=h.context.project;removeItems(p,[...p.circuit.components,...p.layout.annotations].map(item=>item.id));p.notes='';p.question='';p.assumptions=[];
 validateProject(p);let replacements=0;h.context.confirmReplace('Replace?',()=>replacements++);
 assert.equal(replacements,0);assert.match(h.state.html,/saved runs, truth tables, timing measurements, analog experiments/);h.$('confirm-backup').onclick();assert.equal(h.state.backups,1);
 h.$('confirm-cancel').onclick();assert.equal(replacements,0);assert.deepEqual(h.context.truthTables[0],recorded);
 h.context.confirmReplace('Replace?',()=>replacements++);h.$('confirm-go').onclick();assert.equal(replacements,1);
});
test('retained run history also requires explicit replacement confirmation',()=>{
 const h=harness();h.context.project=newProject();h.context.runs=[{id:'run_retained'}];let replacements=0;
 h.context.confirmReplace('Replace?',()=>replacements++);assert.equal(replacements,0);assert.ok(h.$('confirm-cancel'));
 h.$('confirm-cancel').onclick();assert.equal(h.context.runs.length,1);
});
test('non-component project content disables the empty-project shortcut',()=>{
 const cases={
  question:p=>p.question='What should this circuit do?',notes:p=>p.notes='Keep this note',assumptions:p=>p.assumptions=['A stated assumption'],
  annotation:p=>p.layout.annotations.push({id:'note_keep',x:0,y:0,text:'Draft idea'}),
  junction:p=>{p.circuit.junctions.push({id:'j_keep'});p.layout.junctions.j_keep={x:0,y:0};},
  label:p=>p.circuit.labels.push({id:'label_keep',name:'saved',target:'j:j_keep'}),
  connection:p=>p.circuit.connections.push({id:'wire_keep',a:'j:j_a',b:'j:j_b'}),
  netlist:p=>p.netlistText='* draft circuit'
 };
 for(const [name,edit] of Object.entries(cases)){
  const h=harness();h.context.project=newProject();edit(h.context.project);const before=JSON.stringify(h.context.project);let replacements=0;
  h.context.confirmReplace('Replace?',()=>replacements++);assert.equal(replacements,0,`${name} must be protected`);h.$('confirm-cancel').onclick();assert.equal(JSON.stringify(h.context.project),before);
 }
});
