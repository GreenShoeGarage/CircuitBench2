import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES} from '../src/examples.js';
import {generateNetlist} from '../src/netlist.js';
import {simulateDigital} from '../src/digital.js';
import {mergeEventResults} from '../src/simulation.js';
import {createReport} from '../src/reports.js';

function fixture(){
 const project=EXAMPLES.find(e=>e.id==='bus-slice-join').create(),generated=generateNetlist(project),digital=simulateDigital({...generated.simulation.digital,duration:generated.simulation.duration});
 const run={id:'run_bus_report',projectId:project.id,revision:project.revision,projectSnapshot:structuredClone(project),analysis:structuredClone(project.analysis),startedAt:'2026-10-24T06:00:00Z',status:'completed',netlist:generated.netlist,simulation:generated.simulation,measurements:generated.measurements,engine:digital.engine,models:[],logs:digital.logs,diagnostics:generated.diagnostics,result:mergeEventResults(null,digital)};
 return {project,run};
}
test('report of a real compiled bus circuit retains words and never derives numeric bus extrema',()=>{
 const {project,run}=fixture(),html=createReport({project,run,schematic:'',plot:''});
 assert.match(html,/States observed: 10Z1/);assert.match(html,/States observed: Z1/);assert.match(html,/States observed: 10/);
 assert.match(html,/<td>10Z1<\/td><td>10Z1<\/td><td>—<\/td><td>—<\/td>/);
 assert.match(html,/Bus words are MSB first/);assert.match(html,/cb-digital-kernel-2/);
 assert.doesNotMatch(html,/NaN|Infinity/);
});
test('report bounds a long word-state summary while preserving first and last literal words',()=>{
 const {project,run}=fixture(),words=Array.from({length:40},(_,n)=>n.toString(2).padStart(8,'0'));
 run.measurements=[{id:'word',label:'8-bit word',vector:'b(word)',kind:'bus',unit:'logic',width:8,bitOrder:'msb-first'}];
 run.result={points:40,vectors:[{name:'time',unit:'s',values:words.map((_,n)=>n*1e-6)},{name:'b(word)',kind:'bus',unit:'logic',width:8,bitOrder:'msb-first',values:words}]};
 const html=createReport({project,run,schematic:'',plot:''});
 assert.match(html,/first 32 of 40 distinct states/);assert.match(html,/<td>00000000<\/td><td>00100111<\/td><td>—<\/td><td>—<\/td>/);
});
