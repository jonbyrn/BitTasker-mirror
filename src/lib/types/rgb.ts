export type RgbContractState = 'created' | 'active' | 'completed' | 'cancelled' | 'disputed' | string;
export const RgbContractState = {
  Created: 'created',
  Active: 'active',
  Completed: 'completed',
  Cancelled: 'cancelled',
  Disputed: 'disputed'
} as const;
