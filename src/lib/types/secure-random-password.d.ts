declare module 'secure-random-password' {
	interface PasswordOptions {
		length?: number;
		characters?: Array<{
			characters: string;
			exactly?: number;
		}>;
		avoid?: string;
		prefer?: string;
	}

	export function randomPassword(options?: PasswordOptions): string;
	export function randomString(options?: PasswordOptions): string;
	export const lower: string;
	export const upper: string;
	export const consonants: string;
	export const vowels: string;
	export const digits: string;
	export const symbols: string;
	export const fullSymbols: string;
	export const copyableSymbols: string;
} 