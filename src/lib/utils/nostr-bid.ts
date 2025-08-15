/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { getNostrKeyPair } from './nostrKeys';
import { sendDirectMessage, parseDMEvent, getMessageHistory, getMessagedPeople } from './nostr-message';
import { bytesToHex } from '@noble/hashes/utils';

export interface NostrBid {
	type: 'bid';
	taskId: string;
	amount: number;
	currency: string;
	paymentType: 'FIXED' | 'HOURLY';
	hourlyRate?: number;
	estimatedHours?: number;
	description: string;
	estimatedDuration: string;
	proposedApproach: string;
	coverLetter: string;
	timestamp: number;
	bidId: string;
}

export interface BidMessage {
	bid: NostrBid;           // Los datos del bid
	senderPubkey: string;     // Quien envió el bid
	event: NostrEvent;        // El evento Nostr
}

/**
 * Submit a bid as an encrypted DM to the task creator
 */
export async function submitBidAsDM(bidData: NostrBid, taskCreatorPubkey: string): Promise<void> {
	try {
		// Convertir los datos del bid a JSON y enviar como DM
		const messageContent = JSON.stringify(bidData);
		await sendDirectMessage(messageContent, taskCreatorPubkey);
		
		console.log('Bid enviado exitosamente como DM a:', taskCreatorPubkey);
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
		const pubkeyHex = npub.startsWith('npub') 
			? (nip19.decode(npub).data as string) 
			: npub;

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
				console.error('Error obteniendo mensajes para persona:', person.pubkey, err);
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
		const pubkeyHex = npub.startsWith('npub') 
			? (nip19.decode(npub).data as string) 
			: npub;

		console.log('Buscando bids para usuario:', pubkeyHex);

		// Obtener todas las personas con las que has intercambiado mensajes
		const messagedPeople = await getMessagedPeople();
		console.log('Personas con mensajes:', messagedPeople.length);
		
		const bids: BidMessage[] = [];

		// Para cada conversación, buscar bids enviados por el usuario actual
		for (const person of messagedPeople) {
			try {
				console.log('Revisando conversación con:', person.pubkey);
				
				// Obtener historial de mensajes con esta persona
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 100 });
				console.log('Mensajes en conversación:', messageHistory.length);
				
				// Filtrar mensajes que contengan bids enviados por el usuario actual
				for (const message of messageHistory) {
					try {
						// Intentar parsear como JSON de bid
						const parsedContent = JSON.parse(message.plaintext);
						
						// Verificar si es un bid enviado por el usuario actual
						if (parsedContent.type === 'bid' && message.senderPubkey === pubkeyHex) {
							console.log('Bid encontrado:', parsedContent);
							
							// Asegurar que todos los campos estén presentes
							const completeBid: NostrBid = {
								type: 'bid',
								taskId: parsedContent.taskId || 'unknown',
								amount: parsedContent.amount || 0,
								currency: parsedContent.currency || 'SATS',
								paymentType: parsedContent.paymentType || 'FIXED',
								hourlyRate: parsedContent.hourlyRate,
								estimatedHours: parsedContent.estimatedHours,
								description: parsedContent.description || '',
								estimatedDuration: parsedContent.estimatedDuration || '',
								proposedApproach: parsedContent.proposedApproach || '',
								coverLetter: parsedContent.coverLetter || '',
								timestamp: parsedContent.timestamp || (message.event.created_at * 1000),
								bidId: parsedContent.bidId || `bid-${message.event.id}`
							};
							
							bids.push({
								bid: completeBid,
								senderPubkey: message.senderPubkey,
								event: message.event
							});
							
							console.log('Bid procesado correctamente:', completeBid);
						}
					} catch (parseError) {
						// No es un bid válido, continuar
						console.log('Mensaje no es bid válido:', parseError);
						continue;
					}
				}
			} catch (err) {
				console.error('Error obteniendo mensajes para persona:', person.pubkey, err);
				continue;
			}
		}

		console.log('Total de bids encontrados:', bids.length);
		
		// Ordenar por timestamp (más recientes primero)
		return bids.sort((a, b) => b.bid.timestamp - a.bid.timestamp);
		
	} catch (error) {
		console.error('Error al obtener mis bids:', error);
		throw error;
	}
}
