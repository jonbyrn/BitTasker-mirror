import type { ServiceContractAgreementSnapshot, ServiceContractPricingSnapshot } from '$lib/types/contract';
import type { ServiceQuoteTimelineEntry } from '$lib/types/service-quote';

export interface ServiceQuoteAgreementSummary {
	quoteRequestId: string;
	proposalId: string;
	selectedTierLabel: string | null;
	agreementSnapshot: ServiceContractAgreementSnapshot;
	pricingSnapshot: ServiceContractPricingSnapshot;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	estimatedDuration: string;
}

export function buildServiceQuoteAgreementSummary(
	timeline: ServiceQuoteTimelineEntry | null | undefined
): ServiceQuoteAgreementSummary | null {
	const proposal = timeline?.latestProposal;
	if (!timeline || !proposal) {
		return null;
	}

	const selectedTierId =
		timeline.request.content.tierId ?? proposal.content.pricingSnapshot.tierId ?? undefined;

	return {
		quoteRequestId: timeline.request.content.quoteRequestId,
		proposalId: proposal.content.proposalId,
		selectedTierLabel: selectedTierId ?? null,
		agreementSnapshot: {
			selectedTierId,
			selectedAddOns: timeline.request.content.selectedAddOns,
			rushDelivery: timeline.request.content.rushDelivery,
			deliverables: proposal.content.description,
			inquiryAnswers: timeline.request.content.inquiry.customFormResponses,
			priceSnapshotLabel: `${proposal.content.amountUsdt} USDT`
		},
		pricingSnapshot: proposal.content.pricingSnapshot,
		estimatedStartTime: proposal.content.estimatedStartTime,
		estimatedCompletionTime: proposal.content.estimatedEndTime,
		estimatedDuration: proposal.content.estimatedDuration
	};
}
