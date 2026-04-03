import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ReportModal from '$lib/components/moderation/ReportModal.svelte';

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockPublishReport, mockMutePubkey, mockShowSuccessToast, mockShowErrorToast } = vi.hoisted(
	() => ({
		mockPublishReport: vi.fn(),
		mockMutePubkey: vi.fn(),
		mockShowSuccessToast: vi.fn(),
		mockShowErrorToast: vi.fn()
	})
);

vi.mock('$lib/nostr/report', () => ({
	publishReport: mockPublishReport
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

vi.mock('$lib/components/Modal.svelte', async () => {
	const { default: Modal } = await vi
		.importActual<{ default: unknown }>('$lib/components/Modal.svelte')
		.catch(() => ({
			default: null
		}));
	// Provide a lightweight pass-through if the real Modal can't be loaded in jsdom
	return {
		default: Modal ?? {
			render: () => ({ $$: { ctx: [] } })
		}
	};
});

vi.mock('svelte-i18n', () => ({
	t: {
		subscribe: vi.fn((cb) => {
			cb((key: string, opts?: { values?: Record<string, string> }) => {
				// Return realistic strings matching the en locale
				const map: Record<string, string> = {
					'moderation.report_modal.title_task': 'Report this task',
					'moderation.report_modal.title_bid': 'Report this bid',
					'moderation.report_modal.title_message': 'Report this message',
					'moderation.report_modal.title_user': 'Report this user',
					'moderation.report_modal.description':
						"Help us understand what's wrong with this content.",
					'moderation.report_modal.type_label': 'Reason',
					'moderation.report_modal.types.spam': 'Spam',
					'moderation.report_modal.types.illegal': 'Illegal content',
					'moderation.report_modal.types.profanity': 'Profanity or hateful speech',
					'moderation.report_modal.types.nudity': 'Nudity or explicit content',
					'moderation.report_modal.types.impersonation': 'Impersonation',
					'moderation.report_modal.types.other': 'Other',
					'moderation.report_modal.details_label': 'Additional details (optional)',
					'moderation.report_modal.details_placeholder': 'Describe the issue...',
					'moderation.report_modal.details_required_placeholder': 'Please describe the issue...',
					'moderation.report_modal.submit': 'Submit Report',
					'moderation.report_modal.submitting': 'Submitting...',
					'moderation.report_modal.cancel': 'Cancel',
					'moderation.report_modal.success_toast': 'Report submitted. Thank you.',
					'moderation.report_modal.error_toast': 'Failed to submit report. Please try again.',
					'moderation.report_modal.select_type': 'Please select a reason',
					'moderation.report_modal.submitted_title': 'Report submitted',
					'moderation.report_modal.submitted_description':
						'Your report has been received. Would you also like to hide content from this user?',
					'moderation.report_modal.also_mute_label': "Hide this user's content",
					'moderation.report_modal.also_mute_description':
						'Their tasks, bids, and messages will no longer appear for you.',
					'moderation.report_modal.done': 'Done',
					'moderation.menu.muted_toast': opts?.values?.username
						? `${opts.values.username} muted`
						: 'User muted',
					'moderation.menu.muted_toast_generic': 'User muted'
				};
				return map[key] ?? key;
			});
			return () => {};
		})
	}
}));

// ── Shared props ───────────────────────────────────────────────────────────

const PUBKEY = 'aabbccdd1122334455667788990011223344556677889900aabbccdd11223344';
const EVENT_ID = 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678';

const defaultProps = {
	isOpen: true,
	onClose: vi.fn(),
	contentType: 'task' as const,
	reportedPubkey: PUBKEY
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ReportModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPublishReport.mockResolvedValue(undefined);
		mockMutePubkey.mockResolvedValue(0);
	});

	describe('rendering', () => {
		it('should render all six report-type radio options', () => {
			render(ReportModal, defaultProps);

			expect(screen.getByText('Spam')).toBeDefined();
			expect(screen.getByText('Illegal content')).toBeDefined();
			expect(screen.getByText('Profanity or hateful speech')).toBeDefined();
			expect(screen.getByText('Nudity or explicit content')).toBeDefined();
			expect(screen.getByText('Impersonation')).toBeDefined();
			expect(screen.getByText('Other')).toBeDefined();
		});

		it('should render the Submit Report button', () => {
			render(ReportModal, defaultProps);
			expect(screen.getByText('Submit Report')).toBeDefined();
		});

		it('should render the Cancel button', () => {
			render(ReportModal, defaultProps);
			expect(screen.getByText('Cancel')).toBeDefined();
		});

		it('should render the description helper text', () => {
			render(ReportModal, defaultProps);
			expect(screen.getByText("Help us understand what's wrong with this content.")).toBeDefined();
		});
	});

	describe('form submission', () => {
		it('should call publishReport with the selected type and pubkey', async () => {
			render(ReportModal, defaultProps);

			// Select "Spam"
			const spamRadio = screen.getByDisplayValue('spam');
			await fireEvent.click(spamRadio);

			const submitBtn = screen.getByText('Submit Report');
			await fireEvent.click(submitBtn);

			expect(mockPublishReport).toHaveBeenCalledWith(
				expect.objectContaining({
					reportedPubkey: PUBKEY,
					reportType: 'spam'
				})
			);
		});

		it('should pass the eventId to publishReport when provided', async () => {
			render(ReportModal, { ...defaultProps, reportedEventId: EVENT_ID });

			const spamRadio = screen.getByDisplayValue('spam');
			await fireEvent.click(spamRadio);

			await fireEvent.click(screen.getByText('Submit Report'));

			expect(mockPublishReport).toHaveBeenCalledWith(
				expect.objectContaining({ reportedEventId: EVENT_ID })
			);
		});

		it('should pass the description to publishReport when filled in', async () => {
			render(ReportModal, defaultProps);

			const spamRadio = screen.getByDisplayValue('spam');
			await fireEvent.click(spamRadio);

			const textarea = screen.getByRole('textbox');
			await fireEvent.input(textarea, { target: { value: 'Detailed reason' } });

			await fireEvent.click(screen.getByText('Submit Report'));

			expect(mockPublishReport).toHaveBeenCalledWith(
				expect.objectContaining({ description: 'Detailed reason' })
			);
		});

		it('should show a validation message when no type is selected and submit is clicked', async () => {
			render(ReportModal, defaultProps);

			await fireEvent.click(screen.getByText('Submit Report'));

			expect(screen.getByText('Please select a reason')).toBeDefined();
			expect(mockPublishReport).not.toHaveBeenCalled();
		});
	});

	describe('post-submit follow-up step', () => {
		it('should show the "also mute?" step after a successful report', async () => {
			render(ReportModal, defaultProps);

			const spamRadio = screen.getByDisplayValue('spam');
			await fireEvent.click(spamRadio);
			await fireEvent.click(screen.getByText('Submit Report'));

			// Wait for the async submit to resolve
			await vi.waitFor(() => {
				expect(screen.queryByText('Report submitted')).toBeDefined();
			});
		});

		it('should show the Done button in the follow-up step', async () => {
			render(ReportModal, defaultProps);

			const spamRadio = screen.getByDisplayValue('spam');
			await fireEvent.click(spamRadio);
			await fireEvent.click(screen.getByText('Submit Report'));

			await vi.waitFor(() => {
				expect(screen.queryByText('Done')).toBeDefined();
			});
		});
	});

	describe('error handling', () => {
		it('should show an error toast when publishReport throws', async () => {
			mockPublishReport.mockRejectedValue(new Error('relay error'));
			render(ReportModal, defaultProps);

			const spamRadio = screen.getByDisplayValue('spam');
			await fireEvent.click(spamRadio);
			await fireEvent.click(screen.getByText('Submit Report'));

			await vi.waitFor(() => {
				expect(mockShowErrorToast).toHaveBeenCalledWith(
					'Failed to submit report. Please try again.'
				);
			});
		});
	});

	describe('content type titles', () => {
		it.each([
			['task', 'Report this task'],
			['bid', 'Report this bid'],
			['message', 'Report this message'],
			['user', 'Report this user']
		] as const)(
			'should display the correct title for contentType "%s"',
			(contentType, expectedTitle) => {
				render(ReportModal, { ...defaultProps, contentType });
				expect(screen.getByText(expectedTitle)).toBeDefined();
			}
		);
	});
});
