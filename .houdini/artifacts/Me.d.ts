import { UserRole } from "$houdini/graphql/enums";
import { UserStatus } from "$houdini/graphql/enums";
import type { ValueOf } from "$houdini/runtime/lib/types";

export type Me = {
    readonly "input": Me$input;
    readonly "result": Me$result | undefined;
};

export type Me$result = {
    readonly me: {
        readonly id: string;
        readonly email: string | null;
        readonly name: string | null;
        readonly displayName: string | null;
        readonly username: string | null;
        readonly profilePictureUrl: string | null;
        readonly profilePictureId: string | null;
        readonly onboardingComplete: boolean;
        readonly biddingAllowed: boolean;
        readonly isEmailVerified: boolean;
        readonly status: ValueOf<typeof UserStatus>;
        readonly userRole: ValueOf<typeof UserRole>;
        readonly dob: string | null;
        readonly location: {
            readonly displayName: string;
            readonly latitude: number;
            readonly longitude: number;
            readonly zipCode: string | null;
        } | null;
        readonly skills: ({
            readonly id: string;
            readonly name: string;
        })[];
        readonly mobileNumber: string | null;
        readonly lastLoginAt: string | null;
        readonly createdAt: string;
        readonly updatedAt: string;
    };
};

export type Me$input = null;

export type Me$artifact = {
    "name": "Me";
    "kind": "HoudiniQuery";
    "hash": "1ce76aacae8cf3e190e7528b7b98ab6465de83f79eddfb725564e5ca17a5853d";
    "raw": `query Me {
  me {
    id
    email
    name
    displayName
    username
    profilePictureUrl
    profilePictureId
    onboardingComplete
    biddingAllowed
    isEmailVerified
    status
    userRole
    dob
    location {
      displayName
      latitude
      longitude
      zipCode
    }
    skills {
      id
      name
    }
    mobileNumber
    lastLoginAt
    createdAt
    updatedAt
  }
}
`;
    "rootType": "Query";
    "stripVariables": [];
    "selection": {
        "fields": {
            "me": {
                "type": "User";
                "keyRaw": "me";
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
                        "displayName": {
                            "type": "String";
                            "keyRaw": "displayName";
                            "nullable": true;
                            "visible": true;
                        };
                        "username": {
                            "type": "String";
                            "keyRaw": "username";
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
                        "biddingAllowed": {
                            "type": "Boolean";
                            "keyRaw": "biddingAllowed";
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
                        "userRole": {
                            "type": "UserRole";
                            "keyRaw": "userRole";
                            "visible": true;
                        };
                        "dob": {
                            "type": "DateTime";
                            "keyRaw": "dob";
                            "nullable": true;
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
                        "skills": {
                            "type": "Skill";
                            "keyRaw": "skills";
                            "selection": {
                                "fields": {
                                    "id": {
                                        "type": "ID";
                                        "keyRaw": "id";
                                        "visible": true;
                                    };
                                    "name": {
                                        "type": "String";
                                        "keyRaw": "name";
                                        "visible": true;
                                    };
                                };
                            };
                            "visible": true;
                        };
                        "mobileNumber": {
                            "type": "String";
                            "keyRaw": "mobileNumber";
                            "nullable": true;
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
    "pluginData": {
        "houdini-svelte": {};
    };
    "policy": "CacheOrNetwork";
    "partial": false;
};