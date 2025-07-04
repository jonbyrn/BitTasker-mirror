# BitTasker Gamification System

## 1. Overview

The gamification system is designed to enhance user engagement and reward activity on the BitTasker platform. It utilizes a tier-based system that dynamically adjusts platform fees based on a user's task completion history over a rolling 30-day period. This system incentivizes both task hirers and doers to be more active, while recognizing long-term achievements with permanent badges.

## 2. Tier System

A user's tier is determined by the number of tasks they have either hired for or completed as a doer within the last 30 days. Tiers are dynamic and are recalculated continuously.

### Tier Levels & Names

-   **Nakamoto Newbie (Lowest Tier)**: 0 - 3 tasks completed in the last 30 days.
-   **Satoshi Stacker (Middle Tier)**: 4 - 10 tasks completed in the last 30 days.
-   **Hash Master (Highest Tier)**: 11+ tasks completed in the last 30 days.

## 3. Fee Structure

Fees are applied based on the tier of the user at the time of the transaction.

### Standard Fiat Fees

This fee structure applies to new connections (not rebookings).

-   **Example**: A task is bid at $100.
    -   A **Nakamoto Newbie** hirer pays `$100 + 12.5% = $112.50`.
    -   A **Hash Master** doer receives `$100 - 7.5% = $92.50`.

| Tier Level         | Hirer Fee | Doer Fee |
| ------------------ | :-------: | :------: |
| **Nakamoto Newbie**  |  12.5%    |  12.5%   |
| **Satoshi Stacker**  |   10%     |   10%    |
| **Hash Master**      |   7.5%    |   7.5%   |

### Bitcoin Transaction Fees

For payments made in Bitcoin (BTC), a different, lower fee structure applies to both the hirer and the doer.

| Tier Level         | Fee (per party) | Total Platform Fee |
| ------------------ | :-------------: | :----------------: |
| **Nakamoto Newbie**  |      2.5%       |         5%         |
| **Satoshi Stacker**  |       2%        |         4%         |
| **Hash Master**      |      1.5%       |         3%         |

### Rebooking Fees

To encourage long-term relationships, a significantly reduced fee is applied when a hirer re-engages a doer they have worked with before.

-   **Fiat Rebooking Fee**: **3%** applied to both the hirer and the doer.
-   **Bitcoin Rebooking Fee**: **1%** applied to both the hirer and the doer (2% total).

## 4. Badges and Achievements

-   **Tiers vs. Badges**: Tiers are dynamic and can change based on recent activity. Badges are permanent achievements.
-   **Earning Badges**: When a user reaches a new tier for the first time (e.g., `Hash Master`), they are awarded a permanent badge for that tier.
-   **Display**:
    -   A user's **current tier** is displayed prominently on their profile and determines their active fees.
    -   Earned **badges** are displayed in a permanent "Achievements" or "Trophy" section of their profile, showcasing their history of accomplishments.

## 5. Task Bidding and Sorting

Gamification directly impacts task discovery. When a hirer views bids on their task, the bids will be sorted based on a weighted algorithm:

1.  **Tier Level (Highest Priority)**: `Hash Master` doers appear first.
2.  **User Reviews (Secondary Priority)**: Higher-rated users are prioritized within each tier.
3.  **Bid Price (Tertiary Priority)**: The lowest-priced bid within the same tier and review score appears first.

## 6. Nostr Implementation

The gamification system will be built on the Nostr protocol to ensure transparency, decentralization, and data portability.

### Nostr Event Kinds

| Kind ID | Name                      | Type                        | Description                                            |
| ------- | ------------------------- | --------------------------- | ------------------------------------------------------ |
| `30006` | `USER_GAMIFICATION`       | Parameterized Replaceable   | Stores a user's current tier, stats, and achievements. |
| `31007` | `TASK_COMPLETION_LOG`     | Regular                     | A new event is created for every undisputed completed task. |
| `31008` | `TIER_BADGE_ACHIEVEMENT`  | Regular                     | Created when a user is awarded a new permanent badge. |

### Event Structures

#### `USER_GAMIFICATION` (Kind 30006)
A cached, summary event for efficient loading of a user's gamification status.

```json
{
  "kind": 30006,
  "content": {
    "currentTier": "Hash Master",
    "tierLevel": 3,
    "rollingTaskCount": 15,
    "badges": ["satoshi-stacker", "hash-master"]
  },
  "tags": [
    ["d", "gamification"],
    ["tier", "3"]
  ]
}
```

#### `TASK_COMPLETION_LOG` (Kind 31007)
The source of truth for all tier calculations.

```json
{
  "kind": 31007,
  "content": {
    "taskId": "nostr-event-id-of-task",
    "role": "doer",
    "completedAt": 1672531200,
    "isRebooking": false
  },
  "tags": [
    ["e", "task-event-id"],
    ["p", "hirer-pubkey"],
    ["p", "doer-pubkey"]
  ]
}
```

## 7. Edge Cases and Considerations

-   **Defining "Completion"**: A task only counts towards tier calculation after it is marked `COMPLETED` and the payment/escrow is successfully released without a dispute.
-   **Defining "Rebooking"**: A rebooking is any new task between a hirer and a doer who share at least one previous `TASK_COMPLETION_LOG` event.
-   **System Gaming**: To prevent users from creating many low-value tasks to quickly gain tiers, a minimum task value (e.g., $5) is required for a task to count towards gamification.
-   **Performance**: All tier calculations are performed by a background service that updates the `USER_GAMIFICATION` event. The UI will only query this lightweight summary event, ensuring fast load times and minimal relay stress.
-   **Time Zones**: All 30-day rolling calculations are based on the UTC timestamps in Nostr events to ensure global consistency.
-   **New User Experience**: To mitigate the "cold start" problem, new users may be granted a promotional period (e.g., their first 3 tasks are treated at the `Satoshi Stacker` fee rate).
