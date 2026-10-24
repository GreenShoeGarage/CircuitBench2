import test from 'node:test';
import assert from 'node:assert/strict';
import { readRawOutput } from '../public/engine/eecircuit-engine.js';

function raw({ title = 'ASCII title', complex = false, crlf = false,
  variables = ['v(a)', 'v(b)'], points = [[5, 2]], declaredPoints = points.length } = {}) {
  const lines = [`Title: ${title}`, 'Date: regression fixture', 'Plotname: Operating Point',
    `Flags: ${complex ? 'complex' : 'real'}`, `No. Variables: ${variables.length}`,
    `No. Points: ${declaredPoints}`, 'Variables:',
    ...variables.map((name, index) => `\t${index}\t${name}\tvoltage${index ? '' : '\tgrid=3'}`), 'Binary:', ''];
  const header = Buffer.from(lines.join(crlf ? '\r\n' : '\n'), 'utf8');
  const numbers = points.flat(2), payload = Buffer.alloc(numbers.length * 8);
  numbers.forEach((value, index) => payload.writeDoubleLE(value, index * 8));
  return Buffer.concat([header, payload]);
}

test('UTF-8 project titles do not shift real raw-data byte offsets', () => {
  const title = 'CircuitBench - QA · café Ω 电路 🔧';
  const result = readRawOutput(raw({ title }));
  assert.ok(result.header.includes(title));
  assert.deepEqual(result.data, [[5], [2]]);
  assert.equal(result.param.varNum, 2);
  assert.equal(result.param.pointNum, 1);
});

test('Binary marker text within a title is not mistaken for the payload line', () => {
  const result = readRawOutput(raw({ title: 'Title contains Binary: and Unicode ·' }));
  assert.deepEqual(result.data, [[5], [2]]);
});

test('Unicode CRLF headers preserve complex point-major sample order', () => {
  const result = readRawOutput(raw({ title: 'Complex Ω response', complex: true, crlf: true,
    points: [[[0.5, -0.5], [1, 0]], [[0.2, -0.4], [0.5, 0.25]]] }));
  assert.equal(result.param.dataType, 'complex');
  assert.deepEqual(result.data, [
    [{ real: 0.5, img: -0.5 }, { real: 0.2, img: -0.4 }],
    [{ real: 1, img: 0 }, { real: 0.5, img: 0.25 }],
  ]);
});

test('a raw-data subarray with a nonzero backing offset parses correctly', () => {
  const data = raw({ title: 'Subarray · test' });
  const parent = Buffer.concat([Buffer.alloc(17, 0xff), data, Buffer.alloc(9)]);
  assert.deepEqual(readRawOutput(parent.subarray(17, 17 + data.length)).data, [[5], [2]]);
});

test('truncated, trailing and misdeclared binary payloads fail explicitly', () => {
  const valid = raw();
  for (const damaged of [valid.subarray(0, valid.length - 1),
    Buffer.concat([valid, Buffer.from([0])]), raw({ declaredPoints: 2 })]) {
    assert.throws(() => readRawOutput(damaged), /incomplete or inconsistent binary payload/);
  }
});

test('missing binary markers and invalid declared counts are rejected', () => {
  assert.throws(() => readRawOutput(Buffer.from('Title: no binary data\n')), /missing its binary data header/);
  assert.throws(() => readRawOutput(raw({ variables: [], points: [[]] })), /invalid variable or point counts/);
  const excessive = raw({ points: [], declaredPoints: 250001 });
  assert.throws(() => readRawOutput(excessive), /sample safety limit/);
});
