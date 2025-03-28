export interface FacebookUser {
	id: string;
	email: string;
	name: string;
	picture?: {
		data: {
			url: string;
		};
	};
}

export interface FacebookLoginResponse {
	status: 'connected' | 'not_authorized' | 'unknown';
	authResponse?: {
		accessToken: string;
		expiresIn: string;
		signedRequest: string;
		userID: string;
	};
}

export interface FacebookSDK {
	init(params: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }): void;
	getLoginStatus(callback: (response: FacebookLoginResponse) => void): void;
	login(callback: (response: FacebookLoginResponse) => void, params?: { scope: string }): void;
	api(
		path: string,
		params: { fields: string },
		callback: (response: FacebookUser & { error?: any }) => void
	): void;
}

declare global {
	interface Window {
		FB: FacebookSDK;
		fbAsyncInit: () => void;
	}
}
