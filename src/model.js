import {getPart,parseValue,parsePWL,MODELS} from './library.js';
export const VERSION='1.0.0-rc.1';
export const SCHEMA_VERSION=1;
export const LIMITS={components:300,connections:1600,junctions:600,labels:600,annotations:300,probes:100,jsonBytes:256*1024*1024};
export const clone=value=>structuredClone(value);
export function uid(prefix='id'){return `${prefix}_${globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;}
export function newProject(title='Untitled circuit'){
 const now=new Date().toISOString();
 return {schemaVersion:SCHEMA_VERSION,appVersion:VERSION,id:uid('project'),title,revision:0,createdAt:now,updatedAt:now,question:'',notes:'',assumptions:[],circuit:{components:[],connections:[],junctions:[],labels:[]},layout:{components:{},wires:{},junctions:{},annotations:[]},analysis:{type:'ac',start:'1',stop:'100k',points:60,step:'10u',duration:'10m',source:'V1',sweepStart:'0',sweepStop:'10',sweepStep:'0.1',temperature:27,reltol:'1e-4',uic:false},probes:[],workspace:'schematic',netlistText:''};
}
const validId=id=>typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
const assert=(v,msg)=>{if(!v)throw new Error(msg);};
const object=(v,msg)=>{assert(v&&typeof v==='object'&&!Array.isArray(v),msg);return v;};
const text=(v,max,what)=>{assert(typeof v==='string'&&v.length<=max,`${what} must be text up to ${max} characters.`);return v;};
const finite=(v,what,min=-1e6,max=1e6)=>{assert(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,`${what} must be a finite number between ${min} and ${max}.`);return v;};
const coord=v=>{object(v,'Drawing position is missing.');return {x:finite(v.x,'X position'),y:finite(v.y,'Y position')};};
const array=(v,max,what)=>{assert(Array.isArray(v)&&v.length<=max,`${what} must be a list with at most ${max} items.`);return v;};
function uniqueId(id,seen,what){assert(validId(id),`Invalid ${what} identifier.`);assert(!seen.has(id),`Duplicate identifier ${id}.`);seen.add(id);return id;}
function endpointSet(project){return new Set([...project.circuit.components.flatMap(c=>getPart(c.type).pins.map(p=>`${c.id}:${p.id}`)),...project.circuit.junctions.map(j=>`j:${j.id}`)]);}
function validateParams(c){const d=getPart(c.type);const params={...d.defaults};object(c.params||{},`Parameters missing for ${c.ref}.`);for(const p of d.params){let v=c.params?.[p.key]??p.default;assert(typeof v==='string'||(typeof v==='number'&&Number.isFinite(v)),`${c.ref} ${p.label}: value must be text or a finite number.`);v=String(v);text(v,p.key==='pwl'?12000:100,`${c.ref} ${p.label}`);if(p.options)assert(p.options.includes(v),`${c.ref}: unsupported ${p.label}.`);params[p.key]=v;}return params;}
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
 for(const key of ['start','stop','step','duration','source','sweepStart','sweepStop','sweepStep','reltol']){if(key in a)p.analysis[key]=text(String(a[key]),100,`Analysis ${key}`);}
 p.analysis.points=finite(Number(a.points??60),'AC points per decade',1,1000);assert(Number.isInteger(p.analysis.points),'AC points per decade must be an integer.');p.analysis.temperature=finite(Number(a.temperature??27),'Temperature',-100,200);p.analysis.uic=!!a.uic;
 p.probes=array(input.probes??[],LIMITS.probes,'Probes').map(q=>{const id=uniqueId(q.id,ids,'probe');assert(['voltage','differential','current'].includes(q.kind),'Unsupported measurement kind.');const r={id,kind:q.kind,label:text(q.label??q.kind,100,'Probe label')};if(q.kind==='current'){const ci=q.componentId??q.a;assert(p.circuit.components.some(c=>c.id===ci),'Current probe refers to a missing component.');r.componentId=ci;r.a=ci;}else{r.a=endpoint(q.a);r.b=q.kind==='differential'?endpoint(q.b):null;}return r;});
 p.workspace=input.workspace??'schematic';assert(['schematic','netlist'].includes(p.workspace),'Unsupported workspace.');p.netlistText=text(input.netlistText??'',200000,'SPICE netlist');return p;
}
export function serializeProject(project){return JSON.stringify(validateProject(project),null,2);}
export function parseProject(json){assert(typeof json==='string'&&json.length<=LIMITS.jsonBytes,'Project file is too large.');let input;try{input=JSON.parse(json);}catch{throw new Error('This is not valid JSON. Choose a CircuitBench .circuitbench.json project file.');}return validateProject(input.project??input);}
export function addComponent(project,type,x=0,y=0){const d=getPart(type);assert(project.circuit.components.length<LIMITS.components,'This release supports at most 300 components per project.');const used=new Set(project.circuit.components.map(c=>c.ref.toLowerCase()));let n=1;while(used.has(`${d.prefix}${n}`.toLowerCase()))n++;const c={id:uid('c'),ref:`${d.prefix}${n}`,type,params:clone(d.defaults),model:d.model};project.circuit.components.push(c);project.layout.components[c.id]={x:Math.round(x/20)*20,y:Math.round(y/20)*20,rotation:0,mirror:false};return c;}
export function endpointPosition(project,endpoint){if(endpoint?.startsWith('j:'))return project.layout.junctions[endpoint.slice(2)]??null;const [id,pin]=String(endpoint).split(':');const c=project.circuit.components.find(c=>c.id===id),l=project.layout.components[id];if(!c||!l)return null;const p=getPart(c.type).pins.find(p=>p.id===pin);if(!p)return null;const angle=(l.rotation||0)*Math.PI/180,x=(l.mirror?-1:1)*p.x,y=p.y;return {x:l.x+Math.round(x*Math.cos(angle)-y*Math.sin(angle)),y:l.y+Math.round(x*Math.sin(angle)+y*Math.cos(angle))};}
export function removeItems(p,ids){
 const set=new Set(ids);const removedEndpoints=new Set(p.circuit.components.filter(c=>set.has(c.id)).flatMap(c=>getPart(c.type).pins.map(pin=>`${c.id}:${pin.id}`)));for(const j of p.circuit.junctions)if(set.has(j.id))removedEndpoints.add(`j:${j.id}`);
 p.circuit.components=p.circuit.components.filter(c=>{if(set.has(c.id)){delete p.layout.components[c.id];return false;}return true;});p.circuit.junctions=p.circuit.junctions.filter(j=>{if(set.has(j.id)){delete p.layout.junctions[j.id];return false;}return true;});
 p.circuit.connections=p.circuit.connections.filter(w=>{if(set.has(w.id)||removedEndpoints.has(w.a)||removedEndpoints.has(w.b)){delete p.layout.wires[w.id];return false;}return true;});
 p.circuit.labels=p.circuit.labels.filter(l=>!set.has(l.id)&&!removedEndpoints.has(l.target));p.layout.annotations=p.layout.annotations.filter(a=>!set.has(a.id));p.probes=p.probes.filter(q=>!set.has(q.id)&&!set.has(q.componentId??q.a)&&!removedEndpoints.has(q.a)&&!removedEndpoints.has(q.b));
}
export function duplicateItems(p,ids,offset=40){
 const selected=new Set(ids),map=new Map(),newIds=[],endpointMap=new Map();const old=clone(p);
 for(const c of old.circuit.components.filter(c=>selected.has(c.id))){const l=old.layout.components[c.id],n=addComponent(p,c.type,l.x+offset,l.y+offset);n.params=clone(c.params);n.model=c.model;p.layout.components[n.id]={...l,x:l.x+offset,y:l.y+offset};map.set(c.id,n.id);newIds.push(n.id);for(const pin of getPart(c.type).pins)endpointMap.set(`${c.id}:${pin.id}`,`${n.id}:${pin.id}`);}
 for(const j of old.circuit.junctions.filter(j=>selected.has(j.id))){const id=uid('j');map.set(j.id,id);endpointMap.set(`j:${j.id}`,`j:${id}`);p.circuit.junctions.push({id});const pos=old.layout.junctions[j.id];p.layout.junctions[id]={x:pos.x+offset,y:pos.y+offset};newIds.push(id);}
 for(const w of old.circuit.connections){if(endpointMap.has(w.a)&&endpointMap.has(w.b)){const id=uid('w');p.circuit.connections.push({id,a:endpointMap.get(w.a),b:endpointMap.get(w.b)});p.layout.wires[id]={points:(old.layout.wires[w.id]?.points??[]).map(pos=>({x:pos.x+offset,y:pos.y+offset}))};}}
 const copiedLabelNames=new Map();for(const l of old.circuit.labels.filter(l=>selected.has(l.id)&&endpointMap.has(l.target))){let name=copiedLabelNames.get(l.name.toLowerCase());if(!name){let base=l.name==='0'?'gnd_copy':l.name.slice(0,23)+'_copy',n=1;name=base;while(p.circuit.labels.some(x=>x.name.toLowerCase()===name.toLowerCase()))name=base.slice(0,27)+(n++);copiedLabelNames.set(l.name.toLowerCase(),name);}const id=uid('label');p.circuit.labels.push({id,name,target:endpointMap.get(l.target)});newIds.push(id);}
 for(const a of old.layout.annotations.filter(a=>selected.has(a.id))){const id=uid('note');p.layout.annotations.push({...a,id,x:a.x+offset,y:a.y+offset});newIds.push(id);}
 return newIds;
}
export function buildNets(p){
 const diagnostics=[],eps=[...endpointSet(p)],parent=new Map(eps.map(e=>[e,e]));
 function find(x){if(!parent.has(x))return null;let r=x;while(parent.get(r)!==r)r=parent.get(r);while(parent.get(x)!==x){let n=parent.get(x);parent.set(x,r);x=n;}return r;}
 function join(a,b){let x=find(a),y=find(b);if(x===null||y===null){diagnostics.push({severity:'error',message:`Wire refers to a missing pin or junction (${a}, ${b}).`});return;}if(x!==y)parent.set(y,x);}
 for(const w of p.circuit.connections)join(w.a,w.b);
 const ground=p.circuit.components.filter(c=>c.type==='GND').map(c=>`${c.id}:0`);const labelMap=new Map();
 for(const l of p.circuit.labels){const name=l.name.toLowerCase();if(!parent.has(l.target)){diagnostics.push({severity:'error',message:`Net label ${l.name} refers to a missing pin.`});continue;}if(labelMap.has(name))join(labelMap.get(name),l.target);else labelMap.set(name,l.target);if(name==='0')ground.push(l.target);}
 for(let i=1;i<ground.length;i++)join(ground[0],ground[i]);
 const groups=new Map();for(const e of eps){const r=find(e);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(e);}
 const root0=ground.length?find(ground[0]):null,endpointToNet=Object.create(null),nets=[];const usedNames=new Set(['0',...p.circuit.labels.map(l=>l.name.toLowerCase())]);let next=1;
 for(const [root,endpoints] of groups){const labels=p.circuit.labels.filter(l=>find(l.target)===root).map(l=>l.name.toLowerCase());let name;if(root===root0)name='0';else if(labels.length)name=[...new Set(labels)].sort()[0];else{while(usedNames.has(`n${next}`))next++;name=`n${next++}`;usedNames.add(name);}if(new Set(labels.filter(l=>l!=='0')).size>1)diagnostics.push({severity:'warning',message:`Connected labels ${[...new Set(labels)].join(', ')} are one net (${name}).`});nets.push({name,endpoints});for(const e of endpoints)endpointToNet[e]=name;}
 return {endpointToNet,nets,diagnostics};
}
export function checkCircuit(p){
 if(p.workspace==='netlist')return [];
 const net=buildNets(p),out=[...net.diagnostics],error=(message,componentId)=>out.push({severity:'error',message,componentId}),warning=(message,componentId)=>out.push({severity:'warning',message,componentId});
 if(!p.circuit.components.some(c=>c.type!=='GND'))error('Place components or open an example before running an analysis.');
 if(!net.nets.some(n=>n.name==='0'))error('A ground reference is required. Connect a Ground symbol to the circuit.');
 const usedRef=new Set();for(const c of p.circuit.components){const d=getPart(c.type);if(usedRef.has(c.ref.toLowerCase()))error(`Duplicate reference ${c.ref}; rename one component.`,c.id);usedRef.add(c.ref.toLowerCase());if(d.model&&(!c.model||!MODELS[c.model]))error(`${c.ref}: model ${c.model||'(none)'} is unavailable. Choose a bundled model explicitly.`,c.id);else if(d.model&&c.model!==d.model)error(`${c.ref}: ${c.model} is not compatible with ${d.name}.`,c.id);
   for(const pin of d.pins){const e=`${c.id}:${pin.id}`,n=net.nets.find(n=>n.name===net.endpointToNet[e]);if(c.type!=='GND'&&n?.endpoints.length===1&&!p.circuit.labels.some(l=>l.target===e))error(`${c.ref} pin ${pin.name} is unconnected. Wire it to another pin or reference.`,c.id);}
   if(c.type==='GND')continue;
   const numeric=['R','C','L','NMOS','PMOS'].includes(c.type)?d.params:[];
   for(const par of numeric){try{const v=parseValue(c.params[par.key],par.unit);if(par.key!=='ic'&&v<=0)error(`${c.ref}: ${par.label} must be positive.`,c.id);}catch(e){error(`${c.ref}: ${e.message}`,c.id);}}
   if(['V','I'].includes(c.type)){const wave=c.params.waveform;if(!['dc','sin','pulse','pwl'].includes(wave))error(`${c.ref}: excitation ${wave} is unsupported.`,c.id);const keys=['dc','ac','phase',...(wave==='sin'?['offset','amplitude','frequency','delay']:wave==='pulse'?['low','high','delay','rise','fall','width','period']:[])];for(const key of keys){const par=d.params.find(p=>p.key===key);try{const v=parseValue(c.params[key],par.unit);if(['frequency','rise','fall','width','period'].includes(key)&&v<=0)error(`${c.ref}: ${par.label} must be positive.`,c.id);if(['delay','ac'].includes(key)&&v<0)error(`${c.ref}: ${par.label} must be nonnegative.`,c.id);}catch(e){error(`${c.ref}: ${e.message}`,c.id);}}if(wave==='pulse'){try{if(parseValue(c.params.width,'s')+parseValue(c.params.rise,'s')+parseValue(c.params.fall,'s')>parseValue(c.params.period,'s'))error(`${c.ref}: pulse width + rise + fall must not exceed its period.`,c.id);}catch{}}if(wave==='pwl'){try{parsePWL(c.params.pwl,c.type==='V'?'V':'A');}catch(e){error(`${c.ref}: ${e.message}`,c.id);}}}
   if(d.model)warning(`${c.ref}: ${MODELS[c.model]?.name??c.model} — ${MODELS[c.model]?.limitations??'unavailable model'}`,c.id);
 }
 // Connected islands must each reach reference through their own components.
 const graph=new Map(net.nets.map(n=>[n.name,new Set()]));for(const c of p.circuit.components){const ns=[...new Set(getPart(c.type).pins.map(pin=>net.endpointToNet[`${c.id}:${pin.id}`]))];for(const a of ns)for(const b of ns)graph.get(a)?.add(b);}
 const visited=new Set(),todo=['0'];while(todo.length){const x=todo.pop();if(visited.has(x))continue;visited.add(x);for(const y of graph.get(x)??[])todo.push(y);}for(const n of net.nets)if(n.name!=='0'&&!visited.has(n.name))error(`Net ${n.name} belongs to a circuit island without a ground reference.`);
 if(p.analysis.type==='ac'&&!p.circuit.components.some(c=>['V','I'].includes(c.type)&&safeValue(c.params.ac)>0))warning('No source has a nonzero AC amplitude. Small-signal response will be zero.');
 if(p.analysis.uic&&p.analysis.type==='tran')warning('Transient uses specified capacitor/inductor initial conditions (UIC); a DC operating point is skipped.');
 return out;
}
function safeValue(s){try{return parseValue(s);}catch{return 0;}}
