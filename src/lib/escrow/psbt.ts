import '$lib/polyfills';
import * as liquidjs from 'liquidjs-lib';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { Psbt } from 'liquidjs-lib/src/psbt';
import type { NetworkName } from './types';

bitcoin.initEccLib(ecc);

const { networks, payments } = liquidjs;

export interface UtxoRef {
	txid: string;
	vout: number;
}

export interface WitnessUtxoData {
	script: Buffer;
	value: Buffer;
	asset: Buffer;
	nonce: Buffer;
}

export function networkFor(name: NetworkName) {
	return name === 'liquid' ? networks.liquid : networks.testnet;
}

export function getAssetIdHex(networkName: NetworkName): string {
	const net = networkFor(networkName) as unknown as { assetHash: string };
	return net.assetHash;
}

export async function getUtxos(address: string): Promise<
	{
		txid: string;
		vout: number;
		value: number;
		asset: string;
		status: { confirmed: boolean };
	}[]
> {
	const isTestnet = address.startsWith('tex1');
	const baseUrl = isTestnet
		? 'https://blockstream.info/liquidtestnet/api'
		: 'https://blockstream.info/liquid/api';
	const res = await fetch(`${baseUrl}/address/${address}/utxo`);
	if (!res.ok) throw new Error(`Failed to fetch UTXOs ${res.status}`);
	type ApiUtxo = {
		txid: string;
		vout: number;
		value: number;
		asset: string;
		status: { confirmed: boolean };
	};
	const utxos = (await res.json()) as ApiUtxo[];
	return utxos.filter((u) => u.status?.confirmed);
}

export async function fetchOutputData(
	txid: string,
	vout: number,
	networkName: NetworkName
): Promise<WitnessUtxoData> {
	const baseUrl =
		networkName === 'liquid'
			? 'https://blockstream.info/liquid/api'
			: 'https://blockstream.info/liquidtestnet/api';
	const resp = await fetch(`${baseUrl}/tx/${txid}/hex`);
	if (!resp.ok) throw new Error(`Failed to fetch raw tx hex ${txid}`);
	const hex = await resp.text();
	const tx = liquidjs.Transaction.fromHex(hex);
	const out = tx.outs[vout];
	return {
		script: out.script,
		value: out.value,
		asset: out.asset,
		nonce: out.nonce
	};
}

export function addressToScript(
	address: string,
	network: typeof networks.liquid | typeof networks.testnet | undefined
): Buffer {
	const p2wpkh = payments.p2wpkh({ address, network })?.output;
	if (p2wpkh) return p2wpkh;
	const p2wsh = payments.p2wsh({ address, network })?.output;
	if (p2wsh) return p2wsh;
	throw new Error('Unsupported address type');
}

function toUnconfValueBuffer(valueSat: number): Buffer {
	const buf = Buffer.alloc(9);
	buf.writeUInt8(0x01, 0);
	buf.writeBigUInt64BE(BigInt(valueSat), 1);
	return buf;
}

function toUnconfAssetBuffer(assetIdHex: string): Buffer {
	return Buffer.concat([Buffer.from([0x01]), Buffer.from(assetIdHex, 'hex').reverse()]);
}

export interface BuildSpendParams {
	network: NetworkName;
	inputs: Array<{
		utxo: UtxoRef;
		witnessUtxo: WitnessUtxoData;
		witnessScriptHex: string;
		sequence?: number; // CSV blocks if any
	}>;
	outputs: Array<{ address: string; valueSat: number; assetIdHex: string }>;
	feeSat: number;
	changeAddress?: string; // return change back to the same vault
}

export function buildSpendPsbt(params: BuildSpendParams) {
	const network = networkFor(params.network);
	const psbt = new Psbt({ network });

	let totalIn = 0;
	let assetIdHex: string | null = null;

	for (const inp of params.inputs) {
		psbt.addInput({
			hash: inp.utxo.txid,
			index: inp.utxo.vout,
			witnessUtxo: inp.witnessUtxo,
			witnessScript: Buffer.from(inp.witnessScriptHex, 'hex'),
			sequence: inp.sequence
		});
		// Extract amount/asset for aggregation
		const value = inp.witnessUtxo.value.readBigUInt64BE(1);
		totalIn += Number(value);
		const assetHex = Buffer.from(inp.witnessUtxo.asset.slice(1)).reverse().toString('hex');
		if (!assetIdHex) assetIdHex = assetHex;
		else if (assetIdHex !== assetHex) throw new Error('Mixed assets unsupported in this helper');
	}

	if (!assetIdHex) throw new Error('No inputs');

	// Add destination outputs
	for (const out of params.outputs) {
		const script = addressToScript(out.address, network);
		psbt.addOutput({
			script,
			value: toUnconfValueBuffer(out.valueSat),
			asset: toUnconfAssetBuffer(out.assetIdHex),
			nonce: Buffer.from([0x00])
		});
	}

	// Calculate change
	const totalOut = params.outputs.reduce((a, b) => a + b.valueSat, 0) + params.feeSat;
	const change = totalIn - totalOut;
	if (change < 0) throw new Error('Insufficient input value');

	if (change > 0 && params.changeAddress) {
		const changeScript = addressToScript(params.changeAddress, network);
		psbt.addOutput({
			script: changeScript,
			value: toUnconfValueBuffer(change),
			asset: toUnconfAssetBuffer(assetIdHex),
			nonce: Buffer.from([0x00])
		});
	}

	// Explicit fee output
	psbt.addOutput({
		script: Buffer.alloc(0),
		value: toUnconfValueBuffer(params.feeSat),
		asset: toUnconfAssetBuffer(assetIdHex),
		nonce: Buffer.from([0x00])
	});

	return psbt;
}
