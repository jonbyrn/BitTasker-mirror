// Mock for permissionless/accounts module
export async function to7702SimpleSmartAccount(_params: unknown) {
	return {
		address: '0xMockSmartAccountAddress0000000000000000000000000000',
		signUserOperation: async (userOp: unknown) => ({
			...(userOp as Record<string, unknown>),
			signature: '0xMockSignature'
		})
	};
}
