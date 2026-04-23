export const SERVICE_CONTRACT_START_BUFFER_SECONDS = 3600;

export interface NormalizedServiceContractSchedule {
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	startWasAdjusted: boolean;
	originalStartTime: number;
	originalCompletionTime: number;
}

export function normalizeServiceContractSchedule(
	estimatedStartTime: number,
	estimatedCompletionTime: number,
	nowSeconds = Math.floor(Date.now() / 1000)
): NormalizedServiceContractSchedule {
	if (
		!Number.isFinite(estimatedStartTime) ||
		!Number.isFinite(estimatedCompletionTime) ||
		estimatedCompletionTime <= estimatedStartTime ||
		estimatedStartTime > nowSeconds
	) {
		return {
			estimatedStartTime,
			estimatedCompletionTime,
			startWasAdjusted: false,
			originalStartTime: estimatedStartTime,
			originalCompletionTime: estimatedCompletionTime
		};
	}

	const nextStartTime = nowSeconds + SERVICE_CONTRACT_START_BUFFER_SECONDS;
	const timeShift = nextStartTime - estimatedStartTime;

	return {
		estimatedStartTime: nextStartTime,
		estimatedCompletionTime: estimatedCompletionTime + timeShift,
		startWasAdjusted: true,
		originalStartTime: estimatedStartTime,
		originalCompletionTime: estimatedCompletionTime
	};
}
