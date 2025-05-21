// Types
export interface NostrProfileImage {
    url: string;
    type: string;
    alt: string;
    key: string;
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