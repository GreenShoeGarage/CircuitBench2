/** CircuitBench curated educational components. Original definitions, MIT. */
export const MODEL_VERSION = 'cb-models-1.0.0';
const provenance = {source:'CircuitBench original educational parameter sets',version:MODEL_VERSION,license:'MIT',kind:'generic'};
export const MODELS = {
  CB_DIODE:{name:'Generic silicon diode',version:MODEL_VERSION,license:'MIT',kind:'generic',source:provenance.source,definition:'.model CB_DIODE D(IS=1e-14 N=1 RS=0.5 CJO=2e-12 TT=5e-9 BV=100 IBV=1e-6)',limitations:'Educational silicon junction; not a characterized part. No thermal or package model.',fixture:'rectifier'},
  CB_LED:{name:'Generic red LED',version:MODEL_VERSION,license:'MIT',kind:'generic',source:provenance.source,definition:'.model CB_LED D(IS=1e-20 N=2 RS=8 CJO=10e-12 BV=5 IBV=1e-6)',limitations:'Approximate red LED junction only; no optical, thermal, luminous intensity, or manufacturer guarantee.',fixture:'led-driver'},
  CB_NPN:{name:'Generic NPN',version:MODEL_VERSION,license:'MIT',kind:'generic',source:provenance.source,definition:'.model CB_NPN NPN(IS=1e-14 BF=100 VAF=100 IKF=0.1 CJE=10e-12 CJC=5e-12 TF=400e-12 TR=20e-9)',limitations:'Small-signal educational BJT; no safe-operating-area or thermal model.',fixture:'transistor'},
  CB_PNP:{name:'Generic PNP',version:MODEL_VERSION,license:'MIT',kind:'generic',source:provenance.source,definition:'.model CB_PNP PNP(IS=1e-14 BF=80 VAF=80 IKF=0.1 CJE=10e-12 CJC=5e-12 TF=500e-12 TR=20e-9)',limitations:'Small-signal educational BJT; no safe-operating-area or thermal model.',fixture:'pnp-driver'},
  CB_NMOS:{name:'Generic level-1 NMOS',version:MODEL_VERSION,license:'MIT',kind:'generic',source:provenance.source,definition:'.model CB_NMOS NMOS(LEVEL=1 VTO=2 KP=0.02 LAMBDA=0.02 RD=0.5 RS=0.5 CGSO=100e-12 CGDO=100e-12 CBD=50e-12 CBS=50e-12)',limitations:'Educational long-channel level-1 model. Body tied to source; not a power-MOSFET or switching-loss model.',fixture:'mosfet'},
  CB_PMOS:{name:'Generic level-1 PMOS',version:MODEL_VERSION,license:'MIT',kind:'generic',source:provenance.source,definition:'.model CB_PMOS PMOS(LEVEL=1 VTO=-2 KP=0.01 LAMBDA=0.02 RD=0.5 RS=0.5 CGSO=100e-12 CGDO=100e-12 CBD=50e-12 CBS=50e-12)',limitations:'Educational long-channel level-1 model. Body tied to source; not a power-MOSFET or switching-loss model.',fixture:'pmos-driver'},
  CB_SWITCH:{name:'Voltage-controlled switch',version:MODEL_VERSION,license:'MIT',kind:'idealized',source:provenance.source,definition:'.model CB_SWITCH SW(RON=1 ROFF=1e9 VT=2.5 VH=0.1)',limitations:'Abrupt electrical switch with hysteresis; no contact bounce, arc, or thermal behavior.',fixture:'switch'},
  CB_OPAMP:{name:'Bounded educational op amp',version:MODEL_VERSION,license:'MIT',kind:'idealized',source:provenance.source,definition:'.subckt CB_OPAMP inp inn vp vn out\nRdiff inp inn 1e9\nBdrive drive 0 V=0.5*(v(vp)+v(vn))+0.5*(v(vp)-v(vn))*tanh(2e5*v(inp,inn)/(abs(v(vp)-v(vn))+1e-6))\nRout drive out 10\n.ends CB_OPAMP',limitations:'Supply-bounded, 100,000 V/V low-frequency gain, 10 Ω output, 1 GΩ differential input. No finite bandwidth, slew rate, supply current, offset, common-mode limits, or thermal behavior.',fixture:'amplifier'}
};

const p=(id,name,x,y)=>({id,name,x,y});
const value=(key,label,unit,def,extra={})=>({key,label,unit,default:def,...extra});
const two=[p('1','1',-40,0),p('2','2',40,0)];
const sourceParams=[
 value('waveform','Excitation','','dc',{options:['dc','sin','pulse','pwl']}),value('dc','DC / operating point','V','1'),value('ac','AC small-signal amplitude','V','1'),value('phase','AC phase','°','0'),
 value('offset','Sine offset','V','0'),value('amplitude','Sine amplitude','V','1'),value('frequency','Sine frequency','Hz','1k'),value('delay','Delay','s','0'),
 value('low','Pulse low','V','0'),value('high','Pulse high','V','1'),value('rise','Rise time','s','1u'),value('fall','Fall time','s','1u'),value('width','Pulse width','s','5m'),value('period','Pulse period','s','10m'),
 value('pwl','PWL time,value pairs','s,V','0,0; 1m,1; 2m,0',{type:'text'})
];
const common={provenance,limitations:'Ideal lumped element; no parasitics or tolerance unless explicitly included in the circuit.'};
const fixtures={R:'divider',C:'rc-step',L:'rl-step',V:'rc-filter',I:'current-source-fixture',GND:'divider',D:'rectifier',LED:'led-driver',NPN:'transistor',PNP:'pnp-driver',NMOS:'mosfet',PMOS:'pmos-driver',SW:'switch',OPAMP:'amplifier'};
function part(type,name,category,prefix,pins,params,extra={}){return {...common,type,name,category,prefix,pins,params,defaults:Object.fromEntries(params.map(x=>[x.key,x.default])),model:null,description:name,fixture:fixtures[type],...extra};}
export const LIBRARY=[
 part('R','Resistor','Passives','R',two,[value('value','Resistance','Ω','10k')]),
 part('C','Capacitor','Passives','C',two,[value('value','Capacitance','F','100n'),value('ic','Initial voltage','V','0')],{limitations:'Ideal capacitor. Initial voltage applies when transient starts from initial conditions (UIC).'}),
 part('L','Inductor','Passives','L',two,[value('value','Inductance','H','10m'),value('ic','Initial current','A','0')],{limitations:'Ideal inductor. Add explicit winding resistance for practical power circuits.'}),
 part('V','Voltage source','Sources','V',[p('p','+',0,-40),p('n','−',0,40)],sourceParams,{description:'Independent voltage source: DC, sine, pulse, or PWL. AC amplitude is separate from transient excitation.',limitations:'Ideal independent source. Positive current flows into the positive terminal (source-delivered current is negative).'}),
 part('I','Current source','Sources','I',[p('p','From',0,-40),p('n','To',0,40)],sourceParams.map(x=>({...x,unit:x.unit==='V'?'A':x.unit==='s,V'?'s,A':x.unit,default:['dc','ac','amplitude','high'].includes(x.key)?'1m':x.key==='pwl'?'0,0; 1m,1m; 2m,0':x.default})),{description:'Independent current flows from p to n; DC, sine, pulse, or PWL.',limitations:'Ideal current source; requires a valid DC return path.'}),
 part('GND','Ground','Connections','G',[p('0','Ground',0,-20)],[],{description:'SPICE node 0 reference. All ground symbols are electrically joined.',limitations:'Reference node, not a physical earth or protective-earth model.'}),
 ...[['D','Diode','D','CB_DIODE'],['LED','Red LED','D','CB_LED']].map(([type,name,prefix,model])=>part(type,name,'Semiconductors',prefix,[p('a','Anode',-40,0),p('k','Cathode',40,0)],[],{model,description:MODELS[model].name,limitations:MODELS[model].limitations})),
 ...[['NPN','NPN transistor','CB_NPN'],['PNP','PNP transistor','CB_PNP']].map(([type,name,model])=>part(type,name,'Semiconductors','Q',[p('c','Collector',20,-40),p('b','Base',-40,0),p('e','Emitter',20,40)],[],{model,description:MODELS[model].name,limitations:MODELS[model].limitations})),
 ...[['NMOS','N-channel MOSFET','CB_NMOS'],['PMOS','P-channel MOSFET','CB_PMOS']].map(([type,name,model])=>part(type,name,'Semiconductors','M',[p('d','Drain',20,-40),p('g','Gate',-40,0),p('s','Source / body',20,40)],[value('w','Channel width','m','10u'),value('l','Channel length','m','10u')],{model,description:MODELS[model].name,limitations:MODELS[model].limitations})),
 part('SW','Controlled switch','Active','S',[p('a','Terminal A',-40,0),p('b','Terminal B',40,0),p('cp','Control +',-20,40),p('cn','Control −',20,40)],[],{model:'CB_SWITCH',description:'Voltage-controlled switch: on above 2.6 V, off below 2.4 V.',limitations:MODELS.CB_SWITCH.limitations}),
 part('OPAMP','Operational amplifier','Active','X',[p('inp','Non-inverting +',-40,-20),p('inn','Inverting −',-40,20),p('vp','Positive supply',0,-40),p('vn','Negative supply',0,40),p('out','Output',40,0)],[],{model:'CB_OPAMP',description:MODELS.CB_OPAMP.name,limitations:MODELS.CB_OPAMP.limitations})
];
export function getPart(type){const d=LIBRARY.find(x=>x.type===type);if(!d)throw new Error(`Unsupported component type: ${type}`);return d;}

/** Human engineering SI parser, intentionally case-sensitive M versus m. */
export function parseValue(input,unit=''){
 if(typeof input==='number'){if(Number.isFinite(input))return input;throw new Error('Value must be finite.');}
 if(typeof input!=='string'||input.length>100)throw new Error('Enter a finite number with an optional engineering prefix.');
 let text=input.trim().replaceAll('µ','u').replaceAll('μ','u').replaceAll('Ω','Ω');
 const unitPatterns={Ω:/(?:ohms?|Ω)$/i,V:/V$/,A:/A$/,F:/F$/,H:/H$/,Hz:/Hz$/,s:/s$/,m:/m$/, '°':/(?:°|deg)$/i};
 if(unit&&unitPatterns[unit]&&unitPatterns[unit].test(text)){
   // Bare "1m" with metre unit means one metre. "10u" means 10 micrometres.
   text=text.replace(unitPatterns[unit],'').trim();
 }
 const match=text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(Meg|meg|MEG|[TGMkKmunpf])?$/);
 if(!match)throw new Error(`Invalid value “${input}”. Use a number, an SI prefix, and ${unit||'no unit suffix'}; M is mega and m is milli.`);
 const scales={T:1e12,G:1e9,M:1e6,Meg:1e6,meg:1e6,MEG:1e6,k:1e3,K:1e3,m:1e-3,u:1e-6,n:1e-9,p:1e-12,f:1e-15};
 const n=Number(match[1])*(match[2]?scales[match[2]]:1);
 if(!Number.isFinite(n))throw new Error('Value must be finite.');
 return n;
}

export function parsePWL(text,unit='V'){
 if(typeof text!=='string'||text.length>12000)throw new Error('PWL requires 2–200 time,value pairs.');
 const pairs=text.split(';').map(s=>s.trim()).filter(Boolean).map(pair=>{const bits=pair.split(',').map(s=>s.trim());if(bits.length!==2)throw new Error('PWL format: 0,0; 1m,1; 2m,0 (time,value).');return [parseValue(bits[0],'s'),parseValue(bits[1],unit)];});
 if(pairs.length<2||pairs.length>200)throw new Error('PWL requires 2–200 time,value pairs.');
 if(pairs.some((p,i)=>p[0]<0||(i&&p[0]<=pairs[i-1][0])))throw new Error('PWL times must be nonnegative and strictly increasing.');
 return pairs;
}

export function modelManifest(names){return [...new Set(names)].filter(Boolean).map(name=>{const m=MODELS[name];if(!m)return {name,missing:true};let hash=2166136261;for(const ch of m.definition){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}return {name,version:m.version,source:m.source,license:m.license,kind:m.kind,definition:m.definition,contentId:`fnv1a32-${(hash>>>0).toString(16).padStart(8,'0')}`};});}
