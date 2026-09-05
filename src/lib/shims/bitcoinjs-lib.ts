/**
 * CJS-to-ESM shim for bitcoinjs-lib.
 */
import * as _btc from 'bitcoinjs-lib/src/index.js';

const mod = _btc.default ?? _btc;

export const Psbt = mod.Psbt;
export const payments = mod.payments;
export const script = mod.script;
export const crypto = mod.crypto;
export const initEccLib = mod.initEccLib;
export const address = mod.address;
export const networks = mod.networks;
export const Transaction = mod.Transaction;
export const Block = mod.Block;

export default mod;
