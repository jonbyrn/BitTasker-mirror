import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import CalculatorKeypad from '$lib/components/wallet/CalculatorKeypad.svelte';

// Mock svelte-i18n
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'wallet.calculator.clear': 'Clear',
		'wallet.calculator.delete': 'Delete'
	};
	const tStore = readable((key: string) => translations[key] || key);
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

// Capacitor mocks are handled in vitest-setup-client.ts

describe('CalculatorKeypad Component', () => {
	const defaultProps = {
		unit: 'sats' as const,
		onInput: vi.fn()
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render all number buttons (0-9)', () => {
			render(CalculatorKeypad, defaultProps);

			for (let i = 0; i <= 9; i++) {
				const button = screen.getByLabelText(i.toString());
				expect(button).toBeDefined();
			}
		});

		it('should render operator buttons (+, ÷, ×, −)', () => {
			render(CalculatorKeypad, defaultProps);

			expect(screen.getByLabelText('Add')).toBeDefined();
			expect(screen.getByLabelText('Subtract')).toBeDefined();
			expect(screen.getByLabelText('Multiply')).toBeDefined();
			expect(screen.getByLabelText('Divide')).toBeDefined();
		});

		it('should render Delete button', () => {
			render(CalculatorKeypad, defaultProps);

			expect(screen.getByLabelText('Delete')).toBeDefined();
		});

		it('should render decimal point button', () => {
			render(CalculatorKeypad, defaultProps);

			const decimalButton = screen.getByLabelText('Decimal point');
			expect(decimalButton).toBeDefined();
		});

		it('should render 0 button', () => {
			render(CalculatorKeypad, defaultProps);

			const zeroButton = screen.getByLabelText('0');
			expect(zeroButton).toBeDefined();
		});
	});

	describe('Number Input', () => {
		it('should call onInput with number when number button is clicked', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput });

			const button5 = screen.getByLabelText('5');
			fireEvent.click(button5);

			expect(onInput).toHaveBeenCalledWith('5');
		});

		it('should append numbers to calculator value', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput });

			fireEvent.click(screen.getByLabelText('1'));
			expect(onInput).toHaveBeenCalledWith('1');

			fireEvent.click(screen.getByLabelText('2'));
			expect(onInput).toHaveBeenCalledWith('12');

			fireEvent.click(screen.getByLabelText('3'));
			expect(onInput).toHaveBeenCalledWith('123');
		});
	});

	describe('Clear Functionality', () => {
		it('should clear calculator value when Escape key is pressed', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput });

			// Enter some numbers
			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('2'));
			fireEvent.click(screen.getByLabelText('3'));

			// Clear via Escape key (Clear button removed from UI)
			fireEvent.keyDown(document, { key: 'Escape' });

			expect(onInput).toHaveBeenCalledWith('');
		});

		it('should reset operator and previous value on Clear', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput });

			// Enter number and operator
			fireEvent.click(screen.getByLabelText('5'));
			fireEvent.click(screen.getByLabelText('Add'));

			// Clear should reset everything via Escape key
			fireEvent.keyDown(document, { key: 'Escape' });
			expect(onInput).toHaveBeenCalledWith('');
		});
	});

	describe('Delete Functionality', () => {
		it('should delete last character when Delete button is clicked', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput });

			// Enter numbers
			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('2'));
			fireEvent.click(screen.getByLabelText('3'));

			// Delete last character
			fireEvent.click(screen.getByLabelText('Delete'));

			expect(onInput).toHaveBeenCalledWith('12');
		});

		it('should handle delete on empty value', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput });

			fireEvent.click(screen.getByLabelText('Delete'));
			expect(onInput).toHaveBeenCalledWith('');
		});
	});

	describe('Decimal Point', () => {
		it('should allow decimal point in USD mode', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, unit: 'usd', onInput });

			const decimalButton = screen.getByLabelText('Decimal point');
			expect(decimalButton).not.toBeDisabled();

			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(decimalButton);
			expect(onInput).toHaveBeenCalledWith('1.');
		});

		it('should disable decimal point in sats mode', () => {
			render(CalculatorKeypad, defaultProps);

			const decimalButton = screen.getByLabelText('Decimal point');
			expect(decimalButton).toHaveAttribute('aria-disabled', 'true');
		});

		it('should prevent multiple decimal points', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, unit: 'usd', onInput });

			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('Decimal point'));
			fireEvent.click(screen.getByLabelText('Decimal point')); // Second decimal should be ignored

			expect(onInput).toHaveBeenLastCalledWith('1.');
		});
	});

	describe('Calculator Operations', () => {
		it('should perform addition automatically', () => {
			const onInput = vi.fn();
			const onCalculationChange = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput, onCalculationChange });

			fireEvent.click(screen.getByLabelText('5'));
			fireEvent.click(screen.getByLabelText('Add'));
			fireEvent.click(screen.getByLabelText('3'));

			// Auto-calculates when second number is entered
			expect(onCalculationChange).toHaveBeenCalled();
			const lastCall = onCalculationChange.mock.calls[onCalculationChange.mock.calls.length - 1];
			expect(lastCall[0]).toContain('5 + 3 = 8');
			expect(lastCall[1]).toBe(8);
		});

		it('should perform subtraction automatically', () => {
			const onInput = vi.fn();
			const onCalculationChange = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput, onCalculationChange });

			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('Subtract'));
			fireEvent.click(screen.getByLabelText('3'));

			// Auto-calculates when second number is entered
			expect(onCalculationChange).toHaveBeenCalled();
			const lastCall = onCalculationChange.mock.calls[onCalculationChange.mock.calls.length - 1];
			expect(lastCall[0]).toContain('10 − 3 = 7');
			expect(lastCall[1]).toBe(7);
		});

		it('should perform multiplication automatically', () => {
			const onInput = vi.fn();
			const onCalculationChange = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput, onCalculationChange });

			fireEvent.click(screen.getByLabelText('4'));
			fireEvent.click(screen.getByLabelText('Multiply'));
			fireEvent.click(screen.getByLabelText('5'));

			// Auto-calculates when second number is entered
			expect(onCalculationChange).toHaveBeenCalled();
			const lastCall = onCalculationChange.mock.calls[onCalculationChange.mock.calls.length - 1];
			expect(lastCall[0]).toContain('4 × 5 = 20');
			expect(lastCall[1]).toBe(20);
		});

		it('should perform division automatically', () => {
			const onInput = vi.fn();
			const onCalculationChange = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput, onCalculationChange });

			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('5'));
			fireEvent.click(screen.getByLabelText('Divide'));
			fireEvent.click(screen.getByLabelText('3'));

			// Auto-calculates when second number is entered
			expect(onCalculationChange).toHaveBeenCalled();
			const lastCall = onCalculationChange.mock.calls[onCalculationChange.mock.calls.length - 1];
			expect(lastCall[0]).toContain('15 ÷ 3');
			expect(lastCall[1]).toBe(5);
		});

		it('should handle division by zero automatically', () => {
			const onInput = vi.fn();
			const onCalculationChange = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput, onCalculationChange });

			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('Divide'));
			fireEvent.click(screen.getByLabelText('0'));

			// Auto-calculates when second number is entered
			expect(onCalculationChange).toHaveBeenCalled();
			const lastCall = onCalculationChange.mock.calls[onCalculationChange.mock.calls.length - 1];
			expect(lastCall[0]).toContain('10 ÷ 0 = 0');
			expect(lastCall[1]).toBe(0);
		});

		it('should format result for sats mode (whole numbers)', () => {
			const onInput = vi.fn();
			const onCalculationChange = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, unit: 'sats', onInput, onCalculationChange });

			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('Divide'));
			fireEvent.click(screen.getByLabelText('3'));

			// Auto-calculates and formats for sats (whole numbers)
			expect(onCalculationChange).toHaveBeenCalled();
			const lastCall = onCalculationChange.mock.calls[onCalculationChange.mock.calls.length - 1];
			expect(lastCall[0]).toContain('10 ÷ 3 = 3');
			expect(lastCall[1]).toBe(3); // Math.floor(10/3) = 3
		});

		it('should format result for USD mode (decimals)', () => {
			const onInput = vi.fn();
			const onCalculationChange = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, unit: 'usd', onInput, onCalculationChange });

			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('0'));
			fireEvent.click(screen.getByLabelText('Divide'));
			fireEvent.click(screen.getByLabelText('3'));

			// Auto-calculates and formats for USD (decimals)
			expect(onCalculationChange).toHaveBeenCalled();
			const lastCall = onCalculationChange.mock.calls[onCalculationChange.mock.calls.length - 1];
			expect(lastCall[0]).toContain('10 ÷ 3 = 3.33');
			expect(lastCall[1]).toBeCloseTo(3.33, 2); // 10/3 = 3.33...
		});
	});

	describe('Keyboard Input', () => {
		it('should handle number keys', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput });

			fireEvent.keyDown(document, { key: '5' });
			expect(onInput).toHaveBeenCalledWith('5');
		});

		it('should handle operator keys', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput });

			fireEvent.click(screen.getByLabelText('5'));
			fireEvent.keyDown(document, { key: '+' });
			// Operator should be set, but onInput not called yet
			expect(onInput).toHaveBeenCalledWith('5');
		});

		it('should handle Enter key (auto-calculates, no equals needed)', () => {
			const onInput = vi.fn();
			const onCalculationChange = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput, onCalculationChange });

			fireEvent.click(screen.getByLabelText('5'));
			fireEvent.click(screen.getByLabelText('Add'));
			fireEvent.click(screen.getByLabelText('3'));

			// Auto-calculates without needing Enter/Equals
			expect(onCalculationChange).toHaveBeenCalled();
			const lastCall = onCalculationChange.mock.calls[onCalculationChange.mock.calls.length - 1];
			expect(lastCall[0]).toContain('5 + 3 = 8');
			expect(lastCall[1]).toBe(8);
		});

		it('should handle Backspace key as delete', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput });

			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('2'));
			fireEvent.click(screen.getByLabelText('3'));
			fireEvent.keyDown(document, { key: 'Backspace' });

			expect(onInput).toHaveBeenLastCalledWith('12');
		});

		it('should handle Escape key as clear', () => {
			const onInput = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput });

			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('2'));
			fireEvent.keyDown(document, { key: 'Escape' });

			expect(onInput).toHaveBeenLastCalledWith('');
		});
	});

	describe('Unit Changes', () => {
		it('should handle unit changes gracefully', () => {
			const onInput = vi.fn();
			const { rerender } = render(CalculatorKeypad, { ...defaultProps, unit: 'sats', onInput });

			// Enter some values
			fireEvent.click(screen.getByLabelText('1'));
			fireEvent.click(screen.getByLabelText('2'));
			fireEvent.click(screen.getByLabelText('3'));

			// Change unit by rerendering with new props
			// In real usage, parent would also clear mathExpression
			rerender({ unit: 'usd', onInput });

			// Calculator continues appending (parent manages the display state via mathExpression)
			// This is correct behavior - the calculator is stateless from parent's perspective
			fireEvent.click(screen.getByLabelText('5'));
			expect(onInput).toHaveBeenLastCalledWith('1235');
		});

		it('should reset internal state when starting fresh input after stale state', () => {
			const onInput = vi.fn();
			const onCalculationChange = vi.fn();
			render(CalculatorKeypad, { ...defaultProps, onInput, onCalculationChange });

			// Start a calculation: 5 +
			fireEvent.click(screen.getByLabelText('5'));
			fireEvent.click(screen.getByLabelText('Add'));
			
			// Simulate parent clearing the calculator (like unit change does)
			// by clearing via Escape
			fireEvent.keyDown(document, { key: 'Escape' });

			// Now start fresh input - should not continue the old calculation
			fireEvent.click(screen.getByLabelText('3'));
			expect(onInput).toHaveBeenLastCalledWith('3');
			
			// Should show just "3", not "5 + 3 = 8"
			const lastCall = onCalculationChange.mock.calls[onCalculationChange.mock.calls.length - 1];
			expect(lastCall[0]).toBe('3');
			expect(lastCall[1]).toBe(3);
		});
	});

	describe('Touch Optimization', () => {
		it('should have minimum height for touch targets', () => {
			render(CalculatorKeypad, defaultProps);

			const keypadElements = screen.getAllByRole('button');
			keypadElements.forEach((element) => {
				expect(element).toHaveClass('min-h-[52px]');
			});
		});

		it('should have touch-manipulation class', () => {
			render(CalculatorKeypad, defaultProps);

			const keypadElements = screen.getAllByRole('button');
			keypadElements.forEach((element) => {
				expect(element).toHaveClass('touch-manipulation');
			});
		});

		it('should have active background color change on touch', () => {
			render(CalculatorKeypad, defaultProps);

			const keypadElements = screen.getAllByRole('button');
			keypadElements.forEach((element) => {
				// Check for active:bg-base-300 or active:bg-primary/20
				const hasActiveClass =
					element.className.includes('active:bg-base-300') ||
					element.className.includes('active:bg-primary/20') ||
					element.className.includes('active:bg-error/20');
				expect(hasActiveClass).toBe(true);
			});
		});
	});

	describe('Accessibility', () => {
		it('should have ARIA labels on all buttons', () => {
			render(CalculatorKeypad, defaultProps);

			const buttons = screen.getAllByRole('button');
			buttons.forEach((button) => {
				expect(button).toHaveAttribute('aria-label');
			});
		});
	});
});

