import { describe, it, expect } from 'vitest';
import { isValidInternalPath } from '$lib/utils/deep-link';

describe('Deep Link — Service Routes', () => {
	describe('isValidInternalPath', () => {
		it('validates /services/{serviceId} as valid deep link', () => {
			expect(isValidInternalPath('/services/abc-def-123')).toBe(true);
		});

		it('validates /services as valid deep link', () => {
			expect(isValidInternalPath('/services')).toBe(true);
		});

		it('validates /services/ as valid deep link', () => {
			expect(isValidInternalPath('/services/')).toBe(true);
		});

		it('validates /hiring/service-requests as valid deep link', () => {
			expect(isValidInternalPath('/hiring/service-requests')).toBe(true);
		});

		it('validates /earning/my-services as valid deep link', () => {
			expect(isValidInternalPath('/earning/my-services')).toBe(true);
		});

		it('validates /tasks/{taskId} as valid deep link', () => {
			expect(isValidInternalPath('/tasks/task-123')).toBe(true);
		});

		it('rejects protocol-relative URLs', () => {
			expect(isValidInternalPath('//evil.com')).toBe(false);
		});

		it('rejects URLs not starting with /', () => {
			expect(isValidInternalPath('services/abc')).toBe(false);
		});

		it('rejects empty string', () => {
			expect(isValidInternalPath('')).toBe(false);
		});
	});

	describe('Service deep link patterns', () => {
		const SERVICE_DEEP_LINKS = {
			serviceDetail: '/services/{serviceId}',
			services: '/services',
			servicesPrefix: '/services/'
		};

		it('defines serviceDetail deep link pattern', () => {
			expect(SERVICE_DEEP_LINKS.serviceDetail).toBe('/services/{serviceId}');
		});

		it('defines services deep link', () => {
			expect(SERVICE_DEEP_LINKS.services).toBe('/services');
		});

		it('defines servicesPrefix deep link', () => {
			expect(SERVICE_DEEP_LINKS.servicesPrefix).toBe('/services/');
		});

		it('serviceDetail resolves to valid path when serviceId replaced', () => {
			const resolved = SERVICE_DEEP_LINKS.serviceDetail.replace('{serviceId}', 'svc-123');
			expect(resolved).toBe('/services/svc-123');
			expect(isValidInternalPath(resolved)).toBe(true);
		});
	});

	describe('All new notification type deep links', () => {
		const deepLinks: Array<{ type: string; link: string }> = [
			{ type: 'new_task_broadcast', link: '/tasks/task-123' },
			{ type: 'new_service_broadcast', link: '/services/service-456' },
			{ type: 'new_service_match', link: '/services/service-789' },
			{ type: 'proposal_withdrawn', link: '/hiring/service-requests' },
			{ type: 'proposal_updated', link: '/hiring/service-requests' },
			{ type: 'service_expiring_soon', link: '/earning/my-services' },
			{ type: 'service_expired', link: '/earning/my-services' },
			{ type: 'service_review_received', link: '/services/service-123' },
			{ type: 'service_price_changed', link: '/hiring/service-requests' }
		];

		it.each(deepLinks)('$type deep link "$link" is valid internal path', ({ link }) => {
			expect(isValidInternalPath(link)).toBe(true);
		});

		it.each(deepLinks)('$type deep link starts with /', ({ link }) => {
			expect(link.startsWith('/')).toBe(true);
		});

		it.each(deepLinks)('$type deep link does not start with //', ({ link }) => {
			expect(link.startsWith('//')).toBe(false);
		});
	});
});
