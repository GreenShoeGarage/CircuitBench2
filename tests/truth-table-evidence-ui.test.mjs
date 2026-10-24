import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES} from '../src/examples.js';
import {generateNetlist} from '../src/netlist.js';
import {generateTruthTable} from '../src/digital.js';
import {validateProject,newProject,setComponentParams} from '../src/model.js';
import {safeEnvelope} from '../src/storage.js';
import {validateTruthTables} from '../src/truth-table-evidence.js';
import {truthTableChoices,truthTableCSV,truthTableResultHTML,lutRowsHTML,normalizeLUTRows} from '../src/truth-table-ui.js';

function fixture(edit){
 const project=EXAMPLES.find(e=>e.id==='truth-table-adder').create();edit?.(project);
 const generated=generateNetlist(project),choices=truthTableChoices(project,generated);
 assert.equal(choices.reason,'');
 const inputIds=choices.inputs.map(x=>x.id),outputNames=['b(sumcarry)','d(carry)','d(sum)'];
 const result=generateTruthTable(generated.simulation.digital,{inputIds,outputNames});
 result.outputs=result.outputs.map(x=>({...x,label:choices.outputs.find(o=>o.name===x.name).label}));
 return {project,generated,choices,record:{id:'table_fixture',kind:'truth-table',status:'completed',projectId:project.id,revision:project.revision,projectSnapshot:structuredClone(project),startedAt:'2026-10-24T06:00:00Z',completedAt:'2026-10-24T06:00:01Z',simulation:structuredClone(generated.simulation),simulationHash:'a'.repeat(64),inputIds,outputNames,result}};
}

test('authored half adder compiles, enumerates and retains exact word and scalar columns',()=>{
 const {record,choices}=fixture();
 assert.deepEqual(record.result.rows.map(r=>[...r.inputs,...r.outputs]),[['00','00','0','0'],['01','01','0','1'],['10','01','0','1'],['11','10','1','0']]);
 assert.equal(choices.inputs[0].width,2);
 assert.deepEqual(choices.outputs.find(o=>o.name==='b(sumcarry)'),{name:'b(sumcarry)',label:'Carry : Sum',width:2,preferred:true});
 assert.deepEqual(validateTruthTables([record],validateProject),[record]);
});
test('project backup retains immutable table snapshots, plans and all four saved records',()=>{
 const {project,record}=fixture(),records=Array.from({length:4},(_,i)=>({...structuredClone(record),id:'table_'+i}));
 const restored=safeEnvelope(JSON.parse(JSON.stringify({project,runs:[],truthTables:records})),validateProject);
 assert.deepEqual(restored.truthTables,records);
 restored.project.revision++;
 assert.equal(restored.truthTables[0].projectSnapshot.revision,record.revision);
 assert.equal(restored.truthTables[0].simulationHash,'a'.repeat(64));
 assert.deepEqual(safeEnvelope({project,runs:[]},validateProject).truthTables,[],'legacy backups have no fabricated tables');
});
test('table imports reject missing, duplicated or reordered combinations and invalid words',()=>{
 for(const mutate of [r=>r.result.rows.pop(),r=>r.result.rows[1].inputs=['00'],r=>r.result.rows[1].index=0,r=>r.result.rows[1].outputs[0]='1',r=>r.result.rows[1].outputs[0]='0x1',r=>r.result.rows[1].outputs[0]=1,r=>r.result.rows[1].inputs=['X1']]){
  const {record}=fixture();mutate(record);assert.throws(()=>validateTruthTables([record],validateProject),/rows|combination/);
 }
});
test('table imports reject incompatible column metadata, selections and snapshot identity',()=>{
 for(const mutate of [r=>r.result.outputs[0].width=1,r=>r.result.outputs[0].bitOrder='lsb-first',r=>r.outputNames.reverse(),r=>r.inputIds=['other'],r=>r.revision++,r=>r.projectId='project_other',r=>r.simulation.mode='mixed']){
  const {record}=fixture();mutate(record);assert.throws(()=>validateTruthTables([record],validateProject));
 }
 const {record}=fixture();assert.throws(()=>validateTruthTables(Array(5).fill(record),validateProject),/four/);assert.throws(()=>validateTruthTables([record,record],validateProject),/malformed/);
});
test('unknown and released LUT outputs remain literal states in table evidence',()=>{
 const {record}=fixture(p=>{const lut=p.circuit.components.find(c=>c.type==='LUT');setComponentParams(p,lut.id,{table:'00:0X; 01:Z1; 10:XX; 11:ZZ'});});
 assert.deepEqual(record.result.rows.map(r=>r.outputs[0]),['0X','Z1','XX','ZZ']);
 assert.deepEqual(validateTruthTables([record],validateProject)[0].result.rows,record.result.rows);
});
test('table CSV preserves leading zeros and escapes quoted comma-bearing labels',()=>{
 const {record}=fixture();record.result.inputs[0].label='Input "A,B"';
 const csv=truthTableCSV(record),rows=csv.split('\r\n');
 assert.equal(rows.length,5);
 assert.equal(rows[0],'"Row","Input ""A,B"" [2 bit input, MSB first]","Carry : Sum [2 bit output, MSB first]","CARRY [1 bit output, MSB first]","SUM [1 bit output, MSB first]"');
 assert.equal(rows[1],'"0","00","00","0","0"');assert.equal(rows[4],'"3","11","10","1","0"');
});
test('table presentation escapes imported content and identifies stale restored evidence',()=>{
 const {project,record}=fixture();record.result.outputs[0].label='<img src=x onerror=alert(1)>';record.importedFromBackup=true;record.result.warnings=['<script>bad()</script>'];project.revision++;
 const html=truthTableResultHTML(record,project);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<img|<script>/);
 assert.match(html,/working circuit has changed/);assert.match(html,/not independently recomputed/);assert.match(html,/does not describe hazards/);assert.match(html,/<td class="mono">00<\/td>/);
});
test('truth-table setup rejects stateful and mixed experiments while preserving selectable widths',()=>{
 for(const id of ['bus-register','bus-counter','bus-mux-decoder','bus-dac-bit']){const project=EXAMPLES.find(e=>e.id===id).create();assert.match(truthTableChoices(project,generateNetlist(project)).reason,/transient|purely digital/);}
 const project=newProject();assert.match(truthTableChoices(project,{simulation:{mode:'digital',digital:{inputGroups:[],probes:[]}}}).reason,/input/i);
 assert.match(truthTableChoices(project,{diagnostics:[{severity:'error',message:'Port widths disagree.'}]}).reason,/Port widths disagree/);
});
test('LUT row editor exposes every binary address and exact editable output word',()=>{
 const html=lutRowsHTML(['00','0X','Z1','10'],2,2);
 assert.equal((html.match(/data-lut-row=/g)??[]).length,4);
 assert.match(html,/aria-label="Output for input 00" value="00"/);assert.match(html,/aria-label="Output for input 11" value="10"/);assert.match(html,/value="0X"/);assert.match(html,/value="Z1"/);
 assert.doesNotMatch(lutRowsHTML(['" autofocus onfocus="bad'],1,1),/value="" autofocus/);
});
test('LUT row editing distinguishes a hexadecimal prefix from a literal unknown bit',()=>{
 assert.deepEqual(normalizeLUTRows(['0x0','0X0','0b101','0d3'],3),['000','0X0','101','011']);
 assert.deepEqual(normalizeLUTRows([' 0xA ','10xz'],4),['1010','10XZ']);
 assert.throws(()=>normalizeLUTRows(['000','0x8'],3),/Row 1/);
});
