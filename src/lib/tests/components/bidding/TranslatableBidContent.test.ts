import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import TranslatableBidContent from '$lib/components/bidding/TranslatableBidContent.svelte';

vi.mock('$lib/services/bid-translation.service', () => ({
	bidTranslationService: {
		getDisplayContent: vi.fn((_bid, _contentType, _lang, content: string) => content),
		getStoredTranslation: vi.fn(() => null)
	}
}));

vi.mock('$lib/stores/translation.store', () => ({
	currentUserLanguage: writable('en')
}));

describe('TranslatableBidContent', () => {
	it('updates display class when contentType changes', async () => {
		const { container, rerender } = render(TranslatableBidContent, {
			content: 'Sample content',
			contentType: 'description',
			fallbackClass: 'fallback-cls',
			contentClass: 'content-cls'
		});

		let paragraph = container.querySelector('p');
		expect(paragraph?.className).toContain('fallback-cls');
		expect(paragraph?.className).not.toContain('content-cls');

		await rerender({
			content: 'Sample content',
			contentType: 'proposedApproach',
			fallbackClass: 'fallback-cls',
			contentClass: 'content-cls'
		});

		paragraph = container.querySelector('p');
		expect(paragraph?.className).toContain('content-cls');
		expect(paragraph?.className).not.toContain('fallback-cls');
	});
});
