/**
 * Calculate proof of work for a task based on its budget
 */
export async function calculatePOW(budget: number): Promise<[string, string]> {
    let nonce = 0;
    let hash = '';
    const difficulty = Math.min(Math.floor(Math.log10(budget) + 2), 8);
    const target = '0'.repeat(difficulty);

    while (true) {
        const data = `${budget}:${nonce}`;
        hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
            .then(buffer => Array.from(new Uint8Array(buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join(''));

        if (hash.startsWith(target)) break;
        nonce++;
    }

    return [hash, nonce.toString()];
}