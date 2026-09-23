// @ts-nocheck
import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import '$lib/utils/deep-link';

export const prerender = false;
export const ssr = false;
export const csr = true;

if (browser) {
	import('$lib/utils/debug').then(({ initDebug }) => initDebug());
}

export const load = async () => {
	if (browser) {
		const { value: npubHex } = await Preferences.get({ key: StorageKeys.NPUB });
		if (npubHex) {
			import('$lib/nostr/muteList')
				.then(({ fetchMuteList }) => fetchMuteList(npubHex))
				.catch(() => {});
		}
	}

	return {};
};
;null as any as LayoutLoad;