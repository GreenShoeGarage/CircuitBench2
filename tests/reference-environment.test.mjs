import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {REFERENCE_PACKAGES,REFERENCE_SNAPSHOT,NATIVE_SHA256,referencePaths,referenceEnvironment,verifyReferenceFile,relocateReferenceInit,ensureEmptyReferencePrefix,parseReferenceArguments,checkReferenceEnvironment} from '../scripts/reference-environment.mjs';

test('setup requires an explicit action and private destination, with no implicit package download',()=>{
  for(const args of [[],['--prefix','/tmp/ref'],['--setup'],['--setup','--check','--prefix','/tmp/ref'],['--setup','--prefix'],['--setup','--prefix','/tmp/ref','--unknown'],['--check','--prefix','/tmp/ref','--packages','/tmp/packages']]){
    assert.throws(()=>parseReferenceArguments(args));
  }
  assert.deepEqual(parseReferenceArguments(['--help']),{help:true});
  assert.deepEqual(parseReferenceArguments(['--setup','--prefix','/tmp/ref','--packages','/tmp/pinned','--output','/tmp/result.json']),{action:'setup',prefix:'/tmp/ref',packagesDirectory:'/tmp/pinned',output:'/tmp/result.json'});
});

test('pin set identifies immutable Ubuntu package inputs and the existing reference executable',()=>{
  assert.equal(NATIVE_SHA256,'820658317b0b54035208da41936fd6871ce924036e5ea4113a4168b821b7fc45');
  assert.equal(REFERENCE_PACKAGES.length,2);
  for(const pin of REFERENCE_PACKAGES){
    const url=new URL(pin.path,REFERENCE_SNAPSHOT);
    assert.equal(url.protocol,'https:');assert.equal(url.hostname,'snapshot.ubuntu.com');
    assert.ok(url.pathname.startsWith('/ubuntu/20260828T000000Z/pool/'));
    assert.match(pin.sha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(pin.bytes)&&pin.bytes>0);
  }
});

test('wrong or truncated packages fail verification before extraction',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cb-ref-hash-test-'));
  try{
    const name=path.join(dir,'package.deb'),bytes=Buffer.from('pinned fixture bytes'),expected=createHash('sha256').update(bytes).digest('hex');
    await fs.writeFile(name,bytes);
    const record=await verifyReferenceFile(name,expected,bytes.length);assert.equal(record.sha256,expected);
    await assert.rejects(()=>verifyReferenceFile(name,expected,bytes.length+1),/byte length/);
    const changed=Buffer.from(bytes);changed[0]^=1;await fs.writeFile(name,changed);
    await assert.rejects(()=>verifyReferenceFile(name,expected,bytes.length),/SHA-256 mismatch/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('setup refuses occupied and symlink destinations without changing their contents',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cb-ref-prefix-test-'));
  try{
    const occupied=path.join(dir,'occupied');await fs.mkdir(occupied);await fs.writeFile(path.join(occupied,'keep.txt'),'keep');
    await assert.rejects(()=>ensureEmptyReferencePrefix(occupied),/not empty/);
    assert.equal(await fs.readFile(path.join(occupied,'keep.txt'),'utf8'),'keep');
    const empty=path.join(dir,'empty');await fs.mkdir(empty);const alias=path.join(dir,'alias');await fs.symlink(empty,alias);
    await assert.rejects(()=>ensureEmptyReferencePrefix(alias),/real directory/);
    assert.deepEqual(await fs.readdir(empty),[]);
    const fresh=path.join(dir,'fresh');assert.equal((await ensureEmptyReferencePrefix(fresh)).prefix,fresh);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('paths remain in the explicit prefix and runtime overrides do not alter the caller environment',()=>{
  assert.throws(()=>referencePaths('/'),/filesystem root/);
  assert.throws(()=>referencePaths('relative'),/absolute/);
  const base={PATH:'/usr/bin',EXAMPLE:'retained',LD_LIBRARY_PATH:'/old',SPICE_LIB_DIR:'/old-config'};
  const env=referenceEnvironment('/tmp/native-reference',base);
  assert.equal(env.PATH,base.PATH);assert.equal(env.EXAMPLE,'retained');
  assert.equal(env.LD_LIBRARY_PATH,'/tmp/native-reference/tools/usr/lib/x86_64-linux-gnu');
  assert.equal(env.SPICE_LIB_DIR,'/tmp/native-reference/runtime/ngspice');
  assert.equal(base.LD_LIBRARY_PATH,'/old');assert.equal(base.SPICE_LIB_DIR,'/old-config');
});

test('unreviewed initialization text is rejected instead of silently relocating a changed configuration',()=>{
  assert.throws(()=>relocateReferenceInit('codemodel /usr/lib/x86_64-linux-gnu/ngspice/changed.cm\n','/tmp/ref'),/changed; review and repin explicitly/);
});

test('checking a missing reference produces an unavailable record without installing or creating files',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cb-ref-unavailable-test-'));
  try{
    const prefix=path.join(dir,'not-created'),result=await checkReferenceEnvironment(prefix);
    assert.equal(result.status,'unavailable');assert.equal(result.checks.length,0);
    assert.ok(result.error.message);assert.equal(result.format,'CircuitBenchNativeReferenceEnvironment');
    await assert.rejects(()=>fs.stat(prefix),{code:'ENOENT'});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
