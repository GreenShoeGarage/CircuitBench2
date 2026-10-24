/** Bounded provenance shared by complete run backups and independent timing records. */
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const fail=message=>{throw new Error(message);};
const onGrid=value=>finite(value)&&value>=0&&value<=9000&&Number.isSafeInteger(Math.round(value/1e-12))&&Math.abs(value-Math.round(value/1e-12)*1e-12)<=Math.max(1e-18,Number.EPSILON*Math.abs(value)*4);

export function validateContinuousProvenance(value,snapshot,{timeBounds,points,sampling}={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.formatVersion!==1||value.stateRetained!==true||value.startedAtTime!==0||!onGrid(value.windowStart)||!onGrid(value.currentTime)||value.windowStart>value.currentTime||snapshot.analysis.type!=='tran'||snapshot.analysis.solver!=='coordinated')fail('Saved continuous history has inconsistent time bounds or coordinated solver provenance.');
 if(!Array.isArray(timeBounds)||timeBounds.length!==2||value.windowStart!==timeBounds[0]||value.currentTime!==timeBounds[1]||sampling?.mode!=='continuous-window'||sampling.windowStart!==value.windowStart||sampling.windowEnd!==value.currentTime)fail('Saved continuous window boundaries disagree with the retained source.');
 if(!Number.isSafeInteger(value.totalPoints)||value.totalPoints<1||!Number.isSafeInteger(value.droppedPoints)||value.droppedPoints<0||value.droppedPoints>=value.totalPoints||(points!==undefined&&value.totalPoints-value.droppedPoints!==points))fail('Saved continuous history has inconsistent retention metadata.');
 if(!['snapshot','stopped','failed-after-window'].includes(value.sessionStatus))fail('Saved continuous history must be a stopped result or a non-resumable snapshot.');
 if(!Array.isArray(value.inputChanges)||value.inputChanges.length>2000)fail('Saved continuous input history exceeds its bound.');
 let prior=-1;
 const inputChanges=value.inputChanges.map(change=>{
  if(!change||!onGrid(change.time)||change.time<prior||change.time>value.currentTime||!Array.isArray(change.updates)||!change.updates.length||change.updates.length>64)fail('Saved live-input changes are malformed.');
  prior=change.time;const seen=new Set();
  const updates=change.updates.map(update=>{
   const component=snapshot.circuit.components.find(item=>item.id===update?.id);
   if(!component||seen.has(component.id)||!['DIN','BUSIN','V','I'].includes(component.type))fail('A saved live-input change does not identify an eligible source.');
   seen.add(component.id);
   if(['V','I'].includes(component.type)){
    if(component.params.waveform!=='dc'||!finite(update.value))fail('A saved analog live input must be a finite DC source value.');
   }else{
    const width=component.type==='DIN'?1:Number(component.params.width);
    if(typeof update.value!=='string'||update.value.length!==width||!/^[01XZ]+$/.test(update.value))fail('Saved live logic input must be a literal word of the source width.');
   }
   return {id:component.id,value:update.value};
  });
  return {time:change.time,updates};
 });
 return {formatVersion:1,startedAtTime:0,windowStart:value.windowStart,currentTime:value.currentTime,totalPoints:value.totalPoints,droppedPoints:value.droppedPoints,inputChanges,stateRetained:true,sessionStatus:value.sessionStatus};
}
