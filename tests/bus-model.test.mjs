import test from 'node:test';
import assert from 'node:assert/strict';
import {LIBRARY,MODELS,BUS_TYPES,BUS_MODEL_VERSION,getPart,getPins,parseLogicWord,parsePattern,parseTruthTable,buildTruthTable} from '../src/library.js';
import {newProject,addComponent,uid,clone,validateProject,serializeProject,parseProject,buildNets,buildDigitalNets,canConnect,getEndpointWidth,setComponentParams,checkCircuit,duplicateItems,removeItems,endpointPosition} from '../src/model.js';
import {compileSimulation,generateNetlist} from '../src/netlist.js';
import {EXAMPLES} from '../src/examples.js';

const ep=(c,p)=>`${c.id}:${p}`;
const errors=ds=>ds.filter(d=>d.severity==='error');
const example=id=>EXAMPLES.find(e=>e.id===id).create();
const make=()=>{const p=newProject();Object.assign(p.analysis,{type:'tran',duration:'5m',step:'10u'});return p;};
const part=(p,type,params={})=>{const c=addComponent(p,type);Object.assign(c.params,params);return c;};
const wire=(p,a,b)=>{const id=uid('w');p.circuit.connections.push({id,a,b});p.layout.wires[id]={points:[]};return id;};
const label=(p,name,target)=>p.circuit.labels.push({id:uid('label'),name,target});

test('nine bounded parts have trusted fixed ports and separate original model provenance',()=>{
 assert.equal(LIBRARY.length,43);assert.equal(BUS_TYPES.length,9);assert.equal(Object.keys(MODELS).length,37);
 for(const type of BUS_TYPES){const d=getPart(type),m=MODELS[d.model],c={type,params:d.defaults};assert.equal(m.version,BUS_MODEL_VERSION);assert.equal(m.license,'MIT');assert.ok(JSON.parse(m.definition).widthPolicy);assert.ok(getPins(c).every(pin=>pin.width>=1&&pin.width<=8));assert.deepEqual(getPins(c).map(pin=>pin.id),d.pins.map(pin=>pin.id));assert.ok(EXAMPLES.find(e=>e.id===m.fixture).create().circuit.components.some(c=>c.type===type));}
 assert.equal(getPins({type:'COUNTER',params:{width:'8'}}).find(p=>p.id==='q').width,8);
 assert.deepEqual(getPins({type:'DECODER',params:{inputBits:'3'}}).map(p=>p.width),[3,1,8]);
 assert.deepEqual(getPins({type:'JOIN',params:{aWidth:'3',bWidth:'5'}}).map(p=>p.width),[3,5,8]);
 for(const c of [{type:'BUSIN',params:{width:'9'}},{type:'BUSIN',params:{width:'0'}},{type:'BUSIN',params:{width:'2.5'}},{type:'DECODER',params:{inputBits:'4'}},{type:'JOIN',params:{aWidth:'5',bWidth:'5'}}])assert.throws(()=>getPins(c));
});

test('all six bus examples compile and roundtrip without changing schema1 or probe addresses',()=>{
 for(const id of ['bus-slice-join','bus-register','bus-counter','bus-mux-decoder','truth-table-adder','bus-dac-bit']){const p=example(id),g=generateNetlist(p);assert.deepEqual(errors(g.diagnostics),[],id);assert.equal(p.schemaVersion,1);assert.deepEqual(parseProject(serializeProject(p)),p,id);assert.ok(g.measurements.some(m=>m.kind==='bus'&&m.width>1&&m.bitOrder==='msb-first'),id);assert.ok(p.probes.filter(q=>q.kind==='logic').every(q=>q.b===null));}
});

test('old scalar and analog projects retain pin identities, widths and scalar vectors',()=>{
 for(const id of ['rc-filter','digital-half-adder']){const p=example(id);p.appVersion='1.1.0-rc.1';const saved=parseProject(serializeProject(p));assert.deepEqual(saved,p);for(const c of saved.circuit.components)assert.ok(getPins(c).every(pin=>pin.width===1));const g=generateNetlist(saved);assert.ok(!g.measurements.some(m=>m.kind==='bus'));if(g.simulation)assert.equal(g.simulation.digital.buses.length,0);else assert.equal(g.simulation,null);}
});

test('fixed pin addresses survive width edits, movement, rotation and duplication',()=>{
 const p=make(),input=part(p,'BUSIN'),before=getPins(input).map(pin=>pin.id),position=endpointPosition(p,ep(input,'out'));setComponentParams(p,input.id,{width:'8'});assert.deepEqual(getPins(input).map(pin=>pin.id),before);assert.equal(getEndpointWidth(p,ep(input,'out')),8);Object.assign(p.layout.components[input.id],{x:200,y:200,rotation:90});assert.notDeepEqual(endpointPosition(p,ep(input,'out')),position);const ids=duplicateItems(p,[input.id]),copy=p.circuit.components.find(c=>ids.includes(c.id));assert.equal(getPins(copy)[0].width,8);assert.deepEqual(copy.params,input.params);assert.doesNotThrow(()=>validateProject(p));
});

test('width-conflicting edits fail before mutation with a component-scoped error',()=>{
 const p=example('bus-register'),data=p.circuit.components.find(c=>c.type==='PATTERN'),before=clone(p);assert.throws(()=>setComponentParams(p,data.id,{width:'2'}),new RegExp(`${data.ref}:.*width conflicts`));assert.deepEqual(p,before);assert.throws(()=>setComponentParams(p,data.id,{width:'99'}),/integer/);assert.deepEqual(p,before);assert.throws(()=>setComponentParams(p,data.id,{arbitrary:'code'}),/unknown parameter/);assert.deepEqual(p,before);
});

test('wire, junction and equal-label widths never broadcast or truncate silently',()=>{
 for(const mode of ['wire','junction','label']){const p=make(),a=part(p,'BUSIN',{width:'4'}),b=part(p,'BUSIN',{width:'2'});assert.equal(canConnect(p,ep(a,'out'),ep(b,'out')).ok,false);if(mode==='wire')wire(p,ep(a,'out'),ep(b,'out'));if(mode==='label'){label(p,'word',ep(a,'out'));label(p,'WORD',ep(b,'out'));}if(mode==='junction'){const j=uid('j');p.circuit.junctions.push({id:j});p.layout.junctions[j]={x:0,y:0};wire(p,ep(a,'out'),`j:${j}`);assert.equal(getEndpointWidth(p,`j:${j}`),4);assert.equal(canConnect(p,`j:${j}`,ep(b,'out')).ok,false);wire(p,ep(b,'out'),`j:${j}`);}const n=buildNets(p);assert.ok(n.nets.some(n=>n.widthConflict));assert.ok(errors(n.diagnostics).some(d=>d.code==='NET_WIDTH_CONFLICT'));assert.doesNotThrow(()=>validateProject(p),'Invalid electrical joins remain editable data');}
});

test('label-linked width changes are rejected without destroying labels or wires',()=>{
 const p=make(),a=part(p,'BUSIN',{width:'4'}),b=part(p,'LUT',{inputBits:'4',outputBits:'1'});label(p,'word',ep(a,'out'));label(p,'WORD',ep(b,'in'));const before=clone(p);assert.throws(()=>setComponentParams(p,a.id,{width:'2'}),/connected net word/);assert.deepEqual(p,before);
});

test('slice/join expansion preserves LSB ordering as zero-delay electrical aliases',()=>{
 const p=example('bus-slice-join'),net=buildDigitalNets(p),g=compileSimulation(p);assert.deepEqual(net.netBits.low,net.netBits.word.slice(0,2));assert.deepEqual(net.netBits.high,net.netBits.word.slice(2));assert.deepEqual(net.netBits.joined,net.netBits.word);assert.equal(net.netBits.bit1[0],net.netBits.word[1]);assert.equal(g.digital.gates.length,0);assert.equal(g.digital.sequential.length,0);assert.equal(net.bits.length,4);assert.equal(g.digital.sources.find(s=>s.output===net.netBits.bit1[0]).value,'Z');
});

test('slice/join aliases are bidirectional and do not create artificial drivers',()=>{
 const p=make(),source=part(p,'BUSIN',{value:'1010'}),join=part(p,'JOIN');wire(p,ep(source,'out'),ep(join,'out'));label(p,'low',ep(join,'a'));label(p,'high',ep(join,'b'));const bits=buildDigitalNets(p);assert.deepEqual(bits.endpointBits[ep(join,'a')],bits.endpointBits[ep(source,'out')].slice(0,2));assert.deepEqual(bits.endpointBits[ep(join,'b')],bits.endpointBits[ep(source,'out')].slice(2));assert.ok(bits.bits.every(bit=>bit.drivers.length===1&&bit.drivers[0].componentId===source.id));assert.deepEqual(errors(checkCircuit(p)),[]);
});

test('contention and missing input drivers are checked per expanded bit',()=>{
 const p=example('bus-slice-join'),tap=p.circuit.components.find(c=>c.type==='SLICE'&&c.params.count==='1'),one=part(p,'DIN',{state:'1'});wire(p,ep(one,'out'),ep(tap,'out'));const bits=buildDigitalNets(p);assert.equal(bits.bits.filter(bit=>bit.drivers.length===2).length,1);assert.equal(checkCircuit(p).filter(d=>d.severity==='warning'&&/drivers/.test(d.message)).length,1);
 const q=make(),low=part(q,'BUSIN',{width:'2',value:'00'}),join=part(q,'JOIN'),gate=part(q,'LUT',{inputBits:'4',outputBits:'1',table:Array.from({length:16},(_,i)=>`${i.toString(2).padStart(4,'0')}:0`).join(';')});wire(q,ep(low,'out'),ep(join,'a'));wire(q,ep(join,'out'),ep(gate,'in'));label(q,'released_high',ep(join,'b'));assert.equal(errors(checkCircuit(q)).filter(d=>/no driver/.test(d.message)).length,2);
});

function bitDependency(feedback=false){const p=make(),zero=part(p,'DIN',{state:'0'}),b=part(p,'BUSIN',{width:'2',value:'00'}),join=part(p,'JOIN',{aWidth:'1',bWidth:'1'}),mux=part(p,'MUX',{width:'2'}),tap=part(p,'SLICE',{width:'2',lsb:'0',count:'1'});wire(p,ep(zero,'out'),ep(join,feedback?'b':'a'));wire(p,ep(zero,'out'),ep(mux,'sel'));wire(p,ep(tap,'out'),ep(join,feedback?'a':'b'));wire(p,ep(join,'out'),ep(mux,'a'));wire(p,ep(b,'out'),ep(mux,'b'));wire(p,ep(mux,'out'),ep(tap,'in'));return p;}
test('feedback checking uses real per-bit dependencies after aliases collapse',()=>{
 assert.deepEqual(errors(checkCircuit(bitDependency(false))),[],'Output bit0 may feed bit1 without feeding itself');assert.ok(errors(checkCircuit(bitDependency(true))).some(d=>d.code==='DIGITAL_COMBINATIONAL_CYCLE'));
});

test('sequential bus feedback is explicit state and never a combinational cycle',()=>{
 const p=make(),reg=part(p,'REGISTER'),one=part(p,'DIN',{state:'1'}),zero=part(p,'DIN',{state:'0'});wire(p,ep(reg,'q'),ep(reg,'d'));wire(p,ep(one,'out'),ep(reg,'en'));wire(p,ep(zero,'out'),ep(reg,'clk'));wire(p,ep(zero,'out'),ep(reg,'rst'));assert.deepEqual(errors(checkCircuit(p)),[]);assert.equal(compileSimulation(p).digital.sequential.length,1);
});

test('word parser preserves literal X/Z and rejects overflow rather than inventing bits',()=>{
 for(const[text,width,expected]of [['10XZ',4,'10XZ'],['0X0',3,'0X0'],['0x0',3,'000'],['0xA',4,'1010'],['0d10',4,'1010'],['0b0010',4,'0010'],['0b0000',2,'00'],['xz',2,'XZ']])assert.equal(parseLogicWord(text,width),expected);
 for(const[text,width]of [['0x10',4],['0d256',8],['101',4],['2',1],['-1',4],['eval(1)',4],['1'.repeat(100),8]])assert.throws(()=>parseLogicWord(text,width));assert.throws(()=>parseLogicWord('0Z',2,{allowZ:false}),/no Z/);
});

test('pattern parser requires explicit t0 and distinct safe picosecond events',()=>{
 assert.deepEqual(parsePattern('0,0x0; 1n,10XZ',4),[{time:0,value:'0000'},{time:1e-9,value:'10XZ'}]);
 for(const text of ['1n,0000','0,0000; 0,1111','0,0000; 0.1p,1111','0,0000; 1T,1111','0,0000; -1n,1111','0,0000; 1n,101','0,0000,1111'])assert.throws(()=>parsePattern(text,4),text);
 const p=example('bus-register'),pattern=p.circuit.components.find(c=>c.type==='PATTERN');pattern.params.repeat='4m';assert.ok(errors(checkCircuit(p)).some(d=>/repeat period/.test(d.message)));pattern.params.repeat='1p';assert.ok(errors(checkCircuit(p)).some(d=>/200,000-event/.test(d.message)));
});

test('LUT rows are complete bounded data with stable binary address order',()=>{
 const rows=parseTruthTable('11:10; 00:00; 10:01; 01:01',2,2);assert.deepEqual(rows,['00','01','01','10']);assert.equal(buildTruthTable(rows,2,2),'00:00; 01:01; 10:01; 11:10');assert.deepEqual(parseTruthTable(buildTruthTable(['0X0','111'],1,3),1,3),['0X0','111']);
 for(const text of ['00:00; 01:01','00:00; 00:01; 10:01; 11:10','0X:00; 01:01; 10:01; 11:10','00:00; 01:01; 10:01; 11:eval(1)','00:00; 01:01; 10:01; 11:100'])assert.throws(()=>parseTruthTable(text,2,2));assert.throws(()=>buildTruthTable(Array(4),2,2));assert.throws(()=>parseTruthTable('',5,1));
});

test('compiler lowers constant and pattern words LSB first and keeps truth inputs explicit',()=>{
 const p=example('bus-slice-join'),g=compileSimulation(p),input=p.circuit.components.find(c=>c.type==='BUSIN'),group=g.digital.inputGroups.find(x=>x.id===input.id);assert.equal(group.width,4);assert.equal(group.label,input.ref);assert.deepEqual(group.sources.map(id=>g.digital.sources.find(s=>s.id===id).value),['1','Z','0','1']);
 const q=example('bus-register'),plan=compileSimulation(q),data=q.circuit.components.find(c=>c.type==='PATTERN');assert.ok(!plan.digital.inputGroups.some(group=>group.id===data.id));const sources=plan.digital.sources.filter(s=>s.id.startsWith(data.id+'_bit_'));assert.equal(sources.length,4);assert.deepEqual(sources.map(s=>s.events[0].value),['1','0','0','0']);assert.ok(sources.every(s=>s.kind==='pattern'&&s.repeatPeriod===0));
});

test('register/counter plans retain private synchronous state and ordered control nets',()=>{
 for(const[id,type]of [['bus-register','REGISTER'],['bus-counter','COUNTER']]){const p=example(id),c=p.circuit.components.find(c=>c.type===type),bits=buildDigitalNets(p),plan=compileSimulation(p),state=plan.digital.sequential.find(s=>s.id===c.id);assert.equal(state.type,type);assert.deepEqual(state.outputs,bits.endpointBits[ep(c,'q')]);assert.equal(state.clock,bits.endpointBits[ep(c,'clk')][0]);assert.equal(state.enable,bits.endpointBits[ep(c,'en')][0]);assert.equal(state.reset,bits.endpointBits[ep(c,'rst')][0]);assert.equal(state.delay,1e-8);assert.equal(state.initial,type==='REGISTER'?'0000':'1110');assert.ok(!plan.digital.gates.some(g=>g.id===c.id));if(type==='REGISTER')assert.deepEqual(state.inputs,bits.endpointBits[ep(c,'d')]);else assert.equal(state.inputs,undefined);}
});

test('MUX, decoder and LUT lowering preserves actual per-bit truth semantics',()=>{
 const p=example('bus-mux-decoder'),plan=compileSimulation(p),mux=p.circuit.components.find(c=>c.type==='MUX'),decoder=p.circuit.components.find(c=>c.type==='DECODER'),bits=buildDigitalNets(p),gates=plan.digital.gates.filter(g=>g.id.startsWith(mux.id+'_bit_'));assert.equal(gates.length,2);gates.forEach((g,i)=>{assert.equal(g.type,'MUX');assert.deepEqual(g.inputs,[bits.endpointBits[ep(mux,'a')][i],bits.endpointBits[ep(mux,'b')][i],bits.endpointBits[ep(mux,'sel')][0]]);});
 plan.digital.gates.filter(g=>g.id.startsWith(decoder.id+'_bit_')).forEach((g,i)=>assert.deepEqual(g.table,Array.from({length:8},(_,address)=>address===4+i?'1':'0')));
 const half=compileSimulation(example('truth-table-adder'));assert.deepEqual(half.digital.gates.map(g=>g.table),[['0','1','1','0'],['0','0','0','1']]);
});

test('logic project probes derive bus width/kind from trusted electrical nets',()=>{
 const p=example('truth-table-adder'),g=generateNetlist(p),bus=g.measurements.find(m=>m.selected&&m.vector==='b(sumcarry)'),scalar=g.measurements.find(m=>m.selected&&m.vector==='d(sum)');assert.equal(bus.kind,'bus');assert.equal(bus.width,2);assert.equal(bus.unit,'logic');assert.equal(bus.bitOrder,'msb-first');assert.equal(scalar.kind,'logic');assert.ok(!('width'in scalar));const bad=clone(p);bad.probes[0].kind='bus';assert.throws(()=>validateProject(bad),/Unsupported measurement/);
});

test('width1 bus parts remain scalar and bridges require explicit one-bit slices',()=>{
 const p=make(),input=part(p,'BUSIN',{width:'1',value:'1'}),gate=part(p,'NOT');wire(p,ep(input,'out'),ep(gate,'in'));assert.equal(generateNetlist(p).simulation.digital.buses.length,0);assert.ok(generateNetlist(p).measurements.every(m=>m.kind==='logic'));
 const mixed=example('bus-dac-bit'),plan=compileSimulation(mixed),dac=mixed.circuit.components.find(c=>c.type==='DAC'),word=mixed.circuit.components.find(c=>c.type==='PATTERN');assert.equal(canConnect(mixed,ep(word,'out'),ep(dac,'in')).ok,false);assert.equal(plan.dacs[0].input,'bit2');assert.equal(plan.digital.buses[0].bits[2],'bit2');assert.deepEqual(errors(checkCircuit(mixed)),[]);
});

test('expanded scalar bit budget cannot be bypassed with wide public buses',()=>{
 const p=make();for(let i=0;i<33;i++)part(p,'BUSIN',{width:'8'});assert.equal(buildDigitalNets(p).bits.length,264);assert.ok(errors(checkCircuit(p)).some(d=>/255 distinct scalar bit nets/.test(d.message)));
});

test('oversized pattern plans fail compilation while retaining a portable failed-run input',()=>{
 const p=make(),pattern=Array.from({length:200},(_,i)=>`${i}n,${(i%2).toString(2).padStart(8,'0')}`).join('; ');for(let i=0;i<12;i++){const source=part(p,'PATTERN',{width:'8',pattern});label(p,'shared_word',ep(source,'out'));}const before=clone(p),g=generateNetlist(p);assert.ok(errors(g.diagnostics).some(d=>/Compiled native plan exceeds 220 kB/.test(d.message)));assert.equal(g.simulation,null);assert.ok(g.netlist.length<256000);assert.deepEqual(p,before);assert.doesNotThrow(()=>parseProject(serializeProject(p)));
});

test('copy/delete keeps alias topology and grouped labels separate from the original',()=>{
 const p=example('bus-slice-join'),old=buildDigitalNets(p),ids=duplicateItems(p,[...p.circuit.components.map(c=>c.id),...p.circuit.labels.map(l=>l.id)]),bits=buildDigitalNets(p);assert.equal(bits.bits.length,old.bits.length*2);assert.doesNotThrow(()=>validateProject(p));assert.deepEqual(errors(checkCircuit(p)),[]);const copiedInput=p.circuit.components.find(c=>ids.includes(c.id)&&c.type==='BUSIN');removeItems(p,[copiedInput.id]);assert.doesNotThrow(()=>validateProject(p));assert.deepEqual(buildDigitalNets(p).netBits.word,old.netBits.word);
});

test('public labels cannot collide with lowered bit names or object prototypes',()=>{
 const p=make(),a=part(p,'BUSIN',{width:'2',value:'01'}),b=part(p,'DIN',{state:'1'}),c=part(p,'BUSIN',{width:'2',value:'10'});label(p,'__proto__',ep(a,'out'));label(p,'__cb_bit_1',ep(b,'out'));label(p,'constructor',ep(c,'out'));const bits=buildDigitalNets(p);assert.equal(bits.netBits.__proto__.length,2);assert.equal(bits.netBits.constructor.length,2);assert.ok(!bits.netBits.__proto__.includes('__cb_bit_1'));assert.equal(new Set(bits.bits.map(bit=>bit.name)).size,5);assert.deepEqual(errors(generateNetlist(p).diagnostics),[]);
});
