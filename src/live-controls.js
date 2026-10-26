/** Source operation belongs to one retained session. Initial settings are edited
 * separately, and every live command (including release) uses the same queue. */
import {getPins,parseLogicWord,parseValue} from './library.js';
import {escapeHTML as esc} from './storage.js';
import {formatNumber} from './plots.js';

const cancelled = () => ({applied:false,cancelled:true});
const scalar = value => value === '1' ? 'HIGH (1)' : value === '0' ? 'LOW (0)' : String(value);
const timeText = value => formatNumber(value,'s',7);
export const LIVE_CONTROL_LIMITS=Object.freeze({queuedCommands:128});

export function sourceControl(component) {
  if (!component) return null;
  const {id,ref,type,params} = component;
  if (['DVS','DIN','BUSIN'].includes(type)) {
    const width = getPins(component).find(pin => pin.direction === 'output')?.width ?? getPins(component).find(pin => pin.domain === 'digital')?.width ?? 1;
    return {id,ref,type,width,unit:'logic',initial:type === 'BUSIN' ? params.value : params.state,
      binary:type === 'DVS',momentary:['DVS','DIN'].includes(type) && width === 1};
  }
  if (['V','I'].includes(type) && params.waveform === 'dc') return {id,ref,type,unit:type === 'V' ? 'V' : 'A',initial:params.dc,binary:false,momentary:false};
  return null;
}

export function sourceControls(project) {
  return project.workspace === 'netlist' ? [] : project.circuit.components.map(sourceControl).filter(Boolean);
}

export function sourceValueLabel(control,value) {
  return control.unit === 'logic' ? control.width === 1 ? scalar(value) : `${value} · ${control.width} bits` : `${value} ${control.unit}`;
}

function normalizeUpdates(project,updates) {
  if (!Array.isArray(updates) || updates.length < 1 || updates.length > 64 || new Set(updates.map(update=>update.id)).size !== updates.length) throw new Error('Choose 1–64 different source inputs.');
  return updates.map(update => {
    const control=sourceControl(project.circuit.components.find(component=>component.id===update.id));
    if (!control) throw new Error('This source is no longer an adjustable input.');
    if (control.binary && !['0','1'].includes(update.value)) throw new Error(`${control.ref}: choose LOW (0) or HIGH (1).`);
    const value=control.unit==='logic' ? parseLogicWord(String(update.value),control.width) : parseValue(String(update.value),control.unit);
    if (control.unit!=='logic' && !Number.isFinite(value)) throw new Error(`${control.ref}: enter a finite ${control.unit} value.`);
    return {id:control.id,value};
  });
}

function sessionMatches(context,session=context.session) {
  const snapshot=context.sessionRun?.projectSnapshot;
  return !!session?.running && session===context.session && snapshot?.id===context.project.id && snapshot.revision===context.project.revision;
}

/** Queue ownership includes the controller's generation, so even reusing a
 * ContinuousSimulation object cannot allow an old release into a new run. */
export class LiveInputController {
  constructor({getContext,setInitial,onChange=()=>{},onApplied=()=>{}}) {
    this.getContext=getContext;this.setInitial=setInitial;this.onChange=onChange;this.onApplied=onApplied;
    this.queues=new WeakMap();this.jobs=[];this.holds=new Map();this.serial=0;
  }
  current(job) {
    const context=this.getContext();
    return sessionMatches(context,job.session) && job.generation===job.session.generation && job.projectId===context.project.id && job.revision===context.project.revision;
  }
  sync() {
    for (const [owner,hold] of this.holds) if (!this.current(hold)) this.holds.delete(owner);
    this.jobs=this.jobs.filter(job=>this.current(job));
  }
  hasPending(session=this.getContext().session) { return this.jobs.some(job=>job.session===session && this.current(job)); }
  pendingValue(id) { return this.jobs.findLast(job=>this.current(job)&&job.updates.some(update=>update.id===id))?.updates.find(update=>update.id===id)?.value; }
  held(id) { return [...this.holds.values()].some(hold=>hold.id===id&&this.current(hold)); }
  invalidate(session=this.getContext().session) {
    for (const [owner,hold] of this.holds) if (hold.session===session) this.holds.delete(owner);
    for (const job of this.jobs) if (job.session===session) job.cancelled=true;
    this.jobs=this.jobs.filter(job=>job.session!==session);
    this.onChange();
  }
  request(updates,{requireLive=false,session:expectedSession=null,releasing=false}={}) {
    const context=this.getContext(),session=context.session;
    if (expectedSession && expectedSession!==session) return Promise.resolve(cancelled());
    if (context.busy) return Promise.reject(new Error('Wait for the active experiment before changing this source.'));
    let changes;
    try { changes=normalizeUpdates(context.project,updates); } catch(error) { return Promise.reject(error); }
    if (!session?.running) {
      if (requireLive) return Promise.reject(new Error('Start continuous simulation to use a momentary source.'));
      try {return Promise.resolve(this.setInitial(changes)).then(()=>({applied:true,initial:true,updates:changes}));}
      catch(error) {return Promise.reject(error);}
    }
    if (!sessionMatches(context) || changes.some(update=>!session.plan?.controls?.some(control=>control.id===update.id))) return Promise.reject(new Error('This source does not belong to the active continuous session.'));
    if (session.state==='starting') return Promise.reject(new Error('Wait for the continuous session to finish starting.'));
    if(!releasing&&this.jobs.filter(job=>this.current(job)).length>=LIVE_CONTROL_LIMITS.queuedCommands)return Promise.reject(new Error('Wait for the queued source commands to finish before adding another.'));
    let queue=this.queues.get(session);
    if (!queue || queue.generation!==session.generation) {queue={generation:session.generation,tail:Promise.resolve()};this.queues.set(session,queue);}
    const job={serial:++this.serial,session,generation:session.generation,projectId:context.project.id,revision:context.project.revision,updates:changes,cancelled:false};
    this.jobs.push(job);
    const task=queue.tail.catch(()=>{}).then(async()=>{
      try {
        if (job.cancelled || !this.current(job)) return cancelled();
        const acknowledgement=session.setInputs(changes);this.onChange();
        await acknowledgement;
        if (job.cancelled || !this.current(job)) return cancelled();
        this.onApplied({session,updates:changes,time:session.time});
        return {applied:true,initial:false,updates:changes,time:session.time};
      } catch(error) {
        if (job.cancelled || !this.current(job)) return cancelled();
        throw error;
      } finally {
        this.jobs=this.jobs.filter(item=>item!==job);this.onChange();
      }
    });
    queue.tail=task;this.onChange();
    return task;
  }
  press(id,owner) {
    this.sync();
    if (this.holds.has(owner) || this.held(id)) return Promise.resolve({applied:false,held:true});
    const context=this.getContext(),control=sourceControl(context.project.circuit.components.find(component=>component.id===id));
    if (!control?.momentary) return Promise.reject(new Error('Momentary operation requires a one-bit digital source.'));
    if (!sessionMatches(context)) return Promise.reject(new Error('Start continuous simulation to use a momentary source.'));
    const session=context.session,hold={id,owner,session,generation:session.generation,projectId:context.project.id,revision:context.project.revision};
    this.holds.set(owner,hold);
    const task=this.request([{id,value:'1'}],{requireLive:true,session});
    task.catch(()=>{if(this.holds.get(owner)===hold){this.holds.delete(owner);this.onChange();}});
    return task;
  }
  release(owner) {
    const hold=this.holds.get(owner);
    if (!hold) return Promise.resolve(cancelled());
    this.holds.delete(owner);
    if (!this.current(hold)) {this.onChange();return Promise.resolve(cancelled());}
    return this.request([{id:hold.id,value:'0'}],{requireLive:true,session:hold.session,releasing:true});
  }
  releaseAll() { return Promise.allSettled([...this.holds.keys()].map(owner=>this.release(owner))); }
}

/** The record describes a drive command, not resolved logic or a voltage probe. */
export function describeSourceControl(project,component,{session=null,sessionRun=null,run=null,cursor=null,controller=null,busy=false}={}) {
  const control=sourceControl(component);if(!control)return null;
  const live=sessionMatches({project,session,sessionRun})&&session.plan?.controls?.some(item=>item.id===control.id);
  const latest=live?[...(session.inputChanges??[])].reverse().find(change=>change.updates.some(update=>update.id===control.id)):null;
  const value=latest?.updates.find(update=>update.id===control.id)?.value??control.initial;
  const pending=controller?.pendingValue(control.id),held=controller?.held(control.id)??false;
  let recorded=null;
  const axis=run?.result?.vectors?.find(vector=>vector.name==='time')?.values,snapshot=run?.projectSnapshot?.circuit?.components?.find(item=>item.id===control.id),captured=sourceControl(snapshot);
  if (run?.projectId===project.id && captured && Array.isArray(axis)&&axis.length) {
    const time=cursor??axis.at(-1);
    if(Number.isFinite(time)&&time>=axis[0]&&time<=axis.at(-1)) {
      let recordedValue=captured.initial;
      for(const change of run.result.continuous?.inputChanges??[])if(change.time<=time){const update=change.updates.find(item=>item.id===control.id);if(update)recordedValue=update.value;}
      recorded=`Recorded ${sourceValueLabel(captured,recordedValue)} · ${cursor===null?'latest':'Cursor A'} ${timeText(time)}${run.revision!==project.revision?' · earlier revision':''}`;
    }
  }
  const awaiting=!!live&&!!latest&&latest.time>=session.time;
  return {...control,live,value,pending,held,pinned:project.workbench?.pinnedSources?.includes(control.id)??false,
    momentaryMode:control.momentary&&(project.workbench?.momentarySources?.includes(control.id)??false),
    disabled:busy||session?.state==='starting'||!!session?.running&&!live,
    initialLabel:`Initial ${sourceValueLabel(control,control.initial)}`,
    liveLabel:live?`Live drive ${sourceValueLabel(control,value)}`:'No live session',recordedLabel:recorded??'No recorded drive at the selected display time',
    pendingLabel:pending!==undefined?`Queued ${sourceValueLabel(control,pending)}`:awaiting?session.state==='paused'?'Awaiting Step or Resume':'Awaiting the next computed boundary':held?'Held HIGH · release returns LOW':live?'Commands preserve the initial project settings.':'Controls edit the initial source setting.'};
}

export function sourcePreferencesHTML(state) {
  if(!state)return '';
  return `<div class="source-preferences"><button type="button" data-source-pin="${esc(state.id)}" aria-pressed="${state.pinned}">${state.pinned?'Unpin source':'Pin beside schematic'}</button>${state.momentary?`<label><input type="checkbox" data-source-momentary="${esc(state.id)}" ${state.momentaryMode?'checked':''}> Momentary: hold HIGH, release LOW</label>`:''}<p class="helper">${state.momentaryMode?'Momentary operation needs continuous simulation. While paused, Step or Resume computes the response.':state.type==='DVS'?'The source’s dedicated button operates it without moving the component.':'Pin the source to adjust it beside the schematic.'}</p></div>`;
}

function pinnedCardHTML(state) {
  const id=esc(state.id);
  return `<section class="pinned-source" data-pinned-source="${id}" aria-label="${esc(state.ref)} source control"><div class="pinned-source-heading"><strong>${esc(state.ref)}</strong><span>${esc(state.unit==='logic'?`${state.width}-bit digital source`:`DC ${state.unit==='V'?'voltage':'current'}`)}</span><button type="button" data-source-pin="${id}" aria-label="Unpin ${esc(state.ref)}">×</button></div><div class="pinned-source-controls">${state.momentaryMode?`<button type="button" class="source-hold" data-source-hold="${id}" aria-label="Hold ${esc(state.ref)} HIGH; release LOW" aria-pressed="false">Hold HIGH</button>`:state.binary?['0','1'].map(value=>`<button type="button" data-pinned-set="${id}" data-value="${value}" aria-label="Set ${esc(state.ref)} ${value==='1'?'HIGH':'LOW'}" aria-pressed="false">${value==='1'?'1 · HIGH':'0 · LOW'}</button>`).join(''):`<label class="sr-only" for="pinned-value-${id}">${esc(state.ref)} ${state.unit==='logic'?'logic word':state.unit}</label><input id="pinned-value-${id}" data-pinned-value="${id}" aria-label="${esc(state.ref)} ${state.unit==='logic'?'logic word':state.unit}" autocomplete="off" spellcheck="false"><button type="button" data-pinned-apply="${id}">Set</button>`}</div><div class="pinned-source-readouts"><span data-source-initial></span><span data-source-live></span><span data-source-recorded></span><strong data-source-pending aria-live="polite"></strong></div></section>`;
}

/** Keep the actual button and focused text input alive across every solver
 * update. A pointer hold must not depend on replaceable innerHTML nodes. */
export function renderPinnedControls(root,states,{available=0}={}) {
  if(!root)return;
  const signature=JSON.stringify(states.map(state=>[state.id,state.ref,state.type,state.width,state.momentaryMode]));
  if(root.dataset.signature!==signature){
    root.dataset.signature=signature;
    root.innerHTML=`<div class="pinned-controls-heading"><strong>Pinned sources</strong><span>${states.length?'Initial, live and recorded drive settings':'Select a source and choose “Pin beside schematic”.'}</span></div><div class="pinned-source-list">${states.map(pinnedCardHTML).join('')}</div>`;
  }
  root.hidden=available===0||states.length===0;
  for(const state of states){
    const card=[...root.querySelectorAll('[data-pinned-source]')].find(node=>node.dataset.pinnedSource===state.id);if(!card)continue;
    card.dataset.mode=state.live?'live':'initial';
    for(const [selector,value] of [['[data-source-initial]',state.initialLabel],['[data-source-live]',state.liveLabel],['[data-source-recorded]',state.recordedLabel],['[data-source-pending]',state.pendingLabel]])card.querySelector(selector).textContent=value;
    card.querySelectorAll('[data-pinned-set]').forEach(button=>{button.disabled=state.disabled;button.setAttribute('aria-pressed',String(button.dataset.value===String(state.value)));});
    const hold=card.querySelector('[data-source-hold]');if(hold){hold.disabled=state.disabled||!state.live;hold.setAttribute('aria-pressed',String(state.held));hold.textContent=state.held?'Held HIGH — release LOW':'Hold HIGH';}
    const input=card.querySelector('[data-pinned-value]');if(input){input.disabled=state.disabled;if(input!==root.ownerDocument.activeElement&&!input.dataset.dirty)input.value=String(state.pending??state.value);}
    const apply=card.querySelector('[data-pinned-apply]');if(apply)apply.disabled=state.disabled;
  }
}

/** Delegated handlers survive control redraws. Releases are listened for on the
 * owning window, including pointer cancellation, focus loss and hidden pages. */
export function bindPinnedControls(root,{setValue,press,release,pin,onError=()=>{}},{window:win=root.ownerDocument.defaultView,document:doc=root.ownerDocument}={}) {
  const active=new Map(),listeners=[];
  const listen=(target,name,handler,options)=>{target.addEventListener(name,handler,options);listeners.push(()=>target.removeEventListener(name,handler,options));};
  const attempt=operation=>{try{return Promise.resolve(operation()).catch(onError);}catch(error){onError(error);}};
  const finish=key=>{const owner=active.get(key);if(!owner)return;active.delete(key);attempt(()=>release(owner));};
  const finishAll=()=>{for(const key of [...active.keys()])finish(key);};
  const begin=(button,key)=>{if(button.disabled||active.has(key))return;const owner={surface:'pinned',key,id:button.dataset.sourceHold};active.set(key,owner);attempt(()=>press(owner.id,owner));};
  listen(root,'pointerdown',event=>{const button=event.target.closest('[data-source-hold]');if(!button||!root.contains(button)||event.button!==0)return;event.preventDefault();button.focus();begin(button,`pointer:${event.pointerId}`);try{button.setPointerCapture?.(event.pointerId);}catch{}});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(win,type,event=>finish(`pointer:${event.pointerId}`),true);
  listen(root,'keydown',event=>{const button=event.target.closest('[data-source-hold]');if(!button||![' ','Enter'].includes(event.key))return;event.preventDefault();if(!event.repeat)begin(button,`key:${event.key}`);});
  listen(win,'keyup',event=>{if([' ','Enter'].includes(event.key))finish(`key:${event.key}`);},true);
  listen(root,'focusout',event=>{if(event.target.closest('[data-source-hold]'))finishAll();});
  listen(win,'blur',finishAll);listen(doc,'visibilitychange',()=>{if(doc.hidden)finishAll();});
  listen(root,'input',event=>{if(event.target.matches('[data-pinned-value]'))event.target.dataset.dirty='true';});
  listen(root,'click',event=>{
    const button=event.target.closest('button');if(!button||!root.contains(button)||button.disabled)return;
    if(button.dataset.sourceHold){event.preventDefault();return;}
    if(button.dataset.sourcePin)attempt(()=>pin(button.dataset.sourcePin));
    else if(button.dataset.pinnedSet)attempt(()=>setValue(button.dataset.pinnedSet,button.dataset.value));
    else if(button.dataset.pinnedApply){const input=[...root.querySelectorAll('[data-pinned-value]')].find(node=>node.dataset.pinnedValue===button.dataset.pinnedApply);attempt(async()=>{const result=await setValue(button.dataset.pinnedApply,input.value);if(result?.applied!==false)delete input.dataset.dirty;});}
  });
  listen(root,'keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-pinned-value]')){event.preventDefault();const input=event.target;attempt(async()=>{const result=await setValue(input.dataset.pinnedValue,input.value);if(result?.applied!==false)delete input.dataset.dirty;});}});
  return ()=>{finishAll();listeners.forEach(remove=>remove());};
}
