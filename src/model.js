import {getPart,parseValue,parsePWL,MODELS,DIGITAL_TYPES,GATE_TYPES,BUS_TYPES,SEQUENTIAL_TYPES,getPins,parseLogicWord,parsePattern,parseTruthTable} from './library.js';
export const VERSION='2.0.0-rc.1';
export const SCHEMA_VERSION=1;
export const LIMITS={components:300,connections:1600,junctions:600,labels:600,annotations:300,probes:100,jsonBytes:256*1024*1024};
export const clone=value=>structuredClone(value);
export function uid(prefix='id'){return `${prefix}_${globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;}
export function newProject(title='Untitled circuit'){
 const now=new Date().toISOString();
 return {schemaVersion:SCHEMA_VERSION,appVersion:VERSION,id:uid('project'),title,revision:0,createdAt:now,updatedAt:now,question:'',notes:'',assumptions:[],circuit:{components:[],connections:[],junctions:[],labels:[]},layout:{components:{},wires:{},junctions:{},annotations:[]},analysis:{type:'ac',solver:'ngspice',start:'1',stop:'100k',points:60,step:'10u',duration:'10m',source:'V1',sweepStart:'0',sweepStop:'10',sweepStep:'0.1',temperature:27,reltol:'1e-4',uic:false},probes:[],workspace:'schematic',netlistText:''};
}
const validId=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
const assert=(v,msg)=>{if(!v)throw new Error(msg);};
const object=(v,msg)=>{assert(v&&typeof v==='object'&&!Array.isArray(v),msg);return v;};
const text=(v,max,what)=>{assert(typeof v==='string'&&v.length<=max,`${what} must be text up to ${max} characters.`);return v;};
const finite=(v,what,min=-1e6,max=1e6)=>{assert(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,`${what} must be a finite number between ${min} and ${max}.`);return v;};
const coord=v=>{object(v,'Drawing position is missing.');return {x:finite(v.x,'X position'),y:finite(v.y,'Y position')};};
const array=(v,max,what)=>{assert(Array.isArray(v)&&v.length<=max,`${what} must be a list with at most ${max} items.`);return v;};
function uniqueId(id,seen,what){assert(validId(id),`Invalid ${what} identifier.`);assert(!seen.has(id),`Duplicate identifier ${id}.`);seen.add(id);return id;}
function endpointSet(project){return new Set([...project.circuit.components.flatMap(c=>getPins(c).map(p=>`${c.id}:${p.id}`)),...project.circuit.junctions.map(j=>`j:${j.id}`)]);}
function validateParams(c){const d=getPart(c.type);const params={...d.defaults};object(c.params||{},`Parameters missing for ${c.ref}.`);for(const p of d.params){let v=c.params?.[p.key]??p.default;assert(typeof v==='string'||(typeof v==='number'&&Number.isFinite(v)),`${c.ref} ${p.label}: value must be text or a finite number.`);v=String(v);text(v,p.maxLength??(p.key==='pwl'?12000:100),`${c.ref} ${p.label}`);if(p.options)assert(p.options.includes(v),`${c.ref}: unsupported ${p.label}.`);params[p.key]=v;}return params;}
export function validateProject(input){
 object(input,'Project must be a JSON object.');assert(input.schemaVersion===SCHEMA_VERSION,`Unsupported project schema ${input.schemaVersion}. This build reads schema ${SCHEMA_VERSION}; preserve your original file.`);
 const p=newProject();p.id=validId(input.id)?input.id:uid('project');p.title=text(input.title??'Untitled circuit',200,'Project title');p.appVersion=text(input.appVersion??VERSION,60,'Application version');p.revision=finite(input.revision??0,'Revision',0,Number.MAX_SAFE_INTEGER);assert(Number.isInteger(p.revision),'Revision must be an integer.');
 p.createdAt=text(input.createdAt??p.createdAt,60,'Creation timestamp');p.updatedAt=text(input.updatedAt??p.updatedAt,60,'Update timestamp');p.question=text(input.question??'',10000,'Question');p.notes=text(input.notes??'',100000,'Notes');p.assumptions=array(input.assumptions??[],100,'Assumptions').map(x=>text(x,2000,'Assumption'));
 const source=object(input.circuit,'Electrical circuit is missing.'),layout=object(input.layout,'Drawing layout is missing.');object(layout.components??{},'Component layout must be an object.');object(layout.wires??{},'Wire layout must be an object.');object(layout.junctions??{},'Junction layout must be an object.');
 const ids=new Set(),refs=new Set();
 p.circuit.components=array(source.components,LIMITS.components,'Components').map(c=>{object(c,'Invalid component.');const d=getPart(c.type),id=uniqueId(c.id,ids,'component');const ref=text(c.ref,40,'Reference designator');assert(new RegExp(`^${d.prefix}[A-Za-z0-9_]*$`,'i').test(ref),`${ref}: use a unique ${d.prefix} reference designator.`);assert(!refs.has(ref.toLowerCase()),`Duplicate reference ${ref}.`);refs.add(ref.toLowerCase());const result={id,ref,type:c.type,params:validateParams(c),model:c.model??d.model};assert(result.model===null||typeof result.model==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(result.model),`${ref}: invalid model identifier.`);const l=layout.components[id];const pos=coord(l);const rotation=finite(l.rotation??0,'Rotation',-360000,360000);assert(rotation%90===0,'Rotations must be multiples of 90 degrees.');p.layout.components[id]={...pos,rotation:((rotation%360)+360)%360,mirror:!!l.mirror};return result;});
 p.circuit.junctions=array(source.junctions??[],LIMITS.junctions,'Junctions').map(j=>{const id=uniqueId(j.id,ids,'junction');p.layout.junctions[id]=coord(layout.junctions[id]);return {id};});
 const endpoints=endpointSet(p);
 const endpoint=e=>{assert(typeof e==='string'&&endpoints.has(e),`Connection refers to missing pin or junction: ${e}.`);return e;};
 p.circuit.connections=array(source.connections??[],LIMITS.connections,'Connections').map(w=>{const id=uniqueId(w.id,ids,'connection'),a=endpoint(w.a),b=endpoint(w.b);assert(a!==b,'A wire cannot connect a pin to itself.');const points=array(layout.wires?.[id]?.points??[],200,'Wire bends').map(coord);p.layout.wires[id]={points};return {id,a,b};});
 p.circuit.labels=array(source.labels??[],LIMITS.labels,'Net labels').map(l=>{const id=uniqueId(l.id,ids,'label'),name=text(l.name,32,'Net label');assert(/^(?:0|[A-Za-z_][A-Za-z0-9_]{0,31})$/.test(name),`Invalid net label ${name}; use letters, digits, and underscores.`);return {id,name,target:endpoint(l.target)};});
 p.layout.annotations=array(layout.annotations??[],LIMITS.annotations,'Annotations').map(a=>({id:uniqueId(a.id,ids,'annotation'),...coord(a),text:text(a.text,2000,'Annotation')}));
 object(input.analysis??{},'Analysis must be an object.');const a=input.analysis??{};assert(['op','dc','ac','tran'].includes(a.type??'ac'),'Unsupported analysis; choose operating point, DC sweep, AC, or transient.');p.analysis.type=a.type??'ac';
 p.analysis.solver=a.solver??'ngspice';assert(['ngspice','coordinated'].includes(p.analysis.solver),'Choose ngspice or Coordinated transient.');
 for(const key of ['start','stop','step','duration','source','sweepStart','sweepStop','sweepStep','reltol']){if(key in a)p.analysis[key]=text(String(a[key]),100,`Analysis ${key}`);}
 p.analysis.points=finite(Number(a.points??60),'AC points per decade',1,1000);assert(Number.isInteger(p.analysis.points),'AC points per decade must be an integer.');p.analysis.temperature=finite(Number(a.temperature??27),'Temperature',-100,200);p.analysis.uic=!!a.uic;
 p.probes=array(input.probes??[],LIMITS.probes,'Probes').map(q=>{const id=uniqueId(q.id,ids,'probe');assert(['voltage','differential','current','logic'].includes(q.kind),'Unsupported measurement kind.');const r={id,kind:q.kind,label:text(q.label??q.kind,100,'Probe label')};if(q.kind==='current'){const ci=q.componentId??q.a;assert(p.circuit.components.some(c=>c.id===ci),'Current probe refers to a missing component.');r.componentId=ci;r.a=ci;}else{r.a=endpoint(q.a);r.b=q.kind==='differential'?endpoint(q.b):null;}return r;});
 p.workspace=input.workspace??'schematic';assert(['schematic','netlist'].includes(p.workspace),'Unsupported workspace.');p.netlistText=text(input.netlistText??'',200000,'SPICE netlist');return p;
}
export function serializeProject(project){return JSON.stringify(validateProject(project),null,2);}
export function parseProject(json){assert(typeof json==='string'&&json.length<=LIMITS.jsonBytes,'Project file is too large.');let input;try{input=JSON.parse(json);}catch{throw new Error('This is not valid JSON. Choose a CircuitBench .circuitbench.json project file.');}return validateProject(input.project??input);}
export function addComponent(project,type,x=0,y=0){const d=getPart(type);assert(project.circuit.components.length<LIMITS.components,'This release supports at most 300 components per project.');const used=new Set(project.circuit.components.map(c=>c.ref.toLowerCase()));let n=1;while(used.has(`${d.prefix}${n}`.toLowerCase()))n++;const c={id:uid('c'),ref:`${d.prefix}${n}`,type,params:clone(d.defaults),model:d.model};project.circuit.components.push(c);project.layout.components[c.id]={x:Math.round(x/20)*20,y:Math.round(y/20)*20,rotation:0,mirror:false};return c;}
/** Validate width edits against all explicit wires and label aliases before mutation. */
export function setComponentParams(project,id,changes){
 const component=project.circuit.components.find(c=>c.id===id);if(!component)throw new Error('Component is missing.');
 object(changes,'Parameter changes must be an object.');const proposed={...component,params:{...component.params,...changes}},known=new Set(getPart(component.type).params.map(p=>p.key));
 for(const key of Object.keys(changes))if(!known.has(key))throw new Error(`${component.ref}: unknown parameter ${key}.`);
 proposed.params=validateParams(proposed);const originalPins=getPins(component),proposedPins=getPins(proposed),widthChanged=proposedPins.some(pin=>pin.width!==originalPins.find(p=>p.id===pin.id)?.width);
 const trial={...project,circuit:{...project.circuit,components:project.circuit.components.map(c=>c.id===id?proposed:c)}},net=buildNets(trial);
 const conflict=net.nets.find(n=>n.widthConflict&&n.endpoints.some(e=>e.startsWith(id+':')));
 if(widthChanged&&conflict)throw new Error(`${component.ref}: the requested width conflicts with connected net ${conflict.name}. Disconnect or resize the other ports explicitly before changing this width.`);
 if(proposed.type==='SLICE'){const lsb=Number(proposed.params.lsb),count=Number(proposed.params.count),width=Number(proposed.params.width);if(!Number.isInteger(lsb)||lsb<0||lsb+count>width)throw new Error(`${component.ref}: slice first bit plus count must fit its input width.`);}
 component.params=proposed.params;return component;
}
export function endpointPosition(project,endpoint){if(endpoint?.startsWith('j:'))return project.layout.junctions[endpoint.slice(2)]??null;const [id,pin]=String(endpoint).split(':');const c=project.circuit.components.find(c=>c.id===id),l=project.layout.components[id];if(!c||!l)return null;const p=getPins(c).find(p=>p.id===pin);if(!p)return null;const angle=(l.rotation||0)*Math.PI/180,x=(l.mirror?-1:1)*p.x,y=p.y;return {x:l.x+Math.round(x*Math.cos(angle)-y*Math.sin(angle)),y:l.y+Math.round(x*Math.sin(angle)+y*Math.cos(angle))};}
export function removeItems(p,ids){
 const set=new Set(ids);const removedEndpoints=new Set(p.circuit.components.filter(c=>set.has(c.id)).flatMap(c=>getPins(c).map(pin=>`${c.id}:${pin.id}`)));for(const j of p.circuit.junctions)if(set.has(j.id))removedEndpoints.add(`j:${j.id}`);
 p.circuit.components=p.circuit.components.filter(c=>{if(set.has(c.id)){delete p.layout.components[c.id];return false;}return true;});p.circuit.junctions=p.circuit.junctions.filter(j=>{if(set.has(j.id)){delete p.layout.junctions[j.id];return false;}return true;});
 p.circuit.connections=p.circuit.connections.filter(w=>{if(set.has(w.id)||removedEndpoints.has(w.a)||removedEndpoints.has(w.b)){delete p.layout.wires[w.id];return false;}return true;});
 p.circuit.labels=p.circuit.labels.filter(l=>!set.has(l.id)&&!removedEndpoints.has(l.target));p.layout.annotations=p.layout.annotations.filter(a=>!set.has(a.id));p.probes=p.probes.filter(q=>!set.has(q.id)&&!set.has(q.componentId??q.a)&&!removedEndpoints.has(q.a)&&!removedEndpoints.has(q.b));
}
export function duplicateItems(p,ids,offset=40){
 const selected=new Set(ids),map=new Map(),newIds=[],endpointMap=new Map();const old=clone(p);
 for(const c of old.circuit.components.filter(c=>selected.has(c.id))){const l=old.layout.components[c.id],n=addComponent(p,c.type,l.x+offset,l.y+offset);n.params=clone(c.params);n.model=c.model;p.layout.components[n.id]={...l,x:l.x+offset,y:l.y+offset};map.set(c.id,n.id);newIds.push(n.id);for(const pin of getPins(c))endpointMap.set(`${c.id}:${pin.id}`,`${n.id}:${pin.id}`);}
 for(const j of old.circuit.junctions.filter(j=>selected.has(j.id))){const id=uid('j');map.set(j.id,id);endpointMap.set(`j:${j.id}`,`j:${id}`);p.circuit.junctions.push({id});const pos=old.layout.junctions[j.id];p.layout.junctions[id]={x:pos.x+offset,y:pos.y+offset};newIds.push(id);}
 for(const w of old.circuit.connections){if(endpointMap.has(w.a)&&endpointMap.has(w.b)){const id=uid('w');p.circuit.connections.push({id,a:endpointMap.get(w.a),b:endpointMap.get(w.b)});p.layout.wires[id]={points:(old.layout.wires[w.id]?.points??[]).map(pos=>({x:pos.x+offset,y:pos.y+offset}))};}}
 const copiedLabelNames=new Map();for(const l of old.circuit.labels.filter(l=>selected.has(l.id)&&endpointMap.has(l.target))){let name=copiedLabelNames.get(l.name.toLowerCase());if(!name){let base=l.name==='0'?'gnd_copy':l.name.slice(0,23)+'_copy',n=1;name=base;while(p.circuit.labels.some(x=>x.name.toLowerCase()===name.toLowerCase()))name=base.slice(0,27)+(n++);copiedLabelNames.set(l.name.toLowerCase(),name);}const id=uid('label');p.circuit.labels.push({id,name,target:endpointMap.get(l.target)});newIds.push(id);}
 for(const a of old.layout.annotations.filter(a=>selected.has(a.id))){const id=uid('note');p.layout.annotations.push({...a,id,x:a.x+offset,y:a.y+offset});newIds.push(id);}
 return newIds;
}
export function buildNets(p){
 const diagnostics=[],eps=[...endpointSet(p)],parent=new Map(eps.map(e=>[e,e]));
 const pins=new Map(p.circuit.components.flatMap(c=>getPins(c).map(pin=>[`${c.id}:${pin.id}`,{...pin,componentId:c.id,ref:c.ref}])));
 function find(x){if(!parent.has(x))return null;let r=x;while(parent.get(r)!==r)r=parent.get(r);while(parent.get(x)!==x){let n=parent.get(x);parent.set(x,r);x=n;}return r;}
 function join(a,b){let x=find(a),y=find(b);if(x===null||y===null){diagnostics.push({severity:'error',message:`Wire refers to a missing pin or junction (${a}, ${b}).`});return;}if(x!==y)parent.set(y,x);}
 for(const w of p.circuit.connections)join(w.a,w.b);
 const ground=p.circuit.components.filter(c=>c.type==='GND').map(c=>`${c.id}:0`);const labelMap=new Map();
 for(const l of p.circuit.labels){const name=l.name.toLowerCase();if(!parent.has(l.target)){diagnostics.push({severity:'error',message:`Net label ${l.name} refers to a missing pin.`});continue;}if(labelMap.has(name))join(labelMap.get(name),l.target);else labelMap.set(name,l.target);if(name==='0')ground.push(l.target);}
 for(let i=1;i<ground.length;i++)join(ground[0],ground[i]);
 const groups=new Map();for(const e of eps){const r=find(e);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(e);}
 const root0=ground.length?find(ground[0]):null,endpointToNet=Object.create(null),nets=[];const usedNames=new Set(['0',...p.circuit.labels.map(l=>l.name.toLowerCase())]);let next=1;
 for(const [root,endpoints] of groups){
  const labels=p.circuit.labels.filter(l=>find(l.target)===root).map(l=>l.name.toLowerCase());let name;
  if(root===root0)name='0';else if(labels.length)name=[...new Set(labels)].sort()[0];else{while(usedNames.has(`n${next}`))next++;name=`n${next++}`;usedNames.add(name);}
  if(new Set(labels.filter(l=>l!=='0')).size>1)diagnostics.push({severity:'warning',message:`Connected labels ${[...new Set(labels)].join(', ')} are one net (${name}).`});
  const domains=new Set(endpoints.map(e=>pins.get(e)?.domain).filter(Boolean));if(name==='0')domains.add('analog');const domain=domains.size>1?'mixed':[...domains][0]??null;
  const widths=new Set(endpoints.map(e=>pins.get(e)?.width).filter(Boolean)),widthConflict=domain==='digital'&&widths.size>1,width=widths.size===1?[...widths][0]:null;
  const drivers=endpoints.filter(e=>pins.get(e)?.domain==='digital'&&pins.get(e)?.direction==='output');
  if(domain==='mixed')diagnostics.push({severity:'error',code:'NET_DOMAIN_CONFLICT',message:`Net ${name} directly joins analog and digital pins. Use an explicit ADC or DAC bridge; wires, junctions, ground and equal labels do not convert signal domains.`});
  if(widthConflict)diagnostics.push({severity:'error',code:'NET_WIDTH_CONFLICT',message:`Net ${name} joins incompatible digital widths (${[...widths].sort((a,b)=>a-b).join(', ')} bits). Use an explicit slice or join; no truncation, extension or automatic bit broadcast is applied.`});
  nets.push({name,endpoints,domain,drivers,width,widthConflict});for(const e of endpoints)endpointToNet[e]=name;
 }
 return {endpointToNet,nets,diagnostics};
}
export function getEndpointDomain(project,endpoint){const nets=buildNets(project),name=nets.endpointToNet[endpoint];return nets.nets.find(net=>net.name===name)?.domain??null;}
export function getEndpointWidth(project,endpoint){const nets=buildNets(project),name=nets.endpointToNet[endpoint];return nets.nets.find(net=>net.name===name)?.width??null;}
export function canConnect(project,a,b){
 const endpoints=endpointSet(project);if(!endpoints.has(a)||!endpoints.has(b))return{ok:false,message:'Choose existing component pins or junctions.'};
 if(a===b)return{ok:false,message:'A wire needs two different endpoints.'};
 const net=buildNets(project),group=e=>net.nets.find(n=>n.name===net.endpointToNet[e]),na=group(a),nb=group(b),da=na?.domain,db=nb?.domain;
 if(da==='mixed'||db==='mixed'||da&&db&&da!==db)return{ok:false,message:'Analog and digital wires require an explicit ADC or DAC bridge.'};
 if(na?.widthConflict||nb?.widthConflict||da==='digital'&&db==='digital'&&na.width!==nb.width)return{ok:false,message:`Digital pin widths must match (${na?.width??'?'} and ${nb?.width??'?'} bits). Insert a slice or join explicitly.`};return{ok:true};
}

/** Resolve explicit SLICE/JOIN electrical bit aliases before driver/cycle checks. */
export function buildDigitalNets(project,net=buildNets(project)){
 const diagnostics=[],nets=net.nets.filter(n=>n.domain==='digital'&&!n.widthConflict&&Number.isInteger(n.width)),tokens=new Map(),parent=new Map(),rawBits=Object.create(null);
 for(const n of nets){rawBits[n.name]=Array.from({length:n.width},(_,bit)=>{const key=`${n.name}:${bit}`;parent.set(key,key);tokens.set(key,{net:n.name,bit,width:n.width});return key;});}
 const find=key=>{if(!parent.has(key))return null;let root=key;while(parent.get(root)!==root)root=parent.get(root);while(parent.get(key)!==key){const next=parent.get(key);parent.set(key,root);key=next;}return root;};
 const join=(a,b)=>{const x=find(a),y=find(b);if(x&&y&&x!==y)parent.set(y,x);};
 const bits=(c,pin)=>rawBits[net.endpointToNet[`${c.id}:${pin}`]];
 for(const c of project.circuit.components){
  if(c.type==='SLICE'){const input=bits(c,'in'),output=bits(c,'out'),lsb=Number(c.params.lsb);if(!Number.isInteger(lsb)||lsb<0||!input||!output||lsb+output.length>input.length){diagnostics.push({severity:'error',componentId:c.id,message:`${c.ref}: slice first bit and count must fit its input bus.`});continue;}for(let bit=0;bit<output.length;bit++)join(output[bit],input[lsb+bit]);}
  if(c.type==='JOIN'){const a=bits(c,'a'),b=bits(c,'b'),output=bits(c,'out');if(a&&b&&output)for(let bit=0;bit<output.length;bit++)join(output[bit],bit<a.length?a[bit]:b[bit-a.length]);}
 }
 const groups=new Map();for(const key of tokens.keys()){const root=find(key);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(key);}
 const used=new Set(net.nets.map(n=>n.name)),canonical=new Map(),hiddenNodes=[];let index=1;
 for(const[root,members]of groups){const publicNames=members.map(key=>tokens.get(key)).filter(t=>t.width===1).map(t=>t.net).sort();let name=publicNames[0];if(!name){do{name=`__cb_bit_${index++}`;}while(used.has(name));used.add(name);hiddenNodes.push(name);}canonical.set(root,name);}
 const netBits=Object.fromEntries(nets.map(n=>[n.name,rawBits[n.name].map(key=>canonical.get(find(key)))])),endpointBits=Object.fromEntries(nets.flatMap(n=>n.endpoints.map(e=>[e,netBits[n.name]]))),bitMap=new Map([...canonical.values()].map(name=>[name,{name,drivers:[],inputs:[]}]));
 for(const c of project.circuit.components)for(const pin of getPins(c).filter(p=>p.domain==='digital'))for(const[bit,name]of(endpointBits[`${c.id}:${pin.id}`]??[]).entries()){const target=bitMap.get(name),port={componentId:c.id,pinId:pin.id,bit,endpoint:`${c.id}:${pin.id}`};if(pin.direction==='output')target.drivers.push(port);if(pin.direction==='input')target.inputs.push(port);}
 return{netBits,endpointBits,bits:[...bitMap.values()],hiddenNodes,diagnostics};
}

/** Conservative analog influence graph. Ground never carries a dependency edge.
 * ADC ports are infinite-impedance observers, not electrical connections. */
export function analogDependencies(project,net=buildNets(project)){
 const graph=new Map(net.nets.filter(n=>n.domain==='analog'&&n.name!=='0').map(n=>[n.name,new Set()]));
 for(const c of project.circuit.components){if(['GND','ADC','ADCBUS'].includes(c.type))continue;const nodes=[...new Set(getPins(c).filter(pin=>pin.domain==='analog').map(pin=>net.endpointToNet[`${c.id}:${pin.id}`]).filter(name=>name&&name!=='0'))];for(const a of nodes)for(const b of nodes)if(a!==b)graph.get(a)?.add(b);}
 return graph;
}
function checkDigital(p,net,out){
 const error=(message,componentId,code)=>out.push({severity:'error',message,componentId,code}),warning=(message,componentId)=>out.push({severity:'warning',message,componentId});
 const parts=p.circuit.components.filter(c=>DIGITAL_TYPES.includes(c.type));if(!parts.length)return;
 if(p.analysis.type!=='tran')error('Digital and mixed-signal circuits support transient analysis only. Choose Transient.');
 if(p.analysis.uic&&p.analysis.solver!=='coordinated')error('Digital and mixed-signal transient runs require a normal t=0 startup. Turn off UIC / skip operating point.');
 const safeTime=time=>Number.isSafeInteger(Math.round(time/1e-12));
 let duration=0;try{duration=parseValue(p.analysis.duration,'s');if(duration<1e-12||!safeTime(duration))error('Digital duration must be at least 1 ps and fit the safe 1 ps timeline (less than about 9,000 seconds).');if(parseValue(p.analysis.step,'s')<1e-12)error('Digital timing resolution is 1 ps. Choose a maximum step of at least 1p.');}catch(e){error(e.message);}
 let edges=0,elements=0;
 for(const c of parts){try{
  const n=(key,unit)=>parseValue(c.params[key],unit),pins=getPins(c),width=pin=>pins.find(p=>p.id===pin)?.width??1;
  for(const param of getPart(c.type).params)if(param.options&&!param.options.includes(c.params[param.key]))error(`${c.ref}: ${param.label} must be one of ${param.options.join(', ')}.`,c.id);
  if(c.type==='CLOCK'){const period=n('period','s'),duty=n('duty','%')/100,delay=n('delay','s');if(!(period>0&&safeTime(period)&&duty>0&&duty<1&&period*duty>=1e-12&&period*(1-duty)>=1e-12))error(`${c.ref}: clock high and low widths must each be at least 1 ps; period must fit the safe 1 ps timeline and duty must be strictly between 0% and 100%.`,c.id);if(delay<0||!safeTime(delay))error(`${c.ref}: start delay must be nonnegative and fit the 1 ps timeline.`,c.id);if(period>0)edges+=2*Math.ceil(Math.max(0,duration-delay)/period)+2;}
  if([...GATE_TYPES,'REGISTER','COUNTER','MUX','DECODER','LUT','HEX7'].includes(c.type)){const delay=n('delay','s');if(delay<1e-12||!safeTime(delay))error(`${c.ref}: propagation delay must be at least 1 ps and fit the safe 1 ps timeline.`,c.id);}
  if(c.type==='BUSIN')parseLogicWord(c.params.value,width('out'));
  if(['REGISTER','COUNTER'].includes(c.type))parseLogicWord(c.params.initial,width('q'),{allowZ:false});
  if(c.type==='LUT')parseTruthTable(c.params.table,width('in'),width('out'));
  if(c.type==='PATTERN'){const events=parsePattern(c.params.pattern,width('out')),repeat=n('repeat','s'),last=events.at(-1).time;if(repeat<0||!safeTime(repeat)||repeat>0&&Math.round(repeat/1e-12)<=Math.round(last/1e-12))error(`${c.ref}: repeat period must be zero (once) or later than the last pattern event on the safe 1 ps grid.`,c.id);const copies=repeat>0?Math.ceil(duration/repeat)+1:1;edges+=events.length*copies*width('out');}
  if(c.type==='SLICE'&&!/^\d+$/.test(String(c.params.lsb)))error(`${c.ref}: slice first bit must be a nonnegative integer.`,c.id);
  if(['ADC','DAC','DACBUS'].includes(c.type)){if(!(n('high','V')>n('low','V')))error(`${c.ref}: high threshold/output must be greater than low.`,c.id);}
  if(c.type==='ADCBUS'){if(!(n('vmax','V')>n('vmin','V')))error(`${c.ref}: full-scale voltage must be greater than zero-code voltage.`,c.id);for(const key of ['period','delay']){const time=n(key,'s');if(time<1e-12||!safeTime(time))error(`${c.ref}: ${key} must be at least 1 ps on the safe time grid.`,c.id);}if(Math.round(n('delay','s')/1e-12)>=Math.round(n('period','s')/1e-12))error(`${c.ref}: conversion delay must be shorter than sample period on the 1 ps time grid.`,c.id);}
  if(c.type==='DACBUS'){const word=parseLogicWord(c.params.initial,width('d'),{allowZ:false});if(word.includes('X'))error(`${c.ref}: startup code must be a known binary word.`,c.id);}
  if(['ADCBUS','DACBUS'].includes(c.type)&&p.analysis.solver!=='coordinated')error(`${c.ref}: multibit converters require the Coordinated transient solver.`,c.id,'COORDINATED_REQUIRED');
  if(['DAC','DACBUS'].includes(c.type)){for(const key of ['rise','fall']){const time=n(key,'s');if(time<1e-12||!safeTime(time))error(`${c.ref}: ${key} time must be at least 1 ps and fit the safe 1 ps timeline.`,c.id);}if(net.endpointToNet[`${c.id}:${c.type==='DACBUS'?'p':'out'}`]===net.endpointToNet[`${c.id}:${c.type==='DACBUS'?'n':'ref'}`])error(`${c.ref}: the analog output is shorted to its reference.`,c.id);}
  if(!['SLICE','JOIN','DAC','DACBUS'].includes(c.type))elements+=pins.filter(pin=>pin.direction==='output'&&pin.domain==='digital').reduce((sum,pin)=>sum+pin.width,0);
 }catch(e){error(`${c.ref}: ${e.message}`,c.id);}}
 if(edges*(elements+1)>200000)error('Estimated digital pattern/clock and gate events exceed the 200,000-event budget. Shorten the run, slow sources, or reduce the circuit.');
 if(elements>600)error('Expanded digital circuits support at most 600 scalar source/gate/state elements.');
 const digital=buildDigitalNets(p,net);out.push(...digital.diagnostics);if(digital.bits.length>255)error('Digital runs support at most 255 distinct scalar bit nets after slice/join expansion.');
 for(const bit of digital.bits){if(bit.inputs.length&&!bit.drivers.length)error(`Digital bit net ${bit.name} has no driver. Connect a logic input, pattern, clock, gate output, or ADC; use explicit X/Z inputs when uncertainty is intentional.`);if(bit.drivers.length>1)warning(`Digital bit net ${bit.name} has ${bit.drivers.length} drivers. Opposing active values resolve to X; released outputs resolve to Z.`);}
 const graph=new Map(digital.bits.map(bit=>[bit.name,new Set()]));
 for(const c of parts){if(SEQUENTIAL_TYPES.includes(c.type)||['DIN','BUSIN','CLOCK','PATTERN','SLICE','JOIN','ADC','DAC','ADCBUS','DACBUS'].includes(c.type))continue;const pins=getPins(c),bits=pin=>digital.endpointBits[`${c.id}:${pin}`]??[];
  if(c.type==='MUX'){for(const[i,output]of bits('out').entries())for(const input of[bits('a')[i],bits('b')[i],bits('sel')[0]])graph.get(input)?.add(output);}
  else{const inputs=pins.filter(pin=>pin.direction==='input').flatMap(pin=>bits(pin.id)),outputs=pins.filter(pin=>pin.direction==='output').flatMap(pin=>bits(pin.id));for(const input of inputs)for(const output of outputs)graph.get(input)?.add(output);}
 }
 const active=new Set(),done=new Set();function cycle(node){if(active.has(node))return true;if(done.has(node))return false;active.add(node);for(const next of graph.get(node)??[])if(cycle(next))return true;active.delete(node);done.add(node);return false;}
 if([...graph.keys()].some(cycle))error('Combinational digital feedback is unsupported. Break the cycle with a flip-flop or register; propagation delay alone is not a state element.',undefined,'DIGITAL_COMBINATIONAL_CYCLE');
 const dependencies=analogDependencies(p,net),adcs=parts.filter(c=>['ADC','ADCBUS'].includes(c.type));
 for(const dac of parts.filter(c=>['DAC','DACBUS'].includes(c.type))){const reached=new Set(),todo=(dac.type==='DACBUS'?['p','n']:['out','ref']).map(pin=>net.endpointToNet[`${dac.id}:${pin}`]).filter(n=>n&&n!=='0');while(todo.length){const n=todo.pop();if(reached.has(n))continue;reached.add(n);for(const other of dependencies.get(n)??[])todo.push(other);}for(const adc of adcs)if(p.analysis.solver!=='coordinated'&&(adc.type==='ADCBUS'?['p','n']:['in','ref']).some(pin=>reached.has(net.endpointToNet[`${adc.id}:${pin}`])))error(`${dac.ref} can influence ${adc.ref} through the analog circuit. Select Coordinated transient for this closed-loop circuit. The ngspice replay mode requires independent analog input and output paths.`,dac.id,'MIXED_ANALOG_FEEDBACK');}
 if(adcs.length&&!p.circuit.components.some(c=>['DAC','DACBUS'].includes(c.type)||getPart(c.type).domain==='analog'&&c.type!=='GND'))error('An ADC requires an actual analog input circuit, not only ground symbols.');
 out.push({severity:'info',message:'Native digital simulation uses 0/1/X/Z states, transport delays and 1 ps resolution. Bus bit 0 is least significant; displayed words are MSB first. Initial settling is not a clock edge; setup/hold and analog metastability are not modeled.'});
 if(p.analysis.solver!=='coordinated'&&parts.some(c=>['ADC','DAC'].includes(c.type)))out.push({severity:'warning',message:'Mixed simulation uses bounded analog-input → digital → analog-output replay. ADC crossing times are interpolated from actual analog samples. DAC output must remain known 0/1; unresolved X/Z stops replay. Reduce the analog maximum step to improve crossing-time resolution.'});
}
export function checkCircuit(p){
 if(p.workspace==='netlist')return p.analysis.solver==='coordinated'?[{severity:'error',message:'Coordinated transient requires a schematic. Use ngspice for imported SPICE.'}]:[];
 if(p.analysis.solver==='coordinated'){
  const invalid=[];
  if(p.analysis.type!=='tran')invalid.push({severity:'error',message:'Coordinated simulation supports transient analysis only.'});
  for(const c of p.circuit.components)if(!DIGITAL_TYPES.includes(c.type)&&!['R','C','L','V','I','GND'].includes(c.type))invalid.push({severity:'error',componentId:c.id,message:`${c.ref}: ${getPart(c.type).name} is not supported by Coordinated transient. Use ngspice for this analog model; the coordinated analog subset is R, C, L and independent V/I sources.`});
  if(invalid.length)return invalid;
 }
 const net=buildNets(p),out=[...net.diagnostics],error=(message,componentId)=>out.push({severity:'error',message,componentId}),warning=(message,componentId)=>out.push({severity:'warning',message,componentId});
 if(!p.circuit.components.some(c=>c.type!=='GND'))error('Place components or open an example before running an analysis.');
 const hasAnalog=p.circuit.components.some(c=>c.type!=='GND'&&getPins(c).some(pin=>pin.domain==='analog'));
 if(hasAnalog&&!net.nets.some(n=>n.name==='0'))error('A ground reference is required for the analog circuit. Connect a Ground symbol.');
 const usedRef=new Set();for(const c of p.circuit.components){const d=getPart(c.type);if(usedRef.has(c.ref.toLowerCase()))error(`Duplicate reference ${c.ref}; rename one component.`,c.id);usedRef.add(c.ref.toLowerCase());if(d.model&&(!c.model||!MODELS[c.model]))error(`${c.ref}: model ${c.model||'(none)'} is unavailable. Choose a bundled model explicitly.`,c.id);else if(d.model&&c.model!==d.model)error(`${c.ref}: ${c.model} is not compatible with ${d.name}.`,c.id);
   for(const pin of getPins(c)){const e=`${c.id}:${pin.id}`,n=net.nets.find(n=>n.name===net.endpointToNet[e]);if(pin.domain==='digital'&&pin.direction==='output')continue;if(c.type!=='GND'&&n?.endpoints.length===1&&!p.circuit.labels.some(l=>l.target===e))error(`${c.ref} pin ${pin.name} is unconnected. Wire it to another pin or reference.`,c.id);}
   if(c.type==='GND')continue;
   const numeric=['R','C','L','NMOS','PMOS'].includes(c.type)?d.params:[];
   for(const par of numeric){try{const v=parseValue(c.params[par.key],par.unit);if(par.key!=='ic'&&v<=0)error(`${c.ref}: ${par.label} must be positive.`,c.id);}catch(e){error(`${c.ref}: ${e.message}`,c.id);}}
   if(['V','I'].includes(c.type)){const wave=c.params.waveform;if(!['dc','sin','pulse','pwl'].includes(wave))error(`${c.ref}: excitation ${wave} is unsupported.`,c.id);const keys=['dc','ac','phase',...(wave==='sin'?['offset','amplitude','frequency','delay']:wave==='pulse'?['low','high','delay','rise','fall','width','period']:[])];for(const key of keys){const par=d.params.find(p=>p.key===key);try{const v=parseValue(c.params[key],par.unit);if(['frequency','rise','fall','width','period'].includes(key)&&v<=0)error(`${c.ref}: ${par.label} must be positive.`,c.id);if(['delay','ac'].includes(key)&&v<0)error(`${c.ref}: ${par.label} must be nonnegative.`,c.id);}catch(e){error(`${c.ref}: ${e.message}`,c.id);}}if(wave==='pulse'){try{if(parseValue(c.params.width,'s')+parseValue(c.params.rise,'s')+parseValue(c.params.fall,'s')>parseValue(c.params.period,'s'))error(`${c.ref}: pulse width + rise + fall must not exceed its period.`,c.id);}catch{}}if(wave==='pwl'){try{parsePWL(c.params.pwl,c.type==='V'?'V':'A');}catch(e){error(`${c.ref}: ${e.message}`,c.id);}}}
   if(d.model&&d.domain==='analog')warning(`${c.ref}: ${MODELS[c.model]?.name??c.model} — ${MODELS[c.model]?.limitations??'unavailable model'}`,c.id);
 }
 // Connected islands must each reach reference through their own components.
 const graph=new Map(net.nets.filter(n=>n.domain==='analog').map(n=>[n.name,new Set()]));for(const c of p.circuit.components){if(['ADC','ADCBUS'].includes(c.type))continue;const ns=[...new Set(getPins(c).filter(pin=>pin.domain==='analog').map(pin=>net.endpointToNet[`${c.id}:${pin.id}`]))];for(const a of ns)for(const b of ns)graph.get(a)?.add(b);}
 const visited=new Set(),todo=['0'];while(todo.length){const x=todo.pop();if(visited.has(x))continue;visited.add(x);for(const y of graph.get(x)??[])todo.push(y);}for(const n of net.nets)if(n.domain==='analog'&&n.name!=='0'&&!visited.has(n.name))error(`Net ${n.name} belongs to a circuit island without a ground reference.`);
 for(const probe of p.probes){if(probe.kind==='current')continue;const domain=e=>net.nets.find(n=>n.name===net.endpointToNet[e])?.domain;if(probe.kind==='logic'){if(domain(probe.a)!=='digital')error(`${probe.label}: a logic probe must target a digital net. Use an ADC bridge to digitize analog voltage.`);}else if(domain(probe.a)!=='analog'||probe.kind==='differential'&&domain(probe.b)!=='analog')error(`${probe.label}: voltage measurements require analog nets. Use a logic probe on digital signals.`);}
 checkDigital(p,net,out);
 if(hasAnalog&&p.analysis.type==='ac'&&!p.circuit.components.some(c=>['V','I'].includes(c.type)&&safeValue(c.params.ac)>0))warning('No source has a nonzero AC amplitude. Small-signal response will be zero.');
 if(p.analysis.uic&&p.analysis.type==='tran')warning('Transient uses specified capacitor/inductor initial conditions (UIC); a DC operating point is skipped.');
 return out;
}
function safeValue(s){try{return parseValue(s);}catch{return 0;}}
