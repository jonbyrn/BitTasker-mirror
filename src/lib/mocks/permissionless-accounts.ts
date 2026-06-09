// Mock for permissionless/accounts module
export async function to7702SimpleSmartAccount(params: any) {
  return {
    address: '0xMockSmartAccountAddress0000000000000000000000000000',
    signUserOp: async (userOp: any) => ({ ...userOp, signature: '0xMockSignature' }),
  };
}
