#!/usr/bin/env python3
"""Reproduce CircuitBench's trimmed EEcircuit 1.8.0 runtime from the pinned npm tarball.
Usage: python3 scripts/vendor-engine.py /path/to/eecircuit-engine-1.8.0.tgz
Downloads are a separate explicit build step. No numerical code is altered.
"""
import sys, pathlib, tarfile, hashlib, base64, re, json
root=pathlib.Path(__file__).resolve().parents[1]
archive=pathlib.Path(sys.argv[1]); digest=hashlib.sha512(archive.read_bytes()).digest()
expected='surzfC0ZZYRN9X3sRN4w5RqTUypoEArTyMQJTXnBLguH10G+QKLp2LveXHybxyTZPLZVPTfahVw6J8U2caf1vg=='
assert base64.b64encode(digest).decode()==expected, 'Pinned package integrity mismatch'
with tarfile.open(archive,'r:gz') as tar:
 source=tar.extractfile('package/dist/eecircuit-engine.mjs').read().decode()
 license_text=tar.extractfile('package/LICENSE').read().decode()
blobs=re.findall(r'data:application/wasm;base64,([A-Za-z0-9+/=]+)',source)
assert len(blobs)==2 and blobs[0]==blobs[1]
wasm=base64.b64decode(blobs[0])
source=re.sub(r'data:application/wasm;base64,[A-Za-z0-9+/=]+','./spice.wasm',source)
# Exclude every upstream PDK/model-card preload. CircuitBench declares curated
# original educational models in each generated deck; no silent model inclusion.
start=source.index('//#region src/models/gf180/gf180.ts')
end=source.index('o = class t {',start)
source=source[:start]+'//#region CircuitBench: upstream Simulation without PDK preload\nvar '+source[end:]
start=source.index(', r.FS?.writeFile("/modelcard.FreePDK45"')
end=source.index(', r.setHandleThings(',start)
source=source[:start]+source[end:]
# Parse binary positions as bytes rather than UTF-8 string character indexes.
# Unicode project titles otherwise shift the DataView into the binary payload.
start=source.index('function t(e) {',source.index('//#region src/readOutput.ts'))
end=source.index('function n(e) {',start)
source=source[:start]+(root/'scripts'/'vendor-raw-parser.js').read_text()+'\n'+source[end:]
old='export { o as Simulation };'
assert source.count(old)==1
source=source.replace(old,'export { o as Simulation, t as readRawOutput };')
# The published glue omits incoming wasmBinary from its internal buffer even
# though the TypeScript wrapper exposes it. Wire that existing byte path up.
old='var f = console.log.bind(console), p = console.error.bind(console), ee, m = !1, h;'
assert source.count(old)==1
source=source.replace(old,'var f = console.log.bind(console), p = console.error.bind(console), ee = t.wasmBinary, m = !1, h;')
old='async function ue(e) {\n\t\tif (!ee) try {'
assert source.count(old)==1
source=source.replace(old,'async function ue(e) {\n\t\tif (ee) return ee;\n\t\tif (!ee) try {')
# Accept an already fetched/validated binary instead of a second opaque fetch.
old='\tstartPromise = null;'
assert source.count(old)==1
source=source.replace(old,old+'\n\twasmBinary = null;\n\twasmUrl = null;\n\tconstructor(options = {}) {\n\t\tthis.wasmBinary = options.wasmBinary ?? null;\n\t\tthis.wasmUrl = options.wasmUrl ?? null;\n\t}')
old='\t\tif (typeof process < "u" && process.versions?.node) {'
assert source.count(old)==1
source=source.replace(old,'\t\tif (this.wasmBinary) n.wasmBinary = this.wasmBinary;\n\t\tif (this.wasmUrl) n.locateFile = (name) => name === "spice.wasm" ? this.wasmUrl : name;\n\t\tif (!n.wasmBinary && typeof process < "u" && process.versions?.node) {')
# Propagate initialization failures to start() rather than an unobserved Promise.
start=source.index('\tstart = () => this.initialized ? Promise.resolve()')
end=source.index('\n\trunSim = ',start)
source=source[:start]+'''\tstart = () => {
\t\tif (this.initialized) return Promise.resolve();
\t\tif (!this.startPromise) this.startPromise = new Promise((resolve, reject) => {
\t\t\tthis.initPromiseResolve = resolve;
\t\t\tPromise.resolve().then(() => this.startInternal()).catch(error => {
\t\t\t\tthis.initPromiseResolve = null;
\t\t\t\treject(error);
\t\t\t});
\t\t});
\t\treturn this.startPromise;
\t};'''+source[end:]
# Propagate raw-output parsing failures instead of leaving a run pending.
old='this.log_debug(e);\n\t\t\t\t\t}'
assert source.count(old)==1
source=source.replace(old,'this.runPromiseReject?.(e);\n\t\t\t\t\t}')
source=source.replace('runPromiseResolve = null;', 'runPromiseResolve = null;\n\trunPromiseReject = null;',1)
old='let e = new Promise((e) => {\n\t\t\tthis.runPromiseResolve = e;\n\t\t});'
assert source.count(old)==1
source=source.replace(old,'let e = new Promise((e, reject) => {\n\t\t\tthis.runPromiseResolve = e;\n\t\t\tthis.runPromiseReject = reject;\n\t\t});')
# Preserve simulation warnings, but cap pathological diagnostic accumulation.
source=source.replace('this.error.push(e)', '(this.error.length < 1000 && this.error.push(e))')
header='/* CircuitBench vendor adaptation of EEcircuit-engine 1.8.0 (MIT).\n * Embedded WASM extracted unchanged; upstream PDK preloads excluded.\n * Byte-safe parsing, injected WASM, startup rejection and bounded diagnostics added.\n * See docs/engine-evaluation.md.\n */\n'
out=root/'public'/'engine'; out.mkdir(parents=True,exist_ok=True)
(out/'eecircuit-engine.js').write_text(header+source)
(out/'eecircuit-engine.mjs').unlink(missing_ok=True)
(out/'spice.wasm').write_bytes(wasm)
(out/'LICENSE-EEcircuit.txt').write_text(license_text)
manifest={'package':'eecircuit-engine','version':'1.8.0','packageIntegrity':'sha512-'+expected,'tarball':'https://registry.npmjs.org/eecircuit-engine/-/eecircuit-engine-1.8.0.tgz','adaptation':'CircuitBench vendor patch 3: byte-safe raw parsing, injected WASM and startup rejection','files':{p.name:{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in [out/'eecircuit-engine.js',out/'spice.wasm',out/'LICENSE-EEcircuit.txt']}}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
