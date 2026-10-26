#!/usr/bin/env node
/** Recover the exact native ngspice42 reference without changing system packages. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const REFERENCE_RECIPE='cb-native-ngspice42-ubuntu-noble-amd64-1';
export const NATIVE_SHA256='820658317b0b54035208da41936fd6871ce924036e5ea4113a4168b821b7fc45';
export const REFERENCE_SNAPSHOT='https://snapshot.ubuntu.com/ubuntu/20260828T000000Z/';
export const REFERENCE_PACKAGES=Object.freeze([
  Object.freeze({name:'ngspice',version:'42+ds-3build1',file:'ngspice_42+ds-3build1_amd64.deb',path:'pool/universe/n/ngspice/ngspice_42+ds-3build1_amd64.deb',bytes:4411398,sha256:'466c4c06418107ceaa9c9457065b3bb71a9d9dc5ec6fef186d7de9d5208ce8db'}),
  Object.freeze({name:'libxft2',version:'2.3.6-1build1',file:'libxft2_2.3.6-1build1_amd64.deb',path:'pool/main/x/xft/libxft2_2.3.6-1build1_amd64.deb',bytes:45280,sha256:'b4f4f3255c0b8773b260c61cbe20ee7c63799cfc0e4e389fa58375dd480b093a'})
]);
const INIT_SHA256='6ce47fdb8ed6d10e5d3235f9444e58b10cecb8551d8ad249de1b887775a1cd08';
const XFT_SHA256='368eee2879589cb6716f03ba23dee35b97faa0a4102c715776c7224bef8e3164';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=(command,args,options={})=>execFileSync(command,args,{encoding:'utf8',maxBuffer:2*1024*1024,timeout:30000,...options});

export function referencePaths(prefix){
  if(typeof prefix!=='string'||!path.isAbsolute(prefix))throw new Error('Reference prefix must be an absolute directory.');
  const base=path.resolve(prefix);
  if(base===path.parse(base).root)throw new Error('Reference prefix must be a dedicated directory, not the filesystem root.');
  return {prefix:base,packages:path.join(base,'packages'),tools:path.join(base,'tools'),
    executable:path.join(base,'tools/usr/bin/ngspice'),libraryPath:path.join(base,'tools/usr/lib/x86_64-linux-gnu'),
    originalInit:path.join(base,'tools/usr/share/ngspice/scripts/spinit'),
    runtimeDirectory:path.join(base,'runtime/ngspice'),init:path.join(base,'runtime/ngspice/scripts/spinit'),
    receipt:path.join(base,'reference-environment.json')};
}

export function referenceEnvironment(prefix,base=process.env){
  const paths=referencePaths(prefix);
  return {...base,LD_LIBRARY_PATH:paths.libraryPath,SPICE_LIB_DIR:paths.runtimeDirectory};
}

export async function verifyReferenceFile(filename,expectedHash,expectedBytes=null){
  const bytes=await fs.readFile(filename),actualHash=sha(bytes);
  if(expectedBytes!==null&&bytes.length!==expectedBytes)throw new Error('Unexpected byte length for '+filename+': '+bytes.length+'; expected '+expectedBytes+'.');
  if(actualHash!==expectedHash)throw new Error('SHA-256 mismatch for '+filename+'. The reference was not accepted.');
  return {path:path.resolve(filename),bytes:bytes.length,sha256:actualHash};
}

export function relocateReferenceInit(source,prefix){
  if(sha(Buffer.from(source))!==INIT_SHA256)throw new Error('Packaged ngspice initialization file changed; review and repin explicitly.');
  const paths=referencePaths(prefix),old='/usr/lib/x86_64-linux-gnu/ngspice/',replacement=path.join(paths.libraryPath,'ngspice')+'/';
  // Paths are part of the ngspice command language, so keep this unquoted recipe simple.
  if(!/^[A-Za-z0-9_./-]+$/.test(replacement))throw new Error('Reference prefix must use letters, digits, slash, period, underscore or hyphen for the relocated initialization paths.');
  return source.replaceAll(old,replacement);
}

export async function ensureEmptyReferencePrefix(prefix){
  const paths=referencePaths(prefix);
  try{
    const info=await fs.lstat(paths.prefix);
    if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Reference prefix must be a real directory.');
    if((await fs.readdir(paths.prefix)).length)throw new Error('Reference prefix is not empty; use --check for an existing setup or choose a new directory.');
  }catch(error){if(error.code!=='ENOENT')throw error;await fs.mkdir(paths.prefix,{recursive:true});}
  return paths;
}

function platformRecord(){
  return {platform:process.platform,arch:process.arch,kernel:os.release(),node:process.version,
    glibcRuntime:process.report?.getReport?.().header?.glibcVersionRuntime??null};
}

async function libraryRecords(executable,environment){
  const output=run('/usr/bin/ldd',[executable],{env:environment});
  const missing=[...output.matchAll(/^\s*(\S+)\s+=>\s+not found\s*$/gm)].map(match=>match[1]);
  if(missing.length)throw new Error('Native reference dependencies are unavailable: '+missing.join(', ')+'. No system packages were installed.');
  const paths=new Set();
  for(const line of output.split('\n')){
    const match=line.match(/=>\s+(\/\S+)\s+\(/)||line.match(/^\s*(\/\S+)\s+\(/);
    if(match)paths.add(match[1]);
  }
  return Promise.all([...paths].sort().map(async filename=>({path:filename,realPath:await fs.realpath(filename),sha256:sha(await fs.readFile(filename))})));
}

export async function checkReferenceEnvironment(prefix){
  const record={format:'CircuitBenchNativeReferenceEnvironment',formatVersion:1,recipe:REFERENCE_RECIPE,recordedAt:new Date().toISOString(),status:'unavailable',
    platform:platformRecord(),scope:'Exact pinned native ngspice42 executable, package inputs and observed runtime-library identity. This does not claim a source rebuild, a hermetic toolchain, or numerical comparison with CircuitBench.',
    distribution:{name:'Ubuntu',release:'24.04 (noble)',architecture:'amd64',snapshot:REFERENCE_SNAPSHOT},packages:[],checks:[]};
  try{
    if(process.platform!=='linux'||process.arch!=='x64')throw new Error('This recipe requires Linux x86-64 with a compatible glibc runtime; no replacement reference is selected automatically.');
    const paths=referencePaths(prefix),environment=referenceEnvironment(prefix);
    record.prefix=paths.prefix;
    record.environment={LD_LIBRARY_PATH:environment.LD_LIBRARY_PATH,SPICE_LIB_DIR:environment.SPICE_LIB_DIR};
    for(const pin of REFERENCE_PACKAGES)record.packages.push({...pin,url:new URL(pin.path,REFERENCE_SNAPSHOT).href,...await verifyReferenceFile(path.join(paths.packages,pin.file),pin.sha256,pin.bytes)});
    record.executable=await verifyReferenceFile(paths.executable,NATIVE_SHA256);
    record.extractedRuntimeLibrary=await verifyReferenceFile(path.join(paths.libraryPath,'libXft.so.2.3.6'),XFT_SHA256);
    const original=await fs.readFile(paths.originalInit,'utf8'),expected=relocateReferenceInit(original,prefix),actual=await fs.readFile(paths.init,'utf8');
    if(actual!==expected)throw new Error('Relocated ngspice initialization differs from the documented path-only transformation.');
    record.initialization={originalPath:paths.originalInit,originalSha256:INIT_SHA256,path:paths.init,sha256:sha(Buffer.from(actual)),transformation:'Replace /usr/lib/x86_64-linux-gnu/ngspice/ with the extracted private code-model directory; all other bytes remain unchanged.',userConfiguration:'Pass -n to native comparisons to exclude local/user .spiceinit; the recorded global initialization still applies.'};
    record.dynamicLibraries=await libraryRecords(paths.executable,environment);
    const versionText=run(paths.executable,['--version'],{env:environment});
    if(!/ngspice-42\b/.test(versionText))throw new Error('The native executable did not identify as ngspice42.');
    record.executable.versionText=versionText.trim();
    record.binaryBuild={kind:'Ubuntu distribution binary',compiler:'Not inferred: the stripped executable does not expose a compiler .comment section. No compilation was performed by this recipe.'};
    record.checks.push({name:'package hashes and byte lengths',passed:true},{name:'historically pinned executable hash',passed:true},{name:'private dependency and initialization integrity',passed:true},{name:'dynamic libraries resolved and fingerprinted',passed:true},{name:'native executable starts and identifies as ngspice42',passed:true});
    record.status='ready';
  }catch(error){record.error={code:error.code??null,message:error.message};record.status=error.code==='ENOENT'||/unavailable|requires Linux/.test(error.message)?'unavailable':'failed';}
  return record;
}

export async function setupReferenceEnvironment(prefix,{packagesDirectory=null}={}){
  if(process.platform!=='linux'||process.arch!=='x64')throw new Error('This recipe requires Linux x86-64.');
  const paths=await ensureEmptyReferencePrefix(prefix);
  // Validate path syntax before downloads or extraction.
  if(!/^[A-Za-z0-9_./-]+$/.test(paths.prefix))throw new Error('Choose a reference prefix containing only letters, digits, slash, period, underscore or hyphen.');
  await fs.mkdir(paths.packages,{recursive:true});
  await fs.mkdir(paths.tools,{recursive:true});
  for(const pin of REFERENCE_PACKAGES){
    const target=path.join(paths.packages,pin.file);
    if(packagesDirectory)await fs.copyFile(path.join(path.resolve(packagesDirectory),pin.file),target);
    else run('/usr/bin/curl',['--fail','--location','--proto','=https','--connect-timeout','15','--max-time','90','--silent','--show-error','--output',target,new URL(pin.path,REFERENCE_SNAPSHOT).href],{timeout:95000});
    await verifyReferenceFile(target,pin.sha256,pin.bytes);
    run('/usr/bin/dpkg-deb',['-x',target,paths.tools]);
  }
  await verifyReferenceFile(paths.executable,NATIVE_SHA256);
  const original=await fs.readFile(paths.originalInit,'utf8');
  await fs.mkdir(path.dirname(paths.init),{recursive:true});
  await fs.writeFile(paths.init,relocateReferenceInit(original,prefix));
  const record=await checkReferenceEnvironment(prefix);
  await fs.writeFile(paths.receipt,JSON.stringify(record,null,2)+'\n');
  return record;
}

export function parseReferenceArguments(args){
  const result={action:null,prefix:null,packagesDirectory:null,output:null};
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--help')return{help:true};
    if(arg==='--setup'||arg==='--check'){
      if(result.action)throw new Error('Choose exactly one of --setup or --check.');
      result.action=arg.slice(2);
    }else if(['--prefix','--packages','--output'].includes(arg)){
      const value=args[++i];
      if(!value||value.startsWith('--'))throw new Error(arg+' requires a path.');
      const key=arg==='--packages'?'packagesDirectory':arg.slice(2);
      if(result[key]!==null)throw new Error('Repeated option: '+arg);
      result[key]=path.resolve(value);
    }else throw new Error('Unknown reference-environment option: '+arg);
  }
  if(!result.action||!result.prefix)throw new Error('Specify --setup or --check and a dedicated --prefix directory.');
  if(result.action==='check'&&result.packagesDirectory)throw new Error('--packages applies only to --setup.');
  return result;
}

async function main(){
  const args=parseReferenceArguments(process.argv.slice(2));
  if(args.help){console.log('Usage: node scripts/reference-environment.mjs --setup|--check --prefix /absolute/private/directory [--packages /directory/with/pinned/debs] [--output /receipt.json]\nSetup downloads exact pinned Ubuntu packages or copies them from --packages, verifies their hashes, and extracts them into an empty prefix. It never installs system packages. Check verifies an existing setup without changing it. See docs/reference-environment.md.');return;}
  const result=args.action==='setup'?await setupReferenceEnvironment(args.prefix,{packagesDirectory:args.packagesDirectory}):await checkReferenceEnvironment(args.prefix);
  if(args.output){await fs.mkdir(path.dirname(args.output),{recursive:true});await fs.writeFile(args.output,JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify(result,null,2));
  if(result.status!=='ready')process.exitCode=1;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  main().catch(error=>{console.error(JSON.stringify({format:'CircuitBenchNativeReferenceEnvironment',formatVersion:1,recipe:REFERENCE_RECIPE,status:'failed',error:{code:error.code??null,message:error.message}}));process.exitCode=1;});
}
