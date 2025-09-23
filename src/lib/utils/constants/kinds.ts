const KINDS = {
    PROFILE_METADATA: 0,
    PROFILE_SKILLS: 30000,
    PROFILE_PORTFOLIO: 30001,
    PROFILE_AVAILABILITY: 30002,
    PROFILE_STANDARD_SERVICES: 30003,
    PROFILE_REVIEWS: 30004,
    PROFILE_LOCATION: 30005,
    
    FILE_METADATA: 1063,

    TASK_CREATION: 31000,
    SAVED_SEARCHES: 31001, // NIP-51 List for saved searches
    RECURRING_TASK: 31002,
    USER_PREFERENCES: 31003, // NIP-33 Parameterized replaceable event for user preferences
    RECOMMENDATIONS: 31004, // NIP-51 List for recommendations
    SAVED_SEARCH: 31005, // NIP-33 Parameterized replaceable event for saved searches

    // Contract Management System
    CONTRACT: 30006, // Parameterized replaceable - client creates/updates contract
    CONTRACT_STATUS: 31006, // Regular event - both parties can publish status updates
}

export default KINDS;