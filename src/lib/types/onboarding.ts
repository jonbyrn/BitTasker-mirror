// Define types for the onboarding request
export interface OnboardingRequest {
	userType: 'CLIENT' | 'FREELANCER' | 'BOTH';
	userInfo: {
		fullName: string;
		email: string;
	};
	location: {
		address1: string;
		address2?: string;
		city: string;
		state: string;
		postalCode: string;
		country: string;
		latitude: number;
		longitude: number;
	};
}

// Define the success response type
export interface OnboardingSuccessResponse {
	id: number;
	email: string;
	name: string;
	userRole: string;
	client: Record<string, unknown>;
	freelancer: Record<string, unknown>;
}

// Define the error response type
export interface OnboardingErrorResponse {
	statusCode: number;
	message: string[];
	error: string;
}
