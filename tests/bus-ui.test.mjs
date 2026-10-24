import test from 'node:test';
import assert from 'node:assert/strict';
import { PlotView, getRunTraces, csvForRun, formatTraceValue, logicStateAt, isLogicTrace, isBusTrace } from '../src/plots.js';
import { SchematicEditor, wirePolyline } from '../src/editor.js';
import { newProject, addComponent, buildNets, clone, validateProject, endpointPosition } from '../src/model.js';
import { getPins, BUS_TYPES } from '../src/library.js';
import { symbolMarkup } from '../src/symbols.js';

function busRun({ id='words',width=4,times=[0,.25,.5,.75,1],words=['0000','0001','10XZ','ZZZZ','ZZZZ'],mixed=false,label='Data' }={}) {
  const bus={name:'d(data)',kind:'bus',unit:'logic',width,bitOrder:'msb-first',values:words};
  const vectors=[{name:'time',unit:'s',values:times},bus];
  const measurements=[{id:'bus',label,vector:bus.name,kind:'bus',unit:'logic',width,bitOrder:'msb-first'}];
  if(mixed){vectors.push({name:'v(out)',unit:'V',values:times.map(t=>4*t)});measurements.unshift({id:'analog',label:'Voltage',vector:'v(out)',unit:'V'});}
  return {id,analysis:{type:'tran'},projectSnapshot:{probes:mixed?[{id:'analog'}]:[]},measurements,result:{points:times.length,vectors,sampling:mixed?{mode:'event-union',analogSampleIndices:[0,times.length-1]}:{mode:'digital-events'}}};
}
function viewFor(run){const view=Object.assign(Object.create(PlotView.prototype),{run:null,resultKey:null,baseline:null,selected:new Set(),range:null,cursors:[null,null],unit:'V',render(){},draw(){}});view.setRun(run);return view;}
function harness(initial){
  let project=initial;const editor=Object.create(SchematicEditor.prototype),edits=[],messages=[],probes=[];
  Object.assign(editor,{mode:'select',selection:new Set(),preview:null,drag:null,wireDraft:null,snapTarget:null,probeAnchor:null,view:{x:0,y:0,width:800,height:600}});
  editor.callbacks={getProject:()=>project,onSelect(){},onProbe:(...args)=>probes.push(args)};
  editor.render=()=>{};editor.focus=()=>{};editor.pixelScale=()=>1;editor.status=message=>messages.push(message);
  editor.change=(mutator,label)=>{const next=clone(project);mutator(next);project=validateProject(next);edits.push(label);};
  return {editor,edits,messages,probes,get project(){return project;}};
}
function part(project,type,x,y,params={}){const component=addComponent(project,type,x,y);Object.assign(component.params,params);return component;}

test('bus values and CSV retain width, leading zeroes and every literal X/Z bit',()=>{
  const run=busRun(),before=JSON.stringify(run),trace=getRunTraces(run)[0];
  assert.ok(isLogicTrace(trace));assert.ok(isBusTrace(trace));assert.equal(trace.width,4);assert.equal(trace.bitOrder,'msb-first');
  assert.equal(formatTraceValue('0001',trace),'0001');assert.equal(formatTraceValue('10XZ',trace),'10XZ');
  assert.equal(formatTraceValue('1',trace),'—');assert.equal(formatTraceValue('10XZ','logic'),'10XZ');
  assert.equal(csvForRun(run).split('\r\n')[0],'"Time (s)","Data (4-bit logic, MSB-first)"');
  assert.equal(csvForRun(run).split('\r\n')[2],'0.25,"0001"');assert.equal(csvForRun(run).split('\r\n')[3],'0.5,"10XZ"');
  assert.equal(JSON.stringify(run),before);
});

test('malformed words, missing bit order, inconsistent measurement width and pseudo-numeric buses are not plotted',()=>{
  for(const mutate of [r=>r.result.vectors[1].values[1]='001',r=>r.result.vectors[1].values[1]='00U1',r=>r.result.vectors[1].values[1]=1,r=>r.result.vectors[1].bitOrder='lsb-first',r=>r.measurements[0].width=8]){
    const run=busRun();mutate(run);assert.deepEqual(getRunTraces(run),[]);
  }
  const run=busRun();run.measurements.push({id:'invalid-current',label:'No implicit numeric bus current',a:'d(data)',b:'0',resistance:1000,unit:'A'});
  assert.equal(getRunTraces(run).length,1);
});

test('word cursors use the exact predecessor state and Mixed keeps a bus beside the preferred analog probe',()=>{
  const run=busRun({mixed:true}),view=viewFor(run),axis=run.result.vectors[0].values,words=run.result.vectors[1].values;
  assert.equal(view.unit,'mixed');assert.equal(view.visibleTraces().length,2);
  assert.equal(logicStateAt(axis,words,-1,4),'XXXX');assert.equal(logicStateAt(axis,words,.499,4),'0001');assert.equal(logicStateAt(axis,words,.5,4),'10XZ');
  view.cursors=[.499,.5];const text=view.cursorText();assert.match(text,/Data 0001/);assert.match(text,/Data 10XZ/);assert.match(text,/Δt 1 ms/);
  const svg=view.svgContent(800,320);assert.match(svg,/data-panel="analog"/);assert.match(svg,/class="logic-lane bus-lane"/);
  assert.match(csvForRun(run),/"Analog sample origin"/);
});

test('bus timing lanes shade partial X/Z words and omit only text that cannot fit its interval',()=>{
  const run=busRun(),svg=viewFor(run).svgContent(800,300);
  assert.match(svg,/bus-state-band" data-value="10XZ"[^>]+fill="url\(#logic-unknown-hatch\)"/);
  assert.match(svg,/bus-word" data-value="ZZZZ"[^>]+stroke-dasharray="2 3"/);
  assert.match(svg,/10XZ · contains unknown X · contains high-impedance Z/);
  assert.match(svg,/>10XZ<\/text>/);
  const dense=busRun({width:8,times:[0,.4,.401,1],words:['00000000','10101010','11111111','11111111']}),narrow=viewFor(dense).svgContent(350,220);
  assert.equal((narrow.match(/class="bus-word"/g)??[]).length,3);
  assert.match(narrow,/class="bus-value" data-value="00000000"/);assert.match(narrow,/class="bus-value" data-value="11111111"/);
  assert.ok(!narrow.includes('class="bus-value" data-value="10101010"'),'a 0.235 px interval cannot fit an eight-bit text label');
  assert.match(narrow,/<title>Data \[7:0\]: 10101010<\/title>/,'the narrow interval still retains its complete value');
  assert.ok(!/NaN|Infinity/.test(narrow));
});

test('dense bus transitions survive zoom and export without signal decimation',()=>{
  const times=Array.from({length:2001},(_,i)=>i/2000),words=times.map((_,i)=>(i%16).toString(2).padStart(4,'0')),view=viewFor(busRun({times,words,label:'Counter <8> output'}));
  assert.equal((view.svgContent(800,300).match(/class="bus-word"/g)??[]).length,2001);
  view.range=[.00025,.00125];const clipped=view.svgContent(800,300);
  assert.equal((clipped.match(/class="bus-word"/g)??[]).length,3);assert.match(clipped,/data-value="0000" data-baseline="false" d="M100 /);
  const geometry=view.geometry,svg=view.getSVG();assert.equal(view.geometry,geometry);assert.ok(!svg.includes('var('));
  assert.match(svg,/Counter &lt;8&gt; output \(4-bit logic \[3:0\]\)/);assert.match(svg,/Bus words are MSB first, with bit 0 at right/);
});

test('bus baseline matching rejects width changes and uses compatible baseline event times independently',()=>{
  const run=busRun({times:[0,.25,1],words:['0000','0001','0001']}),view=viewFor(run);
  view.setRun(run,busRun({id:'wide-baseline',width:8,times:[0,.5,1],words:['00000000','00000001','00000001']}));
  assert.equal(view.baseline,null);assert.match(view.comparisonNote,/width/);assert.ok(!view.svgContent(800,300).includes('data-baseline="true"'));
  view.setRun(run,busRun({id:'matching-baseline',times:[0,.5,1],words:['0000','0001','0001']}));
  const svg=view.svgContent(800,300);assert.match(svg,/data-value="0000" data-baseline="true" d="[^"]+H438\.5L442\.5 /);assert.match(svg,/data-value="0000" data-baseline="false" d="[^"]+H267\.25L271\.25 /);
});

test('width guards reject direct bus-to-scalar and unequal bus joins while explicit slice/join paths remain usable',()=>{
  const project=newProject('Bus wiring'),input=part(project,'BUSIN',0,100,{width:'8',value:'0xA5'}),slice=part(project,'SLICE',200,100,{width:'8',lsb:'4',count:'4'}),join=part(project,'JOIN',400,100,{aWidth:'4',bWidth:'4'}),reg=part(project,'REGISTER',600,100,{width:'8'}),scalar=part(project,'NOT',200,300),f=harness(project);
  f.editor.mode='wire';f.editor.activateWireEndpoint(`${input.id}:out`);const before=JSON.stringify(f.project);
  f.editor.activateWireEndpoint(`${scalar.id}:in`);assert.equal(JSON.stringify(f.project),before);assert.equal(f.editor.wireDraft.start,`${input.id}:out`);assert.match(f.messages.at(-1),/widths must match/);
  f.editor.activateWireEndpoint(`${slice.id}:in`);assert.equal(f.editor.wireDraft,null);
  assert.ok(f.editor.connectEndpoints(`${slice.id}:out`,`${join.id}:a`));assert.ok(f.editor.connectEndpoints(`${join.id}:out`,`${reg.id}:d`));
  assert.equal(f.editor.connectEndpoints(`${input.id}:out`,`${join.id}:b`),null);
  assert.ok(!buildNets(f.project).diagnostics.some(d=>d.code==='NET_WIDTH_CONFLICT'));
  f.editor.measure(`${reg.id}:q`,false);assert.deepEqual(f.probes.at(-1),[`${reg.id}:q`]);assert.match(f.messages.at(-1),/8-bit bus probe/);
});

function crossedWidths(){const project=newProject('Width crossing'),a=part(project,'BUSIN',0,100,{width:'4'}),b=part(project,'SLICE',200,100,{width:'4'}),c=part(project,'BUSIN',100,0,{width:'8'}),d=part(project,'SLICE',100,200,{width:'8'});project.layout.components[c.id].rotation=project.layout.components[d.id].rotation=90;project.circuit.connections=[{id:'four',a:`${a.id}:out`,b:`${b.id}:in`},{id:'eight',a:`${c.id}:out`,b:`${d.id}:in`}];project.layout.wires={four:{points:[]},eight:{points:[]}};return {project,a,b,c,d};}
test('junctions and equal labels cannot silently resize a bus',()=>{
  const {project,a,c}=crossedWidths(),f=harness(project),before=JSON.stringify(project);
  assert.deepEqual(wirePolyline(project,project.circuit.connections[0]),[{x:40,y:100},{x:160,y:100}]);
  assert.equal(f.editor.addJunctionAt(100,100),null);assert.equal(JSON.stringify(f.project),before);assert.match(f.messages.at(-1),/junction cannot resize/);
  const junction=f.editor.addJunctionAt(100,100,'four');assert.ok(junction);assert.equal(f.editor.addJunctionAt(100,100,'eight'),null);
  f.project.circuit.labels.push({id:'word-label',name:'WORD',target:`${a.id}:out`});
  assert.equal(f.editor.labelAllowed(`${c.id}:out`,'word'),false);assert.match(f.messages.at(-1),/different digital widths/);
});

test('new fixed-port symbols render resolved widths, accessible bus pins and literal export colors through transforms',()=>{
  const project=newProject('Bus symbols');for(const [i,type] of BUS_TYPES.entries())part(project,type,(i%4)*220,Math.floor(i/4)*200);
  const input=project.circuit.components.find(c=>c.type==='BUSIN'),slice=project.circuit.components.find(c=>c.type==='SLICE');
  input.params.width=slice.params.width='8';const f=harness(project);f.editor.connectEndpoints(`${input.id}:out`,`${slice.id}:in`);
  f.editor.select([input.id,slice.id]);const before=clone(f.project.circuit);f.editor.rotate();f.editor.mirror();assert.deepEqual(f.project.circuit,before);
  const markup=f.editor.renderComponents(f.project,buildNets(f.project).endpointToNet);
  for(const c of f.project.circuit.components)for(const pin of getPins(c)){assert.ok(markup.includes(`data-endpoint="${c.id}:${pin.id}"`));if(pin.width>1)assert.ok(markup.includes(`${pin.width}-bit digital`));}
  const pin=endpointPosition(f.project,`${input.id}:out`);assert.ok(markup.includes(`class="pin pin-digital pin-bus" x="${pin.x-4.8}" y="${pin.y-4.8}"`));
  assert.match(markup,/class="pin-width"[^>]+>\[7:0\]<\/text>/);
  assert.match(symbolMarkup('SLICE',{lsb:'2',count:'2'}),/>3:2<\/text>/);assert.match(symbolMarkup('JOIN'),/>B:A<\/text>/);
  const svg=f.editor.exportSVG();assert.ok(!svg.includes('var('));assert.match(svg,/wire wire-digital wire-bus/);assert.match(svg,/class="bus-width-marker"/);assert.match(svg,/\.wire-bus\{stroke-width:3\.6\}/);
});

test('an imported width conflict remains visible and cannot produce a misleading probe',()=>{
  const {project,a}=crossedWidths();project.circuit.components.find(c=>c.id===a.id).params.width='8';
  const f=harness(project),svg=f.editor.exportSVG();assert.match(svg,/wire-width-conflict/);assert.match(svg,/with conflicting widths/);
  f.editor.measure(`${a.id}:out`,false);assert.equal(f.probes.length,0);assert.match(f.messages.at(-1),/conflicting bit widths/);
});
