/* CircuitBench schematic symbols. Original artwork, MIT licensed. */
import { sevenSegmentMarkup, logicIndicatorMarkup } from './displays.js';
export const escapeXML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

const line = d => `<path d="${d}"/>`;

/** Electrical artwork in the unrotated component coordinate system. */
export function symbolMarkup(type, params = {}, displayState = null) {
  switch (type) {
    case 'R': return line('M-40 0H-26L-21 -9L-12 9L-4 -9L4 9L12 -9L21 9L26 0H40');
    case 'C': return line('M-40 0H-7M-7 -20V20M7 -20V20M7 0H40');
    case 'L': return line('M-40 0H-25C-25 -23 -12 -23 -12 0C-12 -23 1 -23 1 0C1 -23 14 -23 14 0C14 -23 27 -23 27 0H40');
    case 'GND': return line('M0 -20V0M-19 0H19M-12 7H12M-5 14H5');
    case 'V': return `<circle cx="0" cy="0" r="22"/>${line('M0 -40V-22M0 22V40M-7 -9H7M0 -16V-2M-7 11H7')}`;
    case 'I': return `<circle cx="0" cy="0" r="22"/>${line('M0 -40V-22M0 22V40M0 -14V14M-6 6L0 14L6 6')}`;
    case 'D': return line('M-40 0H-15M-15 -17L14 0L-15 17ZM15 -18V18M15 0H40');
    case 'LED': return line('M-40 0H-15M-15 -17L14 0L-15 17ZM15 -18V18M15 0H40M2 -24L12 -34M6 -34H12V-28M16 -21L26 -31M20 -31H26V-25');
    case 'NPN': return `${line('M-40 0H-13M-13 -21V21M-13 -10L20 -30V-40M-13 10L20 30V40')}<path class="symbol-arrow" d="M18 29L4 26L11 17Z"/>`;
    case 'PNP': return `${line('M-40 0H-13M-13 -21V21M-13 -10L20 -30V-40M-13 10L20 30V40')}<path class="symbol-arrow" d="M-10 12L4 15L-3 24Z"/>`;
    case 'NMOS': return `${line('M-40 0H-18M-18 -22V22M-10 -22V-9M-10 -5V5M-10 9V22M-10 -16H20V-40M-10 16H20V40M-10 0H20V16')}<path class="symbol-arrow" d="M-7 0L2 -5V5Z"/>`;
    case 'PMOS': return `${line('M-40 0H-18M-18 -22V22M-10 -22V-9M-10 -5V5M-10 9V22M-10 -16H20V-40M-10 16H20V40M-10 0H20V16')}<path class="symbol-arrow" d="M13 0L4 -5V5Z"/>`;
    case 'SW': return `${line('M-40 0H-20M-20 0L15 -19M20 0H40M-20 40V25M20 40V25')}<circle cx="-20" cy="0" r="3"/><circle cx="20" cy="0" r="3"/><path class="control-link" d="M0 19V5" stroke-dasharray="3 3"/><text class="pin-sign" x="-20" y="21">+</text><text class="pin-sign" x="20" y="21">−</text>`;
    case 'OPAMP': return `${line('M-25 -32L29 0L-25 32ZM-40 -20H-25M-40 20H-25M29 0H40M0 -40V-17M0 40V17M-20 -20H-10M-15 -25V-15M-20 20H-10')}`;
    case 'DIN': return `<rect x="-26" y="-22" width="52" height="44" rx="4"/>${line('M26 0H40')}<text class="symbol-type" x="0" y="5">0 / 1</text>`;
    case 'DVS': return `<circle cx="0" cy="0" r="24"/>${line('M24 0H40')}${params.outputMode==='logic-voltage'?`${line('M0 -40V-24M0 24V40M-4 -15H4M0 -19V-11M-4 17H4')}`:''}<text class="symbol-type" x="0" y="5" style="font-size:12px">0 / 1</text><text class="pin-sign" x="30" y="-7" style="font-size:8px">Q</text>`;
    case 'DLED': return `${line('M-40 0H-21')}${logicIndicatorMarkup(displayState)}`;
    case 'CLOCK': return `<rect x="-26" y="-22" width="52" height="44" rx="4"/>${line('M26 0H40M-18 8H-10V-8H7V8H18')}`;
    case 'BUF': return `${line('M-25 -25L25 0L-25 25ZM-40 0H-25M25 0H40')}`;
    case 'NOT': return `${line('M-25 -25L21 0L-25 25ZM-40 0H-25M31 0H40')}<circle cx="26" cy="0" r="5"/>`;
    case 'AND':
    case 'NAND': return `${line('M-25 -28H-2C32 -28 32 28 -2 28H-25ZM-40 -20H-25M-40 20H-25')}${type==='NAND'?`${line('M23.5 0H26M34 0H40')}<circle cx="30" cy="0" r="4"/>`:line('M23.5 0H40')}`;
    case 'OR':
    case 'NOR':
    case 'XOR':
    case 'XNOR': {
      const xor=type==='XOR'||type==='XNOR',inverted=type==='NOR'||type==='XNOR';
      return `${line('M-28 -28Q0 -28 24 0Q0 28 -28 28Q-10 0 -28 -28ZM-40 -20H-23.6M-40 20H-23.6')}${xor?line('M-34 -28Q-16 0 -34 28'):''}${inverted?`${line('M24 0H26M34 0H40')}<circle cx="30" cy="0" r="4"/>`:line('M24 0H40')}`;
    }
    case 'TRI': return `<rect x="-26" y="-29" width="52" height="58" rx="2"/>${line('M-40 -20H-26M-40 20H-26M26 0H40')}<text class="symbol-type" x="0" y="-7">BUF</text><text class="symbol-type" x="0" y="9" style="font-size:9px">3-state</text><text class="pin-sign" x="-15" y="24" style="font-size:9px">EN</text>`;
    case 'DFF': return `<rect x="-26" y="-30" width="52" height="60" rx="2"/>${line('M-40 -20H-26M-40 20H-26M-26 14L-18 20L-26 26M26 0H40')}<text class="pin-sign" x="-15" y="-15">D</text><text class="pin-sign" x="15" y="5">Q</text>`;
    case 'ADCBUS': return `${line('M-26 -30H10L28 0L10 30H-26ZM-40 -20H-26M-40 20H-26M28 0H40')}<text class="symbol-type" x="-1" y="1" style="font-size:10px">ADC</text><text class="symbol-type" x="-1" y="15" style="font-size:9px">${escapeXML(params.width??4)} bit</text><text class="pin-sign" x="-17" y="-15" style="font-size:10px">+</text><text class="pin-sign" x="-17" y="25" style="font-size:10px">−</text>`;
    case 'DACBUS': return `${line('M-28 -30H12L28 -20V20L12 30H-28ZM-40 0H-28M28 -20H40M28 20H40')}<text class="symbol-type" x="-2" y="1" style="font-size:10px">DAC</text><text class="symbol-type" x="-2" y="15" style="font-size:9px">${escapeXML(params.width??4)} bit</text><text class="pin-sign" x="18" y="-15" style="font-size:10px">+</text><text class="pin-sign" x="18" y="25" style="font-size:10px">−</text>`;
    case 'ADC': return `${line('M-26 -30H10L28 0L10 30H-26ZM-40 -20H-26M-40 20H-26M28 0H40')}<text class="symbol-type" x="-1" y="5" style="font-size:11px">A→D</text><text class="pin-sign" x="-17" y="-15" style="font-size:10px">+</text><text class="pin-sign" x="-17" y="25" style="font-size:10px">−</text>`;
    case 'DAC': return `${line('M-28 -30H12L28 -20V20L12 30H-28ZM-40 0H-28M28 -20H40M28 20H40')}<text class="symbol-type" x="-2" y="5" style="font-size:11px">D→A</text><text class="pin-sign" x="18" y="-15" style="font-size:10px">+</text><text class="pin-sign" x="18" y="25" style="font-size:10px">−</text>`;
    case 'SEG7': return `${line('M-40 0H-27')}${sevenSegmentMarkup(displayState, params)}`;
    case 'HEX7': return `<rect x="-26" y="-30" width="52" height="60" rx="3"/>${line('M-40 -20H-26M-40 20H-26M26 0H40')}<text class="symbol-type" x="0" y="-8" style="font-size:10px">${params.mode==='bcd'?'BCD':'HEX'}</text><text class="symbol-type" x="0" y="7" style="font-size:11px">4 → 7</text><text class="pin-sign" x="-15" y="25" style="font-size:9px">dp</text>`;
    case 'BUSIN': return `<rect x="-26" y="-22" width="52" height="44" rx="4"/>${line('M26 0H40')}<text class="symbol-type" x="0" y="5">BUS</text>`;
    case 'PATTERN': return `<rect x="-26" y="-22" width="52" height="44" rx="4"/>${line('M26 0H40M-18 12H-9V4H1V12H10V4H18')}<text class="symbol-type" x="0" y="-5" style="font-size:10px">PAT</text>`;
    case 'SLICE': {
      const lsb=Number(params.lsb??0),count=Number(params.count??1),range=Number.isInteger(lsb)&&Number.isInteger(count)?count===1?String(lsb):`${lsb+count-1}:${lsb}`:'?';
      return `<rect x="-25" y="-22" width="50" height="44" rx="2"/>${line('M-40 0H-25M25 0H40')}<text class="symbol-type" x="0" y="-5" style="font-size:9px">SLICE</text><text class="symbol-type" x="0" y="11" style="font-size:10px">${escapeXML(range)}</text>`;
    }
    case 'JOIN': return `${line('M-27 -30H12L28 0L12 30H-27ZM-40 -20H-27M-40 20H-27M28 0H40')}<text class="pin-sign" x="-18" y="-15" style="font-size:9px">A</text><text class="pin-sign" x="-18" y="25" style="font-size:9px">B</text><text class="symbol-type" x="3" y="-4" style="font-size:10px">JOIN</text><text class="symbol-type" x="3" y="12" style="font-size:9px">B:A</text>`;
    case 'REGISTER': return `<rect x="-28" y="-30" width="56" height="60" rx="2"/>${line('M-40 -20H-28M-40 20H-28M-28 14L-20 20L-28 26M-20 40V30M20 40V30M28 0H40')}<text class="pin-sign" x="-18" y="-15" style="font-size:10px">D</text><text class="pin-sign" x="19" y="5" style="font-size:10px">Q</text><text class="symbol-type" x="1" y="3" style="font-size:10px">REG</text><text class="pin-sign" x="-14" y="26" style="font-size:8px">EN</text><text class="pin-sign" x="14" y="26" style="font-size:8px">RST</text>`;
    case 'COUNTER': return `<rect x="-28" y="-30" width="56" height="60" rx="2"/>${line('M-40 -20H-28M-28 -26L-20 -20L-28 -14M-40 20H-28M0 40V30M28 0H40')}<text class="symbol-type" x="0" y="3" style="font-size:11px">CTR</text><text class="pin-sign" x="-18" y="24" style="font-size:8px">EN</text><text class="pin-sign" x="3" y="26" style="font-size:8px">RST</text>`;
    case 'MUX': return `${line('M-27 -30L25 -20V20L-27 30ZM-40 -20H-27M-40 20H-27M25 0H40M0 40V24.8')}<text class="symbol-type" x="0" y="4" style="font-size:10px">MUX</text><text class="pin-sign" x="-18" y="-15" style="font-size:9px">0</text><text class="pin-sign" x="-18" y="24" style="font-size:9px">1</text><text class="pin-sign" x="0" y="21" style="font-size:8px">S</text>`;
    case 'DECODER': return `<rect x="-28" y="-30" width="56" height="60" rx="2"/>${line('M-40 0H-28M28 0H40M0 40V30')}<text class="symbol-type" x="0" y="-12" style="font-size:8px">1-HOT</text><text class="symbol-type" x="0" y="5" style="font-size:11px">DEC</text><text class="pin-sign" x="0" y="26" style="font-size:8px">EN</text>`;
    case 'LUT': return `<rect x="-28" y="-30" width="56" height="60" rx="2"/>${line('M-40 0H-28M28 0H40')}<text class="symbol-type" x="0" y="-9" style="font-size:11px">LUT</text><path d="M-14 0H14V18H-14ZM0 0V18M-14 6H14M-14 12H14" stroke-width="1"/>`;
    default: return `<rect x="-25" y="-20" width="50" height="40" rx="3"/>${line('M-40 0H-25M25 0H40')}<text class="symbol-type" x="0" y="5">${escapeXML(type)}</text>`;
  }
}

export function symbolThumbnail(type, size = 38) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${symbolMarkup(type)}</g></svg>`;
}

export const SYMBOL_CSS = `
  .symbol-art { fill:none; stroke:var(--text,#e7ece8); stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
  .symbol-arrow { fill:var(--text,#e7ece8); stroke-width:1; }
  .symbol-type,.pin-sign { fill:var(--text,#e7ece8); stroke:none; font-size:12px; text-anchor:middle; }
`;
