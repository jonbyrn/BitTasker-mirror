import debugPkg from 'debug';
import { BROWSER as browser } from 'esm-env';

// Rollup's CJS interop (`getDefaultExportFromCjs`) can return the raw
// `exports` object instead of the `createDebug` function when the module
// reassigns `module.exports` after populating `exports.*`. Normalise here
// so every consumer gets a callable function.
const debug: typeof debugPkg =
	typeof debugPkg === 'function'
		? debugPkg
		: ((debugPkg as unknown as { default: typeof debugPkg }).default ?? debugPkg);

// Root namespace for your app
const APP_NAMESPACE = 'btasker';

/**
 * Create a debug logger with namespaced levels
 */
export const createDebug = (namespace: string) => {
	// Create the base debugger
	const baseDebug = debug(`${APP_NAMESPACE}:${namespace}`);

	return {
		// Standard log function
		log: baseDebug,

		// Warning and error levels
		warn: baseDebug.extend('warn'),
		error: baseDebug.extend('error'),

		// Allow creating subnamespaces
		extend: (subNamespace: string) => createDebug(`${namespace}:${subNamespace}`)
	};
};

/**
 * Initialize debug settings from localStorage on app start
 */
export const initDebug = () => {
	if (browser && localStorage.debug) {
		debug.enable(localStorage.debug);
		console.log(`Debug initialized with settings: ${localStorage.debug}`);
	}
};

// Export the original debug instance for advanced use cases
export { debug };
