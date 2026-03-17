import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import RequestQuoteModal from '$lib/components/service/RequestQuoteModal.svelte';
import type { Service } from '$lib/types/service.d';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/utils/serviceDisplayTranslation', () => ({
	getServiceDisplayTitle: vi.fn((service: Service) => service.title)
}));

vi.mock('$lib/components/MediaUploader.svelte', async () => {
	const mockComponent = await import('./__mocks__/MediaUploader.mock.svelte');
	return { default: mockComponent.default };
});

const mockService: Service = {
	id: 'service-event-1',
	npub: 'a'.repeat(64),
	uniqueId: 'service-unique-id',
	status: 'active',
	title: 'Logo Design',
	description: 'Custom brand work.',
	serviceLocationTypes: [],
	pricing: {
		type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
		currency: 'USD'
	},
	skills: [],
	categories: [],
	createdAt: 1
};

describe('RequestQuoteModal', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('preserves form values and attachments after a failed async submit', async () => {
		const onConfirm = vi.fn().mockResolvedValue({
			success: false,
			error: 'Publish failed'
		});
		const { container, getByText, getByTestId } = render(RequestQuoteModal, {
			open: true,
			service: mockService,
			onConfirm,
			onClose: vi.fn()
		});

		const titleInput = container.querySelector<HTMLInputElement>('#quote-title');
		const descriptionInput = container.querySelector<HTMLTextAreaElement>('#quote-description');

		if (!titleInput || !descriptionInput) {
			throw new Error('Expected quote form inputs to render');
		}

		await fireEvent.input(titleInput, { target: { value: 'Need a new logo' } });
		await fireEvent.input(descriptionInput, {
			target: { value: 'I need three concepts for a launch next week.' }
		});
		await fireEvent.click(getByText('Add Upload'));
		await fireEvent.click(getByText('dashboard.services.detail.request_quote_modal.submit'));

		await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(getByTestId('request-quote-submit-error')).toBeTruthy());
		expect(getByTestId('request-quote-submit-error').textContent).toContain('Publish failed');
		expect(titleInput.value).toBe('Need a new logo');
		expect(descriptionInput.value).toBe('I need three concepts for a launch next week.');
		expect(getByTestId('mock-media-count').textContent).toBe('1');
	});

	it('closes and resets after a successful async submit', async () => {
		const onConfirm = vi.fn().mockResolvedValue({ success: true });
		const onClose = vi.fn();
		const { container, getByText } = render(RequestQuoteModal, {
			open: true,
			service: mockService,
			onConfirm,
			onClose
		});

		const titleInput = container.querySelector<HTMLInputElement>('#quote-title');
		const descriptionInput = container.querySelector<HTMLTextAreaElement>('#quote-description');

		if (!titleInput || !descriptionInput) {
			throw new Error('Expected quote form inputs to render');
		}

		await fireEvent.input(titleInput, { target: { value: 'Need landing page copy' } });
		await fireEvent.input(descriptionInput, {
			target: { value: 'Homepage, features, and FAQ sections.' }
		});
		await fireEvent.click(getByText('dashboard.services.detail.request_quote_modal.submit'));

		await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(container.querySelector('#quote-title')).toBeNull());
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('keeps required inquiry fields aligned with the shared validation core', async () => {
		const onConfirm = vi.fn();
		const serviceWithInquiryField: Service = {
			...mockService,
			pricing: {
				...mockService.pricing,
				inquiryForm: {
					fields: [
						{
							id: 'company',
							type: 'text',
							label: 'Company',
							required: true
						}
					]
				}
			}
		};
		const { container, getByText } = render(RequestQuoteModal, {
			open: true,
			service: serviceWithInquiryField,
			onConfirm,
			onClose: vi.fn()
		});

		const titleInput = container.querySelector<HTMLInputElement>('#quote-title');
		const descriptionInput = container.querySelector<HTMLTextAreaElement>('#quote-description');

		if (!titleInput || !descriptionInput) {
			throw new Error('Expected quote form inputs to render');
		}

		await fireEvent.input(titleInput, { target: { value: 'Need a new logo' } });
		await fireEvent.input(descriptionInput, {
			target: { value: 'I need three concepts for a launch next week.' }
		});
		await fireEvent.click(getByText('dashboard.services.detail.request_quote_modal.submit'));

		expect(onConfirm).not.toHaveBeenCalled();
		expect(getByText('dashboard.services.detail.request_quote_modal.field_required')).toBeTruthy();
	});
});
