// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * npm-installable bolt11 replacement (see ../bolt11.ts). Keep logic in sync.
 */
import { decode as decodeLightning } from 'light-bolt11-decoder';

const TAG_LETTER_TO_NAME = {
	p: 'payment_hash',
	d: 'description',
	s: 'payment_secret',
	x: 'expiry',
	c: 'min_final_cltv_expiry',
	r: 'route_hint',
	9: 'feature_bits',
	h: 'description_hash',
	n: 'payee',
	f: 'fallback_address',
	m: 'metadata'
};

function parseAmount(sections) {
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

function parseTags(sections) {
	const tags = [];
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

export function decode(invoice) {
	const decoded = decodeLightning(invoice);
	return {
		...parseAmount(decoded.sections),
		tags: parseTags(decoded.sections)
	};
}

export default { decode };
