/** Audit the three actual rc.3 browser downloads without rerunning simulation.
 * Default is read-only; --finalize writes artifact/source hashes and findings.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {safeEnvelope} from '../src/storage.js';
import {validateProject,buildNets} from '../src/model.js';
import {parseValue} from '../src/library.js';
import {displayStatesForRun} from '../src/displays.js';
import {csvForRun} from '../src/plots.js';

if(process.argv.slice(2).some(value=>value!=='--finalize'))throw new Error('Usage: node scripts/verify-rc203-downloads.mjs [--finalize]');
const finalize=process.argv.includes('--finalize'),root=fileURLToPath(new URL('..',import.meta.url)),version='2.0.0-rc.3',captureBuild='8a99d6d843d32aa6',output='evidence/rc203-download-validation.json';
const files={diagnostic:'evidence/rc203-installation-browser.json',backup:'evidence/rc203-browser-project.json',csv:'evidence/rc203-browser-results.csv'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(canonical):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=value=>Math.round(value*1e12);
const report={format:'CircuitBench rc.3 actual-download audit',formatVersion:1,version,verifiedAt:new Date().toISOString(),hashesFinalized:finalize,status:'running',
 scope:'Read-only structural and arithmetic audit of the actual downloaded installation diagnostic, project backup and selected-run CSV. Uses production backup validation and indicator readback, repeated JSON/import round trips, independent reconstruction of the source/inverter states, and exact CSV comparison. No simulator is run. This audit does not establish the browser actions, CSS appearance, offline/upgrade behavior, general physical accuracy, SVG delivery, HTML-report delivery or native print/PDF.',
 limitations:[
  'The installation diagnostic explicitly reports a failed icon response: the preview declared 1655 bytes for a 443-byte SVG. Its failed status is preserved. The separate browser record attributes the change to live-server injection; this file-only audit does not inspect the injected response body.',
  'The preview is insecure HTTP. SHA-256 and the Service Worker API were unavailable there; the downloaded diagnostic makes no exact runtime-byte or offline-installation claim.',
  'Backup appVersion and projectSnapshot.appVersion describe saved project metadata. They do not identify the runtime build that executed a run. The backup does not embed a runtime application build hash.',
  'Three runs are marked as imported history. Four are not marked imported; the separate operator record identifies two intermediate rc.3-build captures and two final-build captures. These build assignments are not inferred from snapshot versions.',
  'Actual SVG and HTML report downloads did not complete in the recorded browser workflow. The HTML report preview rendered, but no downloadable SVG/HTML/PDF file is claimed by this audit.'
 ],artifacts:[],checks:[],runs:[]};
function verify(name,condition,details={}){report.checks.push({name,passed:Boolean(condition),details});if(!condition)throw new Error(name);}
async function readBounded(file,max){const absolute=path.join(root,file),stat=await fs.stat(absolute);if(!stat.isFile()||stat.size>max)throw new Error(`${file}: exceeds the audit input bound`);const data=await fs.readFile(absolute);report.artifacts.push({file,bytes:data.length,sha256:hash(data)});return data;}
function vector(run,name){const item=run.result.vectors.find(value=>value.name===name);if(!item)throw new Error(`Missing ${name} in ${run.id}`);return item.values;}
const lamps=(project,run,time)=>Object.values(displayStatesForRun(project,run,time)).map(({ref,value,label,on,available,time:observedTime})=>({ref,value,label,on,available,time:observedTime}));

const diagnosticBytes=await readBounded(files.diagnostic,1024*1024),diagnostic=JSON.parse(diagnosticBytes);
verify('Diagnostic: exact format, release and reported capture build',diagnostic.format==='CircuitBench installation check'&&diagnostic.formatVersion===1&&diagnostic.version===version&&diagnostic.loadedBuild===captureBuild&&diagnostic.manifestBuild===captureBuild,{version:diagnostic.version,loadedBuild:diagnostic.loadedBuild,manifestBuild:diagnostic.manifestBuild});
verify('Diagnostic: finite bounded completion time',Number.isFinite(Date.parse(diagnostic.startedAt))&&Number.isFinite(Date.parse(diagnostic.completedAt))&&Date.parse(diagnostic.completedAt)>=Date.parse(diagnostic.startedAt)&&Number.isFinite(diagnostic.durationMs)&&diagnostic.durationMs>=0&&diagnostic.durationMs<=60000&&diagnostic.currentStep===null,{durationMs:diagnostic.durationMs});
verify('Diagnostic: observed insecure preview capability limits remain explicit',diagnostic.scope==='http://terminal.local:4173/'&&diagnostic.environment.secureContext===false&&diagnostic.environment.sha256===false&&diagnostic.environment.serviceWorker===false&&diagnostic.environment.fetch===true&&diagnostic.environment.worker===true&&diagnostic.environment.webAssembly===true);
verify('Diagnostic: bounded unique check inventory and literal statuses',Array.isArray(diagnostic.checks)&&diagnostic.checks.length===50&&new Set(diagnostic.checks.map(check=>check.id)).size===diagnostic.checks.length&&diagnostic.checks.every(check=>typeof check.id==='string'&&check.id.length<300&&['passed','failed','unavailable'].includes(check.status)&&typeof check.message==='string'&&check.message.length<=1000));
const counts=Object.fromEntries(['passed','failed','unavailable'].map(status=>[status,diagnostic.checks.filter(check=>check.status===status).length]));
verify('Diagnostic: aggregate counts independently agree with every check',same(counts,diagnostic.summary)&&same(counts,{passed:5,failed:1,unavailable:44}),counts);
const observedFailure=diagnostic.checks.filter(check=>check.status==='failed');
verify('Diagnostic: the preview icon failure is preserved instead of relabeled successful',diagnostic.status==='failed'&&observedFailure.length===1&&observedFailure[0].id==='asset:icon.svg'&&observedFailure[0].code==='INSTALLATION_RESPONSE_SIZE'&&observedFailure[0].expectedBytes===443&&observedFailure[0].declaredBytes==='1655'&&observedFailure[0].httpStatus===200&&observedFailure[0].contentType==='image/svg+xml'&&observedFailure[0].contentEncoding===null&&observedFailure[0].observedBytes===undefined,{check:observedFailure[0],interpretation:'Declared oversize was rejected before a decoded body length was recorded.'});
const assets=diagnostic.checks.filter(check=>check.id.startsWith('asset:'));
verify('Diagnostic: asset observations stay in the application scope and have bounded byte fields',assets.length===44&&assets.every(check=>{const url=new URL(check.assetUrl);return url.origin==='http://terminal.local:4173'&&url.href===diagnostic.scope+check.id.slice(6)&&!url.search&&!url.hash&&(!check.details||Number.isSafeInteger(check.details.bytes)&&check.details.bytes>0&&check.details.bytes<=16777216);}),{assetChecks:assets.length});
verify('Diagnostic: insecure asset observations do not claim SHA matches',assets.filter(check=>check.id!=='asset:icon.svg').every(check=>check.status==='unavailable'&&check.details.sha256===null)&&diagnostic.checks.find(check=>check.id==='sha256')?.status==='unavailable');
const manifestCheck=diagnostic.checks.find(check=>check.id==='manifests');
verify('Diagnostic: manifest inventory count and bounded advertised size are consistent',manifestCheck?.status==='passed'&&manifestCheck.details.files===assets.length&&Number.isSafeInteger(manifestCheck.details.declaredBytes)&&manifestCheck.details.declaredBytes>0&&manifestCheck.details.declaredBytes<=33554432,{files:manifestCheck.details.files,declaredBytes:manifestCheck.details.declaredBytes});
const engineChecks=diagnostic.checks.filter(check=>check.id.startsWith('engine:'));
verify('Diagnostic: all three execution paths report passing independent smoke circuits',same(engineChecks.map(check=>[check.id,check.status]),[['engine:digital','passed'],['engine:coordinated','passed'],['engine:ngspice','passed']]));
const digitalCheck=engineChecks.find(check=>check.id==='engine:digital').details,coordinatedCheck=engineChecks.find(check=>check.id==='engine:coordinated').details,analogCheck=engineChecks.find(check=>check.id==='engine:ngspice').details;
verify('Diagnostic: digital source/inverter and analog-divider observations are internally consistent',digitalCheck.high==='1'&&digitalCheck.inverted==='0'&&digitalCheck.engine==='cb-digital-kernel-2'&&analogCheck.expectedVoltage===5&&analogCheck.measuredVoltage===5&&analogCheck.engine==='ngspice'&&analogCheck.engineVersion==='45.2');
verify('Diagnostic: coordinated smoke retains finite bounded observations through 4 ms',coordinatedCheck.completedTime===.004&&coordinatedCheck.engine==='cb-coordinated-1'&&[coordinatedCheck.boundaryVoltage,coordinatedCheck.finalVoltage].every(value=>Number.isFinite(value)&&value>0&&value<5),coordinatedCheck);
const bannedKeys=new Set(['project','projectSnapshot','circuit','components','connections','netlist','netlistText','vectors','runs','question','notes','assumptions','inputTimeline']);
const forbidden=[];
function inspectKeys(value,at='diagnostic'){if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(bannedKeys.has(key))forbidden.push(at+'.'+key);inspectKeys(child,at+'.'+key);}}
inspectKeys(diagnostic);
verify('Diagnostic: no project/circuit/result payload fields are present',forbidden.length===0,{forbiddenKeys:forbidden});
report.installation={observedStatus:diagnostic.status,observedSummary:counts,loadedBuild:diagnostic.loadedBuild,manifestBuild:diagnostic.manifestBuild,scope:diagnostic.scope,environment:diagnostic.environment,engineChecks:engineChecks.map(check=>({id:check.id,status:check.status,details:check.details})),previewAssetFailure:observedFailure[0]};

const backupBytes=await readBounded(files.backup,2*1024*1024),raw=JSON.parse(backupBytes),envelope=safeEnvelope(raw,validateProject);
verify('Backup: rc.3 portable envelope passes production import with all seven runs',raw.format==='CircuitBench'&&raw.formatVersion===1&&raw.appVersion===version&&envelope.runs.length===7&&envelope.runs.length===raw.runs.length);
verify('Backup: all run IDs and the selected-run identity survive import',same(raw.runs.map(run=>run.id),envelope.runs.map(run=>run.id))&&raw.activeRunId===envelope.activeRunId);
let repeated=envelope;
for(let cycle=1;cycle<=3;cycle++){repeated=safeEnvelope(clone(repeated),validateProject);verify(`Backup: JSON/import round trip ${cycle} is unchanged`,same(repeated,envelope));}
verify('Diagnostic: no working project title or identifiers appear in the diagnostic JSON',!diagnosticBytes.toString('utf8').includes(envelope.project.id)&&!diagnosticBytes.toString('utf8').includes(envelope.project.title)&&envelope.project.circuit.components.every(component=>!diagnosticBytes.toString('utf8').includes(component.id)));
const imported=envelope.runs.filter(run=>run.importedFromBackup===true),notMarkedImported=envelope.runs.filter(run=>run.importedFromBackup!==true);
verify('Backup: three imported rc.2 runs remain distinct from four unmarked runs',imported.length===3&&notMarkedImported.length===4&&imported.every(run=>run.projectSnapshot.appVersion==='2.0.0-rc.2'),{importedRunIds:imported.map(run=>run.id),notMarkedImportedRunIds:notMarkedImported.map(run=>run.id)});
verify('Backup: snapshot versions retain the observed mixture instead of being rewritten as execution provenance',same(envelope.runs.map(run=>run.projectSnapshot.appVersion),['2.0.0-rc.2','2.0.0-rc.2','2.0.0-rc.2','2.0.0-rc.2','2.0.0-rc.2',version,version]));
const captureNotes={
 'run_mvn7eo6y_c791e9iw2zb':{reportedRuntimeBuild:'a193c1048772c4f0',stage:'intermediate rc.3 browser session'},
 'run_mvn7gre8_3db0vegn962':{reportedRuntimeBuild:'a193c1048772c4f0',stage:'intermediate rc.3 browser session'},
 'run_mvn7imid_uom750skwz':{reportedRuntimeBuild:captureBuild,stage:'final rc.3 browser session'},
 'run_mvn7jxzj_n3u2b3bo2m':{reportedRuntimeBuild:captureBuild,stage:'final rc.3 browser session'},
};
verify('Backup: separate operator capture notes refer only to the four unmarked runs',same(Object.keys(captureNotes).sort(),notMarkedImported.map(run=>run.id).sort()));
let recordedSamples=0,independentDigitalComparisons=0,recordedEvents=0;
for(const run of envelope.runs){
 const snapshot=run.projectSnapshot,parts=snapshot.circuit.components,source=parts.find(part=>part.type==='DVS'),inverter=parts.find(part=>part.type==='NOT'),nets=buildNets(snapshot).endpointToNet,times=vector(run,'time');
 verify(`${run.id}: source/NOT/two-indicator topology and snapshot identity`,parts.length===4&&parts.filter(part=>part.type==='DLED').length===2&&source?.params.outputMode==='logic'&&['0','1'].includes(source.params.state)&&inverter&&nets[`${source.id}:out`]===nets[`${inverter.id}:in`]&&run.projectId===snapshot.id&&run.revision===snapshot.revision);
 verify(`${run.id}: complete ordered samples and literal binary vectors`,times.length===run.result.points&&times.every((time,index)=>Number.isFinite(time)&&time>=0&&(!index||time>times[index-1]))&&run.result.vectors.every(item=>item.values.length===times.length&&(item.name==='time'||item.kind==='logic'&&item.values.every(value=>['0','1'].includes(value)))));
 const inputName=`d(${nets[`${source.id}:out`]})`,outputName=`d(${nets[`${inverter.id}:out`]})`,delay=tick(parseValue(inverter.params.delay,'s')),changes=(run.result.continuous?.inputChanges??[]).flatMap(change=>change.updates.filter(update=>update.id===source.id).map(update=>({time:tick(change.time),value:update.value})));
 const sourceAt=time=>changes.filter(change=>change.time<=time).at(-1)?.value??source.params.state,expectedAt=(name,time)=>name===inputName?sourceAt(tick(time)):sourceAt(tick(time)-delay)==='1'?'0':'1';
 verify(`${run.id}: all dense logic samples match independent source-history/NOT reconstruction`,delay===10000&&[inputName,outputName].every(name=>vector(run,name).every((value,index)=>value===expectedAt(name,times[index]))),{delaySeconds:delay*1e-12,samples:times.length,appliedSourceChanges:changes.length});
 verify(`${run.id}: every sparse event agrees with the same independent reconstruction`,run.result.digitalEvents.length===2&&run.result.digitalEvents.every(trace=>[inputName,outputName].includes(trace.name)&&trace.events.every(event=>event.value===expectedAt(trace.name,event.time))));
 const observed=lamps(snapshot,run),atStart=lamps(snapshot,run,times[0]);
 verify(`${run.id}: indicator readbacks use recorded states and glow only for HIGH`,observed.length===2&&observed.every(lamp=>lamp.available&&lamp.on===(lamp.value==='1'))&&same(observed.map(lamp=>lamp.value),[sourceAt(tick(times.at(-1))),sourceAt(tick(times.at(-1))-delay)==='1'?'0':'1'])&&atStart.every(lamp=>lamp.available));
 if(run.revision!==envelope.project.revision)verify(`${run.id}: older revision cannot light the current working circuit`,lamps(envelope.project,run).every(lamp=>!lamp.available&&!lamp.on&&lamp.value===null));
 const hashes=[['netlist',run.netlistHash,run.netlist],...(run.simulationHash?[['simulation',run.simulationHash,JSON.stringify(run.coordinatedPlan??run.simulation)]]:[])];
 verify(`${run.id}: stored input hashes match or insecure absence remains explicit`,hashes.every(([,recorded,content])=>/^[a-f0-9]{64}$/.test(recorded??'')?recorded===hash(content):recorded==='unavailable-in-insecure-context'),{recordedHashes:hashes.map(([kind,value])=>({kind,value}))});
 if(run.result.continuous){const c=run.result.continuous;verify(`${run.id}: retained window accounting is exact and stopped status is preserved`,tick(c.windowStart)===tick(times[0])&&tick(c.currentTime)===tick(times.at(-1))&&c.totalPoints-c.droppedPoints===times.length&&c.sessionStatus==='stopped',{windowStart:c.windowStart,currentTime:c.currentTime,totalPoints:c.totalPoints,droppedPoints:c.droppedPoints});}
 recordedSamples+=times.length;independentDigitalComparisons+=times.length*2;recordedEvents+=run.result.digitalEvents.reduce((count,trace)=>count+trace.events.length,0);
 report.runs.push({id:run.id,revision:run.revision,status:run.status,importedFromBackup:run.importedFromBackup===true,snapshotAppVersion:snapshot.appVersion,points:times.length,timeBounds:[times[0],times.at(-1)],continuous:Boolean(run.result.continuous),latestIndicators:observed,...(captureNotes[run.id]?{operatorCaptureNote:{...captureNotes[run.id],source:'Separate browser-operator observation; not proven by this backup or inferred from its snapshot version.'}}:{history:'Marked as imported; preserved rc.2 evidence.'})});
}
const active=envelope.runs.find(run=>run.id===envelope.activeRunId);
verify('Backup: selected bounded run exactly matches current rc.3 project revision 4',Boolean(active)&&active.projectId===envelope.project.id&&active.revision===envelope.project.revision&&active.revision===4&&active.projectSnapshot.appVersion===version&&same(active.projectSnapshot,envelope.project)&&!active.result.continuous&&active.status==='completed');
verify('Backup: selected run retains exactly 0–2 ms with HIGH/LOW indicators',same(vector(active,'time'),[0,.002])&&active.result.points===2&&same(lamps(envelope.project,active).map(lamp=>({value:lamp.value,label:lamp.label,on:lamp.on,available:lamp.available})),[{value:'1',label:'HIGH',on:true,available:true},{value:'0',label:'LOW',on:false,available:true}]));
verify('Backup: recorded current-run lamps agree at both endpoints and an interior cursor time',[0,.001,.002].every(time=>same(lamps(envelope.project,active,time).map(lamp=>lamp.value),['1','0'])));
report.backup={activeRunId:envelope.activeRunId,currentRevision:envelope.project.revision,currentProjectVersion:envelope.project.appVersion,totalRuns:envelope.runs.length,importedHistoricalRuns:imported.length,notMarkedImportedRuns:notMarkedImported.length,snapshotVersions:{'2.0.0-rc.2':5,[version]:2},operatorReportedFinalBuildRuns:2,operatorReportedIntermediateBuildRuns:2,latestIndicators:lamps(envelope.project,active),runtimeBuildProvenance:'The application runtime build is not stored in the project backup; the distinct operator capture notes remain external observations.'};

function parseCSV(text){
 if(text.length>65536)throw new Error('CSV exceeds audit bound');
 const rows=[];let row=[],field='',quoted=false,closed=false;
 const push=()=>{if(field.length>1000)throw new Error('CSV field exceeds audit bound');row.push(field);field='';closed=false;};
 for(let index=0;index<text.length;index++){
  const char=text[index];
  if(quoted){if(char==='"'){if(text[index+1]==='"'){field+='"';index++;}else{quoted=false;closed=true;}}else field+=char;continue;}
  if(char==='"'){if(field||closed)throw new Error('Malformed CSV quoting');quoted=true;}
  else if(char===',')push();
  else if(char==='\r'||char==='\n'){push();rows.push(row);row=[];if(char==='\r'&&text[index+1]==='\n')index++;}
  else{if(closed)throw new Error('Unexpected text following CSV quote');field+=char;}
 }
 if(quoted)throw new Error('Unclosed CSV quote');if(field||closed||row.length){push();rows.push(row);}return rows;
}
const csvBytes=await readBounded(files.csv,65536),csvText=csvBytes.toString('utf8'),rows=parseCSV(csvText);
verify('CSV: actual download bytes equal the production exporter for the selected run',csvBytes.equals(Buffer.from(csvForRun(active),'utf8')),{bytes:csvBytes.length,runId:active.id});
verify('CSV: header independently maps the two raw nets and two selected probes',same(rows[0],['Time (s)','D(input) (logic)','D(inverted) (logic)','Source state (logic)','Inverted state (logic)'])&&same(active.measurements.map(m=>({label:m.label,vector:m.vector,kind:m.kind})),[{label:'D(input)',vector:'d(input)',kind:'logic'},{label:'D(inverted)',vector:'d(inverted)',kind:'logic'},{label:'Source state',vector:'d(input)',kind:'logic'},{label:'Inverted state',vector:'d(inverted)',kind:'logic'}]));
verify('CSV: two rows contain the exact retained times and literal HIGH/LOW values',rows.length===3&&rows.every(row=>row.length===5)&&same(rows.slice(1),[['0','1','0','1','0'],['0.002','1','0','1','0']]));
verify('CSV: every data column independently equals its saved source vector',rows.slice(1).every((row,index)=>Number(row[0])===vector(active,'time')[index]&&active.measurements.every((measurement,column)=>row[column+1]===vector(active,measurement.vector)[index])));
report.csv={file:files.csv,sourceRunId:active.id,sourceRevision:active.revision,columns:rows[0],dataRows:rows.length-1,exactProductionExportMatch:true};

report.dependencies={};
const pending=['src/storage.js','src/model.js','src/library.js','src/displays.js','src/plots.js','src/installation-check.js','src/installation-ui.js'];
while(pending.length){const file=pending.pop();if(report.dependencies[file])continue;if(!file.startsWith('src/')||file.includes('..')||Object.keys(report.dependencies).length>=80)throw new Error('Unexpected audit source-dependency graph');const content=await fs.readFile(path.join(root,file));report.dependencies[file]=hash(content);for(const match of content.toString('utf8').matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g))pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1])));}
report.verifier={file:'scripts/verify-rc203-downloads.mjs',sha256:hash(await fs.readFile(fileURLToPath(import.meta.url)))};
report.summary={artifacts:report.artifacts.length,capturedRuns:envelope.runs.length,importedHistoricalRuns:imported.length,notMarkedImportedRuns:notMarkedImported.length,jsonRoundTrips:3,recordedSamples,independentDigitalSampleComparisons:independentDigitalComparisons,recordedDigitalEvents:recordedEvents,csvDataRows:rows.length-1,sourceDependencies:Object.keys(report.dependencies).length,passedChecks:report.checks.filter(check=>check.passed).length,failedChecks:report.checks.filter(check=>!check.passed).length};
report.status=report.summary.failedChecks?'failed':finalize?'passed':'passed-provisional';
if(finalize)await fs.writeFile(path.join(root,output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,summary:report.summary,installationDiagnosticStatus:diagnostic.status,installationObservedSummary:counts,...(finalize?{output}:{note:'Read-only audit; --finalize writes the verification record. Application-test counts are separate.'})},null,2));
if(report.summary.failedChecks)process.exitCode=1;
