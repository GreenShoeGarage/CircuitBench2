/* CircuitBench 1.0.0-rc.1; immutable cache for this exact runtime build. */
const VERSION="1.0.0-rc.1", BUILD="804d39c2687b9a27";
const PREFIX='circuitbench:'+self.registration.scope+'|';
const CACHE=PREFIX+VERSION+':'+BUILD;
const FILES=["./","./engine/eecircuit-engine.mjs","./engine/spice.wasm","./icon.svg","./index.html","./manifest.webmanifest","./src/app.js","./src/editor.js","./src/engine-worker.js","./src/engine.js","./src/examples.js","./src/library.js","./src/model.js","./src/netlist.js","./src/plots.js","./src/reports.js","./src/storage.js","./src/symbols.js","./style.css"];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES);})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(event.request,{ignoreSearch:true});if(cached)return cached;return fetch(event.request);})());});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();if(event.data?.type==='CACHE_STATUS'){event.waitUntil((async()=>{const cache=await caches.open(CACHE);const entries=await Promise.all(FILES.map(file=>cache.match(file)));event.ports?.[0]?.postMessage({ready:entries.every(Boolean),version:VERSION,build:BUILD});})());}});
