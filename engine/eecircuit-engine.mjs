/* CircuitBench vendor adaptation of EEcircuit-engine 1.8.0 (MIT).
 * Embedded WASM extracted unchanged; upstream PDK preloads excluded.
 * Byte-safe raw parsing, rejection and bounded diagnostics added. See docs/engine-evaluation.md.
 */
//#endregion
//#region src/spice.js
async function e(e = {}) {
	var t = e, n = !!globalThis.window, r = !!globalThis.WorkerGlobalScope;
	globalThis.process?.versions?.node && globalThis.process?.type, typeof globalThis < "u" && (globalThis.window || (globalThis.window = {}), globalThis.window.prompt = function(e) {
		return t.getInput ? t.getInput() : null;
	}), t.setGetInput = function(e) {
		t.getInput = e;
	}, t.setHandleThings = function(e) {
		t.handleThings = e;
	}, t.runThings = function() {
		t.calledRun = !1, t.callMain ? t.callMain(Array.prototype.slice.call(arguments)) : Q !== void 0 && Q(Array.prototype.slice.call(arguments));
	};
	var i = [], a = "./this.program", o = (e, t) => {
		throw t;
	}, s = import.meta.url, c = "";
	function l(e) {
		return t.locateFile ? t.locateFile(e, c) : c + e;
	}
	var u, d;
	if (n || r) {
		try {
			c = new URL(".", s).href;
		} catch {}
		r && (d = (e) => {
			var t = new XMLHttpRequest();
			return t.open("GET", e, !1), t.responseType = "arraybuffer", t.send(null), new Uint8Array(t.response);
		}), u = async (e) => {
			var t = await fetch(e, { credentials: "same-origin" });
			if (t.ok) return t.arrayBuffer();
			throw Error(t.status + " : " + t.url);
		};
	}
	var f = console.log.bind(console), p = console.error.bind(console), ee, m = !1, h;
	class g {}
	class te extends g {}
	function ne() {
		return Z.buffer;
	}
	function re() {
		if (!v?.buffer?.resizable) {
			var e = ne();
			v = new Int8Array(e), B = new Int16Array(e), C = new Uint8Array(e), P = new Int32Array(e), F = new Uint32Array(e), I = new BigInt64Array(e);
		}
	}
	function ie() {
		var e = t.preRun;
		e && (typeof e == "function" && (e = [e]), ve.push(...e)), ge(ve);
	}
	function ae() {
		!t.noFSInit && !N.initialized && N.init(), A.init(), H.root = N.mount(H, {}, null), $.__wasm_call_ctors(), N.ignorePermissions = !1;
	}
	function oe() {
		var e = t.postRun;
		e && (typeof e == "function" && (e = [e]), _e.push(...e)), ge(_e);
	}
	function _(e) {
		throw t.onAbort?.(e), e = `Aborted(${e})`, p(e), m = !0, e += ". Build with -sASSERTIONS for more info.", new WebAssembly.RuntimeError(e);
	}
	var se;
	function ce() {
		return t.locateFile ? l("spice.wasm") : new URL("./spice.wasm", "" + import.meta.url).href;
	}
	function le(e) {
		if (d) return d(e);
		throw "both async and sync fetching of the wasm failed";
	}
	async function ue(e) {
		if (!ee) try {
			var t = await u(e);
			return new Uint8Array(t);
		} catch {}
		return le(e);
	}
	async function de(e, t) {
		try {
			var n = await ue(e);
			return await WebAssembly.instantiate(n, t);
		} catch (e) {
			p(`failed to asynchronously prepare wasm: ${e}`), _(e);
		}
	}
	async function fe(e, t, n) {
		if (!e) try {
			var r = fetch(t, { credentials: "same-origin" });
			return await WebAssembly.instantiateStreaming(r, n);
		} catch (e) {
			p(`wasm streaming compile failed: ${e}`), p("falling back to ArrayBuffer instantiation");
		}
		return de(t, n);
	}
	function pe() {
		return {
			env: hn,
			wasi_snapshot_preview1: hn
		};
	}
	async function me() {
		function e(e) {
			return $ = e.exports, $ = J.instrumentWasmExports($), mn($), re(), $;
		}
		function n(t) {
			return e(t.instance);
		}
		var r = pe(), i = t.instantiateWasm;
		return i ? new Promise((t) => {
			i(r, (n) => t(e(n)));
		}) : (se ??= ce(), n(await fe(ee, se, r)));
	}
	class he {
		name = "ExitStatus";
		constructor(e) {
			this.message = `Program terminated with exit(${e})`, this.status = e;
		}
	}
	var v, ge = (e) => {
		for (; e.length > 0;) e.shift()(t);
	}, _e = [], ve = [], y = !0, b = (e) => Xt(e), x = () => Qt(), ye = globalThis.TextDecoder && new TextDecoder(), be = (e, t, n, r) => {
		var i = t + n;
		if (r) return i;
		for (; e[t] && !(t >= i);) ++t;
		return t;
	}, S = (e, t = 0, n, r) => {
		var i = be(e, t, n, r);
		if (i - t > 16 && e.buffer && ye) return ye.decode(e.subarray(t, i));
		for (var a = ""; t < i;) {
			var o = e[t++];
			if (!(o & 128)) {
				a += String.fromCharCode(o);
				continue;
			}
			var s = e[t++] & 63;
			if ((o & 224) == 192) {
				a += String.fromCharCode((o & 31) << 6 | s);
				continue;
			}
			var c = e[t++] & 63;
			if (o = (o & 240) == 224 ? (o & 15) << 12 | s << 6 | c : (o & 7) << 18 | s << 12 | c << 6 | e[t++] & 63, o < 65536) a += String.fromCharCode(o);
			else {
				var l = o - 65536;
				a += String.fromCharCode(55296 | l >> 10, 56320 | l & 1023);
			}
		}
		return a;
	}, C, w = (e, t, n) => e ? S(C, e, t, n) : "", xe = (e, t, n, r) => _(`Assertion failed: ${w(e)}, at: ` + [
		t ? w(t) : "unknown filename",
		n,
		r ? w(r) : "unknown function"
	]), Se = (e, t) => ((t) => en(e, t))(t), T = {
		isAbs: (e) => e.charAt(0) === "/",
		splitPath: (e) => /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(e).slice(1),
		normalizeArray: (e, t) => {
			for (var n = 0, r = e.length - 1; r >= 0; r--) {
				var i = e[r];
				i === "." ? e.splice(r, 1) : i === ".." ? (e.splice(r, 1), n++) : n && (e.splice(r, 1), n--);
			}
			if (t) for (; n; n--) e.unshift("..");
			return e;
		},
		normalize: (e) => {
			var t = T.isAbs(e), n = e.slice(-1) === "/";
			return e = T.normalizeArray(e.split("/").filter((e) => !!e), !t).join("/"), !e && !t && (e = "."), e && n && (e += "/"), (t ? "/" : "") + e;
		},
		dirname: (e) => {
			var t = T.splitPath(e), n = t[0], r = t[1];
			return !n && !r ? "." : (r &&= r.slice(0, -1), n + r);
		},
		basename: (e) => e && e.match(/([^\/]+|\/)\/*$/)[1],
		join: (...e) => T.normalize(e.join("/")),
		join2: (e, t) => T.normalize(e + "/" + t)
	}, Ce = () => (e) => (crypto.getRandomValues(e), 0), we = (e) => (we = Ce())(e), E = {
		resolve: (...e) => {
			for (var t = "", n = !1, r = e.length - 1; r >= -1 && !n; r--) {
				var i = r >= 0 ? e[r] : N.cwd();
				if (typeof i != "string") throw TypeError("Arguments to path.resolve must be strings");
				if (!i) return "";
				t = i + "/" + t, n = T.isAbs(i);
			}
			return t = T.normalizeArray(t.split("/").filter((e) => !!e), !n).join("/"), (n ? "/" : "") + t || ".";
		},
		relative: (e, t) => {
			e = E.resolve(e).slice(1), t = E.resolve(t).slice(1);
			function n(e) {
				for (var t = 0; t < e.length && e[t] === ""; t++);
				for (var n = e.length - 1; n >= 0 && e[n] === ""; n--);
				return t > n ? [] : e.slice(t, n - t + 1);
			}
			for (var r = n(e.split("/")), i = n(t.split("/")), a = Math.min(r.length, i.length), o = a, s = 0; s < a; s++) if (r[s] !== i[s]) {
				o = s;
				break;
			}
			for (var c = [], s = o; s < r.length; s++) c.push("..");
			return c = c.concat(i.slice(o)), c.join("/");
		}
	}, D = [], O = (e) => {
		for (var t = 0, n = 0; n < e.length; ++n) {
			var r = e.charCodeAt(n);
			r <= 127 ? t++ : r <= 2047 ? t += 2 : r >= 55296 && r <= 57343 ? (t += 4, ++n) : t += 3;
		}
		return t;
	}, Te = (e, t, n, r) => {
		if (!(r > 0)) return 0;
		for (var i = n, a = n + r - 1, o = 0; o < e.length; ++o) {
			var s = e.codePointAt(o);
			if (s <= 127) {
				if (n >= a) break;
				t[n++] = s;
			} else if (s <= 2047) {
				if (n + 1 >= a) break;
				t[n++] = 192 | s >> 6, t[n++] = 128 | s & 63;
			} else if (s <= 65535) {
				if (n + 2 >= a) break;
				t[n++] = 224 | s >> 12, t[n++] = 128 | s >> 6 & 63, t[n++] = 128 | s & 63;
			} else {
				if (n + 3 >= a) break;
				t[n++] = 240 | s >> 18, t[n++] = 128 | s >> 12 & 63, t[n++] = 128 | s >> 6 & 63, t[n++] = 128 | s & 63, o++;
			}
		}
		return t[n] = 0, n - i;
	}, k = (e, t, n) => {
		var r = n > 0 ? n : O(e) + 1, i = Array(r), a = Te(e, i, 0, i.length);
		return t && (i.length = a), i;
	}, Ee = () => {
		if (!D.length) {
			var e = null;
			if (globalThis.window?.prompt && (e = window.prompt("Input: "), e !== null && (e += "\n")), !e) return null;
			D = k(e, !0);
		}
		return D.shift();
	}, A = {
		ttys: [],
		init() {},
		shutdown() {},
		register(e, t) {
			A.ttys[e] = {
				input: [],
				output: [],
				ops: t
			}, N.registerDevice(e, A.stream_ops);
		},
		stream_ops: {
			open(e) {
				var t = A.ttys[e.node.rdev];
				if (!t) throw new N.ErrnoError(43);
				e.tty = t, e.seekable = !1;
			},
			close(e) {
				e.tty.ops.fsync(e.tty);
			},
			fsync(e) {
				e.tty.ops.fsync(e.tty);
			},
			read(e, t, n, r, i) {
				if (!e.tty || !e.tty.ops.get_char) throw new N.ErrnoError(60);
				for (var a = 0, o = 0; o < r; o++) {
					var s;
					try {
						s = e.tty.ops.get_char(e.tty);
					} catch {
						throw new N.ErrnoError(29);
					}
					if (s === void 0 && !a) throw new N.ErrnoError(6);
					if (s == null || (a++, t[n + o] = s, s === 10)) break;
				}
				return a && (e.node.atime = Date.now()), a;
			},
			write(e, t, n, r, i) {
				if (!e.tty || !e.tty.ops.put_char) throw new N.ErrnoError(60);
				try {
					for (var a = 0; a < r; a++) e.tty.ops.put_char(e.tty, t[n + a]);
				} catch {
					throw new N.ErrnoError(29);
				}
				return r && (e.node.mtime = e.node.ctime = Date.now()), a;
			}
		},
		default_tty_ops: {
			get_char(e) {
				return Ee();
			},
			put_char(e, t) {
				t === null || t === 10 ? (f(S(e.output)), e.output = []) : t != 0 && e.output.push(t);
			},
			fsync(e) {
				e.output?.length > 0 && (f(S(e.output)), e.output = []);
			},
			ioctl_tcgets(e) {
				return {
					c_iflag: 25856,
					c_oflag: 5,
					c_cflag: 191,
					c_lflag: 35387,
					c_cc: [
						3,
						28,
						127,
						21,
						4,
						0,
						1,
						0,
						17,
						19,
						26,
						0,
						18,
						15,
						23,
						22,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0
					]
				};
			},
			ioctl_tcsets(e, t, n) {
				return 0;
			},
			ioctl_tiocgwinsz(e) {
				return [24, 80];
			}
		},
		default_tty1_ops: {
			put_char(e, t) {
				t === null || t === 10 ? (p(S(e.output)), e.output = []) : t != 0 && e.output.push(t);
			},
			fsync(e) {
				e.output?.length > 0 && (p(S(e.output)), e.output = []);
			}
		}
	}, De = (e) => {
		_();
	}, j = {
		ops_table: null,
		mount(e) {
			return j.createNode(null, "/", 16895, 0);
		},
		createNode(e, t, n, r) {
			if (N.isBlkdev(n) || N.isFIFO(n)) throw new N.ErrnoError(63);
			j.ops_table ||= {
				dir: {
					node: {
						getattr: j.node_ops.getattr,
						setattr: j.node_ops.setattr,
						lookup: j.node_ops.lookup,
						mknod: j.node_ops.mknod,
						rename: j.node_ops.rename,
						unlink: j.node_ops.unlink,
						rmdir: j.node_ops.rmdir,
						readdir: j.node_ops.readdir,
						symlink: j.node_ops.symlink
					},
					stream: { llseek: j.stream_ops.llseek }
				},
				file: {
					node: {
						getattr: j.node_ops.getattr,
						setattr: j.node_ops.setattr
					},
					stream: {
						llseek: j.stream_ops.llseek,
						read: j.stream_ops.read,
						write: j.stream_ops.write,
						mmap: j.stream_ops.mmap,
						msync: j.stream_ops.msync
					}
				},
				link: {
					node: {
						getattr: j.node_ops.getattr,
						setattr: j.node_ops.setattr,
						readlink: j.node_ops.readlink
					},
					stream: {}
				},
				chrdev: {
					node: {
						getattr: j.node_ops.getattr,
						setattr: j.node_ops.setattr
					},
					stream: N.chrdev_stream_ops
				}
			};
			var i = N.createNode(e, t, n, r);
			return N.isDir(i.mode) ? (i.node_ops = j.ops_table.dir.node, i.stream_ops = j.ops_table.dir.stream, i.contents = {}) : N.isFile(i.mode) ? (i.node_ops = j.ops_table.file.node, i.stream_ops = j.ops_table.file.stream, i.usedBytes = 0, i.contents = j.emptyFileContents ??= /* @__PURE__ */ new Uint8Array()) : N.isLink(i.mode) ? (i.node_ops = j.ops_table.link.node, i.stream_ops = j.ops_table.link.stream) : N.isChrdev(i.mode) && (i.node_ops = j.ops_table.chrdev.node, i.stream_ops = j.ops_table.chrdev.stream), i.atime = i.mtime = i.ctime = Date.now(), e && (e.contents[t] = i, e.atime = e.mtime = e.ctime = i.atime), i;
		},
		getFileDataAsTypedArray(e) {
			return e.contents.subarray(0, e.usedBytes);
		},
		expandFileStorage(e, t) {
			var n = e.contents.length;
			if (!(n >= t)) {
				t = Math.max(t, n * (n < 1048576 ? 2 : 1.125) >>> 0), n && (t = Math.max(t, 256));
				var r = j.getFileDataAsTypedArray(e);
				e.contents = new Uint8Array(t), e.contents.set(r);
			}
		},
		resizeFileStorage(e, t) {
			if (e.usedBytes != t) {
				var n = e.contents;
				e.contents = new Uint8Array(t), e.contents.set(n.subarray(0, Math.min(t, e.usedBytes))), e.usedBytes = t;
			}
		},
		node_ops: {
			getattr(e) {
				var t = {};
				return t.dev = N.isChrdev(e.mode) ? e.id : 1, t.ino = e.id, t.mode = e.mode, t.nlink = 1, t.uid = 0, t.gid = 0, t.rdev = e.rdev, t.size = N.isDir(e.mode) ? 4096 : N.isFile(e.mode) ? e.usedBytes : N.isLink(e.mode) ? e.link.length : 0, t.atime = new Date(e.atime), t.mtime = new Date(e.mtime), t.ctime = new Date(e.ctime), t.blksize = 4096, t.blocks = Math.ceil(t.size / t.blksize), t;
			},
			setattr(e, t) {
				for (let n of [
					"mode",
					"atime",
					"mtime",
					"ctime"
				]) t[n] != null && (e[n] = t[n]);
				t.size !== void 0 && j.resizeFileStorage(e, t.size);
			},
			lookup(e, t) {
				throw j.doesNotExistError || (j.doesNotExistError = new N.ErrnoError(44), j.doesNotExistError.stack = "<generic error, no stack>"), j.doesNotExistError;
			},
			mknod(e, t, n, r) {
				return j.createNode(e, t, n, r);
			},
			rename(e, t, n) {
				var r;
				try {
					r = N.lookupNode(t, n);
				} catch {}
				if (r) {
					if (N.isDir(e.mode)) for (var i in r.contents) throw new N.ErrnoError(55);
					N.hashRemoveNode(r);
				}
				delete e.parent.contents[e.name], t.contents[n] = e, e.name = n, t.ctime = t.mtime = e.parent.ctime = e.parent.mtime = Date.now();
			},
			unlink(e, t) {
				delete e.contents[t], e.ctime = e.mtime = Date.now();
			},
			rmdir(e, t) {
				for (var n in N.lookupNode(e, t).contents) throw new N.ErrnoError(55);
				delete e.contents[t], e.ctime = e.mtime = Date.now();
			},
			readdir(e) {
				return [
					".",
					"..",
					...Object.keys(e.contents)
				];
			},
			symlink(e, t, n) {
				var r = j.createNode(e, t, 41471, 0);
				return r.link = n, r;
			},
			readlink(e) {
				if (!N.isLink(e.mode)) throw new N.ErrnoError(28);
				return e.link;
			}
		},
		stream_ops: {
			read(e, t, n, r, i) {
				var a = e.node.contents;
				if (i >= e.node.usedBytes) return 0;
				var o = Math.min(e.node.usedBytes - i, r);
				return t.set(a.subarray(i, i + o), n), o;
			},
			write(e, t, n, r, i, a) {
				if (t.buffer === v.buffer && (a = !1), !r) return 0;
				var o = e.node;
				return o.mtime = o.ctime = Date.now(), a ? (o.contents = t.subarray(n, n + r), o.usedBytes = r) : !o.usedBytes && !i ? (o.contents = t.slice(n, n + r), o.usedBytes = r) : (j.expandFileStorage(o, i + r), o.contents.set(t.subarray(n, n + r), i), o.usedBytes = Math.max(o.usedBytes, i + r)), r;
			},
			llseek(e, t, n) {
				var r = t;
				if (n === 1 ? r += e.position : n === 2 && N.isFile(e.node.mode) && (r += e.node.usedBytes), r < 0) throw new N.ErrnoError(28);
				return r;
			},
			mmap(e, t, n, r, i) {
				if (!N.isFile(e.node.mode)) throw new N.ErrnoError(43);
				var a, o, s = e.node.contents;
				if (!(i & 2) && s.buffer === v.buffer) o = !1, a = s.byteOffset;
				else {
					if (o = !0, a = De(t), !a) throw new N.ErrnoError(48);
					s && ((n > 0 || n + t < s.length) && (s = s.subarray ? s.subarray(n, n + t) : Array.prototype.slice.call(s, n, n + t)), v.set(s, a));
				}
				return {
					ptr: a,
					allocated: o
				};
			},
			msync(e, t, n, r, i) {
				return j.stream_ops.write(e, t, 0, r, n, !1), 0;
			}
		}
	}, Oe = (e) => {
		if (typeof e != "string") return e;
		var t = {
			r: 0,
			"r+": 2,
			w: 577,
			"w+": 578,
			a: 1089,
			"a+": 1090
		}[e];
		if (t === void 0) throw Error(`Unknown file open mode: ${e}`);
		return t;
	}, ke = (e) => (typeof e == "string" && (e = k(e, !0)), e.subarray || (e = new Uint8Array(e)), e), Ae = (e, t) => {
		var n = 0;
		return e && (n |= 365), t && (n |= 146), n;
	}, je = async (e) => {
		var t = await u(e);
		return new Uint8Array(t);
	}, Me = (...e) => N.createDataFile(...e), Ne = (e) => e, Pe = null, Fe = async () => Pe, M = 0, Ie = null, Le = (e) => {
		M--, t.monitorRunDependencies?.(M), M || Ie();
	}, Re = (e) => {
		M || (Pe = new Promise((e) => Ie = e)), M++, t.monitorRunDependencies?.(M);
	}, ze = [], Be = async (e, t) => {
		typeof Browser < "u" && Browser.init();
		for (var n of ze) if (n.canHandle(t)) return n.handle(e, t);
		return e;
	}, Ve = async (e, t, n, r, i, a, o, s) => {
		var c = t ? E.resolve(T.join2(e, t)) : e, l = Ne(`cp ${c}`);
		Re(l);
		try {
			var u = n;
			typeof n == "string" && (u = await je(n)), u = await Be(u, c), s?.(), a || Me(e, t, u, r, i, o);
		} finally {
			Le(l);
		}
	}, He = (e, t, n, r, i, a, o, s, c, l) => {
		Ve(e, t, n, r, i, s, c, l).then(a).catch(o);
	}, N = {
		root: null,
		mounts: [],
		devices: {},
		streams: [],
		nextInode: 1,
		nameTable: null,
		currentPath: "/",
		initialized: !1,
		ignorePermissions: !0,
		filesystems: null,
		syncFSRequests: 0,
		ErrnoError: class {
			name = "ErrnoError";
			constructor(e) {
				this.errno = e;
			}
		},
		FSStream: class {
			shared = {};
			get object() {
				return this.node;
			}
			set object(e) {
				this.node = e;
			}
			get isRead() {
				return (this.flags & 2097155) != 1;
			}
			get isWrite() {
				return !!(this.flags & 2097155);
			}
			get isAppend() {
				return this.flags & 1024;
			}
			get flags() {
				return this.shared.flags;
			}
			set flags(e) {
				this.shared.flags = e;
			}
			get position() {
				return this.shared.position;
			}
			set position(e) {
				this.shared.position = e;
			}
		},
		FSNode: class {
			node_ops = {};
			stream_ops = {};
			readMode = 365;
			writeMode = 146;
			mounted = null;
			constructor(e, t, n, r) {
				e ||= this, this.parent = e, this.mount = e.mount, this.id = N.nextInode++, this.name = t, this.mode = n, this.rdev = r, this.atime = this.mtime = this.ctime = Date.now();
			}
			get read() {
				return (this.mode & this.readMode) === this.readMode;
			}
			set read(e) {
				e ? this.mode |= this.readMode : this.mode &= ~this.readMode;
			}
			get write() {
				return (this.mode & this.writeMode) === this.writeMode;
			}
			set write(e) {
				e ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
			}
			get isFolder() {
				return N.isDir(this.mode);
			}
			get isDevice() {
				return N.isChrdev(this.mode);
			}
			addListener(e, t = !1) {
				var n = {
					cb: e,
					exclusive: t
				}, r = this.listeners ??= /* @__PURE__ */ new Set();
				return r.add(n), {
					listeners: r,
					entry: n
				};
			}
			notifyListeners(e) {
				if (this.listeners) {
					var t;
					for (var n of this.listeners) n.exclusive ? (t ||= []).push(n) : n.cb(e);
					if (t) {
						var r = (this.exclTurn || 0) % t.length;
						this.exclTurn = r + 1, t[r].cb(e);
					}
				}
			}
		},
		lookupPath(e, t = {}) {
			if (!e) throw new N.ErrnoError(44);
			t.follow_mount ??= !0, T.isAbs(e) || (e = N.cwd() + "/" + e);
			linkloop: for (var n = 0; n < 40; n++) {
				for (var r = e.split("/").filter((e) => !!e), i = N.root, a = "/", o = 0; o < r.length; o++) {
					var s = o === r.length - 1;
					if (s && t.parent) break;
					if (r[o] !== ".") {
						if (r[o] === "..") {
							if (a = T.dirname(a), N.isRoot(i)) {
								e = a + "/" + r.slice(o + 1).join("/"), n--;
								continue linkloop;
							}
							i = i.parent;
							continue;
						}
						a = T.join2(a, r[o]);
						try {
							i = N.lookupNode(i, r[o]);
						} catch (e) {
							if (e?.errno === 44 && s && t.noent_okay) return { path: a };
							throw e;
						}
						if (N.isMountpoint(i) && (!s || t.follow_mount) && (i = i.mounted.root), N.isLink(i.mode) && (!s || t.follow)) {
							if (!i.node_ops.readlink) throw new N.ErrnoError(52);
							var c = i.node_ops.readlink(i);
							T.isAbs(c) || (c = T.dirname(a) + "/" + c), e = c + "/" + r.slice(o + 1).join("/");
							continue linkloop;
						}
					}
				}
				return {
					path: a,
					node: i
				};
			}
			throw new N.ErrnoError(32);
		},
		getPath(e) {
			for (var t;;) {
				if (N.isRoot(e)) {
					var n = e.mount.mountpoint;
					return t ? n[n.length - 1] === "/" ? n + t : `${n}/${t}` : n;
				}
				t = t ? `${e.name}/${t}` : e.name, e = e.parent;
			}
		},
		hashName(e, t) {
			for (var n = 0, r = 0; r < t.length; r++) n = (n << 5) - n + t.charCodeAt(r) | 0;
			return (e + n >>> 0) % N.nameTable.length;
		},
		hashAddNode(e) {
			var t = N.hashName(e.parent.id, e.name);
			e.name_next = N.nameTable[t], N.nameTable[t] = e;
		},
		hashRemoveNode(e) {
			var t = N.hashName(e.parent.id, e.name);
			if (N.nameTable[t] === e) N.nameTable[t] = e.name_next;
			else for (var n = N.nameTable[t]; n;) {
				if (n.name_next === e) {
					n.name_next = e.name_next;
					break;
				}
				n = n.name_next;
			}
		},
		lookupNode(e, t) {
			var n = N.mayLookup(e);
			if (n) throw new N.ErrnoError(n);
			for (var r = N.hashName(e.id, t), i = N.nameTable[r]; i; i = i.name_next) {
				var a = i.name;
				if (i.parent.id === e.id && a === t) return i;
			}
			return N.lookup(e, t);
		},
		createNode(e, t, n, r) {
			var i = new N.FSNode(e, t, n, r);
			return N.hashAddNode(i), i;
		},
		destroyNode(e) {
			N.hashRemoveNode(e);
		},
		isRoot(e) {
			return e === e.parent;
		},
		isMountpoint(e) {
			return !!e.mounted;
		},
		isFile(e) {
			return (e & 61440) == 32768;
		},
		isDir(e) {
			return (e & 61440) == 16384;
		},
		isLink(e) {
			return (e & 61440) == 40960;
		},
		isChrdev(e) {
			return (e & 61440) == 8192;
		},
		isBlkdev(e) {
			return (e & 61440) == 24576;
		},
		isFIFO(e) {
			return (e & 61440) == 4096;
		},
		isSocket(e) {
			return (e & 49152) == 49152;
		},
		flagsToPermissionString(e) {
			var t = [
				"r",
				"w",
				"rw"
			][e & 3];
			return e & 512 && (t += "w"), t;
		},
		nodePermissions(e, t) {
			return N.ignorePermissions ? 0 : t.includes("r") && !(e.mode & 292) || t.includes("w") && !(e.mode & 146) || t.includes("x") && !(e.mode & 73) ? 2 : 0;
		},
		mayLookup(e) {
			return N.isDir(e.mode) ? N.nodePermissions(e, "x") || (e.node_ops.lookup ? 0 : 2) : 54;
		},
		mayCreate(e, t) {
			if (!N.isDir(e.mode)) return 54;
			try {
				return N.lookupNode(e, t), 20;
			} catch {}
			return N.nodePermissions(e, "wx");
		},
		mayDelete(e, t, n) {
			var r;
			try {
				r = N.lookupNode(e, t);
			} catch (e) {
				return e.errno;
			}
			var i = N.nodePermissions(e, "wx");
			if (i) return i;
			if (n) {
				if (!N.isDir(r.mode)) return 54;
				if (N.isRoot(r) || N.getPath(r) === N.cwd()) return 10;
			} else if (N.isDir(r.mode)) return 31;
			return 0;
		},
		mayOpen(e, t) {
			if (!e) return 44;
			if (N.isLink(e.mode)) return 32;
			var n = N.flagsToPermissionString(t);
			return N.isDir(e.mode) && (n !== "r" || t & 576) ? 31 : N.nodePermissions(e, n);
		},
		checkOpExists(e, t) {
			if (!e) throw new N.ErrnoError(t);
			return e;
		},
		MAX_OPEN_FDS: 4096,
		nextfd() {
			for (var e = 0; e <= N.MAX_OPEN_FDS; e++) if (!N.streams[e]) return e;
			throw new N.ErrnoError(33);
		},
		getStreamChecked(e) {
			var t = N.getStream(e);
			if (!t) throw new N.ErrnoError(8);
			return t;
		},
		getStream: (e) => N.streams[e],
		createStream(e, t = -1) {
			return e = Object.assign(new N.FSStream(), e), t == -1 && (t = N.nextfd()), e.fd = t, N.streams[t] = e, e;
		},
		closeStream(e) {
			N.streams[e] = null;
		},
		dupStream(e, t = -1) {
			var n = N.createStream(e, t);
			return n.stream_ops?.dup?.(n), n;
		},
		doSetAttr(e, t, n) {
			var r = e?.stream_ops.setattr, i = r ? e : t;
			r ??= t.node_ops.setattr, N.checkOpExists(r, 63);
			try {
				r(i, n);
			} catch (e) {
				throw e instanceof RangeError ? new N.ErrnoError(22) : e;
			}
		},
		chrdev_stream_ops: {
			open(e) {
				e.stream_ops = N.getDevice(e.node.rdev).stream_ops, e.stream_ops.open?.(e);
			},
			llseek() {
				throw new N.ErrnoError(70);
			}
		},
		major: (e) => e >> 8,
		minor: (e) => e & 255,
		makedev: (e, t) => e << 8 | t,
		registerDevice(e, t) {
			N.devices[e] = { stream_ops: t };
		},
		getDevice: (e) => N.devices[e],
		getMounts(e) {
			for (var t = [], n = [e]; n.length;) {
				var r = n.pop();
				t.push(r), n.push(...r.mounts);
			}
			return t;
		},
		syncfs(e, t) {
			typeof e == "function" && (t = e, e = !1), N.syncFSRequests++, N.syncFSRequests > 1 && p(`warning: ${N.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
			var n = N.getMounts(N.root.mount), r = 0;
			function i(e) {
				return N.syncFSRequests--, t(e);
			}
			function a(e) {
				if (e) return a.errored ? void 0 : (a.errored = !0, i(e));
				++r >= n.length && i(null);
			}
			for (var o of n) o.type.syncfs ? o.type.syncfs(o, e, a) : a(null);
		},
		mount(e, t, n) {
			var r = n === "/", i = !n, a;
			if (r && N.root) throw new N.ErrnoError(10);
			if (!r && !i) {
				var o = N.lookupPath(n, { follow_mount: !1 });
				if (n = o.path, a = o.node, N.isMountpoint(a)) throw new N.ErrnoError(10);
				if (!N.isDir(a.mode)) throw new N.ErrnoError(54);
			}
			var s = {
				type: e,
				opts: t,
				mountpoint: n,
				mounts: []
			}, c = e.mount(s);
			return c.mount = s, s.root = c, r ? N.root = c : a && (a.mounted = s, a.mount && a.mount.mounts.push(s)), c;
		},
		unmount(e) {
			var t = N.lookupPath(e, { follow_mount: !1 });
			if (!N.isMountpoint(t.node)) throw new N.ErrnoError(28);
			var n = t.node, r = n.mounted, i = N.getMounts(r);
			for (var [a, o] of Object.entries(N.nameTable)) for (; o;) {
				var s = o.name_next;
				i.includes(o.mount) && N.destroyNode(o), o = s;
			}
			n.mounted = null;
			var c = n.mount.mounts.indexOf(r);
			n.mount.mounts.splice(c, 1);
		},
		lookup(e, t) {
			return e.node_ops.lookup(e, t);
		},
		mknod(e, t, n) {
			var r = N.lookupPath(e, { parent: !0 }).node, i = T.basename(e);
			if (!i) throw new N.ErrnoError(28);
			if (i === "." || i === "..") throw new N.ErrnoError(20);
			var a = N.mayCreate(r, i);
			if (a) throw new N.ErrnoError(a);
			if (!r.node_ops.mknod) throw new N.ErrnoError(63);
			return r.node_ops.mknod(r, i, t, n);
		},
		statfs(e) {
			return N.statfsNode(N.lookupPath(e, { follow: !0 }).node);
		},
		statfsStream(e) {
			return N.statfsNode(e.node);
		},
		statfsNode(e) {
			var t = {
				bsize: 4096,
				frsize: 4096,
				blocks: 1e6,
				bfree: 5e5,
				bavail: 5e5,
				files: N.nextInode,
				ffree: N.nextInode - 1,
				fsid: 42,
				flags: 2,
				namelen: 255
			};
			return e.node_ops.statfs && Object.assign(t, e.node_ops.statfs(e.mount.opts.root)), t;
		},
		create(e, t = 438) {
			return t &= 4095, t |= 32768, N.mknod(e, t, 0);
		},
		mkdir(e, t = 511) {
			return t &= 1023, t |= 16384, N.mknod(e, t, 0);
		},
		mkdirTree(e, t) {
			var n = e.split("/"), r = "";
			for (var i of n) if (i) {
				(r || T.isAbs(e)) && (r += "/"), r += i;
				try {
					N.mkdir(r, t);
				} catch (e) {
					if (e.errno != 20) throw e;
				}
			}
		},
		mkdev(e, t, n) {
			return n === void 0 && (n = t, t = 438), t |= 8192, N.mknod(e, t, n);
		},
		symlink(e, t) {
			if (!E.resolve(e)) throw new N.ErrnoError(44);
			var n = N.lookupPath(t, { parent: !0 }).node;
			if (!n) throw new N.ErrnoError(44);
			var r = T.basename(t), i = N.mayCreate(n, r);
			if (i) throw new N.ErrnoError(i);
			if (!n.node_ops.symlink) throw new N.ErrnoError(63);
			return n.node_ops.symlink(n, r, e);
		},
		link(e, t, n) {
			var r = N.lookupPath(t, { parent: !0 }).node;
			if (!r) throw new N.ErrnoError(44);
			var i = T.basename(t), a = N.mayCreate(r, i);
			if (a) throw new N.ErrnoError(a);
			if (!r.node_ops.link) throw new N.ErrnoError(34);
			return r.node_ops.link(r, i, e, n);
		},
		rename(e, t) {
			var n = T.dirname(e), r = T.dirname(t), i = T.basename(e), a = T.basename(t), o = N.lookupPath(e, { parent: !0 }), s = o.node, c;
			if (o = N.lookupPath(t, { parent: !0 }), c = o.node, !s || !c) throw new N.ErrnoError(44);
			if (s.mount !== c.mount) throw new N.ErrnoError(75);
			var l = N.lookupNode(s, i), u = E.relative(e, r);
			if (u.charAt(0) !== ".") throw new N.ErrnoError(28);
			if (u = E.relative(t, n), u.charAt(0) !== ".") throw new N.ErrnoError(55);
			var d;
			try {
				d = N.lookupNode(c, a);
			} catch {}
			if (l !== d) {
				var f = N.isDir(l.mode), p = N.mayDelete(s, i, f);
				if (p || (p = d ? N.mayDelete(c, a, f) : N.mayCreate(c, a), p)) throw new N.ErrnoError(p);
				if (!s.node_ops.rename) throw new N.ErrnoError(63);
				if (N.isMountpoint(l) || d && N.isMountpoint(d)) throw new N.ErrnoError(10);
				if (c !== s && (p = N.nodePermissions(s, "w"), p)) throw new N.ErrnoError(p);
				N.hashRemoveNode(l);
				try {
					s.node_ops.rename(l, c, a), l.parent = c;
				} catch (e) {
					throw e;
				} finally {
					N.hashAddNode(l);
				}
			}
		},
		rmdir(e) {
			var t = N.lookupPath(e, { parent: !0 }).node, n = T.basename(e), r = N.lookupNode(t, n), i = N.mayDelete(t, n, !0);
			if (i) throw new N.ErrnoError(i);
			if (!t.node_ops.rmdir) throw new N.ErrnoError(63);
			if (N.isMountpoint(r)) throw new N.ErrnoError(10);
			t.node_ops.rmdir(t, n), N.destroyNode(r);
		},
		readdir(e) {
			var t = N.lookupPath(e, { follow: !0 }).node;
			return N.checkOpExists(t.node_ops.readdir, 54)(t);
		},
		unlink(e) {
			var t = N.lookupPath(e, { parent: !0 }).node;
			if (!t) throw new N.ErrnoError(44);
			var n = T.basename(e), r = N.lookupNode(t, n), i = N.mayDelete(t, n, !1);
			if (i) throw new N.ErrnoError(i);
			if (!t.node_ops.unlink) throw new N.ErrnoError(63);
			if (N.isMountpoint(r)) throw new N.ErrnoError(10);
			t.node_ops.unlink(t, n), N.destroyNode(r);
		},
		readlink(e) {
			var t = N.lookupPath(e).node;
			if (!t) throw new N.ErrnoError(44);
			if (!t.node_ops.readlink) throw new N.ErrnoError(28);
			return t.node_ops.readlink(t);
		},
		stat(e, t) {
			var n = N.lookupPath(e, { follow: !t }).node;
			return N.checkOpExists(n.node_ops.getattr, 63)(n);
		},
		fstat(e) {
			var t = N.getStreamChecked(e), n = t.node, r = t.stream_ops.getattr, i = r ? t : n;
			return r ??= n.node_ops.getattr, N.checkOpExists(r, 63), r(i);
		},
		lstat(e) {
			return N.stat(e, !0);
		},
		doChmod(e, t, n, r) {
			N.doSetAttr(e, t, {
				mode: n & 4095 | t.mode & -4096,
				ctime: Date.now(),
				dontFollow: r
			});
		},
		chmod(e, t, n) {
			var r = typeof e == "string" ? N.lookupPath(e, { follow: !n }).node : e;
			N.doChmod(null, r, t, n);
		},
		lchmod(e, t) {
			N.chmod(e, t, !0);
		},
		fchmod(e, t) {
			var n = N.getStreamChecked(e);
			N.doChmod(n, n.node, t, !1);
		},
		doChown(e, t, n) {
			N.doSetAttr(e, t, {
				timestamp: Date.now(),
				dontFollow: n
			});
		},
		chown(e, t, n, r) {
			var i = typeof e == "string" ? N.lookupPath(e, { follow: !r }).node : e;
			N.doChown(null, i, r);
		},
		lchown(e, t, n) {
			N.chown(e, t, n, !0);
		},
		fchown(e, t, n) {
			var r = N.getStreamChecked(e);
			N.doChown(r, r.node, !1);
		},
		doTruncate(e, t, n) {
			if (N.isDir(t.mode)) throw new N.ErrnoError(31);
			if (!N.isFile(t.mode)) throw new N.ErrnoError(28);
			var r = N.nodePermissions(t, "w");
			if (r) throw new N.ErrnoError(r);
			N.doSetAttr(e, t, {
				size: n,
				timestamp: Date.now()
			});
		},
		truncate(e, t) {
			if (t < 0) throw new N.ErrnoError(28);
			var n = typeof e == "string" ? N.lookupPath(e, { follow: !0 }).node : e;
			N.doTruncate(null, n, t);
		},
		ftruncate(e, t) {
			var n = N.getStreamChecked(e);
			if (t < 0 || !(n.flags & 2097155)) throw new N.ErrnoError(28);
			N.doTruncate(n, n.node, t);
		},
		utime(e, t, n, r) {
			var i = N.lookupPath(e, { follow: !r });
			N.doSetAttr(null, i.node, {
				atime: t,
				mtime: n,
				dontFollow: r
			});
		},
		open(e, t, n = 438) {
			if (e === "") throw new N.ErrnoError(44);
			t = Oe(t), n = t & 64 ? n & 4095 | 32768 : 0;
			var r, i;
			if (typeof e == "object") r = e;
			else {
				i = e.endsWith("/");
				var a = N.lookupPath(e, {
					follow: !(t & 131072),
					noent_okay: !0
				});
				r = a.node, e = a.path;
			}
			var o = !1;
			if (t & 64) {
				if (r) {
					if (t & 128) throw new N.ErrnoError(20);
				} else if (i) throw new N.ErrnoError(31);
				else r = N.mknod(e, n | 511, 0), o = !0;
			}
			if (!r) throw new N.ErrnoError(44);
			if (N.isChrdev(r.mode) && (t &= -513), t & 65536 && !N.isDir(r.mode)) throw new N.ErrnoError(54);
			if (!o) {
				var s = N.mayOpen(r, t);
				if (s) throw new N.ErrnoError(s);
			}
			t & 512 && !o && N.truncate(r, 0), t &= -131713;
			var c = N.createStream({
				node: r,
				path: N.getPath(r),
				flags: t,
				seekable: !0,
				position: 0,
				stream_ops: r.stream_ops,
				ungotten: [],
				error: !1
			});
			return c.stream_ops.open && c.stream_ops.open(c), o && N.chmod(r, n & 511), c;
		},
		close(e) {
			if (N.isClosed(e)) throw new N.ErrnoError(8);
			e.getdents &&= null, e.node?.notifyListeners(32);
			try {
				e.stream_ops.close && e.stream_ops.close(e);
			} catch (e) {
				throw e;
			} finally {
				N.closeStream(e.fd);
			}
			e.fd = null;
		},
		isClosed(e) {
			return e.fd === null;
		},
		llseek(e, t, n) {
			if (N.isClosed(e)) throw new N.ErrnoError(8);
			if (!e.seekable || !e.stream_ops.llseek) throw new N.ErrnoError(70);
			if (n != 0 && n != 1 && n != 2) throw new N.ErrnoError(28);
			return e.position = e.stream_ops.llseek(e, t, n), e.ungotten = [], e.position;
		},
		read(e, t, n, r, i) {
			if (r < 0 || i < 0) throw new N.ErrnoError(28);
			if (N.isClosed(e) || (e.flags & 2097155) == 1) throw new N.ErrnoError(8);
			if (N.isDir(e.node.mode)) throw new N.ErrnoError(31);
			if (!e.stream_ops.read) throw new N.ErrnoError(28);
			var a = i !== void 0;
			if (!a) i = e.position;
			else if (!e.seekable) throw new N.ErrnoError(70);
			var o = e.stream_ops.read(e, t, n, r, i);
			return a || (e.position += o), o;
		},
		write(e, t, n, r, i, a) {
			if (r < 0 || i < 0) throw new N.ErrnoError(28);
			if (N.isClosed(e) || !(e.flags & 2097155)) throw new N.ErrnoError(8);
			if (N.isDir(e.node.mode)) throw new N.ErrnoError(31);
			if (!e.stream_ops.write) throw new N.ErrnoError(28);
			e.seekable && e.flags & 1024 && N.llseek(e, 0, 2);
			var o = i !== void 0;
			if (!o) i = e.position;
			else if (!e.seekable) throw new N.ErrnoError(70);
			var s = e.stream_ops.write(e, t, n, r, i, a);
			return o || (e.position += s), s;
		},
		mmap(e, t, n, r, i) {
			if (r & 2 && !(i & 2) && (e.flags & 2097155) != 2 || (e.flags & 2097155) == 1) throw new N.ErrnoError(2);
			if (!e.stream_ops.mmap) throw new N.ErrnoError(43);
			if (!t) throw new N.ErrnoError(28);
			return e.stream_ops.mmap(e, t, n, r, i);
		},
		msync(e, t, n, r, i) {
			return e.stream_ops.msync ? e.stream_ops.msync(e, t, n, r, i) : 0;
		},
		ioctl(e, t, n) {
			if (!e.stream_ops.ioctl) throw new N.ErrnoError(59);
			return e.stream_ops.ioctl(e, t, n);
		},
		readFile(e, t = {}) {
			t.flags = t.flags ?? 0, t.encoding = t.encoding ?? "binary", t.encoding !== "utf8" && t.encoding !== "binary" && _(`Invalid encoding type "${t.encoding}"`);
			var n = N.open(e, t.flags), r = N.stat(e).size, i = new Uint8Array(r);
			return N.read(n, i, 0, r, 0), t.encoding === "utf8" && (i = S(i)), N.close(n), i;
		},
		writeFile(e, t, n = {}) {
			n.flags = n.flags ?? 577;
			var r = N.open(e, n.flags, n.mode);
			t = ke(t), N.write(r, t, 0, t.byteLength, void 0, n.canOwn), N.close(r);
		},
		cwd: () => N.currentPath,
		chdir(e) {
			var t = N.lookupPath(e, { follow: !0 });
			if (t.node === null) throw new N.ErrnoError(44);
			if (!N.isDir(t.node.mode)) throw new N.ErrnoError(54);
			var n = N.nodePermissions(t.node, "x");
			if (n) throw new N.ErrnoError(n);
			N.currentPath = t.path;
		},
		createDefaultDirectories() {
			N.mkdir("/tmp"), N.mkdir("/home"), N.mkdir("/home/web_user");
		},
		createDefaultDevices() {
			N.mkdir("/dev"), N.registerDevice(N.makedev(1, 3), {
				read: () => 0,
				write: (e, t, n, r, i) => r,
				llseek: () => 0
			}), N.mkdev("/dev/null", N.makedev(1, 3)), A.register(N.makedev(5, 0), A.default_tty_ops), A.register(N.makedev(6, 0), A.default_tty1_ops), N.mkdev("/dev/tty", N.makedev(5, 0)), N.mkdev("/dev/tty1", N.makedev(6, 0));
			var e = /* @__PURE__ */ new Uint8Array(1024), t = 0, n = () => (t ||= (we(e), e.byteLength), e[--t]);
			N.createDevice("/dev", "random", n), N.createDevice("/dev", "urandom", n), N.mkdir("/dev/shm"), N.mkdir("/dev/shm/tmp");
		},
		createSpecialDirectories() {
			N.mkdir("/proc");
			var e = N.mkdir("/proc/self");
			N.mkdir("/proc/self/fd"), N.mount({ mount() {
				var t = N.createNode(e, "fd", 16895, 73);
				return t.stream_ops = { llseek: j.stream_ops.llseek }, t.node_ops = {
					lookup(e, t) {
						var n = +t, r = N.getStreamChecked(n), i = {
							parent: null,
							mount: { mountpoint: "fake" },
							node_ops: { readlink: () => r.path },
							id: n + 1
						};
						return i.parent = i, i;
					},
					readdir() {
						return Array.from(N.streams.entries()).filter(([e, t]) => t).map(([e, t]) => e.toString());
					}
				}, t;
			} }, {}, "/proc/self/fd");
		},
		createStandardStreams(e, t, n) {
			e ? N.createDevice("/dev", "stdin", e) : N.symlink("/dev/tty", "/dev/stdin"), t ? N.createDevice("/dev", "stdout", null, t) : N.symlink("/dev/tty", "/dev/stdout"), n ? N.createDevice("/dev", "stderr", null, n) : N.symlink("/dev/tty1", "/dev/stderr"), N.open("/dev/stdin", 0), N.open("/dev/stdout", 1), N.open("/dev/stderr", 1);
		},
		staticInit() {
			N.nameTable = Array(4096), N.mount(j, {}, "/"), N.createDefaultDirectories(), N.createDefaultDevices(), N.createSpecialDirectories(), N.filesystems = { MEMFS: j };
		},
		init(e, n, r) {
			N.initialized = !0, e ??= t.stdin, n ??= t.stdout, r ??= t.stderr, N.createStandardStreams(e, n, r);
		},
		quit() {
			N.initialized = !1;
			for (var e of N.streams) e && N.close(e);
		},
		findObject(e, t) {
			var n = N.analyzePath(e, t);
			return n.exists ? n.object : null;
		},
		analyzePath(e, t) {
			try {
				var n = N.lookupPath(e, { follow: !t });
				e = n.path;
			} catch {}
			var r = {
				isRoot: !1,
				exists: !1,
				error: 0,
				name: null,
				path: null,
				object: null,
				parentExists: !1,
				parentPath: null,
				parentObject: null
			};
			try {
				var n = N.lookupPath(e, { parent: !0 });
				r.parentExists = !0, r.parentPath = n.path, r.parentObject = n.node, r.name = T.basename(e), n = N.lookupPath(e, { follow: !t }), r.exists = !0, r.path = n.path, r.object = n.node, r.name = n.node.name, r.isRoot = n.path === "/";
			} catch (e) {
				r.error = e.errno;
			}
			return r;
		},
		createPath(e, t, n, r) {
			e = typeof e == "string" ? e : N.getPath(e);
			for (var i = t.split("/").reverse(); i.length;) {
				var a = i.pop();
				if (a) {
					var o = T.join2(e, a);
					try {
						N.mkdir(o);
					} catch (e) {
						if (e.errno != 20) throw e;
					}
					e = o;
				}
			}
			return o;
		},
		createFile(e, t, n, r, i) {
			var a = T.join2(typeof e == "string" ? e : N.getPath(e), t), o = Ae(r, i);
			return N.create(a, o);
		},
		createDataFile(e, t, n, r, i, a) {
			var o = t;
			e && (e = typeof e == "string" ? e : N.getPath(e), o = t ? T.join2(e, t) : e);
			var s = Ae(r, i), c = N.create(o, s);
			if (n) {
				n = ke(n), N.chmod(c, s | 146);
				var l = N.open(c, 577);
				N.write(l, n, 0, n.length, 0, a), N.close(l), N.chmod(c, s);
			}
		},
		createDevice(e, t, n, r) {
			var i = T.join2(typeof e == "string" ? e : N.getPath(e), t), a = Ae(!!n, !!r);
			N.createDevice.major ??= 64;
			var o = N.makedev(N.createDevice.major++, 0);
			return N.registerDevice(o, {
				open(e) {
					e.seekable = !1;
				},
				close(e) {
					r?.buffer?.length && r(10);
				},
				read(e, t, r, i, a) {
					for (var o = 0, s = 0; s < i; s++) {
						var c;
						try {
							c = n();
						} catch {
							throw new N.ErrnoError(29);
						}
						if (c === void 0 && !o) throw new N.ErrnoError(6);
						if (c == null) break;
						o++, t[r + s] = c;
					}
					return o && (e.node.atime = Date.now()), o;
				},
				write(e, t, n, i, a) {
					for (var o = 0; o < i; o++) try {
						r(t[n + o]);
					} catch {
						throw new N.ErrnoError(29);
					}
					return i && (e.node.mtime = e.node.ctime = Date.now()), o;
				}
			}), N.mkdev(i, a, o);
		},
		forceLoadFile(e) {
			if (e.isDevice || e.isFolder || e.link || e.contents) return !0;
			if (globalThis.XMLHttpRequest) _("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
			else try {
				e.contents = d(e.url);
			} catch {
				throw new N.ErrnoError(29);
			}
		},
		createLazyFile(e, t, n, i, a) {
			class o {
				lengthKnown = !1;
				chunks = [];
				get(e) {
					if (!(e > this.length - 1 || e < 0)) {
						var t = e % this.chunkSize, n = e / this.chunkSize | 0;
						return this.getter(n)[t];
					}
				}
				setDataGetter(e) {
					this.getter = e;
				}
				cacheLength() {
					var e = new XMLHttpRequest();
					e.open("HEAD", n, !1), e.send(null), e.status >= 200 && e.status < 300 || e.status === 304 || _(`Couldn't load ${n}. Status: ${e.status}`);
					var t = Number(e.getResponseHeader("Content-length")), r, i = (r = e.getResponseHeader("Accept-Ranges")) && r === "bytes", a = (r = e.getResponseHeader("Content-Encoding")) && r === "gzip", o = 1048576;
					i || (o = t);
					var s = (e, r) => {
						e > r && _(`invalid range (${e}, ${r}) or no bytes requested!`), r > t - 1 && _(`only ${t} bytes available! programmer error!`);
						var i = new XMLHttpRequest();
						return i.open("GET", n, !1), t !== o && i.setRequestHeader("Range", `bytes=${e}-${r}`), i.responseType = "arraybuffer", i.overrideMimeType && i.overrideMimeType("text/plain; charset=x-user-defined"), i.send(null), i.status >= 200 && i.status < 300 || i.status === 304 || _(`Couldn't load ${n}. Status: ${i.status}`), i.response === void 0 ? k(i.responseText ?? "", !0) : new Uint8Array(i.response || []);
					}, c = this;
					c.setDataGetter((e) => {
						var n = e * o, r = (e + 1) * o - 1;
						return r = Math.min(r, t - 1), c.chunks[e] === void 0 && (c.chunks[e] = s(n, r)), c.chunks[e] === void 0 && _("doXHR failed!"), c.chunks[e];
					}), (a || !t) && (o = t = 1, t = this.getter(0).length, o = t, f("LazyFiles on gzip forces download of the whole file when length is accessed")), this._length = t, this._chunkSize = o, this.lengthKnown = !0;
				}
				get length() {
					return this.lengthKnown || this.cacheLength(), this._length;
				}
				get chunkSize() {
					return this.lengthKnown || this.cacheLength(), this._chunkSize;
				}
			}
			if (globalThis.XMLHttpRequest) {
				r || _("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");
				var s = {
					isDevice: !1,
					contents: new o()
				};
			} else var s = {
				isDevice: !1,
				url: n
			};
			var c = N.createFile(e, t, s, i, a);
			s.contents ? c.contents = s.contents : s.url && (c.contents = null, c.url = s.url), Object.defineProperties(c, { usedBytes: { get: function() {
				return this.contents.length;
			} } });
			var l = {};
			for (let [e, t] of Object.entries(c.stream_ops)) l[e] = (...e) => (N.forceLoadFile(c), t(...e));
			function u(e, t, n, r, i) {
				var a = e.node.contents;
				if (i >= a.length) return 0;
				var o = Math.min(a.length - i, r);
				if (a.slice) for (var s = 0; s < o; s++) t[n + s] = a[i + s];
				else for (var s = 0; s < o; s++) t[n + s] = a.get(i + s);
				return o;
			}
			return l.read = (e, t, n, r, i) => (N.forceLoadFile(c), u(e, t, n, r, i)), l.mmap = (e, t, n, r, i) => {
				N.forceLoadFile(c);
				var a = De(t);
				if (!a) throw new N.ErrnoError(48);
				return u(e, v, a, t, n), {
					ptr: a,
					allocated: !0
				};
			}, c.stream_ops = l, c;
		}
	}, P, F, I, L = {
		currentUmask: 18,
		calculateAt(e, t, n) {
			if (T.isAbs(t)) return t;
			var r = e === -100 ? N.cwd() : L.getStreamFromFD(e).path;
			if (t.length == 0) {
				if (!n) throw new N.ErrnoError(44);
				return r;
			}
			return r + "/" + t;
		},
		writeStat(e, t) {
			F[e >> 2] = t.dev, F[e + 4 >> 2] = t.mode, F[e + 8 >> 2] = t.nlink, F[e + 12 >> 2] = t.uid, F[e + 16 >> 2] = t.gid, F[e + 20 >> 2] = t.rdev, I[e + 24 >> 3] = BigInt(t.size), P[e + 32 >> 2] = 4096, P[e + 36 >> 2] = t.blocks;
			var n = t.atime.getTime(), r = t.mtime.getTime(), i = t.ctime.getTime();
			return I[e + 40 >> 3] = BigInt(Math.floor(n / 1e3)), F[e + 48 >> 2] = n % 1e3 * 1e3 * 1e3, I[e + 56 >> 3] = BigInt(Math.floor(r / 1e3)), F[e + 64 >> 2] = r % 1e3 * 1e3 * 1e3, I[e + 72 >> 3] = BigInt(Math.floor(i / 1e3)), F[e + 80 >> 2] = i % 1e3 * 1e3 * 1e3, I[e + 88 >> 3] = BigInt(t.ino), 0;
		},
		writeStatFs(e, t) {
			F[e + 4 >> 2] = t.bsize, F[e + 60 >> 2] = t.bsize, I[e + 8 >> 3] = BigInt(t.blocks), I[e + 16 >> 3] = BigInt(t.bfree), I[e + 24 >> 3] = BigInt(t.bavail), I[e + 32 >> 3] = BigInt(t.files), I[e + 40 >> 3] = BigInt(t.ffree), F[e + 48 >> 2] = t.fsid, F[e + 64 >> 2] = t.flags, F[e + 56 >> 2] = t.namelen;
		},
		doMsync(e, t, n, r, i) {
			if (!N.isFile(t.node.mode)) throw new N.ErrnoError(43);
			if (r & 2) return 0;
			var a = C.subarray(e, e + n);
			N.msync(t, a, i, n, r);
		},
		getStreamFromFD(e) {
			return N.getStreamChecked(e);
		},
		varargs: void 0,
		getStr(e) {
			return w(e);
		}
	};
	function Ue(e) {
		try {
			return e = L.getStr(e), N.chdir(e), 0;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function We(e, t, n) {
		try {
			if (e === t || n & -524289) return -28;
			var r = L.getStreamFromFD(e);
			if (t < 0 || t >= N.MAX_OPEN_FDS) return -8;
			var i = N.getStream(t);
			i && N.close(i);
			var a = N.dupStream(r, t);
			return n & 524288 && (a.flags |= 524288), a.fd;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function Ge(e, t, n, r) {
		try {
			if (t = L.getStr(t), t = L.calculateAt(e, t), n & -8) return -28;
			var i = N.lookupPath(t, { follow: !0 }).node;
			if (!i) return -44;
			var a = "";
			return n & 4 && (a += "r"), n & 2 && (a += "w"), n & 1 && (a += "x"), a && N.nodePermissions(i, a) ? -2 : 0;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var R = () => {
		var e = P[L.varargs >> 2];
		return L.varargs += 4, e;
	}, z = R, B;
	function Ke(e, t, n) {
		L.varargs = n;
		try {
			var r = L.getStreamFromFD(e);
			switch (t) {
				case 0:
					var i = R();
					if (i < 0) return -28;
					for (; N.streams[i];) i++;
					return N.dupStream(r, i).fd;
				case 1:
				case 2: return 0;
				case 3: return r.flags;
				case 4:
					var i = R(), a = 289792;
					return r.flags = r.flags & ~a | i & a, 0;
				case 12:
					var i = z(), o = 0;
					return B[i + o >> 1] = 2, 0;
				case 13:
				case 14: return 0;
			}
			return -28;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function qe(e, t) {
		try {
			return L.writeStat(t, N.fstat(e));
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var V = (e, t, n) => Te(e, C, t, n);
	function Je(e, t) {
		try {
			if (!t) return -28;
			var n = N.cwd(), r = O(n) + 1;
			return t < r ? -68 : (V(n, e, t), r);
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var Ye = () => 0;
	function Xe(e, t, n) {
		L.varargs = n;
		try {
			var r = L.getStreamFromFD(e);
			switch (t) {
				case 21509: return r.tty ? 0 : -59;
				case 21505:
					if (!r.tty) return -59;
					if (r.tty.ops.ioctl_tcgets) {
						var i = r.tty.ops.ioctl_tcgets(r), a = z();
						P[a >> 2] = i.c_iflag || 0, P[a + 4 >> 2] = i.c_oflag || 0, P[a + 8 >> 2] = i.c_cflag || 0, P[a + 12 >> 2] = i.c_lflag || 0;
						for (var o = 0; o < 32; o++) v[a + o + 17] = i.c_cc[o] || 0;
						return 0;
					}
					return 0;
				case 21510:
				case 21511:
				case 21512: return r.tty ? 0 : -59;
				case 21506:
				case 21507:
				case 21508:
					if (!r.tty) return -59;
					if (r.tty.ops.ioctl_tcsets) {
						for (var a = z(), s = P[a >> 2], c = P[a + 4 >> 2], l = P[a + 8 >> 2], u = P[a + 12 >> 2], d = [], o = 0; o < 32; o++) d.push(v[a + o + 17]);
						return r.tty.ops.ioctl_tcsets(r.tty, t, {
							c_iflag: s,
							c_oflag: c,
							c_cflag: l,
							c_lflag: u,
							c_cc: d
						});
					}
					return 0;
				case 21519:
					if (!r.tty) return -59;
					var a = z();
					return P[a >> 2] = 0, 0;
				case 21520: return r.tty ? -28 : -59;
				case 21537:
				case 21531:
					var a = z();
					return N.ioctl(r, t, a);
				case 21523:
					if (!r.tty) return -59;
					if (r.tty.ops.ioctl_tiocgwinsz) {
						var f = r.tty.ops.ioctl_tiocgwinsz(r.tty), a = z();
						B[a >> 1] = f[0], B[a + 2 >> 1] = f[1];
					}
					return 0;
				case 21524: return r.tty ? 0 : -59;
				case 21515: return r.tty ? 0 : -59;
				default: return -28;
			}
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function Ze(e, t) {
		try {
			return e = L.getStr(e), L.writeStat(t, N.lstat(e));
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function Qe(e, t, n, r) {
		try {
			t = L.getStr(t);
			var i = r & 256, a = r & 4096;
			return r &= -6401, t = L.calculateAt(e, t, a), L.writeStat(n, i ? N.lstat(t) : N.stat(t));
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function $e(e, t, n, r) {
		L.varargs = r;
		try {
			t = L.getStr(t), t = L.calculateAt(e, t);
			var i = r ? R() : 0;
			return n & 64 && (i &= ~L.currentUmask), N.open(t, n, i).fd;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var H = {
		BUCKET_BUFFER_SIZE: 8192,
		mount(e) {
			return N.createNode(null, "/", 16895, 0);
		},
		createPipe() {
			var e = {
				buckets: [],
				writerCount: 1,
				writeClosed: !1,
				readerCount: 1,
				readClosed: !1,
				timestamp: /* @__PURE__ */ new Date()
			};
			e.buckets.push({
				buffer: new Uint8Array(H.BUCKET_BUFFER_SIZE),
				offset: 0,
				roffset: 0
			});
			var t = H.nextname(), n = H.nextname(), r = N.createNode(H.root, t, 4096, 0), i = N.createNode(H.root, n, 4096, 0);
			r.pipe = e, i.pipe = e, e.readNode = r, e.writeNode = i;
			var a = N.createStream({
				path: t,
				node: r,
				flags: 0,
				seekable: !1,
				stream_ops: H.stream_ops
			});
			r.stream = a;
			var o = N.createStream({
				path: n,
				node: i,
				flags: 1,
				seekable: !1,
				stream_ops: H.stream_ops
			});
			return i.stream = o, {
				readable_fd: a.fd,
				writable_fd: o.fd
			};
		},
		stream_ops: {
			getattr(e) {
				var t = e.node, n = t.pipe.timestamp;
				return {
					dev: 14,
					ino: t.id,
					mode: 4480,
					nlink: 1,
					uid: 0,
					gid: 0,
					rdev: 0,
					size: 0,
					atime: n,
					mtime: n,
					ctime: n,
					blksize: 4096,
					blocks: 0
				};
			},
			poll(e) {
				var t = e.node.pipe;
				if ((e.flags & 2097155) == 1) {
					var n = 260;
					return t.readClosed && (n |= 8), n;
				}
				var n = 0;
				for (var r of t.buckets) if (r.offset - r.roffset > 0) {
					n = 65;
					break;
				}
				return t.writeClosed && (n |= 17), n;
			},
			dup(e) {
				var t = e.node.pipe;
				(e.flags & 2097155) == 1 ? t.writerCount++ : t.readerCount++;
			},
			ioctl(e, t, n) {
				if (t == 21531) {
					var r = e.node.pipe, i = 0;
					for (var a of r.buckets) i += a.offset - a.roffset;
					return P[n >> 2] = i, 0;
				}
				return 28;
			},
			fsync(e) {
				return 28;
			},
			read(e, t, n, r, i) {
				var a = e.node.pipe, o = 0;
				for (var s of a.buckets) o += s.offset - s.roffset;
				var c = t.subarray(n, n + r);
				if (r <= 0) return 0;
				if (o == 0) throw new N.ErrnoError(6);
				var l = Math.min(o, r), u = l, d = 0;
				for (var s of a.buckets) {
					var f = s.offset - s.roffset;
					if (l <= f) {
						var p = s.buffer.subarray(s.roffset, s.offset);
						l < f ? (p = p.subarray(0, l), s.roffset += l) : d++, c.set(p);
						break;
					}
					var p = s.buffer.subarray(s.roffset, s.offset);
					c.set(p), c = c.subarray(p.byteLength), l -= p.byteLength, d++;
				}
				return d && d == a.buckets.length && (d--, a.buckets[d].offset = 0, a.buckets[d].roffset = 0), a.buckets.splice(0, d), u;
			},
			write(e, t, n, r, i) {
				var a = e.node.pipe, o = t.subarray(n, n + r), s = o.byteLength;
				if (s <= 0) return 0;
				var c = null;
				a.buckets.length == 0 ? (c = {
					buffer: new Uint8Array(H.BUCKET_BUFFER_SIZE),
					offset: 0,
					roffset: 0
				}, a.buckets.push(c)) : c = a.buckets[a.buckets.length - 1];
				var l = H.BUCKET_BUFFER_SIZE - c.offset;
				if (l >= s) return c.buffer.set(o, c.offset), c.offset += s, a.readNode.notifyListeners(65), s;
				l > 0 && (c.buffer.set(o.subarray(0, l), c.offset), c.offset += l, o = o.subarray(l, o.byteLength));
				for (var u = o.byteLength / H.BUCKET_BUFFER_SIZE | 0, d = o.byteLength % H.BUCKET_BUFFER_SIZE, f = 0; f < u; f++) {
					var p = {
						buffer: new Uint8Array(H.BUCKET_BUFFER_SIZE),
						offset: H.BUCKET_BUFFER_SIZE,
						roffset: 0
					};
					a.buckets.push(p), p.buffer.set(o.subarray(0, H.BUCKET_BUFFER_SIZE)), o = o.subarray(H.BUCKET_BUFFER_SIZE, o.byteLength);
				}
				if (d > 0) {
					var p = {
						buffer: new Uint8Array(H.BUCKET_BUFFER_SIZE),
						offset: o.byteLength,
						roffset: 0
					};
					a.buckets.push(p), p.buffer.set(o);
				}
				return a.readNode.notifyListeners(65), s;
			},
			close(e) {
				var t = e.node.pipe;
				(e.flags & 2097155) == 1 ? --t.writerCount || (t.writeClosed = !0, t.readNode.notifyListeners(81)) : --t.readerCount || (t.readClosed = !0, t.writeNode.notifyListeners(268)), !t.readerCount && !t.writerCount && (t.buckets = null);
			}
		},
		nextname() {
			return H.nextname.current || (H.nextname.current = 0), "pipe[" + H.nextname.current++ + "]";
		}
	};
	function et(e, t) {
		try {
			if (e == 0) throw new N.ErrnoError(21);
			if (t & -526337) throw new N.ErrnoError(138);
			var n = H.createPipe();
			return t & 2048 && (N.getStream(n.readable_fd).flags |= 2048, N.getStream(n.writable_fd).flags |= 2048), P[e >> 2] = n.readable_fd, P[e + 4 >> 2] = n.writable_fd, 0;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function tt(e, t, n, r) {
		try {
			if (t = L.getStr(t), t = L.calculateAt(e, t), r <= 0) return -28;
			var i = N.readlink(t), a = Math.min(r, O(i)), o = v[n + a];
			return V(i, n, r + 1), v[n + a] = o, a;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function nt(e) {
		try {
			return e = L.getStr(e), N.rmdir(e), 0;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function rt(e, t) {
		try {
			return e = L.getStr(e), L.writeStat(t, N.stat(e));
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function it(e, t, n) {
		try {
			if (t = L.getStr(t), t = L.calculateAt(e, t), !n) N.unlink(t);
			else if (n === 512) N.rmdir(t);
			else return -28;
			return 0;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var at = () => _(""), ot = 0, st = () => {
		y = !1, ot = 0;
	}, ct = (e) => e ? -52 : 0, lt = () => {
		throw new te();
	}, ut = (e) => e % 4 == 0 && (e % 100 != 0 || e % 400 == 0), dt = [
		0,
		31,
		60,
		91,
		121,
		152,
		182,
		213,
		244,
		274,
		305,
		335
	], ft = [
		0,
		31,
		59,
		90,
		120,
		151,
		181,
		212,
		243,
		273,
		304,
		334
	], pt = (e) => (ut(e.getFullYear()) ? dt : ft)[e.getMonth()] + e.getDate() - 1, mt = 9007199254740992, ht = -9007199254740992, U = (e) => e < ht || e > mt ? NaN : Number(e);
	function gt(e, t) {
		e = U(e);
		var n = /* @__PURE__ */ new Date(e * 1e3);
		if (isNaN(n.getTime())) return 1;
		P[t >> 2] = n.getSeconds(), P[t + 4 >> 2] = n.getMinutes(), P[t + 8 >> 2] = n.getHours(), P[t + 12 >> 2] = n.getDate(), P[t + 16 >> 2] = n.getMonth(), P[t + 20 >> 2] = n.getFullYear() - 1900, P[t + 24 >> 2] = n.getDay();
		var r = pt(n) | 0;
		P[t + 28 >> 2] = r, P[t + 36 >> 2] = -(n.getTimezoneOffset() * 60);
		var i = new Date(n.getFullYear(), 0, 1), a = new Date(n.getFullYear(), 6, 1).getTimezoneOffset(), o = i.getTimezoneOffset(), s = (a != o && n.getTimezoneOffset() == Math.min(o, a)) | 0;
		return P[t + 32 >> 2] = s, 0;
	}
	var _t = (e, t, n, r) => {
		var i = (/* @__PURE__ */ new Date()).getFullYear(), a = new Date(i, 0, 1), o = new Date(i, 6, 1), s = a.getTimezoneOffset(), c = o.getTimezoneOffset(), l = Math.max(s, c);
		F[e >> 2] = l * 60, P[t >> 2] = Number(s != c);
		var u = (e) => {
			var t = e >= 0 ? "-" : "+", n = Math.abs(e);
			return `UTC${t}${String(Math.floor(n / 60)).padStart(2, "0")}${String(n % 60).padStart(2, "0")}`;
		}, d = u(s), f = u(c);
		c < s ? (V(d, n, 17), V(f, r, 17)) : (V(d, r, 17), V(f, n, 17));
	}, vt = () => performance.now(), yt = () => Date.now(), bt = 1, xt = (e) => e >= 0 && e <= 3;
	function St(e, t, n) {
		if (t = U(t), !xt(e)) return 28;
		var r;
		if (e === 0) r = yt();
		else if (bt) r = vt();
		else return 52;
		var i = Math.round(r * 1e3 * 1e3);
		return I[n >> 3] = BigInt(i), 0;
	}
	var Ct = () => 2147483648, wt = () => Ct(), Tt = (e, t) => Math.ceil(e / t) * t, Et = (e) => {
		var t = (e - Z.buffer.byteLength + 65535) / 65536 | 0;
		try {
			return Z.grow(t), re(), 1;
		} catch {}
	}, Dt = (e) => {
		var t = C.length;
		e >>>= 0;
		var n = Ct();
		if (e > n) return !1;
		for (var r = 1; r <= 4; r *= 2) {
			var i = t * (1 + .2 / r);
			if (i = Math.min(i, e + 100663296), Et(Math.min(n, Tt(Math.max(e, i), 65536)))) return !0;
		}
		return !1;
	}, W = {}, Ot = () => a, G = () => {
		if (!G.strings) {
			var e = {
				USER: "web_user",
				LOGNAME: "web_user",
				PATH: "/",
				PWD: "/",
				HOME: "/home/web_user",
				LANG: (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8",
				_: Ot()
			};
			for (var t in W) W[t] === void 0 ? delete e[t] : e[t] = W[t];
			var n = [];
			for (var t in e) n.push(`${t}=${e[t]}`);
			G.strings = n;
		}
		return G.strings;
	}, kt = (e, t) => {
		var n = 0, r = 0;
		for (var i of G()) {
			var a = t + n;
			F[e + r >> 2] = a, n += V(i, a, Infinity) + 1, r += 4;
		}
		return 0;
	}, At = (e, t) => {
		var n = G();
		F[e >> 2] = n.length;
		var r = 0;
		for (var i of n) r += O(i) + 1;
		return F[t >> 2] = r, 0;
	}, jt = () => y || ot > 0, Mt = (e) => {
		h = e, jt() || (t.onExit?.(e), m = !0), o(e, new he(e));
	}, Nt = (e, t) => {
		h = e, Mt(e);
	}, Pt = Nt;
	function Ft(e) {
		try {
			var t = L.getStreamFromFD(e);
			return N.close(t), 0;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function It(e, t) {
		try {
			var n = 0, r = 0, i = 0, a = L.getStreamFromFD(e), o = a.tty ? 2 : N.isDir(a.mode) ? 3 : N.isLink(a.mode) ? 7 : 4;
			return v[t] = o, B[t + 2 >> 1] = i, I[t + 8 >> 3] = BigInt(n), I[t + 16 >> 3] = BigInt(r), 0;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	var Lt = (e, t, n, r) => {
		for (var i = 0, a = 0; a < n; a++) {
			var o = F[t >> 2], s = F[t + 4 >> 2];
			t += 8;
			try {
				var c = N.read(e, v, o, s, r);
			} catch (e) {
				if (i > 0 && e instanceof N.ErrnoError && (e.errno == 6 || e.errno == 6)) break;
				throw e;
			}
			if (c < 0) return -1;
			if (i += c, c < s) break;
			r !== void 0 && (r += c);
		}
		return i;
	};
	function Rt(e, t, n, r) {
		try {
			var i = Lt(L.getStreamFromFD(e), t, n);
			return F[r >> 2] = i, 0;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function zt(e, t, n, r) {
		t = U(t);
		try {
			if (isNaN(t)) return 22;
			var i = L.getStreamFromFD(e);
			return N.llseek(i, t, n), I[r >> 3] = BigInt(i.position), i.getdents && !t && n === 0 && (i.getdents = null), 0;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	var Bt = (e, t, n, r) => {
		if (n == 1) return N.write(e, v, F[t >> 2], F[t + 4 >> 2], r);
		for (var i = 0, a = 0, o = t; a < n; a++, o += 8) i += F[o + 4 >> 2];
		for (var s = new Uint8Array(i), c = 0, a = 0; a < n; a++, t += 8) {
			var l = F[t >> 2], u = F[t + 4 >> 2];
			s.set(C.subarray(l, l + u), c), c += u;
		}
		return N.write(e, s, 0, i, r);
	};
	function Vt(e, t, n, r) {
		try {
			var i = Bt(L.getStreamFromFD(e), t, n);
			return F[r >> 2] = i, 0;
		} catch (e) {
			if (N === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	var K = (e) => {
		if (e instanceof he || e == "unwind") return h;
		o(1, e);
	}, Ht = (e) => Zt(e), Ut = (e) => {
		var t = O(e) + 1, n = Ht(t);
		return V(e, n, t), n;
	}, q = (e) => {
		try {
			return e();
		} catch (e) {
			_(e);
		}
	}, Wt = () => {
		if (!jt()) try {
			Pt(h);
		} catch (e) {
			K(e);
		}
	}, Gt = (e) => {
		if (!m) try {
			return e();
		} catch (e) {
			K(e);
		} finally {
			Wt();
		}
	}, J = {
		instrumentWasmImports(e) {
			var t = /^(invoke_.*|__asyncjs__.*)$/;
			for (let [n, r] of Object.entries(e)) typeof r == "function" && (r.isAsync || t.test(n));
		},
		instrumentFunction(e) {
			var t = (...t) => {
				J.exportCallStack.push(e);
				try {
					return e(...t);
				} finally {
					m || (J.exportCallStack.pop(), J.maybeStopUnwind());
				}
			};
			return J.funcWrappers.set(e, t), t;
		},
		instrumentWasmExports(e) {
			var t = {};
			for (let [n, r] of Object.entries(e)) t[n] = typeof r == "function" ? J.instrumentFunction(r) : r;
			return t;
		},
		State: {
			Normal: 0,
			Unwinding: 1,
			Rewinding: 2,
			Disabled: 3
		},
		state: 0,
		StackSize: 4096,
		currData: null,
		handleSleepReturnValue: 0,
		exportCallStack: [],
		callstackFuncToId: /* @__PURE__ */ new Map(),
		callStackIdToFunc: /* @__PURE__ */ new Map(),
		funcWrappers: /* @__PURE__ */ new Map(),
		callStackId: 0,
		asyncPromiseHandlers: null,
		sleepCallbacks: [],
		getCallStackId(e) {
			if (!J.callstackFuncToId.has(e)) {
				var t = J.callStackId++;
				J.callstackFuncToId.set(e, t), J.callStackIdToFunc.set(t, e);
			}
			return J.callstackFuncToId.get(e);
		},
		maybeStopUnwind() {
			J.currData && J.state === J.State.Unwinding && !J.exportCallStack.length && (J.state = J.State.Normal, q(dn), typeof Fibers < "u" && Fibers.trampoline());
		},
		whenDone() {
			return new Promise((e, t) => {
				J.asyncPromiseHandlers = {
					resolve: e,
					reject: t
				};
			});
		},
		allocateData() {
			var e = Yt(12 + J.StackSize);
			return J.setDataHeader(e, e + 12, J.StackSize), J.setDataRewindFunc(e), e;
		},
		setDataHeader(e, t, n) {
			F[e >> 2] = t, F[e + 4 >> 2] = t + n;
		},
		setDataRewindFunc(e) {
			var t = J.exportCallStack[0], n = J.getCallStackId(t);
			P[e + 8 >> 2] = n;
		},
		getDataRewindFunc(e) {
			var t = P[e + 8 >> 2];
			return J.callStackIdToFunc.get(t);
		},
		doRewind(e) {
			var t = J.getDataRewindFunc(e);
			return Gt(J.funcWrappers.get(t));
		},
		handleSleep(e) {
			if (!m) {
				if (J.state === J.State.Normal) {
					var t = !1, n = !1;
					e((e = 0) => {
						if (!m && (J.handleSleepReturnValue = e, t = !0, n)) {
							J.state = J.State.Rewinding, q(() => fn(J.currData)), typeof MainLoop < "u" && MainLoop.func && MainLoop.resume();
							var r, i = !1;
							try {
								r = J.doRewind(J.currData);
							} catch (e) {
								r = e, i = !0;
							}
							var a = !1;
							if (!J.currData) {
								var o = J.asyncPromiseHandlers;
								o && (J.asyncPromiseHandlers = null, (i ? o.reject : o.resolve)(r), a = !0);
							}
							if (i && !a) throw r;
						}
					}), n = !0, t || (J.state = J.State.Unwinding, J.currData = J.allocateData(), typeof MainLoop < "u" && MainLoop.func && MainLoop.pause(), q(() => un(J.currData)));
				} else J.state === J.State.Rewinding ? (J.state = J.State.Normal, q(pn), Jt(J.currData), J.currData = null, J.sleepCallbacks.forEach(Gt)) : _(`invalid state: ${J.state}`);
				return J.handleSleepReturnValue;
			}
		},
		handleAsync: (e) => J.handleSleep(async (t) => {
			t(await e());
		})
	};
	N.createPreloadedFile = He, N.preloadFile = Ve, N.staticInit(), t.noExitRuntime && (y = t.noExitRuntime), t.print && (f = t.print), t.printErr && (p = t.printErr), t.arguments && (i = t.arguments), t.thisProgram && (a = t.thisProgram);
	var Y = t.preInit;
	if (Y) for (typeof Y == "function" && (t.preInit = Y = [Y]); Y.length > 0;) Y.shift()();
	t.callMain = Q, t.FS = N, t.Asyncify = J;
	function Kt() {
		return J.handleAsync(async () => {
			t.handleThings && await new Promise((e) => {
				t.handleThings();
			});
		});
	}
	var qt, Jt, Yt, X, Xt, Zt, Qt, $t, en, tn, nn, rn, an, on, sn, cn, ln, un, dn, fn, pn, Z;
	function mn(e) {
		qt = t._main = e.__main_argc_argv, Jt = e.free, Yt = e.malloc, X = e.setThrew, Xt = e._emscripten_stack_restore, Zt = e._emscripten_stack_alloc, Qt = e.emscripten_stack_get_current, $t = e.dynCall_iiiii, en = e.dynCall_vi, tn = e.dynCall_ii, nn = e.dynCall_v, rn = e.dynCall_i, an = e.dynCall_viii, on = e.dynCall_iiiiii, sn = e.dynCall_iii, cn = e.dynCall_iiii, e.dynCall_iiiiiii, e.dynCall_d, e.dynCall_iiiiiiiiii, e.dynCall_vii, e.dynCall_iiiiddi, e.dynCall_viddii, ln = e.dynCall_iiiiiiiii, e.dynCall_ddd, e.dynCall_iidiii, e.dynCall_dd, e.dynCall_ddi, e.dynCall_jiji, e.dynCall_iidiiiii, un = e.asyncify_start_unwind, dn = e.asyncify_stop_unwind, fn = e.asyncify_start_rewind, pn = e.asyncify_stop_rewind, Z = e.memory, e.__indirect_function_table;
	}
	var hn = {
		__assert_fail: xe,
		__asyncjs__eesim_sleep_hack: Kt,
		__call_sighandler: Se,
		__syscall_chdir: Ue,
		__syscall_dup3: We,
		__syscall_faccessat: Ge,
		__syscall_fcntl64: Ke,
		__syscall_fstat64: qe,
		__syscall_getcwd: Je,
		__syscall_getuid32: Ye,
		__syscall_ioctl: Xe,
		__syscall_lstat64: Ze,
		__syscall_newfstatat: Qe,
		__syscall_openat: $e,
		__syscall_pipe2: et,
		__syscall_readlinkat: tt,
		__syscall_rmdir: nt,
		__syscall_stat64: rt,
		__syscall_unlinkat: it,
		_abort_js: at,
		_emscripten_runtime_keepalive_clear: st,
		_emscripten_system: ct,
		_emscripten_throw_longjmp: lt,
		_localtime_js: gt,
		_tzset_js: _t,
		clock_time_get: St,
		emscripten_date_now: yt,
		emscripten_get_heap_max: wt,
		emscripten_get_now: vt,
		emscripten_resize_heap: Dt,
		environ_get: kt,
		environ_sizes_get: At,
		exit: Pt,
		fd_close: Ft,
		fd_fdstat_get: It,
		fd_read: Rt,
		fd_seek: zt,
		fd_write: Vt,
		invoke_i: bn,
		invoke_ii: vn,
		invoke_iii: Cn,
		invoke_iiii: wn,
		invoke_iiiii: gn,
		invoke_iiiiii: Sn,
		invoke_iiiiiiiii: Tn,
		invoke_v: yn,
		invoke_vi: _n,
		invoke_viii: xn,
		proc_exit: Mt
	};
	function gn(e, t, n, r, i) {
		var a = x();
		try {
			return $t(e, t, n, r, i);
		} catch (e) {
			if (b(a), !(e instanceof g)) throw e;
			X(1, 0);
		}
	}
	function _n(e, t) {
		var n = x();
		try {
			en(e, t);
		} catch (e) {
			if (b(n), !(e instanceof g)) throw e;
			X(1, 0);
		}
	}
	function vn(e, t) {
		var n = x();
		try {
			return tn(e, t);
		} catch (e) {
			if (b(n), !(e instanceof g)) throw e;
			X(1, 0);
		}
	}
	function yn(e) {
		var t = x();
		try {
			nn(e);
		} catch (e) {
			if (b(t), !(e instanceof g)) throw e;
			X(1, 0);
		}
	}
	function bn(e) {
		var t = x();
		try {
			return rn(e);
		} catch (e) {
			if (b(t), !(e instanceof g)) throw e;
			X(1, 0);
		}
	}
	function xn(e, t, n, r) {
		var i = x();
		try {
			an(e, t, n, r);
		} catch (e) {
			if (b(i), !(e instanceof g)) throw e;
			X(1, 0);
		}
	}
	function Sn(e, t, n, r, i, a) {
		var o = x();
		try {
			return on(e, t, n, r, i, a);
		} catch (e) {
			if (b(o), !(e instanceof g)) throw e;
			X(1, 0);
		}
	}
	function Cn(e, t, n) {
		var r = x();
		try {
			return sn(e, t, n);
		} catch (e) {
			if (b(r), !(e instanceof g)) throw e;
			X(1, 0);
		}
	}
	function wn(e, t, n, r) {
		var i = x();
		try {
			return cn(e, t, n, r);
		} catch (e) {
			if (b(i), !(e instanceof g)) throw e;
			X(1, 0);
		}
	}
	function Tn(e, t, n, r, i, a, o, s, c) {
		var l = x();
		try {
			return ln(e, t, n, r, i, a, o, s, c);
		} catch (e) {
			if (b(l), !(e instanceof g)) throw e;
			X(1, 0);
		}
	}
	function Q(e = []) {
		var t = qt;
		e.unshift(a);
		var n = e.length, r = Ht((n + 1) * 4), i = r;
		for (var o of e) F[i >> 2] = Ut(o), i += 4;
		F[i >> 2] = 0;
		try {
			var s = t(n, r);
			return Nt(s, !0), s;
		} catch (e) {
			return K(e);
		}
	}
	async function En(e = i) {
		ie(), M && await Fe();
		var n = t.setStatus;
		n && (n("Running..."), await new Promise((e) => setTimeout(e, 1)), setTimeout(n, 1, "")), !m && (ae(), t.onRuntimeInitialized?.(), t.noInitialRun || Q(e), oe());
	}
	var $ = await me();
	return await En(), t;
}
//#endregion
//#region src/readOutput.ts
/* CircuitBench patch for EEcircuit-engine 1.8.0's readRawOutput.
 * The pinned bundle names this function t and its header parser r.
 * Binary locations are byte offsets; UTF-8 string indexes are not byte offsets.
 * No numerical computation or raw sample value is changed.
 */
function t(rawData) {
  // Copy out of a possibly resizable WebAssembly memory buffer.
  const bytes = new Uint8Array(rawData);
  const marker = [66, 105, 110, 97, 114, 121, 58]; // ASCII "Binary:"
  let headerEnd = -1, payloadOffset = -1;
  for (let at = 0; at <= bytes.length - marker.length; at++) {
    if (at > 0 && bytes[at - 1] !== 10) continue;
    if (!marker.every((value, index) => bytes[at + index] === value)) continue;
    const end = at + marker.length;
    if (bytes[end] === 10) {
      headerEnd = at; payloadOffset = end + 1; break;
    }
    if (bytes[end] === 13 && bytes[end + 1] === 10) {
      headerEnd = at; payloadOffset = end + 2; break;
    }
  }
  if (headerEnd < 0) throw new Error('ngspice raw output is missing its binary data header.');
  const header = new TextDecoder('utf-8').decode(bytes.subarray(0, headerEnd)).replace(/\r\n/g, '\n') + '\n';
  const param = r(header);
  if (!Number.isSafeInteger(param.varNum) || param.varNum < 1 ||
      !Number.isSafeInteger(param.pointNum) || param.pointNum < 0) {
    throw new Error('ngspice raw output declares invalid variable or point counts.');
  }
  if (param.pointNum > 250000 || param.varNum > 256 || param.pointNum * param.varNum > 2000000) {
    throw new Error('Simulation result exceeds the 2 million sample safety limit. Reduce points, time range, or saved vectors.');
  }
  const complex = param.dataType === 'complex';
  const expectedBytes = param.varNum * param.pointNum * (complex ? 16 : 8);
  const actualBytes = bytes.length - payloadOffset;
  if (actualBytes !== expectedBytes) {
    throw new Error(`ngspice raw output has an incomplete or inconsistent binary payload: expected ${expectedBytes} bytes, received ${actualBytes}.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + payloadOffset, expectedBytes);
  const data = Array.from({ length: param.varNum }, () => new Array(param.pointNum));
  let offset = 0;
  for (let point = 0; point < param.pointNum; point++) {
    for (let variable = 0; variable < param.varNum; variable++) {
      const real = view.getFloat64(offset, true); offset += 8;
      if (complex) {
        const img = view.getFloat64(offset, true); offset += 8;
        data[variable][point] = { real, img };
      } else {
        data[variable][point] = real;
      }
    }
  }
  return { param, header, data };
}

function n(e) {
	return new TextDecoder("utf-8").decode(e);
}
function r(e) {
	let t = e.split("\n"), n = parseInt(t[t.findIndex((e) => e.startsWith("No. Variables"))].split(":")[1], 10), r = parseInt(t[t.findIndex((e) => e.startsWith("No. Points"))].split(":")[1], 10), i = t[t.findIndex((e) => e.startsWith("Flags"))].split(":")[1].indexOf("complex") > -1 ? "complex" : "real", a = [];
	for (let e = 0; e < n; e++) {
		let n = t[e + t.indexOf("Variables:") + 1].split(/\s+/).filter((e) => e.length > 0);
		a.push({
			name: n[1],
			type: n[2]
		});
	}
	return {
		varNum: n,
		pointNum: r,
		variables: [...a],
		dataType: i
	};
}
function i(e) {
	let n = t(e), r = n.param, i = n.header, a = n.data;
	if (r.dataType === "complex") {
		let e = a.map((e, t) => ({
			name: r.variables[t].name,
			type: r.variables[t].type,
			values: e,
			index: t
		})).filter((e) => e.type !== "notype");
		return {
			header: i,
			numVariables: e.length,
			variableNames: e.map((e) => e.name),
			numPoints: r.pointNum,
			dataType: "complex",
			data: e.map((e) => ({
				name: e.name,
				type: e.type,
				values: e.values
			}))
		};
	}
	{
		let e = a.map((e, t) => ({
			name: r.variables[t].name,
			type: r.variables[t].type,
			values: e,
			index: t
		})).filter((e) => e.type !== "notype");
		return {
			header: i,
			numVariables: e.length,
			variableNames: e.map((e) => e.name),
			numPoints: r.pointNum,
			dataType: "real",
			data: e.map((e) => ({
				name: e.name,
				type: e.type,
				values: e.values
			}))
		};
	}
}
//#endregion
//#region CircuitBench: upstream Simulation without PDK preload
var o = class t {
	static MAX_INFO_CHARS = 2e6;
	__getSpiceModuleForTests() {
		return this.spiceModule;
	}
	pass = !1;
	commandList = [
		" ",
		"source test.cir",
		"destroy all",
		"run",
		"write out.raw"
	];
	isNoiseMode = !1;
	cmd = 0;
	dataRaw = /* @__PURE__ */ new Uint8Array();
	results = {};
	output = "";
	info = "";
	initInfo = "";
	error = [];
	initialized = !1;
	spiceModule = null;
	startPromise = null;
	netList = "";
	initPromiseResolve = null;
	runPromiseResolve = null;
	runPromiseReject = null;
	continuePromiseResolve = null;
	getInput = () => {
		let e = " ";
		return this.cmd < this.commandList.length ? (e = this.commandList[this.cmd], this.cmd++) : this.cmd = 0, this.log_debug(`cmd -> ${e}`), e;
	};
	async startInternal() {
		let n = {
			noInitialRun: !0,
			print: (e = "") => {
				this.log_debug(e), this.info = (this.info + e + "\n").slice(-t.MAX_INFO_CHARS);
			},
			printErr: (e = "") => {
				this.info = (this.info + e + "\n\n").slice(-t.MAX_INFO_CHARS), e !== "Warning: can't find the initialization file spinit." && e !== "Using SPARSE 1.3 as Direct Linear Solver" ? (console.error(e), (this.error.length < 1000 && this.error.push(e))) : this.log_debug(e);
			},
			preRun: [() => this.log_debug("from prerun")],
			setGetInput: this.getInput,
			setHandleThings: () => {},
			runThings: () => {}
		};
		if (typeof process < "u" && process.versions?.node) {
			let e = Function("specifier", "return import(specifier);"), [t, r] = await Promise.all([e("node:fs/promises").catch(() => null), e("node:url").catch(() => null)]);
			if (t && r) {
				let e = new URL("./spice.wasm", "" + import.meta.url);
				if (e.protocol === "file:") {
					let i = r.fileURLToPath(e);
					n.locateFile = (e) => e === "spice.wasm" ? i : e, n.wasmBinary = await t.readFile(i);
				}
			}
		}
		let r = this.spiceModule;
		r || (r = await e(n), this.spiceModule = r), r.FS?.writeFile("/spinit", "* Standard ngspice init file\n"), r.FS?.writeFile("/proc/meminfo", "MemTotal: 2097152 kB\nMemFree: 2097152 kB\nMemAvailable: 2097152 kB\n"), r.setHandleThings(() => {
			this.log_debug("handle other things!!!!!"), r.Asyncify?.handleAsync(async () => {
				if (this.cmd === 0) {
					try {
						this.dataRaw = r.FS?.readFile("out.raw") ?? /* @__PURE__ */ new Uint8Array(), this.results = i(this.dataRaw), this.results = i(this.dataRaw), this.outputEvent(this.output), this.runPromiseResolve &&= (this.runPromiseResolve(this.results), null);
					} catch (e) {
						this.runPromiseReject?.(e);
					}
					this.log_debug("output completed");
				}
				this.initialized || (this.initPromiseResolve &&= (this.initPromiseResolve(), null), this.log_debug("initialized"), this.initialized = !0, this.initInfo = this.info), this.cmd === 0 && (this.log_debug("waiting for next simulation trigger..."), await this.waitForNextRun(), r.FS?.writeFile("/test.cir", this.netList)), this.log_debug("Simulation loop finished for one run cycle"), this.pass = !1;
			});
		}), r.setGetInput(this.getInput), r.runThings();
	}
	start = () => this.initialized ? Promise.resolve() : this.startPromise ? this.startPromise : (this.startPromise = new Promise((e) => {
		this.initPromiseResolve = e;
	}), this.startInternal(), this.startPromise);
	runSim = () => (async () => {
		await this.start(), this.info = "", this.error = [], this.results = {};
		let e = new Promise((e, reject) => {
			this.runPromiseResolve = e;
			this.runPromiseReject = reject;
		});
		return this.log_debug("Triggering simulation run..."), this.continueRun(), await e;
	})();
	waitForNextRun = () => new Promise((e) => {
		this.continuePromiseResolve = e;
	});
	continueRun = () => {
		if (this.continuePromiseResolve) {
			let e = this.continuePromiseResolve;
			this.continuePromiseResolve = null, e();
		}
	};
	outputEvent = (e) => {};
	setNetList = (e) => {
		if (this.netList = e, /^\s*\.noise\b/im.test(e)) {
			this.commandList = [
				" ",
				"source test.cir",
				"destroy all",
				"run",
				"setplot noise1",
				"write out.raw"
			], this.isNoiseMode || (this.isNoiseMode = !0, console.info("[EEcircuit-engine] .noise analysis detected; activating noise export mode (setplot noise1 -> write out.raw)."));
			return;
		}
		this.isNoiseMode = !1, this.commandList = [
			" ",
			"source test.cir",
			"destroy all",
			"run",
			"write out.raw"
		];
	};
	setOutputEvent = (e) => {
		this.outputEvent = e;
	};
	getInfo = () => this.info;
	getInitInfo = () => this.initInfo;
	getError = () => this.error;
	isInitialized = () => this.initialized;
	log_debug = (e, ...t) => {};
};
//#endregion
export { o as Simulation, t as readRawOutput };
