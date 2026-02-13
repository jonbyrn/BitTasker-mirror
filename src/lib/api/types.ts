/**
 * API Types
 *
 * This file contains TypeScript type definitions for API requests and responses.
 */

// ----- Auth Types ----- //

export interface UserLocation {
	addressLine1: string;
	addressLine2?: string;
	city: string;
	state: string;
	postalCode: string;
	country: string;
	latitude: number;
	longitude: number;
}

// ----- Task Types ----- //

export interface Task {
	id: string;
	title: string;
	description: string;
	status: string;
	// Add other task fields as needed
}

// Add more types as needed
