/**
 * Blockscout API URL resolution — same-origin proxy on web, direct on native.
 */

import { browser } from '$app/environment';
import { Capacitor } from '@capacitor/core';

type RskNetwork = 'mainnet' | 'testnet';

function rskNetwork(): RskNetwork {
	return (import.meta.env.VITE_RSK_NETWORK || 'testnet') as RskNetwork;
}

function directBlockscoutBase(network: RskNetwork): string {
	return network === 'mainnet'
		? 'https://rootstock.blockscout.com/api/v2'
		: 'https://rootstock-testnet.blockscout.com/api/v2';
}

/** Blockscout API v2 base URL for RSK (proxied on web prod, direct on native / dev / tests). */
export function getBlockscoutApiUrl(): string {
	const network = rskNetwork();
	if (Capacitor.isNativePlatform() || import.meta.env.DEV || import.meta.env.MODE === 'test') {
		return directBlockscoutBase(network);
	}

	const configured = import.meta.env.VITE_EXPLORER_PROXY_BASE?.replace(/\/$/, '');
	const origin =
		browser && typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';
	const appBase = configured || origin;
	if (!appBase) {
		return directBlockscoutBase(network);
	}

	const segment = network === 'mainnet' ? 'rsk' : 'rsk-testnet';
	return `${appBase}/api/explorer/${segment}/v2`;
}
