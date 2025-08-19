/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { getNostrKeyPair } from './nostrKeys';
import {
	sendDirectMessage,
	getMessageHistory,
	getMessagedPeople
} from './nostr-message';
import { bytesToHex } from '@noble/hashes/utils';

export interface NostrBid {
	type: 'bid';
	taskId: string;
	taskTitle: string; // Add task title
	taskDescription: string; // Add task description
	amount: number;
	currency: string;
	paymentType: 'FIXED' | 'HOURLY';
	hourlyRate?: number | null; // Allow null values
	estimatedHours?: number | null; // Allow null values
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;
	timestamp: number;
	bidId: string;
	// New datetime fields for fixed price bids
	startDate?: string | null;
	endDate?: string | null;
	startTime?: string | null;
	endTime?: string | null;
}

export interface BidMessage {
	bid: NostrBid; // Los datos del bid
	senderPubkey: string; // Quien envió el bid
	event: NostrEvent; // El evento Nostr
}

/**
 * Submit a bid as an encrypted DM to the task creator
 */
export async function submitBidAsDM(bidData: NostrBid, taskCreatorPubkey: string): Promise<void> {
	try {
		// Convertir los datos del bid a JSON y enviar como DM
		const messageContent = JSON.stringify(bidData);
		await sendDirectMessage(messageContent, taskCreatorPubkey);
	} catch (error) {
		console.error('Error al enviar bid como DM:', error);
		throw error;
	}
}

/**
 * Obtener todos los bids para una tarea específica
 */
export async function getTaskBids(taskId: string): Promise<BidMessage[]> {
	try {
		const { nsec, npub } = await getNostrKeyPair();
		const privkey = bytesToHex(nsec);

		// Convertir npub a hex
		const pubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Obtener todas las personas con las que has intercambiado mensajes
		const messagedPeople = await getMessagedPeople();
		const bids: BidMessage[] = [];

		// Para cada conversación, buscar bids relacionados con esta tarea
		for (const person of messagedPeople) {
			try {
				// Obtener historial de mensajes con esta persona
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 100 });

				// Filtrar mensajes que contengan bids para esta tarea
				for (const message of messageHistory) {
					try {
						// Intentar parsear como JSON de bid
						const parsedContent = JSON.parse(message.plaintext);

						// Verificar si es un bid para esta tarea específica
						if (parsedContent.type === 'bid' && parsedContent.taskId === taskId) {
							bids.push({
								bid: parsedContent,
								senderPubkey: message.senderPubkey,
								event: message.event
							});
						}
					} catch (parseError) {
						// No es un bid válido, continuar
						continue;
					}
				}
			} catch (err) {
				continue;
			}
		}

		// Ordenar por timestamp (más recientes primero)
		return bids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);
	} catch (error) {
		console.error('Error al obtener bids de la tarea:', error);
		throw error;
	}
}

/**
 * Obtener todos los bids enviados por el usuario actual
 * ARREGLADO: Ahora extrae correctamente todos los datos del bid
 */
export async function getMyBids(): Promise<BidMessage[]> {
	try {
		const { nsec, npub } = await getNostrKeyPair();
		const privkey = bytesToHex(nsec);

		// Convertir npub a hex
		const pubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Obtener todas las personas con las que has intercambiado mensajes
		const messagedPeople = await getMessagedPeople();

		const bids: BidMessage[] = [];

		// Para cada conversación, buscar bids enviados por el usuario actual
		for (const person of messagedPeople) {
			try {
				// Obtener historial de mensajes con esta persona
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 100 });

				// Filtrar mensajes que contengan bids enviados por el usuario actual
				for (const message of messageHistory) {
					try {
						// Intentar parsear como JSON de bid
						const parsedContent = JSON.parse(message.plaintext);

						// Verificar si es un bid enviado por el usuario actual
						if (parsedContent.type === 'bid' && message.senderPubkey === pubkeyHex) {
							// Asegurar que todos los campos estén presentes
							const completeBid: NostrBid = {
								type: 'bid',
								taskId: parsedContent.taskId || 'unknown',
								taskTitle: parsedContent.taskTitle || 'Untitled Task',
								taskDescription: parsedContent.taskDescription || 'No description available', // Add task description
								amount: parsedContent.amount || 0,
								currency: parsedContent.currency || 'SATS',
								paymentType: parsedContent.paymentType || 'FIXED',
								hourlyRate: parsedContent.hourlyRate || null, // Use null instead of undefined
								estimatedHours: parsedContent.estimatedHours || null, // Use null instead of undefined
								description: parsedContent.description || '',
								estimatedDuration: parsedContent.estimatedDuration || '',
								proposedApproach: parsedContent.proposedApproach || '',
								coverLetter: parsedContent.coverLetter || '',
								timestamp: parsedContent.timestamp || message.event.created_at * 1000,
								bidId: parsedContent.bidId || `bid-${message.event.id}`,
								// Add new datetime fields
								startDate: parsedContent.startDate || null,
								endDate: parsedContent.endDate || null,
								startTime: parsedContent.startTime || null,
								endTime: parsedContent.endTime || null
							};

							bids.push({
								bid: completeBid,
								senderPubkey: message.senderPubkey,
								event: message.event
							});
						}
					} catch (parseError) {
						// No es un bid válido, continuar
						continue;
					}
				}
			} catch (err) {
				continue;
			}
		}

		// Ordenar por timestamp (más recientes primero)
		return bids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);
	} catch (error) {
		console.error('Error al obtener mis bids:', error);
		throw error;
	}
}
