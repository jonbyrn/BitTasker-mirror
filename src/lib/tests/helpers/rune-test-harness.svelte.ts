/**
 * Rune Test Harness — run Svelte 5 runes that use $effect outside component context.
 *
 * $effect requires a component or effect-root context. Wrapping in $effect.root()
 * provides that context so runes can be unit-tested without rendering a component.
 *
 * Usage:
 *   const { result, destroy } = runInEffectRoot(() => useSwapCalculator(opts));
 *   // ...assertions on result...
 *   destroy();
 */
export function runInEffectRoot<T>(fn: () => T): { result: T; destroy: () => void } {
	let result!: T;
	const destroy = $effect.root(() => {
		result = fn();
	});
	return { result, destroy };
}
