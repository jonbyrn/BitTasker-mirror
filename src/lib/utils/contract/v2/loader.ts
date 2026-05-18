/**
 * v2 loader — re-exports the existing v2 implementation under the
 * standardised `onLoadPaymentContract` name required by the
 * import.meta.glob auto-discovery pattern in ../loadPaymentContractDetails.ts.
 */
export { loadPaymentContractDetailsV2 as onLoadPaymentContract } from './loadPaymentContractDetailsV2';
