export interface RgbWalletConfig {
	mnemonic: string;
	password: string;
	network: 'utexo';
	indexerUrl: string;
	transportEndpoint: string;
	proxyUrl: string;
	supportedSchemas: readonly ['Nia', 'Ifa'];
	relayAuthToken: string;
	relayNodeId: string;
	enableVirtualChannels: boolean;
	lspBaseUrl?: string;
	vssUrl: null;
	skipConsistencyCheck: true;
	dataDir?: string;
}

export function rgbWalletConfig(input: {
	mnemonic: string;
	password: string;
	indexerUrl: string;
	transportEndpoint: string;
	proxyUrl: string;
	relayAuthToken: string;
	relayNodeId: string;
	enableVirtualChannels: boolean;
	lspBaseUrl?: string;
	dataDir?: string;
}): RgbWalletConfig {
	if (!input.relayAuthToken || !input.relayNodeId) {
		throw new Error('Wallet transport auth is missing');
	}
	return {
		mnemonic: input.mnemonic,
		password: input.password,
		network: 'utexo',
		indexerUrl: input.indexerUrl,
		transportEndpoint: input.transportEndpoint,
		proxyUrl: input.proxyUrl,
		supportedSchemas: ['Nia', 'Ifa'],
		relayAuthToken: input.relayAuthToken,
		relayNodeId: input.relayNodeId,
		enableVirtualChannels: input.enableVirtualChannels,
		...(input.lspBaseUrl ? { lspBaseUrl: input.lspBaseUrl } : {}),
		vssUrl: null,
		skipConsistencyCheck: true,
		...(input.dataDir ? { dataDir: input.dataDir } : {})
	};
}

/** The wasm create() argument is a JSON string. Reading it as an object hides every field. */
export function walletInitFields(walletData: unknown): {
	dataDir: string | undefined;
	network: string | undefined;
	databaseType: string | undefined;
	schemas: unknown;
} {
	let parsed = walletData;
	if (typeof walletData === 'string') {
		try {
			parsed = JSON.parse(walletData) as unknown;
		} catch {
			parsed = null;
		}
	}
	if (!parsed || typeof parsed !== 'object') {
		return { dataDir: undefined, network: undefined, databaseType: undefined, schemas: undefined };
	}
	const row = parsed as Record<string, unknown>;
	return {
		dataDir: typeof row.data_dir === 'string' ? row.data_dir : undefined,
		network: typeof row.bitcoin_network === 'string' ? row.bitcoin_network : undefined,
		databaseType: typeof row.database_type === 'string' ? row.database_type : undefined,
		schemas: row.supported_schemas
	};
}
