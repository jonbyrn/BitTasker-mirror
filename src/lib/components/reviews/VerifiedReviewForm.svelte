<script lang="ts">
	import { t } from 'svelte-i18n';
	import { hasUserReviewedContract } from '$lib/utils/reviews/queries';
	import { ReviewApiError } from '$lib/api/services/reviewsAttestation.service';
	import { buildSignedReviewEvent, submitAttestedReview } from '$lib/utils/reviews/attestation';
	import { resolveContractOutcomeFromStatus } from '$lib/utils/reviews/contractOutcome';
	import { computeReviewDraftHash, reviewEventPayloadSchema } from '@bittasker/reviews-contracts';
	// import { loadPaymentContractDetails } from '$lib/utils/contract/loadPaymentContractDetails';
	import { normalizeNostrPubkey } from '$lib/utils/nostr-pubkey';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { appStore } from '$lib/stores/app.store';
	import { profileStore } from '$lib/stores/profile.store';
	import { user } from '$lib/stores/user.store';
	import { pushNotificationService } from '$lib/api/services/push-notification.service';
	import { getClientOrigin } from '$lib/utils/helpers/clientOrigin';
	import type { TaskeeCategoryRatings, TaskerCategoryRatings } from '$lib/types/review';
	import { createDebug } from '$lib/utils/debug';
	import { portal } from '$lib/utils/portal';
	import IconStar from '~icons/mdi/star';
	import IconAlertTriangle from '~icons/mdi/alert-outline';
	import IconCheck from '~icons/mdi/check';

	const d = createDebug('reviews:form');

	let {
		escrowId,
		revieweePubkey,
		escrowTxHash: _escrowTxHash,
		revieweeRole,
		contract,
		onSubmit,
		onCancel
	} = $props<{
		escrowId: string;
		revieweePubkey: string;
		escrowTxHash?: string;
		revieweeRole?: 'tasker' | 'taskee' | null;
		contract?: import('$lib/utils/reviews/contract-interface').IContractForReview | null;
		onSubmit?: (eventId: string) => void;
		onCancel?: () => void;
	}>();

	const overallRating = $derived.by(() => {
		if (revieweeRole === 'taskee') {
			if (workQualityRating === 0 || experienceRating === 0 || deliverySpeedRating === 0) return 0;
			const avg = (workQualityRating + experienceRating + deliverySpeedRating) / 3;
			return Math.round(avg * 10) / 10;
		} else if (revieweeRole === 'tasker') {
			if (communicationRating === 0 || clarityRating === 0 || paymentTimelinessRating === 0)
				return 0;
			const avg = (communicationRating + clarityRating + paymentTimelinessRating) / 3;
			return Math.round(avg * 10) / 10;
		}
		return 0;
	});

	// Role-specific category ratings
	let workQualityRating = $state(0);
	let experienceRating = $state(0);
	let deliverySpeedRating = $state(0);

	// For Tasker (Client)
	let communicationRating = $state(0);
	let clarityRating = $state(0);
	let paymentTimelinessRating = $state(0);

	let comment = $state('');
	let isSubmitting = $state(false);
	let errors = $state<Record<string, string>>({});
	let alreadyReviewed = $state(false);
	let isCheckingExistingReview = $state(true);
	const hasResolvedRevieweeRole = $derived(revieweeRole === 'tasker' || revieweeRole === 'taskee');
	const legacyAlreadyReviewedCopy =
		'You have already reviewed this escrow. You can update your review by submitting a new one.';
	const getFormText = (key: string, fallback: string, values?: Record<string, number | string>) => {
		const translated = $t(`reviews.form.${key}`, values ? { values } : undefined);
		if (
			translated === `reviews.form.${key}` ||
			(key === 'already_reviewed' && translated === legacyAlreadyReviewedCopy)
		) {
			return fallback;
		}

		return translated;
	};
	const getFormErrorText = (key: string, fallback: string) => {
		const translated = $t(`reviews.form.errors.${key}`);
		return translated === `reviews.form.errors.${key}` ? fallback : translated;
	};

	const BACKEND_ERROR_CODE_MAP: Record<string, string> = {
		resolver_not_found: 'resolver_not_found',
		duplicate_review_slot: 'duplicate_review_slot',
		review_event_invalid: 'review_event_invalid',
		contract_outcome_invalid: 'contract_outcome_invalid',
		nostr_signature_invalid: 'nostr_signature_invalid',
		wallet_signature_invalid: 'wallet_signature_invalid',
		internal_error: 'internal_error',
		missing_reviewee_wallet: 'missing_reviewee_wallet',
		missing_reviewer_wallet: 'missing_reviewer_wallet',
		challenge_invalid: 'challenge_invalid',
		challenge_expired: 'challenge_expired',
		participant_mismatch: 'participant_mismatch',
		settlement_not_reviewable: 'settlement_not_reviewable',
		rate_limited: 'rate_limited',
		attestation_rate_limited: 'rate_limited',
		request_invalid: 'review_payload_invalid'
	};

	const getBackendErrorMessage = (error: unknown): string => {
		if (error instanceof ReviewApiError) {
			const mappedKey = BACKEND_ERROR_CODE_MAP[error.code];
			if (mappedKey) {
				return getFormErrorText(mappedKey, error.message);
			}
			return error.message;
		}
		if (error instanceof Error) {
			if (
				error.message === 'missing_reviewee_wallet' ||
				error.message === 'missing_reviewer_wallet'
			) {
				const mappedKey = BACKEND_ERROR_CODE_MAP[error.message];
				if (mappedKey) {
					return getFormErrorText(mappedKey, error.message);
				}
			}
			return error.message;
		}
		return getFormErrorText('submit_failed', 'Unable to submit review. Please try again.');
	};

	const getCommonText = (key: string, fallback: string) => {
		const translated = $t(`common.${key}`);
		return translated === `common.${key}` ? fallback : translated;
	};
	const getRatingAriaLabel = (
		key:
			| 'rate_work_quality_aria'
			| 'rate_experience_aria'
			| 'rate_delivery_speed_aria'
			| 'rate_communication_aria'
			| 'rate_clarity_aria'
			| 'rate_payment_timeliness_aria',
		rating: number
	) =>
		getFormText(
			key,
			{
				rate_work_quality_aria: `Rate work quality ${rating} out of 5`,
				rate_experience_aria: `Rate experience ${rating} out of 5`,
				rate_delivery_speed_aria: `Rate delivery speed ${rating} out of 5`,
				rate_communication_aria: `Rate communication ${rating} out of 5`,
				rate_clarity_aria: `Rate clarity ${rating} out of 5`,
				rate_payment_timeliness_aria: `Rate payment timeliness ${rating} out of 5`
			}[key],
			{ rating }
		);

	// Check if user has already reviewed
	$effect(() => {
		let cancelled = false;
		isCheckingExistingReview = true;

		(async () => {
			try {
				const reviewerPubkey = await getNpub();
				if (reviewerPubkey) {
					const reviewed = await hasUserReviewedContract(escrowId, escrowId, reviewerPubkey);
					if (!cancelled) {
						alreadyReviewed = reviewed;
					}
				} else if (!cancelled) {
					alreadyReviewed = false;
				}
			} catch (error) {
				d.error('Failed to load existing review status:', error);
				if (!cancelled) {
					alreadyReviewed = false;
				}
			} finally {
				if (!cancelled) {
					isCheckingExistingReview = false;
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	function validateForm(): boolean {
		const newErrors: Record<string, string> = {};

		// Validate role-specific categories
		if (revieweeRole === 'taskee') {
			if (workQualityRating === 0) {
				newErrors.workQuality = getFormErrorText(
					'work_quality_required',
					'Please rate the work quality'
				);
			}
			if (experienceRating === 0) {
				newErrors.experience = getFormErrorText(
					'experience_required',
					'Please rate the experience'
				);
			}
			if (deliverySpeedRating === 0) {
				newErrors.deliverySpeed = getFormErrorText(
					'delivery_speed_required',
					'Please rate the delivery speed'
				);
			}
		} else if (revieweeRole === 'tasker') {
			if (communicationRating === 0) {
				newErrors.communication = getFormErrorText(
					'communication_required',
					'Please rate the communication'
				);
			}
			if (clarityRating === 0) {
				newErrors.clarity = getFormErrorText('clarity_required', 'Please rate the clarity');
			}
			if (paymentTimelinessRating === 0) {
				newErrors.paymentTimeliness = getFormErrorText(
					'payment_timeliness_required',
					'Please rate the payment timeliness'
				);
			}
		} else {
			newErrors.role = getFormText(
				'role_unknown',
				'Unable to determine role. Please ensure contract information is available.'
			);
		}

		if (comment.trim().length > 1000) {
			newErrors.comment = getFormErrorText(
				'comment_too_long',
				'Comment cannot exceed 1000 characters'
			);
		}

		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}

	async function resolveWallets(): Promise<{ tasker: string; taskee: string } | null> {
		if (!contract) return null;
		const paymentId = contract.paymentId?.trim();
		const contractAddress = contract.contractAddress?.trim();
		if (!paymentId || !contractAddress) return null;

		try {
			const data = await loadPaymentContractDetails(paymentId, contractAddress, 'rsk');
			if (data?.tasker && data?.taskee) {
				return { tasker: data.tasker, taskee: data.taskee };
			}
		} catch (err) {
			d.error('resolveWallets: chain read failed', err);
		}
		return null;
	}

	async function sendReviewNotification(revieweePubkey: string) {
		try {
			const reviewerPubkey = await getNpub();
			if (!reviewerPubkey) return;
			const reviewerName = $profileStore.data?.name || $user.name || 'Someone';

			await pushNotificationService.sendNotificationToNpubs({
				npubs: [revieweePubkey],
				title:
					$t('reviews.notification.title', { values: { reviewerName } }) ||
					`${reviewerName} sent you a review`,
				body: $t('reviews.notification.body') || 'Rate them back!',
				type: 'review_received',
				clickAction: `${getClientOrigin()}/reviews`
			});
		} catch {
			// Silently fail — notification is best-effort, review was submitted
		}
	}

	async function handleSubmit() {
		if (isCheckingExistingReview || !validateForm() || isSubmitting || alreadyReviewed) {
			return;
		}

		isSubmitting = true;

		try {
			let categoryRatings: TaskeeCategoryRatings | TaskerCategoryRatings;

			if (revieweeRole === 'taskee') {
				categoryRatings = {
					workQuality: workQualityRating,
					experience: experienceRating,
					deliverySpeed: deliverySpeedRating
				};
			} else if (revieweeRole === 'tasker') {
				categoryRatings = {
					communication: communicationRating,
					clarity: clarityRating,
					paymentTimeliness: paymentTimelinessRating
				};
			} else {
				throw new Error(
					getFormText(
						'role_unknown',
						'Unable to determine role. Please ensure contract information is available.'
					)
				);
			}

			let eventId: string;

			// Use attestation flow when IContractForReview is provided
			const normalizedReviewee = normalizeNostrPubkey(revieweePubkey) ?? revieweePubkey;
			if (contract) {
				// Map reviewee role to both roles
				const resolvedReviewerRole: 'tasker' | 'taskee' =
					revieweeRole === 'taskee' ? 'tasker' : 'taskee';
				const resolvedRevieweeRole: 'tasker' | 'taskee' =
					revieweeRole === 'taskee' ? 'taskee' : 'tasker';

				const walletForChainRole = (role: 'tasker' | 'taskee'): string => {
					const w =
						role === 'taskee'
							? contract.taskeeWalletAddress?.trim()
							: contract.taskerWalletAddress?.trim();
					return w ?? '';
				};
				let revieweeWalletResolved = walletForChainRole(resolvedRevieweeRole);
				let reviewerWalletResolved = walletForChainRole(resolvedReviewerRole);

				if (!revieweeWalletResolved || !reviewerWalletResolved) {
					const wallets = await resolveWallets();
					if (wallets) {
						revieweeWalletResolved =
							resolvedRevieweeRole === 'taskee' ? wallets.taskee : wallets.tasker;
						reviewerWalletResolved =
							resolvedReviewerRole === 'taskee' ? wallets.taskee : wallets.tasker;
					}
				}

				if (!revieweeWalletResolved || !reviewerWalletResolved) {
					appStore.showErrorToast(
						getFormErrorText(
							'missing_party_wallet_addresses',
							'Counterparty wallet addresses could not be resolved. Please try again.'
						)
					);
					isSubmitting = false;
					return;
				}

				const createdAt = Math.floor(Date.now() / 1000);
				const trimmedComment = comment.trim();
				const contractOutcome = resolveContractOutcomeFromStatus(contract.status);

				const payloadWithoutHash = {
					schemaVersion: 1 as const,
					subjectType: 'task' as const,
					settlementType: contract.settlementType,
					revieweePubkey: normalizedReviewee,
					reviewerRole: resolvedReviewerRole,
					revieweeRole: resolvedRevieweeRole,
					contractOutcome,
					createdAt,
					rating: { overallRating, categoryRatings: { ...categoryRatings } },
					content: {
						sourceLanguage: 'en' as const,
						en: { comment: trimmedComment },
						es: { comment: trimmedComment }
					},
					attachments: [] as []
				};

				const reviewDraftHash = await computeReviewDraftHash(payloadWithoutHash);
				const eventPayload = reviewEventPayloadSchema.parse({
					...payloadWithoutHash,
					reviewDraftHash
				});

				const signedEvent = await buildSignedReviewEvent(eventPayload, [
					['p', normalizedReviewee],
					['e', contract.contractId]
				]);

				const attestationAsset = contract.asset === 'usdt' ? 'usdt' : 'rbtc';

				const result = await submitAttestedReview({
					reviewDraftHash,
					signedReviewEvent: signedEvent,
					subjectType: 'task',
					subjectId: contract.contractId,
					settlementType: contract.settlementType,
					settlementId: contract.paymentId,
					chain: 'rsk',
					asset: attestationAsset,
					contractAddress: contract.contractAddress,
					revieweeNpub: normalizedReviewee,
					revieweeWallet: revieweeWalletResolved,
					reviewerWallet: reviewerWalletResolved,
					expectedContractOutcome: contractOutcome
				});

				eventId = result.attestationEventId;
			} else {
				throw new Error(
					'Contract information is required to submit a review via the attestation flow.'
				);
			}

			appStore.showSuccessToast(getFormText('success', 'Review submitted successfully!'));

			sendReviewNotification(normalizedReviewee);

			onSubmit?.(eventId);
		} catch (error) {
			d.error('Failed to submit review:', error);
			appStore.showErrorToast(getBackendErrorMessage(error));
		} finally {
			isSubmitting = false;
		}
	}

	function setRating(
		category:
			| 'workQuality'
			| 'experience'
			| 'deliverySpeed'
			| 'communication'
			| 'clarity'
			| 'paymentTimeliness',
		value: number
	) {
		if (category === 'workQuality') {
			workQualityRating = value;
		} else if (category === 'experience') {
			experienceRating = value;
		} else if (category === 'deliverySpeed') {
			deliverySpeedRating = value;
		} else if (category === 'communication') {
			communicationRating = value;
		} else if (category === 'clarity') {
			clarityRating = value;
		} else if (category === 'paymentTimeliness') {
			paymentTimelinessRating = value;
		}
	}

	function getRatingClass(rating: number, current: number): string {
		if (current === 0) return 'text-base-content/20';
		return current >= rating ? 'text-primary fill-primary' : 'text-base-content/20';
	}

	let hoverState = $state<{ category: string; rating: number } | null>(null);

	function isHovered(category: string, rating: number): boolean {
		return hoverState?.category === category && hoverState.rating >= rating;
	}
	const clipPrefix = `star-clip-${Math.random().toString(36).slice(2, 8)}`;

	function starFillFraction(star: number): number {
		return Math.max(0, Math.min(1, overallRating - star + 1));
	}
</script>

<div class="w-full">
	{#if alreadyReviewed}
		<div class="alert alert-outline alert-warning mb-6">
			<IconAlertTriangle class="h-5 w-5 shrink-0" />
			<span class="text-sm"
				>{getFormText(
					'already_reviewed',
					'You have already reviewed this escrow. Reviews are immutable once submitted.'
				)}</span
			>
		</div>
	{:else if isCheckingExistingReview}
		<div class="text-base-content/60 mb-6 flex items-center gap-2 text-sm">
			<span class="loading loading-spinner loading-sm"></span>
			<span>{getFormText('checking_existing', 'Checking review status...')}</span>
		</div>
	{/if}

	<div class="space-y-6">
		<!-- Category Ratings - Role-Specific -->
		<div class="grid gap-4">
			{#if revieweeRole === 'taskee'}
				<!-- Taskee (Freelancer) Categories -->

				<!-- Work Quality -->
				<div class="form-control">
					<div class="mb-2 flex items-center justify-between">
						<div class="label p-0">
							<span class="text-base-content text-sm font-medium"
								>{getFormText('work_quality', 'Work Quality')}</span
							>
							<span class="text-error ml-1 text-xs">*</span>
						</div>
						{#if workQualityRating > 0}
							<span class="text-base-content/60 text-xs font-medium">{workQualityRating}/5</span>
						{/if}
					</div>
					<p class="text-base-content/50 mb-2 text-xs">
						{getFormText(
							'work_quality_desc',
							'Quality of work delivered, deliverables, and results'
						)}
					</p>
					<div class="star-group flex flex-row-reverse justify-end gap-2">
						{#each [5, 4, 3, 2, 1] as rating (rating)}
							<button
								type="button"
								class="star-btn flex h-7 w-7 items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting ||
								alreadyReviewed
									? 'cursor-not-allowed opacity-50'
									: 'cursor-pointer'}"
								onclick={() => setRating('workQuality', rating)}
								onmouseenter={() => (hoverState = { category: 'workQuality', rating })}
								onmouseleave={() => (hoverState = null)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label={getRatingAriaLabel('rate_work_quality_aria', rating)}
							>
								<IconStar
									class="star-icon h-5 w-5 {isHovered('workQuality', rating)
										? 'text-primary fill-primary'
										: getRatingClass(rating, workQualityRating)} transition-colors duration-200"
								/>
							</button>
						{/each}
					</div>
					{#if errors.workQuality}
						<div class="label">
							<span class="label-text-alt text-error mt-1 text-xs">{errors.workQuality}</span>
						</div>
					{/if}
				</div>

				<!-- Experience -->
				<div class="form-control">
					<div class="mb-2 flex items-center justify-between">
						<div class="label p-0">
							<span class="text-base-content text-sm font-medium"
								>{getFormText('experience', 'Experience')}</span
							>
							<span class="text-error ml-1 text-xs">*</span>
						</div>
						{#if experienceRating > 0}
							<span class="text-base-content/60 text-xs font-medium">{experienceRating}/5</span>
						{/if}
					</div>
					<p class="text-base-content/50 mb-2 text-xs">
						{getFormText(
							'experience_desc',
							'Level of experience, expertise, and skill demonstrated'
						)}
					</p>
					<div class="star-group flex flex-row-reverse justify-end gap-2">
						{#each [5, 4, 3, 2, 1] as rating (rating)}
							<button
								type="button"
								class="star-btn flex h-7 w-7 items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting ||
								alreadyReviewed
									? 'cursor-not-allowed opacity-50'
									: 'cursor-pointer'}"
								onclick={() => setRating('experience', rating)}
								onmouseenter={() => (hoverState = { category: 'experience', rating })}
								onmouseleave={() => (hoverState = null)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label={getRatingAriaLabel('rate_experience_aria', rating)}
							>
								<IconStar
									class="star-icon h-5 w-5 {isHovered('experience', rating)
										? 'text-primary fill-primary'
										: getRatingClass(rating, experienceRating)} transition-colors duration-200"
								/>
							</button>
						{/each}
					</div>
					{#if errors.experience}
						<div class="label">
							<span class="label-text-alt text-error mt-1 text-xs">{errors.experience}</span>
						</div>
					{/if}
				</div>

				<!-- Delivery Speed -->
				<div class="form-control">
					<div class="mb-2 flex items-center justify-between">
						<div class="label p-0">
							<span class="text-base-content text-sm font-medium"
								>{getFormText('delivery_speed', 'Delivery Speed')}</span
							>
							<span class="text-error ml-1 text-xs">*</span>
						</div>
						{#if deliverySpeedRating > 0}
							<span class="text-base-content/60 text-xs font-medium">{deliverySpeedRating}/5</span>
						{/if}
					</div>
					<p class="text-base-content/50 mb-2 text-xs">
						{getFormText(
							'delivery_speed_desc',
							'How quickly work was completed and deadlines were met'
						)}
					</p>
					<div class="star-group flex flex-row-reverse justify-end gap-2">
						{#each [5, 4, 3, 2, 1] as rating (rating)}
							<button
								type="button"
								class="star-btn flex h-7 w-7 items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting ||
								alreadyReviewed
									? 'cursor-not-allowed opacity-50'
									: 'cursor-pointer'}"
								onclick={() => setRating('deliverySpeed', rating)}
								onmouseenter={() => (hoverState = { category: 'deliverySpeed', rating })}
								onmouseleave={() => (hoverState = null)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label={getRatingAriaLabel('rate_delivery_speed_aria', rating)}
							>
								<IconStar
									class="star-icon h-5 w-5 {isHovered('deliverySpeed', rating)
										? 'text-primary fill-primary'
										: getRatingClass(rating, deliverySpeedRating)} transition-colors duration-200"
								/>
							</button>
						{/each}
					</div>
					{#if errors.deliverySpeed}
						<div class="label">
							<span class="label-text-alt text-error mt-1 text-xs">{errors.deliverySpeed}</span>
						</div>
					{/if}
				</div>
			{:else if revieweeRole === 'tasker'}
				<!-- Tasker (Client) Categories -->

				<!-- Communication -->
				<div class="form-control">
					<div class="mb-2 flex items-center justify-between">
						<div class="label p-0">
							<span class="text-base-content text-sm font-medium"
								>{getFormText('communication', 'Communication')}</span
							>
							<span class="text-error ml-1 text-xs">*</span>
						</div>
						{#if communicationRating > 0}
							<span class="text-base-content/60 text-xs font-medium">{communicationRating}/5</span>
						{/if}
					</div>
					<p class="text-base-content/50 mb-2 text-xs">
						{getFormText(
							'communication_desc',
							'Quality of communication, responsiveness, and clarity in interactions'
						)}
					</p>
					<div class="star-group flex flex-row-reverse justify-end gap-2">
						{#each [5, 4, 3, 2, 1] as rating (rating)}
							<button
								type="button"
								class="star-btn flex h-7 w-7 items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting ||
								alreadyReviewed
									? 'cursor-not-allowed opacity-50'
									: 'cursor-pointer'}"
								onclick={() => setRating('communication', rating)}
								onmouseenter={() => (hoverState = { category: 'communication', rating })}
								onmouseleave={() => (hoverState = null)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label={getRatingAriaLabel('rate_communication_aria', rating)}
							>
								<IconStar
									class="star-icon h-5 w-5 {isHovered('communication', rating)
										? 'text-primary fill-primary'
										: getRatingClass(rating, communicationRating)} transition-colors duration-200"
								/>
							</button>
						{/each}
					</div>
					{#if errors.communication}
						<div class="label">
							<span class="label-text-alt text-error mt-1 text-xs">{errors.communication}</span>
						</div>
					{/if}
				</div>

				<!-- Clarity -->
				<div class="form-control">
					<div class="mb-2 flex items-center justify-between">
						<div class="label p-0">
							<span class="text-base-content text-sm font-medium"
								>{getFormText('clarity', 'Clarity')}</span
							>
							<span class="text-error ml-1 text-xs">*</span>
						</div>
						{#if clarityRating > 0}
							<span class="text-base-content/60 text-xs font-medium">{clarityRating}/5</span>
						{/if}
					</div>
					<p class="text-base-content/50 mb-2 text-xs">
						{getFormText(
							'clarity_desc',
							'Clarity of requirements, instructions, and feedback provided'
						)}
					</p>
					<div class="star-group flex flex-row-reverse justify-end gap-2">
						{#each [5, 4, 3, 2, 1] as rating (rating)}
							<button
								type="button"
								class="star-btn flex h-7 w-7 items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting ||
								alreadyReviewed
									? 'cursor-not-allowed opacity-50'
									: 'cursor-pointer'}"
								onclick={() => setRating('clarity', rating)}
								onmouseenter={() => (hoverState = { category: 'clarity', rating })}
								onmouseleave={() => (hoverState = null)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label={getRatingAriaLabel('rate_clarity_aria', rating)}
							>
								<IconStar
									class="star-icon h-5 w-5 {isHovered('clarity', rating)
										? 'text-primary fill-primary'
										: getRatingClass(rating, clarityRating)} transition-colors duration-200"
								/>
							</button>
						{/each}
					</div>
					{#if errors.clarity}
						<div class="label">
							<span class="label-text-alt text-error mt-1 text-xs">{errors.clarity}</span>
						</div>
					{/if}
				</div>

				<!-- Payment Timeliness -->
				<div class="form-control">
					<div class="mb-2 flex items-center justify-between">
						<div class="label p-0">
							<span class="text-base-content text-sm font-medium"
								>{getFormText('payment_timeliness', 'Payment Timeliness')}</span
							>
							<span class="text-error ml-1 text-xs">*</span>
						</div>
						{#if paymentTimelinessRating > 0}
							<span class="text-base-content/60 text-xs font-medium"
								>{paymentTimelinessRating}/5</span
							>
						{/if}
					</div>
					<p class="text-base-content/50 mb-2 text-xs">
						{getFormText(
							'payment_timeliness_desc',
							'Speed of payment processing and payment timeliness'
						)}
					</p>
					<div class="star-group flex flex-row-reverse justify-end gap-2">
						{#each [5, 4, 3, 2, 1] as rating (rating)}
							<button
								type="button"
								class="star-btn flex h-7 w-7 items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 {isSubmitting ||
								alreadyReviewed
									? 'cursor-not-allowed opacity-50'
									: 'cursor-pointer'}"
								onclick={() => setRating('paymentTimeliness', rating)}
								onmouseenter={() => (hoverState = { category: 'paymentTimeliness', rating })}
								onmouseleave={() => (hoverState = null)}
								disabled={isSubmitting || alreadyReviewed}
								aria-label={getRatingAriaLabel('rate_payment_timeliness_aria', rating)}
							>
								<IconStar
									class="star-icon h-5 w-5 {isHovered('paymentTimeliness', rating)
										? 'text-primary fill-primary'
										: getRatingClass(
												rating,
												paymentTimelinessRating
											)} transition-colors duration-200"
								/>
							</button>
						{/each}
					</div>
					{#if errors.paymentTimeliness}
						<div class="label">
							<span class="label-text-alt text-error mt-1 text-xs">{errors.paymentTimeliness}</span>
						</div>
					{/if}
				</div>
			{:else}
				<div class="alert alert-outline alert-warning">
					<IconAlertTriangle class="h-5 w-5 shrink-0" />
					<span class="text-sm"
						>{getFormText(
							'role_unknown',
							'Unable to determine role. Please ensure contract information is available.'
						)}</span
					>
				</div>
				{#if errors.role}
					<div class="label px-0">
						<span class="label-text-alt text-error text-xs">{errors.role}</span>
					</div>
				{/if}
			{/if}
		</div>

		<!-- Divider -->
		<div class="divider my-6">
			<span class="text-base-content/40 text-xs"
				>{getFormText('category_ratings', 'Category Ratings')}</span
			>
		</div>

		<!-- Overall Rating (calculated from category ratings) -->
		<div class="form-control">
			<div class="bg-base-200/50 flex items-center justify-between gap-3 rounded-xl p-4 opacity-80">
				<span class="text-base-content text-base font-semibold">
					{getFormText('overall_rating', 'Overall Rating')}
				</span>
				<div class="flex items-center gap-1.5">
					{#if overallRating > 0}
						<span class="text-base-content/70 text-sm font-medium tabular-nums"
							>{overallRating}/5</span
						>
					{/if}
					{#each [1, 2, 3, 4, 5] as star (star)}
						{@const frac = starFillFraction(star)}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-base-content/15 h-4 w-4"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
							/>
							{#if frac > 0}
								<clipPath id="{clipPrefix}-{star}">
									<rect x="0" y="0" width={frac * 24} height="24" />
								</clipPath>
								<path
									class="fill-primary/60"
									clip-path="url(#{clipPrefix}-{star})"
									d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
								/>
							{/if}
						</svg>
					{/each}
				</div>
			</div>
			<p class="text-base-content/50 mt-2 text-xs">
				{getFormText('overall_rating_calculated', 'Calculated from the category ratings above')}
			</p>
		</div>
		<!-- Comment Section -->
		<div class="form-control border-base-300 border-t pt-4">
			<div class="mb-2 flex items-center justify-between">
				<label class="label p-0" for="review-comment">
					<span class="text-base-content text-sm font-medium"
						>{getFormText('comment', 'Comment (Optional)')}</span
					>
				</label>
				<span
					class="text-base-content/50 text-xs {comment.length > 900
						? 'text-primary'
						: ''} {comment.length >= 1000 ? 'text-error' : ''}"
				>
					{comment.length}/1000
				</span>
			</div>
			<textarea
				id="review-comment"
				class="textarea textarea-bordered focus:ring-primary/20 min-h-[100px] w-full resize-none transition-all focus:ring-2 focus:outline-none {errors.comment
					? 'textarea-error border-error'
					: ''}"
				placeholder={getFormText('comment_placeholder', 'Share your experience...')}
				bind:value={comment}
				maxlength={1000}
				disabled={isSubmitting || alreadyReviewed}
				rows="4"
			></textarea>
			{#if errors.comment}
				<div class="label">
					<span class="label-text-alt text-error mt-1 text-xs">{errors.comment}</span>
				</div>
			{/if}
			<p class="text-base-content/50 mt-2 text-xs">
				{getFormText('subtitle', 'Reviews are public and immutable once submitted.')}
			</p>
		</div>

		<!-- Actions — portalled to Drawer footer so they remain fixed while content scrolls -->
		<div use:portal={'review-form-footer'} class="flex gap-3">
			{#if onCancel}
				<button class="btn btn-ghost btn-outline flex-1" onclick={onCancel} disabled={isSubmitting}>
					{getCommonText('cancel', 'Cancel')}
				</button>
			{/if}
			<button
				class="btn btn-primary flex-1 gap-2"
				onclick={handleSubmit}
				disabled={isSubmitting ||
					isCheckingExistingReview ||
					alreadyReviewed ||
					!hasResolvedRevieweeRole}
			>
				{#if isSubmitting}
					<span class="loading loading-spinner loading-sm"></span>
					<span>{getFormText('submitting', 'Submitting...')}</span>
				{:else}
					<IconCheck class="h-5 w-5" />
					<span>{getFormText('submit', 'Submit')}</span>
				{/if}
			</button>
		</div>
	</div>
</div>
