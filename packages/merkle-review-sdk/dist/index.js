import { MerkleTree as $ } from "merkletreejs";
var b = /* @__PURE__ */ ((r) => (r.Funded = "Funded", r.InDispute = "InDispute", r.DisputeResolved = "DisputeResolved", r.DisputeUnresolved = "DisputeUnresolved", r.Completed = "Completed", r.Cancelled = "Cancelled", r))(b || {});
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function X(r) {
  return r instanceof Uint8Array || ArrayBuffer.isView(r) && r.constructor.name === "Uint8Array";
}
function H(r) {
  if (!Number.isSafeInteger(r) || r < 0)
    throw new Error("positive integer expected, got " + r);
}
function p(r, ...t) {
  if (!X(r))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(r.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + r.length);
}
function k(r, t = !0) {
  if (r.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && r.finished)
    throw new Error("Hash#digest() has already been called");
}
function U(r, t) {
  p(r);
  const e = t.outputLen;
  if (r.length < e)
    throw new Error("digestInto() expects output buffer of length at least " + e);
}
function W(r) {
  return new Uint32Array(r.buffer, r.byteOffset, Math.floor(r.byteLength / 4));
}
function x(...r) {
  for (let t = 0; t < r.length; t++)
    r[t].fill(0);
}
function P(r) {
  return new DataView(r.buffer, r.byteOffset, r.byteLength);
}
function g(r, t) {
  return r << 32 - t | r >>> t;
}
const K = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function z(r) {
  return r << 24 & 4278190080 | r << 8 & 16711680 | r >>> 8 & 65280 | r >>> 24 & 255;
}
function J(r) {
  for (let t = 0; t < r.length; t++)
    r[t] = z(r[t]);
  return r;
}
const C = K ? (r) => r : J;
function Q(r) {
  if (typeof r != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(r));
}
function F(r) {
  return typeof r == "string" && (r = Q(r)), p(r), r;
}
class R {
}
function N(r) {
  const t = (s) => r().update(F(s)).digest(), e = r();
  return t.outputLen = e.outputLen, t.blockLen = e.blockLen, t.create = () => r(), t;
}
function Y(r, t, e, s) {
  if (typeof r.setBigUint64 == "function")
    return r.setBigUint64(t, e, s);
  const n = BigInt(32), i = BigInt(4294967295), o = Number(e >> n & i), c = Number(e & i), a = s ? 4 : 0, h = s ? 0 : 4;
  r.setUint32(t + a, o, s), r.setUint32(t + h, c, s);
}
function Z(r, t, e) {
  return r & t ^ ~r & e;
}
function tt(r, t, e) {
  return r & t ^ r & e ^ t & e;
}
class et extends R {
  constructor(t, e, s, n) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = e, this.padOffset = s, this.isLE = n, this.buffer = new Uint8Array(t), this.view = P(this.buffer);
  }
  update(t) {
    k(this), t = F(t), p(t);
    const { view: e, buffer: s, blockLen: n } = this, i = t.length;
    for (let o = 0; o < i; ) {
      const c = Math.min(n - this.pos, i - o);
      if (c === n) {
        const a = P(t);
        for (; n <= i - o; o += n)
          this.process(a, o);
        continue;
      }
      s.set(t.subarray(o, o + c), this.pos), this.pos += c, o += c, this.pos === n && (this.process(e, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    k(this), U(t, this), this.finished = !0;
    const { buffer: e, view: s, blockLen: n, isLE: i } = this;
    let { pos: o } = this;
    e[o++] = 128, x(this.buffer.subarray(o)), this.padOffset > n - o && (this.process(s, 0), o = 0);
    for (let l = o; l < n; l++)
      e[l] = 0;
    Y(s, n - 8, BigInt(this.length * 8), i), this.process(s, 0);
    const c = P(t), a = this.outputLen;
    if (a % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const h = a / 4, f = this.get();
    if (h > f.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let l = 0; l < h; l++)
      c.setUint32(4 * l, f[l], i);
  }
  digest() {
    const { buffer: t, outputLen: e } = this;
    this.digestInto(t);
    const s = t.slice(0, e);
    return this.destroy(), s;
  }
  _cloneInto(t) {
    t || (t = new this.constructor()), t.set(...this.get());
    const { blockLen: e, buffer: s, length: n, finished: i, destroyed: o, pos: c } = this;
    return t.destroyed = o, t.finished = i, t.length = n, t.pos = c, n % e && t.buffer.set(s), t;
  }
  clone() {
    return this._cloneInto();
  }
}
const m = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), y = /* @__PURE__ */ BigInt(2 ** 32 - 1), T = /* @__PURE__ */ BigInt(32);
function rt(r, t = !1) {
  return t ? { h: Number(r & y), l: Number(r >> T & y) } : { h: Number(r >> T & y) | 0, l: Number(r & y) | 0 };
}
function st(r, t = !1) {
  const e = r.length;
  let s = new Uint32Array(e), n = new Uint32Array(e);
  for (let i = 0; i < e; i++) {
    const { h: o, l: c } = rt(r[i], t);
    [s[i], n[i]] = [o, c];
  }
  return [s, n];
}
const ot = (r, t, e) => r << e | t >>> 32 - e, nt = (r, t, e) => t << e | r >>> 32 - e, it = (r, t, e) => t << e - 32 | r >>> 64 - e, ct = (r, t, e) => r << e - 32 | t >>> 64 - e, at = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]), w = /* @__PURE__ */ new Uint32Array(64);
class lt extends et {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = m[0] | 0, this.B = m[1] | 0, this.C = m[2] | 0, this.D = m[3] | 0, this.E = m[4] | 0, this.F = m[5] | 0, this.G = m[6] | 0, this.H = m[7] | 0;
  }
  get() {
    const { A: t, B: e, C: s, D: n, E: i, F: o, G: c, H: a } = this;
    return [t, e, s, n, i, o, c, a];
  }
  // prettier-ignore
  set(t, e, s, n, i, o, c, a) {
    this.A = t | 0, this.B = e | 0, this.C = s | 0, this.D = n | 0, this.E = i | 0, this.F = o | 0, this.G = c | 0, this.H = a | 0;
  }
  process(t, e) {
    for (let l = 0; l < 16; l++, e += 4)
      w[l] = t.getUint32(e, !1);
    for (let l = 16; l < 64; l++) {
      const d = w[l - 15], u = w[l - 2], L = g(d, 7) ^ g(d, 18) ^ d >>> 3, I = g(u, 17) ^ g(u, 19) ^ u >>> 10;
      w[l] = I + w[l - 7] + L + w[l - 16] | 0;
    }
    let { A: s, B: n, C: i, D: o, E: c, F: a, G: h, H: f } = this;
    for (let l = 0; l < 64; l++) {
      const d = g(c, 6) ^ g(c, 11) ^ g(c, 25), u = f + d + Z(c, a, h) + at[l] + w[l] | 0, I = (g(s, 2) ^ g(s, 13) ^ g(s, 22)) + tt(s, n, i) | 0;
      f = h, h = a, a = c, c = o + u | 0, o = i, i = n, n = s, s = u + I | 0;
    }
    s = s + this.A | 0, n = n + this.B | 0, i = i + this.C | 0, o = o + this.D | 0, c = c + this.E | 0, a = a + this.F | 0, h = h + this.G | 0, f = f + this.H | 0, this.set(s, n, i, o, c, a, h, f);
  }
  roundClean() {
    x(w);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), x(this.buffer);
  }
}
const ht = /* @__PURE__ */ N(() => new lt()), B = ht, ft = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  sha256: B
}, Symbol.toStringTag, { value: "Module" })), ut = BigInt(0), v = BigInt(1), dt = BigInt(2), gt = BigInt(7), mt = BigInt(256), wt = BigInt(113), O = [], V = [], M = [];
for (let r = 0, t = v, e = 1, s = 0; r < 24; r++) {
  [e, s] = [s, (2 * e + 3 * s) % 5], O.push(2 * (5 * s + e)), V.push((r + 1) * (r + 2) / 2 % 64);
  let n = ut;
  for (let i = 0; i < 7; i++)
    t = (t << v ^ (t >> gt) * wt) % mt, t & dt && (n ^= v << (v << /* @__PURE__ */ BigInt(i)) - v);
  M.push(n);
}
const q = st(M, !0), bt = q[0], vt = q[1], D = (r, t, e) => e > 32 ? it(r, t, e) : ot(r, t, e), S = (r, t, e) => e > 32 ? ct(r, t, e) : nt(r, t, e);
function j(r, t = 24) {
  const e = new Uint32Array(10);
  for (let s = 24 - t; s < 24; s++) {
    for (let o = 0; o < 10; o++)
      e[o] = r[o] ^ r[o + 10] ^ r[o + 20] ^ r[o + 30] ^ r[o + 40];
    for (let o = 0; o < 10; o += 2) {
      const c = (o + 8) % 10, a = (o + 2) % 10, h = e[a], f = e[a + 1], l = D(h, f, 1) ^ e[c], d = S(h, f, 1) ^ e[c + 1];
      for (let u = 0; u < 50; u += 10)
        r[o + u] ^= l, r[o + u + 1] ^= d;
    }
    let n = r[2], i = r[3];
    for (let o = 0; o < 24; o++) {
      const c = V[o], a = D(n, i, c), h = S(n, i, c), f = O[o];
      n = r[f], i = r[f + 1], r[f] = a, r[f + 1] = h;
    }
    for (let o = 0; o < 50; o += 10) {
      for (let c = 0; c < 10; c++)
        e[c] = r[o + c];
      for (let c = 0; c < 10; c++)
        r[o + c] ^= ~e[(c + 2) % 10] & e[(c + 4) % 10];
    }
    r[0] ^= bt[s], r[1] ^= vt[s];
  }
  x(e);
}
class A extends R {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(t, e, s, n = !1, i = 24) {
    if (super(), this.pos = 0, this.posOut = 0, this.finished = !1, this.destroyed = !1, this.enableXOF = !1, this.blockLen = t, this.suffix = e, this.outputLen = s, this.enableXOF = n, this.rounds = i, H(s), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = W(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    C(this.state32), j(this.state32, this.rounds), C(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    k(this), t = F(t), p(t);
    const { blockLen: e, state: s } = this, n = t.length;
    for (let i = 0; i < n; ) {
      const o = Math.min(e - this.pos, n - i);
      for (let c = 0; c < o; c++)
        s[this.pos++] ^= t[i++];
      this.pos === e && this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = !0;
    const { state: t, suffix: e, pos: s, blockLen: n } = this;
    t[s] ^= e, (e & 128) !== 0 && s === n - 1 && this.keccak(), t[n - 1] ^= 128, this.keccak();
  }
  writeInto(t) {
    k(this, !1), p(t), this.finish();
    const e = this.state, { blockLen: s } = this;
    for (let n = 0, i = t.length; n < i; ) {
      this.posOut >= s && this.keccak();
      const o = Math.min(s - this.posOut, i - n);
      t.set(e.subarray(this.posOut, this.posOut + o), n), this.posOut += o, n += o;
    }
    return t;
  }
  xofInto(t) {
    if (!this.enableXOF)
      throw new Error("XOF is not possible for this instance");
    return this.writeInto(t);
  }
  xof(t) {
    return H(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (U(t, this), this.finished)
      throw new Error("digest() was already called");
    return this.writeInto(t), this.destroy(), t;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = !0, x(this.state);
  }
  _cloneInto(t) {
    const { blockLen: e, suffix: s, outputLen: n, rounds: i, enableXOF: o } = this;
    return t || (t = new A(e, s, n, o, i)), t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = i, t.suffix = s, t.outputLen = n, t.enableXOF = o, t.destroyed = this.destroyed, t;
  }
}
const pt = (r, t, e) => N(() => new A(t, r, e)), E = pt(1, 136, 256 / 8), xt = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  Keccak: A,
  keccakP: j,
  keccak_256: E
}, Symbol.toStringTag, { value: "Module" }));
class G {
  constructor(t = "sha256") {
    this.hashFunction = t;
  }
  /**
   * Create a deterministic commitment hash from escrow parameters
   */
  create(t) {
    const e = [
      t.escrowId,
      t.escrowTxHash.toLowerCase(),
      t.taskerAddress.toLowerCase(),
      t.taskeeAddress.toLowerCase()
    ].join("|"), s = this.hash(e);
    return Buffer.from(s).toString("hex");
  }
  /**
   * Validate commitment format
   */
  validate(t) {
    return typeof t != "string" ? !1 : /^[0-9a-f]{64}$/i.test(t);
  }
  /**
   * Hash data using configured hash function
   */
  hash(t) {
    const s = new TextEncoder().encode(t);
    switch (this.hashFunction) {
      case "sha256":
        return B(s);
      case "keccak256":
        return E(s);
      default:
        throw new Error(`Unsupported hash function: ${this.hashFunction}`);
    }
  }
  /**
   * Set hash function
   */
  setHashFunction(t) {
    this.hashFunction = t;
  }
}
class _ {
  constructor(t, e = "sha256") {
    this.blockchainProvider = t, this.hashFunction = e, this.commitmentGenerator = new G(e);
  }
  /**
   * Build Merkle tree from blockchain events
   */
  async build(t = {}) {
    const e = await this.blockchainProvider.queryEscrowCreatedEvents({
      fromBlock: t.fromBlock,
      toBlock: t.toBlock
    }), s = await this.blockchainProvider.queryEscrowResolvedEvents({
      fromBlock: t.fromBlock,
      toBlock: t.toBlock
    }), n = await this.createCommitmentsFromEvents(
      e,
      s
    ), o = this.buildTree(n).getHexRoot();
    return {
      root: o,
      commitmentCount: n.length,
      builtAt: Date.now(),
      version: this.generateVersion(o, n.length)
    };
  }
  /**
   * Build tree incrementally from existing tree + new events
   */
  async buildIncremental(t, e, s = {}) {
    const n = await this.blockchainProvider.queryEscrowResolvedEvents({
      fromBlock: s.fromBlock,
      toBlock: s.toBlock
    });
    if (n.length === 0)
      return {
        root: t,
        commitmentCount: e,
        builtAt: Date.now(),
        version: this.generateVersion(t, e)
      };
    const i = new Set(n.map((a) => a.escrowId)), c = (await this.blockchainProvider.queryEscrowCreatedEvents({
      fromBlock: s.fromBlock,
      toBlock: s.toBlock
    })).filter(
      (a) => i.has(a.escrowId)
    );
    return await this.createCommitmentsFromEvents(
      c,
      n
    ), this.build(s);
  }
  /**
   * Get Merkle proof for a commitment
   */
  getProof(t, e) {
    const s = Buffer.from(e, "hex"), n = t.getProof(s), i = n.map((c) => c.data.toString("hex")), o = n.map((c) => c.position === "right");
    return {
      root: t.getHexRoot(),
      leaf: e,
      proof: i,
      proofFlags: o
    };
  }
  /**
   * Create commitments from escrow events
   */
  async createCommitmentsFromEvents(t, e) {
    const s = /* @__PURE__ */ new Map();
    t.forEach((i) => {
      s.set(i.escrowId, i);
    });
    const n = [];
    for (const i of e) {
      const o = s.get(i.escrowId);
      if (!o)
        continue;
      const c = await this.blockchainProvider.getTransactionReceipt(
        i.transactionHash
      );
      if (!c || !c.status)
        continue;
      const a = this.commitmentGenerator.create({
        escrowId: i.escrowId,
        escrowTxHash: i.transactionHash,
        taskerAddress: o.client,
        taskeeAddress: o.freelancer
      });
      n.push(a);
    }
    return n.sort();
  }
  /**
   * Build Merkle tree from commitments
   */
  buildTree(t) {
    if (t.length === 0)
      throw new Error("Cannot build tree with no commitments");
    const e = t.map((i) => Buffer.from(i, "hex")), s = (i) => {
      const o = this.hash(i);
      return Buffer.from(o);
    };
    return new $(e, s, {
      sortPairs: !0,
      hashLeaves: !1
      // Commitments are already hashes
    });
  }
  /**
   * Hash data using configured hash function
   */
  hash(t) {
    const e = t instanceof Buffer ? new Uint8Array(t) : t;
    switch (this.hashFunction) {
      case "sha256":
        return B(e);
      case "keccak256":
        return E(e);
      default:
        throw new Error(`Unsupported hash function: ${this.hashFunction}`);
    }
  }
  /**
   * Generate version identifier for tree
   */
  generateVersion(t, e) {
    return `${t.substring(0, 16)}-${e}-${Date.now()}`;
  }
}
class yt {
  constructor(t = "sha256") {
    this.hashFunction = t;
  }
  /**
   * Verify a single review's Merkle proof
   */
  verify(t, e) {
    const { merkleProof: s, commitment: n } = t;
    return this.isValidHex(n, 64) ? this.validateProofStructure(s) ? s.leaf.toLowerCase() !== n.toLowerCase() ? {
      valid: !1,
      error: "Proof leaf does not match commitment",
      details: {
        commitmentExists: !1,
        proofValid: !1,
        rootMatches: !1
      }
    } : this.verifyProof(s).toLowerCase() === e.toLowerCase() ? {
      valid: !0,
      details: {
        commitmentExists: !0,
        proofValid: !0,
        rootMatches: !0
      }
    } : {
      valid: !1,
      error: "Computed root does not match expected root",
      details: {
        commitmentExists: !0,
        proofValid: !1,
        rootMatches: !1
      }
    } : {
      valid: !1,
      error: "Invalid proof structure",
      details: {
        commitmentExists: !1,
        proofValid: !1,
        rootMatches: !1
      }
    } : {
      valid: !1,
      error: "Invalid commitment format",
      details: {
        commitmentExists: !1,
        proofValid: !1,
        rootMatches: !1
      }
    };
  }
  /**
   * Verify multiple reviews in batch
   */
  verifyBatch(t, e) {
    const s = Date.now(), n = t.map((c, a) => {
      const h = this.verify(c, e);
      return {
        reviewId: c.commitment || `review-${a}`,
        result: h
      };
    }), i = n.filter((c) => c.result.valid).length, o = n.length - i;
    return {
      total: t.length,
      valid: i,
      invalid: o,
      results: n,
      verificationTime: Date.now() - s
    };
  }
  /**
   * Verify Merkle proof and compute root
   */
  verifyProof(t) {
    let e = Buffer.from(t.leaf, "hex");
    for (let s = 0; s < t.proof.length; s++) {
      const n = Buffer.from(t.proof[s], "hex"), o = t.proofFlags[s] ? Buffer.concat([e, n]) : Buffer.concat([n, e]);
      e = Buffer.from(this.hash(o));
    }
    return "0x" + e.toString("hex");
  }
  /**
   * Validate proof structure
   */
  validateProofStructure(t) {
    if (t.proof.length !== t.proofFlags.length || !this.isValidHex(t.leaf, 64) || !this.isValidHex(t.root.replace(/^0x/, ""), 64))
      return !1;
    for (const e of t.proof)
      if (!this.isValidHex(e, 64))
        return !1;
    return !0;
  }
  /**
   * Check if string is valid hex of specified length
   */
  isValidHex(t, e) {
    const s = /^[0-9a-fA-F]+$/, n = t.replace(/^0x/, "");
    return s.test(n) && n.length === e;
  }
  /**
   * Hash data using configured hash function
   */
  hash(t) {
    const e = t instanceof Buffer ? new Uint8Array(t) : t;
    switch (this.hashFunction) {
      case "sha256":
        return B(e);
      case "keccak256":
        return E(e);
      default:
        throw new Error(`Unsupported hash function: ${this.hashFunction}`);
    }
  }
  /**
   * Set hash function
   */
  setHashFunction(t) {
    this.hashFunction = t;
  }
}
class Bt {
  constructor(t) {
    this.contract = t.contract, this.provider = t.provider;
  }
  /**
   * Get escrow details by ID
   */
  async getEscrow(t) {
    try {
      const e = await this.contract.getEscrow(t), n = {
        0: b.Funded,
        1: b.InDispute,
        2: b.DisputeResolved,
        3: b.DisputeUnresolved,
        4: b.Completed,
        5: b.Cancelled
      }[e.state] || b.Funded, i = await this.provider.getBlock("latest"), o = i ? i.timestamp * 1e3 : Date.now();
      return {
        id: t,
        client: e.client.toLowerCase(),
        freelancer: e.freelancer.toLowerCase(),
        status: n,
        amount: e.amount.toString(),
        createdAt: o
      };
    } catch (e) {
      return console.error("Failed to get escrow:", e), null;
    }
  }
  /**
   * Query escrow creation events
   */
  async queryEscrowCreatedEvents(t) {
    try {
      const e = this.contract.filters.EscrowCreated(
        null,
        // escrowId
        t.client,
        t.freelancer
      ), s = await this.contract.queryFilter(
        e,
        t.fromBlock,
        t.toBlock
      ), n = [];
      for (const i of s) {
        const o = i;
        if (o.args) {
          const c = o.getBlock ? await o.getBlock() : null, a = o.args[0]?.toString() || "", h = o.args[1]?.toLowerCase() || "", f = o.args[2]?.toLowerCase() || "", l = o.args[3]?.toString() || "0";
          n.push({
            escrowId: a,
            transactionHash: o.transactionHash || o.hash || "",
            blockNumber: o.blockNumber || 0,
            timestamp: c ? c.timestamp * 1e3 : Date.now(),
            client: h,
            freelancer: f,
            amount: l,
            type: "EscrowCreated"
          });
        }
      }
      return n;
    } catch (e) {
      return console.error("Failed to query EscrowCreated events:", e), [];
    }
  }
  /**
   * Query escrow resolution events
   */
  async queryEscrowResolvedEvents(t) {
    try {
      const e = this.contract.filters.EscrowResolved(
        t.escrowId || null,
        null,
        // client
        null
        // freelancer
      ), s = await this.contract.queryFilter(
        e,
        t.fromBlock,
        t.toBlock
      ), n = [];
      for (const i of s) {
        const o = i;
        if (o.args) {
          const c = o.getBlock ? await o.getBlock() : null, a = o.args[0]?.toString() || "", h = o.args[1]?.toLowerCase() || "", f = o.args[2]?.toLowerCase() || "", l = o.args[3]?.toString() || "0", d = o.args[4]?.toString() || "0", u = o.args[5]?.toString() || "0";
          n.push({
            escrowId: a,
            transactionHash: o.transactionHash || o.hash || "",
            blockNumber: o.blockNumber || 0,
            timestamp: c ? c.timestamp * 1e3 : Date.now(),
            client: h,
            freelancer: f,
            amount: l,
            freelancerAmount: d,
            platformFee: u,
            type: "EscrowResolved"
          });
        }
      }
      return n;
    } catch (e) {
      return console.error("Failed to query EscrowResolved events:", e), [];
    }
  }
  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(t) {
    try {
      const e = await this.provider.getTransactionReceipt(t);
      if (!e)
        return null;
      const s = await e.getBlock();
      return {
        hash: e.hash,
        blockNumber: e.blockNumber,
        timestamp: s ? s.timestamp * 1e3 : Date.now(),
        status: e.status === 1,
        events: [...e.logs]
      };
    } catch (e) {
      return console.error("Failed to get transaction receipt:", e), null;
    }
  }
}
class At {
  constructor(t = "merkle-review-sdk", e = "trees") {
    this.db = null, this.dbName = t, this.storeName = e;
  }
  /**
   * Initialize IndexedDB database
   */
  async initDB() {
    return this.db ? this.db : new Promise((t, e) => {
      const s = indexedDB.open(this.dbName, 1);
      s.onerror = () => {
        e(new Error("Failed to open IndexedDB"));
      }, s.onsuccess = () => {
        this.db = s.result, t(s.result);
      }, s.onupgradeneeded = (n) => {
        const i = n.target.result;
        if (!i.objectStoreNames.contains(this.storeName)) {
          const o = i.createObjectStore(this.storeName, { keyPath: "root" });
          o.createIndex("version", "metadata.version", { unique: !1 }), o.createIndex("builtAt", "metadata.builtAt", { unique: !1 });
        }
      };
    });
  }
  /**
   * Store Merkle tree data
   */
  async storeTree(t) {
    try {
      const i = (await this.initDB()).transaction([this.storeName], "readwrite").objectStore(this.storeName).put(t);
      return new Promise((o, c) => {
        i.onsuccess = () => {
          o({
            success: !0,
            location: t.root
          });
        }, i.onerror = () => {
          c(new Error("Failed to store tree data"));
        };
      });
    } catch (e) {
      return {
        success: !1,
        error: e instanceof Error ? e.message : "Unknown error"
      };
    }
  }
  /**
   * Retrieve Merkle tree data by root or version
   */
  async retrieveTree(t) {
    try {
      const n = (await this.initDB()).transaction([this.storeName], "readonly").objectStore(this.storeName);
      let i = n.get(t);
      return await new Promise((c, a) => {
        i.onsuccess = () => {
          const h = i.result;
          if (h)
            c(h);
          else {
            const l = n.index("version").get(t);
            l.onsuccess = () => {
              const d = l.result;
              c(d || null);
            }, l.onerror = () => a(new Error("Failed to query version"));
          }
        }, i.onerror = () => a(new Error("Failed to retrieve tree data"));
      });
    } catch (e) {
      return console.error("Failed to retrieve tree:", e), null;
    }
  }
  /**
   * Get latest tree version
   */
  async getLatestVersion() {
    try {
      const i = (await this.initDB()).transaction([this.storeName], "readonly").objectStore(this.storeName).index("builtAt").openCursor(null, "prev");
      return new Promise((o, c) => {
        i.onsuccess = () => {
          const a = i.result;
          if (a) {
            const h = a.value;
            o(h.metadata.version);
          } else
            o(null);
        }, i.onerror = () => c(new Error("Failed to get latest version"));
      });
    } catch (t) {
      return console.error("Failed to get latest version:", t), null;
    }
  }
  /**
   * Check if storage is available
   */
  async isAvailable() {
    try {
      return typeof indexedDB > "u" ? !1 : (await this.initDB(), !0);
    } catch {
      return !1;
    }
  }
  /**
   * Clear all stored trees
   */
  async clear() {
    try {
      await (await this.initDB()).transaction([this.storeName], "readwrite").objectStore(this.storeName).clear();
    } catch (t) {
      console.error("Failed to clear storage:", t);
    }
  }
}
class Et {
  constructor(t) {
    this.config = t;
    const e = t.hashFunction || "sha256";
    this.commitmentGenerator = new G(e), this.treeBuilder = new _(t.blockchainProvider, e), this.reviewVerifier = new yt(e);
  }
  /**
   * Create a commitment from escrow parameters
   */
  createCommitment(t) {
    return this.commitmentGenerator.create(t);
  }
  /**
   * Validate commitment format
   */
  validateCommitment(t) {
    return this.commitmentGenerator.validate(t);
  }
  /**
   * Build Merkle tree from blockchain events
   */
  async buildTree(t = {}) {
    return this.treeBuilder.build(t);
  }
  /**
   * Build tree incrementally from existing tree + new events
   */
  async buildTreeIncremental(t, e, s = {}) {
    return this.treeBuilder.buildIncremental(t, e, s);
  }
  /**
   * Get Merkle proof for a commitment
   * Note: This requires the tree to be built first
   */
  async getProof(t, e) {
    if (e) {
      const { MerkleTree: s } = await import("merkletreejs"), { sha256: n } = await Promise.resolve().then(() => ft), { keccak_256: i } = await Promise.resolve().then(() => xt), o = this.config.hashFunction === "keccak256" ? i : n, c = e.commitments.map((h) => Buffer.from(h, "hex")), a = new s(
        c,
        (h) => Buffer.from(o(new Uint8Array(h))),
        {
          sortPairs: !0,
          hashLeaves: !1
        }
      );
      return this.treeBuilder.getProof(a, t);
    }
    if (this.config.storageProviders && this.config.storageProviders.length > 0) {
      const s = await this.config.storageProviders[0].getLatestVersion();
      if (s) {
        const n = await this.config.storageProviders[0].retrieveTree(s);
        if (n)
          return this.getProof(t, n);
      }
    }
    return null;
  }
  /**
   * Verify a single review
   */
  verifyReview(t, e) {
    return this.reviewVerifier.verify(t, e);
  }
  /**
   * Verify multiple reviews in batch
   */
  verifyBatch(t, e) {
    return this.reviewVerifier.verifyBatch(t, e);
  }
  /**
   * Store Merkle tree data using configured storage providers
   */
  async storeTree(t) {
    if (!this.config.storageProviders || this.config.storageProviders.length === 0)
      return {
        success: !1,
        error: "No storage providers configured"
      };
    for (const e of this.config.storageProviders)
      if (await e.isAvailable()) {
        const n = await e.storeTree(t);
        if (n.success)
          return n;
      }
    return {
      success: !1,
      error: "All storage providers failed or are unavailable"
    };
  }
  /**
   * Retrieve Merkle tree data
   */
  async retrieveTree(t) {
    if (!this.config.storageProviders || this.config.storageProviders.length === 0)
      return null;
    for (const e of this.config.storageProviders)
      if (await e.isAvailable()) {
        const n = await e.retrieveTree(t);
        if (n)
          return n;
      }
    return null;
  }
  /**
   * Get latest tree version
   */
  async getLatestVersion() {
    if (!this.config.storageProviders || this.config.storageProviders.length === 0)
      return null;
    for (const t of this.config.storageProviders)
      if (await t.isAvailable()) {
        const s = await t.getLatestVersion();
        if (s)
          return s;
      }
    return null;
  }
  /**
   * Build and store tree in one operation
   */
  async buildAndStoreTree(t = {}) {
    const e = await this.buildTree(t), s = {
      root: e.root,
      commitments: [],
      // Would be populated from builder's internal state
      metadata: {
        version: e.version,
        builtAt: e.builtAt,
        commitmentCount: e.commitmentCount
      }
    }, n = await this.storeTree(s);
    return {
      treeResult: e,
      storageResult: n
    };
  }
  /**
   * Verify review with automatic root retrieval
   */
  async verifyReviewWithRoot(t, e) {
    let s;
    if (e) {
      const n = await this.retrieveTree(e);
      n ? s = n.root : s = e;
    } else
      s = t.merkleProof.root;
    return this.verifyReview(t, s);
  }
  /**
   * Get blockchain provider (for direct access if needed)
   */
  getBlockchainProvider() {
    return this.config.blockchainProvider;
  }
  /**
   * Get storage providers (for direct access if needed)
   */
  getStorageProviders() {
    return this.config.storageProviders || [];
  }
  /**
   * Update hash function for all components
   */
  setHashFunction(t) {
    this.commitmentGenerator.setHashFunction(t), this.reviewVerifier.setHashFunction(t), this.treeBuilder = new _(
      this.config.blockchainProvider,
      t
    );
  }
}
export {
  G as CommitmentGenerator,
  b as EscrowStatus,
  Bt as EthersBlockchainProvider,
  At as LocalStorageProvider,
  Et as MerkleReviewSDK,
  _ as MerkleTreeBuilder,
  yt as ReviewVerifier
};
//# sourceMappingURL=index.js.map
