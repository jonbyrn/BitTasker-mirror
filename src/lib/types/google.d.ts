interface GoogleUser {
    getBasicProfile(): {
        getId(): string;
        getEmail(): string;
        getName(): string;
    };
    getAuthResponse(): {
        id_token: string;
    };
}

interface Auth2Instance {
    signIn(): Promise<GoogleUser>;
}

interface Auth2 {
    init(params: { client_id: string; scope: string }): Promise<Auth2Instance>;
    getAuthInstance(): Promise<Auth2Instance>;
}

interface Window {
    gapi: {
        auth2: Auth2;
        load(api: string, callback: () => void): void;
    };
    google: {
        accounts: {
            id: {
                initialize(config: any): void;
                prompt(): void;
            };
        };
    };
}
