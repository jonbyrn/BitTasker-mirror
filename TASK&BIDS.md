# BitTasker Task & Bidding System Implementation Plan

## Overview
This document outlines the plan to enhance the BitTasker task management and bidding system according to the requirements from the `.windsurfrules` file. The implementation will focus on improving user experience for both task creators and bidders by implementing drawer components, animated tabs, and a robust bidding system with counter-offer capabilities.

## Required Components and Features

### 1. Task Drawer Component
- Create `TaskDrawer.svelte` to replace `src/routes/(protected)/dashboard/task/[id]`
- Component will open when user clicks "View Details" button on task card
- Will include two main tabs: "Task Details" and "Bids"
- Will show different content based on whether the user is the task owner or not

### 2. Tabs Component
- Create reusable `Tabs.svelte` for the drawer navigation
- Implement smooth animation of background sliding to selected tab
- Allow for custom tab labels and content
- Handle tab state management

### 3. Task Ownership Flag
- Add `isOwner` flag to tasks in the dashboard view
- Backend will return this flag indicating if current user owns the task
- Used to conditionally show edit button and different CTA buttons

### 4. Task Details Tab
- If user is owner:
  - Show edit button for task
  - Display full task details with formatting
  - Show task status, budget, deadline info
  - Display attachments/images if any
- If user is not owner:
  - Show task details without edit functionality
  - Display "Submit Bid" button if task is open

### 5. Bids Tab
- If user is owner (received bids):
  - Show list of bids from others
  - Provide CTA buttons: Accept, Decline, Counter
  - Allow sorting/filtering of bids
  - Expandable bid cards to show full details
- If user is not owner (submitted bids):
  - Show user's own bids for this task
  - Provide CTA button: Withdraw
  - Show counter offers if any
  - Track bid status

### 6. Bidding Features
- Bid withdrawal implementation
- Counter-offer system:
  - From task owner to bidder
  - From bidder to task owner
  - Negotiation history tracking
- Bid status tracking (pending, accepted, declined, countered, withdrawn)

### 7. Image Upload Integration
- Update task creation to use API endpoint for image uploads
- Implement multiple image upload capability
- Handle image preview and removal
- Connect uploaded images to task creation

### 8. Milestone Format Changes
- Update bid component to handle milestones in format: `[{description: ''}]`
- Maintain existing UI while adapting data structure

## Counter-Offer Workflow

### Basic Flow
1. Freelancer sends proposal (creates a bid)
2. Client reviews proposal and has three options:
   - Accept: Hire the freelancer immediately
   - Interview: Open chat and discuss details (enables counter offer)
   - Decline: Reject the proposal

### Counter Offer System
Counter offers will be implemented through a simplified system that lays the groundwork for future chat integration:

1. **Creation**: Counter offers can be created from the bid details view
2. **Components**:
   - Modified price/budget
   - Adjusted timeline
   - Custom message explaining changes
   - (Future: attachments/files)

3. **Negotiation History**:
   - All counter offers are tracked in chronological order
   - Each counter offer shows who initiated it (client or freelancer)
   - Status tracking for each offer (pending, accepted, declined)

### Future Chat Integration
While not implemented in the current phase, the counter offer system is designed to be integrated with a full chat feature:

1. Chat will become accessible after client chooses to "Interview"
2. Counter offers will be available as special message types within the chat
3. Counter offer history will be viewable within the chat timeline
4. Status updates will be displayed in the chat

### User Roles
BitTasker supports three roles:
- **CLIENT**: Can post tasks, receive bids, accept/decline/counter bids
- **FREELANCER**: Can search for tasks, submit bids, accept/decline/counter client offers
- **BOTH**: User can act as both CLIENT and FREELANCER depending on the context

## Current System vs Requirements Analysis

### Currently Implemented:
- Basic task creation interface
- Initial task listing UI
- Task view/update functionality
- Basic bidding system structure

### Missing Features:
1. **Rich Media Support**: Need to integrate the API for image uploads
2. **Negotiation Capabilities**: Counter-offer system needs implementation
3. **Bid Comparison Tools**: Advanced UI for comparing multiple bids
4. **Bid Withdrawal Mechanism**: Endpoint integration needed
5. **Task Details Drawer**: Need to replace current task detail page with drawer
6. **Animated Tab Navigation**: For improving UX in task details
7. **Conditional UI Based on Ownership**: Different views for task owners vs bidders
8. **Provider Credentials Highlight**: Better showcase of bidder expertise and history
9. **Recurring Task Templates**: Not yet implemented

## Implementation Priorities

1. TaskDrawer.svelte component
2. Tabs.svelte component
3. TaskDrawer.stories.svelte and Tabs.stories.svelte test components
3. isOwner flag integration in dashboard
4. Milestone format update
5. Image upload integration
6. Counter-offer workflow implementation
7. Bid withdrawal integration
