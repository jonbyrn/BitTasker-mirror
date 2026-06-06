import { describe, expect, it } from 'vitest';
import {
	PROFILE_METADATA_WIRE_ENRICHMENT_KEYS,
	parseProfileMetadataContent,
	buildProfileMetadataWire
} from '$lib/nostr/profile/metadata-wire';

describe('PROFILE_METADATA_WIRE_ENRICHMENT_KEYS', () => {
	it('includes languages key', () => {
		expect(PROFILE_METADATA_WIRE_ENRICHMENT_KEYS).toContain('languages');
	});
});

describe('parseProfileMetadataContent with languages', () => {
	it('parses languages from wire JSON into profile', () => {
		const wire = JSON.stringify({
			display_name: 'Alice',
			languages: [
				{ code: 'en', proficiency: 'native' },
				{ code: 'es', proficiency: 'conversational' }
			]
		});
		const profile = parseProfileMetadataContent(wire);
		expect(profile).not.toBeNull();
		expect(profile?.languages).toEqual([
			{ code: 'en', proficiency: 'native' },
			{ code: 'es', proficiency: 'conversational' }
		]);
	});

	it('returns undefined languages when not in wire', () => {
		const wire = JSON.stringify({ display_name: 'Bob' });
		const profile = parseProfileMetadataContent(wire);
		expect(profile).not.toBeNull();
		expect(profile?.languages).toBeUndefined();
	});
});

describe('buildProfileMetadataWire with languages', () => {
	it('includes languages in wire output', () => {
		const wire = buildProfileMetadataWire({
			display_name: 'Alice',
			languages: [
				{ code: 'en', proficiency: 'native' },
				{ code: 'es', proficiency: 'fluent' }
			]
		});
		expect(wire.languages).toEqual([
			{ code: 'en', proficiency: 'native' },
			{ code: 'es', proficiency: 'fluent' }
		]);
	});

	it('omits languages when not set', () => {
		const wire = buildProfileMetadataWire({ display_name: 'Bob' });
		expect(wire.languages).toBeUndefined();
	});

	it('omits empty languages array', () => {
		const wire = buildProfileMetadataWire({
			display_name: 'Carol',
			languages: []
		});
		expect(wire.languages).toEqual([]);
	});
});
