/**
 * ESM surface for bitcoinjs-lib v6. The Vite shim importer resolves
 * `bitcoinjs-lib` to the real CJS package so this file cannot alias-loop.
 */
import * as raw from 'bitcoinjs-lib';

type BitcoinjsLib = typeof import('bitcoinjs-lib');

const bitcoin = ((raw as { default?: BitcoinjsLib }).default ?? raw) as BitcoinjsLib;

export const Psbt = bitcoin.Psbt;
export const payments = bitcoin.payments;
export const script = bitcoin.script;
export const crypto = bitcoin.crypto;
export const initEccLib = bitcoin.initEccLib;
export const address = bitcoin.address;
export const networks = bitcoin.networks;
export const Transaction = bitcoin.Transaction;
export const Block = bitcoin.Block;

export default bitcoin;
