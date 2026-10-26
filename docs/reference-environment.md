# Repeatable native reference environment

CircuitBench's coordinated numerical proof compares selected fixtures with
analytic expectations, pinned ngspice 45.2 WebAssembly and a separately executed
native ngspice 42 reference. The native executable retains the same SHA-256
used by the earlier proof:

```text
820658317b0b54035208da41936fd6871ce924036e5ea4113a4168b821b7fc45
```

The rc.2 environment lacked that executable and explicitly ran the WASM-only
proof. The rc.3 reference setup recovers the exact native binary from immutable,
hash-pinned Ubuntu package inputs. It extracts them into a private directory;
it does not install or replace system packages or change the application's
bundled engine. A successful environment check establishes that the reference
can execute. Fresh numerical comparison is a separate proof command and record.

## Pinned inputs

The recipe is `cb-native-ngspice42-ubuntu-noble-amd64-1`, for **Linux x86-64 with
a compatible glibc runtime**. It uses the
[Ubuntu snapshot dated 20260828T000000Z](https://snapshot.ubuntu.com/ubuntu/20260828T000000Z/).
The package identities and hashes were resolved from its signed Noble package
metadata. The script fetches fixed package paths and requires both their exact
byte lengths and SHA-256 values before extraction.

| Package | Version | Archive bytes | Archive SHA-256 |
|---|---|---:|---|
| ngspice | 42+ds-3build1 | 4,411,398 | `466c4c06418107ceaa9c9457065b3bb71a9d9dc5ec6fef186d7de9d5208ce8db` |
| libxft2 | 2.3.6-1build1 | 45,280 | `b4f4f3255c0b8773b260c61cbe20ee7c63799cfc0e4e389fa58375dd480b093a` |

The exact URLs are retained in `REFERENCE_PACKAGES` and `REFERENCE_SNAPSHOT`
in `scripts/reference-environment.mjs` in the source ZIP. The
additional libXft package supplies the one missing runtime dependency observed
in this release's verification environment. Other shared libraries come from
the host and are recorded individually with their resolved paths and hashes.
An incompatible host or another missing dependency is reported explicitly;
the script does not select an alternative ngspice version or install packages
automatically.

## Set up a private reference

Requirements are Node.js 20 or newer, `/usr/bin/curl` for a network download,
`/usr/bin/dpkg-deb` for extraction, and `/usr/bin/ldd` to inspect the resulting
runtime dependencies. Setup uses subprocesses; the execution environment must
permit them. Ordinary compatible Linux verification hosts need no root access.

Choose a new or empty directory whose path contains only letters, digits,
slash, period, underscore or hyphen:

```sh
node scripts/reference-environment.mjs \
  --setup \
  --prefix /tmp/circuitbench-native-42
```

For an offline setup, retain the two verified `.deb` files and supply their
directory:

```sh
node scripts/reference-environment.mjs \
  --setup \
  --prefix /tmp/circuitbench-native-42 \
  --packages /path/to/pinned-native-packages
```

The second form performs no package download. Both forms verify the same bytes.
Setup refuses a nonempty destination or a symlink destination and never removes
an existing directory to make room. A partial failure leaves its files available
for inspection; choose a new directory for a fresh setup.

The private directory contains the original package archives, extracted files,
an explicitly relocated initialization file and `reference-environment.json`.
The extracted package files remain unchanged. The initialization copy replaces
only `/usr/lib/x86_64-linux-gnu/ngspice/` code-model paths with the private
extraction path. Its original hash, resulting hash and exact transformation are
recorded. This avoids misleading load errors from code-model paths that would
otherwise point at an uninstalled system package.

## Check an existing setup

```sh
node scripts/reference-environment.mjs \
  --check \
  --prefix /tmp/circuitbench-native-42 \
  --output evidence/native-reference-environment.json
```

`--check` reads the setup without changing it. The optional `--output` writes
the requested evidence file; the JSON result is also printed. Exit status is
zero only when the record says **ready**. Missing or incompatible dependencies,
changed package/executable bytes and startup failures produce an unavailable
or failed record. A successful check covers:

- Both package hashes and byte lengths.
- The historically pinned native executable hash.
- The extracted libXft dependency and the initialization transformation.
- All resolved host runtime-library identities.
- Actual execution of `ngspice --version`, identifying ngspice 42.

The record includes platform, architecture, kernel, Node and observed glibc
runtime versions. Host shared-library hashes make the observed environment
auditable; the recipe is not a fully hermetic container. The stripped distro
executable has no compiler `.comment` section, so the script does not infer or
invent its compiler toolchain.

## Run a fresh numerical comparison

Use the private environment and explicit executable path:

```sh
LD_LIBRARY_PATH=/tmp/circuitbench-native-42/tools/usr/lib/x86_64-linux-gnu \
SPICE_LIB_DIR=/tmp/circuitbench-native-42/runtime/ngspice \
node scripts/prove-coordinated.mjs \
  --native-executable /tmp/circuitbench-native-42/tools/usr/bin/ngspice \
  --output evidence/coordinated-native-verification.json
```

The proof still rejects any native executable whose bytes differ from the
existing pin. It passes `-n` to exclude a local or user `.spiceinit`; the
recorded global initialization remains active. Keep the environment record
beside the numerical proof and retain the exact release/build identity in
the release assessment. A reference setup does not itself establish numerical
agreement, browser behavior, offline operation or output delivery.

## Relationship to the bundled engine source

The source package also contains the distinct ngspice **45.2** source archive
used for the bundled WASM engine:

```text
public/engine/source/ngspice-45.2-source.tar.gz
SHA-256 3aa30022e975bc04e2d9566e62e76d15e108d7b887f520755383ba37464c2324
```

That archive is a source-tree snapshot with `configure.ac` and `autogen.sh`,
without generated `configure`. A fresh native build requires additional build
tools such as autoconf, automake, libtool and m4, which were unavailable during
this setup. Recovering the existing native 42 reference preserves its original
identity and permits its comparison with the unchanged 45.2 WASM engine.

This recipe does not claim to rebuild the native or WASM executable from C/C++
source, reproduce the upstream compiler toolchain, or enable XSPICE in the
browser engine. Those are separate engine-development milestones in the
[roadmap](../ROADMAP.md). Current numerical observations and any remaining
verification limits are recorded in [VALIDATION.md](VALIDATION.md).
