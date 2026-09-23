import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { wordlist as spanishWordlist } from '@scure/bip39/wordlists/spanish.js';

// Map language codes to bip39 wordlists
const languageMap: Record<string, string> = {
	'en': 'english',
	'es': 'spanish'
};

const wordlists: Record<string, string[]> = {
	english: englishWordlist,
	spanish: spanishWordlist
};

export const generatePassword = (language: string = 'english'): string => {
	const wordlistName = languageMap[language] || language;
	const wordList = wordlists[wordlistName];
	
	if (!wordList) {
		console.warn(`Language '${language}' not supported, falling back to English`);
		return generatePassword('english');
	}
	
	// Filter words to only include those with 4+ characters
	const filteredWordList = wordList.filter(word => word.length >= 4);
	
	if (filteredWordList.length === 0) {
		console.warn(`No words with 4+ characters found for language '${language}', using original wordlist`);
		return generatePasswordWithMinLength(wordList);
	}
	
	// Generate password with minimum 20 characters requirement
	return generatePasswordWithMinLength(filteredWordList);
};

/**
 * Generates a 4-word password ensuring minimum length of 20 characters
 */
function generatePasswordWithMinLength(wordList: string[]): string {
	const MIN_LENGTH = 20;
	const MAX_ATTEMPTS = 100; // Prevent infinite loops
	let attempts = 0;
	
	while (attempts < MAX_ATTEMPTS) {
		const selectedWords = [];
		for (let i = 0; i < 4; i++) {
			const randomIndex = Math.floor(Math.random() * wordList.length);
			selectedWords.push(wordList[randomIndex]);
		}
		
		const password = selectedWords.join(' ');
		
		// Check if password meets minimum length requirement (including 3 spaces)
		if (password.length >= MIN_LENGTH) {
			return password;
		}
		
		attempts++;
	}
	
	// Fallback: return the last generated password even if it doesn't meet the requirement
	// This should rarely happen if wordlist has words of reasonable length
	const selectedWords = [];
	for (let i = 0; i < 4; i++) {
		const randomIndex = Math.floor(Math.random() * wordList.length);
		selectedWords.push(wordList[randomIndex]);
	}
	return selectedWords.join(' ');
}

export const generateSpanishPassword = () => {
	return generatePassword('spanish');
};

export const generateEnglishPassword = () => {
	return generatePassword('english');
};
