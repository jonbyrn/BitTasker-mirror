import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ContractActions from '$lib/components/contracts/ContractActions.svelte';
import { EscrowStatus } from '$lib/utils/escrow';

type MockContractStoreState = {
	contract: unknown;
	isDrawerOpen: boolean;
	isResolutionFormOpen: boolean;
};

type MockContractContent = Record<string, unknown>;

const {
	contractStoreState,
	contractStore,
	acceptTask,
	acceptProposal,
	cancelEscrow,
	disputeTask,
	loadEscrowDetails,
	proposeResolution,
	resolveAfterTimelock,
	sendNotificationToNpubs,
	showErrorToast
} = vi.hoisted(() => {
	let value: MockContractStoreState = {
		contract: null,
		isDrawerOpen: false,
		isResolutionFormOpen: false
	};
	const subscribers = new Set<(value: typeof value) => void>();
	const state = {
		subscribe(run: (value: typeof value) => void) {
			run(value);
			subscribers.add(run);
			return () => subscribers.delete(run);
		},
		set(next: typeof value) {
			value = next;
			subscribers.forEach((run) => run(value));
		},
		update(updater: (value: typeof value) => typeof value) {
			state.set(updater(value));
		}
	};

	return {
		contractStoreState: state,
		contractStore: {
			subscribe: state.subscribe,
			set: state.set,
			update: state.update,
			loadContractByEscrowId: vi.fn().mockResolvedValue(true),
			getContractKey: vi.fn(
				(contract: { contractEvent: { content: MockContractContent } }, key: string) => {
					if (key === 'otherPartyNpub') return 'npub1counterparty';
					if (key === 'clientPubkey') return 'npub1client';
					if (key === 'amount') return contract.contractEvent.content.amount;
					if (key === 'taskTitle' || key === 'contextTitle') {
						return contract.contractEvent.content.contextTitle;
					}
					return contract.contractEvent.content[key];
				}
			)
		},
		acceptTask: vi.fn().mockResolvedValue(undefined),
		acceptProposal: vi.fn().mockResolvedValue(undefined),
		cancelEscrow: vi.fn().mockResolvedValue(undefined),
		disputeTask: vi.fn().mockResolvedValue(undefined),
		loadEscrowDetails: vi.fn().mockResolvedValue({ status: 'FUNDED' }),
		proposeResolution: vi.fn().mockResolvedValue(undefined),
		resolveAfterTimelock: vi.fn().mockResolvedValue(undefined),
		sendNotificationToNpubs: vi.fn(),
		showErrorToast: vi.fn()
	};
});

vi.mock('$lib/stores/contract.store', () => ({
	contractStore
}));

vi.mock('$lib/utils/escrow', () => ({
	EscrowStatus: {
		Funded: 'FUNDED',
		Completed: 'COMPLETED',
		Cancelled: 'CANCELLED'
	},
	escrow: {
		escrowOps: {
			acceptTask,
			resolveAfterTimelock,
			loadEscrowDetails,
			completeTask: vi.fn(),
			disputeTask,
			proposeResolution,
			acceptProposal,
			cancelEscrow
		},
		contractOps: {
			deleteContract: vi.fn()
		}
	}
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast,
		showSuccessToast: vi.fn()
	}
}));

vi.mock('$lib/i18n/i18n', () => ({
	loadNamespace: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(100000)
	}
}));

vi.mock('$lib/utils/portal', () => ({
	portal: vi.fn()
}));

vi.mock('$lib/utils/location/sendLocation', () => ({
	sendTaskCompletionMessageToTasker: vi.fn(),
	sendPaymentReleasedMessageToTaskee: vi.fn()
}));

vi.mock('$lib/components/contracts/TaskCompletionModal.svelte', () => ({
	default: () => ({
		$$render: () => ''
	})
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

function buildContract({
	permissions,
	content
}: {
	permissions?: Partial<Record<string, boolean>>;
	content?: Record<string, unknown>;
} = {}) {
	return {
		escrowData: { id: 'svc-123' },
		isPending: false,
		isClient: true,
		blockchainStatus: EscrowStatus.Funded,
		statusEvents: [],
		permissions: {
			canComplete: false,
			canAccept: true,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false,
			...permissions
		},
		contractEvent: {
			created_at: 1_700_000_000,
			id: 'contract-event-1',
			content: {
				contextType: 'service',
				contextTitle: 'Premium logo package',
				amount: '0.01',
				estimatedStartTime: 1_700_000_000,
				...content
			}
		},
		disputeProposal: null
	} as unknown;
}

function createDisputeProposalEvent(pubkey: string) {
	return {
		pubkey,
		content: {
			action: EscrowStatus.DisputeResolutionProposed
		}
	};
}

function buildTaskContract(overrides: { permissions?: Partial<Record<string, boolean>> } = {}) {
	return buildContract({
		permissions: overrides.permissions,
		content: {
			contextType: 'task',
			contextTitle: 'Fix landing page',
			taskTitle: 'Fix landing page'
		}
	});
}

describe('ContractActions service notification continuity', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadEscrowDetails.mockResolvedValue({ status: 'FUNDED' });
		Object.defineProperty(window.navigator, 'onLine', {
			value: true,
			configurable: true
		});
		contractStoreState.set({
			contract: null,
			isDrawerOpen: false,
			isResolutionFormOpen: false
		});
		vi.stubEnv('VITE_CLIENT_URL', 'https://bittasker.test');
	});

	it('sends service accept notifications to the exact highlighted contracts route', async () => {
		render(ContractActions, {
			contract: buildContract(),
			isInline: false
		});

		await fireEvent.click(screen.getAllByRole('button', { name: 'Accept Service' })[0]);
		await fireEvent.click(screen.getAllByRole('button', { name: 'Accept Service' })[1]);

		await waitFor(() => {
			expect(acceptTask).toHaveBeenCalledTimes(1);
		});

		expect(sendNotificationToNpubs).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'payment_released',
				clickAction:
					'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-123'
			})
		);
	});

	it('uses the same highlighted service contracts route for timelock resolution', async () => {
		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canAccept: false,
					canResolveTimelock: true
				}
			}),
			isInline: false
		});

		await fireEvent.click(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.resolve_timelock' })
		);
		expect(resolveAfterTimelock).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Claim Funds' }));

		await waitFor(() => {
			expect(resolveAfterTimelock).toHaveBeenCalledTimes(1);
		});

		expect(sendNotificationToNpubs).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'timelock_resolved',
				clickAction:
					'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-123'
			})
		);
	});

	it('uses service-aware action labels for the shared action buttons', () => {
		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canComplete: true,
					canAccept: true,
					canDispute: true,
					canCancel: true
				}
			}),
			isInline: true,
			maxInlineActions: 2
		});

		expect(screen.getByRole('button', { name: 'Accept Service' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Mark Service Complete' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Dispute Service' })).toBeNull();
		expect(
			screen.queryByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })
		).toBeNull();
	});

	it('shows accept proposal as an inline quick action when a dispute proposal can be accepted', () => {
		const contract = buildContract({
			permissions: {
				canAccept: false,
				canAcceptProposal: true,
				canPropose: true,
				canCancel: true
			},
			content: {
				proposalId: 'proposal-1'
			}
		});
		contract.disputeProposal = {
			clientAmount: '0.004',
			freelancerAmount: '0.006',
			proposer: 'npub1counterparty'
		};

		render(ContractActions, {
			contract,
			isInline: true,
			maxInlineActions: 2
		});

		expect(screen.getByRole('button', { name: 'Accept Proposal' })).toBeInTheDocument();
		expect(
			screen.getByRole('button', {
				name: /dashboard\.contracts\.actions\.counter_proposal/
			})
		).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })
		).toBeNull();
	});

	it('hides drawer counter proposal actions after the user exhausts proposal attempts', () => {
		const contract = buildContract({
			permissions: {
				canAccept: false,
				canAcceptProposal: true,
				canPropose: true
			},
			content: {
				proposalId: 'proposal-1'
			}
		}) as {
			statusEvents: Array<{ pubkey: string; content: { action: string } }>;
			disputeProposal: null | {
				clientAmount: string;
				freelancerAmount: string;
				proposer: string;
			};
		};
		contract.disputeProposal = {
			clientAmount: '0.004',
			freelancerAmount: '0.006',
			proposer: 'npub1counterparty'
		};
		contract.statusEvents = [
			createDisputeProposalEvent('npub1client'),
			createDisputeProposalEvent('npub1client')
		];

		render(ContractActions, {
			contract,
			isInline: false
		});

		expect(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.accept_proposal' })
		).toBeInTheDocument();
		expect(
			screen.queryByRole('button', {
				name: /dashboard\.contracts\.actions\.counter_proposal/
			})
		).toBeNull();
		expect(screen.getByText('dashboard.contracts.actions.no_proposals_left')).toBeInTheDocument();
	});

	it('releases the inline quick-action slot when an accept proposal stops being renderable mid-load', async () => {
		let resolveAcceptProposal: (() => void) | undefined;
		acceptProposal.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveAcceptProposal = resolve;
				})
		);

		const contract = buildContract({
			permissions: {
				canAccept: false,
				canAcceptProposal: true,
				canDispute: true,
				canCancel: true
			},
			content: {
				proposalId: 'proposal-1'
			}
		}) as {
			disputeProposal: null | {
				clientAmount: string;
				freelancerAmount: string;
				proposer: string;
			};
		};
		contract.disputeProposal = {
			clientAmount: '0.004',
			freelancerAmount: '0.006',
			proposer: 'npub1counterparty'
		};

		const view = render(ContractActions, {
			contract,
			isInline: true,
			maxInlineActions: 2
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Accept Proposal' }));
		await fireEvent.click(screen.getAllByRole('button', { name: 'Accept Proposal' })[1]);

		await waitFor(() => {
			expect(acceptProposal).toHaveBeenCalledTimes(1);
		});

		contract.disputeProposal = null;
		view.rerender({
			contract: {
				...contract,
				disputeProposal: null
			},
			isInline: true,
			maxInlineActions: 2
		});

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Dispute Service' })).toBeInTheDocument();
		});
		expect(screen.getAllByRole('button', { name: 'Accept Proposal' })).toHaveLength(1);
		resolveAcceptProposal?.();
	});

	it('limits inline quick actions to the highest-priority two actions', () => {
		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canAccept: true,
					canDispute: true,
					canCancel: true
				}
			}),
			isInline: true,
			maxInlineActions: 2
		});

		expect(screen.getByRole('button', { name: 'Accept Service' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Dispute Service' })).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })
		).toBeNull();
	});

	it('requires confirmation before accepting a proposal', async () => {
		const contract = buildContract({
			permissions: {
				canAccept: false,
				canAcceptProposal: true
			},
			content: {
				proposalId: 'proposal-1'
			}
		});
		contract.disputeProposal = {
			clientAmount: '0.004',
			freelancerAmount: '0.006',
			proposer: 'npub1counterparty'
		};

		render(ContractActions, {
			contract,
			isInline: false
		});

		await fireEvent.click(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.accept_proposal' })
		);
		expect(acceptProposal).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Accept Proposal' }));

		await waitFor(() => {
			expect(acceptProposal).toHaveBeenCalledTimes(1);
		});
	});

	it('requires confirmation before submitting a resolution proposal', async () => {
		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canAccept: false,
					canPropose: true
				}
			}),
			isInline: false
		});

		await fireEvent.click(
			screen.getByRole('button', {
				name: /dashboard\.contracts\.actions\.propose_resolution/
			})
		);
		await fireEvent.input(screen.getAllByPlaceholderText('0.00')[0], {
			target: { value: '400' }
		});
		await fireEvent.click(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.propose' })
		);
		expect(proposeResolution).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Propose' }));

		await waitFor(() => {
			expect(proposeResolution).toHaveBeenCalledTimes(1);
		});
	});

	it('keeps inline mobile contract action buttons full width', () => {
		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canComplete: true,
					canAccept: true,
					canDispute: true,
					canCancel: true
				}
			}),
			isInline: true,
			maxInlineActions: 2
		});

		for (const label of ['Mark Service Complete', 'Accept Service']) {
			const button = screen.getByRole('button', { name: label });
			expect(button.className).toContain('w-full');
		}
	});

	it('preserves task-context labels through the same shared action button path', () => {
		render(ContractActions, {
			contract: buildTaskContract({
				permissions: {
					canComplete: true,
					canAccept: true,
					canDispute: true,
					canCancel: true
				}
			}),
			isInline: true,
			maxInlineActions: 2
		});

		expect(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.complete_task' })
		).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.accept_work' })
		).toBeInTheDocument();
		expect(
			screen.queryByRole('button', { name: 'dashboard.contracts.actions.dispute_work' })
		).toBeNull();
		expect(
			screen.queryByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })
		).toBeNull();
	});

	it('keeps shared contract actions disabled in-context while offline', async () => {
		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canComplete: true,
					canAccept: true,
					canDispute: true,
					canCancel: true
				}
			}),
			isInline: true,
			maxInlineActions: 2
		});

		window.dispatchEvent(new Event('offline'));

		await waitFor(() => {
			expect(screen.getByTestId('contract-actions-offline-alert')).toBeInTheDocument();
		});

		expect(screen.getByRole('button', { name: 'Mark Service Complete' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Accept Service' })).toBeDisabled();
	});

	it('shows a time restriction error for tasker-side cancellation when cancel is no longer allowed', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-05-01T12:30:00Z'));

		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canAccept: false,
					canCancel: true
				},
				content: {
					estimatedStartTime: Math.floor(new Date('2024-05-02T00:00:00Z').getTime() / 1000)
				}
			}),
			isInline: false
		});

		await fireEvent.click(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })
		);

		expect(showErrorToast).toHaveBeenCalledWith(
			'dashboard.contracts.actions.cancel_time_restriction_grace_period_expired'
		);
		expect(cancelEscrow).not.toHaveBeenCalled();

		vi.useRealTimers();
	});

	it('allows taskee-side cancellation to open confirmation without applying tasker time restrictions', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-05-01T12:30:00Z'));

		render(ContractActions, {
			contract: {
				...buildContract({
					permissions: {
						canAccept: false,
						canCancel: true
					},
					content: {
						estimatedStartTime: Math.floor(new Date('2024-05-02T00:00:00Z').getTime() / 1000)
					}
				}),
				isClient: false
			},
			isInline: false
		});

		await fireEvent.click(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })
		);

		expect(showErrorToast).not.toHaveBeenCalled();
		expect(
			screen.getAllByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })
		).toHaveLength(2);

		await fireEvent.click(
			screen.getAllByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })[1]
		);

		await waitFor(() => {
			expect(cancelEscrow).toHaveBeenCalledTimes(1);
		});

		vi.useRealTimers();
	});

	it('keeps taskee-side cancellation available after completion', async () => {
		loadEscrowDetails.mockResolvedValueOnce({ status: 'COMPLETED' });
		Object.defineProperty(window.navigator, 'onLine', {
			value: true,
			configurable: true
		});

		render(ContractActions, {
			contract: {
				...buildContract({
					permissions: {
						canAccept: false,
						canCancel: true
					}
				}),
				isClient: false,
				blockchainStatus: EscrowStatus.Completed
			},
			isInline: false
		});
		window.dispatchEvent(new Event('online'));

		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })
			).toBeEnabled();
		});
	});

	it('shows reconnect guidance after contract actions recover from an offline state', async () => {
		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canAccept: true
				}
			}),
			isInline: true
		});

		window.dispatchEvent(new Event('offline'));
		await waitFor(() => {
			expect(screen.getByTestId('contract-actions-offline-alert')).toBeInTheDocument();
		});

		window.dispatchEvent(new Event('online'));
		await waitFor(() => {
			expect(screen.getByTestId('contract-actions-reconnect-alert')).toBeInTheDocument();
		});
	});

	it('keeps the service contract surface open and refreshes state for stale accept failures', async () => {
		acceptTask.mockRejectedValueOnce(new Error('invalid escrow state'));

		render(ContractActions, {
			contract: buildContract(),
			isInline: false
		});

		await fireEvent.click(screen.getAllByRole('button', { name: 'Accept Service' })[0]);
		await fireEvent.click(screen.getAllByRole('button', { name: 'Accept Service' })[1]);

		await waitFor(() => {
			expect(contractStore.loadContractByEscrowId).toHaveBeenCalledWith('svc-123');
		});
		expect(screen.getByTestId('contract-actions-stale-alert')).toHaveTextContent(
			'This service contract changed or the action is no longer available. Refreshing the latest contract state.'
		);
		expect(showErrorToast).not.toHaveBeenCalled();
	});

	it('refreshes stale dispute state in place instead of only toasting on service contract action failures', async () => {
		disputeTask.mockRejectedValueOnce(new Error('already disputed'));

		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canAccept: false,
					canDispute: true
				}
			}),
			isInline: false
		});

		await fireEvent.click(screen.getAllByRole('button', { name: 'Dispute Service' })[0]);
		await fireEvent.click(screen.getAllByRole('button', { name: 'Dispute Service' })[1]);

		await waitFor(() => {
			expect(contractStore.loadContractByEscrowId).toHaveBeenCalledWith('svc-123');
		});
		expect(screen.getByTestId('contract-actions-stale-alert')).toBeInTheDocument();
		expect(showErrorToast).not.toHaveBeenCalled();
	});
});
