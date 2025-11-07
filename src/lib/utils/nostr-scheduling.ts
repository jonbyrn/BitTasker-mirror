import { sendDirectMessage, parseDMEvent, getMessageHistory } from './nostr-message';
import { getNostrKeyPair } from './nostrKeys';
import { requestQueueStore } from '$lib/stores/request-queue.store';
import type {
	TimeSlotRequest,
	SoonestAvailableRequest,
	RequestAcceptance,
	EscrowFundedNotification,
	SlotConfirmation,
	AvailabilityResponse,
	RequestCancellation,
	AvailabilityUpdate,
	SchedulingMessage
} from '$lib/types/scheduling';
import { validateTimestamp, validateNonce, generateNonce } from './scheduling-utils';
import { checkSchedulingRateLimit, isUserBlocked } from './scheduling-rate-limiter';
import { validateRequestForAbuse } from './scheduling-abuse-detection';
import { checkAvailabilityStaleness, validateAvailabilityTimestamp } from './staleness-handler';
import type { Event as NostrEvent } from 'nostr-tools';

/**
 * Replay attack prevention - track processed message IDs
 */
const processedMessageIds = new Set<string>();
const PROCESSED_MESSAGES_MAX_SIZE = 10000; // Limit memory usage
const MESSAGE_MAX_AGE_HOURS = 1; // Reject messages older than 1 hour

/**
 * Clean up old processed message IDs periodically
 */
function cleanupProcessedMessages(): void {
	if (processedMessageIds.size > PROCESSED_MESSAGES_MAX_SIZE) {
		// Remove oldest 20% when limit reached
		const toRemove = Math.floor(PROCESSED_MESSAGES_MAX_SIZE * 0.2);
		const entries = Array.from(processedMessageIds).slice(0, toRemove);
		entries.forEach((id) => processedMessageIds.delete(id));
	}
}

/**
 * Validate scheduling message for replay attacks
 */
function validateSchedulingMessage(
	message: SchedulingMessage,
	event: NostrEvent
): { valid: boolean; error?: string } {
	// Check if message ID already processed
	if (processedMessageIds.has(event.id)) {
		return { valid: false, error: 'Message already processed (replay attack)' };
	}

	// Validate nonce format
	if (!validateNonce(message.nonce)) {
		return { valid: false, error: 'Invalid nonce format' };
	}

	// Validate timestamp
	const timestampValidation = validateTimestamp(message.timestamp, MESSAGE_MAX_AGE_HOURS);
	if (!timestampValidation.isValid) {
		return { valid: false, error: timestampValidation.error };
	}

	// Validate event signature (basic check - event should be signed)
	if (!event.sig || event.sig.length === 0) {
		return { valid: false, error: 'Event signature missing' };
	}

	return { valid: true };
}

/**
 * Mark message as processed
 */
function markMessageProcessed(messageId: string): void {
	processedMessageIds.add(messageId);
	cleanupProcessedMessages();
}

/**
 * Clear processed message IDs (for testing)
 */
export function clearProcessedMessageIds(): void {
	processedMessageIds.clear();
}

/**
 * Send time slot request (tasker → taskee)
 */
export async function sendTimeSlotRequest(
	request: Omit<TimeSlotRequest, 'messageType' | 'nonce' | 'timestamp' | 'expiresAt'>,
	expiryMinutes: number = 15
): Promise<void> {
	// Check rate limit
	const rateLimitResult = checkSchedulingRateLimit(request.taskerPubkey, request.requestId);
	if (!rateLimitResult.allowed) {
		throw new Error(
			rateLimitResult.reason || `Rate limit exceeded. Try again after ${new Date(rateLimitResult.resetTime).toISOString()}`
		);
	}

	// Check for abuse patterns
	const existingRequests = requestQueueStore.getAllRequests();
	const abuseCheck = validateRequestForAbuse(
		{
			...request,
			messageType: 'time-slot-request',
			timestamp: Date.now(),
			expiresAt: Date.now() + expiryMinutes * 60 * 1000,
			nonce: generateNonce()
		} as TimeSlotRequest,
		existingRequests
	);

	if (!abuseCheck.valid) {
		throw new Error(abuseCheck.reason || 'Request validation failed');
	}

	const timestamp = Date.now();
	const expiresAt = timestamp + expiryMinutes * 60 * 1000;

	const message: TimeSlotRequest = {
		...request,
		messageType: 'time-slot-request',
		timestamp,
		expiresAt,
		nonce: generateNonce()
	};

	const messageJson = JSON.stringify(message);
	await sendDirectMessage(messageJson, request.taskeePubkey);
}

/**
 * Send soonest available request (tasker → taskee)
 */
export async function sendSoonestAvailableRequest(
	request: Omit<SoonestAvailableRequest, 'messageType' | 'nonce' | 'timestamp' | 'expiresAt'>,
	expiryMinutes: number = 15
): Promise<void> {
	// Check rate limit
	const rateLimitResult = checkSchedulingRateLimit(request.taskerPubkey, request.requestId);
	if (!rateLimitResult.allowed) {
		throw new Error(
			rateLimitResult.reason || `Rate limit exceeded. Try again after ${new Date(rateLimitResult.resetTime).toISOString()}`
		);
	}

	// Check for abuse patterns
	const existingRequests = requestQueueStore.getAllRequests();
	const abuseCheck = validateRequestForAbuse(
		{
			...request,
			messageType: 'soonest-available-request',
			timestamp: Date.now(),
			expiresAt: Date.now() + expiryMinutes * 60 * 1000,
			nonce: generateNonce()
		} as SoonestAvailableRequest,
		existingRequests
	);

	if (!abuseCheck.valid) {
		throw new Error(abuseCheck.reason || 'Request validation failed');
	}

	const timestamp = Date.now();
	const expiresAt = timestamp + expiryMinutes * 60 * 1000;

	const message: SoonestAvailableRequest = {
		...request,
		messageType: 'soonest-available-request',
		timestamp,
		expiresAt,
		nonce: generateNonce()
	};

	const messageJson = JSON.stringify(message);
	await sendDirectMessage(messageJson, request.taskeePubkey);
}

/**
 * Send request acceptance (taskee → tasker)
 */
export async function sendRequestAcceptance(acceptance: Omit<RequestAcceptance, 'nonce' | 'timestamp'>): Promise<void> {
	const message: RequestAcceptance = {
		...acceptance,
		messageType: 'request-acceptance',
		timestamp: Date.now(),
		nonce: generateNonce()
	};

	const messageJson = JSON.stringify(message);
	await sendDirectMessage(messageJson, acceptance.taskerPubkey);
}

/**
 * Send escrow funded notification (tasker → taskee)
 */
export async function sendEscrowFundedNotification(
	notification: Omit<EscrowFundedNotification, 'nonce' | 'timestamp'>
): Promise<void> {
	const message: EscrowFundedNotification = {
		...notification,
		messageType: 'escrow-funded-notification',
		timestamp: Date.now(),
		nonce: generateNonce()
	};

	const messageJson = JSON.stringify(message);
	await sendDirectMessage(messageJson, notification.taskeePubkey);
}

/**
 * Send slot confirmation (taskee → tasker)
 */
export async function sendSlotConfirmation(confirmation: Omit<SlotConfirmation, 'nonce' | 'timestamp'>): Promise<void> {
	const message: SlotConfirmation = {
		...confirmation,
		messageType: 'slot-confirmation',
		timestamp: Date.now(),
		nonce: generateNonce()
	};

	const messageJson = JSON.stringify(message);
	await sendDirectMessage(messageJson, confirmation.taskerPubkey);
}

/**
 * Send availability response (taskee → tasker)
 */
export async function sendAvailabilityResponse(
	response: Omit<AvailabilityResponse, 'nonce' | 'timestamp'>
): Promise<void> {
	const message: AvailabilityResponse = {
		...response,
		messageType: 'availability-response',
		timestamp: Date.now(),
		nonce: generateNonce()
	};

	const messageJson = JSON.stringify(message);
	await sendDirectMessage(messageJson, response.taskerPubkey);
}

/**
 * Send request cancellation (tasker → taskee)
 */
export async function sendRequestCancellation(
	cancellation: Omit<RequestCancellation, 'nonce' | 'timestamp'>
): Promise<void> {
	const message: RequestCancellation = {
		...cancellation,
		messageType: 'request-cancellation',
		timestamp: Date.now(),
		nonce: generateNonce()
	};

	const messageJson = JSON.stringify(message);
	await sendDirectMessage(messageJson, cancellation.taskeePubkey);
}

/**
 * Send availability update (taskee → tasker)
 */
export async function sendAvailabilityUpdate(update: Omit<AvailabilityUpdate, 'nonce' | 'timestamp'>): Promise<void> {
	const message: AvailabilityUpdate = {
		...update,
		messageType: 'availability-update',
		timestamp: Date.now(),
		nonce: generateNonce()
	};

	const messageJson = JSON.stringify(message);
	await sendDirectMessage(messageJson, update.taskeePubkey);
}

/**
 * Handle incoming time slot request (taskee receives)
 */
export async function handleTimeSlotRequest(
	message: TimeSlotRequest,
	event: NostrEvent
): Promise<{ success: boolean; error?: string }> {
	// Validate message
	const validation = validateSchedulingMessage(message, event);
	if (!validation.valid) {
		return { success: false, error: validation.error };
	}

	// Add to request queue
	requestQueueStore.addRequest(message);

	// Mark as processed
	markMessageProcessed(event.id);

	return { success: true };
}

/**
 * Handle incoming soonest available request (taskee receives)
 */
export async function handleSoonestAvailableRequest(
	message: SoonestAvailableRequest,
	event: NostrEvent
): Promise<{ success: boolean; error?: string }> {
	// Validate message
	const validation = validateSchedulingMessage(message, event);
	if (!validation.valid) {
		return { success: false, error: validation.error };
	}

	// Check for abuse patterns before adding to queue
	const existingRequests = requestQueueStore.getAllRequests();
	const abuseCheck = validateRequestForAbuse(message, existingRequests);
	if (!abuseCheck.valid) {
		console.warn('Abuse pattern detected for request:', message.requestId, abuseCheck.reason);
		// Still add to queue but log warning (taskee can review)
		// In production, might want to reject or flag for review
	}

	// Add to request queue
	requestQueueStore.addRequest(message);

	// Mark as processed
	markMessageProcessed(event.id);

	return { success: true };
}

/**
 * Handle incoming request acceptance (tasker receives)
 */
export async function handleRequestAcceptance(
	message: RequestAcceptance,
	event: NostrEvent
): Promise<{ success: boolean; error?: string }> {
	// Validate message
	const validation = validateSchedulingMessage(message, event);
	if (!validation.valid) {
		return { success: false, error: validation.error };
	}

	// Update request status
	requestQueueStore.updateRequestStatus(message.requestId, 'accepted', {
		acceptedTime: {
			startTime: message.acceptedStartTime,
			endTime: message.acceptedEndTime
		}
	});

	// Mark as processed
	markMessageProcessed(event.id);

	return { success: true };
}

/**
 * Handle escrow funded notification (taskee receives)
 */
export async function handleEscrowFundedNotification(
	message: EscrowFundedNotification,
	event: NostrEvent
): Promise<{ success: boolean; error?: string }> {
	// Validate message
	const validation = validateSchedulingMessage(message, event);
	if (!validation.valid) {
		return { success: false, error: validation.error };
	}

	// Update request with escrow ID
	requestQueueStore.updateRequestStatus(message.requestId, 'accepted', {
		escrowId: message.escrowId
	});

	// Mark as processed
	markMessageProcessed(event.id);

	return { success: true };
}

/**
 * Handle slot confirmation (tasker receives)
 * This requires escrow verification before confirmation
 */
export async function handleSlotConfirmation(
	message: SlotConfirmation,
	event: NostrEvent
): Promise<{ success: boolean; error?: string }> {
	// Validate message
	const validation = validateSchedulingMessage(message, event);
	if (!validation.valid) {
		return { success: false, error: validation.error };
	}

	// Verify escrow before allowing confirmation
	try {
		const { verifyEscrowForScheduling } = await import('./escrow-verification');
		const request = requestQueueStore.getRequest(message.requestId);

		if (!request) {
			return { success: false, error: 'Request not found' };
		}

		// Get expected amount from request (would need to be stored or calculated)
		// For now, we'll verify status and parties
		const { verifyEscrowStatus, verifyEscrowParties, verifyEscrowTime } = await import('./escrow-verification');

		const statusResult = await verifyEscrowStatus(message.escrowId);
		if (!statusResult.isValid) {
			return { success: false, error: `Escrow verification failed: ${statusResult.errors.join(', ')}` };
		}

		const partiesResult = await verifyEscrowParties(
			message.escrowId,
			request.taskerPubkey,
			request.taskeePubkey
		);
		if (!partiesResult.isValid) {
			return { success: false, error: `Escrow parties verification failed: ${partiesResult.errors.join(', ')}` };
		}

		if (request.acceptedTime) {
			const timeResult = await verifyEscrowTime(
				message.escrowId,
				request.acceptedTime.startTime,
				request.acceptedTime.endTime
			);
			if (!timeResult.isValid) {
				return { success: false, error: `Escrow time verification failed: ${timeResult.errors.join(', ')}` };
			}
		}
	} catch (verificationError) {
		console.error('Escrow verification error:', verificationError);
		return {
			success: false,
			error: `Failed to verify escrow: ${verificationError instanceof Error ? verificationError.message : 'Unknown error'}`
		};
	}

	// Update request status to confirmed
	requestQueueStore.updateRequestStatus(message.requestId, 'confirmed', {
		escrowId: message.escrowId,
		confirmationTime: message.timestamp
	});

	// Mark as processed
	markMessageProcessed(event.id);

	return { success: true };
}

/**
 * Handle availability response (tasker receives)
 */
export async function handleAvailabilityResponse(
	message: AvailabilityResponse,
	event: NostrEvent
): Promise<{ success: boolean; error?: string }> {
	// Validate message
	const validation = validateSchedulingMessage(message, event);
	if (!validation.valid) {
		return { success: false, error: validation.error };
	}

	// Check for staleness
	const timestampValidation = validateAvailabilityTimestamp(message.timestamp);
	if (!timestampValidation.isValid) {
		console.warn('Stale availability data received:', timestampValidation.error);
		// Still process but log warning
		// In production, might want to request fresh data
	}

	const staleness = checkAvailabilityStaleness(message);
	if (staleness.isStale) {
		console.warn('Availability data is stale:', staleness.message);
		// Could trigger auto-refresh here
	} else if (staleness.isWarning) {
		console.info('Availability data is aging:', staleness.message);
	}

	// Store availability response (could be stored in a separate store or passed to UI)
	// For now, we'll just mark as processed
	// In Phase 6/7, UI components will fetch this when needed

	// Mark as processed
	markMessageProcessed(event.id);

	return { success: true };
}

/**
 * Handle request cancellation (taskee receives)
 */
export async function handleRequestCancellation(
	message: RequestCancellation,
	event: NostrEvent
): Promise<{ success: boolean; error?: string }> {
	// Validate message
	const validation = validateSchedulingMessage(message, event);
	if (!validation.valid) {
		return { success: false, error: validation.error };
	}

	// Update request status to cancelled
	requestQueueStore.updateRequestStatus(message.requestId, 'cancelled');

	// Mark as processed
	markMessageProcessed(event.id);

	return { success: true };
}

/**
 * Handle availability update (tasker receives)
 */
export async function handleAvailabilityUpdate(
	message: AvailabilityUpdate,
	event: NostrEvent
): Promise<{ success: boolean; error?: string }> {
	// Validate message
	const validation = validateSchedulingMessage(message, event);
	if (!validation.valid) {
		return { success: false, error: validation.error };
	}

	// Check for staleness (updates should be fresh)
	const timestampValidation = validateAvailabilityTimestamp(message.timestamp, {
		maxAgeMinutes: 5 // Updates should be very recent
	});
	if (!timestampValidation.isValid) {
		console.warn('Stale availability update received:', timestampValidation.error);
		// Still process but log warning
	}

	const staleness = checkAvailabilityStaleness(message, {
		maxAgeMinutes: 5 // Updates should be fresh
	});
	if (staleness.isStale) {
		console.warn('Availability update is stale:', staleness.message);
	}

	// Store updated availability (similar to availability response)
	// Mark as processed
	markMessageProcessed(event.id);

	return { success: true };
}

/**
 * Parse and route incoming scheduling message
 */
export async function handleIncomingSchedulingMessage(
	plaintext: string,
	event: NostrEvent,
	senderPubkey: string
): Promise<{ success: boolean; error?: string; messageType?: string }> {
	try {
		const message: SchedulingMessage = JSON.parse(plaintext);

		// Route to appropriate handler based on message type
		switch (message.messageType) {
			case 'time-slot-request':
				return await handleTimeSlotRequest(message as TimeSlotRequest, event);

			case 'soonest-available-request':
				return await handleSoonestAvailableRequest(message as SoonestAvailableRequest, event);

			case 'request-acceptance':
				return await handleRequestAcceptance(message as RequestAcceptance, event);

			case 'escrow-funded-notification':
				return await handleEscrowFundedNotification(message as EscrowFundedNotification, event);

			case 'slot-confirmation':
				return await handleSlotConfirmation(message as SlotConfirmation, event);

			case 'availability-response':
				return await handleAvailabilityResponse(message as AvailabilityResponse, event);

			case 'request-cancellation':
				return await handleRequestCancellation(message as RequestCancellation, event);

			case 'availability-update':
				return await handleAvailabilityUpdate(message as AvailabilityUpdate, event);

			default:
				return { success: false, error: `Unknown message type: ${(message as any).messageType}` };
		}
	} catch (error) {
		return {
			success: false,
			error: `Failed to parse scheduling message: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

/**
 * Process incoming DMs and extract scheduling messages
 */
export async function processIncomingSchedulingMessages(): Promise<void> {
	try {
		const { getMessagedPeople } = await import('./nostr-message');

		// Get all people we've exchanged messages with
		const messagedPeople = await getMessagedPeople();

		// Process each conversation for scheduling messages
		for (const person of messagedPeople) {
			try {
				// Get message history with this person
				const { getMessageHistory } = await import('./nostr-message');
				const messageHistory = await getMessageHistory(person.pubkey, { limit: 200 });

				// Process each message
				for (const message of messageHistory) {
					try {
						if (!message.plaintext || message.plaintext.trim() === '') continue;

						// Try to parse as scheduling message
						const parsed = JSON.parse(message.plaintext);
						if (
							parsed.messageType &&
							[
								'time-slot-request',
								'soonest-available-request',
								'request-acceptance',
								'escrow-funded-notification',
								'slot-confirmation',
								'availability-response',
								'request-cancellation',
								'availability-update'
							].includes(parsed.messageType)
						) {
							// This is a scheduling message, process it
							await handleIncomingSchedulingMessage(
								message.plaintext,
								message.event,
								message.senderPubkey
							);
						}
					} catch (parseError) {
						// Not a scheduling message or invalid JSON, continue
						continue;
					}
				}
			} catch (conversationError) {
				console.warn('Failed to process conversation with', person.pubkey, conversationError);
				continue;
			}
		}
	} catch (error) {
		console.error('Error processing incoming scheduling messages:', error);
	}
}

/**
 * Handle request expiry - check and update expired requests
 */
export function handleRequestExpiry(): void {
	requestQueueStore.updateExpiredStatus();
}

