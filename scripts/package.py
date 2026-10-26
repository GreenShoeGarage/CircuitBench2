"""Package the exact built bytes, with checksums. Run only after release checks."""
from pathlib import Path
import hashlib,json,zipfile,re,sys
from datetime import datetime,timezone
from urllib.parse import quote
root=Path(__file__).resolve().parent.parent
dist=root/'dist'
manifest=json.loads((dist/'release-manifest.json').read_text())
def checked_path(base,name):
    if not isinstance(name,str) or not name or name.startswith('/') or '\\' in name or '..' in name.split('/') or ':' in name:
        raise SystemExit(f'Invalid release path: {name!r}')
    resolved=(base/name).resolve()
    try:resolved.relative_to(base.resolve())
    except ValueError:raise SystemExit(f'Path leaves release directory: {name}')
    return resolved
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
for name,expected in manifest['files'].items():
    actual=digest(checked_path(dist,name))
    if actual!=expected: raise SystemExit(f'Build changed after manifest: {name}')
declared=set(manifest['files'])|{'release-manifest.json'}
present={f.relative_to(dist).as_posix() for f in dist.rglob('*') if f.is_file()}
if present!=declared:raise SystemExit(f'Undeclared or missing distribution files: {sorted(present^declared)}')
version=manifest['version'];runtime=manifest['runtimeFiles'];runtime_base='assets/'+version
if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?',version):raise SystemExit('Invalid semantic version')
if manifest.get('runtimeBase')!=runtime_base or runtime!=sorted(set(runtime)):raise SystemExit('Invalid versioned runtime manifest')
worker='sw-'+version+'.js'
if manifest.get('serviceWorker')!=worker:raise SystemExit('Service worker filename does not match the release')
document_sources={'docs/installation.md':'docs/installation.md','docs/user-guide.md':'docs/user-guide.md','repair.html':'public/repair.html','repair/index.html':'public/repair.html'}
expected_documents={name:{'source':source,'renderer':'cb-release-docs-1','version':version} for name,source in document_sources.items()}
if manifest.get('generatedDocuments')!=expected_documents:raise SystemExit('Generated release-document mapping is incomplete or unsupported')
generated={'index.html','sw.js',worker,'recovery-manifest.json',*document_sources}
origins=manifest.get('fileSources',{})
if set(origins)!=set(manifest['files'])-generated:raise SystemExit('Copied-file source mapping is incomplete')
for name,source_name in origins.items():
    if digest(checked_path(root,source_name))!=manifest['files'][name]:
        raise SystemExit(f'Source input changed after build: {source_name} -> {name}')
expected_runtime_sources={name:origins[name] for name in runtime if name!='index.html'}
if manifest.get('runtimeSource')!=expected_runtime_sources:raise SystemExit('Runtime source mapping is incomplete')
inputs=manifest.get('buildInputs',{})
if not {'index.html','scripts/build.mjs','scripts/package.py','scripts/release-docs.mjs','package.json',*document_sources.values()}.issubset(inputs):raise SystemExit('Generated-file build input hashes are incomplete')
for name,expected in inputs.items():
    if digest(checked_path(root,name))!=expected:raise SystemExit(f'Build input changed after build: {name}')
if json.loads((root/'package.json').read_text())['version']!=version:raise SystemExit('Source package version differs from the release')
# Reproduce generated release prose independently of the JavaScript renderer.
for name,source in document_sources.items():
    rendered=checked_path(root,source).read_text().replace('{{RELEASE_VERSION}}',version).replace('{{RELEASE_QUERY_VERSION}}',quote(version,safe=''))
    if '{{RELEASE_' in rendered:raise SystemExit(f'Unresolved release document token: {name}')
    if rendered.encode('utf-8')!=checked_path(dist,name).read_bytes():raise SystemExit(f'Generated release document differs from its source/version: {name}')
# Reproduce the intentional shell transformations independently of the builder.
index=(root/'index.html').read_bytes().decode('utf-8')
tag=re.compile(r'(<span\b[^>]*\bid=["\']version["\'][^>]*>)[^<]*(</span>)',re.I)
if not tag.search(index) or 'href="./style.css"' not in index or 'src="./src/app.js"' not in index:raise SystemExit('Source shell entry/version contract changed')
index=tag.sub(lambda match:match[1]+'v'+version+match[2],index,count=1)
index=index.replace('href="./style.css"','href="./'+runtime_base+'/style.css"',1).replace('src="./src/app.js"','src="./'+runtime_base+'/src/app.js"',1)
build_tag=re.compile(r'(<meta\b[^>]*\bname=["\']circuitbench-build["\'][^>]*\bcontent=["\'])[^"\']*(["\'][^>]*>)',re.I)
if not build_tag.search(index):raise SystemExit('Source shell build identity is missing')
canonical_index=build_tag.sub(lambda match:match[1]+'development'+match[2],index,count=1)
index=build_tag.sub(lambda match:match[1]+manifest['buildHash']+match[2],index,count=1)
if index.encode('utf-8')!=(dist/'index.html').read_bytes():raise SystemExit('Generated shell differs from the source/versioned entry transformation')
if (dist/worker).read_bytes()!=(dist/'sw.js').read_bytes():raise SystemExit('Compatibility service worker differs from the versioned worker')
wasm_files={name for name in declared if name.endswith('/spice.wasm') or name=='spice.wasm'}
if wasm_files!={runtime_base+'/engine/spice.wasm'}:raise SystemExit('The deployable archive must contain exactly one versioned WASM binary')
if any(name.startswith('src/') for name in declared) or any(name in declared for name in ['style.css','engine/eecircuit-engine.js','engine/spice.wasm']):raise SystemExit('Unversioned executable assets must not remain in the deployable archive')
if manifest.get('buildHashMethod')!='runtime-shell-development-v1':raise SystemExit('Unsupported runtime build hash method')
canonical_hash=hashlib.sha256(canonical_index.encode()).hexdigest()
expected_build=hashlib.sha256('\n'.join(name+':'+(canonical_hash if name=='index.html' else manifest['files'][name]) for name in runtime).encode()).hexdigest()[:16]
if expected_build!=manifest['buildHash']:raise SystemExit('Runtime build hash differs from the declared file set')
if '--check-only' in sys.argv:
    print(f'Verified {len(declared)} distribution files, all copied/generated source inputs, and {len(runtime)} versioned runtime assets for {version}.')
    raise SystemExit(0)
out=root.parent/'release';out.mkdir(exist_ok=True)
deploy=out/f'CircuitBench-{version}-deploy.zip'
source=out/f'CircuitBench-{version}-source.zip'
deploy_temporary=out/('.'+deploy.name+'.building')
source_temporary=out/('.'+source.name+'.building')
with zipfile.ZipFile(deploy_temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=8) as z:
    for f in sorted(dist.rglob('*')):
        if f.is_file():z.write(f,f.relative_to(dist).as_posix())
deploy_temporary.replace(deploy)
with zipfile.ZipFile(source_temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=8) as z:
    for f in sorted(root.rglob('*')):
        parts=f.relative_to(root).parts
        if any(p in {'dist','node_modules','__pycache__','.git','.openai','research','.vendor','native','evidence-screenshots','qa-tmp'} for p in parts):continue
        if f.suffix in {'.png','.webp'} and 'evidence' in parts:continue
        if f.is_file():z.write(f,'CircuitBench/'+f.relative_to(root).as_posix())
source_temporary.replace(source)
archives={}
for file in [deploy,source]:
    with zipfile.ZipFile(file) as z:
        if z.testzip():raise SystemExit(f'ZIP validation failed: {file}')
    archives[file.name]={'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'zip_crc_verified':True}
    print(f'{file.name}: {file.stat().st_size:,} bytes')
# A stable version prefix also matches its prereleases. Record only the two
# archives created above, leaving older or unrelated release files untouched.
deliverables=[deploy,source]
files={f.name:{'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in deliverables}
lines=[f"{meta['sha256']}  {name}" for name,meta in files.items()]
(out/f'CircuitBench-{version}-SHA256SUMS.txt').write_text('\n'.join(lines)+'\n')
receipt={'application':'CircuitBench','version':version,'runtime_build':manifest['buildHash'],'verified_at':datetime.now(timezone.utc).isoformat(),'distribution_manifest_sha256':hashlib.sha256((dist/'release-manifest.json').read_bytes()).hexdigest(),'checks':{'all_declared_distribution_hashes_match':True,'undeclared_distribution_files':0,'source_and_built_runtime_match':True,'all_copied_source_inputs_match':True,'generated_shell_matches_source':True,'generated_release_documents_match_source':True,'loaded_shell_build_identity':True,'versioned_runtime_paths':True,'unique_wasm_asset':True,'declared_distribution_files':len(declared),'runtime_assets':len(manifest['runtimeFiles'])},'archives':archives,'release_files':files,'scope':'Content integrity and ZIP CRC verification. Browser and numerical verification are recorded separately in docs/VALIDATION.md and evidence/. No offline-browser claim is implied.'}
(out/f'CircuitBench-{version}-release-integrity.json').write_text(json.dumps(receipt,indent=2)+'\n')
print('Exact manifest hashes and ZIP CRCs verified.')
