<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		ContractRune,
		leadingContractStatus,
		readPaidTxid,
		type ContractRuneSnapshot,
		type ContractRuneStatus
	} from '$lib/runes/contract.svelte';
	import {
		CONTRACT_PAYMENT_ASSETS,
		formatPayAmount,
		type ContractPaymentAsset,
		type PaymentSplitConfig
	} from '$lib/types/rgb-contract';
	import type { RgbSeal } from '$lib/services/rgb/types';
	import { getTaskRelay, ndk, setNDKSigner } from '$lib/nostr/ndk';
	import { subscribeContract } from '$lib/services/contracts/contract-sync';
	import KINDS from '$lib/utils/constants/kinds';
	import {
		contractBidId,
		contractStatusKey,
		contractTaskId
	} from '$lib/utils/contract/contract-tabs';
	import { fetchContractBid, fetchFundingInvoice, lockBidAmount } from '$lib/utils/nostr-bid';
	import { invoiceMatchesAmount } from '$lib/services/rgb/escrow-rail';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { prefetchPasskeyChallenge } from '$lib/utils/helpers/biometrics';
	import { requirePasskeyApproval } from '$lib/utils/helpers/passkey-approval';
	import { normalizeNostrPubkey } from '$lib/utils/nostr-pubkey';
	import { initWasm } from '$lib/wasm/init-wasm';
	import { t } from 'svelte-i18n';
	import { contractDisplayAmount, contractPayUnits } from '$lib/utils/ui/money-display';
	import { shouldKeepLocalStatus } from '$lib/utils/ui/contract-status-rank';
	import { createSingleFlight, withNextStep } from '$lib/utils/ui/single-flight';
	import ActionButton from '$lib/components/design/ActionButton.svelte';
	import ListRegion from '$lib/components/design/ListRegion.svelte';
	import TextField from '$lib/components/design/TextField.svelte';
	import { walletManager } from '$lib/stores/wallet/wallet-manager';
	import { walletBlocksAction, walletConnectionStore } from '$lib/stores/wallet/wallet-link';
	import { paymentCardHeading } from '$lib/stores/wallet/wallet-connection';
	import WalletActionGate from '$lib/components/wallet/WalletActionGate.svelte';
	import { describeThrown } from '$lib/stores/wallet/wallet-send';
	import { settlementSendReason } from '$lib/stores/wallet/plain-wallet';
	import { readEscrowResume, type EscrowResume } from '$lib/utils/contract/escrow-resume';
	import { decodeRgbInvoice } from '$lib/stores/wallet/decode-rgb-invoice';
	import { recordEscrowHistory } from '$lib/stores/wallet/escrow-history';
	import EscrowInvoiceActions from '$lib/components/bidding/EscrowInvoiceActions.svelte';
	import ReviewPromptModal from '$lib/components/reviews/ReviewPromptModal.svelte';
	import { BidStatusEnum } from '$lib/utils/enums/bid.enum';
	import CreditAdvanceBadge from '$lib/components/credit/CreditAdvanceBadge.svelte';

	const BTC_SETTLEMENT: PaymentSplitConfig = {
		primaryAsset: 'btc_onchain',
		primaryPercentage: 100,
		secondaryAsset: 'btc_lightning',
		secondaryPercentage: 0
	};
	const USDT_SETTLEMENT: PaymentSplitConfig = {
		primaryAsset: 'usdt_rgb',
		primaryPercentage: 100,
		secondaryAsset: 'btc_lightning',
		secondaryPercentage: 0
	};

	type ContractDetailRole = 'tasker' | 'taskee';
	type ContractStatusContent = Partial<ContractRuneSnapshot> & {
		type?: string;
		message?: string;
		proofUrl?: string;
		workMessage?: string;
		payoutInvoice?: string;
		seals?: Partial<RgbSeal>[];
	};
	type TimelineEntry = {
		id: string;
		status: string;
		message: string;
		createdAt: number;
		proofUrl?: string;
	};

	let { contractId, role }: { contractId: string; role: ContractDetailRole } = $props();

	let loading = $state(true);
	let errorMessage = $state('');
	let rune = $state<ContractRune | null>(null);
	let paidTxid = $state(readPaidTxid(contractId) ?? '');
	let timeline = $state<TimelineEntry[]>([]);
	let workMessage = $state('Work completed and ready for review.');
	let proofUrl = $state('');
	let isReleasing = $state(false);
	let pendingAction = $state<
		'' | 'approve' | 'submit' | 'request' | 'release' | 'cancel' | 'reissue' | 'lock'
	>('');
	let holdStatus = $state<ContractRuneStatus | null>(null);
	let blockRefresh = false;
	const actionFlight = createSingleFlight();
	let reviewingPay = $state(false);
	let taskeePubkey = $state('');
	let loadTimedOut = $state(false);
	let waitingContract = $state(false);
	let postedInvoice = $state('');
	let joining = $state(false);
	let partyKeys = $state<string[]>([]);
	let viewerNpub = $state('');
	let stopSubscription: (() => void) | undefined;
	let nowSec = $state(Math.floor(Date.now() / 1000));
	let reviewOpen = $state(false);
	let reviewReviewee = $state('');

	const snapshot = $derived(rune?.snapshot ?? null);
	const FUNDED_STATUSES = new Set([
		'locked',
		'funded',
		'work_in_progress',
		'work_submitted',
		'approved',
		'settlement_requested',
		'releasing',
		'released_pending',
		'released',
		'settled'
	]);
	const contractIsFunded = $derived(snapshot ? FUNDED_STATUSES.has(snapshot.status) : false);
	const openToJoin = $derived(
		role === 'tasker' &&
			!contractIsFunded &&
			(!snapshot ||
				snapshot.status === 'draft' ||
				snapshot.status === 'failed' ||
				snapshot.status === 'funding')
	);
	const joinUnits = $derived.by(() => {
		if (!snapshot) return 0;
		return contractPayUnits(snapshot);
	});
	const invoiceAttached = $derived(
		Boolean(snapshot?.fundingInvoice) &&
			invoiceMatchesAmount(
				snapshot?.split.primaryAsset ?? 'usdt_rgb',
				snapshot?.fundingInvoice ?? '',
				joinUnits
			)
	);
	const invoiceReady = $derived(
		postedInvoice.length > 0 &&
			invoiceMatchesAmount(snapshot?.split.primaryAsset ?? 'usdt_rgb', postedInvoice, joinUnits)
	);
	const lockedAmountLabel = $derived.by(() => {
		if (!snapshot) return '';
		return contractDisplayAmount({
			lockedAmount: snapshot.lockedAmount,
			lockedCurrency: snapshot.lockedCurrency,
			totalAmountUsd: snapshot.totalAmountUsd,
			primaryAsset: snapshot.split.primaryAsset
		});
	});
	const settlementUnit = $derived(
		snapshot ? CONTRACT_PAYMENT_ASSETS[snapshot.split.primaryAsset] : ''
	);
	const startReached = $derived(
		!snapshot?.estimatedStartTime || nowSec >= snapshot.estimatedStartTime
	);
	const canSubmitDeliverable = $derived(
		role === 'taskee' &&
			startReached &&
			(snapshot?.status === 'funded' || snapshot?.status === 'work_in_progress')
	);
	const waitingForStart = $derived(
		role === 'taskee' &&
			!startReached &&
			(snapshot?.status === 'funded' || snapshot?.status === 'work_in_progress')
	);
	const canApprove = $derived(role === 'tasker' && snapshot?.status === 'work_submitted');
	const payInvoice = $derived(
		(snapshot?.settlementInvoice || snapshot?.payoutInvoice || '').trim()
	);
	const decodedPay = $derived.by(() => {
		if (!payInvoice.startsWith('rgb:')) return null;
		try {
			return decodeRgbInvoice(payInvoice);
		} catch {
			return null;
		}
	});
	const legacyRequest = $derived.by(() => {
		if (snapshot?.status !== 'settlement_requested') return false;
		if (!payInvoice) return true;
		if (snapshot.split.primaryAsset === 'btc_lightning') return !payInvoice.startsWith('ln');
		return !decodedPay || decodedPay.amount === null || decodedPay.amount <= 0;
	});
	const payReady = $derived.by(() => {
		if (!snapshot || legacyRequest) return false;
		if (snapshot.split.primaryAsset === 'btc_lightning') return payInvoice.startsWith('ln');
		return Boolean(decodedPay && decodedPay.amount && decodedPay.amount > 0);
	});
	const canRequestPayment = $derived(
		role === 'taskee' &&
			(snapshot?.status === 'approved' ||
				(snapshot?.status === 'settlement_requested' && legacyRequest))
	);
	const canRelease = $derived(
		role === 'tasker' && snapshot?.status === 'settlement_requested' && !paidTxid
	);
	const canCancel = $derived(
		snapshot != null &&
			[
				'draft',
				'funding',
				'locking',
				'locked',
				'work_in_progress',
				'work_submitted',
				'approved',
				'settlement_requested'
			].includes(snapshot.status)
	);
	const actionPending = $derived(pendingAction !== '');
	const stepIndex = $derived.by(() => {
		const status = snapshot?.status;
		if (paidTxid) return 3;
		if (status === 'released' || status === 'released_pending' || status === 'settled') return 3;
		if (status === 'approved' || status === 'settlement_requested' || status === 'releasing')
			return 2;
		if (status === 'work_in_progress' || status === 'work_submitted') return 1;
		return 0;
	});
	const paymentStatus = $derived(
		paymentCardHeading({
			status: snapshot?.status ?? null,
			fundingState: snapshot?.fundingState ?? null,
			invoicePresent: invoiceReady || invoiceAttached,
			walletPhase: $walletConnectionStore.phase,
			walletHeadline: $walletConnectionStore.headline
		})
	);
	const nextAction = $derived.by(() => {
		const status = snapshot?.status;
		if (status === 'releasing') return $t('dashboard.contracts.status.releasing');
		if (paidTxid) return $t('bids.escrow_next_done');
		if (status === 'released' || status === 'settled') return $t('bids.escrow_next_done');
		if (status === 'settlement_requested') {
			return role === 'tasker' ? $t('bids.escrow_next_pay') : $t('bids.escrow_next_await_pay');
		}
		if (status === 'approved') {
			return role === 'taskee' ? $t('bids.escrow_next_request') : paymentStatus;
		}
		if (status === 'work_submitted') {
			return role === 'tasker' ? $t('bids.escrow_next_review') : paymentStatus;
		}
		if (status === 'locked') return 'Payment was sent. Waiting for confirmation.';
		if (status === 'funded' || status === 'work_in_progress') {
			if (role === 'taskee' && !startReached && snapshot?.estimatedStartTime) {
				return `You can submit work from ${new Date(snapshot.estimatedStartTime * 1000).toLocaleString()}.`;
			}
			return role === 'taskee' ? $t('bids.escrow_next_work') : $t('bids.escrow_next_locked');
		}
		return paymentStatus;
	});
	const statusLabel = $derived.by(() => {
		const status = snapshot?.status;
		if (paidTxid || status === 'released' || status === 'settled') return $t('bids.status_paid');
		if (status === 'releasing' || status === 'released_pending') return $t('bids.status_paying');
		if (status === 'approved' || status === 'settlement_requested') {
			return $t('bids.status_approved');
		}
		if (status === 'work_submitted') return $t('bids.status_submitted');
		if (status === 'work_in_progress') return $t('bids.status_started');
		if (status === 'locked') return 'Confirming payment';
		if (status === 'refunded') return $t('dashboard.contracts.status.refunded');
		if (status === 'funded') return $t('bids.status_locked');
		return snapshot ? $t(contractStatusKey(snapshot.status)) : $t('bids.contract_waiting');
	});
	const paymentSlow = $derived(
		joining ||
			isReleasing ||
			snapshot?.status === 'releasing' ||
			snapshot?.status === 'released_pending' ||
			snapshot?.status === 'locking'
	);
	const escrowBid = $derived(contractBidId(contractId) ?? '');
	const escrowTask = $derived(contractTaskId(contractId) ?? '');
	const invoiceTasker = $derived.by(() => {
		const self = normalizeNostrPubkey(viewerNpub);
		return (
			partyKeys
				.map((key) => normalizeNostrPubkey(key) ?? key)
				.find((key) => key.length > 0 && key !== self) ?? ''
		);
	});
	const statusClass = $derived.by(() => {
		const status = snapshot?.status;
		if (status === 'funded' || status === 'locked') return 'badge-warning';
		if (status === 'work_submitted' || status === 'work_in_progress' || status === 'approved') {
			return 'badge-info';
		}
		if (status === 'released' || status === 'settled') return 'badge-success';
		return 'badge-outline';
	});
	function parseStatusContent(content: string): ContractStatusContent | null {
		try {
			const parsed = JSON.parse(content) as ContractStatusContent;
			return parsed && typeof parsed === 'object' ? parsed : null;
		} catch {
			return null;
		}
	}

	function normalizeSplit(value: unknown): PaymentSplitConfig {
		if (!value || typeof value !== 'object') return BTC_SETTLEMENT;
		const split = value as Partial<PaymentSplitConfig>;
		if (
			split.primaryAsset &&
			typeof split.primaryPercentage === 'number' &&
			split.secondaryAsset &&
			typeof split.secondaryPercentage === 'number'
		) {
			return split as PaymentSplitConfig;
		}
		return BTC_SETTLEMENT;
	}

	function normalizeSeals(content: ContractStatusContent, nextContractId: string): RgbSeal[] {
		return (content.seals ?? []).map((seal, index) => ({
			id: (seal.id ?? `seal-${nextContractId}-${index}`) as RgbSeal['id'],
			contractId: nextContractId as RgbSeal['contractId'],
			contractTitle: seal.contractTitle ?? content.contractTitle,
			bidderComments: seal.bidderComments ?? content.bidderComments,
			invoice: seal.invoice,
			state: seal.state ?? 'INITIATED',
			utxo: seal.utxo,
			assetId: seal.assetId ?? 'btc_onchain',
			amount: seal.amount ?? 0,
			createdAt: seal.createdAt ?? Date.now(),
			updatedAt: seal.updatedAt ?? Date.now()
		}));
	}

	function offerReview(): void {
		if (reviewOpen || typeof sessionStorage === 'undefined') return;
		const remembered = sessionStorage.getItem(`bittasker.review-prompted.${contractId}`);
		if (remembered === '1') return;
		const other = invoiceTasker;
		if (!other) return;
		reviewReviewee = other;
		reviewOpen = true;
	}

	function dismissReview(): void {
		reviewOpen = false;
		try {
			sessionStorage.setItem(`bittasker.review-prompted.${contractId}`, '1');
		} catch {
			// A private session can still close the prompt.
		}
	}

	function errorText(error: unknown, fallback: string): string {
		const blocked = walletBlocksAction();
		if (blocked) return blocked;
		const message = describeThrown(error);
		console.error('[contract] action failed', message);
		const plain = message === 'Send failed' ? fallback : settlementSendReason(message);
		return withNextStep(plain, 'Tap Retry.');
	}

	function openProof(href: string): void {
		window.open(href, '_blank', 'noopener,noreferrer');
	}

	function noteEscrowRow(status: string, title: string | undefined): void {
		const locked = [
			'locked',
			'funded',
			'work_in_progress',
			'work_submitted',
			'approved',
			'settlement_requested',
			'releasing',
			'released_pending',
			'released',
			'settled'
		];
		if (!locked.includes(status)) return;
		recordEscrowHistory({
			contractId,
			title: title || contractId,
			kind: 'lock'
		});
		if (status === 'released' || status === 'settled' || status === 'released_pending') {
			recordEscrowHistory({
				contractId,
				title: title || contractId,
				kind: 'released'
			});
		}
		walletManager.loadTransactions().catch((error: unknown) => {
			console.warn('[contract] escrow history skipped', error);
		});
	}

	async function loadPostedInvoice(): Promise<void> {
		const taskId = contractTaskId(contractId);
		const bidId = contractBidId(contractId);
		if (!taskId || !bidId) return;
		try {
			const invoice = await fetchFundingInvoice(taskId, bidId);
			if (invoice) postedInvoice = invoice;
		} catch (error) {
			console.warn('[contract] invoice lookup failed', error);
		}
	}

	async function ensureDraftRune(): Promise<void> {
		if (rune || role !== 'tasker') return;
		const existing = ContractRune.get(contractId);
		if (existing) {
			rune = existing;
			return;
		}
		const bid = await fetchContractBid(contractId);
		if (!bid) return;
		const locked = lockBidAmount(bid.amount, bid.currency);
		if (!locked) return;
		const sat = locked.lockedCurrency === 'SATS';
		const tasker = normalizeNostrPubkey(await getNpub()) ?? '';
		const bidder = normalizeNostrPubkey(bid.bidderId) ?? bid.bidderId;
		rune = new ContractRune({
			contractId,
			contractTitle: bid.title,
			bidderComments: bid.comments,
			totalAmountUsd: locked.lockedAmount,
			amountSats: sat ? locked.lockedAmount : undefined,
			lockedAmount: locked.lockedAmount,
			lockedCurrency: locked.lockedCurrency,
			split: sat ? BTC_SETTLEMENT : USDT_SETTLEMENT,
			partyPubkeys: [bidder, tasker].filter((key) => key.length > 0)
		});
		if (bid.invoice) postedInvoice = bid.invoice;
	}

	function paymentAsset(value: string): ContractPaymentAsset | null {
		if (
			value === 'usdt_rgb' ||
			value === 'usdt_ln' ||
			value === 'btc_onchain' ||
			value === 'btc_lightning'
		) {
			return value;
		}
		return null;
	}

	function splitFromResume(saved: EscrowResume): PaymentSplitConfig {
		const primary = paymentAsset(saved.primaryAsset);
		const secondary = paymentAsset(saved.secondaryAsset);
		if (primary && secondary && typeof saved.secondaryPercentage === 'number') {
			return {
				primaryAsset: primary,
				primaryPercentage: saved.primaryPercentage,
				secondaryAsset: secondary,
				secondaryPercentage: saved.secondaryPercentage
			};
		}
		return saved.lockedCurrency === 'SATS' ? BTC_SETTLEMENT : USDT_SETTLEMENT;
	}

	function applyResume(saved: EscrowResume): ContractRune {
		const existing = ContractRune.get(saved.contractId);
		const next =
			existing ??
			new ContractRune({
				contractId: saved.contractId,
				contractTitle: saved.contractTitle,
				totalAmountUsd: saved.totalAmountUsd > 0 ? saved.totalAmountUsd : saved.lockedAmount,
				lockedAmount: saved.lockedAmount,
				lockedCurrency: saved.lockedCurrency,
				split: splitFromResume(saved),
				partyPubkeys: saved.partyPubkeys
			});
		const chosen = leadingContractStatus([next.status, saved.status]);
		if (chosen === saved.status) {
			next.status = saved.status as ContractRuneStatus;
			next.workMessage = saved.workMessage;
			next.proofUrl = saved.proofUrl;
			next.settlementInvoice = saved.settlementInvoice;
			next.settlementAmount = saved.settlementAmount;
			if (saved.fundingInvoice) {
				const remembered = next.seals.find((seal) => seal.invoice)?.invoice;
				if (!remembered) {
					next.seals = [
						{
							id: `resume-${saved.contractId}` as RgbSeal['id'],
							contractId: saved.contractId as RgbSeal['contractId'],
							invoice: saved.fundingInvoice,
							state: 'INITIATED',
							assetId: saved.primaryAsset,
							amount: saved.lockedAmount,
							createdAt: saved.savedAt,
							updatedAt: saved.savedAt
						}
					];
				}
			}
		}
		return next;
	}

	async function loadContract(quiet = false): Promise<void> {
		if (blockRefresh) return;
		if (!quiet) {
			loading = true;
			errorMessage = '';
			waitingContract = false;
		}
		try {
			await setNDKSigner();
			loadTimedOut = false;
			const events = await Promise.race([
				ndk.fetchEvents(
					{ kinds: [KINDS.CONTRACT_STATUS], '#r': [contractId], limit: 100 },
					{ closeOnEose: true },
					getTaskRelay()
				),
				new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error('Contract load timed out')), 15_000);
				})
			]);
			const ordered = [...events].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
			const parsedEntries = ordered
				.map((event) => ({ event, content: parseStatusContent(event.content) }))
				.filter(
					(entry): entry is { event: (typeof ordered)[number]; content: ContractStatusContent } =>
						Boolean(entry.content)
				);
			if (parsedEntries.length === 0) {
				const saved = readEscrowResume(contractId);
				if (saved) {
					rune = applyResume(saved);
					waitingContract = false;
					return;
				}
				waitingContract = true;
				if (role === 'tasker') await ensureDraftRune();
				if (!rune && !quiet) errorMessage = $t('bids.contract_waiting');
				return;
			}
			waitingContract = false;
			const keys: string[] = [];
			for (const entry of parsedEntries) {
				for (const tag of entry.event.tags) {
					if (tag[0] === 'p' && tag[1] && !keys.includes(tag[1])) keys.push(tag[1]);
				}
			}
			partyKeys = keys;
			const taskeeEvent = [...parsedEntries]
				.reverse()
				.find((entry) =>
					['work_submitted', 'settlement_requested', 'funding', 'work_in_progress'].includes(
						entry.content.status ?? ''
					)
				);
			if (taskeeEvent?.event.pubkey) taskeePubkey = taskeeEvent.event.pubkey;

			const entryStatus = (entry: (typeof parsedEntries)[number]): string =>
				entry.content.status ?? entry.event.tags.find((tag) => tag[0] === 's')?.[1] ?? 'funded';
			const saved = readEscrowResume(contractId);
			const relayStatus = leadingContractStatus(parsedEntries.map(entryStatus));
			const leading = saved ? leadingContractStatus([saved.status, relayStatus]) : relayStatus;
			const keepSaved = Boolean(saved && leading === saved.status && relayStatus !== saved.status);
			const latest =
				[...parsedEntries].reverse().find((entry) => entryStatus(entry) === leading) ??
				parsedEntries.at(-1);
			if (!latest) {
				errorMessage = $t('bids.contract_waiting');
				return;
			}

			const content = latest.content;
			const split = normalizeSplit(content.split);
			const existingRune = ContractRune.get(contractId);
			const nextRune =
				existingRune ??
				new ContractRune({
					contractId,
					contractTitle: content.contractTitle,
					bidderComments: content.bidderComments,
					totalAmountUsd: content.totalAmountUsd ?? 1,
					lockedAmount: content.lockedAmount ?? content.totalAmountUsd ?? 1,
					lockedCurrency: content.lockedCurrency ?? 'USD',
					amountSats: content.amountSats,
					estimatedStartTime: content.estimatedStartTime,
					split,
					partyPubkeys: latest.event.tags
						.filter((tag) => tag[0] === 'p')
						.map((tag) => tag[1])
						.filter(Boolean)
				});
			const fetchedStatus = leading as ContractRuneStatus;
			if (holdStatus && shouldKeepLocalStatus(holdStatus, fetchedStatus)) {
				nextRune.status = holdStatus;
			} else {
				nextRune.status = fetchedStatus;
				if (holdStatus) holdStatus = null;
			}
			if (entryStatus(latest) === leading) {
				if (content.fundingState) nextRune.fundingState = content.fundingState;
				const restored = normalizeSeals(content, contractId);
				const remembered = nextRune.seals.find((seal) => seal.invoice)?.invoice;
				nextRune.seals =
					remembered && restored[0] && !restored.some((seal) => seal.invoice)
						? [{ ...restored[0], invoice: remembered }, ...restored.slice(1)]
						: restored;
				nextRune.workMessage = content.workMessage ?? content.message;
				nextRune.proofUrl = content.proofUrl;
				nextRune.payoutInvoice = content.payoutInvoice;
				nextRune.settlementInvoice = content.settlementInvoice ?? content.payoutInvoice;
				nextRune.settlementAmount = content.settlementAmount ?? 0;
				nextRune.proofs = content.proofs ?? [];
			}
			if (keepSaved && saved) applyResume(saved);
			rune = nextRune;
			rune.storeResume();
			paidTxid = rune.restorePaid() ?? '';
			if (role === 'tasker' && !isReleasing) {
				void rescuePayout(nextRune);
			} else if (nextRune.status === 'releasing') {
				void nextRune.confirmBroadcast().catch((error: unknown) => {
					console.warn('[contract] payout confirm failed', error);
				});
			}
			noteEscrowRow(leading, content.contractTitle ?? nextRune.snapshot.contractTitle);
			timeline = parsedEntries.map(({ event, content: item }) => ({
				id: event.id ?? `${event.created_at}-${item.status}`,
				status: String(item.status ?? event.tags.find((tag) => tag[0] === 's')?.[1] ?? 'unknown'),
				message: item.message ?? '',
				createdAt: (event.created_at ?? 0) * 1000,
				proofUrl: item.proofUrl
			}));
		} catch (error) {
			const saved = readEscrowResume(contractId);
			if (saved) {
				rune = applyResume(saved);
				waitingContract = false;
				errorMessage = '';
				return;
			}
			const message = error instanceof Error ? error.message : 'Failed to load contract.';
			loadTimedOut = message === 'Contract load timed out';
			errorMessage = withNextStep(
				loadTimedOut ? $t('bids.contract_load_timeout') : message,
				'Tap Retry.'
			);
		} finally {
			loading = false;
		}
	}

	async function handleLockEscrow(): Promise<void> {
		await actionFlight.run(async () => {
			if (!rune || joining) return;
			if (!invoiceAttached && !invoiceReady) return;
			const blocked = walletBlocksAction();
			if (blocked) {
				errorMessage = blocked;
				return;
			}
			pendingAction = 'lock';
			joining = true;
			blockRefresh = true;
			errorMessage = '';
			try {
				await requirePasskeyApproval();
				await initWasm();
				await walletManager.initialize();
				if (!invoiceAttached) await rune.attachFundingInvoice(postedInvoice);
				await rune.payFundingFromWallet();
				holdStatus = 'funded';
				blockRefresh = false;
				await loadContract(true);
			} catch (error) {
				errorMessage = errorText(error, $t('bids.escrow_invoice_failed'));
			} finally {
				await walletManager.releaseRgbLock();
				joining = false;
				blockRefresh = false;
				pendingAction = '';
			}
		});
	}

	async function handleSubmitDeliverable(): Promise<void> {
		await actionFlight.run(async () => {
			if (!rune) return;
			pendingAction = 'submit';
			blockRefresh = true;
			errorMessage = '';
			try {
				await rune.submitWork(workMessage, proofUrl.trim() || undefined);
				holdStatus = 'work_submitted';
				blockRefresh = false;
				await loadContract(true);
			} catch (error) {
				errorMessage = errorText(error, 'Failed to submit deliverable.');
			} finally {
				blockRefresh = false;
				pendingAction = '';
			}
		});
	}

	async function handleApprove(): Promise<void> {
		await actionFlight.run(async () => {
			if (!rune) return;
			pendingAction = 'approve';
			isReleasing = true;
			blockRefresh = true;
			errorMessage = '';
			try {
				await rune.approveWork();
				holdStatus = 'approved';
				blockRefresh = false;
				await loadContract(true);
			} catch (error) {
				errorMessage = errorText(error, 'Failed to approve work.');
			} finally {
				isReleasing = false;
				blockRefresh = false;
				pendingAction = '';
			}
		});
	}

	async function handleRequestPayment(): Promise<void> {
		await actionFlight.run(async () => {
			if (!rune) return;
			const blocked = walletBlocksAction();
			if (blocked) {
				errorMessage = blocked;
				return;
			}
			pendingAction = 'request';
			isReleasing = true;
			blockRefresh = true;
			errorMessage = '';
			try {
				const rail = rune.snapshot.split.primaryAsset;
				await walletManager.initialize({
					skipLsp: rail !== 'btc_lightning' && rail !== 'usdt_ln'
				});
				if (rune.status === 'settlement_requested') rune.status = 'approved';
				await rune.createPayoutInvoice();
				holdStatus = rune.status;
				blockRefresh = false;
				await loadContract(true);
			} catch (error) {
				errorMessage = errorText(error, 'Failed to request payment.');
			} finally {
				await walletManager.releaseRgbLock();
				isReleasing = false;
				blockRefresh = false;
				pendingAction = '';
			}
		});
	}

	async function handleCancel(): Promise<void> {
		await actionFlight.run(async () => {
			if (!rune) return;
			pendingAction = 'cancel';
			isReleasing = true;
			blockRefresh = true;
			errorMessage = '';
			try {
				await rune.cancel();
				holdStatus = 'cancelled';
				blockRefresh = false;
				await loadContract(true);
			} catch (error) {
				errorMessage = errorText(error, 'Failed to cancel the contract.');
			} finally {
				isReleasing = false;
				blockRefresh = false;
				pendingAction = '';
			}
		});
	}

	function handleRelease(): void {
		reviewingPay = true;
	}

	async function handleAskReissue(): Promise<void> {
		await actionFlight.run(async () => {
			if (!rune) return;
			pendingAction = 'reissue';
			isReleasing = true;
			blockRefresh = true;
			errorMessage = '';
			try {
				await rune.askReissue();
				blockRefresh = false;
				await loadContract(true);
			} catch (error) {
				errorMessage = errorText(error, 'Failed to ask for a new invoice.');
			} finally {
				isReleasing = false;
				blockRefresh = false;
				pendingAction = '';
			}
		});
	}

	async function rescuePayout(current: ContractRune): Promise<void> {
		try {
			if (current.status === 'settlement_requested') await current.adoptOpenPayout();
			if (current.status === 'releasing') await current.confirmBroadcast();
			paidTxid = readPaidTxid(contractId) ?? current.restorePaid() ?? paidTxid;
		} catch (error: unknown) {
			console.warn('[contract] payout rescue failed', error);
		}
	}

	async function confirmRelease(): Promise<void> {
		await actionFlight.run(async () => {
			if (!rune || !payReady) return;
			const blocked = walletBlocksAction();
			if (blocked) {
				errorMessage = blocked;
				return;
			}
			pendingAction = 'release';
			isReleasing = true;
			blockRefresh = true;
			errorMessage = '';
			try {
				await requirePasskeyApproval();
				await initWasm();
				await walletManager.initialize();
				await rune.releaseEscrow();
				paidTxid = readPaidTxid(contractId) ?? rune.restorePaid() ?? '';
				holdStatus = rune.status;
				blockRefresh = false;
				await loadContract(true);
				if (rune.status === 'released' || rune.status === 'settled') offerReview();
			} catch (error) {
				paidTxid = readPaidTxid(contractId) ?? '';
				if (rune) paidTxid = rune.restorePaid() ?? paidTxid;
				errorMessage = paidTxid ? '' : errorText(error, 'Failed to release funds.');
			} finally {
				isReleasing = false;
				blockRefresh = false;
				pendingAction = '';
				if (!paidTxid) reviewingPay = false;
			}
		});
	}

	$effect(() => {
		if (!openToJoin) return;
		void loadPostedInvoice();
		const timer = setInterval(() => {
			void loadPostedInvoice();
		}, 5_000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const e2e =
			(window as Window & { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ === true ||
			import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';
		if (!e2e) return;
		const probe = window as Window & {
			__e2eContractSnapshot?: ContractRuneSnapshot | null;
			__e2eReleaseEscrow?: () => Promise<ContractRuneSnapshot>;
		};
		probe.__e2eContractSnapshot = snapshot;
		probe.__e2eReleaseEscrow = rune ? () => rune.releaseEscrow() : undefined;
	});

	$effect(() => {
		const status = snapshot?.status;
		if (status !== 'released' && status !== 'settled') return;
		offerReview();
	});

	onMount(() => {
		const clock = setInterval(() => {
			nowSec = Math.floor(Date.now() / 1000);
		}, 15_000);
		prefetchPasskeyChallenge();
		getNpub()
			.then((npub) => {
				viewerNpub = npub ?? '';
			})
			.catch((error: unknown) => {
				console.warn('[contract] viewer key failed', error);
			});
		stopSubscription = subscribeContract(contractId, () => {
			void loadContract(true);
		});
		void loadContract();
		void initWasm().catch((error) => {
			console.warn('[contract] initWasm failed:', error);
		});
		const refresh = () => {
			if (document.visibilityState === 'visible') void loadContract(true);
		};
		document.addEventListener('visibilitychange', refresh);
		window.addEventListener('focus', refresh);
		const payTimer = setInterval(() => {
			if (!rune || role !== 'tasker' || isReleasing) return;
			void rescuePayout(rune);
		}, 15_000);
		return () => {
			clearInterval(clock);
			clearInterval(payTimer);
			document.removeEventListener('visibilitychange', refresh);
			window.removeEventListener('focus', refresh);
		};
	});

	onDestroy(() => {
		stopSubscription?.();
	});
</script>

<div
	class="mx-auto flex w-full max-w-md flex-col gap-4 p-3 sm:p-6"
	data-testid="contract-detail-view"
>
	<header class="card bg-base-100 border-base-300 border shadow-sm">
		<div class="card-body gap-3 p-5">
			<ul
				class="steps steps-horizontal bt-stepper w-full overflow-x-auto text-xs"
				data-testid="contract-steps"
				aria-label="Contract progress"
			>
				<li
					class="step"
					class:step-primary={Boolean(snapshot) && stepIndex >= 0}
					class:bt-step-current={stepIndex === 0}
				>
					{$t('bids.escrow_step_agreed')}
				</li>
				<li
					class="step"
					class:step-primary={stepIndex >= 1}
					class:bt-step-current={stepIndex === 1}
				>
					{$t('bids.escrow_step_work')}
				</li>
				<li
					class="step"
					class:step-primary={stepIndex >= 2}
					class:bt-step-current={stepIndex === 2}
				>
					{$t('bids.escrow_step_approved')}
				</li>
				<li
					class="step"
					class:step-primary={stepIndex >= 3}
					class:bt-step-current={stepIndex === 3}
				>
					{$t('bids.escrow_step_paid')}
				</li>
			</ul>
			{#if snapshot && (snapshot.status === 'funded' || snapshot.status === 'locked') && !paidTxid}
				<p class="bt-celebrate" role="status" data-testid="escrow-funded-celebration">
					{$t('bids.escrow_funded_celebrate')}
				</p>
			{/if}
			{#if paidTxid || snapshot?.status === 'released' || snapshot?.status === 'settled'}
				<p
					class="bt-celebrate bt-celebrate-paid"
					role="status"
					data-testid="payment-settled-celebration"
				>
					{$t('bids.payment_settled_celebrate')}
				</p>
			{/if}
			<div class="flex items-center justify-between gap-3">
				<p class="text-base-content/60 text-xs font-medium tracking-wide uppercase">
					{role === 'tasker' ? 'Tasker' : 'Taskee'}
				</p>
				<div class="flex flex-wrap items-center justify-end gap-2">
					<span class="badge badge-lg {statusClass}" data-testid="contract-status">{statusLabel}</span>
					<CreditAdvanceBadge jobId={escrowTask} />
				</div>
			</div>
			<h1 class="text-2xl font-bold sm:text-3xl" data-testid="contract-title">
				{snapshot?.contractTitle ?? 'Contract'}
			</h1>
			{#if settlementUnit}
				<div class="flex flex-wrap items-center gap-2">
					<span class="badge badge-primary" data-testid="contract-settlement-unit"
						>{settlementUnit}</span
					>
				</div>
			{/if}
		</div>
	</header>

	{#if errorMessage}
		<div data-testid="contract-error">
			<ListRegion
				status={waitingContract ? 'empty' : 'error'}
				title={waitingContract ? errorMessage : 'Something went wrong'}
				message={waitingContract ? '' : errorMessage}
				actionLabel={!snapshot && !waitingContract ? $t('bids.retry') : ''}
				pending={pendingAction === 'lock' && loading}
				onAction={() => loadContract()}
			/>
		</div>
	{/if}
	{#if loading}
		<ListRegion status="loading" title="Loading contract" />
	{:else if snapshot}
		<section
			class="card bg-base-100 border-base-300 border shadow-sm"
			data-testid="contract-fund-panel"
		>
			<div class="card-body gap-1 p-5">
				<h2 class="text-base font-semibold">Payment</h2>
				<p class="text-base-content/60 text-sm" data-testid="payment-card-status">
					{paymentStatus}
				</p>
				<WalletActionGate />
				<p class="text-2xl font-bold" data-testid="contract-locked-amount">{lockedAmountLabel}</p>
				<p class="bt-next-action text-sm" data-testid="contract-next-action">{nextAction}</p>
				{#if paymentSlow}
					<p class="text-sm" data-testid="payment-usually">{$t('bids.usually_minutes')}</p>
				{/if}
				{#if openToJoin}
					{#if invoiceReady || invoiceAttached}
						<ActionButton
							class="mt-3 w-full"
							onclick={handleLockEscrow}
							disabled={actionPending && pendingAction !== 'lock'}
							pending={pendingAction === 'lock'}
							pendingLabel="Locking escrow…"
							data-testid="pay-funding-from-wallet"
						>
							{$t('bids.lock_escrow', { values: { amount: lockedAmountLabel } })}
						</ActionButton>
					{:else}
						<p class="text-base-content/70 mt-2 text-sm" data-testid="waiting-taskee-invoice">
							{$t('bids.waiting_worker')}
						</p>
					{/if}
				{/if}
				{#if role === 'taskee' && !contractIsFunded && escrowBid && escrowTask}
					<EscrowInvoiceActions
						bidId={escrowBid}
						taskId={escrowTask}
						taskerPubkey={invoiceTasker}
						existingInvoice={snapshot.fundingInvoice ?? postedInvoice}
						status={BidStatusEnum.ACCEPTED}
						amount={snapshot.lockedAmount}
						currency={snapshot.lockedCurrency}
					/>
				{/if}
				{#if paidTxid}
					<p class="font-mono text-xs break-all" data-testid="paid-txid">
						{$t('bids.paid_txid', { values: { txid: paidTxid } })}
					</p>
				{/if}
			</div>
		</section>

		{#if waitingForStart && snapshot?.estimatedStartTime}
			<section class="card bg-base-100 border-base-300 border shadow-sm">
				<div class="card-body gap-2 p-5">
					<h2 class="text-base font-semibold">Submit work</h2>
					<p class="text-sm">
						You can submit work from {new Date(
							snapshot.estimatedStartTime * 1000
						).toLocaleString()}.
					</p>
				</div>
			</section>
		{/if}

		{#if canSubmitDeliverable}
			<section
				class="card bg-base-100 border-base-300 border shadow-sm"
				data-testid="submit-deliverable-panel"
			>
				<div class="card-body gap-3 p-5">
					<h2 class="text-base font-semibold">Deliverable</h2>
					<TextField
						id="deliverable-message"
						label="What you finished"
						multiline
						bind:value={workMessage}
						testId="deliverable-message-input"
					/>
					<TextField
						id="deliverable-proof"
						label="Proof link"
						placeholder="https://"
						bind:value={proofUrl}
						testId="deliverable-proof-url-input"
					/>
					<ActionButton
						class="w-full"
						onclick={handleSubmitDeliverable}
						disabled={actionPending && pendingAction !== 'submit'}
						pending={pendingAction === 'submit'}
						pendingLabel="Submitting…"
						data-testid="submit-deliverable-button"
					>
						Submit deliverable
					</ActionButton>
				</div>
			</section>
		{/if}

		{#if canApprove}
			<section
				class="card bg-base-100 border-base-300 border shadow-sm"
				data-testid="approve-work-panel"
			>
				<div class="card-body gap-3 p-5">
					<h2 class="text-base font-semibold">Review</h2>
					{#if snapshot.workMessage}
						<p class="text-sm whitespace-pre-line" data-testid="submitted-work-message">
							{snapshot.workMessage}
						</p>
					{/if}
					{#if snapshot.proofUrl}
						<button
							class="link link-primary text-sm"
							type="button"
							onclick={() => openProof(snapshot.proofUrl ?? '')}
						>
							Proof
						</button>
					{/if}
					<p class="text-base-content/70 text-sm">{$t('bids.escrow_next_review')}</p>
					<ActionButton
						variant="outline"
						class="w-full"
						onclick={handleApprove}
						disabled={actionPending && pendingAction !== 'approve'}
						pending={pendingAction === 'approve'}
						pendingLabel="Approving…"
						data-testid="approve-work-button"
					>
						Approve work
					</ActionButton>
				</div>
			</section>
		{/if}

		{#if canRequestPayment}
			<section
				class="card bg-base-100 border-base-300 border shadow-sm"
				data-testid="request-payment-panel"
			>
				<div class="card-body gap-3 p-5">
					<h2 class="text-base font-semibold">{$t('bids.request_payment')}</h2>
					<p class="text-base-content/70 text-sm">{$t('bids.escrow_next_request')}</p>
					<ActionButton
						class="w-full"
						onclick={handleRequestPayment}
						disabled={actionPending && pendingAction !== 'request'}
						pending={pendingAction === 'request'}
						pendingLabel="Requesting payment…"
						data-testid="request-payment-button"
					>
						{$t('bids.request_payment')}
					</ActionButton>
				</div>
			</section>
		{/if}

		{#if canRelease}
			<section
				class="card bg-base-100 border-base-300 border shadow-sm"
				data-testid="release-funds-panel"
			>
				<div class="card-body gap-3 p-5">
					<h2 class="text-base font-semibold">{$t('bids.pay_on_approval')}</h2>
					<p class="text-base-content/70 text-sm">{$t('bids.release_pays')}</p>
					{#if legacyRequest}
						<p class="text-sm" data-testid="legacy-settlement">{$t('bids.legacy_settlement')}</p>
						<ActionButton
							variant="outline"
							class="w-full"
							onclick={handleAskReissue}
							disabled={actionPending && pendingAction !== 'reissue'}
							pending={pendingAction === 'reissue'}
							pendingLabel="Requesting…"
							data-testid="request-new-invoice"
						>
							{$t('bids.request_new_invoice')}
						</ActionButton>
					{:else if reviewingPay}
						<div class="flex flex-col gap-1 text-sm" data-testid="escrow-pay-review">
							<p>
								{$t('bids.pay_review_rail')}: {snapshot.split.primaryAsset}
							</p>
							<p>
								{$t('bids.pay_review_recipient')}: {taskeePubkey
									? `${taskeePubkey.slice(0, 8)}…${taskeePubkey.slice(-4)}`
									: $t('bids.contract_waiting')}
							</p>
							<p>
								{$t('bids.pay_review_amount')}: {formatPayAmount(
									snapshot.split.primaryAsset,
									decodedPay?.amount,
									settlementUnit,
									lockedAmountLabel
								)}
							</p>
							{#if decodedPay}
								<p class="break-all">
									{$t('bids.pay_review_invoice')}: {decodedPay.seal}
									{#if decodedPay.expiry}
										· {$t('wallet.invoice_expires')} {decodedPay.expiry}
									{/if}
								</p>
							{/if}
						</div>
						<ActionButton
							variant="success"
							class="glow-soft w-full"
							onclick={confirmRelease}
							disabled={!payReady || (actionPending && pendingAction !== 'release')}
							pending={pendingAction === 'release'}
							pendingLabel="Paying…"
							data-testid="approve-release-funds-button"
						>
							{$t('bids.confirm_pay')}
						</ActionButton>
					{:else}
						<button
							class="btn btn-primary w-full"
							onclick={handleRelease}
							disabled={isReleasing}
							data-testid="review-release-funds-button"
						>
							{$t('bids.pay_on_approval')}
						</button>
					{/if}
				</div>
			</section>
		{/if}

		{#if canCancel}
			<ActionButton
				variant="ghost"
				class="w-full"
				onclick={handleCancel}
				disabled={actionPending && pendingAction !== 'cancel'}
				pending={pendingAction === 'cancel'}
				pendingLabel="Cancelling…"
				data-testid="cancel-contract-button"
			>
				{$t('bids.cancel_contract')}
			</ActionButton>
		{/if}

		<section class="card bg-base-200 border-base-300 border shadow-sm">
			<div class="card-body gap-2 p-5">
				<h2 class="text-base font-semibold">Bid</h2>
				<p
					class="text-base-content/80 text-sm whitespace-pre-line"
					data-testid="contract-bidder-comments"
				>
					{snapshot.bidderComments || 'No bidder comments provided.'}
				</p>
			</div>
		</section>

		<section class="card bg-base-100 border-base-300 border shadow-sm">
			<div class="card-body gap-3 p-5">
				<h2 class="text-base font-semibold">History</h2>
				{#if timeline.length === 0}
					<ListRegion
						status="empty"
						title="No contract updates yet"
						message="Updates appear here after escrow, work, and payment."
					/>
				{/if}
				<ol class="flex flex-col gap-3" data-testid="contract-status-timeline">
					{#each timeline as entry (entry.id)}
						<li class="border-base-300 border-l-2 pl-3">
							<div class="text-sm font-medium">{entry.status}</div>
							{#if entry.message}
								<div class="text-base-content/70 text-sm">{entry.message}</div>
							{/if}
							{#if entry.proofUrl}
								<button
									class="link link-primary text-sm"
									type="button"
									onclick={() => openProof(entry.proofUrl ?? '')}>Proof</button
								>
							{/if}
							<div class="text-base-content/50 text-xs">
								{new Date(entry.createdAt).toLocaleString()}
							</div>
						</li>
					{/each}
				</ol>
			</div>
		</section>

		<p class="text-base-content/40 px-1 font-mono text-xs break-all">{contractId}</p>
	{/if}
</div>

<ReviewPromptModal
	isOpen={reviewOpen}
	escrowId={contractId}
	revieweePubkey={reviewReviewee}
	revieweeRole={role === 'tasker' ? 'taskee' : 'tasker'}
	onClose={dismissReview}
	onSubmit={dismissReview}
/>
