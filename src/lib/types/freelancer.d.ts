export interface Freelancer {
	id: number;
	userId: number;
	professionalTitle: string | null;
	bio: string | null;
	promotionalVideo: string | null;
	yearsExperience: number | null;
	specialties: string[];
	standardRates: number | null;
	tasksCompleted: number;
	bidsSent: number;
	successRate: number | null;
	averageRating: number | null;
	level: number;
	experiencePoints: number;
	reputationScore: number;
	feeDiscount: number;
	monthlyActivityPoints: number;
	verificationLevel: string;
	identityVerified: boolean;
	createdAt: string;
	updatedAt: string;
	user: {
		id: number;
		name: string | null;
		profilePicture: string | null;
	};
}
