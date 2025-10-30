/**
 * Lazy loader for secp256k1-zkp library
 * Required for Liquid Bitcoin confidential transactions and MuSig2
 */

import Loader from '$lib/lazy/loader';

// Create loader instance  
const loader = new Loader('Secp256k1ZKP', async () => {
	// Lazy import all heavy dependencies
	const zkp = (await import('@vulpemventures/secp256k1-zkp')).default;
	
	const secp = await zkp();
	
	// Don't initialize boltz-core here - let callers do it when needed
	// This prevents eager evaluation of boltz-core/dist/lib/liquid
	
	return {
		secpZkp: secp
	};
});

export default loader;

// Export a function that calls the loader's get method
export const get = async () => {
	return await loader.get();
};
