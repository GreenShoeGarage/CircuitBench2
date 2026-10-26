import test from 'node:test';
import assert from 'node:assert/strict';
import {LIBRARY,MODELS,DIGITAL_TYPES,DIGITAL_MODEL_VERSION,BUS_MODEL_VERSION,DISPLAY_MODEL_VERSION,CONVERTER_MODEL_VERSION,LOGIC_IO_MODEL_VERSION,getPart,parseValue} from '../src/library.js';
import {newProject,addComponent,uid,clone,buildNets,checkCircuit,canConnect,getEndpointDomain,validateProject,serializeProject,parseProject,duplicateItems,removeItems} from '../src/model.js';
import {generateNetlist,compileSimulation,validateImportedNetlist} from '../src/netlist.js';
import {EXAMPLES} from '../src/examples.js';

const endpoint=(c,p)=>`${c.id}:${p}`;
const errors=diagnostics=>diagnostics.filter(d=>d.severity==='error');
const example=id=>EXAMPLES.find(e=>e.id===id).create();
const wire=(p,a,b)=>{const id=uid('w');p.circuit.connections.push({id,a,b});p.layout.wires[id]={points:[]};return id;};
const label=(p,name,target)=>p.circuit.labels.push({id:uid('label'),name,target});
const part=(p,type,params={})=>{const c=addComponent(p,type);Object.assign(c.params,params);return c;};
function logic(){const p=newProject();p.analysis.type='tran';p.analysis.duration='1u';p.analysis.step='10n';const input=part(p,'DIN',{state:'1'}),gate=part(p,'NOT');wire(p,endpoint(input,'out'),endpoint(gate,'in'));label(p,'input',endpoint(input,'out'));label(p,'output',endpoint(gate,'out'));return{p,input,gate};}
function bridgeFixture(){const p=newProject();Object.assign(p.analysis,{type:'tran',duration:'1m',step:'1u'});const voltage=part(p,'V'),ground=part(p,'GND'),adc=part(p,'ADC');wire(p,endpoint(voltage,'p'),endpoint(adc,'in'));wire(p,endpoint(voltage,'n'),endpoint(ground,'0'));wire(p,endpoint(adc,'ref'),endpoint(ground,'0'));label(p,'analog_in',endpoint(voltage,'p'));label(p,'bit',endpoint(adc,'out'));return{p,voltage,ground,adc};}

test('library exposes separate trusted domains and complete native model provenance',()=>{
 assert.equal(LIBRARY.length,43);assert.equal(DIGITAL_TYPES.length,29);
 assert.equal(Object.keys(MODELS).length,37);
 for(const d of LIBRARY){for(const pin of d.pins){assert.ok(['analog','digital'].includes(pin.domain));assert.ok(['input','output','passive'].includes(pin.direction));}if(DIGITAL_TYPES.includes(d.type)){const m=MODELS[d.model];assert.ok([DIGITAL_MODEL_VERSION,BUS_MODEL_VERSION,DISPLAY_MODEL_VERSION,CONVERTER_MODEL_VERSION,LOGIC_IO_MODEL_VERSION].includes(m.version));assert.equal(m.license,'MIT');assert.ok(['digital','bridge'].includes(m.kind));const definition=JSON.parse(m.definition);assert.equal(definition.type,d.type);assert.deepEqual(definition.ports,d.pins.map(({id,domain,direction})=>({id,domain,direction})));}}
 assert.deepEqual(getPart('R').pins.map(p=>p.id),['1','2']);
 assert.deepEqual(getPart('DFF').pins.map(p=>p.id),['d','clk','q']);
 assert.deepEqual(getPart('ADC').pins.map(p=>p.domain),['analog','analog','digital']);
 assert.deepEqual(getPart('DAC').pins.map(p=>p.domain),['digital','analog','analog']);
});

test('schema1 analog projects retain their original version, graph, layout and null simulation',()=>{
 const p=example('rc-filter');p.appVersion='1.0.0-rc.1';const before=clone(p),saved=parseProject(serializeProject(p));
 assert.deepEqual(saved,before);assert.equal(saved.schemaVersion,1);assert.equal(generateNetlist(saved).simulation,null);
 const imported=newProject();imported.workspace='netlist';imported.analysis.type='op';imported.netlistText='Legacy\nV1 out 0 1\nR1 out 0 1k\n.op\n.end';assert.equal(generateNetlist(imported).simulation,null);
});

test('native examples round trip all typed probes, state and bridge parameters',()=>{
 let count=0;for(const e of EXAMPLES){const p=e.create(),generated=generateNetlist(p);if(!generated.simulation)continue;count++;assert.deepEqual(parseProject(serializeProject(p)),p,e.id);assert.deepEqual(errors(generated.diagnostics),[],e.id);assert.ok(generated.modelManifest.some(m=>[DIGITAL_MODEL_VERSION,BUS_MODEL_VERSION,DISPLAY_MODEL_VERSION,CONVERTER_MODEL_VERSION,LOGIC_IO_MODEL_VERSION].includes(m.version)),e.id);for(const q of p.probes.filter(q=>q.kind==='logic')){const m=generated.measurements.find(m=>m.id===q.id);assert.equal(m.unit,'logic');assert.match(m.vector,/^[db]\(.+\)$/);if(m.kind==='bus'){assert.ok(m.width>=2&&m.width<=8);assert.equal(m.bitOrder,'msb-first');}}}
 assert.equal(count,25);
});

test('pure logic needs no ground and exposed unused outputs are valid measurements',()=>{
 const {p}=logic();const generated=generateNetlist(p);assert.deepEqual(errors(generated.diagnostics),[]);assert.equal(generated.simulation.mode,'digital');assert.equal(buildNets(p).nets.every(n=>n.domain==='digital'),true);assert.ok(generated.measurements.some(m=>m.vector==='d(output)'));
});

test('connection helpers prevent cross-domain wires and inherit junction domains',()=>{
 const {p,input}=logic(),r=part(p,'R'),j=uid('j');p.circuit.junctions.push({id:j});p.layout.junctions[j]={x:0,y:0};
 assert.equal(getEndpointDomain(p,`j:${j}`),null);assert.equal(canConnect(p,endpoint(input,'out'),`j:${j}`).ok,true);wire(p,endpoint(input,'out'),`j:${j}`);
 assert.equal(getEndpointDomain(p,`j:${j}`),'digital');assert.equal(canConnect(p,`j:${j}`,endpoint(r,'1')).ok,false);assert.equal(canConnect(p,'missing:out',endpoint(r,'1')).ok,false);assert.equal(canConnect(p,`j:${j}`,`j:${j}`).ok,false);
});

test('direct wires, equal labels and transitive junctions cannot convert domains',()=>{
 for(const mode of ['wire','label','junction']){const {p,input}=logic(),r=part(p,'R');if(mode==='wire')wire(p,endpoint(input,'out'),endpoint(r,'1'));if(mode==='label'){label(p,'bridge_attempt',endpoint(input,'out'));label(p,'BRIDGE_ATTEMPT',endpoint(r,'1'));}if(mode==='junction'){const j=uid('j');p.circuit.junctions.push({id:j});p.layout.junctions[j]={x:0,y:0};wire(p,endpoint(input,'out'),`j:${j}`);wire(p,endpoint(r,'1'),`j:${j}`);}assert.ok(errors(checkCircuit(p)).some(d=>d.code==='NET_DOMAIN_CONFLICT'),mode);assert.doesNotThrow(()=>validateProject(p),'Invalid electrical graph remains editable rather than being silently rewired');}
});

test('digital ground symbols and the special zero label are domain errors',()=>{
 for(const mode of ['ground','label']){const{p,input}=logic();if(mode==='ground'){const g=part(p,'GND');wire(p,endpoint(input,'out'),endpoint(g,'0'));}else label(p,'0',endpoint(input,'out'));assert.ok(errors(checkCircuit(p)).some(d=>d.code==='NET_DOMAIN_CONFLICT'));}
});

test('drawing crossings across domains never create an electrical join',()=>{
 const{p,input,gate}=logic(),r=part(p,'R'),s=part(p,'R');const w=wire(p,endpoint(r,'2'),endpoint(s,'1'));p.layout.wires[w].points=[{x:40,y:40}];p.layout.wires[p.circuit.connections[0].id].points=[{x:40,y:40}];const nets=buildNets(p);assert.notEqual(nets.endpointToNet[endpoint(input,'out')],nets.endpointToNet[endpoint(r,'2')]);assert.equal(getEndpointDomain(p,endpoint(gate,'in')),'digital');assert.deepEqual(errors(nets.diagnostics),[]);
});

test('ADC observer ports neither join their nodes nor provide a ground return',()=>{
 const{p,voltage,ground,adc}=bridgeFixture();assert.deepEqual(errors(checkCircuit(p)),[]);assert.notEqual(buildNets(p).endpointToNet[endpoint(adc,'in')],buildNets(p).endpointToNet[endpoint(adc,'ref')]);
 const returnWire=p.circuit.connections.find(w=>w.a===endpoint(voltage,'n')&&w.b===endpoint(ground,'0'));removeItems(p,[returnWire.id]);label(p,'floating_return',endpoint(voltage,'n'));assert.ok(errors(checkCircuit(p)).some(d=>/island without a ground/.test(d.message)));
});

test('undriven inputs fail, while explicit X/Z and deliberate contention remain representable',()=>{
 const{p,input}=logic();removeItems(p,[input.id]);assert.ok(errors(checkCircuit(p)).some(d=>/no driver/.test(d.message)));
 for(const state of ['X','Z']){const q=logic();q.input.params.state=state;assert.deepEqual(errors(checkCircuit(q.p)),[]);assert.equal(compileSimulation(q.p).digital.sources[0].value,state);}
 const bus=example('tri-state-bus'),ds=checkCircuit(bus);assert.deepEqual(errors(ds),[]);assert.ok(ds.some(d=>d.severity==='warning'&&/drivers/.test(d.message)));
});

test('combinational cycles fail while a DFF breaks the dependency cycle',()=>{
 const{p,input,gate}=logic();removeItems(p,[input.id]);wire(p,endpoint(gate,'out'),endpoint(gate,'in'));assert.ok(errors(checkCircuit(p)).some(d=>d.code==='DIGITAL_COMBINATIONAL_CYCLE'));assert.deepEqual(errors(checkCircuit(example('dff-divider'))),[]);
});

test('mixed input and output blocks may share only ground without becoming feedback',()=>{
 const p=example('mixed-chain');assert.deepEqual(errors(checkCircuit(p)),[]);const plan=compileSimulation(p);assert.equal(plan.mode,'mixed');assert.equal(plan.adcs[0].mode,'schmitt');assert.equal(plan.adcs[0].referenceVector,'0');assert.equal(plan.dacs.length,1);
});

test('DAC-to-ADC conductive or control dependencies are conservatively rejected',()=>{
 for(const type of ['R','C','SW']){const p=example('mixed-chain'),adc=p.circuit.components.find(c=>c.type==='ADC'),dac=p.circuit.components.find(c=>c.type==='DAC'),c=part(p,type);wire(p,endpoint(dac,'out'),endpoint(c,type==='SW'?'cp':'1'));wire(p,endpoint(adc,'in'),endpoint(c,type==='SW'?'a':'2'));assert.ok(errors(checkCircuit(p)).some(d=>d.code==='MIXED_ANALOG_FEEDBACK'),type);}
 const p=example('mixed-chain'),adc=p.circuit.components.find(c=>c.type==='ADC'),dac=p.circuit.components.find(c=>c.type==='DAC');removeItems(p,p.circuit.connections.filter(w=>w.a===endpoint(adc,'ref')||w.b===endpoint(adc,'ref')).map(w=>w.id));wire(p,endpoint(dac,'out'),endpoint(adc,'ref'));assert.ok(errors(checkCircuit(p)).some(d=>d.code==='MIXED_ANALOG_FEEDBACK'),'Differential ADC reference is also an input');
});

test('digital and mixed analyses reject AC/DC/op and UIC',()=>{
 for(const id of ['digital-half-adder','mixed-chain']){for(const type of ['op','dc','ac']){const p=example(id);p.analysis.type=type;assert.ok(errors(generateNetlist(p).diagnostics).some(d=>/transient analysis only/.test(d.message)),`${id}:${type}`);}const p=example(id);p.analysis.uic=true;assert.ok(errors(checkCircuit(p)).some(d=>/normal t=0/.test(d.message)));}
});

test('digital timing enforces minimum resolution, safe integer range and event budget',()=>{
 const variants=[['period','1p'],['period','1T'],['duty','0'],['duty','100%'],['delay','-1p'],['delay','1T']];
 for(const[key,value]of variants){const p=example('digital-half-adder');p.circuit.components.find(c=>c.type==='CLOCK').params[key]=value;assert.ok(errors(checkCircuit(p)).length,`${key}=${value}`);}
 for(const value of ['0','0.1p','1T']){const{p,gate}=logic();gate.params.delay=value;assert.ok(errors(checkCircuit(p)).some(d=>/propagation delay/.test(d.message)),value);}
 for(const value of ['0.1p','1T']){const p=example('clock-dac-rc');p.circuit.components.find(c=>c.type==='DAC').params.rise=value;assert.ok(errors(checkCircuit(p)).some(d=>/rise time/.test(d.message)),value);}
 const p=example('digital-half-adder');p.analysis.duration='0.1p';assert.ok(errors(checkCircuit(p)).some(d=>/duration/.test(d.message)));p.analysis.duration='1m';p.circuit.components.find(c=>c.type==='CLOCK').params.period='1n';assert.ok(errors(checkCircuit(p)).some(d=>/200,000-event/.test(d.message)));
});

test('clock percent storage compiles to fractional duty with no highWidth field',()=>{
 assert.equal(parseValue('25%','%'),25);const p=example('digital-half-adder'),clock=p.circuit.components.find(c=>c.type==='CLOCK');clock.params.duty='25%';const source=compileSimulation(p).digital.sources.find(s=>s.id===clock.id);assert.equal(source.duty,.25);assert.equal(source.period,.002);assert.equal('highWidth'in source,false);assert.deepEqual(errors(checkCircuit(p)),[]);
});

test('invalid state/mode selections and swapped model bindings fail before execution',()=>{
 for(const[type,key,value,id]of [['DIN','state','2','logic-gates'],['DFF','initial','Z','dff-divider'],['ADC','mode','auto','adc-ramp']]){const p=example(id),c=p.circuit.components.find(c=>c.type===type);c.params[key]=value;assert.throws(()=>validateProject(p),/unsupported/);assert.ok(errors(checkCircuit(p)).some(d=>/must be one of/.test(d.message)));}
 const{p,gate}=logic();gate.model='CB_DIODE';assert.ok(errors(checkCircuit(p)).some(d=>/not compatible/.test(d.message)));gate.model='MISSING';assert.ok(errors(checkCircuit(p)).some(d=>/unavailable/.test(d.message)));
});

test('logic and voltage probes cannot silently cross domains',()=>{
 const{p,input}=logic();p.probes.push({id:uid('q'),kind:'voltage',a:endpoint(input,'out'),b:null,label:'Wrong voltage'});assert.ok(errors(checkCircuit(p)).some(d=>/voltage measurements require analog/i.test(d.message)));
 const q=example('adc-ramp'),v=q.circuit.components.find(c=>c.type==='V');q.probes.push({id:uid('q'),kind:'logic',a:endpoint(v,'p'),b:null,label:'Wrong logic'});assert.ok(errors(checkCircuit(q)).some(d=>/logic probe must target a digital/.test(d.message)));
});

test('compiler binds DFF and tri-state input order and differential ADC references explicitly',()=>{
 for(const[id,type,pins]of [['dff-divider','DFF',['d','clk']],['tri-state-bus','TRI',['in','en']]]){const p=example(id),net=buildNets(p),plan=compileSimulation(p);for(const c of p.circuit.components.filter(c=>c.type===type))assert.deepEqual(plan.digital.gates.find(g=>g.id===c.id).inputs,pins.map(pin=>net.endpointToNet[endpoint(c,pin)]));}
 const{p,adc,ground}=bridgeFixture(),reference=part(p,'V',{dc:'0.5'});removeItems(p,p.circuit.connections.filter(w=>w.a===endpoint(adc,'ref')||w.b===endpoint(adc,'ref')).map(w=>w.id));wire(p,endpoint(reference,'p'),endpoint(adc,'ref'));wire(p,endpoint(reference,'n'),endpoint(ground,'0'));label(p,'reference',endpoint(reference,'p'));assert.equal(compileSimulation(p).adcs[0].referenceVector,'v(reference)');assert.deepEqual(errors(checkCircuit(p)),[]);
});

test('DAC internal source names are collision-safe and waveform regeneration is nonmutating',()=>{
 const p=example('clock-dac-rc'),dac=p.circuit.components.find(c=>c.type==='DAC'),ground=p.circuit.components.find(c=>c.type==='GND'),v=part(p,'V');v.ref='V_CB_'+dac.ref;wire(p,endpoint(v,'n'),endpoint(ground,'0'));label(p,'extra_source',endpoint(v,'p'));const snapshot=clone(p),plan=compileSimulation(p),d=plan.dacs[0];assert.notEqual(d.sourceName.toLowerCase(),v.ref.toLowerCase());
 const result=generateNetlist(p,{dacWaveforms:{[dac.id]:[[0,0],[.001,5],[.004,5]]}});assert.deepEqual(errors(result.diagnostics),[]);assert.match(result.netlist,new RegExp(`${d.sourceName} dac 0 PWL\\(`));assert.match(result.netlist,/1\.000000000000e-3 5\.000000000000e\+0/);assert.deepEqual(p,snapshot);
});

test('DAC waveform validation rejects missing, partial, unknown, out-of-range and unordered replay',()=>{
 const p=example('clock-dac-rc'),dac=p.circuit.components.find(c=>c.type==='DAC');
 for(const wave of [undefined,[],[[.001,0]],[[0,0],[0,5]],[[0,6]],[[0,0],[.005,5]],[[0,NaN]],[[0,'0']]])assert.ok(errors(generateNetlist(p,{dacWaveforms:{[dac.id]:wave}}).diagnostics).some(d=>/DAC replay/.test(d.message)),String(wave));
 assert.ok(errors(generateNetlist(p,{dacWaveforms:{unknown:[[0,0]]}}).diagnostics).some(d=>/unknown component/.test(d.message)));assert.ok(errors(generateNetlist(p,{dacWaveforms:null}).diagnostics).some(d=>/object keyed/.test(d.message)));
 const other=part(p,'DAC');assert.ok(errors(generateNetlist(p,{dacWaveforms:{[dac.id]:[[0,0]]}}).diagnostics).some(d=>/every DAC waveform/.test(d.message)));assert.notEqual(other.id,dac.id);
});

test('digital duplication and deletion retain safe endpoints and grouped labels',()=>{
 const{p,input,gate}=logic();p.probes.push({id:uid('q'),kind:'logic',a:endpoint(gate,'out'),b:null,label:'Result'});label(p,'input',endpoint(gate,'in'));const ids=duplicateItems(p,[input.id,gate.id,...p.circuit.labels.map(l=>l.id)]),copied=p.circuit.components.filter(c=>ids.includes(c.id));assert.equal(copied.length,2);assert.doesNotThrow(()=>validateProject(p));assert.deepEqual(errors(checkCircuit(p)),[]);const net=buildNets(p);assert.equal(net.endpointToNet[endpoint(copied[0],'out')],net.endpointToNet[endpoint(copied[1],'in')]);assert.notEqual(net.endpointToNet[endpoint(input,'out')],net.endpointToNet[endpoint(copied[0],'out')]);removeItems(p,[gate.id]);assert.equal(p.probes.length,0);assert.doesNotThrow(()=>validateProject(p));
});

test('native plans and native model names never masquerade as complete SPICE decks',()=>{
 for(const id of ['digital-half-adder','mixed-chain']){const generated=generateNetlist(example(id));assert.ok(errors(validateImportedNetlist(generated.netlist).diagnostics).some(d=>/JSON project/.test(d.message)));if(generated.simulation.mode==='mixed'){assert.match(generated.netlist,/\n\.tran /);assert.ok(!generated.netlist.includes('"implementation":"CircuitBench four-state event kernel"'));}}
 for(const model of Object.keys(MODELS).filter(name=>['digital','bridge'].includes(MODELS[name].kind))){const imported=validateImportedNetlist(`Wrong binding\nV1 in 0 1\nD1 in 0 ${model}\n.op\n.end`);assert.ok(errors(imported.diagnostics).some(d=>/native digital or bridge model/.test(d.message)),model);assert.ok(!imported.bundledModels.includes(model));}
});
