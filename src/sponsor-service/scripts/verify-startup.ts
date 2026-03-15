#!/usr/bin/env node

/**
 * Service Startup Verification Script
 * Checks that all service dependencies are ready
 */

import http from 'http';
import { execSync } from 'child_process';

interface HealthCheckResult {
  name: string;
  healthy: boolean;
  message: string;
  error?: string;
}

async function checkHttpEndpoint(
  url: string,
  name: string,
  expectedStatus: number = 200
): Promise<HealthCheckResult> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      resolve({
        name,
        healthy: false,
        message: `Timeout (${url})`,
        error: 'Connection timeout'
      });
    }, 5000);

    http
      .get(url, response => {
        clearTimeout(timeout);
        const healthy = response.statusCode === expectedStatus;
        resolve({
          name,
          healthy,
          message: healthy ? `OK (${response.statusCode})` : `Failed (${response.statusCode})`,
          error: healthy ? undefined : `Expected ${expectedStatus}, got ${response.statusCode}`
        });
      })
      .on('error', error => {
        clearTimeout(timeout);
        resolve({
          name,
          healthy: false,
          message: 'Connection failed',
          error: String(error)
        });
      });
  });
}

async function checkDatabase(): Promise<HealthCheckResult> {
  try {
    const result = execSync('psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1"', {
      timeout: 5000,
      env: process.env
    });
    return {
      name: 'PostgreSQL',
      healthy: true,
      message: 'Connected'
    };
  } catch (error) {
    return {
      name: 'PostgreSQL',
      healthy: false,
      message: 'Connection failed',
      error: String(error)
    };
  }
}

async function verifyStartup(): Promise<void> {
  console.log('Sponsor Service Startup Verification\n');

  const checks: HealthCheckResult[] = [];

  // Check service health endpoint
  const healthCheck = await checkHttpEndpoint(
    'http://localhost:3001/health',
    'Sponsor Service Health'
  );
  checks.push(healthCheck);

  // Check readiness endpoint
  const readyCheck = await checkHttpEndpoint(
    'http://localhost:3001/ready',
    'Sponsor Service Readiness'
  );
  checks.push(readyCheck);

  // Check database
  const dbCheck = await checkDatabase();
  checks.push(dbCheck);

  // Print results
  console.log('Results:');
  console.log('--------');

  let allHealthy = true;
  for (const check of checks) {
    const status = check.healthy ? '✓' : '✗';
    console.log(`${status} ${check.name.padEnd(25)} ${check.message}`);
    if (check.error) {
      console.log(`  Error: ${check.error}`);
    }
    if (!check.healthy) {
      allHealthy = false;
    }
  }

  console.log();
  if (allHealthy) {
    console.log('✓ All checks passed - service is ready!');
    process.exit(0);
  } else {
    console.log('✗ Some checks failed - service is not ready');
    process.exit(1);
  }
}

verifyStartup().catch(error => {
  console.error('Verification error:', error);
  process.exit(1);
});
