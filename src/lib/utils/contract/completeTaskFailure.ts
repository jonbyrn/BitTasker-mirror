import type { CompleteTaskErrorCode } from '$lib/utils/contract/lifecycle/types';

export function completeTaskErrorKey(code: CompleteTaskErrorCode | undefined): string {
	switch (code) {
		case 'timeout':
			return 'dashboard.contracts.timeline.completion.error_timeout';
		case 'confirm_timeout':
			return 'dashboard.contracts.timeline.completion.error_confirm_timeout';
		case 'pending':
			return 'dashboard.contracts.timeline.completion.error_pending';
		case 'in_flight':
			return 'dashboard.contracts.timeline.completion.error_in_flight';
		case 'signer_mismatch':
			return 'dashboard.contracts.timeline.completion.error_signer';
		case 'reverted':
			return 'dashboard.contracts.timeline.completion.error_reverted';
		default:
			return 'dashboard.contracts.timeline.completion.error_generic';
	}
}

type ErrorToast = (
	message: string,
	timeout?: number,
	options?: {
		actions?: { label: string; onClick: () => void }[];
	}
) => number | void;

/**
 * Show a sticky error toast with Retry. Does not navigate or reload.
 * The caller keeps the page and the note the user already typed.
 */
export function presentCompleteTaskFailure(args: {
	showErrorToast: ErrorToast;
	message: string;
	retry: () => void;
}): number {
	return (
		args.showErrorToast(args.message, 0, {
			actions: [
				{
					label: 'dashboard.contracts.timeline.completion.retry',
					onClick: args.retry
				}
			]
		}) ?? -1
	);
}
