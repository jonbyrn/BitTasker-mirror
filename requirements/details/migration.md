# Secure Task Management and Review System in Nostr

## Overview
This document outlines the secure implementation of tasks, bids, and reviews in the Nostr ecosystem, addressing potential security vulnerabilities and ensuring data integrity.

## Challenge
The main security challenge in implementing reviews on Nostr stems from its public nature:
- All events are publicly available on relays
- Anyone can post events claiming task completion or reviews
- No built-in verification of relationships between tasks and participants
- Risk of fake reviews using real NPUBs

## Solution Architecture

### 1. Task Contract Events
We will implement a chain of cryptographically linked events that establish verifiable relationships between tasks, bids, and reviews.

#### Event Types:
```
KIND 31000: Task Creation
KIND 31001: Task Bid
KIND 31002: Task Award
KIND 31003: Task Completion
KIND 31004: Task Review
```

### 2. Event Verification System

#### Task Creation (KIND 31000)
- Signed by task creator
- Contains:
  - Task details
  - Required proof of work hash
  - Unique task ID (hash of task details + timestamp + creator's pubkey)

#### Bid Submission (KIND 31001)
- Signed by bidder
- References task event ID
- Contains:
  - Bid amount
  - Proposed timeline
  - Bidder's proof of work
- Verified by checking:
  - Valid reference to existing task
  - Bidder's POW matches task requirements

#### Task Award (KIND 31002)
- Signed by task creator
- References:
  - Original task event
  - Winning bid event
- Creates a binding contract
- Contains escrow details and terms

#### Task Completion (KIND 31003)
- Requires dual signatures:
  - Task creator (confirmation)
  - Task performer (completion claim)
- References:
  - Original task
  - Award event
- Contains completion proof (deliverables hash)

#### Review Event (KIND 31004)
- Only valid if:
  - Signed by task creator or performer
  - References valid task completion event
  - One review per participant per task
  - Within review timeframe (e.g., 30 days)

### 3. Verification Chain

```
Task Creation → Bid → Award → Completion → Review
     ↓           ↓      ↓         ↓          ↓
   [POW]      [POW]   [Sig]    [Dual-Sig]  [Sig+Refs]
```

### 4. Proof of Work (POW) System

To prevent spam and ensure legitimate participation:

1. Task Creation POW:
   - Difficulty based on task value
   - Prevents mass fake task creation

2. Bid POW:
   - Lower difficulty than task creation
   - Prevents bid spam
   - Must reference task POW

### 4.1 Detailed POW Implementation

#### What is Proof of Work?
Proof of Work is like solving a puzzle that:
1. Is hard to solve (takes computational power)
2. Is easy to verify (anyone can quickly check if it's correct)
3. Can be made harder or easier by adjusting its difficulty

Think of it like finding a number (called a nonce) that, when combined with your task data and hashed, produces a result starting with a certain number of zeros. The more zeros required, the harder it is to find the right number.

#### How We're Using POW in Our Task System

1. Task Creation:
   - For a $10 task: Need to find a hash with 4 leading zeros (~seconds of computation)
   - For a $100 task: Need 6 leading zeros (~minutes)
   - For a $1000 task: Need 8 leading zeros (~hour)
   - For a $10000 task: Need 10 leading zeros (~day)

2. Bid Creation:
   - Always 2 levels easier than the task's difficulty
   - If a task needed 8 zeros, bids need 6 zeros

#### Why This Helps With Security

1. Prevents Spam:
   - Can't create many fake high-value tasks because each one needs significant computation time
   - Someone trying to create 100 fake $1000 tasks would need ~100 hours of computation

2. Makes Fake Reviews Expensive:
   - To create a fake review, you need:
     1. Create a task (expensive POW)
     2. Create a bid (medium POW)
     3. Create completion proof (needs both signatures)
     4. Then finally can create review

3. Scales With Risk:
   - Higher value tasks require more POW
   - Makes attacks more expensive for higher-value targets

#### User Experience
We've also added code to make this user-friendly:
1. Shows progress bar while calculating POW
2. Runs in background so it doesn't freeze the UI
3. Can be cancelled if user changes their mind

### 4.2 Technical POW Implementation

#### Dynamic Difficulty Scaling
The POW difficulty scales based on various factors:

1. Task Value Scaling:
```typescript
function calculateTaskDifficulty(taskValue: number): number {
  // Example scaling formula
  const baseDifficulty = 4;  // Minimum 4 leading zeros
  const valueFactor = Math.floor(Math.log2(taskValue / 10));
  return Math.min(baseDifficulty + valueFactor, 12);  // Max 12 leading zeros
}

// Example difficulties:
// $10 task    = 4 leading zeros  (~seconds to compute)
// $100 task   = 6 leading zeros  (~minutes to compute)
// $1000 task  = 8 leading zeros  (~hour to compute)
// $10000 task = 10 leading zeros (~day to compute)
```

2. Bid POW Scaling:
```typescript
function calculateBidDifficulty(taskDifficulty: number): number {
  // Bid POW is always 2 levels easier than task POW
  return Math.max(taskDifficulty - 2, 2);
}
```

#### Example POW Workflow

1. Creating a Task:
```typescript
interface TaskCreation {
  async createTask(taskDetails: TaskDetails): Promise<TaskEvent> {
    const difficulty = calculateTaskDifficulty(taskDetails.value);
    
    // Generate event without POW
    const baseEvent = {
      kind: 31000,
      pubkey: taskDetails.creatorPubkey,
      created_at: Date.now(),
      content: JSON.stringify(taskDetails),
      tags: []
    };

    // Calculate POW
    let nonce = 0;
    let hash: string;
    do {
      const challenge: POWChallenge = {
        eventId: calculateEventId(baseEvent),
        timestamp: baseEvent.created_at,
        difficulty,
        nonce: nonce++
      };
      hash = calculatePOW(challenge);
    } while (!isValidPOW(hash, difficulty));

    // Add POW to event
    baseEvent.tags.push(['pow', hash, nonce.toString()]);
    
    return baseEvent;
  }
}
```

2. Verifying POW:
```typescript
interface POWVerification {
  async verifyTaskPOW(event: TaskEvent): Promise<boolean> {
    // Extract POW details
    const [_, hash, nonce] = event.tags.find(tag => tag[0] === 'pow');
    
    // Recreate challenge
    const challenge: POWChallenge = {
      eventId: calculateEventId(event),
      timestamp: event.created_at,
      difficulty: calculateTaskDifficulty(getTaskValue(event)),
      nonce: parseInt(nonce)
    };

    // Verify hash
    const calculatedHash = calculatePOW(challenge);
    return (
      calculatedHash === hash &&
      isValidPOW(hash, challenge.difficulty)
    );
  }
}
```

#### Benefits of POW in Our System

1. **Spam Prevention:**
   - Creating fake tasks becomes computationally expensive
   - Cost of attack increases with task value
   - Bidding spam is controlled but still accessible

2. **Sybil Attack Resistance:**
   - Cannot mass-create high-value tasks
   - POW cost makes fake task chains expensive
   - Natural rate limiting through computation requirements

3. **Trust Building:**
   - Higher value tasks require more computational investment
   - Demonstrates commitment through resource expenditure
   - Creates natural hierarchy of task importance

4. **Verification:**
   - POW is easily verifiable by all participants
   - Provides permanent proof of resource commitment
   - Cannot be forged without significant computation

#### Client Implementation Considerations

1. **User Experience:**
```typescript
interface POWProgress {
  async calculatePOWWithProgress(
    challenge: POWChallenge,
    onProgress: (percent: number) => void
  ): Promise<string> {
    const startTime = Date.now();
    const estimatedHashes = Math.pow(2, challenge.difficulty);
    let currentHash = 0;

    while (true) {
      const hash = calculatePOW({ ...challenge, nonce: currentHash++ });
      
      if (currentHash % 1000 === 0) {
        const progress = (currentHash / estimatedHashes) * 100;
        onProgress(Math.min(progress, 99));
      }

      if (isValidPOW(hash, challenge.difficulty)) {
        onProgress(100);
        return hash;
      }
    }
  }
}
```

2. **Background Processing:**
```typescript
interface POWWorker {
  // Web Worker implementation for non-blocking POW calculation
  async calculatePOWInBackground(challenge: POWChallenge): Promise<string> {
    const worker = new Worker('pow-worker.js');
    
    return new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        if (e.data.type === 'complete') {
          resolve(e.data.hash);
          worker.terminate();
        } else if (e.data.type === 'progress') {
          updateUIProgress(e.data.percent);
        }
      };
      
      worker.postMessage({ challenge });
    });
  }
}
```

This POW system creates a balanced ecosystem where:
- High-value tasks require significant investment
- Bid spam is controlled but accessible
- All proofs are permanently verifiable
- The system remains decentralized and trustless
- Resource requirements scale with potential reward

### 5. Client-Side Verification

The client application must:

1. Verify the complete chain of events
2. Check all signatures and references
3. Validate POW for each relevant event
4. Only display reviews that:
   - Have valid completion events
   - Are properly signed
   - Reference existing tasks
   - Follow the correct event chain

### 6. Relay Strategy

To maintain data integrity:

1. Primary Relays:
   - Trusted relays that validate event chains
   - Run additional verification checks
   - Maintain complete task histories

2. Secondary Relays:
   - Standard Nostr relays
   - Used for redundancy
   - May contain unverified events

3. Client Requirements:
   - Must connect to at least one primary relay
   - Should verify events across multiple relays
   - Implement local caching of verified chains

### 7. Review Scoring System

To prevent review manipulation:

1. Weight factors:
   - Task value
   - Time since task completion
   - Reviewer's own reputation
   - POW difficulty achieved

2. Review limits:
   - One review per participant per task
   - Time-limited review window
   - Minimum task value for reviews

### 8. Implementation Guidelines

#### Client Application:

```typescript
interface TaskEvent {
  kind: number;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
  sig: string;
  pow: string;
}

class TaskVerifier {
  async verifyChain(reviewEvent: TaskEvent): Promise<boolean> {
    // Verify complete chain from review to original task
    const taskChain = await this.getTaskChain(reviewEvent);
    return this.validateChain(taskChain);
  }

  async validateChain(chain: TaskEvent[]): Promise<boolean> {
    // Check signatures, POW, and references
    // Ensure all required events exist
    // Verify dual signatures where required
    // Check review eligibility
  }
}
```

#### Review Display:

```typescript
interface ReviewDisplay {
  async getVerifiedReviews(npub: string): Promise<Review[]> {
    const reviews = await this.fetchReviews(npub);
    return reviews.filter(async (review) => {
      const isValid = await this.verifier.verifyChain(review);
      const isInTime = this.checkTimeWindow(review);
      return isValid && isInTime;
    });
  }
}
```

### 9. Security Considerations

1. Replay Protection:
   - Include timestamps in all events
   - Implement nonce in POW calculation
   - Check for duplicate event IDs

2. Sybil Attack Prevention:
   - Progressive POW difficulty
   - Reputation-based privileges
   - Time delays between actions

3. Data Integrity:
   - Cross-relay verification
   - Complete chain validation
   - Signature verification

### 10. Future Improvements

1. Zero-Knowledge Proofs:
   - Implement for private task details
   - Verify completion without revealing specifics

2. Reputation Staking:
   - Allow staking reputation on reviews
   - Increase review weight with stake

3. Smart Contract Integration:
   - Automated escrow release
   - Programmable review conditions

## Conclusion

This system ensures that reviews can only be posted by legitimate participants of completed tasks while maintaining the decentralized nature of Nostr. The combination of POW, cryptographic linking, and dual signatures creates a robust verification chain that prevents fake reviews while allowing for trustless verification of task completion and participant relationships.
