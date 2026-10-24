# CircuitBench internal module contract

Plain browser ES modules; no framework. All source paths use relative imports. Public engine copied as `engine/` beside `src/` in distribution. Initial app version `1.0.0-rc.1`; promote only after verification.

## Authoritative project

```js
{
 schemaVersion:1, appVersion:'1.0.0-rc.1', id, title, revision:0, createdAt, updatedAt,
 question:'', notes:'', assumptions:[],
 circuit:{components:[{id,ref,type,params:{},model:null}],
   connections:[{id,a,b}], junctions:[{id}], labels:[{id,name,target}]},
 layout:{components:{[id]:{x,y,rotation:0,mirror:false}},
   wires:{[connectionId]:{points:[{x,y}]}}, junctions:{[id]:{x,y}},annotations:[{id,x,y,text}]},
 analysis:{type:'ac',start:'1',stop:'100k',points:60,step:'10u',duration:'10m',source:'V1',sweepStart:'0',sweepStop:'10',sweepStep:'0.1',temperature:27,reltol:'1e-4',uic:false},
 probes:[{id,kind:'voltage',a:'componentId:pinId',b:null,label:'Output'}],
 workspace:'schematic', netlistText:''
}
```

Endpoint strings: `${component.id}:${pin.id}` or `j:${junction.id}`. Ground is component type GND with pin `0`. Connectivity ONLY via explicit connections, label equality, and GND; never wire geometry intersection. Layout is visual. Junction creation on wire splits edge(s) intentionally. Every editing mutation goes through root commit(), which increments revision, updates timestamp, records undo, saves. App result history lives alongside project (envelope `{project,runs}`) not within electrical model.

## library.js (core agent)

`LIBRARY` array of `{type,name,category,prefix,pins:[{id,name,x,y}],params:[{key,label,unit,default,...}],defaults:{},model,description,limitations,provenance}`. Pins coordinates local, 20px grid preferred. Types `R,C,L,V,I,GND,D,LED,NPN,PNP,NMOS,PMOS,SW,OPAMP`. Opamp supplies explicit; educational generic models identified. `MODELS` object. `getPart(type)`. `parseValue(text,unit?)` returns finite SI numeric (throws clear error). SI uppercase M=mega vs m=milli, output netlists decimal scientific notation.

## model.js (core agent)

`newProject(title?)`; `validateProject(input)` returns sanitized clone or throws; `clone(value)`; `uid(prefix?)`; `addComponent(project,type,x,y)` mutates and returns new component; `removeItems(project,ids)`; `duplicateItems(project,ids,offset=40)` returns new IDs and copies internal wiring only; `endpointPosition(project,endpoint)` returns `{x,y}`; `buildNets(project)` returns `{endpointToNet:Object,nets:[{name,endpoints}],diagnostics:[{severity,message,...}]}`; `checkCircuit(project)` returns diagnostics; `serializeProject(project)` => JSON; `parseProject(text)` => validated project. `VERSION` exported.

## netlist.js (core agent)

`generateNetlist(project)` => `{netlist,diagnostics,netMap:Object,modelManifest:Array,measurements:Array}`. Throws only malformed model? Prefer diagnostics and allow root to block severity error. All analyses via .control commands if chosen engine needs them; coordinate with engine agent. Measurements: `{id,label,vector,unit,kind,a?,b?}` where voltage net vectors `v(out)` etc. Include all node voltages and supported currents in simulation output; derivative probe selection can be applied root.

`validateImportedNetlist(text)` => `{text,diagnostics}`: documented strict allowlist, no file or shell/control arbitrary execution. Root generates safe .control analysis itself if necessary; coordinate. `generateNetlist` handles workspace netlist path. Imported .model supported validated dialect; no .include/.lib. Bounds on analysis size and component count.

## examples.js (core agent)

`EXAMPLES` array `{id,title,category,question,description,expected,tryThis,create:()=>project}` includes blank-free RC AC, step, divider, rectifier, transistor, MOSFET, amplifier, sensor conditioning, switch. Each project analysis/probes valid.

## editor.js (editor agent)

`new SchematicEditor(container,{getProject:()=>project,onChange:(mutator,label)=>void,onSelect:(ids)=>void,onProbe:(endpoint,second?)=>void,onStatus:(text)=>void})`; `.render()`, `.setMode(mode)`, `.place(type)`, `.fit()`, `.zoom(factor)`, `.rotate()`, `.mirror()`, `.delete()`, `.copy()`, `.paste()`, `.duplicate()`, `.select(ids)`, `.getSelection()`, `.cancel()`, `.exportSVG()` returns self-contained SVG string. Modes select, wire, pan, junction, label, note, probe. Single/multi select (shift plus box), grid, node snap cues, move/rotate preserves connectivity, explicit junction insertion; wire waypoints editable by selecting wire and dragging handles; wires endpoints identify semantic pins. Keyboard alternatives on svg focus / keyboard connect can be exposed inspector root. `symbols.js` may export symbol markup/thumbnail; coordinate own API. Accessible names/focusable component and pin targets; render emits classes styled root. Set SVG viewBox and responsive width/height; do not globally intercept inputs.

## engine.js (engine agent)

`ENGINE_INFO` includes version build sha; `new CircuitEngine()`, `.run(netlist,{timeoutMs,onLog}={})` returns `{vectors:[{name,unit,values:number[],imag?:number[]}],logs:string[],engine:...}`, `.stop()` terminates computation and rejects with status `'cancelled'`; timeout status `'timed-out'`. Fresh worker per job, terminate on success too. Native engine retained only dev reference. All dependencies vendored locally with licenses/hashes.

## Ownership

Root: app, index, CSS, plots, storage, reports, service worker, build/packaging, integration/QA, most docs. Core agent: library, model, netlist, examples, core tests, schema docs/model provenance. Editor agent: editor and symbols, editor notes. Engine agent: engine/runtime assets, engine proof/tests, engine evaluation/notices. Coordinate API edits in messages; do not overwrite other ownership files.
