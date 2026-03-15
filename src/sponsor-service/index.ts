/**
 * Sponsor Service Main Entry Point
 * Initializes Express server with database connection and starts listening
 */

import express from 'express';
import cors from 'cors';
import { initializePool, closePool } from './db/connection.js';
import routes from './api/routes.js';
import type { PoolConfig } from './db/connection.js';

export interface SponsorServiceConfig {
  port: number;
  host: string;
  database: PoolConfig;
  logRequests?: boolean;
}

export async function createApp(config: SponsorServiceConfig): Promise<express.Application> {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(cors());

  // Request logging
  if (config.logRequests) {
    app.use((req, express, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  // Initialize database pool
  try {
    initializePool(config.database);
    console.log('Database pool initialized');
  } catch (error) {
    console.error('Failed to initialize database pool:', error);
    throw error;
  }

  // Routes
  app.use(routes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export async function startServer(config: SponsorServiceConfig): Promise<void> {
  const app = await createApp(config);

  app.listen(config.port, config.host, () => {
    console.log(`Sponsor service listening on http://${config.host}:${config.port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await closePool();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await closePool();
    process.exit(0);
  });
}

// Configuration from environment
export function getConfigFromEnv(): SponsorServiceConfig {
  return {
    port: parseInt(process.env.SPONSOR_SERVICE_PORT || '3001', 10),
    host: process.env.SPONSOR_SERVICE_HOST || '0.0.0.0',
    database: {
      user: process.env.DB_USER || 'sponsor',
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'sponsor_service',
      max: parseInt(process.env.DB_POOL_SIZE || '20', 10),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT || '2000', 10)
    },
    logRequests: process.env.LOG_REQUESTS === 'true'
  };
}

// Start server if running as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = getConfigFromEnv();
  startServer(config).catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default createApp;
