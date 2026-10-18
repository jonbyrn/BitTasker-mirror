import { describe, expect, it } from 'vitest';
import { rgbWalletConfig, walletInitFields } from '$lib/stores/wallet/rgb-wallet-config';

const input = {
	mnemonic:
		'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
	password: 'hashed-password',
	indexerUrl: 'https://esplora-api.utexo.com',
	transportEndpoint: 'https://rgb-proxy.utexo.com/json-rpc',
	proxyUrl: 'wss://ln-gateway-signet.utexo.com',
	relayAuthToken: 'relay-token',
	relayNodeId: '0311',
	enableVirtualChannels: false,
	lspBaseUrl: 'https://lsp-signet.utexo.com'
};

describe('rgbWalletConfig', () => {
	it('passes network, schemas, transport auth, and a null vss url', () => {
		const config = rgbWalletConfig({ ...input, dataDir: 'rln_037153fd_signet' });
		expect(config.network).toBe('utexo');
		expect(config.supportedSchemas).toEqual(['Nia', 'Ifa']);
		expect(config.relayAuthToken).toBe('relay-token');
		expect(config.relayNodeId).toBe('0311');
		expect(config.transportEndpoint).toBe(input.transportEndpoint);
		expect(config.indexerUrl).toBe(input.indexerUrl);
		expect(config.enableVirtualChannels).toBe(false);
		expect(config).not.toHaveProperty('enableVirtualChannelsV0');
		expect(config).not.toHaveProperty('virtualPeerPubkeys');
		expect(config.vssUrl).toBeNull();
		expect(config.skipConsistencyCheck).toBe(true);
		expect(config.dataDir).toBe('rln_037153fd_signet');
	});

	it('refuses a wallet config with no transport auth', () => {
		expect(() => rgbWalletConfig({ ...input, relayAuthToken: '' })).toThrow(
			'Wallet transport auth is missing'
		);
	});
});

describe('walletInitFields', () => {
	it('reads the wasm create payload when it arrives as a JSON string', () => {
		const fields = walletInitFields(
			JSON.stringify({
				data_dir: 'rln_037153fd_signet',
				bitcoin_network: 'Signet',
				database_type: 'Sqlite',
				supported_schemas: ['Nia', 'Ifa']
			})
		);
		expect(fields).toEqual({
			dataDir: 'rln_037153fd_signet',
			network: 'Signet',
			databaseType: 'Sqlite',
			schemas: ['Nia', 'Ifa']
		});
	});

	it('does not treat a raw JSON string as an object', () => {
		const raw = JSON.stringify({ data_dir: 'rln_x_signet', bitcoin_network: 'Signet' });
		const mistaken = raw as unknown as { data_dir?: string; bitcoin_network?: string };
		expect(mistaken.data_dir).toBeUndefined();
		expect(walletInitFields(raw).dataDir).toBe('rln_x_signet');
	});
});
