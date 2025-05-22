# Nostr Direct Messaging Feature Implementation Plan

## 1. Overview

This document outlines the plan for implementing a secure, end-to-end encrypted Direct Messaging (DM) feature within Bittasker using the Nostr protocol. The feature will allow users to:

- View a list of their existing conversations.
- Open and view the full chat history with a selected contact.
- Send and receive encrypted messages in real-time.
- Initiate new conversations with any Nostr user via their public key.
- Start a chat with a bid poster directly from a bid, using URL parameters to carry the recipient's public key.

## 2. Current Status (What's Done)

### 2.1. Core Nostr Messaging Logic (`src/lib/utils/nostr-message.ts`)

A robust set of utility functions for Nostr DMs is already in place:

- **Encryption/Decryption:** `encryptDM` and `decryptDM` using NIP-04 for end-to-end encryption.
- **Event Handling:** `createDMEvent` for creating NIP-04 DM events and `parseDMEvent` for decrypting and processing incoming DM events.
- **Profile Fetching:** `fetchProfileMetadata` to get user names and profile pictures (from kind 0 and kind 1063 events).
- **Core Actions:**
  - `sendDirectMessage(message, recipientPubkey, threadRootId?)`: Sends an encrypted DM.
  - `listenForIncomingMessages(callback)`: Subscribes to new DMs for the current user.
  - `getMessageHistory(withPubkey, options?)`: Fetches paginated DM history with a specific user.
  - `getThreadMessages(threadRootEventId, options?)`: Fetches all messages in a specific thread.
  - `getMessagedPeople()`: Retrieves a list of unique users the current user has exchanged messages with, including their last message and profile.
- **Key Management:** Utilizes `getNostrKeyPair()` from `src/lib/utils/nostrKeys.ts` for user's private/public keys.
- **Relay Interaction:** Uses `nostr-tools/pool` (`SimplePool`) for communication with relays (configured via `PUBLIC_NOSTR_RELAY_URL`).

### 2.2. Main Messages Page UI (`src/routes/(protected)/dashboard/messages/+page.svelte`)

The foundational UI for the messages page exists:

- **State Management:** Uses Svelte 5 runes (`$state`) for reactive variables.
- **Conversation List Display:**
  - `conversations`: An array to hold conversation data.
  - `isLoading`, `error`: States for loading and error handling while fetching conversations.
  - `onMount` fetches initial conversations using `getMessagedPeople()`.
  - Displays a list of conversations with avatars, names (or truncated pubkeys), last message snippet, and timestamp.
  - Provides loading skeletons, error messages, and an empty state.
- **Conversation Selection:**
  - `selectedPubkey`: Stores the pubkey of the currently selected conversation.
  - `selectConversation(pubkey)` function updates `selectedPubkey`.
- **New Message Modal:**
  - `showModal`, `newMessagePubkey`, `newMessageError`, `newMessageProfile`, `isProfileLoading`: State variables for the "New Message" modal.
  - Allows users to input an `npub` or hex public key to start a new chat.
  - `handlePubkeyInput`: Fetches and displays profile information (name/picture) for the entered pubkey in real-time.
  - `submitNewMessage`: Validates the pubkey, sets `selectedPubkey`, closes the modal, and optimistically adds the new contact to the `conversations` list. This is the entry point for showing the chat interface for a new contact.
- **Styling:** Uses DaisyUI components for styling.

### 2.3. Nostr Tools Documentation (`requirements/details/nostr-tools.md`)

Comprehensive documentation on the `nostr-tools` library, Nostr event kinds, tags, NIPs (including NIP-04 for DMs), and best practices is available for reference.

## 3. Key Requirements (To Be Implemented or Enhanced)

- **Full Chat View:** Display the complete message history with a selected user.
- **Message Sending:** Allow users to type and send messages from the chat view.
- **Real-time Updates:**
  - New messages should appear in the active chat view instantly.
  - The conversation list (last message, timestamp) should update in real-time.
- **URL Parameter Integration:** The messages page must handle an optional `chatWith` URL parameter (e.g., `/dashboard/messages?chatWith=<npub>`) to directly open a chat with the specified user. This will be used for "message user" buttons on bids.
- **UI/UX Polish:** Ensure a smooth and intuitive user experience, including clear loading states, error handling for message sending/loading, and appropriate visual distinction for sent/received messages.
- **Scalability & Maintainability:** Code should be organized into reusable components.
- **3.1 Cross-cutting Concerns**
  - **Subscription Lifecycle:** Ensure all Nostr event subscriptions (via `listenForIncomingMessages`) are properly cleaned up on component destroy to avoid memory leaks.
  - **Error Logging & Analytics:** Integrate with centralized logging or analytics (e.g., via `appStore` or an external service) to capture errors, message send/receive metrics, and relay connectivity issues.
  - **Accessibility (A11y):**
    - Keyboard navigation for chat list and message input (e.g., tab order, focus outlines).
    - ARIA roles/labels for conversational components (e.g., `role="log"` for message list, `aria-live` for new messages).
  - **Input Focus & Auto-scroll:**
    - Automatically focus the message input when opening a chat.
    - Scroll to the latest message on chat open and when new messages arrive.
  - **Draft Persistence:** Temporarily persist unsent drafts (e.g., in component state or `localStorage`) so that users don't lose typed messages if they navigate away.
  - **Relay Resilience:**
    - Support multiple relay URLs and fallback logic in case the primary relay is unavailable.
    - Implement automatic reconnection and re-subscription strategies on network failures.
  - **URL Parameter Validation:** Validate the `chatWith` query parameter for correct `npub` or hex format and display a user-friendly error message if invalid.
  - **Performance & Virtualization:** For very large chat histories, consider list virtualization to maintain smooth scrolling and low memory usage.
  - **Testing Strategy:**
    - Unit tests for utility functions in `nostr-message.ts`.
    - Component tests (using `@testing-library/svelte`) for `ChatView` and `ChatMessage`.
    - Integration/E2E tests (e.g., with Playwright or Cypress) to validate full DM flows.
  - **Storybook Stories:** Add Storybook entries for `ChatView` and `ChatMessage` to document and visually test UI states (loading, empty, with messages, error states).
  - **Private Key Handling:**
    - Create a dedicated Svelte store (`src/lib/stores/nostrSessionStore.ts`) using Svelte's `writable` (or a Svelte 5 rune-based state) to hold the decrypted `nsec` in memory.
    - On biometric authentication, decrypt the user's private key once and set it in this store instead of decrypting on each action.
    - Update all Nostr utility functions (`getNostrKeyPair`, `sendDirectMessage`, `getMessageHistory`, etc.) to read the private key from this in-memory store.
    - Ensure the store is strictly in RAM only—do not persist to `localStorage`, cookies, or any unsecure storage.
    - Clear the store (set `nsec` to `null`) on logout or session end to remove the key from memory.
  - **Session Storage for BiometricData:**
    - On `appStore` initialization (in `createAppStore`), attempt to read a serialized `biometricData` object from `sessionStorage` (e.g., `sessionStorage.getItem('biometricData')`) and use it to populate the initial `biometricData` state.
    - Subscribe to `appStore` updates for `biometricData` and, whenever it changes, serialize and write it to `sessionStorage` (or clear it when set to `null`).
    - Ensure only the minimal required fields (`username`, `password`) are stored and always encrypted/inaccessible to other origins.
    - On logout or session expiration, clear the `biometricData` entry from `sessionStorage` to force re-authentication on next load.

## 4. Proposed Architecture & Components

### 4.1. New Svelte Components (in `src/lib/components/messages/`)

- **`ChatView.svelte`:**
  - **Purpose:** Displays the full conversation with a selected user and allows sending new messages.
  - **Props:**
    - `recipientPubkey: string` (the pubkey of the other user in the chat)
    - `currentUserPubkey: string` (the pubkey of the logged-in user)
    - `initialProfile: { name?: string; picture?: string } | null` (optional, passed from new message modal)
  - **Functionality:**
    - Fetch and display message history using `getMessageHistory()`.
    - Implement an input field and send button to send new messages using `sendDirectMessage()`.
    - Listen for new incoming/outgoing messages related to this chat using `listenForIncomingMessages()` (potentially with filtering or a dedicated listener for efficiency) and update the view.
    - Handle message loading states, errors, and pagination (infinite scroll for older messages).
    - Display user avatars and names/pubkeys.
- **`ChatMessage.svelte`:**
  - **Purpose:** Renders a single message within the `ChatView`.
  - **Props:**
    - `message: { plaintext: string; senderPubkey: string; event: NostrEvent }`
    - `isSender: boolean` (true if the current user sent this message)
    - `profile: { name?: string; picture?: string }` (profile of the sender)
  - **Functionality:**
    - Displays message content, timestamp.
    - Styles messages differently based on whether they are sent or received.
    - Displays sender's avatar (optional).

### 4.2. Enhancements to Existing Files

- **`src/routes/(protected)/dashboard/messages/+page.svelte`:**
  - Integrate the `ChatView.svelte` component, displaying it when `selectedPubkey` is set.
  - Implement logic to read the `chatWith` URL parameter on page load. If present, set `selectedPubkey` and potentially pre-fill/open the new message flow if it's a new contact or directly open the chat.
  - Manage the current user's pubkey (needs to be fetched/available to pass to `ChatView`).
  - Refine real-time updates for the main conversation list (`conversations`) based on new messages from `listenForIncomingMessages()`.
- **`src/lib/utils/nostr-message.ts`:**
  - Review and potentially add more specific filtering options or dedicated listeners for active chats if `listenForIncomingMessages` proves too broad for focused real-time updates in `ChatView`.
  - Ensure robust error handling and logging.

## 5. Detailed Implementation Steps

### Phase 1: Core Chat Interface

1.  **Setup Current User Pubkey:**
    - Ensure `npub` of the logged-in user is accessible within `+page.svelte`. This might involve fetching it via `getNostrKeyPair()` or from a global store if already available.
2.  **Create `ChatMessage.svelte` Component:**
    - Develop the component to display a single message, differentiating sender/receiver, showing content and timestamp.
3.  **Create `ChatView.svelte` Component (Initial Version):**
    - **Props:** `recipientPubkey`, `currentUserPubkey`, `initialProfile`.
    - **State:** `messages = $state([])`, `newMessageText = $state('')`, `isLoadingMessages = $state(true)`.
    - **Functionality:**
      - On init (e.g., `$effect` reacting to `recipientPubkey`), call `getMessageHistory(recipientPubkey)` to fetch past messages and populate `messages`. Handle loading and error states.
      - Render messages using an `{#each}` loop and the `ChatMessage.svelte` component.
      - Add a text input and a "Send" button.
      - Implement `sendMessage()` function:
        - Calls `sendDirectMessage(newMessageText, recipientPubkey)`.
        - Optimistically add the sent message to `messages` (or wait for real-time echo).
        - Clear `newMessageText`. Handle sending errors.
4.  **Integrate `ChatView.svelte` into `+page.svelte`:**
    - When `selectedPubkey` is not null, hide/replace the conversation list with `<ChatView recipientPubkey={selectedPubkey} currentUserPubkey={currentUserNpub} initialProfile={newMessageProfile} />`.
    - Ensure `newMessageProfile` (from new message modal) is correctly passed if it's a new chat.

### Phase 2: Real-time Functionality & URL Handling

5.  **Real-time Updates in `ChatView.svelte`:**
    - Use `listenForIncomingMessages()` within `ChatView.svelte`.
    - Filter messages to only include those relevant to the current `recipientPubkey` and `currentUserPubkey`.
    - When a new relevant message arrives (either sent by current user or received from `recipientPubkey`), add it to the `messages` array.
    - Implement auto-scrolling to the latest message.
6.  **Real-time Updates for Conversation List (`+page.svelte`):**
    - Modify the existing `onMount` listener (or create a new general one) using `listenForIncomingMessages()`.
    - When a new message arrives, find the corresponding conversation in the `conversations` array. Update its `lastEvent` (content and `created_at`) and re-sort the list or bring the updated conversation to the top.
    - If a message is for a new contact not in `conversations`, fetch their profile and add them.
7.  **URL Parameter Handling (`+page.svelte`):**
    - In `onMount` (or using SvelteKit's page load function):
      - Access `page.url.searchParams` to get the value of `chatWith`.
      - If `chatWith` (an `npub`) is present:
        - Decode it to a hex pubkey if necessary.
        - Set `selectedPubkey` to this pubkey.
        - If the pubkey is not in the existing `conversations`, fetch its profile using `fetchProfileMetadata` and set `newMessageProfile`. This will ensure `ChatView` gets the profile.
        - The page should then display `ChatView` for this user.

### Phase 3: Polish and Refinements

8.  **"New Message" Flow Refinement:**
    - Ensure that after `submitNewMessage` in `+page.svelte` sets `selectedPubkey` and `newMessageProfile`, the UI correctly transitions to show `ChatView` for this new, empty conversation.
9.  **Loading & Error States:**
    - Add visual feedback in `ChatView` for when messages are loading or when sending a message fails.
    - Display errors from `sendDirectMessage` or `getMessageHistory` appropriately.
10. **Message History Pagination/Infinite Scroll in `ChatView.svelte`:**
    - Implement a mechanism (e.g., "Load Older Messages" button or scroll detection) to fetch older messages using the `until` parameter of `getMessageHistory()`.
11. **Styling and UX:**
    - Refine the visual appearance of `ChatView` and `ChatMessage`.
    - Ensure responsive design.
    - Consider adding message delivery/read status (Future Enhancement, NIP-18).
12. **Testing:**
    - Test DM encryption/decryption.
    - Test sending/receiving messages with multiple accounts.
    - Test real-time updates.
    - Test URL parameter functionality.
    - Test edge cases (invalid pubkeys, network errors).

## 6. Nostr Specific Considerations

- **Encryption:** Continue using NIP-04 as implemented in `nostr-message.ts`.
- **Event Kinds:** DMs use `kind: 4`. Profile metadata uses `kind: 0`, and image metadata (like profile pictures) can use `kind: 1063`.
- **Tags:**
  - Outgoing DMs must include `['p', recipientPubkey]`.
  - Threaded replies (if implemented beyond basic DMs) can use `['e', rootEventId, '', 'root']` or `['e', repliedToEventId, '', 'reply']`. The current `sendDirectMessage` supports `threadRootId`.
- **Relay Reliability:** Communications depend on the configured `PUBLIC_NOSTR_RELAY_URL`. Consider strategies for handling relay downtime or allowing users to configure relays in the future.

## 7. Future Considerations (Out of Scope for Initial Implementation)

- Read Receipts (NIP-18)
- Typing Indicators
- Group DMs (more complex, requires different NIPs or custom logic)
- Message Search within chats
- Sharing images/media within DMs (would require file upload and `kind: 1063` events for media metadata).
- Deleting messages (NIP-09).

This plan provides a roadmap for developing the Nostr DM feature. Each phase and step should be iteratively developed and tested.
