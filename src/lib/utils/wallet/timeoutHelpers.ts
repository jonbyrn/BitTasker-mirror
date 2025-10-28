/**
 * Timeout helper utilities for contract calls
 * Provides reusable timeout wrappers to prevent hanging operations
 */

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timeout'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

export async function withTimeoutAndFallback<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  try {
    return await withTimeout(promise, timeoutMs);
  } catch {
    return fallback;
  }
}
