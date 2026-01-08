// Types
export interface NostrProfileImage {
    url: string;
    type: string;
    alt: string;
    key: string;
    isPrimary?: boolean;
    size?: number;
}

export interface NostrReview {
    id: string;
    from: string;
    rating: number;
    text: string;
    date: string;
}

export interface ProfileTranslations {
	sourceLanguage: string; // Language of the original content
	translations: {
		[language: string]: {
			professionalTitle: string;
			about: string;
		};
	};
}

export interface NostrProfile {
    // NIP-01 basic fields
    name?: string;
    display_name?: string;
    about?: string;
    
    // NIP-24 extended metadata fields
    picture?: string; // URL to profile picture
    banner?: string; // URL to profile banner/header image
    website?: string; // Personal website URL
    nip05?: string; // NIP-05 verification identifier
    lud16?: string; // Lightning address for zaps
    lud06?: string; // LNURL-pay for zaps (legacy)
    
    // Additional common fields
    professionalTitle?: string;
    location?: string; // Geographic location
    translations?: ProfileTranslations; // Translations for all supported languages
    
    // Deprecated/internal fields (for backwards compatibility)
    pictures?: NostrProfileImage[]; // Legacy field, prefer picture
}

export interface NostrSkill {
    name: string;
    level: number;
    verificationStatus: 'pending' | 'verified' | 'unverified';
    endorsements: number;
    certifications: Array<{
        name: string;
        issuer: string;
        date: string;
        url?: string;
    }>;
}

export interface NostrPortfolioItem {
    title: string;
    description: string;
    url?: string;
    images: NostrProfileImage[];
    tags: string[];
    date: string;
}

export interface NostrProfileData {
    metadata: NostrEvent | null;
    skills: NostrEvent[];
    portfolio: NostrEvent[];
    profileImages: NostrEvent[];
    portfolioImages: NostrEvent[];
    certifications: NostrEvent[];
}

/**
 * Interface for skill certifications
 */
export interface SkillCertification {
    eventId: string;
    skillId: string;
    name: string;
    issuer: string;
    date: string;
    verified: boolean;
    fileUrl: string;
    translations?: CertificationTranslations; // Translations for certification name and issuer
}

/**
 * Interface for skill translations
 */
export interface SkillTranslations {
	sourceLanguage: string; // Language of the original content
	translations: {
		[language: string]: {
			name: string;
		};
	};
}

/**
 * Interface for certification translations
 */
export interface CertificationTranslations {
	sourceLanguage: string; // Language of the original content
	translations: {
		[language: string]: {
			name: string;
			issuer: string;
		};
	};
}

/**
 * Interface for portfolio translations
 */
export interface PortfolioTranslations {
	sourceLanguage: string; // Language of the original content
	translations: {
		[language: string]: {
			title: string;
			description: string;
		};
	};
}

/**
 * Interface for skills
 */
export interface Skill {
    id: string;
    name: string;
    level: number;
    verificationStatus: 'pending' | 'verified' | 'unverified';
    endorsements: number;
    certifications: string[]; // Array of certification event IDs
    translations?: SkillTranslations; // Translations for skill name
}

export interface PortfolioItem {
	link: string;
    id?: string;
    title: string;
    description: string;
    completionDate: string;
    skills: string[];
    images: NostrProfileImage[];
    tags?: string[][];
    category?: string;
    translations?: PortfolioTranslations; // Translations for portfolio title and description
}

export interface TimeSlot {
    day: number; // 0-6 (Sunday-Saturday)
    start: string; // HH:mm format
    end: string; // HH:mm format
}

export interface Availability {
    timeSlots: TimeSlot[];
    timezone: string;
    noticeHours: number;
    maxBookingsPerDay: number;
    breakBetweenBookings: number; // minutes
}

export interface StandardService {
    id?: string;
    name: string;
    description: string;
    duration: number; // minutes
    price: number;
    currency: string;
    isCustomizable: boolean;
}

export interface NostrStandardServices {
    services: StandardService[];
    customQuoteAvailable: boolean;
}

export interface VideoIntroData {
    url: string;
    key: string;
    type: string;
    alt: string;
    size: number;
    duration: number;
}

export interface VideoIntroMetadata {
    video: VideoIntroData;
    thumbnail: NostrProfileImage;
}

export type Profile = {
    name?: string;
    about?: string;
    picture?: string;
    pictures?: NostrProfileImage[];
    website?: string;
    professionalTitle?: string;
    translations?: ProfileTranslations;
    skills?: {
        name: string;
        level: number;
        verificationStatus: 'pending' | 'verified' | 'unverified';
        endorsements: number;
    }[];
    certifications?: {
        name: string;
        issuer: string;
        date: string;
        verified: boolean;
        fileUrl: string;
    }[];
    portfolio?: {
		link?: string;
        id: string;
        title: string;
        description: string;
        images: NostrProfileImage[];
        completionDate: string;
        skills: string[];
    }[];
    availability?: {
        timeSlots: Array<{
            day: number;
            start: string;
            end: string;
        }>;
        timezone: string;
        noticeHours: number;
        maxBookingsPerDay: number;
        breakBetweenBookings: number;
    };
    reviews?: {
        id: string;
        from?: {
            name: string;
            picture?: string;
        };
        rating: number;
        text: string;
        date: string;
    }[];
}; 
