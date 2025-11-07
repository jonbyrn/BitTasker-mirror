const KINDS = {
    PROFILE_METADATA: 0,
    PROFILE_SKILLS: 30000,
    PROFILE_PORTFOLIO: 30001,
    PROFILE_AVAILABILITY: 30002,
    PROFILE_STANDARD_SERVICES: 30003,
    PROFILE_REVIEWS: 30004,
    PROFILE_LOCATION: 30005,
    
    FILE_METADATA: 1063,
    PROFILE_IMAGES: 30063,

    TASK_CREATION: 31000,
    SAVED_SEARCHES: 31001, // NIP-51 List for saved searches
    RECURRING_TASK: 31002,
    USER_PREFERENCES: 31003, // NIP-33 Parameterized replaceable event for user preferences
    RECOMMENDATIONS: 31004, // NIP-51 List for recommendations
    SAVED_SEARCH: 31005, // NIP-33 Parameterized replaceable event for saved searches

    // Contract Management System
    CONTRACT: 30006, // Parameterized replaceable - client creates/updates contract
    CONTRACT_STATUS: 31006, // Regular event - both parties can publish status updates

    // Scheduling System (encrypted DMs, kind 4)
    SCHEDULING_TIME_SLOT_REQUEST: 4, // Encrypted DM - tasker requests specific time
    SCHEDULING_SOONEST_AVAILABLE_REQUEST: 4, // Encrypted DM - tasker requests ASAP
    SCHEDULING_REQUEST_ACCEPTANCE: 4, // Encrypted DM - taskee accepts request
    SCHEDULING_ESCROW_FUNDED_NOTIFICATION: 4, // Encrypted DM - tasker notifies escrow funded
    SCHEDULING_SLOT_CONFIRMATION: 4, // Encrypted DM - taskee confirms slot
    SCHEDULING_AVAILABILITY_RESPONSE: 4, // Encrypted DM - taskee sends availability
    SCHEDULING_REQUEST_CANCELLATION: 4, // Encrypted DM - tasker cancels request
    SCHEDULING_AVAILABILITY_UPDATE: 4, // Encrypted DM - taskee updates availability

    NIP_65_RELAY_LIST: 10002,

    PENDING_SWAPS: 30078
}

export default KINDS;