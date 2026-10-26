/** Analysis edits use the real rendered field callbacks, commit/validation and
 * numerical compiler. This verifies handler delivery, not browser automation's
 * generation of native change/blur events. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {EXAMPLES} from '../src/examples.js';
import {VERSION, validateProject} from '../src/model.js';
import {getPins} from '../src/library.js';
import {generateNetlist} from '../src/netlist.js';
import {compileCoordinated, CoordinatedSession} from '../src/coordinated.js';
import {escapeHTML as esc} from '../src/storage.js';

const source=await fs.readFile(new URL('../src/app.js',import.meta.url),'utf8');
function actualFunction(name){
 const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
 assert.ok(start>=0,`Locate production ${name}`);
 const next=source.slice(start+1).search(/\n(?:async )?function [A-Za-z_$]/);
 assert.ok(next>=0,`Locate end of production ${name}`);
 return source.slice(start,start+1+next);
}
const hasDigital=source.match(/^const hasDigital=.*;$/m)?.[0];
const solverBinding=source.match(/\$\('solver-mode'\)\.onchange=e=>commit\([^;]+;/)?.[0];
assert.ok(hasDigital&&solverBinding,'Locate actual digital check and solver binding');

function harness(){
 const nodes=new Map(),state={saves:0,messages:[],errors:[]};
 const $=id=>{
  if(!nodes.has(id))nodes.set(id,{id,hidden:false,checked:false,open:false,value:'',textContent:'',children:[],_html:'',
   set innerHTML(value){this._html=value;this.children=[...value.matchAll(/<input data-param="([^"]+)" value="([^"]*)"[^>]*>/g)].map(([,param,fieldValue])=>({dataset:{param},value:fieldValue}));},
   get innerHTML(){return this._html;},
   querySelectorAll(selector){assert.equal(selector,'[data-param]');return this.children;}
  });
  return nodes.get(id);
 };
 const context=vm.createContext({project:validateProject(EXAMPLES.find(e=>e.id==='rc-step').create()),VERSION,validateProject,getPins,esc,$,clone:structuredClone,JSON,Date,Number,undoStack:[],redoStack:[],continuousPreparation:null,continuousSession:null,
  scheduleSave(){state.saves++;},status:message=>state.messages.push(message),handleError:error=>state.errors.push(error),stopContinuous(){assert.fail('No continuous session should stop in this fixture');},render(){context.renderAnalysis();}
 });
 vm.runInContext([hasDigital,...['commit','fieldHTML','renderAnalysis'].map(actualFunction),solverBinding].join('\n'),context);
 context.renderAnalysis();
 return{context,state,$};
}

test('changing Maximum time step after selecting coordinated commits a revision and changes the actual numerical sampling',()=>{
 const h=harness();
 assert.equal(h.context.project.analysis.step,'5u');
 h.$('solver-mode').value='coordinated';
 h.$('solver-mode').onchange({target:h.$('solver-mode')});
 assert.equal(h.context.project.revision,1);
 const before=structuredClone(h.context.project),oldPlan=compileCoordinated(before,generateNetlist(before)),oldResult=new CoordinatedSession(oldPlan).advanceTo(oldPlan.duration,{maxSteps:20000});
 assert.equal(oldResult.points,1002);
 const step=h.$('analysis-fields').querySelectorAll('[data-param]').find(input=>input.dataset.param==='step');
 assert.equal(step.value,'5u');
 assert.equal(typeof step.onchange,'function');
 step.value='100u';
 step.onchange({target:step});
 assert.deepEqual(h.state.errors,[]);
 assert.equal(h.context.project.revision,2);
 assert.equal(h.context.project.analysis.step,'100u');
 assert.equal(h.state.saves,2);
 assert.equal(h.context.undoStack.at(-1).analysis.step,'5u');
 assert.equal(h.$('analysis-fields').querySelectorAll('[data-param]').find(input=>input.dataset.param==='step').value,'100u');
 const plan=compileCoordinated(h.context.project,generateNetlist(h.context.project)),result=new CoordinatedSession(plan).advanceTo(plan.duration,{maxSteps:20000});
 assert.ok(Math.abs(plan.maxStep-0.0001)<1e-15);
 assert.equal(result.points,52);
 assert.equal(result.done,true);
 assert.equal(before.analysis.step,'5u');
 assert.equal(h.state.messages.at(-1),'Experiment settings changed');
});
