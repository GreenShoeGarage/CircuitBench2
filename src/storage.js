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
 const runs=incoming.map(r=>{
   if(!r||typeof r!=='object'||!validId(r.id)||ids.has(r.id)||!['running','completed','completed-with-warnings','cancelled','timed-out','failed'].includes(r.status))throw new Error('A saved simulation record is malformed or has a duplicate identifier.');ids.add(r.id);
   if(typeof r.netlist!=='string'||r.netlist.length>256000)throw new Error('A saved run has no valid netlist.');
   if(!Number.isInteger(r.revision)||r.revision<0)throw new Error('A saved run has an invalid revision.');
   const snapshot=validateProject(r.projectSnapshot);
   if(snapshot.revision!==r.revision||snapshot.id!==r.projectId)throw new Error('A saved run does not match its immutable circuit snapshot.');
   if(!r.analysis||JSON.stringify(validateProject({...snapshot,analysis:r.analysis}).analysis)!==JSON.stringify(snapshot.analysis))throw new Error('A saved run has analysis settings inconsistent with its snapshot.');
   if(!text(r.startedAt,80)||!Number.isFinite(Date.parse(r.startedAt)))throw new Error('A saved run timestamp is invalid.');
   const complete=['completed','completed-with-warnings'].includes(r.status);
   if(complete&&(!r.result||!Array.isArray(r.result.vectors)||!r.result.vectors.length))throw new Error('A completed run must include numerical results.');
   if(!complete&&r.result)throw new Error('An incomplete run cannot be imported with completed numerical evidence.');
   const vectors=r.result?.vectors??[];if(!Array.isArray(vectors)||vectors.length>256)throw new Error('Saved run contains too many vectors.');
   let length=null;
   for(const v of vectors){if(typeof v.name!=='string'||v.name.length>200||!Array.isArray(v.values)||v.values.length>250000)throw new Error('Saved vector data is invalid.');if(length!==null&&v.values.length!==length)throw new Error('Saved vector lengths do not match.');length=v.values.length;samples+=v.values.length;if(v.values.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw new Error('Saved numerical results contain invalid values.');if(v.imag&&(!Array.isArray(v.imag)||v.imag.length!==v.values.length||v.imag.some(x=>typeof x!=='number'||!Number.isFinite(x))))throw new Error('Saved complex results are invalid.');}
   if(samples>4000000)throw new Error('Backup exceeds the four million saved sample limit. Export large runs separately as CSV.');
   if(complete&&(!length||r.result.points!==length))throw new Error('Saved run point count does not match its raw results.');
   if(!Array.isArray(r.measurements??[])||(r.measurements??[]).length>1024)throw new Error('Saved measurements are malformed.');
   for(const m of r.measurements??[]){if(!m||typeof m!=='object'||!text(m.id,200)||!text(m.label,200)||!['V','A'].includes(m.unit)||!['voltage','differential','current'].includes(m.kind))throw new Error('A saved measurement definition is invalid.');for(const key of ['vector','a','b'])if(m[key]!==undefined&&!text(m[key],200))throw new Error('A saved measurement vector is invalid.');if(m.resistance!==undefined&&(!(typeof m.resistance==='number')||!Number.isFinite(m.resistance)||m.resistance<=0))throw new Error('A saved resistor-current measurement is invalid.');}
   if(!Array.isArray(r.logs??[])||(r.logs??[]).length>20000||(r.logs??[]).some(x=>!text(x,40000))||!Array.isArray(r.diagnostics??[])||(r.diagnostics??[]).some(d=>!d||!['error','warning','info'].includes(d.severity)||!text(d.message,40000)))throw new Error('Saved run diagnostics are malformed.');
   if(r.result&&(!Array.isArray(r.result.warnings??[])||(r.result.warnings??[]).some(x=>!text(x,40000))))throw new Error('Saved engine warnings are invalid.');
   if(!Array.isArray(r.models??[])||(r.models??[]).some(m=>!m||!text(m.name,200)||!text(m.definition??'',40000)))throw new Error('Saved model provenance is invalid.');
   const out=structuredClone(r);out.projectSnapshot=snapshot;out.analysis=structuredClone(snapshot.analysis);if(out.status==='running'){out.status='failed';out.error='This run was interrupted before completion. Run the experiment again.';out.result=null;}return out;
 });
 return {format:'CircuitBench',formatVersion:1,project:p,runs,activeRunId:typeof input.activeRunId==='string'?input.activeRunId:null,baselineId:typeof input.baselineId==='string'?input.baselineId:null};
}
