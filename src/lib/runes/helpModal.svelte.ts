/**
 * Shared help modal state.
 * Replaces the fragile `document.querySelector('[data-help-modal]')?.click()` pattern
 * used across BalanceCard, HelpButton, and the wallet page.
 */
export const helpModal = $state({ isOpen: false });

export function openHelpModal(): void {
	helpModal.isOpen = true;
}

export function closeHelpModal(): void {
	helpModal.isOpen = false;
}
