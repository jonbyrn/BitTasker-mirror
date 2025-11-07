import type { TimeSlot } from './profile';

/**
 * Scheduling message types for coordinating time slots between taskers and taskees
 */

/**
 * Request status for time slot requests
 */
export type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled' | 'confirmed';

/**
 * Time slot request from tasker to taskee
 */
export interface TimeSlotRequest {
	messageType: 'time-slot-request';
	requestId: string;
	bidId: string;
	taskId: string;
	taskerPubkey: string;
	taskeePubkey: string;
	requestedStartTime: number; // Unix timestamp in milliseconds
	requestedEndTime: number; // Unix timestamp in milliseconds
	timestamp: number; // Unix timestamp in milliseconds - when request was created
	expiresAt: number; // Unix timestamp in milliseconds - when request expires
	nonce: string; // Unique nonce to prevent replay attacks
}

/**
 * Soonest available request - tasker requests earliest available time
 */
export interface SoonestAvailableRequest {
	messageType: 'soonest-available-request';
	requestId: string;
	bidId: string;
	taskId: string;
	taskerPubkey: string;
	taskeePubkey: string;
	preferredTimeRanges?: Array<{
		start: number; // Unix timestamp in milliseconds
		end: number; // Unix timestamp in milliseconds
	}>; // Optional preferred time ranges
	timestamp: number; // Unix timestamp in milliseconds - when request was created
	expiresAt: number; // Unix timestamp in milliseconds - when request expires
	nonce: string; // Unique nonce to prevent replay attacks
}

/**
 * Request acceptance - taskee accepts request and asks tasker to fund escrow
 */
export interface RequestAcceptance {
	messageType: 'request-acceptance';
	requestId: string;
	bidId: string;
	taskId: string;
	taskerPubkey: string;
	taskeePubkey: string;
	acceptedStartTime: number; // Unix timestamp in milliseconds
	acceptedEndTime: number; // Unix timestamp in milliseconds
	timestamp: number; // Unix timestamp in milliseconds - when acceptance was sent
	nonce: string; // Unique nonce to prevent replay attacks
}

/**
 * Escrow funded notification - tasker notifies taskee that escrow is funded
 */
export interface EscrowFundedNotification {
	messageType: 'escrow-funded-notification';
	requestId: string;
	bidId: string;
	taskId: string;
	escrowId: string;
	taskerPubkey: string;
	taskeePubkey: string;
	escrowAmount: string; // Amount in wei or satoshi
	transactionHash: string; // Blockchain transaction hash
	timestamp: number; // Unix timestamp in milliseconds - when escrow was funded
	nonce: string; // Unique nonce to prevent replay attacks
}

/**
 * Slot confirmation - taskee confirms slot after verifying escrow
 */
export interface SlotConfirmation {
	messageType: 'slot-confirmation';
	requestId: string;
	bidId: string;
	taskId: string;
	escrowId: string;
	taskerPubkey: string;
	taskeePubkey: string;
	confirmedStartTime: number; // Unix timestamp in milliseconds
	confirmedEndTime: number; // Unix timestamp in milliseconds
	timestamp: number; // Unix timestamp in milliseconds - when confirmation was sent
	nonce: string; // Unique nonce to prevent replay attacks
}

/**
 * Availability response - taskee sends availability data to tasker
 */
export interface AvailabilityResponse {
	messageType: 'availability-response';
	bidId: string;
	taskId: string;
	taskerPubkey: string;
	taskeePubkey: string;
	timestamp: number; // Unix timestamp in milliseconds - when availability was calculated
	taskWindow: {
		start: number; // Unix timestamp in milliseconds
		end: number; // Unix timestamp in milliseconds
	};
	profileAvailability: {
		timeSlots: TimeSlot[];
		timezone: string;
		noticeHours: number;
		maxBookingsPerDay: number;
		breakBetweenBookings: number; // minutes
	};
	blockedTimes: Array<{
		startTime: number; // Unix timestamp in milliseconds
		endTime: number; // Unix timestamp in milliseconds
		taskId: string; // Which task/contract blocks this time
	}>;
	recommendedTime?: {
		startTime: number; // Unix timestamp in milliseconds
		endTime: number; // Unix timestamp in milliseconds
	}; // Taskee's recommended time slot
	nonce: string; // Unique nonce to prevent replay attacks
}

/**
 * Request cancellation - tasker cancels a pending request
 */
export interface RequestCancellation {
	messageType: 'request-cancellation';
	requestId: string;
	bidId: string;
	taskId: string;
	taskerPubkey: string;
	taskeePubkey: string;
	reason?: string; // Optional reason for cancellation
	timestamp: number; // Unix timestamp in milliseconds - when cancellation was sent
	nonce: string; // Unique nonce to prevent replay attacks
}

/**
 * Availability update - taskee sends updated availability
 */
export interface AvailabilityUpdate {
	messageType: 'availability-update';
	bidId: string;
	taskId: string;
	taskerPubkey: string;
	taskeePubkey: string;
	timestamp: number; // Unix timestamp in milliseconds - when update was sent
	updatedAvailability: AvailabilityResponse; // Updated availability data
	nonce: string; // Unique nonce to prevent replay attacks
}

/**
 * Union type for all scheduling messages
 */
export type SchedulingMessage =
	| TimeSlotRequest
	| SoonestAvailableRequest
	| RequestAcceptance
	| EscrowFundedNotification
	| SlotConfirmation
	| AvailabilityResponse
	| RequestCancellation
	| AvailabilityUpdate;

/**
 * Calculated available slot (client-side calculation)
 */
export interface CalculatedAvailableSlot {
	startTime: number; // Unix timestamp in milliseconds
	endTime: number; // Unix timestamp in milliseconds
	duration: number; // Duration in minutes
}

