/** Portable, immutable truth-table evidence is separate from time-domain runs. */
export function validateTruthTables(records,validateProject){
 if(records===undefined)return [];
 if(!Array.isArray(records)||records.length>4)throw new Error('A backup may contain at most four truth-table records.');
 const ids=new Set(),text=(v,n=200)=>typeof v==='string'&&v.length<=n;
 const identifier=v=>text(v,100)&&/^[A-Za-z][A-Za-z0-9_-]*$/.test(v);
 const width=v=>Number.isInteger(v)&&v>=1&&v<=8;
 const word=(v,w,binary=false)=>typeof v==='string'&&v.length===w&&(binary?/^[01]+$/:/^[01XZ]+$/).test(v);
 return records.map(record=>{
  if(!record||!identifier(record.id)||ids.has(record.id)||record.kind!=='truth-table'||record.status!=='completed')throw new Error('A saved truth-table record is malformed.');
  ids.add(record.id);
  const snapshot=validateProject(record.projectSnapshot);
  if(snapshot.id!==record.projectId||snapshot.revision!==record.revision)throw new Error('A saved truth table does not match its circuit snapshot.');
  if(!text(record.startedAt,80)||!Number.isFinite(Date.parse(record.startedAt))||!text(record.completedAt,80)||!Number.isFinite(Date.parse(record.completedAt)))throw new Error('A saved truth-table timestamp is invalid.');
  if(record.simulation?.mode!=='digital'||!text(JSON.stringify(record.simulation),256000))throw new Error('A saved truth table needs its bounded digital simulation plan.');
  const result=record.result;
  if(!result||result.kind!=='truth-table'||!Array.isArray(result.inputs)||!result.inputs.length||result.inputs.length>8||!Array.isArray(result.outputs)||!result.outputs.length||result.outputs.length>32)throw new Error('Saved truth-table columns are invalid.');
  const inputNames=new Set(),outputNames=new Set();
  for(const input of result.inputs){if(!identifier(input.id)||inputNames.has(input.id)||!text(input.label)||!width(input.width)||input.bitOrder!=='msb-first')throw new Error('Saved truth-table input metadata is invalid.');inputNames.add(input.id);}
  for(const output of result.outputs){if(!text(output.name)||!output.name||outputNames.has(output.name)||!text(output.label??output.name)||!width(output.width)||output.kind!==(output.width===1?'logic':'bus')||output.bitOrder!=='msb-first')throw new Error('Saved truth-table output metadata is invalid.');outputNames.add(output.name);}
  const bits=result.inputs.reduce((n,input)=>n+input.width,0);
  if(bits>8||!Array.isArray(result.rows)||result.rows.length!==2**bits)throw new Error('Saved truth table must contain every binary input combination, up to eight bits.');
  if(!Array.isArray(record.inputIds)||JSON.stringify(record.inputIds)!==JSON.stringify(result.inputs.map(input=>input.id))||!Array.isArray(record.outputNames)||JSON.stringify(record.outputNames)!==JSON.stringify(result.outputs.map(output=>output.name)))throw new Error('Saved truth-table columns disagree with their recorded selection.');
  for(let index=0;index<result.rows.length;index++){
   const row=result.rows[index];
   if(!row||row.index!==index||!Array.isArray(row.inputs)||row.inputs.length!==result.inputs.length||!Array.isArray(row.outputs)||row.outputs.length!==result.outputs.length||row.inputs.some((value,i)=>!word(value,result.inputs[i].width,true))||row.outputs.some((value,i)=>!word(value,result.outputs[i].width)))throw new Error('Saved truth-table rows have invalid widths or states.');
   if(row.inputs.join('')!==index.toString(2).padStart(bits,'0'))throw new Error('Saved truth-table input rows are missing, duplicated or out of order.');
  }
  if(typeof result.settleTime!=='number'||!Number.isFinite(result.settleTime)||result.settleTime<0||result.settleTime>Number.MAX_SAFE_INTEGER*1e-12)throw new Error('Saved truth-table settling time is invalid.');
  if(!result.engine||typeof result.engine!=='object'||!text(JSON.stringify(result.engine),40000)||!Array.isArray(result.logs??[])||(result.logs??[]).some(v=>!text(v,40000))||!Array.isArray(result.warnings??[])||(result.warnings??[]).some(v=>!text(v,40000))||!text(JSON.stringify(record),2000000))throw new Error('Saved truth-table provenance is malformed or too large.');
  const out=structuredClone(record);out.projectSnapshot=snapshot;return out;
 });
}
