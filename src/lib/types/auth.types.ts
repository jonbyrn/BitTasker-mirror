export interface NostrRegistrationData {
    email: string;
    name: string;
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    salt: string;
    authTag: string;
    iterations: number;
}

export interface ApiResponse<T> {
    data: T;
    status: number;
    message?: string;
}
