/**
 * ESM surface for bitcoinjs-lib v6 (CJS). Vite cannot named-import `Psbt`
 * from `src/index.js`; this shim re-exports from the CJS interop module.
 */
import bitcoinjsCjs from './bitcoinjs-cjs.cjs';

type BitcoinjsLib = typeof import('bitcoinjs-lib');

const bitcoinjs = ((bitcoinjsCjs as { default?: BitcoinjsLib }).default ??
	bitcoinjsCjs) as BitcoinjsLib;

export const Psbt = bitcoinjs.Psbt;
export const payments = bitcoinjs.payments;
export const script = bitcoinjs.script;
export const crypto = bitcoinjs.crypto;
export const initEccLib = bitcoinjs.initEccLib;
export const address = bitcoinjs.address;
export const networks = bitcoinjs.networks;
export const Transaction = bitcoinjs.Transaction;
export const Block = bitcoinjs.Block;

export default bitcoinjs;
