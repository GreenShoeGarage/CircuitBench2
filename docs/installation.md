# Installation and self-hosting

## Updating an earlier release

Upload all extracted contents of **CircuitBench-2.0.0-rc.1-deploy.zip** to the
same application directory. Keep `assets/` and `repair/` intact. Executable
files now live under `assets/2.0.0-rc.1/`, including the `src/` modules,
stylesheet, and `engine/eecircuit-engine.js` plus `engine/spice.wasm`.
The versioned `src/` directory also includes the coordinated worker and its
digital/analog dependencies, continuous controller, display and study modules.
Upload the entire package even if a first experiment uses only digital parts.
Each release uses a new directory so a browser or CDN cannot reuse an older
worker through its previous URL. The service worker also has a release-specific
filename, `sw-2.0.0-rc.1.js`.

Close the application's other tabs, then open `repair/?release=2.0.0-rc.1`
under the application directory. Choose **Refresh cached application files**,
review the result, and return to CircuitBench. Confirm **v2.0.0-rc.1** before
running the experiment. The recovery page unregisters only this installation's
service worker, removes its application caches, and reloads the new executable
files through the browser HTTP cache. It does not clear project databases,
run history, or preferences.

The directory recovery URL works on hosts that redirect `.html` URLs to
extensionless directories. A compatibility `repair.html` file remains, but the
application links directly to `repair/`.

Startup errors now identify the failure stage, requested URL and available
HTTP/content-type information. A missing file, an HTML error page returned
instead of WASM, a truncated binary, or a rejected JavaScript response is
reported as such. The generic worker-error text in the original 1.0.0-rc.1 did not prove that
WebAssembly itself was the failing resource.

## What you need

CircuitBench is static HTML, CSS, browser JavaScript and WebAssembly. A modern
browser must support ES modules, module Web Workers, WebAssembly and IndexedDB.
There is no database server, application login, native runner or container to
install. Python is only one convenient way to serve the files locally.

The new display, coordinated feedback, converter, continuous and analog-study
features run locally in the same static installation. They require no extra
server or cloud simulation service. The full ngspice engine remains bundled
for the wider analog library and feed-forward mixed experiments.

The verified-browser coverage belongs to the final release validation record.
A standards-based implementation is not a claim of testing every desktop,
tablet, phone or browser version.

## Prebuilt ZIP: no build step

1. Unzip the deployable ZIP.
2. Confirm `index.html`, `assets/`, `repair/`, `recovery-manifest.json`,
   `icon.svg`, the web manifest and the versioned `sw-2.0.0-rc.1.js` are present
   together. The root `engine/` directory contains licenses and upstream source;
   the executing engine is inside the versioned assets directory.
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

**Serve `dist/`.** The source root contains the engine under `public/engine/`;
the build puts source modules and the engine inside the matching versioned
runtime directory and generates the deployable shell and service worker.

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

The installer uses a canonical copy of the application HTML embedded in the
versioned service worker. It does not fetch `index.html` for precaching. This
supports hosts that inject analytics into HTML or redirect that explicit
filename, while keeping byte-for-byte verification of all executable assets
and the canonical offline shell. No Cloudflare or site security setting needs
to be disabled for this arrangement.

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
2. Wait until the footer reports **Offline ready · all runtime assets verified**.
3. Save a project backup.
4. Disconnect the network and reload the same URL to check that the app and a
   fresh simulation still work on that device.

During installation, each runtime response is checked against the release
SHA-256 and byte length. JavaScript, HTML and CSS types are checked; WASM
bytes must have the expected binary signature. An HTTP-200 error page cannot
be accepted as a cached engine. Requests bypass the browser HTTP cache during
installation. Root and `index.html` cache entries are constructed from the
embedded canonical shell and checked against its release hash. A failed new
installation leaves an earlier cache available. Asset matching does not erase
release identity from paths or broadly ignore query strings.

The cache holds executable application assets, the local ngspice engine,
coordinated workers, models in application code, and the UI. The source archive and documentation are
release materials, not required executable cache assets. Browser storage
policies can evict local caches; a portable backup and downloaded ZIP remain
the durable recovery route.

An installation button is not required for offline use. Browsers that offer an
“install app” or “add to home screen” menu may provide their own entry point.

Continuous simulation belongs to the open page's dedicated worker. Pause keeps
that worker and its state; closing the page, refreshing or choosing Stop ends
it. Browser background throttling can slow wall-clock progress. The service
worker caches files but does not run the circuit after the page closes.
Autosave and **Save backup** retain the latest completed waveform window and
live-input history as a non-resumable snapshot. Reopening the file restores
inspectable evidence, not an active numerical session. See
[continuous-simulation.md](continuous-simulation.md).

## Updating

1. Export a backup of the active project and its important runs.
2. Replace the complete deployed directory with one versioned release.
3. Revisit the app while online. When a new service worker is detected, the app
   reports that an update is ready.
4. Close **all** CircuitBench tabs using that installation, then reopen it.
5. Confirm the visible version and wait for offline readiness again.

Do not mix source files or worker/WASM files from different releases. Configure
the root HTML and recovery manifest for revalidation. Release-specific asset
directories and service-worker filenames can tolerate long cache lifetimes;
each release still needs a new version. Retain the previous release ZIP for
rollback. The recovery page explicitly refreshes the root document separately
because an ordinary HTTP cache is distinct from the service-worker cache.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Blank page or modules refused | Use HTTP(S); upload all files; verify JavaScript MIME types and browser console network errors. |
| ngspice cannot start | Inspect the exact path in diagnostics; both engine files must be under the matching `assets/<version>/engine/` directory. Open `repair/` after uploading the whole package. |
| Coordinated worker cannot start | Upload every module under the matching versioned `src/` directory; inspect JavaScript MIME, network response and worker/CSP diagnostics. A successful digital-only run does not establish that the ngspice WASM files are present. |
| Offline cache unavailable | Use HTTPS/localhost, allow service workers, check storage space and browser restrictions. The downloaded folder can still be served locally. |
| Session only / save failed | Browser storage was denied or exhausted. Download a JSON backup before leaving. |
| Old version after upload | Close other app tabs, open `repair/?release=2.0.0-rc.1`, refresh cached files, return and confirm the version. |
| Results differ after a change | Inspect the run revision, generated netlist, selected model, analysis settings and diagnostic log. Earlier results remain attached to their captured revision. |
| Timeout | Reduce the analysis size or inspect circuit convergence. Stop/timeout disposes of the worker; a subsequent run starts fresh. |
| Continuous session stops on an edit | This preserves the captured circuit's meaning. Use Live inputs for DIN/BUSIN or DC V/I changes that should retain state; topology and part edits need a new session. |
| Continuous waveform begins after zero | Older intervals were removed by the time/sample/event history bounds. Retained times are absolute; the saved window is not the full elapsed simulation. |
| Backup does not resume a paused circuit | Backups store completed windows and provenance, without a serialized worker checkpoint. Start a new continuous session from the schematic's initial configuration. |

No external deployment is implied by possession of this package. Hosting it on
a selected public destination is a separate operation.
