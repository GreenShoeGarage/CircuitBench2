import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {RELEASE_DOCUMENTS,RELEASE_DOCUMENT_RENDERER,renderReleaseDocument,validateReleaseDocument} from '../scripts/release-docs.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFile(path.join(root,name),'utf8');
const source=`Upload CircuitBench-{{RELEASE_VERSION}}-deploy.zip.
Source: CircuitBench-{{RELEASE_VERSION}}-source.zip.
Keep assets/{{RELEASE_VERSION}}/engine/spice.wasm and sw-{{RELEASE_VERSION}}.js.
Open repair/?release={{RELEASE_QUERY_VERSION}} and confirm v{{RELEASE_VERSION}}.
`;

test('all installation references follow stable, prerelease and build-metadata versions',()=>{
  for(const version of ['2.0.0-rc.3','2.0.0','9.12.4-beta.17+hosting.2']){
    const text=renderReleaseDocument(source,version,'fixture.md');
    assert.ok(text.includes(`CircuitBench-${version}-deploy.zip`));
    assert.ok(text.includes(`CircuitBench-${version}-source.zip`));
    assert.ok(text.includes(`assets/${version}/engine/spice.wasm`));
    assert.ok(text.includes(`sw-${version}.js`));
    assert.ok(text.includes(`repair/?release=${encodeURIComponent(version)}`));
    assert.ok(text.includes(`confirm v${version}.`));
    assert.equal(validateReleaseDocument(text,version),true);
  }
});

test('known stale ZIP, engine, worker, recovery and displayed-version instructions fail the build check',()=>{
  const version='2.0.0-rc.3',current=renderReleaseDocument(source,version);
  for(const [correct,stale]of [
    [`CircuitBench-${version}-deploy.zip`,'CircuitBench-2.0.0-rc.1-deploy.zip'],
    [`CircuitBench-${version}-source.zip`,'CircuitBench-2.0.0-rc.1-source.zip'],
    [`assets/${version}/`,'assets/2.0.0-rc.1/'],
    [`sw-${version}.js`,'sw-1.0.0-rc.3.js'],
    [`repair/?release=${version}`,'repair/?release=2.0.0-rc.1'],
    [`confirm v${version}.`,'confirm v2.0.0-rc.1.']
  ])assert.throws(()=>validateReleaseDocument(current.replace(correct,stale),version,'installation.md'),/installation\.md: stale/);
});

test('explicit historical operational examples and old evidence identities remain unchanged',()=>{
  const historical=`<!-- release-history:start -->
The original instructions used CircuitBench-1.0.0-rc.3-deploy.zip,
assets/1.0.0-rc.3/engine/spice.wasm, sw-1.0.0-rc.3.js,
repair/?release=1.0.0-rc.3 and v1.0.0-rc.3.
<!-- release-history:end -->`;
  const oldEvidence='[Previous numerical evidence](history/VALIDATION-2.0.0-rc.1.md) is dated 2.0.0-rc.1.';
  const rendered=renderReleaseDocument(source+historical+'\n'+oldEvidence,'2.0.0-rc.3');
  assert.ok(rendered.endsWith(historical+'\n'+oldEvidence));
  assert.equal(validateReleaseDocument(rendered,'2.0.0-rc.3'),true);
});

test('history exemptions must have balanced explicit boundaries',()=>{
  for(const fragment of [
    '<!-- release-history:end -->',
    '<!-- release-history:start --> old',
    '<!-- release-history:start --><!-- release-history:start --><!-- release-history:end -->',
    '<!-- release-history:skip -->'
  ])assert.throws(()=>renderReleaseDocument(source+fragment,'2.0.0-rc.3'),/release-history/);
  assert.throws(()=>renderReleaseDocument(source+'<!-- release-history:start -->{{RELEASE_VERSION}}<!-- release-history:end -->','2.0.0-rc.3'),/not allowed in historical sections/);
});

test('unknown or unrendered placeholders and templates missing substitutions are rejected',()=>{
  assert.throws(()=>renderReleaseDocument(source+'{{RELEASE_VERISON}}','2.0.0-rc.3'),/unknown release-document placeholder/);
  assert.throws(()=>validateReleaseDocument('{{RELEASE_VERSION}}','2.0.0-rc.3'),/unresolved/);
  assert.throws(()=>renderReleaseDocument('No current release paths.','2.0.0-rc.3'),/no release placeholders/);
});

test('release labels cannot inject paths, HTML, query fields or unbounded input',()=>{
  for(const version of [null,123,'','2.0.0/../other','2.0.0<script>','2.0.0&clear=all','2.0.0\n','2.0.0-','2.0.0+','2.0.0-'+ 'x'.repeat(70)]){
    assert.throws(()=>renderReleaseDocument(source,version),/safe semantic version/);
  }
});

test('rendering is deterministic, leaves source unchanged and supports a later release without source edits',()=>{
  const original=source;
  const first=renderReleaseDocument(source,'2.0.0-rc.3');
  assert.equal(renderReleaseDocument(source,'2.0.0-rc.3'),first);
  const next=renderReleaseDocument(source,'3.0.0');
  assert.ok(!next.includes('2.0.0-rc.3'));
  assert.equal(source,original);
});

test('actual guide and recovery templates remain usable across release versions',async()=>{
  assert.equal(RELEASE_DOCUMENT_RENDERER,'cb-release-docs-1');
  for(const [output,input]of Object.entries(RELEASE_DOCUMENTS)){
    const text=await read(input);
    for(const version of ['2.0.0-rc.3','4.7.2-beta.6+future']){
      const rendered=renderReleaseDocument(text,version,input);
      assert.equal(validateReleaseDocument(rendered,version,output),true);
      assert.ok(rendered.includes(`assets/${version}/engine/`),output+' identifies the correct executing engine');
      assert.ok(rendered.includes('v'+version),output+' identifies the displayed release');
      assert.ok(!/\{\{RELEASE_/.test(rendered),output+' has no remaining release tokens');
    }
  }
});

test('recovery aliases use the same source and rendering preserves all recovery script bytes',async()=>{
  assert.equal(RELEASE_DOCUMENTS['repair.html'],'public/repair.html');
  assert.equal(RELEASE_DOCUMENTS['repair/index.html'],'public/repair.html');
  const original=await read('public/repair.html'),rendered=renderReleaseDocument(original,'2.0.0-rc.3','public/repair.html');
  const scripts=text=>[...text.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].map(match=>match[0]);
  assert.ok(scripts(original).length>0);
  assert.deepEqual(scripts(rendered),scripts(original));
  assert.ok(rendered.includes('CircuitBench-2.0.0-rc.3-deploy.zip'));
  assert.ok(rendered.includes('v2.0.0-rc.3 / recovery'));
  assert.ok(!rendered.includes('1.0.0-rc.3'));
});
