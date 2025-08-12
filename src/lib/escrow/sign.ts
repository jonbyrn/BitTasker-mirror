import { Psbt } from 'liquidjs-lib/src/psbt';
import * as liquidjs from 'liquidjs-lib';
import * as bitcoin from 'bitcoinjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

function toBufferSigner(kp: any) {
	const patched = Object.assign({}, kp);
	patched.sign = function (...args: any[]) {
		const result = kp.sign.apply(kp, args);
		return Buffer.from(result);
	};
	patched.publicKey = Buffer.from(kp.publicKey);
	return patched as any;
}

function serializeWitness(stack: Buffer[]): Buffer {
	const parts: Buffer[] = [Buffer.from([stack.length])];
	for (const item of stack) {
		parts.push(Buffer.from([item.length]));
		parts.push(item);
	}
	return Buffer.concat(parts);
}

export function signCsvPrivilegedPsbt(
	psbtB64: string,
	privilegedPrivKeyHex: string
): { psbt: Psbt; hex: string } {
	const psbt = Psbt.fromBase64(psbtB64);
	const keyPair = ECPair.fromPrivateKey(Buffer.from(privilegedPrivKeyHex, 'hex'), {
		compressed: true
	});
	const signer = toBufferSigner(keyPair);
	for (let i = 0; i < psbt.inputCount; i++) psbt.signInput(i, signer);
	// Normalize signature buffers
	psbt.data.inputs.forEach((inp) => {
		if (inp.partialSig) {
			inp.partialSig = inp.partialSig.map((p) => ({
				pubkey: p.pubkey,
				signature: Buffer.isBuffer(p.signature) ? p.signature : Buffer.from(p.signature)
			}));
		}
	});
	// Finalize using miniscript CSV path: [ empty , sigA , witnessScript ]
	psbt.finalizeAllInputs((_idx, input) => {
		const sig = input.partialSig?.[0]?.signature;
		if (!sig || !input.witnessScript) throw new Error('Missing privileged signature or witness');
		const stack = [Buffer.alloc(0), sig, input.witnessScript];
		return { finalScriptWitness: serializeWitness(stack), finalScriptSig: undefined };
	});
	const tx = psbt.extractTransaction();
	return { psbt, hex: tx.toHex() };
}

export function signTwoKeyPsbt(
	psbtB64: string,
	privAHex: string,
	privBHex: string
): { psbt: Psbt; hex: string } {
	const psbt = Psbt.fromBase64(psbtB64);
	const keyA = ECPair.fromPrivateKey(Buffer.from(privAHex, 'hex'), { compressed: true });
	const keyB = ECPair.fromPrivateKey(Buffer.from(privBHex, 'hex'), { compressed: true });
	keyA.lowR = true;
	keyB.lowR = true;
	const signerA = toBufferSigner(keyA);
	const signerB = toBufferSigner(keyB);
	for (let i = 0; i < psbt.inputCount; i++) {
		psbt.signInput(i, signerA);
		psbt.signInput(i, signerB);
	}
	psbt.data.inputs.forEach((inp) => {
		if (inp.partialSig) {
			inp.partialSig = inp.partialSig.map((p) => ({
				pubkey: p.pubkey,
				signature: Buffer.isBuffer(p.signature) ? p.signature : Buffer.from(p.signature)
			}));
		}
	});
	// 2-of-2 miniscript path: [ sigB, sigA, witnessScript ]
	for (let i = 0; i < psbt.inputCount; i++) {
		psbt.finalizeInput(i, (_idx, input) => {
			if (!input.witnessScript || !input.partialSig) throw new Error('Missing witness or sigs');
			const sigA = input.partialSig[0]?.signature;
			const sigB = input.partialSig[1]?.signature;
			if (!sigA || !sigB) throw new Error('Both signatures required');
			const stack = [sigB, sigA, input.witnessScript];
			return { finalScriptWitness: serializeWitness(stack), finalScriptSig: undefined };
		});
	}
	const tx = psbt.extractTransaction();
	return { psbt, hex: tx.toHex() };
}
