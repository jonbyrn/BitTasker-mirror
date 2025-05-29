// Types
export interface NostrProfileImage {
    url: string;
    type: string;
    alt: string;
    key: string;
    isPrimary?: boolean;
    size?: number;
}

export interface NostrProfile {
    name?: string;
    displayName?: string;
    about?: string;
    pictures?: NostrProfileImage[];
    banner?: string;
    website?: string;
    nip05?: string;
    lud16?: string;
    professionalTitle?: string;
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
}

export interface PortfolioItem {
    id?: string;
    title: string;
    description: string;
    completionDate: string;
    skills: string[];
    images: NostrProfileImage[];
    tags?: string[][];
    category?: string;
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