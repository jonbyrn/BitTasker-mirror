/**
 * v1 loader — re-exports the existing v1 implementation under the
 * standardised `onLoadPaymentContract` name required by the
 * import.meta.glob auto-discovery pattern in ../loadPaymentContractDetails.ts.
 */
export { loadPaymentContractDetails as onLoadPaymentContract } from './index';
