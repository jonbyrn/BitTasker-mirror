<script lang="ts">
	import { t } from 'svelte-i18n';
	import { Capacitor } from '@capacitor/core';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';

	interface Props {
		unit: 'sats' | 'usd';
		disabled?: boolean;
		onInput: (value: string) => void;
		onCalculationChange?: (mathExpression: string, result: number) => void;
	}

	let { unit, disabled = false, onInput, onCalculationChange }: Props = $props();

	// Calculator state
	let calculatorValue = $state('');
	let previousValue = $state<number | null>(null);
	let operator = $state<string | null>(null);
	let waitingForOperand = $state(false);
	let mathExpression = $state(''); // Full math expression for display

	function updateMathExpression() {
		if (previousValue !== null && operator && calculatorValue) {
			const currentValue = parseFloat(calculatorValue) || 0;
			// Auto-calculate
			let result = 0;
			switch (operator) {
				case '+':
					result = previousValue + currentValue;
					break;
				case '−':
					result = previousValue - currentValue;
					break;
				case '×':
					result = previousValue * currentValue;
					break;
				case '÷':
					result = currentValue !== 0 ? previousValue / currentValue : 0;
					break;
			}
			const formattedResult = unit === 'sats' ? Math.floor(result) : parseFloat(result.toFixed(2));
			mathExpression = `${previousValue} ${operator} ${currentValue} = ${formattedResult}`;
			if (onCalculationChange) {
				onCalculationChange(mathExpression, formattedResult);
			}
		} else if (previousValue !== null && operator) {
			mathExpression = `${previousValue} ${operator}`;
			if (onCalculationChange) {
				onCalculationChange(mathExpression, previousValue);
			}
		} else if (calculatorValue) {
			mathExpression = calculatorValue;
			if (onCalculationChange) {
				const currentResult = parseFloat(calculatorValue) || 0;
				onCalculationChange(mathExpression, currentResult);
			}
		} else {
			mathExpression = '';
			if (onCalculationChange) {
				onCalculationChange('', 0);
			}
		}
	}

	function handleInput(value: string) {
		if (disabled) return;
		if (value === 'C') {
			// Clear
			triggerHaptic(ImpactStyle.Light);
			calculatorValue = '';
			previousValue = null;
			operator = null;
			waitingForOperand = false;
			mathExpression = '';
		onInput('');
		if (onCalculationChange) {
			onCalculationChange('', 0);
			}
		} else if (value === '⌫') {
			// Delete last character
			triggerHaptic(ImpactStyle.Light);
			calculatorValue = calculatorValue.slice(0, -1);
			onInput(calculatorValue);
			updateMathExpression();
		} else if (value === '.') {
			// Decimal point (USD mode only)
			if (unit === 'sats') return; // No decimals for sats - don't trigger haptic for invalid action
			if (!calculatorValue.includes('.')) {
				triggerHaptic(ImpactStyle.Light);
				calculatorValue += '.';
				onInput(calculatorValue);
				updateMathExpression();
			}
		} else if (['+', '−', '×', '÷'].includes(value)) {
			triggerHaptic(ImpactStyle.Light);
			// Operator - auto-calculate if we have a previous value and operator
			if (previousValue !== null && operator && calculatorValue) {
				// Auto-calculate previous operation
				const currentValue = parseFloat(calculatorValue) || 0;
				let result = 0;

				switch (operator) {
					case '+':
						result = previousValue + currentValue;
						break;
					case '−':
						result = previousValue - currentValue;
						break;
					case '×':
						result = previousValue * currentValue;
						break;
					case '÷':
						result = currentValue !== 0 ? previousValue / currentValue : 0;
						break;
				}

				// Update calculator value with result
				if (unit === 'sats') {
					calculatorValue = Math.floor(result).toString();
				} else {
					calculatorValue = result.toFixed(2).replace(/\.?0+$/, '');
				}
				previousValue = parseFloat(calculatorValue) || 0;
			} else if (calculatorValue) {
				previousValue = parseFloat(calculatorValue) || 0;
			}
			
			operator = value;
			waitingForOperand = true;
			calculatorValue = '';
			updateMathExpression();
		} else if (value === '=') {
			// Perform calculation
			triggerHaptic(ImpactStyle.Light);
			if (previousValue !== null && operator && calculatorValue) {
				const currentValue = parseFloat(calculatorValue) || 0;
				let result = 0;

				switch (operator) {
					case '+':
						result = previousValue + currentValue;
						break;
					case '−':
						result = previousValue - currentValue;
						break;
					case '×':
						result = previousValue * currentValue;
						break;
					case '÷':
						result = currentValue !== 0 ? previousValue / currentValue : 0;
						break;
				}

				// Update calculator value with result
				if (unit === 'sats') {
					calculatorValue = Math.floor(result).toString();
				} else {
					calculatorValue = result.toFixed(2).replace(/\.?0+$/, '');
				}

				mathExpression = `${previousValue} ${operator} ${currentValue} = ${calculatorValue}`;
				onInput(calculatorValue);
			if (onCalculationChange) {
				onCalculationChange(mathExpression, parseFloat(calculatorValue) || 0);
				}
				previousValue = null;
				operator = null;
				waitingForOperand = false;
			}
		} else {
			// Number input
			// Prevent decimals in sats mode - don't trigger haptic for invalid action
			if (!waitingForOperand && unit === 'sats' && calculatorValue.includes('.')) {
				return;
			}
			
			triggerHaptic(ImpactStyle.Light);
			
			if (waitingForOperand) {
				calculatorValue = value;
				waitingForOperand = false;
			} else {
				calculatorValue += value;
			}
			onInput(calculatorValue);
			updateMathExpression();
		}
	}

	// Handle keyboard input
	function handleKeydown(e: KeyboardEvent) {
		// Don't intercept keyboard events if user is typing in an input or textarea
		const activeElement = document.activeElement;
		if (
			activeElement &&
			(activeElement.tagName === 'INPUT' ||
				activeElement.tagName === 'TEXTAREA' ||
				activeElement.getAttribute('contenteditable') === 'true')
		) {
			return; // Let the input/textarea handle the event normally
		}

		// Map keyboard keys to calculator buttons
		const keyMap: Record<string, string> = {
			'0': '0',
			'1': '1',
			'2': '2',
			'3': '3',
			'4': '4',
			'5': '5',
			'6': '6',
			'7': '7',
			'8': '8',
			'9': '9',
			'.': '.',
			'+': '+',
			'-': '−',
			'*': '×',
			'/': '÷',
			'=': '=',
			'Enter': '=',
			'Backspace': '⌫',
			'Delete': 'C',
			'Escape': 'C'
		};

		const mappedKey = keyMap[e.key];
		if (mappedKey) {
			e.preventDefault();
			handleInput(mappedKey);
		}
	}

	// Reset calculator internal state when unit changes (but don't clear parent amount)
	$effect(() => {
		unit;
		calculatorValue = '';
		previousValue = null;
		operator = null;
		waitingForOperand = false;
		mathExpression = '';
		// Don't call onCalculationChange - preserve the amount in the parent component
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="calculator-keypad grid grid-cols-4 border border-base-300 rounded-lg overflow-hidden bg-base-100" class:opacity-50={disabled}>
	<!-- Row 1: 7, 8, 9, Backspace -->
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-r border-b border-base-300"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('7')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="7"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('7')}
	>
		7
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-r border-b border-base-300"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('8')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="8"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('8')}
	>
		8
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-r border-b border-base-300"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('9')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="9"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('9')}
	>
		9
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-2xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-b border-base-300"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('⌫')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label={$t('wallet.calculator.delete')}
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('⌫')}
	>
		⌫
	</div>

	<!-- Row 2: 4, 5, 6, Divide -->
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-r border-b border-base-300"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('4')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="4"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('4')}
	>
		4
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-r border-b border-base-300"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('5')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="5"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('5')}
	>
		5
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-r border-b border-base-300"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('6')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="6"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('6')}
	>
		6
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-primary/20 active:text-primary transition-colors cursor-pointer border-b border-base-300 text-primary"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('÷')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="Divide"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('÷')}
	>
		÷
	</div>

	<!-- Row 3: 1, 2, 3, Multiply -->
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-r border-b border-base-300"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('1')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="1"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('1')}
	>
		1
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-r border-b border-base-300"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('2')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="2"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('2')}
	>
		2
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-r border-b border-base-300"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('3')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="3"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('3')}
	>
		3
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-primary/20 active:text-primary transition-colors cursor-pointer border-b border-base-300 text-primary"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('×')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="Multiply"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('×')}
	>
		×
	</div>

	<!-- Row 4: Decimal, 0, Add, Subtract -->
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-r border-b border-base-300 {unit === 'sats' ? 'opacity-50 cursor-not-allowed' : ''}"
		class:cursor-not-allowed={disabled || unit === 'sats'}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && unit !== 'sats' && handleInput('.')}
		role="button"
		tabindex={disabled || unit === 'sats' ? -1 : 0}
		aria-label="Decimal point"
		aria-disabled={disabled || unit === 'sats'}
		onkeydown={(e) => !disabled && e.key === 'Enter' && unit !== 'sats' && handleInput('.')}
	>
		.
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-base-300 transition-colors cursor-pointer border-r border-b border-base-300"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('0')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="0"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('0')}
	>
		0
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-primary/20 active:text-primary transition-colors cursor-pointer border-r border-b border-base-300 text-primary"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('+')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="Add"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('+')}
	>
		+
	</div>
	<div
		class="min-h-[60px] md:min-h-[70px] flex items-center justify-center text-3xl font-semibold touch-manipulation select-none active:bg-primary/20 active:text-primary transition-colors cursor-pointer border-b border-base-300 text-primary"
		class:cursor-not-allowed={disabled}
		class:pointer-events-none={disabled}
		onclick={() => !disabled && handleInput('−')}
		role="button"
		tabindex={disabled ? -1 : 0}
		aria-label="Subtract"
		aria-disabled={disabled}
		onkeydown={(e) => !disabled && e.key === 'Enter' && handleInput('−')}
	>
		−
	</div>
</div>

<style>
	/* Remove tap highlight on mobile */
	.calculator-keypad > div {
		-webkit-tap-highlight-color: transparent;
	}

	/* Remove last row bottom border */
	.calculator-keypad > div:nth-last-child(-n + 4) {
		border-bottom: none;
	}

	/* Remove last column right border */
	.calculator-keypad > div:nth-child(4n) {
		border-right: none;
	}
</style>
