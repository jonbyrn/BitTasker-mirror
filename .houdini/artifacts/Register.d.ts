import { UserStatus } from "$houdini/graphql/enums";
import { UserRole } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";

export type Register = {
    readonly "input": Register$input;
    readonly "result": Register$result;
};

export type Register$result = {
    readonly register: {
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

type RegisterInput = {
    email: string;
    name?: string | null | undefined;
    password: string;
};

export type Register$input = {
    input: RegisterInput;
};

export type Register$optimistic = {
    readonly register?: {
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

export type Register$artifact = {
    "name": "Register";
    "kind": "HoudiniMutation";
    "hash": "f5e3765eb2825f032a727a0684b913a551ef4e52eb6573a7ecdbbc27d4a20c97";
    "raw": `mutation Register($input: RegisterInput!) {
  register(input: $input) {
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
            "register": {
                "type": "Auth";
                "keyRaw": "register(input: $input)";
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
            "input": "RegisterInput";
        };
        "types": {
            "RegisterInput": {
                "email": "String";
                "name": "String";
                "password": "String";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
};