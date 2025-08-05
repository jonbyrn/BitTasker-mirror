import * as bip39 from 'bip39';

// Map language codes to bip39 wordlists
const languageMap: Record<string, string> = {
	'en': 'english',
	'es': 'spanish',
	'fr': 'french',
	'de': 'german',
	'it': 'italian',
	'pt': 'portuguese',
	'cs': 'czech',
	'ja': 'japanese',
	'ko': 'korean',
	'zh': 'chinese_simplified',
	'zh-TW': 'chinese_traditional'
};

export const generatePassword = (language: string = 'english'): string => {
	const wordlistName = languageMap[language] || language;
	const wordList = bip39.wordlists[wordlistName as keyof typeof bip39.wordlists];
	
	if (!wordList) {
		console.warn(`Language '${language}' not supported, falling back to English`);
		return generatePassword('english');
	}
	
	const selectedWords = [];
	for (let i = 0; i < 4; i++) {
		const randomIndex = Math.floor(Math.random() * wordList.length);
		selectedWords.push(wordList[randomIndex]);
	}
	
	return selectedWords.join(' ');
};

export const generateSpanishPassword = () => {
	return generatePassword('spanish');
};

export const generateEnglishPassword = () => {
	return generatePassword('english');
};
