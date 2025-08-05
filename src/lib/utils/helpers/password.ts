import { randomPassword } from 'secure-random-password';

export const generatePassword = () => {
	return randomPassword({
		length: 16,
		characters: [
			{ characters: 'abcdefghijklmnopqrstuvwxyz', exactly: 4 },
			{ characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', exactly: 4 },
			{ characters: '0123456789', exactly: 4 },
			{ characters: '!@#$%^&*()_+-=[]{}|;:,.<>?', exactly: 4 }
		]
	});
};
