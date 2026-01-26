import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const { Pool } = pg;

// Configure SSL for production (Render PostgreSQL requires SSL)
// Setting rejectUnauthorized to false allows self-signed certificates
const isProduction = env.NODE_ENV === 'production';
const sslConfig = isProduction
  ? {
      rejectUnauthorized: false,  // Render uses self-signed certificates
    }
  : undefined;

// Log database configuration (without sensitive data)
const dbHost = env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'unknown';
console.log(`[DB] Connecting to: ${dbHost}`);
console.log(`[DB] NODE_ENV: ${env.NODE_ENV}`);
console.log(`[DB] SSL enabled: ${isProduction}`);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: sslConfig,
});

pool.on('error', (err) => {
  logger.error('Unexpected database error', { error: err.message, stack: err.stack });
});

pool.on('connect', () => {
  logger.debug('New database client connected');
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Query error', {
      text,
      params,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function getClient() {
  const client = await pool.connect();
  return client;
}

export async function disconnect() {
  await pool.end();
  logger.info('Database pool closed');
}
