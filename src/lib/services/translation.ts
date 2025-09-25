import createAxiosInstance from '$lib/api/axios';

interface TranslationResponse {
	data: {
		translations: Array<{
			translatedText: string;
		}>;
	};
}

interface TranslationRequest {
	q: string[];
	source: string;
	target: string;
	format: 'text';
}

class TranslationService {
	private axiosInstance: Awaited<ReturnType<typeof createAxiosInstance>> | null = null;

	private async getAxiosInstance() {
		if (!this.axiosInstance) {
			this.axiosInstance = await createAxiosInstance();
		}
		return this.axiosInstance;
	}

	async translateText(
		texts: string[],
		sourceLanguage: string = 'auto',
		targetLanguage: string = 'es'
	): Promise<string[]> {
		try {
			const axios = await this.getAxiosInstance();
			const response = await axios.post<TranslationResponse>(
				'/api/translate',
				{
					q: texts,
					source: sourceLanguage,
					target: targetLanguage,
					format: 'text'
				} as TranslationRequest
			);

			return response.data.data.translations.map(t => t.translatedText);
		} catch (error) {
			console.error('Translation error:', error);
			throw new Error('Failed to translate text');
		}
	}

	async translateSingleText(
		text: string,
		sourceLanguage: string = 'auto',
		targetLanguage: string = 'es'
	): Promise<string> {
		const results = await this.translateText([text], sourceLanguage, targetLanguage);
		return results[0] || text;
	}
}

export const translationService = new TranslationService();
