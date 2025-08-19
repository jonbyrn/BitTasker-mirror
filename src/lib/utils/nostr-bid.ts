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
	// Agregar este campo para identificar que es un bid
	messageType: 'bid';
}

export interface BidMessage {
	bid: NostrBid; // Los datos del bid
	senderPubkey: string; // Quien envió el bid
	event: NostrEvent; // El evento Nostr
}

/**
 * Submit a bid as an encrypted DM to the task creator
 */
export async function submitBidAsDM(bidData: NostrBid, recipientPubkey: string): Promise<void> {
	try {
		// Agregar el identificador de tipo de mensaje
		const bidWithType = {
			...bidData,
			messageType: 'bid' as const
		};

		// Enviar como DM encriptado
		await sendDirectMessage(JSON.stringify(bidWithType), recipientPubkey);
	} catch (error) {
		console.error('Error al enviar bid como DM:', error);
		throw error;
	}
}

/**
 * Obtener solo los bids de los DMs (excluyendo mensajes normales)
 */
export async function getBidsFromDMs(taskId?: string): Promise<BidMessage[]> {
	try {
		const { nsec, npub } = await getNostrKeyPair();
		const privkey = bytesToHex(nsec);
		const pubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Obtener todas las personas con las que has intercambiado mensajes
		const messagedPeople = await getMessagedPeople();
		const bids: BidMessage[] = [];

		// Para cada conversación, buscar solo mensajes que sean bids
		for (const person of messagedPeople) {
			try {
				// Obtener historial de mensajes con esta persona
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 100 });

				// Filtrar solo mensajes que contengan bids
				for (const message of messageHistory) {
					try {
						const parsedContent = JSON.parse(message.plaintext);

						// Verificar que sea un bid válido
						if (parsedContent.messageType === 'bid' && parsedContent.type === 'bid') {
							// Si se especifica taskId, filtrar por esa tarea
							if (!taskId || parsedContent.taskId === taskId) {
								bids.push({
									bid: parsedContent,
									senderPubkey: message.senderPubkey,
									event: message.event
								});
							}
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
		console.error('Error al obtener bids de DMs:', error);
		throw error;
	}
}

/**
 * Obtener todos los bids para una tarea específica
 */
export async function getTaskBids(taskId: string): Promise<BidMessage[]> {
	return getBidsFromDMs(taskId);
}

/**
 * Obtener todos los bids enviados por el usuario actual
 */
export async function getMyBids(): Promise<BidMessage[]> {
	try {
		const { nsec, npub } = await getNostrKeyPair();
		const privkey = bytesToHex(nsec);
		const pubkeyHex = npub.startsWith('npub') ? (nip19.decode(npub).data as string) : npub;

		// Obtener todas las personas con las que has intercambiado mensajes
		const messagedPeople = await getMessagedPeople();
		const bids: BidMessage[] = [];

		// Para cada conversación, buscar solo bids enviados por el usuario actual
		for (const person of messagedPeople) {
			try {
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 100 });

				for (const message of messageHistory) {
					try {
						const parsedContent = JSON.parse(message.plaintext);

						// Verificar que sea un bid enviado por el usuario actual
						if (parsedContent.messageType === 'bid' && 
							parsedContent.type === 'bid' && 
							message.senderPubkey === pubkeyHex) {
							
							// Asegurar que todos los campos estén presentes
							const completeBid: NostrBid = {
								...parsedContent,
								messageType: 'bid'
							};

							bids.push({
								bid: completeBid,
								senderPubkey: message.senderPubkey,
								event: message.event
							});
						}
					} catch (parseError) {
						continue;
					}
				}
			} catch (err) {
				continue;
			}
		}

		return bids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);
	} catch (error) {
		console.error('Error al obtener mis bids:', error);
		throw error;
	}
}
