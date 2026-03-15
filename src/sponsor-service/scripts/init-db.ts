#!/usr/bin/env node

/**
 * Database Initialization Script
 * Creates schema and initial data for the sponsor service
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface InitConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
}

async function initializeDatabase(config: InitConfig): Promise<void> {
  const pool = new pg.Pool({
    user: config.user,
    password: config.password,
    host: config.host,
    port: config.port,
    database: config.database
  });

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();

    try {
      // Read schema file
      const schemaPath = path.join(__dirname, '../db/schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');

      console.log('Executing schema...');
      // Split by semicolon and execute statements
      const statements = schema
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const statement of statements) {
        try {
          await client.query(statement);
        } catch (error: any) {
          // Ignore "already exists" errors
          if (!error.message.includes('already exists')) {
            throw error;
          }
        }
      }

      console.log('Database schema initialized successfully');

      // Test query
      const result = await client.query('SELECT * FROM submissions LIMIT 1');
      console.log('Schema validation passed - submissions table is accessible');
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Main execution
async function main(): Promise<void> {
  const config: InitConfig = {
    user: process.env.DB_USER || 'sponsor',
    password: process.env.DB_PASSWORD || 'sponsor_password_dev',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'sponsor_service'
  };

  console.log('Initializing sponsor service database...');
  console.log(`  Host: ${config.host}:${config.port}`);
  console.log(`  Database: ${config.database}`);
  console.log(`  User: ${config.user}`);

  try {
    await initializeDatabase(config);
    console.log('\n✓ Database initialization complete');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Database initialization failed');
    process.exit(1);
  }
}

main();
