import type { NostrBid, BidTranslations } from '$lib/types/bid';

/**
 * Tipo para bids que pueden tener traducciones
 */
type BidWithTranslations = {
	translations?: BidTranslations;
	description?: string;
	proposedApproach?: string;
	coverLetter?: string;
};

/**
 * BidTranslationService - Solo lee traducciones almacenadas en eventos Nostr
 * NO hace traducciones bajo demanda - todas las traducciones se hacen al crear la bid
 */
export class BidTranslationService {
	/**
	 * Obtiene la traducción almacenada de un campo de bid (sin llamadas API)
	 * Solo devuelve traducciones que ya están guardadas en el evento Nostr
	 */
	getStoredTranslation(
		bid: BidWithTranslations | null | undefined,
		contentType: 'description' | 'proposedApproach' | 'coverLetter',
		targetLanguage: string
	): string | null {
		if (!bid || !bid.translations) {
			return null;
		}

		// Si el idioma del usuario coincide con el idioma fuente, no hay traducción
		if (bid.translations.sourceLanguage === targetLanguage) {
			return null;
		}

		// Obtener traducción almacenada del evento Nostr
		if (bid.translations.translations && bid.translations.translations[targetLanguage]) {
			const storedTranslation = bid.translations.translations[targetLanguage];
			
			// Retornar la traducción del campo específico
			return storedTranslation[contentType] || null;
		}

		// Si no hay traducción almacenada, retornar null
		// (las bids antiguas sin traducciones mostrarán el original)
		return null;
	}

	/**
	 * Obtiene el contenido traducido o el original si no hay traducción
	 */
	getDisplayContent(
		bid: BidWithTranslations | null | undefined,
		contentType: 'description' | 'proposedApproach' | 'coverLetter',
		targetLanguage: string,
		fallbackContent: string
	): string {
		// Intentar obtener traducción
		const translatedContent = this.getStoredTranslation(bid, contentType, targetLanguage);

		// Retornar traducción si existe, sino el contenido original (fallback)
		return translatedContent || fallbackContent;
	}
}

export const bidTranslationService = new BidTranslationService();

