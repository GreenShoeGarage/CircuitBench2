# Installation and self-hosting

## What you need

CircuitBench is static HTML, CSS, browser JavaScript and WebAssembly. A modern
browser must support ES modules, module Web Workers, WebAssembly and IndexedDB.
There is no database server, application login, native runner or container to
install. Python is only one convenient way to serve the files locally.

The verified-browser coverage belongs to the final release validation record.
A standards-based implementation is not a claim of testing every desktop,
tablet, phone or browser version.

## Prebuilt ZIP: no build step

1. Unzip the deployable ZIP.
2. Confirm `index.html`, `style.css`, `src/`, `engine/`, `icon.svg`, the web
   manifest and `sw.js` are present together.
3. Run a static server from that folder:

   ```sh
   python3 -m http.server 8080
   ```

4. Open `http://localhost:8080/`.

If Python is unavailable, any ordinary static web server with the correct MIME
types is suitable. `file://` is unsupported. A local web server continues
serving the downloaded files when the internet connection is disconnected.

## Build the source package

From the source root:

```sh
node scripts/build.mjs
python3 -m http.server 8080 --directory dist
```

`dist/` is the deployable directory. There is no package download or remote
asset step in the normal build. Keep the pinned `public/engine/` files intact.
The vendor extraction recipe is documented in `engine-evaluation.md` for engine
maintenance; users need not run it to deploy a release.

## Static server deployment

Upload the complete deployable directory. Do not upload only `index.html`.
Preserve subdirectories and filename case.

| File | Recommended content type |
|---|---|
| `.html` | `text/html; charset=utf-8` |
| `.js`, `.mjs` | `text/javascript` or `application/javascript` |
| `.css` | `text/css` |
| `.wasm` | `application/wasm` |
| `.svg` | `image/svg+xml` |
| `.json` | `application/json` |
| `.webmanifest` | `application/manifest+json` |

No special rewrite to an application server is required. Directory indexes
should resolve the local `index.html`. Do not rewrite missing JS/WASM assets to
HTML; that produces module-loading or WebAssembly errors.

Use HTTPS for a public or LAN-hosted installation that needs service-worker
offline caching. `http://localhost` is also a secure context for these browser
features. Plain HTTP on another host can serve connected operation but cannot
provide the same installed-offline behavior. Some browsers also withhold
cryptographic hashing in an insecure context; run provenance then says the
hash is unavailable rather than fabricating it.

## Deploying under a subdirectory

For `https://example.com/tools/circuitbench/`, place `index.html` at
`tools/circuitbench/index.html` and every adjacent runtime file under the same
folder. Open the URL with its trailing slash. Assets and worker imports are
relative to the application, and the service worker is scoped to that folder.

There is no hardcoded `/engine/` or root-domain API route. The application can
be served from a different route without recompiling its electrical engine.

Browser storage is per origin. Different paths on the same origin currently
share the CircuitBench database; use separate hostnames if independent local
workspaces are required. A different protocol, hostname or port has a separate
browser-storage identity. Export JSON before moving an installation.

## Offline installation

1. Open the application over HTTPS or localhost while the server is reachable.
2. Wait until the footer reports **Offline ready · all runtime assets cached**.
3. Save a project backup.
4. Disconnect the network and reload the same URL to check that the app and a
   fresh simulation still work on that device.

The cache holds executable application assets, the local ngspice engine, models
in application code, and the UI. The source archive and documentation are
release materials, not required executable cache assets. Browser storage
policies can evict local caches; a portable backup and downloaded ZIP remain
the durable recovery route.

An installation button is not required for offline use. Browsers that offer an
“install app” or “add to home screen” menu may provide their own entry point.

## Updating

1. Export a backup of the active project and its important runs.
2. Replace the complete deployed directory with one versioned release.
3. Revisit the app while online. When a new service worker is detected, the app
   reports that an update is ready.
4. Close **all** CircuitBench tabs using that installation, then reopen it.
5. Confirm the visible version and wait for offline readiness again.

Do not mix source files or worker/WASM files from different releases. Configure
`sw.js`, the HTML and mutable manifests for revalidation rather than a long
immutable cache lifetime. Versioned offline caches make a completed release a
coherent set of files. Retain the previous release ZIP for rollback.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Blank page or modules refused | Use HTTP(S); upload all files; verify JavaScript MIME types and browser console network errors. |
| ngspice cannot start | Verify both `engine/eecircuit-engine.mjs` and `engine/spice.wasm`; confirm the WASM response is a binary file, not a login or 404 HTML page. |
| Offline cache unavailable | Use HTTPS/localhost, allow service workers, check storage space and browser restrictions. The downloaded folder can still be served locally. |
| Session only / save failed | Browser storage was denied or exhausted. Download a JSON backup before leaving. |
| Old version after upload | Close every tab at that app URL, reopen online, and confirm the version. Check the server's cache headers. |
| Results differ after a change | Inspect the run revision, generated netlist, selected model, analysis settings and diagnostic log. Earlier results remain attached to their captured revision. |
| Timeout | Reduce the analysis size or inspect circuit convergence. Stop/timeout disposes of the worker; a subsequent run starts fresh. |

No external deployment is implied by possession of this package. Hosting it on
a selected public destination is a separate operation.
