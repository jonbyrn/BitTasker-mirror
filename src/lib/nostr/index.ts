/**
 * Calculate proof of work for a task based on its budget and optional unique identifier
 * Returns [hash, nonce] where hash has the required number of leading zero bits
 */
export async function calculatePOW(budget: number, uniqueId?: string): Promise<[string, string]> {
	let nonce = 0;
	let hash = '';

	// Use fixed low difficulty for development/testing
	const difficulty = 4; // Only 4 leading zero bits - much faster

	const maxNonce = 100000; // 100k max attempts

	while (nonce < maxNonce) {
		// Include uniqueId in the POW calculation to ensure uniqueness
		const data = `${budget}:${uniqueId || ''}:${nonce}`;

		try {
			hash = await crypto.subtle
				.digest('SHA-256', new TextEncoder().encode(data) as BufferSource)
				.then((buffer) =>
					Array.from(new Uint8Array(buffer))
						.map((b) => b.toString(16).padStart(2, '0'))
						.join('')
				);
		} catch (error) {
			console.error('❌ Error calculating hash:', error);
			throw new Error('Failed to calculate hash for POW');
		}

		// Count leading zero bits
		let zeroBits = 0;
		for (let i = 0; i < hash.length; i++) {
			const nibble = parseInt(hash[i], 16);
			if (nibble === 0) {
				zeroBits += 4;
			} else {
				zeroBits += Math.clz32(nibble) - 28;
				break;
			}
		}

		if (zeroBits >= difficulty) {
			break;
		}

		nonce++;
	}

	if (nonce >= maxNonce) {
		console.warn(`⚠️ POW max attempts reached, using best hash found`);
	}

	return [hash, nonce.toString()];
}
