/**
 * Drop-in replacement for the `bolt11` package using `light-bolt11-decoder` (@scure/base only).
 * Aliased in Vite/Vitest so @bittasker/wallet-core and app code avoid secp256k1/elliptic.
 */
import { decode as decodeLightning } from 'light-bolt11-decoder';

export type Bolt11Tag = {
	tagName: string;
	data: unknown;
};

export type Bolt11Decoded = {
	satoshis: number | null;
	millisatoshis: string | number | null;
	tags: Bolt11Tag[];
};

const TAG_LETTER_TO_NAME: Record<string, string> = {
	p: 'payment_hash',
	d: 'description',
	s: 'payment_secret',
	x: 'expiry',
	c: 'min_final_cltv_expiry',
	r: 'route_hint',
	'9': 'feature_bits',
	h: 'description_hash',
	n: 'payee',
	f: 'fallback_address',
	m: 'metadata'
};

type DecoderSection = {
	name: string;
	tag?: string;
	value?: unknown;
};

function parseAmount(
	sections: DecoderSection[]
): Pick<Bolt11Decoded, 'satoshis' | 'millisatoshis'> {
	const amount = sections.find((section) => section.name === 'amount');
	if (amount?.value == null || amount.value === '') {
		return { satoshis: null, millisatoshis: null };
	}

	const millisatoshis = String(amount.value);
	const msat = BigInt(millisatoshis);
	return {
		millisatoshis,
		satoshis: Number(msat / 1000n)
	};
}

function parseTags(sections: DecoderSection[]): Bolt11Tag[] {
	const tags: Bolt11Tag[] = [];
	for (const section of sections) {
		if (section.tag == null || section.value === undefined) {
			continue;
		}
		tags.push({
			tagName: TAG_LETTER_TO_NAME[section.tag] ?? section.name,
			data: section.value
		});
	}
	return tags;
}

export function decode(invoice: string): Bolt11Decoded {
	const decoded = decodeLightning(invoice);
	return {
		...parseAmount(decoded.sections),
		tags: parseTags(decoded.sections)
	};
}

const bolt11 = { decode };
export default bolt11;
