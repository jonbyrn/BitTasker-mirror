import '@testing-library/jest-dom';

declare module 'vitest' {
	interface Expect<T = any> {
		toBeInTheDocument(): T;
		toHaveAttribute(attr: string, value?: string | RegExp): T;
		toHaveTextContent(text: string | RegExp): T;
		toHaveValue(value: string | number | string[]): T;
		toBeDisabled(): T;
		toHaveClass(...classes: string[]): T;
		toBeVisible(): T;
		toBeHidden(): T;
		toBeEmptyDOMElement(): T;
		toBeInTheDOM(): T;
		toHaveFormValues(expectedValues: Record<string, string | number | boolean>): T;
		toHaveStyle(css: string | Record<string, string>): T;
		toHaveFocus(): T;
		toHaveAccessibleDescription(description: string | RegExp): T;
		toHaveAccessibleName(name: string | RegExp): T;
		toContainHTML(html: string): T;
		toThrowErrorMatchingInlineSnapshot(snapshot?: string): T;
	}
}
