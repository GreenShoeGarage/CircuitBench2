/** Actual app lifecycle functions with controlled DOM/plot boundaries.
 * Browser rendering and actual worker execution have separate release proofs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {diagnosticHTML} from '../src/construction-ui.js';
import {EXAMPLES} from '../src/examples.js';
import {VERSION,newProject,validateProject,setComponentParams} from '../src/model.js';
import {getPins} from '../src/library.js';
import {generateNetlist} from '../src/netlist.js';
import {DIGITAL_ENGINE_INFO,simulateDigital} from '../src/digital.js';
import {mergeEventResults} from '../src/simulation.js';
import {ENGINE_INFO} from '../src/engine.js';
import {getRunTraces,getAxis,formatNumber,formatTraceValue} from '../src/plots.js';
import {safeEnvelope,filename,escapeHTML as esc} from '../src/storage.js';
import {getTimingSignals} from '../src/timing.js';
import {createTimingRecord,retainTimingRecords,timingCSV,timingEvidenceJSON} from '../src/timing-evidence.js';
import {timingSetupHTML,readTimingSetup,updateTimingSetup,timingResultHTML} from '../src/timing-ui.js';
import {createReport} from '../src/reports.js';

const app=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
function extract(startText,endText){const start=app.indexOf(startText),end=app.indexOf(endText,start);assert.ok(start>=0&&end>start,`Locate actual app function ${startText}`);return app.slice(start,end);}
const actual=[
 extract('const envelope=','\nfunction endpointDomain('),
 extract('function portableRuns(','\nfunction renderDisplayReadouts('),
 extract('function commit(','\nfunction restoreHistory('),
 extract('function stopExperiment(','\nfunction setModeButtons('),
 extract('function renderResults(','\nfunction showLUTEditor('),
 extract('function showTimingMeasurements(','\nfunction showExamples('),
 extract('function exportProject(','\nasync function importSpiceFile('),
 extract('function showReport(','\nfunction showHelp('),
 extract("$('new-btn').onclick=","\n$('recover-btn').onclick=")
].join('\n')+'\nglobalThis.envelope=envelope;';
const decode=value=>String(value).replace(/&(amp|lt|gt|quot|#39);/g,(_,entity)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[entity]));
const clone=value=>structuredClone(value);
let harnessSerial=0;

function runFixture(example='timing-clock',id='run_timing_app'){
 const project=EXAMPLES.find(item=>item.id===example).create(),generated=generateNetlist(project);
 assert.equal(generated.diagnostics.filter(d=>d.severity==='error').length,0);
 const digital=simulateDigital({...generated.simulation.digital,duration:generated.simulation.duration}),result={...mergeEventResults(null,digital),engine:clone(DIGITAL_ENGINE_INFO),logs:digital.logs,warnings:digital.warnings};
 return {id,status:'completed',projectId:project.id,revision:project.revision,projectSnapshot:clone(project),analysis:clone(project.analysis),startedAt:'2020-01-01T00:00:00.000Z',completedAt:'2020-01-01T00:00:01.000Z',netlist:generated.netlist,netlistHash:'a'.repeat(64),simulation:clone(generated.simulation),simulationHash:'b'.repeat(64),engine:clone(DIGITAL_ENGINE_INFO),measurements:clone(generated.measurements),models:clone(generated.modelManifest),logs:clone(result.logs),diagnostics:clone(generated.diagnostics),result};
}

function harness({run=runFixture(),project=clone(run.projectSnapshot),runs=[run],records=[]}={}){
 const state={messages:[],downloads:[],saves:[],errors:[],html:'',plotCalls:[],reportCalls:[],stops:0},nodes=new Map();
 const baseIds=['dialog','dialog-title','dialog-content','baseline-btn','csv-btn','compare-label','report-btn','timing-btn','compare-toggle','run-status','table-panel','runs-panel','netlist-panel','plot-panel','results','results-toggle','new-btn','duplicate-project-btn'];
 function makeNode(tag='div',attrs='',content=''){
  const classes=new Set(),attributes=new Map(),dataset={};
  for(const [,key,value] of attrs.matchAll(/\bdata-([\w-]+)="([^"]*)"/g))dataset[key.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=decode(value);
  const node={tagName:tag.toUpperCase(),value:decode(attrs.match(/\bvalue="([^"]*)"/)?.[1]??''),textContent:decode(content),dataset,disabled:/\bdisabled\b/.test(attrs),hidden:/\bhidden\b/.test(attrs),checked:false,open:false,attributes,
   classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value)},
   setAttribute:(name,value)=>attributes.set(name,value),getAttribute:name=>attributes.get(name),showModal(){this.open=true;},close(){this.open=false;},focus(){},
   contentWindow:{focus(){},print(){state.printed=true;}},children:[],ids:[]};
  if(tag==='select'){node.options=[...content.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(([,a,text])=>({value:decode(a.match(/\bvalue="([^"]*)"/)?.[1]??''),textContent:decode(text),selected:/\bselected\b/.test(a)}));node.value=(node.options.find(o=>o.selected)??node.options[0])?.value??'';}
  node.querySelector=selector=>selector.startsWith('#')?nodes.get(selector.slice(1))??null:node.querySelectorAll(selector)[0]??null;
  node.querySelectorAll=selector=>{const key=selector.match(/^\[data-([\w-]+)\]$/)?.[1]?.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());return key?node.children.filter(child=>Object.hasOwn(child.dataset,key)):[];};
  Object.defineProperty(node,'innerHTML',{get:()=>node._html??'',set:html=>{
   for(const id of node.ids)if(!baseIds.includes(id))nodes.delete(id);node.ids=[];node.children=[];node._html=html;
   if(node===nodes.get('dialog-content'))state.html=html;
   for(const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/g)){
    const [,childTag,a]=match,id=a.match(/\bid="([^"]+)"/)?.[1];
    if(!id&&!/\bdata-/.test(a))continue;
    const inner=html.slice(match.index+match[0].length).split(`</${childTag}>`)[0],child=makeNode(childTag,a,inner);node.children.push(child);if(id){nodes.set(id,child);node.ids.push(id);}
   }
  }});return node;
 }
 for(const id of baseIds)nodes.set(id,makeNode());nodes.get('results').classList.add('collapsed');
 const tabs=['plot','table','runs','netlist'].map(name=>makeNode('button',`data-result-tab="${name}"`)),document={querySelectorAll:selector=>selector==='[data-result-tab]'?tabs:[],getElementById:id=>nodes.get(id)??null};
 const $=id=>nodes.get(id)??null;
 const plot={selected:new Set(),unit:'logic',cursors:[null,null],range:null,baseline:null,
  setRun(selected,baseline){this.run=selected;this.baseline=baseline;state.plotCalls.push(['setRun',selected?.id]);},render(){state.plotCalls.push(['render']);},draw(){state.plotCalls.push(['draw']);},setRange(a,b){this.range=[a,b];state.plotCalls.push(['range',a,b]);},getSVG(){return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';}};
 let serial=0,context;const instance=++harnessSerial;
 context=vm.createContext({ diagnosticHTML,bindDiagnosticNavigation(){},renderInstrumentState(){},renderCaptureState(){}, captureRecords:[],measurementRecords:[],stepStudies:[],
  project,runs,installationTask:null,restoredRunIds:new Set(),continuousPreparation:null,continuousSession:null,continuousRun:null,studyAbort:null,analogExperiments:[],truthTables:[],timingMeasurements:records,activeRunId:runs.at(-1)?.id??null,baselineId:null,selection:[],undoStack:[],redoStack:[],selectedEndpoint:null,exampleId:null,runTask:null,preparing:false,truthTableTask:null,reportHTML:'',reportURL:null,VERSION,
  document,$,plot,Date,Map,Set,Number,JSON,Blob,URL:{createObjectURL:()=>`blob:timing-test-${++serial}`,revokeObjectURL(){}},clone,uid:prefix=>`${prefix}_app_${instance}_${++serial}`,
  newProject,validateProject,getPins,setComponentParams,generateNetlist,ENGINE_INFO,getRunTraces,getAxis,formatNumber,formatTraceValue,displayTraceValue:formatTraceValue,
  safeEnvelope,filename,esc,getTimingSignals,createTimingRecord,retainTimingRecords,timingCSV,timingEvidenceJSON,timingSetupHTML,readTimingSetup,updateTimingSetup,timingResultHTML,
  createReport:options=>{state.reportCalls.push(options);return createReport(options);},
  engine:{running:false,stop(){state.stops++;return true;}},editor:{select(){},setMode(){},fit(){},exportSVG(){return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';}},
  scheduleSave(immediate=false){state.saves.push({immediate,envelope:clone(context.envelope())});},render(){context.renderResults();},requestAnimationFrame:fn=>fn(),status:message=>state.messages.push(message),handleError:error=>state.errors.push(error),download:(name,content,type)=>state.downloads.push({name,content,type})
 });
 vm.runInContext(actual,context);
 const choose=(id,ref)=>{const signals=getTimingSignals(context.runs.find(r=>r.id===context.activeRunId)??context.runs.at(-1));$(id).value=String(signals.findIndex(signal=>signal.name===ref.name&&signal.bit===ref.bit));};
 const setup=(kind='delay',source={name:'d(clock)'},target={name:'d(delayed)'})=>{context.showTimingMeasurements();$('timing-kind').value=kind;$('timing-kind').onchange();choose('timing-source',source);if(kind==='delay')choose('timing-target',target);};
 const measure=()=>{$('timing-measure').onclick();return context.timingMeasurements.at(-1);};
 return {context,state,$,plot,run,setup,measure,choose};
}

test('the setup measures its captured run even after the active run and working revision change',()=>{
 const h=harness(),original=h.run,another=runFixture('timing-hazard','run_other');h.setup();
 h.context.runs.push(another);h.context.activeRunId=another.id;h.context.commit(p=>{p.notes='A later working interpretation';},'Edited');
 const record=h.measure();assert.equal(h.state.errors.length,0);assert.equal(record.sourceRunId,original.id);assert.equal(record.revision,0);assert.equal(h.context.project.revision,1);assert.equal(record.projectSnapshot.notes,original.projectSnapshot.notes);
 assert.ok(record.result.rows.filter(row=>row.status==='measured').every(row=>row.value===20e-9));assert.match(h.state.html,/working circuit has changed/);
});

test('an invalid window does not append evidence or autosave and keeps the draft open',()=>{
 const h=harness();h.setup();const before=JSON.stringify(h.context.envelope());h.$('timing-end').value='999n';h.measure();
 assert.equal(h.context.timingMeasurements.length,0);assert.equal(h.state.saves.length,0);assert.equal(h.$('dialog').open,true);assert.equal(h.$('timing-end').value,'999n');assert.match(h.$('timing-error').textContent,/window|saved run/i);
 const after=h.context.envelope();delete after.savedAt;const prior=JSON.parse(before);delete prior.savedAt;assert.deepEqual(clone(after),prior);
});

test('the real kind-change handler reads pulse settings and saves a separate immutable record',()=>{
 const h=harness();h.setup();const delay=h.measure(),before=JSON.stringify(delay);h.$('timing-new').onclick();h.$('timing-kind').value='pulse-width';h.$('timing-kind').onchange();
 assert.equal(h.$('timing-target-fields').hidden,true);h.$('timing-edge').value='rising';const pulse=h.measure();
 assert.equal(h.context.timingMeasurements.length,2);assert.equal(pulse.spec.kind,'pulse-width');assert.equal(pulse.spec.target,undefined);assert.ok(pulse.result.rows.filter(row=>row.status==='measured').every(row=>row.value===25e-9));assert.equal(JSON.stringify(delay),before);
});

test('saved-history buttons open the chosen record and the selected run reuses its latest setup',()=>{
 const h=harness();h.setup();const first=h.measure();h.setup('frequency');const second=h.measure();h.context.showTimingMeasurements();
 assert.equal(h.$('timing-kind').value,'frequency');const buttons=h.$('dialog-content').querySelectorAll('[data-timing-history]');assert.equal(buttons.length,2);assert.equal(buttons[0].dataset.timingHistory,second.id);
 buttons.find(button=>button.dataset.timingHistory===first.id).onclick();assert.equal(h.$('dialog-title').textContent,'Timing results');assert.match(h.state.html,/Propagation delay/);assert.equal(h.context.timingMeasurements.length,2);
});

test('removing the full source run keeps timing history, CSV and standalone evidence usable',()=>{
 const h=harness();h.setup();const record=h.measure(),before=JSON.stringify(record);h.context.renderResults();h.$('runs-panel').querySelectorAll('[data-remove-run]')[0].onclick();
 assert.equal(h.context.runs.length,0);assert.equal(JSON.stringify(h.context.timingMeasurements[0]),before);assert.equal(h.$('timing-btn').disabled,false);h.context.showTimingMeasurements();assert.equal(h.$('timing-measure'),null);
 h.$('dialog-content').querySelectorAll('[data-timing-history]')[0].onclick();assert.equal(h.$('dialog-content').querySelectorAll('[data-timing-view-row]').length,0);
 h.$('timing-csv').onclick();h.$('timing-evidence').onclick();assert.equal(h.state.downloads.length,2);assert.match(h.state.downloads[0].content,/"Source run ID"/);assert.equal(JSON.parse(h.state.downloads[1].content).measurement.sourceRunId,record.sourceRunId);
});

test('View pair selects the original run, exact cursors and one trace per selected vector',()=>{
 const h=harness();h.setup();const record=h.measure(),pair=record.result.rows.findIndex(row=>row.status==='measured'),another=runFixture('timing-hazard','run_other');
 h.context.runs.push(another);h.context.activeRunId=another.id;h.context.project.revision=2;const projectBefore=JSON.stringify(h.context.project);h.context.showTimingRecord(record);
 h.$('dialog-content').querySelectorAll('[data-timing-view-row]').find(button=>Number(button.dataset.timingViewRow)===pair).onclick();
 assert.equal(h.context.activeRunId,record.sourceRunId);assert.deepEqual([...h.plot.cursors],[record.result.rows[pair].start,record.result.rows[pair].end]);assert.equal(h.plot.selected.size,2);assert.equal(h.plot.unit,'logic');
 const chosen=getRunTraces(h.run).filter(trace=>h.plot.selected.has(trace.id));assert.equal(new Set(chosen.map(trace=>trace.vector)).size,2);assert.equal(chosen.length,2);
 assert.ok(h.plot.range[0]<record.result.rows[pair].start&&h.plot.range[1]>record.result.rows[pair].end);assert.equal(h.$('dialog').open,false);assert.equal(h.$('results').classList.contains('collapsed'),false);assert.equal(h.$('results-toggle').getAttribute('aria-expanded'),'true');assert.equal(JSON.stringify(h.context.project),projectBefore);
});

test('a bus-bit pair opens its full word lane and does not fabricate a new scalar trace',()=>{
 const run=runFixture('bus-counter','run_bus'),h=harness({run});h.setup('period',{name:'b(count)',bit:0});const record=h.measure(),vectorsBefore=JSON.stringify(run.result.vectors);
 const index=record.result.rows.findIndex(row=>row.status==='measured');assert.ok(index>=0);h.context.viewTimingPair(record,index);
 assert.equal(h.plot.selected.size,1);assert.equal(getRunTraces(run).find(trace=>h.plot.selected.has(trace.id)).kind,'bus');assert.equal(JSON.stringify(run.result.vectors),vectorsBefore);assert.match(h.state.messages.at(-1),/full bus word/);
});

test('View pair safely ignores missing source runs, unknown rows and incomplete endpoints',()=>{
 const h=harness();h.setup('period');const record=h.measure(),count=h.state.saves.length,active=h.context.activeRunId;h.context.viewTimingPair(record,999);h.context.viewTimingPair(record,record.result.rows.length-1);
 assert.equal(h.state.saves.length,count);assert.equal(h.context.activeRunId,active);h.context.runs=[];h.context.viewTimingPair(record,0);assert.equal(h.state.saves.length,count);
});

test('timing-only project content requires backup confirmation and Cancel preserves it',()=>{
 const h=harness();h.setup();const record=h.measure();h.context.project=newProject();h.context.runs=[];h.context.activeRunId=null;const before=JSON.stringify(h.context.timingMeasurements);let replaced=0;
 h.context.confirmReplace('Replace?',()=>replaced++);assert.equal(replaced,0);assert.match(h.state.html,/timing measurements/);h.$('confirm-backup').onclick();assert.equal(JSON.parse(h.state.downloads.at(-1).content).timingMeasurements[0].id,record.id);h.$('confirm-cancel').onclick();assert.equal(replaced,0);assert.equal(JSON.stringify(h.context.timingMeasurements),before);
});

test('backup export and actual import preserve evidence and record restoration separately',async()=>{
 const h=harness();h.setup();const record=h.measure();h.context.exportProject();const backup=h.state.downloads.at(-1),saved=JSON.parse(backup.content);
 assert.equal(saved.timingMeasurements.length,1);assert.equal(saved.timingMeasurements[0].sourceRun.importedFromBackup,false);const valid=safeEnvelope(saved,validateProject);assert.equal(valid.timingMeasurements[0].id,record.id);
 const target=harness({project:newProject(),runs:[]});await target.context.importProjectFile({size:backup.content.length,text:async()=>backup.content});
 assert.equal(target.context.runs[0].importedFromBackup,true);assert.equal(target.context.timingMeasurements[0].importedFromBackup,true);assert.equal(target.context.timingMeasurements[0].sourceRun.importedFromBackup,false);
 target.context.exportProject();const again=safeEnvelope(JSON.parse(target.state.downloads.at(-1).content),validateProject);assert.equal(again.timingMeasurements[0].importedFromBackup,true);
 target.setup('period');const fresh=target.measure();assert.equal(fresh.sourceRun.importedFromBackup,true);assert.equal(fresh.importedFromBackup,undefined);
});

test('envelopes own deep copies and project replacement clears only the departing history',async()=>{
 const h=harness();h.setup();const record=h.measure(),saved=h.context.envelope();saved.timingMeasurements[0].source.signals[0].events[0].value='Z';assert.notEqual(record.source.signals[0].events[0].value,'Z');
 const incoming=clone(record),next=clone(h.context.project);next.title='Reopened project';await h.context.replaceProject(next,'Replaced',[],{timingMeasurements:[incoming]});incoming.source.signals[0].events[0].value='Z';assert.notEqual(h.context.timingMeasurements[0].source.signals[0].events[0].value,'Z');
 await h.context.replaceProject(newProject(),'New');assert.equal(h.context.timingMeasurements.length,0);assert.equal(record.source.signals[0].events[0].value,'0');
});

test('Duplicate project starts new evidence history while a previously exported backup keeps its measurements',()=>{
 const h=harness();h.setup();h.measure();h.context.exportProject();const oldId=h.context.project.id,backup=JSON.parse(h.state.downloads.at(-1).content);h.$('duplicate-project-btn').onclick();
 assert.notEqual(h.context.project.id,oldId);assert.equal(h.context.project.revision,0);assert.equal(h.context.runs.length,0);assert.equal(h.context.timingMeasurements.length,0);assert.equal(backup.timingMeasurements.length,1);assert.equal(backup.timingMeasurements[0].projectId,oldId);
});

test('Remove measurement changes timing history without mutating its source run',()=>{
 const h=harness();h.setup();h.measure();const before=JSON.stringify(h.run);h.$('timing-remove').onclick();
 assert.equal(h.context.timingMeasurements.length,0);assert.equal(JSON.stringify(h.run),before);assert.equal(h.$('dialog-title').textContent,'Timing measurements');assert.match(h.state.messages.at(-1),/source run is unchanged/);
});

test('report generation passes all saved timing records even when their source runs are absent',()=>{
 const h=harness();h.setup();const record=h.measure();h.context.runs=[];h.context.activeRunId=null;h.context.project.revision=1;h.context.showReport();
 assert.equal(h.state.reportCalls.at(-1).timingMeasurements.length,1);assert.equal(h.state.reportCalls.at(-1).timingMeasurements[0].sourceRunId,record.sourceRunId);assert.match(h.context.reportHTML,/Digital timing measurements/);assert.ok(h.context.reportHTML.includes(record.sourceRunId));assert.ok(h.$('download-report').href.startsWith('blob:'));assert.equal(h.$('report-frame').srcdoc,h.context.reportHTML);
});

test('the thirteenth measurement is saved and the oldest record removal is disclosed',()=>{
 const h=harness(),ids=[];for(let index=0;index<13;index++){h.setup('period');ids.push(h.measure().id);}
 assert.equal(h.context.timingMeasurements.length,12);assert.equal(h.context.timingMeasurements[0].id,ids[1]);assert.equal(h.context.timingMeasurements.at(-1).id,ids[12]);assert.match(h.state.messages.at(-1),/1 older timing record/);
});
