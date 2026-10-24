import {escapeHTML as esc} from './storage.js';
import {formatNumber} from './plots.js';
import {parseLogicWord} from './library.js';

export function normalizeLUTRows(rows,outputBits){return rows.map((word,index)=>{try{return parseLogicWord(String(word).trim(),outputBits);}catch(error){throw new Error(`Row ${index}: ${error.message}`);}});}

export function truthTableChoices(project,generated){
 const plan=generated?.simulation,errors=(generated?.diagnostics??[]).filter(d=>d.severity==='error');
 let reason=errors.length?errors.map(d=>d.message).join(' '):'';
 if(!reason&&plan?.mode!=='digital')reason='Truth tables require a purely digital combinational circuit.';
 if(!reason&&(project.circuit.components.some(c=>['CLOCK','PATTERN','DFF','REGISTER','COUNTER','ADC','DAC'].includes(c.type))))reason='Use a transient run for clocks, timed patterns, stateful parts or bridges. Truth tables enumerate combinational logic driven by Logic input or Bus input parts.';
 const inputs=(plan?.digital?.inputGroups??[]).map(input=>({id:input.id,label:input.label,width:input.width??1}));
 const labels=new Map();for(const m of generated?.measurements??[])if(m.vector)labels.set(m.vector.toLowerCase(),m.label);
 const probeIds=new Set(project.probes.map(p=>p.id)),preferred=new Set((generated?.measurements??[]).filter(m=>probeIds.has(m.id)).map(m=>m.vector?.toLowerCase()));
 const outputs=(plan?.digital?.probes??[]).map(output=>({name:output.name,label:labels.get(output.name.toLowerCase())??output.name,width:output.width??output.bits?.length??1,preferred:preferred.has(output.name.toLowerCase())}));
 if(!reason&&!inputs.length)reason='Add a Logic input or Bus input to enumerate its binary values.';
 if(!reason&&!outputs.length)reason='Add an output connection or probe to inspect.';
 return {inputs,outputs,reason};
}

export function truthTableCSV(record){
 const {inputs,outputs,rows}=record.result,q=value=>'"'+String(value??'').replaceAll('"','""')+'"';
 const headings=['Row',...inputs.map(x=>`${x.label} [${x.width} bit input, MSB first]`),...outputs.map(x=>`${x.label??x.name} [${x.width} bit output, MSB first]`)];
 return [headings,...rows.map(row=>[row.index,...row.inputs,...row.outputs])].map(row=>row.map(q).join(',')).join('\r\n');
}

export function truthTableResultHTML(record,currentProject){
 const {inputs,outputs,rows,settleTime,engine}=record.result,outdated=record.projectId!==currentProject.id||record.revision!==currentProject.revision;
 return `<p class="helper">${esc(record.projectSnapshot.title)} · revision ${record.revision} · ${rows.length} binary combinations. Words are MSB first. Each row is settled independently; this table does not describe hazards between input changes.</p>${outdated?'<div class="notice warning">The working circuit has changed. This table belongs to its captured revision.</div>':''}${record.importedFromBackup?'<p class="helper">Restored evidence; not independently recomputed during import.</p>':''}<div class="truth-table-scroll"><table class="data-table truth-table-data"><thead><tr><th scope="col">Row</th>${inputs.map(x=>`<th scope="col">${esc(x.label)}<small>Input · ${x.width} bit${x.width===1?'':'s'}</small></th>`).join('')}${outputs.map(x=>`<th scope="col">${esc(x.label??x.name)}<small>Output · ${x.width} bit${x.width===1?'':'s'}</small></th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${row.index}</th>${row.inputs.map(value=>`<td class="mono">${esc(value)}</td>`).join('')}${row.outputs.map(value=>`<td class="mono ${value.includes('X')?'logic-unknown':value.includes('Z')?'logic-released':''}">${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="helper">Settling interval: ${esc(formatNumber(settleTime,'s',6))} · ${esc(engine.name)} ${esc(engine.version)} · ${esc(engine.build??'')}.</p>${(record.result.warnings??[]).map(w=>`<div class="notice warning">${esc(w)}</div>`).join('')}<details><summary>Captured circuit and execution plan</summary><p class="helper">Plan SHA-256: ${esc(record.simulationHash??'Not recorded')}. Download table evidence to retain the complete circuit, plan and engine identity.</p><pre class="truth-plan">${esc(JSON.stringify(record.simulation,null,2))}</pre></details>`;
}

export function lutRowsHTML(rows,inputBits,outputBits){
 return `<div class="truth-table-scroll"><table class="data-table lut-grid"><thead><tr><th scope="col">Input [${inputBits-1}:0]</th><th scope="col">Output [${outputBits-1}:0]</th></tr></thead><tbody>${rows.map((word,index)=>{const address=index.toString(2).padStart(inputBits,'0');return `<tr><th scope="row" class="mono">${address}</th><td><input class="mono" data-lut-row="${index}" aria-label="Output for input ${address}" value="${esc(word)}" maxlength="16" autocomplete="off" spellcheck="false"></td></tr>`;}).join('')}</tbody></table></div>`;
}
