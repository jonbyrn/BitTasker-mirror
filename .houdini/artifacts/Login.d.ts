import { UserStatus } from "$houdini/graphql/enums";
import { UserRole } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";

export type Login = {
    readonly "input": Login$input;
    readonly "result": Login$result;
};

export type Login$result = {
    readonly login: {
        readonly access_token: string;
        readonly expires_in: number;
        readonly token_type: string;
        readonly user: {
            readonly id: string;
            readonly email: string | null;
            readonly name: string | null;
            readonly profilePictureUrl: string | null;
            readonly onboardingComplete: boolean;
            readonly userRole: ValueOf<typeof UserRole>;
            readonly status: ValueOf<typeof UserStatus>;
            readonly isEmailVerified: boolean;
            readonly lastLoginAt: string | null;
            readonly createdAt: string;
            readonly updatedAt: string;
        };
    };
};

type LoginInput = {
    email: string;
    password: string;
};

export type Login$input = {
    input: LoginInput;
};

export type Login$optimistic = {
    readonly login?: {
        readonly access_token?: string;
        readonly expires_in?: number;
        readonly token_type?: string;
        readonly user?: {
            readonly id?: string;
            readonly email?: string | null;
            readonly name?: string | null;
            readonly profilePictureUrl?: string | null;
            readonly onboardingComplete?: boolean;
            readonly userRole?: ValueOf<typeof UserRole>;
            readonly status?: ValueOf<typeof UserStatus>;
            readonly isEmailVerified?: boolean;
            readonly lastLoginAt?: string | null;
            readonly createdAt?: string;
            readonly updatedAt?: string;
        };
    };
};

export type Login$artifact = {
    "name": "Login";
    "kind": "HoudiniMutation";
    "hash": "416c1af1dab37c542a385ac38e38743db36742f39a4395d5094e3d4ccd6e2f8f";
    "raw": `mutation Login($input: LoginInput!) {
  login(input: $input) {
    access_token
    expires_in
    token_type
    user {
      id
      email
      name
      profilePictureUrl
      onboardingComplete
      userRole
      status
      isEmailVerified
      lastLoginAt
      createdAt
      updatedAt
    }
  }
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "login": {
                "type": "Auth";
                "keyRaw": "login(input: $input)";
                "selection": {
                    "fields": {
                        "access_token": {
                            "type": "String";
                            "keyRaw": "access_token";
                            "visible": true;
                        };
                        "expires_in": {
                            "type": "Int";
                            "keyRaw": "expires_in";
                            "visible": true;
                        };
                        "token_type": {
                            "type": "String";
                            "keyRaw": "token_type";
                            "visible": true;
                        };
                        "user": {
                            "type": "User";
                            "keyRaw": "user";
                            "selection": {
                                "fields": {
                                    "id": {
                                        "type": "ID";
                                        "keyRaw": "id";
                                        "visible": true;
                                    };
                                    "email": {
                                        "type": "String";
                                        "keyRaw": "email";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "name": {
                                        "type": "String";
                                        "keyRaw": "name";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "profilePictureUrl": {
                                        "type": "String";
                                        "keyRaw": "profilePictureUrl";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "onboardingComplete": {
                                        "type": "Boolean";
                                        "keyRaw": "onboardingComplete";
                                        "visible": true;
                                    };
                                    "userRole": {
                                        "type": "UserRole";
                                        "keyRaw": "userRole";
                                        "visible": true;
                                    };
                                    "status": {
                                        "type": "UserStatus";
                                        "keyRaw": "status";
                                        "visible": true;
                                    };
                                    "isEmailVerified": {
                                        "type": "Boolean";
                                        "keyRaw": "isEmailVerified";
                                        "visible": true;
                                    };
                                    "lastLoginAt": {
                                        "type": "DateTime";
                                        "keyRaw": "lastLoginAt";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                    "createdAt": {
                                        "type": "DateTime";
                                        "keyRaw": "createdAt";
                                        "visible": true;
                                    };
                                    "updatedAt": {
                                        "type": "DateTime";
                                        "keyRaw": "updatedAt";
                                        "visible": true;
                                    };
                                };
                            };
                            "visible": true;
                        };
                    };
                };
                "visible": true;
            };
        };
    };
    "pluginData": {
        "houdini-svelte": {};
    };
    "input": {
        "fields": {
            "input": "LoginInput";
        };
        "types": {
            "LoginInput": {
                "email": "String";
                "password": "String";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
};