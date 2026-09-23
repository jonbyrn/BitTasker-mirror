export interface IContractForReview {
	contractId: string;
	paymentId: string;
	clientPubkey: string;
	freelancerPubkey: string;
	status: string | number | undefined;
	isReviewable(): boolean;
	getReviewableParty(pubkey: string): 'client' | 'freelancer' | null;
}
