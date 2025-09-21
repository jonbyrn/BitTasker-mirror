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

export interface UserInfo {
	name: string;
	email: string;
}

export type UserType = 'CLIENT' | 'FREELANCER' | 'BOTH';

export interface OnboardingRequest {
	userType: UserType;
	userInfo: UserInfo;
	location: UserLocation;
	profile?: {
		about?: string;
		categories?: string[];
		// Add other profile fields as needed
	};
}

export interface OnboardingResponse {
	id: number;
	email: string;
	name: string;
	userRole: UserType;
	client: null;
	freelancer: null;
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
