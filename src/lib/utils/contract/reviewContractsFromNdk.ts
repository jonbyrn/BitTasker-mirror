import { RgbContractState } from '$lib/types/rgb';

export async function fetchNdkPaymentContractsForUser(userPubkey?: string, ndk?: any) {
  return [];
}

export async function fetchLatestStatusFromNostr(eventId?: string, ndk?: any) {
  return null;
}

export async function buildIContractForReviewFromNdkWithNostrStatus(event: any, ndk: any) {
  if (!event) return null;
  try {
    const contractId = event.id || event.tags?.find((t: string[]) => t[0] === 'd')?.[1];
    return {
      id: contractId,
      status: RgbContractState.Created,
      rawEvent: event,
      isRgbNative: true
    };
  } catch (error) {
    console.error('Failed to load RGB contract review status:', error);
    return null;
  }
}

export const buildIconContractForReviewFromNdkWithNostrStatus = buildIContractForReviewFromNdkWithNostrStatus;
export const buildIdIconContractForReviewFromNdkWithNostrStatus = buildIContractForReviewFromNdkWithNostrStatus;

export async function reviewContractsFromNdk(events: any[], ndk: any) {
  if (!Array.isArray(events)) return [];
  const results = await Promise.all(
    events.map((e) => buildIContractForReviewFromNdkWithNostrStatus(e, ndk))
  );
  return results.filter(Boolean);
}

export default reviewContractsFromNdk;
