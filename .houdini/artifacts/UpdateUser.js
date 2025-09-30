export default {
    "name": "UpdateUser",
    "kind": "HoudiniMutation",
    "hash": "d235486fdc8df1b16df0cf057e3775ccb16c0d5bc1d390d9eaff794a9067f147",

    "raw": `mutation UpdateUser($input: UpdateUserProfileInput!) {
  updateUserProfile(input: $input) {
    id
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
`,

    "rootType": "Mutation",
    "stripVariables": [],

    "selection": {
        "fields": {
            "updateUserProfile": {
                "type": "User",
                "keyRaw": "updateUserProfile(input: $input)",

                "selection": {
                    "fields": {
                        "id": {
                            "type": "ID",
                            "keyRaw": "id",
                            "visible": true
                        },

                        "name": {
                            "type": "String",
                            "keyRaw": "name",
                            "nullable": true,
                            "visible": true
                        },

                        "email": {
                            "type": "String",
                            "keyRaw": "email",
                            "nullable": true,
                            "visible": true
                        },

                        "profilePictureUrl": {
                            "type": "String",
                            "keyRaw": "profilePictureUrl",
                            "nullable": true,
                            "visible": true
                        },

                        "profilePictureId": {
                            "type": "String",
                            "keyRaw": "profilePictureId",
                            "nullable": true,
                            "visible": true
                        },

                        "onboardingComplete": {
                            "type": "Boolean",
                            "keyRaw": "onboardingComplete",
                            "visible": true
                        },

                        "userRole": {
                            "type": "UserRole",
                            "keyRaw": "userRole",
                            "visible": true
                        },

                        "location": {
                            "type": "UserLocation",
                            "keyRaw": "location",
                            "nullable": true,

                            "selection": {
                                "fields": {
                                    "displayName": {
                                        "type": "String",
                                        "keyRaw": "displayName",
                                        "visible": true
                                    },

                                    "latitude": {
                                        "type": "Float",
                                        "keyRaw": "latitude",
                                        "visible": true
                                    },

                                    "longitude": {
                                        "type": "Float",
                                        "keyRaw": "longitude",
                                        "visible": true
                                    },

                                    "zipCode": {
                                        "type": "String",
                                        "keyRaw": "zipCode",
                                        "nullable": true,
                                        "visible": true
                                    }
                                }
                            },

                            "visible": true
                        },

                        "lastLoginAt": {
                            "type": "DateTime",
                            "keyRaw": "lastLoginAt",
                            "nullable": true,
                            "visible": true
                        },

                        "isEmailVerified": {
                            "type": "Boolean",
                            "keyRaw": "isEmailVerified",
                            "visible": true
                        },

                        "status": {
                            "type": "UserStatus",
                            "keyRaw": "status",
                            "visible": true
                        },

                        "createdAt": {
                            "type": "DateTime",
                            "keyRaw": "createdAt",
                            "visible": true
                        },

                        "updatedAt": {
                            "type": "DateTime",
                            "keyRaw": "updatedAt",
                            "visible": true
                        }
                    }
                },

                "visible": true
            }
        }
    },

    "pluginData": {
        "houdini-svelte": {}
    },

    "input": {
        "fields": {
            "input": "UpdateUserProfileInput"
        },

        "types": {
            "UpdateUserLocationInput": {
                "displayName": "String",
                "latitude": "Float",
                "longitude": "Float",
                "serviceRadius": "Float",
                "zipCode": "String"
            },

            "UpdateUserProfileInput": {
                "displayName": "String",
                "location": "UpdateUserLocationInput",
                "professionalTitle": "String",
                "profileDescription": "String",
                "profilePictureId": "String",
                "profilePictureUrl": "String",
                "skills": "String",
                "username": "String"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    }
};

"HoudiniHash=10026af8ada2364b0b1e63863b891a73a8af93e279b04c2396954b985635ce55";