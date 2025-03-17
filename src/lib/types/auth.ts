export interface EncryptedNostrKey {
    accessTokenEncrypted: {
        data: string;
        iv: string;
    };
    recoveryEncrypted: {
        data: string;
        iv: string;
    };
    salt: string;
}

export interface Credentials {
    username: string;
    password: string;
    server: string;
}

export interface EncryptedKeyData {
    data: string;
    iv: string;
}