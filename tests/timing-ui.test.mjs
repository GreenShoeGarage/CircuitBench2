import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/model.js';
import {getTimingSignals,measureTiming} from '../src/timing.js';
import {TIMING_KIND_LABELS,timingSetupHTML,readTimingSetup,updateTimingSetup,timingResultHTML,timingHistoryHTML} from '../src/timing-ui.js';

const ns=n=>n*1e-9;
function fixture(){
 const project=newProject('Clock and delay');project.analysis.type='tran';project.analysis.duration='60n';project.analysis.step='1n';
 const event=(time,value)=>({time:ns(time),value});
 const series=[
  {name:'d(clock)',label:'Clock',kind:'logic',width:1,bitOrder:'msb-first',events:[event(0,'0'),event(10,'1'),event(20,'0'),event(30,'1'),event(40,'0'),event(50,'1'),event(60,'0')]},
  {name:'d(output)',label:'Delayed output',kind:'logic',width:1,bitOrder:'msb-first',events:[event(0,'0'),event(15,'1'),event(25,'0'),event(35,'1'),event(45,'0'),event(55,'1')]},
  {name:'b(word)',label:'Word',kind:'bus',width:3,bitOrder:'msb-first',events:[event(0,'0X0'),event(10,'0X1'),event(20,'0X0'),event(30,'0X1'),event(40,'0X0'),event(50,'0X1'),event(60,'0X0')]}
 ];
 const times=[...new Set(series.flatMap(s=>s.events.map(e=>e.time)))].sort((a,b)=>a-b),vectors=[{name:'time',unit:'s',values:times},...series.map(s=>({name:s.name,kind:s.kind,unit:'logic',...(s.kind==='bus'?{width:s.width,bitOrder:s.bitOrder}:{}),values:times.map(t=>s.events.findLast(e=>e.time<=t).value)}))];
 return {id:'run_timing_ui',status:'completed',projectId:project.id,revision:project.revision,projectSnapshot:project,analysis:structuredClone(project.analysis),startedAt:'2026-10-24T10:00:00Z',completedAt:'2026-10-24T10:00:01Z',engine:{name:'CircuitBench digital',version:'2'},netlistHash:'a'.repeat(64),simulationHash:'b'.repeat(64),measurements:series.map((s,i)=>({id:'probe_'+i,kind:s.kind,label:s.label,vector:s.name,unit:'logic',...(s.kind==='bus'?{width:s.width,bitOrder:s.bitOrder}:{})})),result:{points:times.length,vectors,digitalEvents:series,sampling:{mode:'event-driven',timeResolution:1e-12}}};
}

const decode=s=>s.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
/** Small controlled DOM surface: exercises actual setup/read/update functions. */
function form(html){
 const fields=new Map();
 for(const [,tag,attrs] of html.matchAll(/<(input|div|span|p|button)\b([^>]*\bid="[^"]+"[^>]*)>/g)){
  const id=attrs.match(/\bid="([^"]+)"/)[1];fields.set(id,{tagName:tag.toUpperCase(),value:decode(attrs.match(/\bvalue="([^"]*)"/)?.[1]??''),hidden:/\bhidden\b/.test(attrs),disabled:/\bdisabled\b/.test(attrs),textContent:''});
 }
 for(const [,attrs,inner] of html.matchAll(/<select\b([^>]*\bid="[^"]+"[^>]*)>([\s\S]*?)<\/select>/g)){
  const id=attrs.match(/\bid="([^"]+)"/)[1],options=[...inner.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(([,a,text])=>({value:decode(a.match(/\bvalue="([^"]*)"/)?.[1]??''),selected:/\bselected\b/.test(a),textContent:decode(text)}));
  fields.set(id,{value:(options.find(o=>o.selected)??options[0])?.value??'',options,disabled:/\bdisabled\b/.test(attrs)});
 }
 return {querySelector:selector=>fields.get(selector.replace(/^#/,''))??null,field:id=>fields.get(id),fields};
}
function recordFor(run,spec){
 const result=measureTiming(run,spec),names=new Set([result.spec.source.name,result.spec.target?.name].filter(Boolean));
 return {id:'timing_ui',kind:'timing',status:'completed',projectId:run.projectId,revision:run.revision,sourceRunId:run.id,createdAt:'2026-10-24T10:00:02Z',projectSnapshot:structuredClone(run.projectSnapshot),sourceRun:{id:run.id,startedAt:run.startedAt,completedAt:run.completedAt,analysis:structuredClone(run.analysis),engine:structuredClone(run.engine),netlistHash:run.netlistHash,simulationHash:run.simulationHash},source:{timeBounds:[0,ns(60)],signals:structuredClone(run.result.digitalEvents.filter(s=>names.has(s.name))),timeResolution:1e-12,eventSource:'preserved-digital-events'},spec:result.spec,result};
}
const delaySpec={kind:'delay',source:{name:'d(clock)'},edge:'rising',target:{name:'d(output)'},targetEdge:'rising'};

test('timing setup offers five measurement kinds and individual bits with accessible labels',()=>{
 const run=fixture(),html=timingSetupHTML(run),dom=form(html),signals=getTimingSignals(run);
 assert.equal(dom.field('timing-kind').options.length,5);assert.deepEqual(dom.field('timing-kind').options.map(o=>o.textContent),Object.values(TIMING_KIND_LABELS));
 assert.equal(dom.field('timing-source').options.length,signals.length);
 for(const bit of [0,1,2]){const option=dom.field('timing-source').options.find(o=>o.textContent.includes(`Word [${bit}]`));assert.ok(option);assert.doesNotMatch(option.textContent,/ · bit /,'the bus-bit selector is labelled only once');}
 for(const id of ['timing-kind','timing-source','timing-edge','timing-target','timing-target-edge','timing-start','timing-end'])assert.ok(html.includes(`for="${id}"`),`${id} has an associated label`);
 assert.match(html,/aria-describedby="timing-window-help"/);assert.match(html,/id="timing-error"[^>]*role="alert"/);
 assert.match(html,/Only direct 0 → 1 and 1 → 0 transitions/);assert.match(html,/least-significant bit/);
});

test('setup values round-trip through engineering inputs and select the intended bus bit',()=>{
 const run=fixture(),dom=form(timingSetupHTML(run,{spec:delaySpec})),signals=getTimingSignals(run);
 dom.field('timing-source').value=String(signals.findIndex(s=>s.name==='b(word)'&&s.bit===0));
 dom.field('timing-start').value='5 ns';dom.field('timing-end').value='55n';
 const before=JSON.stringify(run),spec=readTimingSetup(dom,run),result=measureTiming(run,spec);
 assert.deepEqual(spec.source,{name:'b(word)',bit:0});assert.equal(spec.window.start,ns(5));assert.equal(spec.window.end,ns(55));
 assert.ok(result.rows.filter(r=>r.status==='measured').every(r=>Math.abs(r.value-ns(5))<1e-20));
 assert.equal(JSON.stringify(run),before,'reading a setup must not alter its captured run');
});

test('changing the measurement kind preserves the draft and excludes hidden target fields',()=>{
 const run=fixture(),dom=form(timingSetupHTML(run,{spec:delaySpec}));
 dom.field('timing-start').value='12n';dom.field('timing-end').value='59n';dom.field('timing-edge').value='falling';dom.field('timing-target').value='invalid hidden selection';
 dom.field('timing-kind').value='pulse-width';assert.equal(updateTimingSetup(dom),'pulse-width');
 assert.equal(dom.field('timing-start').value,'12n');assert.equal(dom.field('timing-end').value,'59n');assert.equal(dom.field('timing-edge').value,'falling');
 assert.equal(dom.field('timing-target-fields').hidden,true);assert.equal(dom.field('timing-target').disabled,true);assert.equal(dom.field('timing-target-edge').disabled,true);
 assert.match(dom.field('timing-edge').options[1].textContent,/Low pulse/);
 const spec=readTimingSetup(dom,run);assert.equal(spec.kind,'pulse-width');assert.equal(spec.edge,'falling');assert.equal(spec.target,undefined);
 dom.field('timing-kind').value='delay';updateTimingSetup(dom);assert.equal(dom.field('timing-target-fields').hidden,false);assert.equal(dom.field('timing-target').disabled,false);assert.match(dom.field('timing-edge').options[0].textContent,/Rising/);
});

test('malformed and out-of-range drafts remain editable with specific validation errors',()=>{
 const run=fixture(),dom=form(timingSetupHTML(run,{spec:delaySpec}));
 dom.field('timing-start').value='not a time';assert.throws(()=>readTimingSetup(dom,run),/Window start:/);assert.equal(dom.field('timing-start').value,'not a time');
 dom.field('timing-start').value='0';dom.field('timing-end').value='';assert.throws(()=>readTimingSetup(dom,run),/Window end:/);
 dom.field('timing-end').value='80n';assert.throws(()=>readTimingSetup(dom,run),/window|bound|run/i);
 dom.field('timing-end').value='50n';dom.field('timing-source').value='1junk';assert.throws(()=>readTimingSetup(dom,run),/Choose a saved digital signal/);
 dom.field('timing-source').value='999';assert.throws(()=>readTimingSetup(dom,run),/Choose a saved digital signal/);
 dom.field('timing-kind').value='setup';assert.throws(()=>readTimingSetup(dom,run),/supported timing/);
});

test('ineligible runs show actionable notices and do not offer a dead measurement action',()=>{
 for(const [run,reason] of [[null,/Run a digital/],[{...fixture(),status:'running'},/completed run/],[{...fixture(),analysis:{type:'ac'}},/transient run/],[{...fixture(),result:{vectors:[]}},/saved digital events/]]){
  const html=timingSetupHTML(run);assert.match(html,reason);assert.doesNotMatch(html,/id="timing-measure"/);
 }
});

test('result presentation retains exact edge times and separates missing rows from measured statistics',()=>{
 const run=fixture(),record=recordFor(run,{kind:'period',source:{name:'d(clock)'},edge:'rising'}),html=timingResultHTML(record,run.projectSnapshot);
 assert.equal(record.result.summary.measuredCount,2);assert.equal(record.result.summary.missingCount,1);
 assert.match(html,/2 measured · 0 indeterminate · 1 missing edge/);assert.match(html,/Summary includes the 2 measured rows/);assert.match(html,/Missing edge/);
 for(const row of record.result.rows.filter(r=>r.status==='measured')){assert.ok(html.includes(`${String(row.start)} s`));assert.ok(html.includes(`${String(row.end)} s`));assert.ok(html.includes(`${String(row.value)} s`));}
 assert.match(html,/scope="col">Start edge/);assert.match(html,/tabindex="0" role="region"/);assert.match(html,/on a 1 ps event time grid/);
});

test('duty-cycle presentation shows percent high and the retained high/cycle durations',()=>{
 const run=fixture(),record=recordFor(run,{kind:'duty-cycle',source:{name:'d(clock)'},edge:'falling'}),html=timingResultHTML(record,run.projectSnapshot);
 assert.match(html,/50 %/);assert.match(html,/percentage of the cycle spent high/);assert.match(html,/High time/);assert.match(html,/Cycle 20 ns/);
 assert.doesNotMatch(html,/50 m%/);
});

test('retained source runs expose only observed event pairs for waveform inspection',()=>{
 const run=fixture(),record=recordFor(run,{kind:'period',source:{name:'d(clock)'},edge:'rising'});
 assert.doesNotMatch(timingResultHTML(record,run.projectSnapshot),/data-timing-view-row/);
 const html=timingResultHTML(record,run.projectSnapshot,{canViewRun:true});
 const pairRows=record.result.rows.filter(row=>Number.isFinite(row.start)&&Number.isFinite(row.end));
 assert.equal((html.match(/data-timing-view-row=/g)??[]).length,pairRows.length);
 assert.match(html,/aria-label="View event pair 1 in waveforms"/);assert.match(html,/data-timing-view-row="0"/);
});

test('ambiguous signals produce no invented zero, frequency or summary value',()=>{
 const run=fixture(),record=recordFor(run,{kind:'frequency',source:{name:'b(word)',bit:1},edge:'rising'}),html=timingResultHTML(record,run.projectSnapshot);
 assert.equal(record.result.summary.measuredCount,0);assert.match(html,/No complete, unambiguous event pair/);assert.doesNotMatch(html,/class="timing-summary"/);
 assert.match(html,/class="mono timing-value">—/);assert.doesNotMatch(html,/>0 Hz/);
});

test('saved results identify stale circuit revisions, restored event checking and bounded summaries',()=>{
 const run=fixture(),record=recordFor(run,delaySpec);record.importedFromBackup=true;record.result.truncated=true;record.result.candidateCount=300;
 const before=JSON.stringify(record),html=timingResultHTML(record,{...run.projectSnapshot,revision:1});
 assert.match(html,/working circuit has changed/);assert.match(html,/checked against the saved events/);assert.match(html,/has not been simulated again/);
 assert.match(html,/of 300 candidate occurrences/);assert.match(html,/only the displayed rows/);assert.equal(JSON.stringify(record),before);
 delete record.importedFromBackup;record.sourceRun.importedFromBackup=true;record.sourceRun.warnings=['Input sampling warning retained.'];
 const sourceRestored=timingResultHTML(record,run.projectSnapshot);assert.match(sourceRestored,/source run was restored from a backup/);assert.match(sourceRestored,/Source run warning: Input sampling warning retained/);
});

test('imported titles, labels, IDs, warnings and provenance render as text',()=>{
 const run=fixture(),record=recordFor(run,delaySpec),attack='<img src=x onerror="alert(1)">';
 record.projectSnapshot.title=attack;record.source.signals[0].label=attack;record.sourceRunId=attack;record.sourceRun.engine.name=attack;record.result.warnings=[attack];record.result.rows[0].reason=attack;record.id=attack;
 const html=timingResultHTML(record,run.projectSnapshot)+timingHistoryHTML([record]);
 assert.doesNotMatch(html,/<img|<script|onerror="/);assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
 const mutated=fixture();mutated.measurements[0].label=attack;assert.doesNotMatch(timingSetupHTML(mutated),/<img|onerror="/);
});

test('history preserves immutable creation order and shows each record’s revision and kind',()=>{
 const run=fixture(),a=recordFor(run,delaySpec),b={...structuredClone(a),id:'timing_second',revision:2,spec:{...a.spec,kind:'period'}};
 const records=[a,b],before=JSON.stringify(records),html=timingHistoryHTML(records,run.projectSnapshot);
 assert.ok(html.indexOf('data-timing-history="timing_second"')<html.indexOf('data-timing-history="timing_ui"'));
 assert.match(html,/Period · revision 2/);assert.match(html,/earlier circuit/);assert.match(html,/Up to 12 measurements/);assert.equal(JSON.stringify(records),before);
 assert.equal(timingHistoryHTML([]),'');
});
