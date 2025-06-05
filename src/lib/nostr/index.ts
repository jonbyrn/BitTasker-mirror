/**
 * Calculate proof of work for a task based on its budget
 * Returns [hash, nonce] where hash has the required number of leading zero bits
 */
export async function calculatePOW(budget: number): Promise<[string, string]> {
    let nonce = 0;
    let hash = '';
    
    // Calculate target difficulty based on budget
    // For budget > 1, use log base 2 to scale difficulty
    // For budget < 1, ensure minimum difficulty of 8 bits
    const difficulty = budget >= 1 
        ? Math.min(Math.floor(Math.log2(budget)) + 8, 24)  // Cap at 24 bits
        : 8; // Minimum difficulty for small amounts

    while (true) {
        const data = `${budget}:${nonce}`;
        hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
            .then(buffer => Array.from(new Uint8Array(buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join(''));

        // Count leading zero bits properly according to NIP-13
        let zeroBits = 0;
        for (let i = 0; i < hash.length; i++) {
            const nibble = parseInt(hash[i], 16);
            if (nibble === 0) {
                zeroBits += 4;
            } else {
                // Count remaining bits in this nibble
                zeroBits += Math.clz32(nibble) - 28;
                break;
            }
        }

        if (zeroBits >= difficulty) break;
        nonce++;
    }

    return [hash, nonce.toString()];
}