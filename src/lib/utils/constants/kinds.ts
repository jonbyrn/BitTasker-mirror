const KINDS = {
    PROFILE_METADATA: 0,
    PROFILE_SKILLS: 30000,
    PROFILE_LOCATION: 30005,

    TASK_CREATION: 31000,
    RECURRING_TASK: 31006,
    
    SAVED_SEARCHES: 31000, // NIP-51 List for saved searches
    RECOMMENDATIONS: 31001, // NIP-51 List for recommendations

    SAVED_SEARCH: 31002, // NIP-33 Parameterized replaceable event for saved searches
    USER_PREFERENCES: 31003, // NIP-33 Parameterized replaceable event for user preferences

    // TODO: Recheck
    PROFILE_AVAILABILITY: 30001,
    PROFILE_STANDARD_SERVICES: 30002,
    PROFILE_PORTFOLIO: 30003,
    PROFILE_REVIEWS: 30004,
}

export default KINDS;