import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	inspectOutgoingMessage,
	normalizeForContactFilter,
	SHORT_PLATFORM_WORDS
} from '$lib/config/contact-filter';
import { pairHasFormedEscrow } from '$lib/nostr/messaging-policy';

const WARNING_EN =
	'For your safety, keep chats on BitTasker until escrow is formed. Contact details and outside apps are blocked.';

function blocked(text: string, mode: 'pre-escrow' | 'post-escrow' = 'pre-escrow') {
	return inspectOutgoingMessage(text, mode).blocked;
}

describe('contact filter bypasses', () => {
	const samples: Array<[string, string]> = [
		['spaced phone', 'ping me at 703 555 0199'],
		['dotted phone', '703.555.0199'],
		['dashed phone', '703-555-0199'],
		['international phone', '+1 202 555 0123'],
		['paren phone', '+44 (20) 7946 0958'],
		['digit run', 'my number is 7035550199'],
		['seven digits', 'call 555-0199 later'],
		['spaced single digits', '7 0 3 5 5 5 0 1 9 9'],
		['dotted single digits', '7.0.3.5.5.5.0'],
		['english spelled digits', 'seven zero three'],
		['spanish spelled digits', 'siete cero tres'],
		['portuguese spelled digits', 'sete zero tres'],
		['mixed language spelled digits', 'llamame al seven cero tres'],
		['leet spelled digits', 's3v3n z3r0 thr33'],
		['dotted spelled digits', 's.e.v.e.n z.e.r.o t.h.r.e.e'],
		['spaced letters', 'w h a t s a p p'],
		['email', 'write ada@example.com'],
		['obfuscated email', 'name at gmail dot com'],
		['compact obfuscated email', 'name(at)gmail(dot)com'],
		['at and dot mixed', 'reach me at proton dot me'],
		['url', 'see https://example.com/deal'],
		['www url', 'www.example.com'],
		['bare domain', 'example.com'],
		['at handle', 'message @alice'],
		['telegram handle', 't.me/alice'],
		['spaced telegram handle', 't . me / alice'],
		['whatsapp handle', 'wa.me/15551212'],
		['whatsapp word', 'ping me on whatsapp'],
		['whatsap typo', 'my whatsap'],
		['leet whatsapp', 'wh4ts4pp'],
		['wsp', 'escribeme por wsp'],
		['wa token', 'message me wa'],
		['telegram word', 'use telegram'],
		['leet telegram', 't3l3gr4m'],
		['signal word', 'my signal is open'],
		['facebook', 'find me on facebook'],
		['fb token', 'add me fb'],
		['messenger', 'facebook messenger'],
		['instagram', 'my instagram'],
		['ig token', 'dm me ig'],
		['gmail word', 'my gmail'],
		['email word', 'send an email'],
		['correo', 'mi correo'],
		['correio', 'meu correio'],
		['phone word', 'my phone'],
		['telefono', 'mi teléfono'],
		['telefone', 'meu telefone'],
		['celular', 'mi celular'],
		['llamame', 'llámame'],
		['call me', 'call me tomorrow'],
		['me liga', 'me liga hoje'],
		['zero width whatsapp', 'what\u200Bsapp'],
		['cyrillic whatsapp', 'wh\u0430ts\u0430pp'],
		['cyrillic obfuscated email', 'n\u0430me \u0430t gm\u0430il d\u043et c\u043em'],
		['fullwidth phone', '\uFF17\uFF10\uFF13\uFF15\uFF15\uFF15\uFF10\uFF11\uFF19\uFF19'],
		['comma phone', '703,555,0199']
	];

	it.each(samples)('blocks %s before escrow', (_name, text) => {
		expect(blocked(text)).toBe(true);
	});

	it('folds case and accents before matching', () => {
		expect(normalizeForContactFilter('TELÉFONO')).toBe('telefono');
		expect(blocked('WHATSAPP')).toBe(true);
	});
});

describe('contact filter false positives', () => {
	const samples = [
		'The budget is $25.60',
		'I can do it for 1,206 sats',
		'Deadline is 10/20/2026',
		'Let us start Oct 20',
		'October 20, 2026 works',
		'I am free at 10:32 AM',
		'Meet at 14:30',
		'Room 42 is fine',
		'The code is 123456',
		'123 Main Street',
		'1600 Pennsylvania Avenue',
		'45 Oak Ave, Springfield',
		'Bring water for the crew',
		'That job is big',
		'The signal strength is fine',
		'Turn signal is broken',
		'wifi signal dropped',
		'Seattle, WA 98101',
		'I need one helper',
		'one two is enough',
		'um cafe por favor',
		'Ignore the typo',
		'The waffle is ready',
		'5g coverage is fine',
		'Add 1g of salt',
		'Budget is $25.60 and the date is Oct 20 at 10:32. 123 Main Street. Bring water. The job is big. Signal strength is fine. 1,206 sats.'
	];

	it.each(samples)('allows %s', (text) => {
		expect(blocked(text, 'pre-escrow')).toBe(false);
		expect(blocked(text, 'post-escrow')).toBe(false);
	});

	it('keeps wa, ig, and fb as whole tokens only', () => {
		expect(SHORT_PLATFORM_WORDS).toEqual(['wa', 'wsp', 'ig', 'fb']);
		expect(blocked('water')).toBe(false);
		expect(blocked('big')).toBe(false);
		expect(blocked('wa')).toBe(true);
		expect(blocked('ig')).toBe(true);
		expect(blocked('fb')).toBe(true);
	});
});

describe('contact filter after escrow', () => {
	it('allows a phone number, a normal email, and a normal url', () => {
		expect(blocked('7035550199', 'post-escrow')).toBe(false);
		expect(blocked('ada@example.com', 'post-escrow')).toBe(false);
		expect(blocked('https://example.com/task', 'post-escrow')).toBe(false);
		expect(blocked('seven zero three', 'post-escrow')).toBe(false);
	});

	it('still blocks platform words and handles', () => {
		expect(blocked('ping me on whatsapp', 'post-escrow')).toBe(true);
		expect(blocked('ada@gmail.com', 'post-escrow')).toBe(true);
		expect(blocked('my email is ada@example.com', 'post-escrow')).toBe(true);
		expect(blocked('@alice', 'post-escrow')).toBe(true);
		expect(blocked('t.me/alice', 'post-escrow')).toBe(true);
		expect(blocked('wa.me/15551212', 'post-escrow')).toBe(true);
		expect(blocked('call me', 'post-escrow')).toBe(true);
	});
});

describe('contact filter copy', () => {
	it('uses the English warning and a Spanish version', () => {
		const enMessages = JSON.parse(
			readFileSync('static/locales/en/dashboard/messages.json', 'utf8')
		);
		const esMessages = JSON.parse(
			readFileSync('static/locales/es/dashboard/messages.json', 'utf8')
		);
		const enCommon = JSON.parse(readFileSync('static/locales/en/common.json', 'utf8'));
		const esCommon = JSON.parse(readFileSync('static/locales/es/common.json', 'utf8'));
		expect(enMessages.messages.contact_filter_warning).toBe(WARNING_EN);
		expect(enCommon.common.profile.contact_filter_warning).toBe(WARNING_EN);
		expect(esMessages.messages.contact_filter_warning).toContain('BitTasker');
		expect(esMessages.messages.contact_filter_warning).not.toBe(WARNING_EN);
		expect(esCommon.common.profile.contact_filter_warning).toBe(
			esMessages.messages.contact_filter_warning
		);
	});
});

describe('formed escrow detection', () => {
	const self = 'a'.repeat(64);
	const other = 'b'.repeat(64);

	it('treats a funded contract between the two parties as formed', () => {
		expect(
			pairHasFormedEscrow(
				[
					{
						pubkey: self,
						tags: [
							['p', other],
							['s', 'funded']
						]
					}
				],
				self,
				other
			)
		).toBe(true);
	});

	it('treats work in progress as formed', () => {
		expect(
			pairHasFormedEscrow(
				[
					{
						pubkey: self,
						tags: [
							['p', other],
							['s', 'work_in_progress']
						]
					}
				],
				self,
				other
			)
		).toBe(true);
	});

	it('does not treat funding or a pending contract as formed', () => {
		expect(
			pairHasFormedEscrow(
				[
					{
						pubkey: self,
						tags: [
							['p', other],
							['s', 'funding']
						]
					}
				],
				self,
				other
			)
		).toBe(false);
		expect(
			pairHasFormedEscrow(
				[
					{
						pubkey: self,
						tags: [
							['p', other],
							['s', 'pending']
						]
					}
				],
				self,
				other
			)
		).toBe(false);
	});

	it('ignores a contract with a different party', () => {
		expect(
			pairHasFormedEscrow(
				[
					{
						pubkey: self,
						tags: [
							['p', 'c'.repeat(64)],
							['s', 'funded']
						]
					}
				],
				self,
				other
			)
		).toBe(false);
	});
});
