import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockMutePubkey, mockShowSuccessToast, mockShowErrorToast } = vi.hoisted(() => ({
	mockMutePubkey: vi.fn(),
	mockShowSuccessToast: vi.fn(),
	mockShowErrorToast: vi.fn()
}));

vi.mock('$lib/nostr/muteList', () => ({
	mutePubkey: mockMutePubkey
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		subscribe: vi.fn((cb) => {
			cb({});
			return () => {};
		}),
		showSuccessToast: mockShowSuccessToast,
		showErrorToast: mockShowErrorToast
	}
}));

vi.mock('$lib/utils/portal', () => ({
	teleport: vi.fn(() => ({ destroy: vi.fn() }))
}));

vi.mock('$lib/components/moderation/ReportModal.svelte', () => ({
	default: { render: () => ({ $$: { ctx: [] } }) }
}));

vi.mock('svelte-i18n', () => ({
	t: {
		subscribe: vi.fn((cb) => {
			cb((key: string, opts?: { values?: Record<string, string> }) => {
				const map: Record<string, string> = {
					'moderation.menu.report': 'Report',
					'moderation.menu.report_task': 'Report task',
					'moderation.menu.report_bid': 'Report bid',
					'moderation.menu.report_message': 'Report message',
					'moderation.menu.report_user': 'Report user',
					'moderation.menu.mute_user': opts?.values?.username
						? `Mute ${opts.values.username}`
						: 'Mute user',
					'moderation.menu.mute_user_generic': 'Mute user',
					'moderation.menu.block_user': 'Block user',
					'moderation.menu.muted_toast': opts?.values?.username
						? `${opts.values.username} muted`
						: 'User muted',
					'moderation.menu.muted_toast_generic': 'User muted',
					'moderation.menu.mute_error': 'Failed to mute user. Please try again.'
				};
				return map[key] ?? key;
			});
			return () => {};
		})
	}
}));

// ── Shared props ───────────────────────────────────────────────────────────

const PUBKEY = 'aabbccdd1122334455667788990011223344556677889900aabbccdd11223344';

const defaultProps = {
	contentType: 'task' as const,
	reportedPubkey: PUBKEY
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ActionsMenu', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMutePubkey.mockResolvedValue(0);
	});

	describe('trigger button', () => {
		it('should render the three-dot trigger button', () => {
			render(ActionsMenu, defaultProps);
			const btn = screen.getByRole('button', { name: 'Report' });
			expect(btn).toBeDefined();
		});

		it('should have aria-haspopup="true" on the trigger', () => {
			render(ActionsMenu, defaultProps);
			const btn = screen.getByRole('button', { name: 'Report' });
			expect(btn.getAttribute('aria-haspopup')).toBe('true');
		});

		it('should have aria-expanded="false" when the dropdown is closed', () => {
			render(ActionsMenu, defaultProps);
			const btn = screen.getByRole('button', { name: 'Report' });
			expect(btn.getAttribute('aria-expanded')).toBe('false');
		});
	});

	describe('dropdown toggle', () => {
		it('should open the dropdown when the trigger is clicked', async () => {
			render(ActionsMenu, defaultProps);
			const btn = screen.getByRole('button', { name: 'Report' });

			await fireEvent.click(btn);

			// Dropdown items should now be visible
			expect(screen.getByRole('menu')).toBeDefined();
		});

		it('should show the report option in the dropdown', async () => {
			render(ActionsMenu, defaultProps);
			await fireEvent.click(screen.getByRole('button', { name: 'Report' }));

			expect(screen.getByText('Report task')).toBeDefined();
		});

		it('should show the mute option in the dropdown', async () => {
			render(ActionsMenu, defaultProps);
			await fireEvent.click(screen.getByRole('button', { name: 'Report' }));

			expect(screen.getByText('Mute user')).toBeDefined();
		});

		it('should show the username in the mute label when username prop is provided', async () => {
			render(ActionsMenu, { ...defaultProps, username: 'Alice' });
			await fireEvent.click(screen.getByRole('button', { name: 'Report' }));

			expect(screen.getByText('Mute Alice')).toBeDefined();
		});
	});

	describe('content type labels', () => {
		it.each([
			['task', 'Report task'],
			['bid', 'Report bid'],
			['message', 'Report message']
		] as const)(
			'should show "%s" report label for contentType "%s"',
			async (contentType, label) => {
				render(ActionsMenu, { ...defaultProps, contentType });
				await fireEvent.click(screen.getByRole('button', { name: 'Report' }));

				expect(screen.getByText(label)).toBeDefined();
			}
		);
	});

	describe('profileMode', () => {
		it('should show "Report user" instead of content-specific label in profileMode', async () => {
			render(ActionsMenu, { ...defaultProps, profileMode: true });
			await fireEvent.click(screen.getByRole('button', { name: 'Report' }));

			expect(screen.getByText('Report user')).toBeDefined();
		});

		it('should show "Block user" instead of "Mute user" in profileMode', async () => {
			render(ActionsMenu, { ...defaultProps, profileMode: true });
			await fireEvent.click(screen.getByRole('button', { name: 'Report' }));

			expect(screen.getByText('Block user')).toBeDefined();
		});
	});

	describe('mute action', () => {
		it('should call mutePubkey with the reported pubkey when the mute button is clicked', async () => {
			render(ActionsMenu, defaultProps);
			await fireEvent.click(screen.getByRole('button', { name: 'Report' }));

			const muteBtn = screen.getByText('Mute user').closest('button')!;
			await fireEvent.click(muteBtn);

			expect(mockMutePubkey).toHaveBeenCalledWith(PUBKEY);
		});

		it('should show a success toast after a successful mute', async () => {
			render(ActionsMenu, defaultProps);
			await fireEvent.click(screen.getByRole('button', { name: 'Report' }));

			const muteBtn = screen.getByText('Mute user').closest('button')!;
			await fireEvent.click(muteBtn);

			await vi.waitFor(() => {
				expect(mockShowSuccessToast).toHaveBeenCalledWith('User muted');
			});
		});

		it('should show a personalised success toast when username is provided', async () => {
			render(ActionsMenu, { ...defaultProps, username: 'Bob' });
			await fireEvent.click(screen.getByRole('button', { name: 'Report' }));

			const muteBtn = screen.getByText('Mute Bob').closest('button')!;
			await fireEvent.click(muteBtn);

			await vi.waitFor(() => {
				expect(mockShowSuccessToast).toHaveBeenCalledWith('Bob muted');
			});
		});

		it('should show an error toast when mutePubkey throws', async () => {
			mockMutePubkey.mockRejectedValue(new Error('relay error'));
			render(ActionsMenu, defaultProps);
			await fireEvent.click(screen.getByRole('button', { name: 'Report' }));

			const muteBtn = screen.getByText('Mute user').closest('button')!;
			await fireEvent.click(muteBtn);

			await vi.waitFor(() => {
				expect(mockShowErrorToast).toHaveBeenCalledWith('Failed to mute user. Please try again.');
			});
		});

		it('should call the onMuted callback with the removed task count', async () => {
			mockMutePubkey.mockResolvedValue(5);
			const onMuted = vi.fn();
			render(ActionsMenu, { ...defaultProps, onMuted });
			await fireEvent.click(screen.getByRole('button', { name: 'Report' }));

			const muteBtn = screen.getByText('Mute user').closest('button')!;
			await fireEvent.click(muteBtn);

			await vi.waitFor(() => {
				expect(onMuted).toHaveBeenCalledWith(5);
			});
		});
	});

	describe('accessibility', () => {
		it('should not render the dropdown menu when closed', () => {
			render(ActionsMenu, defaultProps);
			expect(screen.queryByRole('menu')).toBeNull();
		});
	});
});
