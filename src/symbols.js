/* CircuitBench schematic symbols. Original artwork, MIT licensed. */
export const escapeXML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

const line = d => `<path d="${d}"/>`;

/** Electrical artwork in the unrotated component coordinate system. */
export function symbolMarkup(type) {
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
