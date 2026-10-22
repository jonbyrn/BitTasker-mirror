/**
 * Publish nine [TEST] map listings to the rgb sandbox catalog relay.
 *
 * The only write target is wss://relay.bittasker.com. That is the listing
 * relay pinned by deploy-sandbox and deploy-preview. Production and master
 * use wss://relay1.bittasker.com and wss://relay2.bittasker.com. This script
 * samples those stores and refuses to publish if a production event is also
 * on the sandbox relay, or if a sandbox event is on production.
 *
 * nos.lol and relay.primal.net are in the sandbox build for general and
 * fallback reads. They are public relays, not the catalog, and this script
 * does not write to them.
 *
 * The signing key is generated in memory. It is never written to disk.
 * Stdout prints the npub only.
 *
 * Run: node --experimental-strip-types scripts/seed-staging-map-test.ts
 */

import { finalizeEvent, generateSecretKey, getPublicKey, type Event } from 'nostr-tools/pure';
import { npubEncode } from 'nostr-tools/nip19';
import WebSocket from 'ws';

const SANDBOX_RELAY = 'wss://relay.bittasker.com';
const PRODUCTION_RELAYS = ['wss://relay1.bittasker.com', 'wss://relay2.bittasker.com'] as const;
const BLOCKED_HOSTS = new Set([
	'relay1.bittasker.com',
	'relay2.bittasker.com',
	'relay1-dev.bittasker.com',
	'relay2-dev.bittasker.com'
]);

const TASK_KIND = 31000;
const SERVICE_KIND = 30402;
const SHIFT_KIND = 31150;
const SHIFT_DATE = '2026-11-28';
const TASK_DEADLINE = '2026-12-20';

interface Place {
	label: string;
	latitude: number;
	longitude: number;
}

const PLACES = {
	elTunco: { label: 'El Tunco, La Libertad, El Salvador', latitude: 13.4926, longitude: -89.3836 },
	sanBenito: {
		label: 'San Benito, San Salvador, El Salvador',
		latitude: 13.6946,
		longitude: -89.2404
	},
	santaTecla: {
		label: 'Santa Tecla, La Libertad, El Salvador',
		latitude: 13.6769,
		longitude: -89.2797
	},
	metrocentro: {
		label: 'Metrocentro, San Miguel, El Salvador',
		latitude: 13.4765,
		longitude: -88.1772
	},
	juayua: { label: 'Juayúa, Sonsonate, El Salvador', latitude: 13.8414, longitude: -89.7456 },
	suchitoto: {
		label: 'Suchitoto, Cuscatlán, El Salvador',
		latitude: 13.938,
		longitude: -89.028
	},
	santaAna: { label: 'Santa Ana, Santa Ana, El Salvador', latitude: 13.9942, longitude: -89.5597 }
} satisfies Record<string, Place>;

function assertSandboxTarget(url: string): void {
	const host = new URL(url).hostname.toLowerCase();
	if (url !== SANDBOX_RELAY || host !== 'relay.bittasker.com' || BLOCKED_HOSTS.has(host)) {
		throw new Error(`Refusing to publish. ${url} is not the sandbox catalog relay.`);
	}
}

function query(url: string, filter: Record<string, unknown>, ms = 8000): Promise<Event[]> {
	return new Promise((resolve, reject) => {
		const events: Event[] = [];
		const ws = new WebSocket(url, { handshakeTimeout: 6000 });
		const timer = setTimeout(() => {
			ws.close();
			reject(new Error(`Relay query timed out: ${url}`));
		}, ms);
		ws.on('open', () => ws.send(JSON.stringify(['REQ', 'proof', filter])));
		ws.on('message', (data) => {
			let message: unknown;
			try {
				message = JSON.parse(data.toString());
			} catch {
				return;
			}
			if (!Array.isArray(message)) return;
			if (message[0] === 'EVENT' && message[2] && typeof message[2] === 'object') {
				events.push(message[2] as Event);
			}
			if (message[0] === 'EOSE') {
				clearTimeout(timer);
				ws.close();
				resolve(events);
			}
			if (message[0] === 'NOTICE') {
				clearTimeout(timer);
				ws.close();
				reject(new Error(`Relay notice from ${url}: ${String(message[1]).slice(0, 160)}`));
			}
		});
		ws.on('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}

async function nip11(url: string): Promise<{ software?: string; name?: string; id?: string }> {
	const httpUrl = url.replace(/^wss:/, 'https:');
	const response = await fetch(httpUrl, {
		headers: { Accept: 'application/nostr+json' },
		signal: AbortSignal.timeout(8000)
	});
	if (!response.ok) throw new Error(`NIP-11 ${httpUrl} returned ${response.status}`);
	return (await response.json()) as { software?: string; name?: string; id?: string };
}

/**
 * Stop unless the sandbox catalog event store is distinct from relay1 and relay2.
 * A shared Cloudflare address is not identity: the stores are compared by event id.
 */
async function proveSeparateFromProduction(): Promise<string[]> {
	assertSandboxTarget(SANDBOX_RELAY);
	const [sandboxInfo, relay1Info, relay2Info] = await Promise.all([
		nip11(SANDBOX_RELAY),
		nip11(PRODUCTION_RELAYS[0]),
		nip11(PRODUCTION_RELAYS[1])
	]);
	const sandboxSoftware = String(sandboxInfo.software ?? '');
	const relay1Software = String(relay1Info.software ?? '');
	if (sandboxSoftware.includes('nostr-rs-relay') || sandboxInfo.id === PRODUCTION_RELAYS[0]) {
		throw new Error('Sandbox NIP-11 matches the production nostr-rs-relay. Publish stopped.');
	}
	if (relay1Software.includes('nostr-rs-relay') === false) {
		throw new Error('relay1 did not identify as nostr-rs-relay. Publish stopped.');
	}

	const proof: string[] = [];
	proof.push(
		`NIP-11 ${SANDBOX_RELAY} software=${sandboxSoftware || 'unknown'} name=${sandboxInfo.name || 'unset'}`
	);
	proof.push(
		`NIP-11 ${PRODUCTION_RELAYS[0]} software=${relay1Software} id=${relay1Info.id || 'unset'}`
	);
	proof.push(
		`NIP-11 ${PRODUCTION_RELAYS[1]} software=${relay2Info.software || 'unknown'} name=${relay2Info.name || 'unset'}`
	);

	for (const prodUrl of PRODUCTION_RELAYS) {
		const sample = await query(prodUrl, { kinds: [TASK_KIND], limit: 1 });
		const prodId = sample[0]?.id;
		if (!prodId) throw new Error(`No production task sample from ${prodUrl}. Publish stopped.`);
		const onSandbox = await query(SANDBOX_RELAY, { ids: [prodId] });
		if (onSandbox.length > 0) {
			throw new Error(`Production event ${prodId} is on ${SANDBOX_RELAY}. Publish stopped.`);
		}
		proof.push(`Production event ${prodId} from ${prodUrl} is absent on ${SANDBOX_RELAY}.`);
	}

	const sandboxSample = await query(SANDBOX_RELAY, { kinds: [TASK_KIND], limit: 1 });
	const sandboxId = sandboxSample[0]?.id;
	if (!sandboxId) throw new Error('Sandbox catalog returned no task sample. Publish stopped.');
	for (const prodUrl of PRODUCTION_RELAYS) {
		const leaked = await query(prodUrl, { ids: [sandboxId] });
		if (leaked.length > 0) {
			throw new Error(`Sandbox event ${sandboxId} is on ${prodUrl}. Publish stopped.`);
		}
		proof.push(`Sandbox event ${sandboxId} is absent on ${prodUrl}.`);
	}
	return proof;
}

function slug(title: string): string {
	return (
		title
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9-]/g, '')
			.slice(0, 50) || 'listing'
	);
}

function publicCoordinate(value: number): number {
	return Number(value.toFixed(2));
}

function taskEvent(title: string, description: string, place: Place, createdAt: number) {
	const dTag = `${slug(title)}-${createdAt}`;
	const latitude = publicCoordinate(place.latitude);
	const longitude = publicCoordinate(place.longitude);
	const content = {
		title,
		description,
		status: 'OPEN',
		taskType: 'onsite',
		estimatedHours: 4,
		budget: { amount: 20, currency: 'USD', type: 'FIXED' },
		deadline: TASK_DEADLINE,
		dateRange: null,
		pickupLocation: {
			displayName: place.label,
			latitude,
			longitude,
			zipCode: '',
			locationLoaded: true
		},
		dropOffLocation: null,
		skills: ['oficios'],
		categories: [],
		isRemovals: false,
		isBoosted: false,
		boostPercentage: null,
		createdAt,
		updatedAt: '',
		completedAt: null,
		cancelledAt: null,
		deletedAt: null,
		isDeleted: false,
		requiredSkills: []
	};
	return {
		dTag,
		kind: TASK_KIND,
		content: JSON.stringify(content),
		tags: [
			['d', dTag],
			['S', 'OPEN'],
			['L', place.label]
		]
	};
}

function serviceEvent(
	title: string,
	description: string,
	place: Place,
	createdAt: number,
	pubkey: string
) {
	const suffix = pubkey.slice(0, 6);
	const dTag = `service-${slug(title)}-${createdAt}-${suffix}`;
	const content = {
		uniqueId: dTag,
		createdAt,
		creator: { username: `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`, avatar: '' },
		title,
		description,
		serviceLocationTypes: ['tasker_location'],
		locationDetails: {
			taskerLocation: {
				serviceLocation: {
					displayName: place.label,
					latitude: place.latitude,
					longitude: place.longitude,
					zipCode: '',
					locationLoaded: true
				}
			}
		},
		pricing: { type: 'FIXED', amount: 20, currency: 'USD', addOns: [] },
		skills: ['oficios'],
		categories: [
			{
				id: 'home',
				slug: 'home',
				name: 'Home',
				description: 'Home services'
			}
		],
		portfolio: [],
		faqs: [],
		status: 'active'
	};
	return {
		dTag,
		kind: SERVICE_KIND,
		content: JSON.stringify(content),
		tags: [
			['d', dTag],
			['title', title],
			['summary', description.slice(0, 200)],
			['published_at', String(createdAt)],
			['location', place.label],
			['price', '20', 'USD'],
			['s', 'active'],
			['p', pubkey],
			['categories', 'home'],
			['skills', 'oficios'],
			['o', 'tasker_location'],
			['location_display_name', place.label],
			['y', 'FIXED']
		]
	};
}

function shiftEvent(
	title: string,
	role: string,
	requirements: string,
	place: Place,
	hourlyRateUsd: number,
	startTime: string,
	endTime: string,
	createdAt: number
) {
	const dTag = `${slug(title)}-${createdAt}`;
	const job = {
		id: dTag,
		title,
		role,
		requirements,
		location: place.label,
		latitude: place.latitude,
		longitude: place.longitude,
		date: SHIFT_DATE,
		endDate: SHIFT_DATE,
		startTime,
		endTime,
		days: 1,
		headcount: 1,
		hourlyRateUsd,
		status: 'open'
	};
	return {
		dTag,
		kind: SHIFT_KIND,
		content: JSON.stringify({ v: 1, job }),
		tags: [
			['d', dTag],
			['t', 'temp-staff'],
			['role', role],
			['location', place.label]
		]
	};
}

function listings(createdAt: number, pubkey: string) {
	return [
		shiftEvent(
			'[TEST] Mesero/a para evento',
			'waiter',
			'Atender mesas durante un evento en la playa.',
			PLACES.elTunco,
			3.5,
			'18:00',
			'23:00',
			createdAt
		),
		shiftEvent(
			'[TEST] Recepcionista temporal',
			'reception',
			'Recibir visitas en un escritorio por un turno.',
			PLACES.sanBenito,
			3.25,
			'08:00',
			'13:00',
			createdAt + 1
		),
		shiftEvent(
			'[TEST] Ayudante de bodega',
			'loader',
			'Acomodar cajas en una bodega durante el turno.',
			PLACES.santaTecla,
			3,
			'07:00',
			'15:00',
			createdAt + 2
		),
		shiftEvent(
			'[TEST] Cajero/a fin de semana',
			'cashier',
			'Cobrar en caja durante el fin de semana.',
			PLACES.metrocentro,
			3,
			'10:00',
			'18:00',
			createdAt + 3
		),
		shiftEvent(
			'[TEST] Barista',
			'hospitality',
			'Preparar bebidas en un cafe de la ruta.',
			PLACES.juayua,
			3.25,
			'08:00',
			'14:00',
			createdAt + 4
		),
		taskEvent(
			'[TEST] Reparar una puerta en Suchitoto',
			'Ajustar y colgar una puerta de madera en una casa.',
			PLACES.suchitoto,
			createdAt + 5
		),
		taskEvent(
			'[TEST] Pintar una habitacion en Santa Ana',
			'Pintar las paredes de una habitacion pequena.',
			PLACES.santaAna,
			createdAt + 6
		),
		serviceEvent(
			'[TEST] Corte de cabello en Santa Ana',
			'Corte de cabello en un local de Santa Ana, El Salvador.',
			PLACES.santaAna,
			createdAt + 7,
			pubkey
		),
		serviceEvent(
			'[TEST] Guia local en Suchitoto',
			'Recorrido a pie por el centro de Suchitoto, El Salvador.',
			PLACES.suchitoto,
			createdAt + 8,
			pubkey
		)
	];
}

function publishAll(
	url: string,
	secret: Uint8Array,
	drafts: ReturnType<typeof listings>
): Promise<Event[]> {
	assertSandboxTarget(url);
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url, { handshakeTimeout: 8000 });
		const pending = drafts.map((draft) =>
			finalizeEvent(
				{
					kind: draft.kind,
					created_at: Math.floor(Date.now() / 1000),
					tags: draft.tags,
					content: draft.content
				},
				secret
			)
		);
		let index = 0;
		const accepted: Event[] = [];
		let started = false;
		const timer = setTimeout(() => {
			ws.close();
			reject(new Error('Publish timed out before every event was accepted.'));
		}, 20000);

		const sendNext = () => {
			const event = pending[index];
			if (!event) {
				clearTimeout(timer);
				ws.close();
				resolve(accepted);
				return;
			}
			ws.send(JSON.stringify(['EVENT', event]));
		};
		const start = () => {
			if (started) return;
			started = true;
			sendNext();
		};

		ws.on('open', () => {
			setTimeout(start, 400);
		});
		ws.on('message', (data) => {
			let message: unknown;
			try {
				message = JSON.parse(data.toString());
			} catch {
				return;
			}
			if (!Array.isArray(message)) return;
			if (message[0] === 'AUTH' && typeof message[1] === 'string') {
				const auth = finalizeEvent(
					{
						kind: 22242,
						created_at: Math.floor(Date.now() / 1000),
						tags: [
							['relay', url],
							['challenge', message[1]]
						],
						content: ''
					},
					secret
				);
				ws.send(JSON.stringify(['AUTH', auth]));
				start();
				return;
			}
			if (message[0] !== 'OK') return;
			const current = pending[index];
			if (!current || message[1] !== current.id) return;
			if (message[2] !== true) {
				clearTimeout(timer);
				ws.close();
				reject(new Error(`Relay rejected ${current.id}: ${String(message[3])}`));
				return;
			}
			accepted.push(current);
			index += 1;
			sendNext();
		});
		ws.on('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}

async function confirmNotOnProduction(ids: string[]): Promise<void> {
	for (const prodUrl of PRODUCTION_RELAYS) {
		const found = await query(prodUrl, { ids });
		if (found.length > 0) {
			throw new Error(`A published event is readable on ${prodUrl}.`);
		}
	}
}

async function main(): Promise<void> {
	assertSandboxTarget(SANDBOX_RELAY);
	const proof = await proveSeparateFromProduction();
	const secret = generateSecretKey();
	const pubkey = getPublicKey(secret);
	const npub = npubEncode(pubkey);
	const createdAt = Math.floor(Date.now() / 1000);
	const drafts = listings(createdAt, pubkey);
	if (drafts.length !== 9) throw new Error(`Expected 9 listings, built ${drafts.length}.`);
	const accepted = await publishAll(SANDBOX_RELAY, secret, drafts);
	if (accepted.length !== 9) throw new Error(`Accepted ${accepted.length} of 9 events.`);
	await confirmNotOnProduction(accepted.map((event) => event.id));

	const rows = accepted.map((event, index) => ({
		id: event.id,
		d: drafts[index]?.dTag,
		kind: event.kind
	}));
	console.log(
		JSON.stringify(
			{
				relay: SANDBOX_RELAY,
				proof,
				npub,
				events: rows
			},
			null,
			2
		)
	);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : 'Seed failed before publish.';
	console.error(message);
	process.exit(1);
});
