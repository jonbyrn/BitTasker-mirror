export default {
    "name": "SearchTasks",
    "kind": "HoudiniQuery",
    "hash": "14607cfb6de52af755fc48db52b15e80ab34245aae9cdce2b655003cb8d0eb72",

    "raw": `query SearchTasks($input: SearchTasksDto!) {
  tasks(input: $input) {
    items {
      id
      title
      description
      budget
      status
      createdAt
      deadlineDate
      taskType
      dateRange {
        start
        end
      }
      skillIds
      pickupLocation {
        displayName
        zipCode
      }
      userProfile {
        id
        user {
          id
          username
        }
      }
      bids {
        id
      }
    }
    meta {
      currentPage
      itemCount
      itemsPerPage
      totalItems
      totalPages
      hasNextPage
      hasPreviousPage
    }
  }
}
`,

    "rootType": "Query",
    "stripVariables": [],

    "selection": {
        "fields": {
            "tasks": {
                "type": "PaginatedTasksResponse",
                "keyRaw": "tasks(input: $input)",

                "selection": {
                    "fields": {
                        "items": {
                            "type": "Task",
                            "keyRaw": "items",

                            "selection": {
                                "fields": {
                                    "id": {
                                        "type": "ID",
                                        "keyRaw": "id",
                                        "visible": true
                                    },

                                    "title": {
                                        "type": "String",
                                        "keyRaw": "title",
                                        "visible": true
                                    },

                                    "description": {
                                        "type": "String",
                                        "keyRaw": "description",
                                        "visible": true
                                    },

                                    "budget": {
                                        "type": "Float",
                                        "keyRaw": "budget",
                                        "nullable": true,
                                        "visible": true
                                    },

                                    "status": {
                                        "type": "TaskStatus",
                                        "keyRaw": "status",
                                        "visible": true
                                    },

                                    "createdAt": {
                                        "type": "String",
                                        "keyRaw": "createdAt",
                                        "visible": true
                                    },

                                    "deadlineDate": {
                                        "type": "String",
                                        "keyRaw": "deadlineDate",
                                        "nullable": true,
                                        "visible": true
                                    },

                                    "taskType": {
                                        "type": "TaskType",
                                        "keyRaw": "taskType",
                                        "visible": true
                                    },

                                    "dateRange": {
                                        "type": "DateRangeOutput",
                                        "keyRaw": "dateRange",
                                        "nullable": true,

                                        "selection": {
                                            "fields": {
                                                "start": {
                                                    "type": "String",
                                                    "keyRaw": "start",
                                                    "nullable": true,
                                                    "visible": true
                                                },

                                                "end": {
                                                    "type": "String",
                                                    "keyRaw": "end",
                                                    "nullable": true,
                                                    "visible": true
                                                }
                                            }
                                        },

                                        "visible": true
                                    },

                                    "skillIds": {
                                        "type": "Int",
                                        "keyRaw": "skillIds",
                                        "nullable": true,
                                        "visible": true
                                    },

                                    "pickupLocation": {
                                        "type": "LocationOutput",
                                        "keyRaw": "pickupLocation",
                                        "nullable": true,

                                        "selection": {
                                            "fields": {
                                                "displayName": {
                                                    "type": "String",
                                                    "keyRaw": "displayName",
                                                    "nullable": true,
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

                                    "userProfile": {
                                        "type": "UserProfileOutput",
                                        "keyRaw": "userProfile",

                                        "selection": {
                                            "fields": {
                                                "id": {
                                                    "type": "ID",
                                                    "keyRaw": "id",
                                                    "visible": true
                                                },

                                                "user": {
                                                    "type": "User",
                                                    "keyRaw": "user",
                                                    "nullable": true,

                                                    "selection": {
                                                        "fields": {
                                                            "id": {
                                                                "type": "ID",
                                                                "keyRaw": "id",
                                                                "visible": true
                                                            },

                                                            "username": {
                                                                "type": "String",
                                                                "keyRaw": "username",
                                                                "nullable": true,
                                                                "visible": true
                                                            }
                                                        }
                                                    },

                                                    "visible": true
                                                }
                                            }
                                        },

                                        "visible": true
                                    },

                                    "bids": {
                                        "type": "Bid",
                                        "keyRaw": "bids",
                                        "nullable": true,

                                        "selection": {
                                            "fields": {
                                                "id": {
                                                    "type": "ID",
                                                    "keyRaw": "id",
                                                    "visible": true
                                                }
                                            }
                                        },

                                        "visible": true
                                    }
                                }
                            },

                            "visible": true
                        },

                        "meta": {
                            "type": "PaginationMeta",
                            "keyRaw": "meta",

                            "selection": {
                                "fields": {
                                    "currentPage": {
                                        "type": "Int",
                                        "keyRaw": "currentPage",
                                        "visible": true
                                    },

                                    "itemCount": {
                                        "type": "Int",
                                        "keyRaw": "itemCount",
                                        "visible": true
                                    },

                                    "itemsPerPage": {
                                        "type": "Int",
                                        "keyRaw": "itemsPerPage",
                                        "visible": true
                                    },

                                    "totalItems": {
                                        "type": "Int",
                                        "keyRaw": "totalItems",
                                        "visible": true
                                    },

                                    "totalPages": {
                                        "type": "Int",
                                        "keyRaw": "totalPages",
                                        "visible": true
                                    },

                                    "hasNextPage": {
                                        "type": "Boolean",
                                        "keyRaw": "hasNextPage",
                                        "visible": true
                                    },

                                    "hasPreviousPage": {
                                        "type": "Boolean",
                                        "keyRaw": "hasPreviousPage",
                                        "visible": true
                                    }
                                }
                            },

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
            "input": "SearchTasksDto"
        },

        "types": {
            "DateRangeInput": {
                "end": "String",
                "start": "String"
            },

            "SearchTasksDto": {
                "budgetType": "BudgetType",
                "categoryId": "Int",
                "categoryIds": "Int",
                "deadlineAfter": "String",
                "deadlineBefore": "String",
                "deadlineDateRange": "DateRangeInput",
                "includeDeleted": "Boolean",
                "latitude": "Float",
                "limit": "Int",
                "location": "String",
                "longitude": "Float",
                "maxBudget": "Float",
                "minBudget": "Float",
                "onlyBoostedTasks": "Boolean",
                "page": "Int",
                "radius": "Float",
                "search": "String",
                "searchTerm": "String",
                "skillIds": "Int",
                "sortBy": "String",
                "sortOrder": "String",
                "status": "TaskStatus",
                "taskType": "TaskType"
            }
        },

        "defaults": {},
        "runtimeScalars": {}
    },

    "policy": "CacheOrNetwork",
    "partial": false
};

"HoudiniHash=ec62cfdfbd6980669bf0e572b40760a5b2c5ddf0fae41404d0c7dcc601aec137";