import {escapeHTML as esc} from './storage.js';
import {formatNumber} from './plots.js';
import {parseValue} from './library.js';
import {getTimingSignals,normalizeTimingSpec} from './timing.js';

export const TIMING_KIND_LABELS=Object.freeze({delay:'Propagation delay','pulse-width':'Pulse width',period:'Period',frequency:'Frequency','duty-cycle':'Duty cycle'});
const HELP={
 delay:'Pair each source edge with the first matching target edge at or after it, before the next matching source edge. This is a time difference between selected events; it does not prove a causal path.',
 'pulse-width':'Measure each complete high or low pulse between opposite edges. A pulse already in progress at the start of the window has no observed opening edge.',
 period:'Measure between consecutive matching edges. A complete, known cycle is required.',
 frequency:'Calculate 1 / period for each complete, known cycle between consecutive matching edges.',
 'duty-cycle':'Measure the percentage of each complete cycle spent high. The selected edge starts the cycle; duty cycle always refers to the high state.'
};
const STATUS={measured:'Measured',indeterminate:'Indeterminate','missing-edge':'Missing edge'};
const sameSignal=(a,b)=>a?.name===b?.name&&a?.bit===b?.bit;
const selection=signal=>({name:signal.name,...(signal.bit===undefined?{}:{bit:signal.bit})});
const rawTime=value=>Number.isFinite(value)?`${String(value)} s`:'—';
const valueText=(value,unit)=>!Number.isFinite(value)?'—':unit==='%'?`${Number(value.toPrecision(8))} %`:formatNumber(value,unit,8);
const exactValue=(value,unit)=>Number.isFinite(value)?`${String(value)} ${unit}`:'—';

function unavailableReason(run){
 if(!run)return 'Run a digital or mixed-signal transient experiment, then select its completed run to measure timing.';
 if(!['completed','completed-with-warnings'].includes(run.status))return 'Select a completed run to measure its saved digital events.';
 if(run.analysis?.type!=='tran')return 'Timing measurements require a transient run with digital signals.';
 return 'This run has no usable saved digital events. Run a digital or mixed-signal circuit again to capture timing evidence.';
}

function setupState(run,spec){
 let signals;
 try{signals=getTimingSignals(run);}catch(error){return {signals:[],reason:error.message};}
 if(!signals.length)return {signals,reason:unavailableReason(run)};
 const source=signals.find(signal=>sameSignal(signal,spec?.source))??signals[0];
 const target=signals.find(signal=>sameSignal(signal,spec?.target))??signals.find(signal=>!sameSignal(signal,source))??source;
 const kind=Object.hasOwn(TIMING_KIND_LABELS,spec?.kind)?spec.kind:'delay';
 try{
  const normalized=normalizeTimingSpec(run,{...spec,kind,source:selection(source),...(kind==='delay'?{target:selection(target),targetEdge:spec?.targetEdge??'rising'}:{})});
  return {signals,spec:normalized,sourceIndex:signals.indexOf(source),targetIndex:signals.indexOf(target),reason:''};
 }catch(error){return {signals,reason:error.message};}
}

function signalOptions(signals,index){return signals.map((signal,i)=>`<option value="${i}"${i===index?' selected':''}>${esc(signal.label)} · ${esc(signal.name)}</option>`).join('');}
function edgeOptions(kind,edge){return ['rising','falling'].map(value=>`<option value="${value}"${value===edge?' selected':''}>${kind==='pulse-width'?(value==='rising'?'High pulse · rising to falling':'Low pulse · falling to rising'):(value==='rising'?'Rising · 0 → 1':'Falling · 1 → 0')}</option>`).join('');}

/** Render a setup draft. App owns modal lifecycle, history clicks and Measure. */
export function timingSetupHTML(run,{spec,records=[]}={}){
 const state=setupState(run,spec),history=timingHistoryHTML(records);
 if(state.reason)return `${history}<div class="notice warning" role="status">${esc(state.reason)}</div>`;
 const s=state.spec,delay=s.kind==='delay';
 return `<div class="timing-setup"><p>Measure timing from the selected run’s saved digital events. Choose a signal or an individual bus bit, then the time window to inspect.</p><p class="helper timing-run-context">${esc(run.projectSnapshot?.title??'Captured circuit')} · revision ${esc(run.revision)} · run <span class="mono">${esc(run.id)}</span></p><label class="field" for="timing-kind">Measurement<select id="timing-kind">${Object.entries(TIMING_KIND_LABELS).map(([kind,label])=>`<option value="${kind}"${kind===s.kind?' selected':''}>${label}</option>`).join('')}</select></label><div class="timing-fields"><label class="field" for="timing-source"><span id="timing-source-label">${delay?'Source signal':'Signal'}</span><select id="timing-source">${signalOptions(state.signals,state.sourceIndex)}</select></label><label class="field" for="timing-edge"><span id="timing-edge-label">${s.kind==='pulse-width'?'Pulse level':delay?'Source edge':'Cycle start edge'}</span><select id="timing-edge">${edgeOptions(s.kind,s.edge)}</select></label></div><div id="timing-target-fields" class="timing-fields"${delay?'':' hidden'}><label class="field" for="timing-target">Target signal<select id="timing-target"${delay?'':' disabled'}>${signalOptions(state.signals,state.targetIndex)}</select></label><label class="field" for="timing-target-edge">Target edge<select id="timing-target-edge"${delay?'':' disabled'}>${edgeOptions('delay',s.targetEdge??'rising')}</select></label></div><p id="timing-kind-help" class="helper timing-policy">${esc(HELP[s.kind])}</p><fieldset class="timing-window"><legend>Measurement window</legend><div class="timing-fields"><label class="field" for="timing-start">From (s)<input id="timing-start" type="text" inputmode="text" value="${esc(s.window.start)}" autocomplete="off" spellcheck="false" aria-describedby="timing-window-help"></label><label class="field" for="timing-end">To (s)<input id="timing-end" type="text" inputmode="text" value="${esc(s.window.end)}" autocomplete="off" spellcheck="false" aria-describedby="timing-window-help"></label></div><p id="timing-window-help" class="helper">Both edges must be inside this window. Engineering values are accepted, for example 2 ns, 500p or 1e-6 s. Bus bit 0 is the least-significant bit.</p></fieldset><p class="helper timing-policy">Only direct 0 → 1 and 1 → 0 transitions count as edges. Unknown X and released Z intervals remain explicit; incomplete or ambiguous intervals have no numeric result. Up to 256 occurrences are retained.</p><p id="timing-error" class="error-inline" role="alert"></p><div class="dialog-actions"><button id="timing-measure" class="primary">Measure timing</button></div></div>${history}`;
}

/** Preserve draft inputs while changing labels and controls for another kind. */
export function updateTimingSetup(container){
 const field=id=>container.querySelector(`#${id}`),kind=field('timing-kind')?.value;
 if(!Object.hasOwn(TIMING_KIND_LABELS,kind))throw new Error('Choose a supported timing measurement.');
 const delay=kind==='delay',edge=field('timing-edge');
 field('timing-target-fields').hidden=!delay;
 field('timing-target').disabled=!delay;field('timing-target-edge').disabled=!delay;
 field('timing-source-label').textContent=delay?'Source signal':'Signal';
 field('timing-edge-label').textContent=kind==='pulse-width'?'Pulse level':delay?'Source edge':'Cycle start edge';
 for(const option of edge.options)option.textContent=kind==='pulse-width'?(option.value==='rising'?'High pulse · rising to falling':'Low pulse · falling to rising'):(option.value==='rising'?'Rising · 0 → 1':'Falling · 1 → 0');
 field('timing-kind-help').textContent=HELP[kind];
 return kind;
}

/** Read only explicit UI fields; the core validates run bounds and semantics. */
export function readTimingSetup(container,run){
 const field=id=>container.querySelector(`#${id}`),signals=getTimingSignals(run);
 if(!signals.length)throw new Error(unavailableReason(run));
 const kind=field('timing-kind')?.value;
 if(!Object.hasOwn(TIMING_KIND_LABELS,kind))throw new Error('Choose a supported timing measurement.');
 const picked=id=>{const value=field(id)?.value;if(!/^(0|[1-9]\d*)$/.test(value??'')||!signals[Number(value)])throw new Error('Choose a saved digital signal or an individual bus bit.');return selection(signals[Number(value)]);};
 let start,end;
 try{start=parseValue(field('timing-start')?.value,'s');}catch(error){throw new Error(`Window start: ${error.message}`);}
 try{end=parseValue(field('timing-end')?.value,'s');}catch(error){throw new Error(`Window end: ${error.message}`);}
 return normalizeTimingSpec(run,{kind,source:picked('timing-source'),edge:field('timing-edge')?.value,...(kind==='delay'?{target:picked('timing-target'),targetEdge:field('timing-target-edge')?.value}:{}),window:{start,end}});
}

function signalLabel(record,signal){
 const entry=record.source?.signals?.find(item=>item.name===signal?.name),label=entry?.label??signal?.name??'Unknown signal';
 return `${label}${signal?.bit===undefined?'':` · bit ${signal.bit}`}`;
}
function eventHTML(event,time){
 if(!Number.isFinite(time))return '<span aria-label="No observed edge">—</span>';
 return `<span class="mono">${esc(formatNumber(time,'s',8))}</span><small class="mono">${esc(rawTime(time))}</small>${event?`<small>${esc(event.from)} → ${esc(event.to)} · event ${esc(event.index)}</small>`:''}`;
}
function detailsText(row){
 const d=row.details??[],items=[];
 if(Number.isFinite(d.highTime))items.push(`High time ${formatNumber(d.highTime,'s',8)} (${rawTime(d.highTime)})`);
 if(Number.isFinite(d.cycleTime))items.push(`Cycle ${formatNumber(d.cycleTime,'s',8)} (${rawTime(d.cycleTime)})`);
 if(row.status!=='measured'&&Number.isFinite(d.observedUntil))items.push(`Observed through ${formatNumber(d.observedUntil,'s',8)} (${rawTime(d.observedUntil)})`);
 return items.join(' · ');
}

export function timingResultHTML(record,currentProject,{canViewRun=false}={}){
 const {result,spec}=record,summary=result.summary,outdated=record.projectId!==currentProject?.id||record.revision!==currentProject?.revision,unit=result.unit;
 const source=signalLabel(record,spec.source),target=spec.target?signalLabel(record,spec.target):null;
 const title=TIMING_KIND_LABELS[spec.kind]??spec.kind;
 const metrics=[['Mean',summary.mean],['Minimum',summary.minimum],['Maximum',summary.maximum]];
 const counts=`${summary.measuredCount} measured · ${summary.indeterminateCount} indeterminate · ${summary.missingCount} missing edge${summary.missingCount===1?'':'s'}`;
 return `<section class="timing-result"><p>${esc(title)} · <strong>${esc(source)}</strong>${target?` → <strong>${esc(target)}</strong>`:''}</p><p class="helper timing-run-context">${esc(record.projectSnapshot.title)} · revision ${esc(record.revision)} · captured run <span class="mono">${esc(record.sourceRunId)}</span><br>Measured <time datetime="${esc(record.createdAt)}">${esc(new Date(record.createdAt).toLocaleString())}</time></p>${outdated?'<div class="notice warning">The working circuit has changed. These measurements belong to the captured run and circuit revision.</div>':''}${record.importedFromBackup?'<p class="helper">Restored timing evidence. Values are checked against the saved events during import; the circuit has not been simulated again.</p>':record.sourceRun.importedFromBackup?'<p class="helper">The source run was restored from a backup. This measurement uses its preserved events; the circuit has not been simulated again.</p>':''}<p class="timing-window-line">Window <span class="mono">${esc(rawTime(spec.window.start))}</span> to <span class="mono">${esc(rawTime(spec.window.end))}</span> · ${esc(spec.edge)} ${target?`source edge; ${esc(spec.targetEdge)} target edge`:'start edge'}</p><p class="helper timing-policy">${esc(result.pairing??HELP[spec.kind]??'')} ${spec.kind==='duty-cycle'?'Duty cycle is the percentage of the cycle spent high.':''}</p><p class="timing-counts" role="status">${esc(counts)}</p>${summary.measuredCount?`<div class="timing-summary">${metrics.map(([label,value])=>`<div><span>${label}</span><strong class="mono">${esc(valueText(value,unit))}</strong><small class="mono">${esc(exactValue(value,unit))}</small></div>`).join('')}</div><p class="helper timing-summary-note">Summary includes the ${summary.measuredCount} measured row${summary.measuredCount===1?'':'s'} shown below. Incomplete and ambiguous rows are excluded.</p>`:'<div class="notice warning">No complete, unambiguous event pair was measured in this window. Review each row for the missing or uncertain evidence.</div>'}${result.truncated?`<div class="notice warning">Showing ${result.rows.length} of ${esc(result.candidateCount)} candidate occurrences. Narrow the time window to inspect later events. Summary statistics describe only the displayed rows.</div>`:''}${(result.warnings??[]).map(warning=>`<div class="notice warning">${esc(warning)}</div>`).join('')}<div class="timing-table-scroll" tabindex="0" role="region" aria-label="Timing measurement results"><table class="data-table timing-data"><caption class="sr-only">${esc(title)} results from ${esc(record.sourceRunId)}</caption><thead><tr><th scope="col">Occurrence</th><th scope="col">${target?'Source edge':'Start edge'}</th><th scope="col">${target?'Target edge':'End edge'}</th><th scope="col">${esc(title)} (${esc(unit)})</th><th scope="col">Status and evidence</th></tr></thead><tbody>${result.rows.map((row,index)=>`<tr><th scope="row">${index+1}</th><td>${eventHTML(row.sourceEvent,row.start)}</td><td>${eventHTML(row.targetEvent,row.end)}</td><td class="mono timing-value">${esc(valueText(row.value,unit))}${Number.isFinite(row.value)?`<small>${esc(exactValue(row.value,unit))}</small>`:''}</td><td class="timing-status ${row.status==='measured'?'timing-measured':'timing-unmeasured'}"><strong>${esc(STATUS[row.status]??row.status)}</strong>${row.reason?`<small>${esc(row.reason)}</small>`:''}${detailsText(row)?`<small>${esc(detailsText(row))}</small>`:''}${canViewRun&&Number.isFinite(row.start)&&Number.isFinite(row.end)?`<button class="timing-view-pair" type="button" data-timing-view-row="${index}" aria-label="View event pair ${index+1} in waveforms">View pair</button>`:''}</td></tr>`).join('')}</tbody></table></div><p class="helper timing-policy">Times come from preserved digital events on a ${esc(formatNumber(result.timeResolution,'s',6))} event time grid. Transitions through X or Z do not become binary edges. A zero delay means the selected edges share an event time.</p><details class="timing-provenance"><summary>Captured timing evidence</summary><dl><dt>Source run</dt><dd class="mono">${esc(record.sourceRunId)}</dd><dt>Simulation engine</dt><dd>${esc(record.sourceRun.engine?.name??'Not recorded')} ${esc(record.sourceRun.engine?.version??'')}</dd><dt>Netlist SHA-256</dt><dd class="mono">${esc(record.sourceRun.netlistHash??'Not recorded')}</dd><dt>Simulation plan SHA-256</dt><dd class="mono">${esc(record.sourceRun.simulationHash??'Not recorded')}</dd><dt>Measurement method</dt><dd class="mono">${esc(result.method)}</dd></dl><p class="helper">Download timing evidence to retain the circuit snapshot, selected event streams, measurement settings, exact results and source-run identity.</p>${(record.sourceRun.bridgeAssumptions??[]).map(value=>`<p class="helper">${esc(value)}</p>`).join('')}${(record.sourceRun.warnings??[]).map(value=>`<p class="helper">Source run warning: ${esc(value)}</p>`).join('')}</details></section>`;
}

export function timingHistoryHTML(records=[],currentProject){
 if(!records.length)return '';
 return `<section class="timing-history"><h3>Saved timing measurements</h3><div>${[...records].reverse().map(record=>{const outdated=currentProject&&(record.projectId!==currentProject.id||record.revision!==currentProject.revision);return `<button data-timing-history="${esc(record.id)}"><strong>${esc(TIMING_KIND_LABELS[record.spec.kind]??record.spec.kind)} · revision ${esc(record.revision)}</strong><small>${esc(record.result.summary.measuredCount)} measured · ${esc(new Date(record.createdAt).toLocaleString())}${outdated?' · earlier circuit':''}</small></button>`;}).join('')}</div><p class="helper">Up to 12 measurements are kept with the project. Each retains its original run evidence.</p></section>`;
}
