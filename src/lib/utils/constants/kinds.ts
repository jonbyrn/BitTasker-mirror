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

    // Review System (Secure Merkle Tree Verified Reviews)
    REVIEW_VERIFIED: 31007, // Verified review with Merkle proof
    MERKLE_TREE_METADATA: 31008, // Merkle tree metadata (root, version, etc.)
    MERKLE_TREE_CHUNK: 31009, // Chunked Merkle tree data
    MERKLE_TREE_UPDATE: 31010, // Merkle tree update notification
    REVIEW_REPORTED: 31011, // Reported review for moderation
    REVIEW_REPLY: 31012, // Reply to a review

    NIP_65_RELAY_LIST: 10002,

    PENDING_SWAPS: 30078
}

export default KINDS;