<script lang="ts">
	import { t } from 'svelte-i18n';
	import { browser } from '$app/environment';

	interface Props {
		unit: 'sats' | 'usd';
		disabled?: boolean;
		onInput: (value: string) => void;
		onCalculationChange?: (mathExpression: string, result: number) => void;
	}

	let { unit, disabled = false, onInput, onCalculationChange }: Props = $props();

	// Types
	type KeyType = 'number' | 'operator' | 'action' | 'decimal';
	type OperatorSymbol = '+' | '−' | '×' | '÷';

	interface KeyConfig {
		value: string;
		label: string;
		type: KeyType;
		ariaLabel?: string;
		isOperator?: boolean;
	}

	// Constants
	const KEYPAD_LAYOUT: KeyConfig[][] = [
		[
			{ value: '7', label: '7', type: 'number' },
			{ value: '8', label: '8', type: 'number' },
			{ value: '9', label: '9', type: 'number' },
			{ value: '⌫', label: '⌫', type: 'action', ariaLabel: 'wallet.calculator.delete' }
		],
		[
			{ value: '4', label: '4', type: 'number' },
			{ value: '5', label: '5', type: 'number' },
			{ value: '6', label: '6', type: 'number' },
			{
				value: '÷',
				label: '÷',
				type: 'operator',
				ariaLabel: 'wallet.calculator.divide',
				isOperator: true
			}
		],
		[
			{ value: '1', label: '1', type: 'number' },
			{ value: '2', label: '2', type: 'number' },
			{ value: '3', label: '3', type: 'number' },
			{
				value: '×',
				label: '×',
				type: 'operator',
				ariaLabel: 'wallet.calculator.multiply',
				isOperator: true
			}
		],
		[
			{ value: '.', label: '.', type: 'decimal', ariaLabel: 'wallet.calculator.decimal_point' },
			{ value: '0', label: '0', type: 'number' },
			{
				value: '+',
				label: '+',
				type: 'operator',
				ariaLabel: 'wallet.calculator.add',
				isOperator: true
			},
			{
				value: '−',
				label: '−',
				type: 'operator',
				ariaLabel: 'wallet.calculator.subtract',
				isOperator: true
			}
		]
	];

	const KEYBOARD_MAP: Record<string, string> = {
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
		Enter: '=',
		Backspace: '⌫',
		Delete: 'C',
		Escape: 'C'
	};

	// Calculator state
	let calculatorValue = $state('');
	let previousValue = $state<number | null>(null);
	let operator = $state<OperatorSymbol | null>(null);
	let waitingForOperand = $state(false);

	// Pure calculation functions
	function performOperation(a: number, b: number, op: OperatorSymbol): number {
		switch (op) {
			case '+':
				return a + b;
			case '−':
				return a - b;
			case '×':
				return a * b;
			case '÷':
				return b !== 0 ? a / b : 0;
		}
	}

	function formatResult(value: number, currentUnit: 'sats' | 'usd'): string {
		if (currentUnit === 'sats') {
			return Math.floor(value).toString();
		}
		return value.toFixed(2).replace(/\.?0+$/, '');
	}

	function notifyCalculationChange(expression: string, result: number): void {
		if (onCalculationChange) {
			onCalculationChange(expression, result);
		}
	}

	function updateMathExpression(): void {
		if (previousValue !== null && operator && calculatorValue) {
			const currentValue = parseFloat(calculatorValue) || 0;
			const result = performOperation(previousValue, currentValue, operator);
			const formattedResult = unit === 'sats' ? Math.floor(result) : parseFloat(result.toFixed(2));
			const expression = `${previousValue} ${operator} ${currentValue} = ${formattedResult}`;
			notifyCalculationChange(expression, formattedResult);
			return;
		}

		if (previousValue !== null && operator) {
			const expression = `${previousValue} ${operator}`;
			notifyCalculationChange(expression, previousValue);
			return;
		}

		if (calculatorValue) {
			const currentResult = parseFloat(calculatorValue) || 0;
			notifyCalculationChange(calculatorValue, currentResult);
			return;
		}

		notifyCalculationChange('', 0);
	}

	function resetCalculatorState(): void {
		calculatorValue = '';
		previousValue = null;
		operator = null;
		waitingForOperand = false;
		onInput('');
		notifyCalculationChange('', 0);
	}

	// Focused handler functions
	function handleClear(): void {
		resetCalculatorState();
	}

	function handleDelete(): void {
		calculatorValue = calculatorValue.slice(0, -1);
		onInput(calculatorValue);
		updateMathExpression();
	}

	function handleDecimal(): void {
		if (unit === 'sats') return; // No decimals for sats - don't trigger haptic
		if (calculatorValue.includes('.')) return; // Already has decimal

		calculatorValue += '.';
		onInput(calculatorValue);
		updateMathExpression();
	}

	function handleOperator(value: OperatorSymbol): void {
		// Auto-calculate if we have a previous value and operator
		if (previousValue !== null && operator && calculatorValue) {
			const currentValue = parseFloat(calculatorValue) || 0;
			const result = performOperation(previousValue, currentValue, operator);
			calculatorValue = formatResult(result, unit);
			previousValue = parseFloat(calculatorValue) || 0;
		} else if (calculatorValue) {
			previousValue = parseFloat(calculatorValue) || 0;
		}

		operator = value;
		waitingForOperand = true;
		calculatorValue = '';
		updateMathExpression();
	}

	function handleEquals(): void {
		if (previousValue === null || !operator || !calculatorValue) return;

		const currentValue = parseFloat(calculatorValue) || 0;
		const result = performOperation(previousValue, currentValue, operator);
		calculatorValue = formatResult(result, unit);

		const expression = `${previousValue} ${operator} ${currentValue} = ${calculatorValue}`;
		onInput(calculatorValue);
		notifyCalculationChange(expression, parseFloat(calculatorValue) || 0);

		previousValue = null;
		operator = null;
		waitingForOperand = false;
	}

	function handleNumber(value: string): void {
		// Prevent decimals in sats mode - don't trigger haptic for invalid action
		if (!waitingForOperand && unit === 'sats' && calculatorValue.includes('.')) {
			return;
		}

		// If starting fresh input (no calculator value) and we have stale operator state,
		// it means the parent cleared the display (e.g., unit change), so reset our state
		if (!calculatorValue && !waitingForOperand && (previousValue !== null || operator !== null)) {
			previousValue = null;
			operator = null;
		}

		if (waitingForOperand) {
			calculatorValue = value;
			waitingForOperand = false;
		} else {
			calculatorValue += value;
		}

		onInput(calculatorValue);
		updateMathExpression();
	}

	function handleInput(value: string): void {
		if (disabled) return;

		if (value === 'C') {
			handleClear();
		} else if (value === '⌫') {
			handleDelete();
		} else if (value === '.') {
			handleDecimal();
		} else if (['+', '−', '×', '÷'].includes(value)) {
			handleOperator(value as OperatorSymbol);
		} else if (value === '=') {
			handleEquals();
		} else {
			handleNumber(value);
		}
	}

	// Handle keyboard input
	function handleKeydown(e: KeyboardEvent): void {
		if (!browser) return;
		// Don't intercept keyboard events if user is typing in an input or textarea
		const activeElement = document.activeElement;
		if (
			activeElement &&
			(activeElement.tagName === 'INPUT' ||
				activeElement.tagName === 'TEXTAREA' ||
				activeElement.getAttribute('contenteditable') === 'true')
		) {
			return;
		}

		const mappedKey = KEYBOARD_MAP[e.key];
		if (mappedKey) {
			e.preventDefault();
			handleInput(mappedKey);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="calculator-keypad border-base-300 bg-base-100 grid grid-cols-4 overflow-hidden rounded-lg border"
	class:opacity-50={disabled}
>
	{#each KEYPAD_LAYOUT as row, rowIndex (rowIndex)}
		{#each row as key (key.value)}
			{@const keyDisabled = disabled || (key.type === 'decimal' && unit === 'sats')}
			<button
				class="border-base-300 flex min-h-[52px] cursor-pointer touch-manipulation items-center justify-center border-r border-b font-semibold transition-colors select-none {key.isOperator
					? 'active:bg-primary/20 active:text-primary text-primary text-2xl'
					: key.type === 'action'
						? 'active:bg-base-300 text-xl'
						: 'active:bg-base-300 text-2xl'} {keyDisabled
					? 'pointer-events-none cursor-not-allowed opacity-50'
					: ''}"
				onclick={() => !keyDisabled && handleInput(key.value)}
				aria-label={key.ariaLabel?.startsWith('wallet.')
					? $t(key.ariaLabel)
					: key.ariaLabel || key.label}
				aria-disabled={keyDisabled}
			>
				{key.label}
			</button>
		{/each}
	{/each}
</div>

<style>
	/* Remove tap highlight on mobile */
	.calculator-keypad > button {
		-webkit-tap-highlight-color: transparent;
	}

	/* Remove last row bottom border */
	.calculator-keypad > button:nth-last-child(-n + 4) {
		border-bottom: none;
	}

	/* Remove last column right border */
	.calculator-keypad > button:nth-child(4n) {
		border-right: none;
	}
</style>
