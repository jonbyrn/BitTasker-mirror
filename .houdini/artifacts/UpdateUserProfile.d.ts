import { UserStatus } from "$houdini/graphql/enums";
import { UserRole } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";

export type UpdateUserProfile = {
    readonly "input": UpdateUserProfile$input;
    readonly "result": UpdateUserProfile$result;
};

export type UpdateUserProfile$result = {
    readonly updateUserProfile: {
        readonly id: string;
        readonly username: string | null;
        readonly displayName: string | null;
        readonly name: string | null;
        readonly email: string | null;
        readonly profilePictureUrl: string | null;
        readonly profilePictureId: string | null;
        readonly onboardingComplete: boolean;
        readonly userRole: ValueOf<typeof UserRole>;
        readonly location: {
            readonly displayName: string;
            readonly latitude: number;
            readonly longitude: number;
            readonly zipCode: string | null;
        } | null;
        readonly lastLoginAt: string | null;
        readonly isEmailVerified: boolean;
        readonly status: ValueOf<typeof UserStatus>;
        readonly createdAt: string;
        readonly updatedAt: string;
    };
};

type UpdateUserLocationInput = {
    displayName: string;
    latitude: number;
    longitude: number;
    serviceRadius?: number | null | undefined;
    zipCode?: string | null | undefined;
};

type UpdateUserProfileInput = {
    displayName?: string | null | undefined;
    location?: UpdateUserLocationInput | null | undefined;
    professionalTitle?: string | null | undefined;
    profileDescription?: string | null | undefined;
    profilePictureId?: string | null | undefined;
    profilePictureUrl?: string | null | undefined;
    skills?: (string)[] | null | undefined;
    username?: string | null | undefined;
};

export type UpdateUserProfile$input = {
    input: UpdateUserProfileInput;
};

export type UpdateUserProfile$optimistic = {
    readonly updateUserProfile?: {
        readonly id?: string;
        readonly username?: string | null;
        readonly displayName?: string | null;
        readonly name?: string | null;
        readonly email?: string | null;
        readonly profilePictureUrl?: string | null;
        readonly profilePictureId?: string | null;
        readonly onboardingComplete?: boolean;
        readonly userRole?: ValueOf<typeof UserRole>;
        readonly location?: {
            readonly displayName?: string;
            readonly latitude?: number;
            readonly longitude?: number;
            readonly zipCode?: string | null;
        } | null;
        readonly lastLoginAt?: string | null;
        readonly isEmailVerified?: boolean;
        readonly status?: ValueOf<typeof UserStatus>;
        readonly createdAt?: string;
        readonly updatedAt?: string;
    };
};

export type UpdateUserProfile$artifact = {
    "name": "UpdateUserProfile";
    "kind": "HoudiniMutation";
    "hash": "3a9ab5a5ef99be7ef4c44a9845efb1d46a96ca56f4cfdaf75da898c3524a33e0";
    "raw": `mutation UpdateUserProfile($input: UpdateUserProfileInput!) {
  updateUserProfile(input: $input) {
    id
    username
    displayName
    name
    email
    profilePictureUrl
    profilePictureId
    onboardingComplete
    userRole
    location {
      displayName
      latitude
      longitude
      zipCode
    }
    lastLoginAt
    isEmailVerified
    status
    createdAt
    updatedAt
  }
}
`;
    "rootType": "Mutation";
    "stripVariables": [];
    "selection": {
        "fields": {
            "updateUserProfile": {
                "type": "User";
                "keyRaw": "updateUserProfile(input: $input)";
                "selection": {
                    "fields": {
                        "id": {
                            "type": "ID";
                            "keyRaw": "id";
                            "visible": true;
                        };
                        "username": {
                            "type": "String";
                            "keyRaw": "username";
                            "nullable": true;
                            "visible": true;
                        };
                        "displayName": {
                            "type": "String";
                            "keyRaw": "displayName";
                            "nullable": true;
                            "visible": true;
                        };
                        "name": {
                            "type": "String";
                            "keyRaw": "name";
                            "nullable": true;
                            "visible": true;
                        };
                        "email": {
                            "type": "String";
                            "keyRaw": "email";
                            "nullable": true;
                            "visible": true;
                        };
                        "profilePictureUrl": {
                            "type": "String";
                            "keyRaw": "profilePictureUrl";
                            "nullable": true;
                            "visible": true;
                        };
                        "profilePictureId": {
                            "type": "String";
                            "keyRaw": "profilePictureId";
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
                        "location": {
                            "type": "UserLocation";
                            "keyRaw": "location";
                            "nullable": true;
                            "selection": {
                                "fields": {
                                    "displayName": {
                                        "type": "String";
                                        "keyRaw": "displayName";
                                        "visible": true;
                                    };
                                    "latitude": {
                                        "type": "Float";
                                        "keyRaw": "latitude";
                                        "visible": true;
                                    };
                                    "longitude": {
                                        "type": "Float";
                                        "keyRaw": "longitude";
                                        "visible": true;
                                    };
                                    "zipCode": {
                                        "type": "String";
                                        "keyRaw": "zipCode";
                                        "nullable": true;
                                        "visible": true;
                                    };
                                };
                            };
                            "visible": true;
                        };
                        "lastLoginAt": {
                            "type": "DateTime";
                            "keyRaw": "lastLoginAt";
                            "nullable": true;
                            "visible": true;
                        };
                        "isEmailVerified": {
                            "type": "Boolean";
                            "keyRaw": "isEmailVerified";
                            "visible": true;
                        };
                        "status": {
                            "type": "UserStatus";
                            "keyRaw": "status";
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
    "pluginData": {
        "houdini-svelte": {};
    };
    "input": {
        "fields": {
            "input": "UpdateUserProfileInput";
        };
        "types": {
            "UpdateUserLocationInput": {
                "displayName": "String";
                "latitude": "Float";
                "longitude": "Float";
                "serviceRadius": "Float";
                "zipCode": "String";
            };
            "UpdateUserProfileInput": {
                "displayName": "String";
                "location": "UpdateUserLocationInput";
                "professionalTitle": "String";
                "profileDescription": "String";
                "profilePictureId": "String";
                "profilePictureUrl": "String";
                "skills": "String";
                "username": "String";
            };
        };
        "defaults": {};
        "runtimeScalars": {};
    };
};