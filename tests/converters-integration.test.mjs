/** Authored schematic/compiler boundaries, distinct from converter arithmetic
 * unit tests. The numerical fixture uses two different nonzero references. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,addComponent,uid,validateProject,setComponentParams,canConnect} from '../src/model.js';
import {getPins} from '../src/library.js';
import {generateNetlist,compileSimulation} from '../src/netlist.js';
import {compileCoordinated,createCoordinatedSession} from '../src/coordinated.js';
import {safeEnvelope} from '../src/storage.js';
import {EXAMPLES} from '../src/examples.js';

const clone=structuredClone;
const errors=generated=>generated.diagnostics.filter(d=>d.severity==='error');
const endpoint=(component,pin)=>`${component.id}:${pin}`;
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-11,`${actual} != ${expected}`);
function fixture(){
 const p=newProject('Differential converter integration');Object.assign(p.analysis,{type:'tran',solver:'coordinated',duration:'10u',step:'1u',uic:false});
 const add=(type,params={})=>{const c=addComponent(p,type);Object.assign(c.params,params);return c;};
 const input=add('V',{dc:'3.1',ac:'0'}),adcReference=add('V',{dc:'2.1',ac:'0'}),dacReference=add('V',{dc:'-0.75',ac:'0'}),adc=add('ADCBUS',{width:'4',vmin:'0',vmax:'3',period:'20u',delay:'2u'}),dac=add('DACBUS',{width:'4',low:'-1',high:'5',rise:'1u',fall:'1u',initial:'0x0'}),load=add('R',{value:'2k'}),ground=add('GND');
 const wire=(a,pa,b,pb)=>{const id=uid('wire');p.circuit.connections.push({id,a:endpoint(a,pa),b:endpoint(b,pb)});p.layout.wires[id]={points:[]};};
 for(const source of[input,adcReference,dacReference])wire(source,'n',ground,'0');
 wire(input,'p',adc,'p');wire(adcReference,'p',adc,'n');wire(dacReference,'p',dac,'n');wire(adc,'q',dac,'d');wire(dac,'p',load,'1');wire(dac,'n',load,'2');
 for(const[c,pin,name]of[[input,'p','input'],[adcReference,'p','adc_ref'],[dacReference,'p','dac_ref'],[adc,'q','code'],[dac,'p','output']])p.circuit.labels.push({id:uid('label'),target:endpoint(c,pin),name});
 return{project:p,input,adcReference,dacReference,adc,dac,load,ground};
}
function execute(project){
 project=validateProject(project);const generated=generateNetlist(project);assert.deepEqual(errors(generated),[]);
 const plan=compileCoordinated(project,generated),result=createCoordinatedSession(plan).advanceTo(plan.duration,{maxSteps:20000});assert.equal(result.done,true);
 const run={id:'run_converter_integration',projectId:project.id,revision:project.revision,projectSnapshot:clone(project),analysis:clone(project.analysis),status:'completed-with-warnings',startedAt:'2020-01-01T00:00:00.000Z',completedAt:'2020-01-01T00:00:01.000Z',netlist:generated.netlist,netlistHash:'a'.repeat(64),simulationHash:'b'.repeat(64),coordinatedPlan:plan,simulation:generated.simulation,models:generated.modelManifest,measurements:generated.measurements,diagnostics:generated.diagnostics,engine:result.engine,logs:result.logs,result};
 return{project,generated,plan,result,run,envelope:{project,runs:[run],activeRunId:run.id}};
}

test('converter ports retain scalar analog terminals and exact 2–8 bit digital widths',()=>{
 for(let width=2;width<=8;width++)for(const[type,digitalPin,analogPins]of[['ADCBUS','q',['p','n']],['DACBUS','d',['p','n']]]){
  const p=newProject(),c=addComponent(p,type);c.params.width=String(width);const restored=validateProject(JSON.parse(JSON.stringify(p))),pins=getPins(restored.circuit.components[0]);
  assert.equal(pins.find(pin=>pin.id===digitalPin).domain,'digital');assert.equal(pins.find(pin=>pin.id===digitalPin).width,width);
  for(const id of analogPins){assert.equal(pins.find(pin=>pin.id===id).domain,'analog');assert.equal(pins.find(pin=>pin.id===id).width,1);}
 }
 for(const type of['ADCBUS','DACBUS'])for(const width of['0','1','9','2.5','4x']){const p=newProject();addComponent(p,type).params.width=width;assert.throws(()=>validateProject(p),/Converter width/);}
});

test('converter wiring rejects domain crossing and leaves incompatible width edits unchanged',()=>{
 const {project,adc,dac}=fixture(),before=clone(project);
 assert.equal(canConnect(project,endpoint(adc,'q'),endpoint(dac,'p')).ok,false);
 assert.throws(()=>setComponentParams(project,adc.id,{width:'8'}),/width conflicts/);assert.deepEqual(project,before);
 adc.params.width='8';assert.ok(errors(generateNetlist(project)).some(d=>d.code==='NET_WIDTH_CONFLICT'));
});

test('authored converter circuit preserves differential polarity, word order and DAC reference offset',()=>{
 const {project}=fixture(),{generated,plan,result}=execute(project),value=name=>result.vectors.find(v=>v.name===name).values;
 assert.equal(plan.adcs[0].input,'input');assert.equal(plan.adcs[0].reference,'adc_ref');assert.equal(plan.dacs[0].p,'output');assert.equal(plan.dacs[0].n,'dac_ref');
 assert.deepEqual(plan.adcs[0].outputs,plan.dacs[0].inputs);assert.deepEqual(plan.adcs[0].outputs,generated.simulation.adcs[0].outputs);
 assert.equal(value('b(code)')[0],'XXXX');assert.equal(value('b(code)').at(-1),'0101');
 // 3.1 − 2.1 V produces code 5. The configured DAC produces +1 V
 // relative to its separate −0.75 V reference, so the output is +0.25 V.
 close(value('v(output)')[0],-1.75);close(value('v(output)').at(-1),.25);
 close(value('i(v1)').at(-1),0);close(value('i(v2)').at(-1),0);
 close(value(`i(${plan.dacs[0].sourceName.toLowerCase()})`).at(-1),-.0005);
 assert.match(generated.netlist,/V_CB_DACB1 output dac_ref DC -1\.000000000000e\+0/);
});

test('generated DAC voltage-source names cannot collide with authored source references',()=>{
 const {project,input}=fixture();input.ref='V_CB_DACB1';const {generated,plan,result}=execute(project);
 assert.equal(generated.simulation.dacs[0].sourceName,'V_CB_DACB1_1');assert.equal(plan.dacs[0].sourceName,'V_CB_DACB1_1');
 assert.equal(result.vectors.filter(v=>v.name==='i(v_cb_dacb1)').length,1);assert.equal(result.vectors.filter(v=>v.name==='i(v_cb_dacb1_1)').length,1);
 close(result.vectors.find(v=>v.name==='v(output)').values.at(-1),.25);
});

test('converter execution preflight rejects unsupported modes, invalid units and unknown startup codes',()=>{
 const mutations=[f=>f.project.analysis.solver='ngspice',f=>f.project.analysis.type='ac',f=>f.adc.params.vmin='3',f=>f.adc.params.period='20V',f=>f.adc.params.delay='0',f=>f.adc.params.delay='20u',f=>f.dac.params.low='5',f=>f.dac.params.rise='0',f=>f.dac.params.initial='01X0',f=>f.dac.params.initial='ZZZZ',f=>f.dac.params.initial='0x10'];
 for(const mutate of mutations){const f=fixture();mutate(f);assert.ok(errors(generateNetlist(f.project)).length>0,String(mutate));}
});

test('ADC conversion delay remains shorter than its sample period after 1 ps rounding',()=>{
 const {project,adc}=fixture();Object.assign(project.analysis,{step:'1p',duration:'20p'});Object.assign(adc.params,{period:'1.4p',delay:'1.1p'});
 const found=errors(generateNetlist(project));assert.ok(found.some(d=>/delay|period|grid|tick/i.test(d.message)),JSON.stringify(found));
 const valid=fixture(),generated=generateNetlist(valid.project),plan=compileCoordinated(valid.project,generated);
 for(const[period,delay]of[[1.4e-12,1.1e-12],[2e-12,0],[2e-12,2e-12],[2e-12,3e-12]]){const malformed=clone(plan);Object.assign(malformed.adcs[0],{period,delay});assert.throws(()=>createCoordinatedSession(malformed),/delay|period|timeline/i);}
});

test('compiler boundaries never turn a partially unknown DAC startup word into a numeric code',()=>{
 for(const initial of['01X0','0XX1','XXXX']){
  const {project,dac}=fixture();dac.params.initial=initial;
  assert.throws(()=>compileSimulation(project),/known|startup|binary|code|word/i);
  assert.throws(()=>compileCoordinated(project),/known|startup|binary|code|word/i);
 }
});

test('converter backup round trips preserve initial X, complete bus events and executable input identity',()=>{
 const f=execute(fixture().project),first=safeEnvelope(JSON.parse(JSON.stringify(f.envelope)),validateProject),second=safeEnvelope(JSON.parse(JSON.stringify(first)),validateProject),run=second.runs[0];
 assert.deepEqual(run.projectSnapshot,f.project);assert.deepEqual(run.coordinatedPlan,f.plan);assert.deepEqual(run.simulation,f.generated.simulation);
 assert.deepEqual(run.result.digitalEvents,f.result.digitalEvents);assert.deepEqual(run.result.vectors,f.result.vectors);assert.deepEqual(run.models,f.generated.modelManifest);
 assert.equal(run.result.vectors.find(v=>v.name==='b(code)').values[0],'XXXX');assert.equal(run.result.vectors.find(v=>v.name==='b(code)').width,4);
 for(const mutate of[r=>r.result.vectors.find(v=>v.name==='b(code)').width=8,r=>r.result.digitalEvents.find(v=>v.name==='b(code)').width=8,r=>r.result.vectors.find(v=>v.name==='b(code)').bitOrder='lsb-first']){const changed=clone(f.envelope);mutate(changed.runs[0]);assert.throws(()=>safeEnvelope(changed,validateProject),/width|states|bit order|MSB/i);}
});

test('legacy analog project backups retain their original default solver',()=>{
 const project=EXAMPLES.find(e=>e.id==='divider').create();delete project.analysis.solver;
 const restored=safeEnvelope(JSON.parse(JSON.stringify({project,runs:[]})),validateProject);assert.equal(restored.project.analysis.solver,'ngspice');assert.deepEqual(restored.project.circuit,project.circuit);
});
