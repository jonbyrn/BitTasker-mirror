/**
 * Confirmation Poller Worker
 * Background job that polls pending transactions for confirmation
 * Can be run as a separate process or within the main service
 */

import * as submissionsRepo from '../db/submissions.repository.js';
import * as submitSendService from '../services/submit-send.service.js';
import { getNetworkConfig } from '../config/networks.js';

export interface PollerConfig {
  pollInterval: number; // milliseconds between polls
  batchSize: number; // number of submissions to poll per batch
  maxAge: number; // milliseconds - don't poll submissions older than this
}

const DEFAULT_CONFIG: PollerConfig = {
  pollInterval: 5000, // 5 seconds
  batchSize: 10,
  maxAge: 30 * 60 * 1000 // 30 minutes
};

/**
 * Start the confirmation poller worker
 */
export async function startConfirmationPoller(config: PollerConfig = DEFAULT_CONFIG): Promise<void> {
  console.log('Starting confirmation poller worker...');

  // Run polling loop
  while (true) {
    try {
      await pollPendingSubmissions(config);
    } catch (error) {
      console.error('Error in confirmation poller:', error);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, config.pollInterval));
  }
}

/**
 * Poll a single batch of pending submissions
 */
async function pollPendingSubmissions(config: PollerConfig): Promise<void> {
  try {
    // Get pending submissions
    const pendingSubmissions = await submissionsRepo.getPendingSubmissions();

    if (pendingSubmissions.length === 0) {
      return;
    }

    const now = Date.now();
    const batchToProcess = pendingSubmissions
      .filter(sub => now - sub.createdAt.getTime() < config.maxAge)
      .slice(0, config.batchSize);

    console.log(`Polling ${batchToProcess.length} pending submissions`);

    for (const submission of batchToProcess) {
      try {
        const result = await submitSendService.pollConfirmation(submission.id);

        if (result) {
          const stateChange = submission.lifecycleState !== result.lifecycleState;
          if (stateChange) {
            console.log(
              `Submission ${submission.correlationId}: ${submission.lifecycleState} -> ${result.lifecycleState}`
            );
          }
        }
      } catch (error) {
        console.error(`Error polling submission ${submission.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error fetching pending submissions:', error);
  }
}

/**
 * Clean up expired submissions
 */
export async function startExpiryCleanup(intervalMs: number = 60 * 1000): Promise<void> {
  console.log('Starting expiry cleanup worker...');

  while (true) {
    try {
      const cleaned = await submitSendService.cleanupExpiredSubmissions();
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} expired submissions`);
      }
    } catch (error) {
      console.error('Error in expiry cleanup:', error);
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

/**
 * Run both workers concurrently
 */
export async function startAllWorkers(
  pollerConfig: PollerConfig = DEFAULT_CONFIG,
  cleanupInterval: number = 60 * 1000
): Promise<void> {
  console.log('Starting all sponsor service workers...');

  // Start both workers concurrently
  Promise.all([
    startConfirmationPoller(pollerConfig),
    startExpiryCleanup(cleanupInterval)
  ]).catch(error => {
    console.error('Worker error:', error);
    process.exit(1);
  });
}

// Run workers if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startAllWorkers().catch(error => {
    console.error('Failed to start workers:', error);
    process.exit(1);
  });
}
