/* CircuitBench patch for EEcircuit-engine 1.8.0's readRawOutput.
 * The pinned bundle names this function t and its header parser r.
 * Binary locations are byte offsets; UTF-8 string indexes are not byte offsets.
 * No numerical computation or raw sample value is changed.
 */
function t(rawData) {
  // Copy out of a possibly resizable WebAssembly memory buffer.
  const bytes = new Uint8Array(rawData);
  const marker = [66, 105, 110, 97, 114, 121, 58]; // ASCII "Binary:"
  let headerEnd = -1, payloadOffset = -1;
  for (let at = 0; at <= bytes.length - marker.length; at++) {
    if (at > 0 && bytes[at - 1] !== 10) continue;
    if (!marker.every((value, index) => bytes[at + index] === value)) continue;
    const end = at + marker.length;
    if (bytes[end] === 10) {
      headerEnd = at; payloadOffset = end + 1; break;
    }
    if (bytes[end] === 13 && bytes[end + 1] === 10) {
      headerEnd = at; payloadOffset = end + 2; break;
    }
  }
  if (headerEnd < 0) throw new Error('ngspice raw output is missing its binary data header.');
  const header = new TextDecoder('utf-8').decode(bytes.subarray(0, headerEnd)).replace(/\r\n/g, '\n') + '\n';
  const param = r(header);
  if (!Number.isSafeInteger(param.varNum) || param.varNum < 1 ||
      !Number.isSafeInteger(param.pointNum) || param.pointNum < 0) {
    throw new Error('ngspice raw output declares invalid variable or point counts.');
  }
  if (param.pointNum > 250000 || param.varNum > 256 || param.pointNum * param.varNum > 2000000) {
    throw new Error('Simulation result exceeds the 2 million sample safety limit. Reduce points, time range, or saved vectors.');
  }
  const complex = param.dataType === 'complex';
  const expectedBytes = param.varNum * param.pointNum * (complex ? 16 : 8);
  const actualBytes = bytes.length - payloadOffset;
  if (actualBytes !== expectedBytes) {
    throw new Error(`ngspice raw output has an incomplete or inconsistent binary payload: expected ${expectedBytes} bytes, received ${actualBytes}.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + payloadOffset, expectedBytes);
  const data = Array.from({ length: param.varNum }, () => new Array(param.pointNum));
  let offset = 0;
  for (let point = 0; point < param.pointNum; point++) {
    for (let variable = 0; variable < param.varNum; variable++) {
      const real = view.getFloat64(offset, true); offset += 8;
      if (complex) {
        const img = view.getFloat64(offset, true); offset += 8;
        data[variable][point] = { real, img };
      } else {
        data[variable][point] = real;
      }
    }
  }
  return { param, header, data };
}
