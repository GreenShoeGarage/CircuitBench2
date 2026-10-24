/** CircuitBench curated educational components. Original definitions, MIT. */
export const MODEL_VERSION = 'cb-models-1.0.0';
export const DIGITAL_MODEL_VERSION = 'cb-digital-models-1.0.0';
export const BUS_MODEL_VERSION = 'cb-bus-models-1.0.0';
export const DISPLAY_MODEL_VERSION = 'cb-display-models-1.0.0';
/** Segment bit order is a,b,c,d,e,f,g,dp from least to most significant. */
export const SEVEN_SEGMENT_HEX = Object.freeze([0x3f,0x06,0x5b,0x4f,0x66,0x6d,0x7d,0x07,0x7f,0x6f,0x77,0x7c,0x39,0x5e,0x79,0x71]);
export function sevenSegmentDecodeTable(mode='hex',active='high'){
 if(!['hex','bcd'].includes(mode)||!['high','low'].includes(active))throw new Error('Seven-segment decoding needs hex/BCD mode and high/low polarity.');
 return SEVEN_SEGMENT_HEX.map((value,index)=>(active==='low'?((mode==='bcd'&&index>9?0:value)^0x7f):(mode==='bcd'&&index>9?0:value)).toString(2).padStart(7,'0'));
}
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

const p=(id,name,x,y,domain='analog',direction='passive')=>({id,name,x,y,domain,direction,width:1});
const value=(key,label,unit,def,extra={})=>({key,label,unit,default:def,...extra});
const two=[p('1','1',-40,0),p('2','2',40,0)];
const sourceParams=[
 value('waveform','Excitation','','dc',{options:['dc','sin','pulse','pwl']}),value('dc','DC / operating point','V','1'),value('ac','AC small-signal amplitude','V','1'),value('phase','AC phase','°','0'),
 value('offset','Sine offset','V','0'),value('amplitude','Sine amplitude','V','1'),value('frequency','Sine frequency','Hz','1k'),value('delay','Delay','s','0'),
 value('low','Pulse low','V','0'),value('high','Pulse high','V','1'),value('rise','Rise time','s','1u'),value('fall','Fall time','s','1u'),value('width','Pulse width','s','5m'),value('period','Pulse period','s','10m'),
 value('pwl','PWL time,value pairs','s,V','0,0; 1m,1; 2m,0',{type:'text'})
];
const common={domain:'analog',provenance,limitations:'Ideal lumped element; no parasitics or tolerance unless explicitly included in the circuit.'};
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
const digitalPin=(id,name,x,y,direction)=>p(id,name,x,y,'digital',direction);
const di=(id,name,x,y)=>digitalPin(id,name,x,y,'input'),dout=(id,name,x,y)=>digitalPin(id,name,x,y,'output');
const unary=[di('in','Input',-40,0),dout('out','Output',40,0)];
const binary=[di('a','A',-40,-20),di('b','B',-40,20),dout('out','Output',40,0)];
const logicDelay=value('delay','Propagation delay','s','10n');
const logicLimits='Native 0/1/X/Z event model with transport delay and 1 ps time resolution. No supply current, drive strength, electrical loading, setup/hold, or physical metastability model.';
const nativeProvenance={source:'CircuitBench original four-state event and bridge definitions',version:DIGITAL_MODEL_VERSION,license:'MIT',kind:'educational'};
function nativePart(type,name,prefix,pins,params,semantics,fixture,extra={}){
  const bridge=['ADC','DAC','ADCBUS','DACBUS'].includes(type),model='CB_'+type;
  const limitations=extra.limitations??logicLimits;
  const version=extra.modelVersion??DIGITAL_MODEL_VERSION;
  MODELS[model]={name,version,license:'MIT',kind:bridge?'bridge':'digital',source:nativeProvenance.source,fixture,limitations,definition:JSON.stringify({implementation:bridge?'CircuitBench explicit analog/digital bridge':'CircuitBench four-state event kernel',type,timeResolution:'1 ps',timing:extra.timing??'transport',ports:pins.map(({id,domain,direction})=>({id,domain,direction})),defaults:Object.fromEntries(params.map(x=>[x.key,x.default])),semantics,...(extra.widthPolicy?{widthPolicy:extra.widthPolicy}:{})})};
  return part(type,name,bridge?'Mixed signal':'Digital',prefix,pins,params,{domain:bridge?'mixed':'digital',model,description:semantics,fixture,provenance:version===DIGITAL_MODEL_VERSION?nativeProvenance:{...nativeProvenance,version},limitations,supportedAnalyses:['tran'],...extra});
}
LIBRARY.push(
  nativePart('DIN','Logic input','IN',[dout('out','Output',40,0)],[value('state','Logic state','','0',{options:['0','1','X','Z']})],'Constant logic 0, 1, unknown X, or undriven Z. Multiple outputs on a net resolve together.','logic-gates'),
  nativePart('CLOCK','Digital clock','CLK',[dout('out','Clock',40,0)],[value('period','Period','s','1m'),value('duty','High duty cycle','%','50'),value('delay','Start delay','s','0')],'Periodic native logic clock; low before its delay and high for the configured duty fraction of each period. Initial values settle at t=0.','digital-half-adder'),
  ...[['BUF','Logic buffer','The input logic is buffered; X and Z inputs produce unknown X.'],['NOT','NOT gate','The input logic is inverted; X and Z inputs produce unknown X.']].map(([type,name,semantics])=>nativePart(type,name,'U',unary,[logicDelay],semantics,'logic-gates')),
  ...[['AND','AND gate','Output is 0 if either input is 0; 1 only when both inputs are 1; otherwise X.'],['OR','OR gate','Output is 1 if either input is 1; 0 only when both inputs are 0; otherwise X.'],['XOR','XOR gate','Output is 1 for different known inputs and 0 for equal known inputs; any X or Z input makes X.'],['NAND','NAND gate','Logical inversion of the four-state AND result.'],['NOR','NOR gate','Logical inversion of the four-state OR result.'],['XNOR','XNOR gate','Logical inversion of the four-state XOR result.']].map(([type,name,semantics])=>nativePart(type,name,'U',binary,[logicDelay],semantics,'logic-gates')),
  nativePart('TRI','Tri-state buffer','U',[di('in','Data',-40,-20),di('en','Enable',-40,20),dout('out','Output',40,0)],[logicDelay],'Enable 1 drives known input data; enable 0 releases the output to Z; uncertain enable or enabled uncertain data gives X. Conflicting active drivers resolve X.','tri-state-bus'),
  nativePart('DFF','D flip-flop','U',[di('d','Data',-40,-20),di('clk','Clock ↑',-40,20),dout('q','Q',40,0)],[logicDelay,value('initial','Initial Q','','X',{options:['0','1','X']})],'Rising-edge flip-flop. Data and clock changes at one timestamp are sampled together; an ambiguous possible rising edge makes Q unknown. Initial settling is not a clock edge.','dff-divider'),
  nativePart('ADC','Analog to logic bridge','ADC',[p('in','Input +',-40,-20,'analog','input'),p('ref','Reference −',-40,20,'analog','input'),dout('out','Logic output',40,0)],[value('low','Low threshold','V','1.5'),value('high','High threshold','V','3.5'),value('mode','Threshold mode','','threshold',{options:['threshold','schmitt']})],'Digitizes V(input) − V(reference). Threshold mode reports X between limits; Schmitt mode retains a prior known state in the band, with an initial band value remaining X.','adc-ramp',{limitations:'Ideal infinite-impedance observer. Crossing times are interpolated between actual ngspice samples; maximum analog step limits timing accuracy. No quantization beyond one bit, loading, aperture, or noise. Choose Coordinated transient for feedback; ngspice replay remains feed-forward.'}),
  nativePart('DAC','Logic to analog bridge','DAC',[di('in','Logic input',-40,0),p('out','Output +',40,-20,'analog','output'),p('ref','Reference −',40,20,'analog','passive')],[value('low','Logic 0 output','V','0'),value('high','Logic 1 output','V','5'),value('rise','Rise time','s','1n'),value('fall','Fall time','s','1n')],'Drives a voltage between output and reference from a resolved logic state, with finite linear rise/fall. X or Z input stops replay with a diagnostic.','clock-dac-rc',{limitations:'Ideal voltage output without current limit, finite output resistance, or power rails. Only known 0/1 is supported; X/Z is never silently replaced by a voltage. Analog feedback requires Coordinated transient.'})
);
const width=value('width','Data width','bits','4');
const busExtra=widthPolicy=>({category:'Buses & logic',modelVersion:BUS_MODEL_VERSION,widthPolicy});
const aliasPin=(id,name,x,y)=>p(id,name,x,y,'digital','passive');
LIBRARY.push(
 nativePart('BUSIN','Bus input','BIN',[dout('out','Data',40,0)],[width,value('value','Logic word','','0x0')],'An explicit 1–8 bit word, written MSB first. Bit zero is the least-significant bit. Each bit drives and resolves independently.','bus-slice-join',busExtra({out:'width'})),
 nativePart('PATTERN','Digital pattern','PAT',[dout('out','Pattern',40,0)],[width,value('pattern','Time, word sequence','s,word','0,0000; 1m,0001; 2m,0010; 3m,0011',{type:'text',maxLength:12000}),value('repeat','Repeat period (0 = once)','s','0')],'Timed 1–8 bit words beginning at t=0; optional repeat period must be later than the last event. Bit states may include X and Z.','bus-register',busExtra({out:'width'})),
 nativePart('SLICE','Bus slice','SL',[aliasPin('in','Input bus',-40,0),aliasPin('out','Selected bits',40,0)],[width,value('lsb','First input bit','','0'),value('count','Number of bits','bits','1')],'Zero-delay bidirectional electrical bit alias: output bit i is input bit lsb+i. Preserves Z and per-bit contention.','bus-slice-join',{...busExtra({in:'width',out:'count'}),timing:'electrical bit alias'}),
 nativePart('JOIN','Bus join','J',[aliasPin('a','Low bits',-40,-20),aliasPin('b','High bits',-40,20),aliasPin('out','Joined bus',40,0)],[value('aWidth','Low input width','bits','2'),value('bWidth','High input width','bits','2')],'Zero-delay bidirectional electrical bit alias: A forms the low bits and B forms the upper bits. Combined width is at most 8.','bus-slice-join',{...busExtra({a:'aWidth',b:'bWidth',out:'aWidth+bWidth'}),timing:'electrical bit alias'}),
 nativePart('REGISTER','Bus register','REG',[di('d','Data',-40,-20),di('clk','Clock ↑',-40,20),di('en','Enable',-20,40),di('rst','Synchronous reset',20,40),dout('q','Q',40,0)],[width,value('initial','Initial word','','0x0'),logicDelay],'Rising-edge 1–8 bit register with private state. Synchronous reset to zero wins over enable; enabled data captures atomically. Ambiguous controls produce conservative bitwise uncertainty.','bus-register',busExtra({d:'width',clk:1,en:1,rst:1,q:'width'})),
 nativePart('COUNTER','Binary counter','CTR',[di('clk','Clock ↑',-40,-20),di('en','Enable',-40,20),di('rst','Synchronous reset',0,40),dout('q','Count',40,0)],[width,value('initial','Initial count','','0x0'),logicDelay],'Rising-edge unsigned modulo-2^width counter with private state. Synchronous reset to zero wins over enable; enabled edges increment atomically.','bus-counter',busExtra({clk:1,en:1,rst:1,q:'width'})),
 nativePart('MUX','Bus multiplexer','MUX',[di('a','Select 0',-40,-20),di('b','Select 1',-40,20),di('sel','Select',0,40),dout('out','Data',40,0)],[width,logicDelay],'Two-input 1–8 bit multiplexer. Select 0 chooses A and select 1 chooses B. Unknown select preserves equal known bits; other uncertain bits become X.','bus-mux-decoder',busExtra({a:'width',b:'width',sel:1,out:'width'})),
 nativePart('DECODER','Binary decoder','DEC',[di('in','Address',-40,0),di('en','Enable',0,40),dout('out','One-hot outputs',40,0)],[value('inputBits','Address width','bits','2'),logicDelay],'Enabled binary-to-one-hot decoder. Address width 1–3 gives 2, 4, or 8 outputs. Disable forces all zeros; unknown inputs retain only outputs agreed by every possible binary case.','bus-mux-decoder',busExtra({in:'inputBits',en:1,out:'2^inputBits'})),
 nativePart('LUT','Truth-table logic','LUT',[di('in','Input word',-40,0),dout('out','Output word',40,0)],[value('inputBits','Input width','bits','2'),value('outputBits','Output width','bits','2'),value('table','Complete truth table','','00:00; 01:01; 10:01; 11:10',{type:'text',maxLength:12000}),logicDelay],'Complete bounded truth table: 1–4 input bits and 1–8 output bits. Unknown input bits enumerate compatible rows; an output keeps a unanimous literal value or becomes X.','truth-table-adder',busExtra({in:'inputBits',out:'outputBits'}))
);
LIBRARY.push(
 nativePart('HEX7','Hex / BCD seven-segment decoder','HEX',[di('in','Digit [3:0]',-40,-20),di('dp','Decimal point',-40,20),dout('out','Segments [7:0]',40,0)],[value('mode','Digit mode','','hex',{options:['hex','bcd']}),value('active','Segment active level','','high',{options:['high','low']}),logicDelay],'Decodes a 4-bit digit into a,b,c,d,e,f,g segment bits 0–6; scalar decimal-point input drives bit 7. Hex mode shows 0–9,A,b,C,d,E,F. BCD mode blanks 10–15. Unknown inputs retain only segment values agreed by every compatible binary digit.','seven-segment-counter',{category:'Displays',modelVersion:DISPLAY_MODEL_VERSION,widthPolicy:{in:4,dp:1,out:8}}),
 nativePart('SEG7','Seven-segment display','DISP',[di('in','Segments [7:0]',-40,0)],[value('active','Segment active level','','high',{options:['high','low']})],'Passive 8-bit digital display: bit 0=a, 1=b, 2=c, 3=d, 4=e, 5=f, 6=g, 7=decimal point. Displays the actual resolved segment states from the current run or selected time. X and Z remain distinct.','seven-segment-states',{category:'Displays',modelVersion:DISPLAY_MODEL_VERSION,widthPolicy:{in:8},timing:'passive observation',limitations:'Digital indicator only: no LED current, resistor, common-anode/cathode electrical model, brightness, persistence, multiplex averaging, or physical loading. Use explicit current-limiting components and LED models for electrical LED experiments.'})
);
export const CONVERTER_MODEL_VERSION='cb-converters-1.0.0';
LIBRARY.push(
 nativePart('ADCBUS','Multibit sampled ADC','ADCB',[p('p','Input +',-40,-20,'analog','input'),p('n','Reference −',-40,20,'analog','input'),dout('q','Code',40,0)],[width,value('vmin','Zero-code voltage','V','0'),value('vmax','Full-scale voltage','V','5'),value('period','Sample period','s','100u'),value('delay','Conversion delay','s','1n')],'Samples the differential voltage at time 0 and each sample period. Unsigned 2–8 bit nearest-code quantization, saturated to the configured range; output updates after the conversion delay. Requires Coordinated transient.','converter-ramp',{modelVersion:CONVERTER_MODEL_VERSION,widthPolicy:{q:'width'},limitations:'Ideal infinite-impedance sampled converter. No input loading, aperture jitter, noise, nonlinearity, missing codes, or physical metastability. The initial word is X until the first conversion completes. Full-scale maps to code 2^N−1.'}),
 nativePart('DACBUS','Multibit voltage DAC','DACB',[di('d','Code',-40,0),p('p','Output +',40,-20,'analog','output'),p('n','Reference −',40,20,'analog','passive')],[width,value('low','Zero-code voltage','V','0'),value('high','Full-scale voltage','V','5'),value('rise','Rise time','s','1u'),value('fall','Fall time','s','1u'),value('initial','Startup code','','0x0')],'Maps a known unsigned 2–8 bit word to low + code/(2^N−1) × (high−low), with finite linear edges. Holds the explicit startup code until the first known input, then rejects X/Z. Requires Coordinated transient.','converter-staircase',{modelVersion:CONVERTER_MODEL_VERSION,widthPolicy:{d:'width'},limitations:'Ideal voltage source without output resistance, current limit, noise or physical DAC glitches. The explicit startup code is used only before the first fully known word. Later X/Z inputs stop the simulation; no voltage is invented.'})
);
export const CONVERTER_TYPES=Object.freeze(['ADCBUS','DACBUS']);
export const DISPLAY_TYPES=Object.freeze(['HEX7','SEG7']);
export const BUS_TYPES=Object.freeze(['BUSIN','PATTERN','SLICE','JOIN','REGISTER','COUNTER','MUX','DECODER','LUT']);
export const SEQUENTIAL_TYPES=Object.freeze(['DFF','REGISTER','COUNTER']);
export const DIGITAL_TYPES=Object.freeze(LIBRARY.filter(part=>part.domain!=='analog').map(part=>part.type));
export const GATE_TYPES=Object.freeze(['BUF','NOT','AND','OR','XOR','NAND','NOR','XNOR','TRI','DFF']);
export function getPart(type){const d=LIBRARY.find(x=>x.type===type);if(!d)throw new Error(`Unsupported component type: ${type}`);return d;}

function integer(input,label,min,max){const text=String(input);if(!/^\d+$/.test(text)||!Number.isInteger(Number(text))||Number(text)<min||Number(text)>max)throw new Error(`${label} must be an integer from ${min} to ${max}.`);return Number(text);}
/** Fixed pin identities; widths derive only from trusted part definitions. */
export function getPins(component){
 const d=getPart(typeof component==='string'?component:component.type),q={...d.defaults,...(typeof component==='string'?{}:component.params)};
 const widths={},w=()=>integer(q.width,'Data width',1,8);
 if(['BUSIN','PATTERN'].includes(d.type))widths.out=w();
 if(d.type==='SLICE'){widths.in=w();widths.out=integer(q.count,'Slice bit count',1,8);}
 if(d.type==='JOIN'){widths.a=integer(q.aWidth,'Low input width',1,8);widths.b=integer(q.bWidth,'High input width',1,8);widths.out=widths.a+widths.b;if(widths.out>8)throw new Error('Joined bus width must be at most 8 bits.');}
 if(d.type==='REGISTER')widths.d=widths.q=w();if(d.type==='COUNTER')widths.q=w();
 if(d.type==='MUX')widths.a=widths.b=widths.out=w();
 if(d.type==='DECODER'){widths.in=integer(q.inputBits,'Decoder input width',1,3);widths.out=2**widths.in;}
 if(d.type==='ADCBUS')widths.q=integer(q.width,'Converter width',2,8);
 if(d.type==='DACBUS')widths.d=integer(q.width,'Converter width',2,8);
 if(d.type==='SEG7')widths.in=8;
 if(d.type==='HEX7'){widths.in=4;widths.out=8;}
 if(d.type==='LUT'){widths.in=integer(q.inputBits,'Truth-table input width',1,4);widths.out=integer(q.outputBits,'Truth-table output width',1,8);}
 return d.pins.map(pin=>({...pin,width:widths[pin.id]??1}));
}
export function parseLogicWord(input,width,{allowZ=true}={}){
 width=integer(width,'Word width',1,8);const raw=String(input).trim(),text=raw.toUpperCase();let word;
 if(/^0[bB][01]+$/.test(raw)){const value=Number.parseInt(raw.slice(2),2);if(!Number.isSafeInteger(value)||value>=2**width)throw new Error(`Logic word does not fit ${width} bits.`);word=value.toString(2).padStart(width,'0');}
 else if(/^0x[0-9A-Fa-f]+$/.test(raw)||/^0[dD]\d+$/.test(raw)){const value=raw.startsWith('0x')?Number.parseInt(text.slice(2),16):Number(text.slice(2));if(!Number.isSafeInteger(value)||value<0||value>=2**width)throw new Error(`Logic word does not fit ${width} bits.`);word=value.toString(2).padStart(width,'0');}
 else if(/^[01XZ]+$/.test(text))word=text;
 else throw new Error('Use an exact-width binary/X/Z word, or a known 0b, 0x, or 0d number.');
 if(word.length!==width||!allowZ&&word.includes('Z'))throw new Error(`Expected ${width} bits${allowZ?' (0, 1, X or Z)':' (0, 1 or X; no Z state)'}, MSB first.`);return word;
}
export function parsePattern(text,width){
 if(typeof text!=='string'||text.length>12000)throw new Error('Pattern requires 1–200 time,word pairs.');
 const pairs=text.split(/[;\n]+/).map(x=>x.trim()).filter(Boolean).map(row=>{const fields=row.split(',').map(x=>x.trim());if(fields.length!==2)throw new Error('Pattern format: 0,0000; 1m,0001 (time, MSB-first word).');return{time:parseValue(fields[0],'s'),value:parseLogicWord(fields[1],width)};});
 if(!pairs.length||pairs.length>200||pairs[0].time!==0)throw new Error('Pattern requires 1–200 pairs with an explicit first state at t=0.');
 for(let i=0;i<pairs.length;i++){const tick=Math.round(pairs[i].time/1e-12);if(pairs[i].time<0||!Number.isSafeInteger(tick)||i&&tick<=Math.round(pairs[i-1].time/1e-12))throw new Error('Pattern times must increase strictly on the safe 1 ps event grid.');}
 return pairs;
}
export function parseTruthTable(text,inputBits,outputBits){
 inputBits=integer(inputBits,'Truth-table input width',1,4);outputBits=integer(outputBits,'Truth-table output width',1,8);
 if(typeof text!=='string'||text.length>12000)throw new Error('Truth table must be bounded row data.');const rows=Array(2**inputBits);
 for(const row of text.split(/[;\n]+/).map(x=>x.trim()).filter(Boolean)){const fields=row.split(':').map(x=>x.trim());if(fields.length!==2||!new RegExp(`^[01]{${inputBits}}$`).test(fields[0]))throw new Error(`Use complete ${inputBits}-bit input:output rows; no wildcards or executable expressions.`);const index=Number.parseInt(fields[0],2);if(rows[index]!==undefined)throw new Error(`Truth table repeats input ${fields[0]}.`);rows[index]=parseLogicWord(fields[1],outputBits);}
 if(Array.from(rows).some(row=>row===undefined))throw new Error(`Truth table requires all ${rows.length} input rows exactly once.`);return rows;
}
export function buildTruthTable(rows,inputBits,outputBits){
 inputBits=integer(inputBits,'Truth-table input width',1,4);outputBits=integer(outputBits,'Truth-table output width',1,8);if(!Array.isArray(rows)||rows.length!==2**inputBits)throw new Error(`Truth table requires ${2**inputBits} output rows.`);
 return Array.from(rows,(word,i)=>`${i.toString(2).padStart(inputBits,'0')}:${parseLogicWord(word,outputBits)}`).join('; ');
}

/** Human engineering SI parser, intentionally case-sensitive M versus m. */
export function parseValue(input,unit=''){
 if(typeof input==='number'){if(Number.isFinite(input))return input;throw new Error('Value must be finite.');}
 if(typeof input!=='string'||input.length>100)throw new Error('Enter a finite number with an optional engineering prefix.');
 let text=input.trim().replaceAll('µ','u').replaceAll('μ','u').replaceAll('Ω','Ω');
 const unitPatterns={Ω:/(?:ohms?|Ω)$/i,V:/V$/,A:/A$/,F:/F$/,H:/H$/,Hz:/Hz$/,s:/s$/,m:/m$/, '%':/%$/, '°':/(?:°|deg)$/i};
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
