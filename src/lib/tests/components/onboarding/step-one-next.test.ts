import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const calls = vi.hoisted(() => ({
	resolveHandle: vi.fn(async () => 'ada-lovelace'),
	getNostrKeyPair: vi.fn(),
	prepareSigner: vi.fn(),
	getBiometricData: vi.fn(),
	setBiometricKey: vi.fn(),
	publishProfileMetadata: vi.fn(),
	applyNdkSignerFromNsec: vi.fn()
}));

vi.mock('$lib/utils/helpers/usernameGenerator.js', () => ({
	resolveHandle: (...args: unknown[]) => calls.resolveHandle(...args)
}));

vi.mock('$lib/utils/nostrKeys', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/nostrKeys')>('$lib/utils/nostrKeys');
	return {
		...actual,
		getNostrKeyPair: (...args: unknown[]) => calls.getNostrKeyPair(...args),
		prepareSigner: (...args: unknown[]) => calls.prepareSigner(...args)
	};
});

vi.mock('$lib/utils/helpers/biometrics', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/helpers/biometrics')>(
		'$lib/utils/helpers/biometrics'
	);
	return {
		...actual,
		getBiometricData: (...args: unknown[]) => calls.getBiometricData(...args),
		setBiometricKey: (...args: unknown[]) => calls.setBiometricKey(...args)
	};
});

vi.mock('$lib/nostr/profile', async () => {
	const actual = await vi.importActual<typeof import('$lib/nostr/profile')>('$lib/nostr/profile');
	return {
		...actual,
		publishProfileMetadata: (...args: unknown[]) => calls.publishProfileMetadata(...args)
	};
});

vi.mock('$lib/nostr/ndkSigner', () => ({
	applyNdkSignerFromNsec: (...args: unknown[]) => calls.applyNdkSignerFromNsec(...args),
	syncNdkSignerFromAppStore: vi.fn()
}));

import OnboardingPage from '../../../../routes/(app)/auth/onboarding/+page.svelte';

describe('onboarding step 1', () => {
	beforeEach(() => {
		calls.resolveHandle.mockClear();
		calls.getNostrKeyPair.mockClear();
		calls.prepareSigner.mockClear();
		calls.getBiometricData.mockClear();
		calls.setBiometricKey.mockClear();
		calls.publishProfileMetadata.mockClear();
		calls.applyNdkSignerFromNsec.mockClear();
	});

	it('reaches step 2 with no signer or passkey', async () => {
		render(OnboardingPage, { props: { data: { currentStep: 0 } } });

		expect(screen.getByTestId('onboarding-step-display-name')).toBeInTheDocument();
		expect(screen.queryByTestId('onboarding-step-passkey')).toBeNull();

		await fireEvent.input(screen.getByTestId('onboarding-display-name-input'), {
			target: { value: 'Ada Lovelace' }
		});
		await fireEvent.click(screen.getByTestId('onboarding-display-name-next'));

		await waitFor(() => {
			expect(screen.getByTestId('onboarding-step-passkey')).toBeInTheDocument();
		});
		expect(screen.queryByTestId('onboarding-step-display-name')).toBeNull();
		expect(screen.queryByText('Approve with your passkey to continue')).toBeNull();
		expect(calls.resolveHandle).toHaveBeenCalledWith('Ada Lovelace', expect.any(String));
		expect(calls.getNostrKeyPair).not.toHaveBeenCalled();
		expect(calls.prepareSigner).not.toHaveBeenCalled();
		expect(calls.getBiometricData).not.toHaveBeenCalled();
		expect(calls.setBiometricKey).not.toHaveBeenCalled();
		expect(calls.publishProfileMetadata).not.toHaveBeenCalled();
		expect(calls.applyNdkSignerFromNsec).not.toHaveBeenCalled();
	});
});
