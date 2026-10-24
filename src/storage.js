import {validateTruthTables} from './truth-table-evidence.js';
import {validateTimingRecords} from './timing-evidence.js';
import {validateExperimentRecords} from './experiments.js';
import {validateContinuousProvenance} from './continuous-evidence.js';
/** Browser-local persistence. Disk imports are never written back implicitly. */
const DATABASE='circuitbench-v1';
let database;
function openDB(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(new Error('This browser does not allow local project storage. Download backups to preserve your work.'));const q=indexedDB.open(DATABASE,1);q.onupgradeneeded=()=>q.result.createObjectStore('state');q.onsuccess=()=>{database=q.result;database.onversionchange=()=>database.close();resolve(database);};q.onerror=()=>reject(q.error);});}
async function read(key){const db=database||await openDB();return new Promise((resolve,reject)=>{const t=db.transaction('state','readonly'),q=t.objectStore('state').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
export async function loadCurrent(){return read('current');}
export async function loadRecovery(){return read('previous');}
export async function saveCurrent(envelope){const db=database||await openDB();return new Promise((resolve,reject)=>{const t=db.transaction('state','readwrite'),s=t.objectStore('state');const q=s.get('current');q.onsuccess=()=>{if(q.result)s.put(q.result,'previous');s.put(envelope,'current');};t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error||new Error('Local save failed.'));t.onabort=()=>reject(t.error||new Error('Local save interrupted.'));});}
export function preference(key,value){try{if(value!==undefined){localStorage.setItem(`circuitbench:${key}`,JSON.stringify(value));return value;}const raw=localStorage.getItem(`circuitbench:${key}`);return raw?JSON.parse(raw):null;}catch{return null;}}
export async function hashText(text){if(!globalThis.crypto?.subtle)return 'unavailable-in-insecure-context';const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
export function download(name,content,type='application/octet-stream'){const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;(document.querySelector('dialog[open]')||document.body).append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function filename(title){return String(title).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'CircuitBench';}
export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeEnvelope(input,validateProject){
 if(!input||typeof input!=='object')throw new Error('The project backup is not an object.');
 const p=validateProject(input.project??input),incoming=input.runs??[];
 if(!Array.isArray(incoming)||incoming.length>12)throw new Error('A project backup may contain at most 12 run records.');
 let samples=0;const ids=new Set();
 const text=(v,max=1000)=>typeof v==='string'&&v.length<=max;
 const validId=v=>text(v,100)&&/^[A-Za-z][A-Za-z0-9_-]*$/.test(v);
 const digital=v=>v?.kind==='logic'||v?.kind==='bus';
 const busWidth=v=>Number.isInteger(v)&&v>=2&&v<=8;
 const stateFor=(value,vector)=>typeof value==='string'&&value.length===(vector.kind==='bus'?vector.width:1)&&/^[01XZ]+$/.test(value);
 const runs=incoming.map(r=>{
   if(!r||typeof r!=='object'||!validId(r.id)||ids.has(r.id)||!['running','completed','completed-with-warnings','cancelled','timed-out','failed'].includes(r.status))throw new Error('A saved simulation record is malformed or has a duplicate identifier.');ids.add(r.id);
   if(typeof r.netlist!=='string'||r.netlist.length>256000)throw new Error('A saved run has no valid netlist.');
   if(r.coordinatedPlan!=null&&(!r.coordinatedPlan||r.coordinatedPlan.kind!=='coordinated-transient'||r.coordinatedPlan.version!==1||!text(JSON.stringify(r.coordinatedPlan),256000)))throw new Error('A saved coordinated execution plan is invalid or too large.');
   if(r.simulation!=null&&(!r.simulation||typeof r.simulation!=='object'||Array.isArray(r.simulation)||!['digital','mixed'].includes(r.simulation.mode)||!text(JSON.stringify(r.simulation),256000)))throw new Error('A saved digital simulation plan is invalid or too large.');
   if(!Number.isInteger(r.revision)||r.revision<0)throw new Error('A saved run has an invalid revision.');
   if(r.failure!=null){const f=r.failure;if(!f||typeof f!=='object'||Array.isArray(f)||!text(f.phase,100)||!text(f.code??'',100)||!text(f.assetUrl??'',4000)||!text(f.contentType??'',200)||(f.httpStatus!=null&&(!Number.isInteger(f.httpStatus)||f.httpStatus<100||f.httpStatus>599)))throw new Error('Saved engine startup diagnostics are malformed.');}
   const snapshot=validateProject(r.projectSnapshot);
   if(snapshot.revision!==r.revision||snapshot.id!==r.projectId)throw new Error('A saved run does not match its immutable circuit snapshot.');
   if(!r.analysis||JSON.stringify(validateProject({...snapshot,analysis:r.analysis}).analysis)!==JSON.stringify(snapshot.analysis))throw new Error('A saved run has analysis settings inconsistent with its snapshot.');
   if(!text(r.startedAt,80)||!Number.isFinite(Date.parse(r.startedAt)))throw new Error('A saved run timestamp is invalid.');
   const complete=['completed','completed-with-warnings'].includes(r.status);
   if(complete&&(!r.result||!Array.isArray(r.result.vectors)||!r.result.vectors.length))throw new Error('A completed run must include numerical results.');
   if(!complete&&r.result)throw new Error('An incomplete run cannot be imported with completed numerical evidence.');
   const vectors=r.result?.vectors??[];if(!Array.isArray(vectors)||vectors.length>256)throw new Error('Saved run contains too many vectors.');
   let length=null,hasLogic=false;
   for(const v of vectors){
     if(typeof v.name!=='string'||v.name.length>200||!Array.isArray(v.values)||v.values.length>250000)throw new Error('Saved vector data is invalid.');
     if(length!==null&&v.values.length!==length)throw new Error('Saved vector lengths do not match.');length=v.values.length;samples+=v.values.length;
     if(digital(v)){
       hasLogic=true;
       if(v.kind==='bus'&&(!busWidth(v.width)||v.bitOrder!=='msb-first'))throw new Error('Saved bus results require a width from 2 to 8 and explicit MSB-first bit order.');
       if(v.kind==='logic'&&((v.width!==undefined&&v.width!==1)||(v.bitOrder!==undefined&&v.bitOrder!=='msb-first')))throw new Error('Saved scalar logic results must have one bit.');
       if(v.unit!=='logic'||v.imag!==undefined||v.values.some(x=>!stateFor(x,v)))throw new Error('Saved logic results must contain literal 0, 1, X or Z states at their declared width, with no complex values.');
     }else{
       if(v.unit==='logic'||v.values.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw new Error('Saved numerical results contain invalid values.');
       if(v.imag&&(!Array.isArray(v.imag)||v.imag.length!==v.values.length||v.imag.some(x=>typeof x!=='number'||!Number.isFinite(x))))throw new Error('Saved complex results are invalid.');
     }
   }
   if(hasLogic){
     const time=vectors.find(v=>v.name==='time'&&!digital(v));
     if(snapshot.analysis.type!=='tran'||!time||time.unit!=='s'||time.values.some((x,i)=>x<0||(i>0&&x<=time.values[i-1])))throw new Error('Saved logic results require a strictly increasing transient time axis.');
   }
   if(r.result?.sampling!==undefined){
     const s=r.result.sampling;
     if(!s||typeof s!=='object'||Array.isArray(s)||!text(s.mode,80)||!text(s.description??'',4000))throw new Error('Saved sampling provenance is malformed.');
     if(s.mode==='event-union'&&!Array.isArray(s.analogSampleIndices))throw new Error('Saved mixed-signal results must identify original analog sample positions.');
     if(s.analogSampleIndices!==undefined&&(!Array.isArray(s.analogSampleIndices)||s.analogSampleIndices.length>250000||s.analogSampleIndices.some((x,i)=>!Number.isInteger(x)||x<0||x>=length||(i>0&&x<=s.analogSampleIndices[i-1]))))throw new Error('Saved analog sample provenance is invalid.');
   }
   if(r.result?.analogNetlists!==undefined&&(!Array.isArray(r.result.analogNetlists)||r.result.analogNetlists.length>4||r.result.analogNetlists.some(deck=>!text(deck,256000))))throw new Error('Saved analog execution inputs are invalid or too large.');
   if(r.result?.bridgeAssumptions!==undefined&&(!Array.isArray(r.result.bridgeAssumptions)||r.result.bridgeAssumptions.length>20||r.result.bridgeAssumptions.some(value=>!text(value,4000))))throw new Error('Saved mixed-signal assumptions are malformed.');
   if(r.result?.continuous!==undefined||r.result?.sampling?.mode==='continuous-window'){
     const t=vectors.find(v=>v.name==='time');
     if(!t||t.unit!=='s'||!t.values.length||t.values.some((value,i)=>value<0||i>0&&value<=t.values[i-1]))throw new Error('Saved continuous history requires a strictly increasing time axis.');
     validateContinuousProvenance(r.result.continuous,snapshot,{timeBounds:[t.values[0],t.values.at(-1)],points:length,sampling:r.result.sampling});
   }
   if(r.result?.digitalEvents!==undefined){
     const series=r.result.digitalEvents,time=vectors.find(v=>v.name==='time')?.values,eventNames=new Set();
     if(!Array.isArray(series)||series.length>256||!time)throw new Error('Saved digital event records are malformed.');
     for(const entry of series){
       const vector=vectors.find(v=>v.name===entry?.name&&digital(v));
       if(!vector||eventNames.has(entry.name)||!Array.isArray(entry.events)||!entry.events.length||entry.events.length>250000)throw new Error('Saved digital event records are malformed.');
       if((entry.kind!==undefined&&entry.kind!==vector.kind)||(entry.width!==undefined&&entry.width!==(vector.width??1))||(entry.bitOrder!==undefined&&entry.bitOrder!=='msb-first'))throw new Error('Saved digital event widths and kinds must match their trace.');
       eventNames.add(entry.name);
       samples+=entry.events.length;
       if(entry.events.some((e,i)=>!e||typeof e.time!=='number'||!Number.isFinite(e.time)||e.time<0||e.time>time.at(-1)||!stateFor(e.value,vector)||(i===0?e.time!==(r.result.sampling?.mode==='continuous-window'?time[0]:0):e.time<=entry.events[i-1].time||e.value===entry.events[i-1].value)))throw new Error('Saved digital events must be ordered state changes beginning at the retained time boundary.');
       let at=0;for(let i=0;i<time.length;i++){while(at+1<entry.events.length&&entry.events[at+1].time<=time[i])at++;if(vector.values[i]!==entry.events[at].value)throw new Error('Saved digital events disagree with their sampled logic trace.');}
     }
   }
   if(samples>4000000)throw new Error('Backup exceeds the four million saved sample limit. Export large runs separately as CSV.');
   if(complete&&(!length||r.result.points!==length))throw new Error('Saved run point count does not match its raw results.');
   if(!Array.isArray(r.measurements??[])||(r.measurements??[]).length>1024)throw new Error('Saved measurements are malformed.');
   for(const m of r.measurements??[]){if(!m||typeof m!=='object'||!text(m.id,200)||!text(m.label,200)||!['V','A','logic'].includes(m.unit)||!['voltage','differential','current','logic','bus'].includes(m.kind)||digital(m)!==(m.unit==='logic'))throw new Error('A saved measurement definition is invalid.');for(const key of ['vector','a','b'])if(m[key]!==undefined&&!text(m[key],200))throw new Error('A saved measurement vector is invalid.');if(m.resistance!==undefined&&(!(typeof m.resistance==='number')||!Number.isFinite(m.resistance)||m.resistance<=0))throw new Error('A saved resistor-current measurement is invalid.');if(m.kind==='bus'){const v=vectors.find(v=>v.name.toLowerCase()===m.vector?.toLowerCase());if(!busWidth(m.width)||(m.bitOrder!==undefined&&m.bitOrder!=='msb-first')||(complete&&(!v||v.kind!=='bus'||v.width!==m.width)))throw new Error('Saved bus measurements must match the declared bus vector width.');}}
   if(!Array.isArray(r.logs??[])||(r.logs??[]).length>20000||(r.logs??[]).some(x=>!text(x,40000))||!Array.isArray(r.diagnostics??[])||(r.diagnostics??[]).some(d=>!d||!['error','warning','info'].includes(d.severity)||!text(d.message,40000)))throw new Error('Saved run diagnostics are malformed.');
   if(r.result&&(!Array.isArray(r.result.warnings??[])||(r.result.warnings??[]).some(x=>!text(x,40000))))throw new Error('Saved engine warnings are invalid.');
   if(!Array.isArray(r.models??[])||(r.models??[]).some(m=>!m||!text(m.name,200)||!text(m.definition??'',40000)))throw new Error('Saved model provenance is invalid.');
   const out=structuredClone(r);out.projectSnapshot=snapshot;out.analysis=structuredClone(snapshot.analysis);if(out.status==='running'){out.status='failed';out.error='This run was interrupted before completion. Run the experiment again.';out.result=null;}return out;
 });
 const truthTables=validateTruthTables(input.truthTables,validateProject);
 const timingMeasurements=validateTimingRecords(input.timingMeasurements,validateProject,{runs});
 const analogExperiments=validateExperimentRecords(input.analogExperiments,validateProject);
 return {format:'CircuitBench',formatVersion:1,project:p,runs,truthTables,timingMeasurements,analogExperiments,activeRunId:typeof input.activeRunId==='string'?input.activeRunId:null,baselineId:typeof input.baselineId==='string'?input.baselineId:null};
}
