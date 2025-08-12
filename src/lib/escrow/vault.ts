import type { NetworkName, VaultCreateInput, VaultInfo } from './types';

// Build policy expression for miniscript
export function buildPolicyExpression(csvBlocks: number): string {
	if (!Number.isInteger(csvBlocks) || csvBlocks < 1) {
		throw new Error('csvBlocks must be a positive integer');
	}
	return `and(pk(A),or(pk(B),older(${csvBlocks})))`;
}

// Resolve A/B placeholders
export function resolvePolicyToMiniscript(params: {
	policyExpression: string;
	clientPubkey: string; // A
	freelancerPubkey: string; // B
}): string {
	let miniscript = params.policyExpression;
	miniscript = miniscript.replace(/\bA\b/g, params.clientPubkey);
	miniscript = miniscript.replace(/\bB\b/g, params.freelancerPubkey);
	return miniscript;
}

export async function createVault(input: VaultCreateInput): Promise<VaultInfo> {
	const policy = buildPolicyExpression(input.csvBlocks);
	try {
		const [miniscriptMod, descriptorsMod, secpMod, liquidjs] = await Promise.all([
			import('@bitcoinerlab/miniscript'),
			import('@bitcoinerlab/descriptors'),
			import('@bitcoinerlab/secp256k1'),
			import('liquidjs-lib')
		]);

		const { compilePolicy } = miniscriptMod as {
			compilePolicy: (p: string) => { miniscript: string };
		};
		const compiled = compilePolicy(policy);
		const miniscriptResolved = compiled.miniscript
			.replace(/\bA\b/g, input.clientPubkey)
			.replace(/\bB\b/g, input.freelancerPubkey);

		const descriptor = `wsh(${miniscriptResolved})`;
		const { Output } = (
			descriptorsMod as unknown as {
				DescriptorsFactory: (secp: unknown) => {
					Output: new (args: { descriptor: string; network: unknown }) => {
						getAddress(): string;
						getScriptPubKey(): Buffer | undefined;
						getRedeemScript(): Buffer | undefined;
					};
				};
			}
		).DescriptorsFactory(secpMod as unknown);

		const liq = liquidjs as unknown as {
			networks: { liquid: unknown; testnet: unknown };
		};
		const network = liq.networks[input.network === 'liquid' ? 'liquid' : 'testnet'];
		const output = new Output({ descriptor, network });
		const address = output.getAddress();
		const scriptPubKey = output.getScriptPubKey()?.toString('hex') ?? null;
		const witnessScript = output.getRedeemScript()?.toString('hex') ?? null;

		return {
			type: input.type,
			privileged: input.privileged,
			csvBlocks: input.csvBlocks,
			miniscriptPolicy: policy,
			miniscriptResolved,
			descriptor,
			address,
			scriptPubKey,
			witnessScript
		};
	} catch {
		return {
			type: input.type,
			privileged: input.privileged,
			csvBlocks: input.csvBlocks,
			miniscriptPolicy: policy,
			miniscriptResolved: `and(pk(${input.clientPubkey}),or(pk(${input.freelancerPubkey}),older(${input.csvBlocks})))`,
			descriptor: `wsh(and(pk(${input.clientPubkey}),or(pk(${input.freelancerPubkey}),older(${input.csvBlocks}))))`,
			address: null,
			scriptPubKey: null,
			witnessScript: null
		};
	}
}

export async function createVaultSet(params: {
	clientPubkey: string;
	freelancerPubkey: string;
	network: NetworkName;
}): Promise<{
	escrow: VaultInfo;
	done: VaultInfo;
	dispute: VaultInfo;
	final: VaultInfo;
}> {
	// Approx block time: Liquid ~1 min, Bitcoin ~10 min. Use Liquid cadence for both 'liquid' and 'testnet'.
	const blocksPerDay = params.network === 'liquid' ? 24 * 60 : 24 * 6;
	const days = (n: number) => n * blocksPerDay;

	const escrow = await createVault({
		type: 'escrow',
		privileged: 'client',
		csvBlocks: days(14),
		clientPubkey: params.clientPubkey,
		freelancerPubkey: params.freelancerPubkey,
		network: params.network
	});
	const done = await createVault({
		type: 'done',
		privileged: 'freelancer',
		csvBlocks: days(7),
		clientPubkey: params.clientPubkey,
		freelancerPubkey: params.freelancerPubkey,
		network: params.network
	});
	const dispute = await createVault({
		type: 'dispute',
		privileged: 'client',
		csvBlocks: days(14),
		clientPubkey: params.clientPubkey,
		freelancerPubkey: params.freelancerPubkey,
		network: params.network
	});
	const final = await createVault({
		type: 'final',
		privileged: 'client',
		csvBlocks: days(30),
		clientPubkey: params.clientPubkey,
		freelancerPubkey: params.freelancerPubkey,
		network: params.network
	});

	return { escrow, done, dispute, final };
}
