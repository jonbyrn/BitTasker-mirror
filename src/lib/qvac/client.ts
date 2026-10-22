import { TEXT_LIMIT, AUDIO_LIMIT, IMAGE_LIMIT } from '$lib/qvac/gate.js';

export type QvacDraftKind = 'task' | 'service' | 'listing';

export interface QvacDraftOptions {
	kind?: QvacDraftKind;
	offer?: 'sell' | 'rent';
}

export interface QvacDraft {
	title: string;
	description: string;
	categoryId: string;
	priceLow: number;
	priceHigh: number;
	priceUnit: 'project' | 'hour';
}

export type QvacErrorCode =
	| 'unavailable'
	| 'failed'
	| 'too_long'
	| 'unreadable'
	| 'disabled'
	| 'refused';

export class QvacError extends Error {
	code: QvacErrorCode;

	constructor(code: QvacErrorCode) {
		super(code);
		this.code = code;
	}
}

const KNOWN: QvacErrorCode[] = [
	'unavailable',
	'failed',
	'too_long',
	'unreadable',
	'disabled',
	'refused'
];

function asCode(value: unknown): QvacErrorCode {
	return KNOWN.includes(value as QvacErrorCode) ? (value as QvacErrorCode) : 'failed';
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
	let response: Response;
	try {
		response = await fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch {
		throw new QvacError('failed');
	}
	let payload: { error?: string } = {};
	try {
		payload = await response.json();
	} catch {
		payload = {};
	}
	if (!response.ok) throw new QvacError(asCode(payload.error));
	return payload as T;
}

export async function draftTask(text: string, options: QvacDraftOptions = {}): Promise<QvacDraft> {
	const note = text.trim();
	if (!note) throw new QvacError('failed');
	if (note.length > TEXT_LIMIT) throw new QvacError('too_long');
	const draft = await postJson<QvacDraft>('/api/qvac/draft', {
		text: note,
		kind: options.kind || 'task',
		offer: options.offer === 'rent' ? 'rent' : 'sell'
	});
	if (!draft.title) throw new QvacError('unreadable');
	return draft;
}

export async function draftFromImage(
	image: Blob,
	options: QvacDraftOptions = {}
): Promise<QvacDraft> {
	if (image.size > IMAGE_LIMIT) throw new QvacError('too_long');
	const body = new FormData();
	body.set('file', image, 'photo.jpg');
	body.set('kind', options.kind || 'task');
	body.set('offer', options.offer === 'rent' ? 'rent' : 'sell');
	let response: Response;
	try {
		response = await fetch('/api/qvac/vision', { method: 'POST', body });
	} catch {
		throw new QvacError('failed');
	}
	let payload: { error?: string; title?: string } = {};
	try {
		payload = await response.json();
	} catch {
		payload = {};
	}
	if (!response.ok) throw new QvacError(asCode(payload.error));
	if (!payload.title) throw new QvacError('unreadable');
	return payload as QvacDraft;
}

export async function suggestCategory(title: string, description = ''): Promise<string> {
	const name = title.trim();
	if (name.length < 8) return '';
	const details = description.trim().slice(0, TEXT_LIMIT);
	if (name.length + details.length > TEXT_LIMIT) throw new QvacError('too_long');
	const result = await postJson<{ categoryId?: string }>('/api/qvac/category', {
		title: name.slice(0, 200),
		description: details
	});
	return result.categoryId || '';
}

export async function translateText(text: string, to: 'es' | 'en'): Promise<string> {
	const source = text.trim();
	if (!source) return '';
	if (source.length > TEXT_LIMIT) throw new QvacError('too_long');
	const result = await postJson<{ text?: string }>('/api/qvac/translate', { text: source, to });
	if (!result.text) throw new QvacError('unreadable');
	return result.text;
}

export async function transcribeAudio(audio: Blob): Promise<string> {
	if (audio.size > AUDIO_LIMIT) throw new QvacError('too_long');
	const body = new FormData();
	body.set('file', audio, 'speech.webm');
	let response: Response;
	try {
		response = await fetch('/api/qvac/transcribe', { method: 'POST', body });
	} catch {
		throw new QvacError('failed');
	}
	let payload: { error?: string; text?: string } = {};
	try {
		payload = await response.json();
	} catch {
		payload = {};
	}
	if (!response.ok) throw new QvacError(asCode(payload.error));
	return (payload.text || '').trim();
}
