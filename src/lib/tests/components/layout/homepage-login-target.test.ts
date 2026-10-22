import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { authState } from '$lib/stores/auth.store';

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => key),
	locale: readable('en'),
	isLoading: readable(false)
}));

vi.mock('$lib/utils/helpers/biometrics', () => ({
	prefetchPasskeyChallenge: vi.fn(),
	peekPasskeyChallenge: vi.fn(() => 'ready'),
	passkeyChallengeFailure: vi.fn(() => null),
	getBiometricData: vi.fn(),
	checkBiometricAvailability: vi.fn(async () => false),
	checkNativePlatform: vi.fn(() => false),
	setBiometricKey: vi.fn()
}));

import CompanyLayout from '../../../../routes/(company)/+layout.svelte';
import LoginPage from '../../../../routes/(app)/auth/login/+page.svelte';

describe('homepage login hit target', () => {
	it('keeps the header Login link on /auth/login while auth is still resolving', () => {
		authState.set({ isAuthenticated: false, isLoading: true, error: null });
		const { container } = render(CompanyLayout, { props: { data: {} } });
		const login = screen.getByTestId('login-link');
		expect(login.getAttribute('href')).toContain('/auth/login');
		expect(login.getAttribute('href')).not.toContain('/auth/recover');
		expect(container.querySelector('a[href="/auth/recover/send"]')).toBeNull();
	});

	it('ignores a recovery click until the login page has settled', async () => {
		const { container } = render(LoginPage);
		const link = container.querySelector('a[href="/auth/recover/send"]') as HTMLAnchorElement;
		expect(link).toBeTruthy();
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		link.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(screen.queryByText('nsec')).toBeNull();
	});
});
